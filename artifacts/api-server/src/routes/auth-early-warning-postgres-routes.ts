import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminSession,
  sendAuthError,
} from "../middleware/authSession";
import { getAiUsageTelemetrySnapshot } from "../observability/aiUsageTelemetry";
import { getHttpTelemetrySnapshot } from "../observability/requestTelemetry";
import { hasAdminPermission } from "../services/authPolicy";
import {
  loadEarlyWarningPostgresSnapshot,
  normalizeEarlyWarningWindow,
  type EarlyWarningSnapshot,
  type EarlyWarningWindow,
} from "../services/earlyWarningPostgresAuthority";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";

const router = Router();
const CACHE_TTL_MS = 10_000;
const cache = new Map<EarlyWarningWindow, { loadedAt: number; snapshot: EarlyWarningSnapshot }>();

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

async function snapshotFor(window: EarlyWarningWindow): Promise<EarlyWarningSnapshot> {
  const current = cache.get(window);
  const now = Date.now();
  if (current && now - current.loadedAt < CACHE_TTL_MS) return current.snapshot;
  const snapshot = await loadEarlyWarningPostgresSnapshot(window);
  cache.set(window, { loadedAt: now, snapshot });
  return snapshot;
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
    const runtimeByMerchant = new Map(
      aiRuntime.merchants.map((merchant) => [merchant.merchant_id, merchant]),
    );

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      snapshot: {
        ...snapshot,
        http,
        ai_runtime: aiRuntime,
        merchants: snapshot.merchants.map((merchant) => {
          const runtime = runtimeByMerchant.get(merchant.merchant_id);
          return {
            ...merchant,
            ai_runtime_calls: runtime?.calls ?? 0,
            ai_runtime_input_tokens: runtime?.input_tokens ?? 0,
            ai_runtime_output_tokens: runtime?.output_tokens ?? 0,
            ai_runtime_total_tokens: runtime?.total_tokens ?? 0,
          };
        }),
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
