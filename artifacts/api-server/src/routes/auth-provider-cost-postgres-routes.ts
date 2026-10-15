import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminSession,
  sendAuthError,
} from "../middleware/authSession";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  getProviderCostConfiguration,
  ProviderCostAuthorityError,
  setProviderCostBudget,
  setProviderCostRate,
} from "../services/providerCostAuthority";

const router = Router();

router.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!operationalPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
});

function ownerAccountId(res: Response): string | null {
  const context = getAuthContext(res);
  if (!context?.adminProfile || context.adminProfile.role !== "owner_admin") return null;
  return context.account.id;
}

function requireOwner(res: Response): string | null {
  const accountId = ownerAccountId(res);
  if (!accountId) {
    sendAuthError(
      res,
      403,
      "OWNER_ADMIN_REQUIRED",
      "owner administrator permission is required",
    );
    return null;
  }
  return accountId;
}

function sendProviderCostError(res: Response, error: unknown): void {
  if (error instanceof ProviderCostAuthorityError) {
    res.status(error.statusCode).json({
      ok: false,
      code: error.code,
      error: error.message,
    });
    return;
  }
  const code = String((error as { code?: unknown } | null)?.code || "PROVIDER_COST_AUTHORITY_FAILED");
  console.error("Provider cost authority failed", { code });
  res.status(503).json({
    ok: false,
    code: "PROVIDER_COST_AUTHORITY_FAILED",
    error: "provider cost authority is unavailable",
  });
}

router.get(
  "/admin/provider-costs",
  requireSecureAdminSession,
  async (req: Request, res: Response) => {
    if (!requireOwner(res)) return;
    try {
      const requestedLimit = Number(req.query.history_limit);
      const configuration = await getProviderCostConfiguration({
        ...(Number.isInteger(requestedLimit) ? { historyLimit: requestedLimit } : {}),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, configuration });
    } catch (error) {
      sendProviderCostError(res, error);
    }
  },
);

router.put(
  "/admin/provider-costs/rates/:meterKey",
  requireSecureAdminSession,
  async (req: Request, res: Response) => {
    const actorAccountId = requireOwner(res);
    if (!actorAccountId) return;
    try {
      const requestedSource = String(req.body?.source_type || "owner_configured").trim();
      if (requestedSource === "provider_api") {
        sendAuthError(
          res,
          403,
          "PROVIDER_COST_AUTOMATION_RESERVED",
          "provider_api cost rates may only be written by a trusted provider billing connector",
        );
        return;
      }
      const rate = await setProviderCostRate({
        actorAccountId,
        meterKey: req.params.meterKey,
        providerKey: req.body?.provider_key,
        rateUsd: req.body?.rate_usd,
        sourceType: requestedSource,
        sourceReference: req.body?.source_reference,
        effectiveMonth: req.body?.effective_month,
        notes: req.body?.notes,
        dimensionKey: req.body?.dimension_key,
        dimensionValue: req.body?.dimension_value,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, rate });
    } catch (error) {
      sendProviderCostError(res, error);
    }
  },
);

router.patch(
  "/admin/provider-costs/settings",
  requireSecureAdminSession,
  async (req: Request, res: Response) => {
    const actorAccountId = requireOwner(res);
    if (!actorAccountId) return;
    try {
      const settings = await setProviderCostBudget({
        actorAccountId,
        monthlyBudgetUsd: req.body?.monthly_budget_usd,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, settings });
    } catch (error) {
      sendProviderCostError(res, error);
    }
  },
);

export default router;
