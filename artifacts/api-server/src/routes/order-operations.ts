import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  OrderOperationError,
  type ServerOrder,
} from "../services/orderOperationsRuntime";
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

function isMerchantOrder(order: Pick<ServerOrder, "source_channel">): boolean {
  return String(order.source_channel || "").trim().toLowerCase() !== "cashier";
}

function assertMerchantOrder(order: ServerOrder): ServerOrder {
  if (!isMerchantOrder(order)) {
    throw new OrderOperationError(
      "ORDER_NOT_FOUND",
      "order was not found",
      404,
    );
  }
  return order;
}

async function listMerchantOrders(merchantId: string): Promise<ServerOrder[]> {
  const orders = await listServerOrdersAuthoritative(merchantId);
  return orders.filter(isMerchantOrder);
}

async function getMerchantOrder(
  merchantId: string,
  orderId: string,
): Promise<ServerOrder> {
  return assertMerchantOrder(
    await getServerOrderAuthoritative(merchantId, orderId),
  );
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
    const orders = await listMerchantOrders(merchantId);
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
      const orders = await listMerchantOrders(merchantId);
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
      const order = await getMerchantOrder(
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
      const orderId = parameter(req.params.orderId);
      await getMerchantOrder(merchantId, orderId);
      const order = await updateServerOrderStatusAuthoritative({
        merchantId,
        orderId,
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
      const orderId = parameter(req.params.orderId);
      await getMerchantOrder(merchantId, orderId);
      const order = await updateServerPaymentStatusAuthoritative({
        merchantId,
        orderId,
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
      const orderId = parameter(req.params.orderId);
      await getMerchantOrder(merchantId, orderId);
      const paymentRequestId = requestId(req);
      const order = await confirmServerPaymentAuthoritative({
        merchantId,
        orderId,
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
      const orderId = parameter(req.params.orderId);
      await getMerchantOrder(merchantId, orderId);
      const order = await rejectServerPaymentAuthoritative({
        merchantId,
        orderId,
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
      const orderId = parameter(req.params.orderId);
      await getMerchantOrder(merchantId, orderId);
      const order = await resolveMerchantPaymentConflictAuthoritative({
        merchantId,
        orderId,
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
