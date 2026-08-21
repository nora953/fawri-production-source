import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminSession,
  sendAuthError,
} from "../middleware/authSession";
import { getAiUsageTelemetrySnapshot } from "../observability/aiUsageTelemetry";
import {
  evaluateRuntimeEarlyWarnings,
  mergeEarlyWarningHealth,
} from "../observability/earlyWarningEvaluation";
import {
  evaluateMerchantEarlyWarnings,
  operationalMerchantHealthRows,
} from "../observability/earlyWarningMerchantEvaluation";
import { getHttpTelemetrySnapshot } from "../observability/requestTelemetry";
import { hasAdminPermission } from "../services/authPolicy";
import {
  loadEarlyWarningCostReport,
  type EarlyWarningCostReport,
} from "../services/earlyWarningCostAuthority";
import {
  syncEarlyWarningIncidentHistory,
  type EarlyWarningIncidentWithScope,
} from "../services/earlyWarningIncidentHistory";
import {
  loadEarlyWarningPostgresSnapshot,
  normalizeEarlyWarningWindow,
  type EarlyWarningSnapshot,
  type EarlyWarningWindow,
} from "../services/earlyWarningPostgresAuthority";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";

const router = Router();
const CACHE_TTL_MS = 10_000;
const COST_CACHE_TTL_MS = 30_000;
const cache = new Map<EarlyWarningWindow, { loadedAt: number; snapshot: EarlyWarningSnapshot }>();
let costCache: { loadedAt: number; report: EarlyWarningCostReport } | null = null;

router.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!operationalPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
});

function canViewEarlyWarning(res: Response): boolean {
  const profile = getAuthContext(res)?.adminProfile;
  if (!profile) return false;
  return hasAdminPermission(profile.role, profile.permissions, "view_logs");
}

function canViewMerchantHealth(res: Response): boolean {
  const profile = getAuthContext(res)?.adminProfile;
  if (!profile) return false;
  return hasAdminPermission(profile.role, profile.permissions, "view_merchants");
}

function monthlyOperatingBudget(): number | null {
  const raw = String(process.env.FAWRI_MONTHLY_OPERATING_BUDGET_USD ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function snapshotFor(window: EarlyWarningWindow): Promise<EarlyWarningSnapshot> {
  const current = cache.get(window);
  const now = Date.now();
  if (current && now - current.loadedAt < CACHE_TTL_MS) return current.snapshot;
  const snapshot = await loadEarlyWarningPostgresSnapshot(window);
  cache.set(window, { loadedAt: now, snapshot });
  return snapshot;
}

async function costReportFor(): Promise<EarlyWarningCostReport> {
  const now = Date.now();
  if (costCache && now - costCache.loadedAt < COST_CACHE_TTL_MS) return costCache.report;
  const report = await loadEarlyWarningCostReport();
  costCache = { loadedAt: now, report };
  return report;
}

function systemIncident(incident: EarlyWarningSnapshot["incidents"][number]): EarlyWarningIncidentWithScope {
  return { ...incident, scope: "system", merchant_id: null, merchant_name: null };
}

router.get("/admin/early-warning", requireSecureAdminSession, async (req, res) => {
  if (!canViewEarlyWarning(res)) {
    sendAuthError(
      res,
      403,
      "ADMIN_PERMISSION_REQUIRED",
      "view_logs permission is required",
    );
    return;
  }

  const window = normalizeEarlyWarningWindow(req.query.window);
  try {
    const snapshot = await snapshotFor(window);
    const http = getHttpTelemetrySnapshot(window);
    const aiRuntime = getAiUsageTelemetrySnapshot(window);
    const runtimeEvaluation = evaluateRuntimeEarlyWarnings({ http, ai: aiRuntime });
    const operationalMerchants = operationalMerchantHealthRows(snapshot.merchants);
    const merchantEvaluation = evaluateMerchantEarlyWarnings(operationalMerchants);
    const merchantHealthVisible = canViewMerchantHealth(res);
    const runtimeByMerchant = new Map(
      aiRuntime.merchants.map((merchant) => [merchant.merchant_id, merchant]),
    );
    const allIncidents: EarlyWarningIncidentWithScope[] = [
      ...snapshot.incidents.map(systemIncident),
      ...merchantEvaluation,
      ...runtimeEvaluation.incidents.map((incident) => ({
        ...incident,
        scope: "system" as const,
        merchant_id: null,
        merchant_name: null,
      })),
    ];

    const [historyResult, costResult] = await Promise.allSettled([
      syncEarlyWarningIncidentHistory({ incidents: allIncidents, window }),
      costReportFor(),
    ]);
    if (historyResult.status === "rejected") {
      console.error("Early warning incident history unavailable", {
        code: String((historyResult.reason as { code?: unknown } | null)?.code || "INCIDENT_HISTORY_UNAVAILABLE"),
      });
    }
    if (costResult.status === "rejected") {
      console.error("Early warning cost report unavailable", {
        code: String((costResult.reason as { code?: unknown } | null)?.code || "COST_REPORT_UNAVAILABLE"),
      });
    }

    const visibleIncidents = merchantHealthVisible
      ? allIncidents
      : allIncidents.filter((incident) => incident.scope !== "merchant");
    const incidentHistory = historyResult.status === "fulfilled"
      ? merchantHealthVisible
        ? historyResult.value
        : historyResult.value.filter((incident) => incident.scope !== "merchant")
      : [];
    const configuredBudget = monthlyOperatingBudget();
    const costReport = costResult.status === "fulfilled"
      ? {
          ...costResult.value,
          merchants: merchantHealthVisible ? costResult.value.merchants : [],
          monthly_budget_usd: configuredBudget,
          remaining_budget_usd:
            configuredBudget !== null && costResult.value.known_monthly_cost_usd !== null
              ? Math.round((configuredBudget - costResult.value.known_monthly_cost_usd) * 1_000_000) / 1_000_000
              : null,
          budget_usage_percent:
            configuredBudget !== null && costResult.value.known_monthly_cost_usd !== null
              ? Math.round((costResult.value.known_monthly_cost_usd / configuredBudget) * 10_000) / 100
              : null,
        }
      : null;

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      snapshot: {
        ...snapshot,
        overall_health: mergeEarlyWarningHealth(
          snapshot.overall_health,
          runtimeEvaluation.health,
        ),
        incidents: visibleIncidents,
        incident_history_status: historyResult.status === "fulfilled" ? "available" : "unavailable",
        incident_history: incidentHistory,
        cost_report_status: costResult.status === "fulfilled" ? "available" : "unavailable",
        cost_report: costReport,
        http,
        ai_runtime: aiRuntime,
        merchant_health_visible: merchantHealthVisible,
        merchants: merchantHealthVisible
          ? operationalMerchants.map((merchant) => {
              const runtime = runtimeByMerchant.get(merchant.merchant_id);
              return {
                ...merchant,
                ai_runtime_calls: runtime?.calls ?? 0,
                ai_runtime_failed_calls: runtime?.failed_calls ?? 0,
                ai_runtime_input_tokens: runtime?.input_tokens ?? 0,
                ai_runtime_output_tokens: runtime?.output_tokens ?? 0,
                ai_runtime_total_tokens: runtime?.total_tokens ?? 0,
              };
            })
          : [],
      },
    });
  } catch (error) {
    const code = String((error as { code?: unknown } | null)?.code || "EARLY_WARNING_UNAVAILABLE");
    console.error("Early warning snapshot failed", { code });
    sendAuthError(
      res,
      503,
      "EARLY_WARNING_UNAVAILABLE",
      "early warning authority is unavailable",
    );
  }
});

export default router;
