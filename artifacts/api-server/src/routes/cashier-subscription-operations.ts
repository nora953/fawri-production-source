import { Router, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminPermission,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import {
  CashierBillingAuthorityError,
  createCashierBillingCheckout,
  getCashierBillingCatalog,
  listMerchantCashierBillingOrders,
  type CashierBillingOperation,
} from "../services/cashierBillingAuthority";
import {
  CashierEntitlementError,
  changeCashierSubscriptionAdministrativeState,
  getCashierEntitlementAuthoritative,
  listCashierLicensedStationsAuthoritative,
  scheduleCashierDowngradeAuthoritative,
} from "../services/cashierEntitlementAuthority";
import { SuperQiSandboxProviderError } from "../services/superQiSandboxTransport";

const router = Router();

function merchantId(res: Response): string {
  return getAuthContext(res)?.merchantProfile?.merchantId || "";
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof CashierBillingAuthorityError || error instanceof CashierEntitlementError) {
    sendAuthError(res, error.status, error.code, error.message, error.details || {});
    return;
  }
  if (error instanceof SuperQiSandboxProviderError) {
    sendAuthError(res, error.status, error.code, error.message);
    return;
  }
  sendAuthError(
    res,
    503,
    "CASHIER_SUBSCRIPTION_UNAVAILABLE",
    "cashier subscription authority is unavailable",
  );
}

router.get(
  "/cashier/subscription/catalog",
  requireSecureMerchantSession,
  (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, ...getCashierBillingCatalog() });
  },
);

router.get(
  "/cashier/subscription",
  requireSecureMerchantSession,
  async (_req, res) => {
    try {
      const merchant = merchantId(res);
      const [entitlement, licensedStations] = await Promise.all([
        getCashierEntitlementAuthoritative(merchant),
        listCashierLicensedStationsAuthoritative(merchant),
      ]);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        entitlement: entitlement || {
          state: "inactive",
          licensed_seats: 0,
          server_time: new Date().toISOString(),
        },
        licensed_stations: licensedStations,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/billing/orders",
  requireSecureMerchantSession,
  async (_req, res) => {
    try {
      const orders = await listMerchantCashierBillingOrders(merchantId(res));
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, orders });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/billing/checkout",
  requireSecureMerchantSession,
  async (req, res) => {
    const operation = String(req.body?.operation || "").trim() as CashierBillingOperation;
    if (!["activate", "renew", "add_seats"].includes(operation)) {
      sendAuthError(
        res,
        400,
        "CASHIER_BILLING_OPERATION_INVALID",
        "invalid cashier billing operation",
      );
      return;
    }
    const requestedSeats = Number(req.body?.requested_seats);
    if (!Number.isSafeInteger(requestedSeats) || requestedSeats <= 0) {
      sendAuthError(
        res,
        400,
        "CASHIER_BILLING_SEATS_INVALID",
        "requested cashier seats must be a positive integer",
      );
      return;
    }
    const idempotencyKey = String(req.body?.idempotency_key || "").trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      sendAuthError(
        res,
        400,
        "CASHIER_BILLING_IDEMPOTENCY_REQUIRED",
        "cashier billing idempotency key is required",
      );
      return;
    }
    const provider = String(req.body?.provider || "").trim();
    try {
      const result = await createCashierBillingCheckout({
        merchantId: merchantId(res),
        operation,
        requestedSeats,
        idempotencyKey,
        ...(provider ? { provider } : {}),
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/subscription/downgrade",
  requireSecureMerchantSession,
  async (req, res) => {
    const targetSeats = Number(req.body?.target_seats);
    const keepStationIds = Array.isArray(req.body?.keep_station_ids)
      ? req.body.keep_station_ids.map((value: unknown) => String(value || "").trim())
      : [];
    const expectedVersion =
      req.body?.expected_version === undefined
        ? undefined
        : Number(req.body.expected_version);
    try {
      const entitlement = await scheduleCashierDowngradeAuthoritative({
        merchantId: merchantId(res),
        targetSeats,
        keepStationIds,
        ...(Number.isSafeInteger(expectedVersion) ? { expectedVersion } : {}),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, entitlement });
    } catch (error) {
      sendError(res, error);
    }
  },
);


router.get(
  "/admin/merchants/:merchantId/cashier/subscription",
  requireSecureAdminPermission("manage_subscriptions"),
  async (req, res) => {
    try {
      const entitlement = await getCashierEntitlementAuthoritative(
        String(req.params.merchantId || "").trim(),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, entitlement });
    } catch (error) {
      sendError(res, error);
    }
  },
);

for (const action of ["suspend", "resume", "cancel"] as const) {
  router.post(
    `/admin/merchants/:merchantId/cashier/subscription/${action}`,
    requireSecureAdminPermission("manage_subscriptions"),
    async (req, res) => {
      try {
        const actorRef = getAuthContext(res)?.account.id || "";
        const expectedVersion =
          req.body?.expected_version === undefined
            ? undefined
            : Number(req.body.expected_version);
        const entitlement = await changeCashierSubscriptionAdministrativeState({
          merchantId: String(req.params.merchantId || "").trim(),
          action,
          actorRef,
          ...(Number.isSafeInteger(expectedVersion) ? { expectedVersion } : {}),
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({ ok: true, entitlement });
      } catch (error) {
        sendError(res, error);
      }
    },
  );
}

export default router;
