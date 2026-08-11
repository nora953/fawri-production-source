import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import { OrderOperationError } from "../services/orderOperationsRuntime";
import {
  confirmServerPaymentAuthoritative,
  getServerOrderAuthoritative,
  listServerOrdersAuthoritative,
  rejectServerPaymentAuthoritative,
  updateServerOrderStatusAuthoritative,
  updateServerPaymentStatusAuthoritative,
} from "../services/postgresOrderOperationsAuthority";
import {
  resolveMerchantPaymentConflictAuthoritative,
} from "../services/postgresOrderPaymentProviderAuthority";
import {
  notifyMerchantPaymentConflictPostgres,
} from "../services/postgresOperationalNotificationAuthority";

const router = Router();

function parameter(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return typeof value === "string" ? value.trim() : "";
}

function requestId(req: Request): string {
  return String(req.headers["x-request-id"] || req.id || "").trim().slice(0, 200);
}

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof OrderOperationError) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details || {}),
    });
    return;
  }
  console.error("Order operation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({
    ok: false,
    code: "ORDER_OPERATION_FAILED",
    error: "order operation failed",
  });
}

router.get("/orders", requireMerchantSession, async (_req: Request, res: Response) => {
  try {
    const merchantId = getMerchantIdFromSession(res);
    const orders = await listServerOrdersAuthoritative(merchantId);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, merchant_id: merchantId, count: orders.length, orders });
  } catch (error) {
    sendError(res, error);
  }
});

router.get(
  "/orders/:merchantId",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (parameter(req.params.merchantId) !== merchantId) {
        res.setHeader("Cache-Control", "no-store");
        res.status(403).json({
          ok: false,
          code: "MERCHANT_ACCESS_FORBIDDEN",
          error: "merchant access is forbidden",
        });
        return;
      }
      const orders = await listServerOrdersAuthoritative(merchantId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, merchant_id: merchantId, count: orders.length, orders });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/order/:orderId",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = await getServerOrderAuthoritative(
        merchantId,
        parameter(req.params.orderId),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, order });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.patch(
  "/orders/:orderId/status",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = await updateServerOrderStatusAuthoritative({
        merchantId,
        orderId: parameter(req.params.orderId),
        expectedVersion: req.body?.expected_version,
        status: req.body?.status,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, order });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.patch(
  "/orders/:orderId/payment-status",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = await updateServerPaymentStatusAuthoritative({
        merchantId,
        orderId: parameter(req.params.orderId),
        expectedVersion: req.body?.expected_version,
        paymentStatus: req.body?.payment_status,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, order });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/orders/:orderId/payment/confirm",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const paymentRequestId = requestId(req);
      const order = await confirmServerPaymentAuthoritative({
        merchantId,
        orderId: parameter(req.params.orderId),
        expectedVersion: req.body?.expected_version,
        actorId: merchantId,
        requestId: paymentRequestId,
      });
      if (order.payment_reconciliation_status === "reconciliation_required") {
        await notifyMerchantPaymentConflictPostgres({
          merchantId,
          orderId: order.id,
          conversationId: order.conversation_id,
          provider: order.payment_provider,
          sourceEventId: paymentRequestId || `merchant:${order.id}:${order.version}`,
        });
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, order });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/orders/:orderId/payment/reject",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = await rejectServerPaymentAuthoritative({
        merchantId,
        orderId: parameter(req.params.orderId),
        expectedVersion: req.body?.expected_version,
        reason: req.body?.reason,
        actorId: merchantId,
        requestId: requestId(req),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, order });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/orders/:orderId/payment/conflict/resolve",
  requireMerchantSession,
  async (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = await resolveMerchantPaymentConflictAuthoritative({
        merchantId,
        orderId: parameter(req.params.orderId),
        expectedVersion: req.body?.expected_version,
        actorId: merchantId,
        resolutionNote: req.body?.resolution_note,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, order });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
