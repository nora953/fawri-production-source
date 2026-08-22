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
  normalizeEarlyWarningCostMonth,
  type EarlyWarningCostReport,
} from "../services/earlyWarningCostAuthority";
import {
  syncEarlyWarningIncidentHistory,
  type EarlyWarningIncidentWithScope,
} from "../services/earlyWarningIncidentHistory";
import {
  loadEarlyWarningMerchantUsageReport,
  type MerchantUsageReport,
} from "../services/earlyWarningMerchantUsageAuthority";
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
const costCache = new Map<string, { loadedAt: number; report: EarlyWarningCostReport }>();
const merchantUsageCache = new Map<string, { loadedAt: number; report: MerchantUsageReport }>();

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

async function snapshotFor(window: EarlyWarningWindow): Promise<EarlyWarningSnapshot> {
  const current = cache.get(window);
  const now = Date.now();
  if (current && now - current.loadedAt < CACHE_TTL_MS) return current.snapshot;
  const snapshot = await loadEarlyWarningPostgresSnapshot(window);
  cache.set(window, { loadedAt: now, snapshot });
  return snapshot;
}

async function costReportFor(month: string): Promise<EarlyWarningCostReport> {
  const current = costCache.get(month);
  const now = Date.now();
  if (current && now - current.loadedAt < COST_CACHE_TTL_MS) return current.report;
  const report = await loadEarlyWarningCostReport({ month });
  costCache.set(month, { loadedAt: now, report });
  return report;
}

async function merchantUsageReportFor(month: string): Promise<MerchantUsageReport> {
  const current = merchantUsageCache.get(month);
  const now = Date.now();
  if (current && now - current.loadedAt < COST_CACHE_TTL_MS) return current.report;
  const report = await loadEarlyWarningMerchantUsageReport({ month });
  merchantUsageCache.set(month, { loadedAt: now, report });
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
  const costMonth = normalizeEarlyWarningCostMonth(req.query.month);
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

    const [historyResult, costResult, merchantUsageResult] = await Promise.allSettled([
      syncEarlyWarningIncidentHistory({ incidents: allIncidents, window }),
      costReportFor(costMonth),
      merchantHealthVisible ? merchantUsageReportFor(costMonth) : Promise.resolve(null),
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
    if (merchantUsageResult.status === "rejected") {
      console.error("Early warning merchant usage report unavailable", {
        code: String((merchantUsageResult.reason as { code?: unknown } | null)?.code || "MERCHANT_USAGE_REPORT_UNAVAILABLE"),
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
    const costReport = costResult.status === "fulfilled"
      ? {
          ...costResult.value,
          merchants: merchantHealthVisible ? costResult.value.merchants : [],
        }
      : null;
    const merchantUsage = merchantHealthVisible && merchantUsageResult.status === "fulfilled"
      ? merchantUsageResult.value
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
        merchant_usage_status: merchantHealthVisible && merchantUsageResult.status === "fulfilled" ? "available" : "unavailable",
        merchant_usage: merchantUsage,
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
