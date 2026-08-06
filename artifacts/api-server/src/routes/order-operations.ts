import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  confirmServerPayment,
  getServerOrder,
  listServerOrders,
  OrderOperationError,
  rejectServerPayment,
  updateServerOrderStatus,
  updateServerPaymentStatus,
} from "../services/orderOperationsRuntime";

const router = Router();

function parameter(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return typeof value === "string" ? value.trim() : "";
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof OrderOperationError) {
    res.setHeader("Cache-Control", "no-store");
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details || {}),
    });
    return;
  }
  console.error("Order operation failed:", error);
  res.setHeader("Cache-Control", "no-store");
  res.status(500).json({
    ok: false,
    code: "ORDER_OPERATION_FAILED",
    error: "order operation failed",
  });
}

router.get(
  "/orders",
  requireMerchantSession,
  (_req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const orders = listServerOrders(merchantId);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        merchant_id: merchantId,
        count: orders.length,
        orders,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/orders/:merchantId",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (parameter(req.params.merchantId) !== merchantId) {
        res.status(403).json({
          ok: false,
          code: "MERCHANT_ACCESS_FORBIDDEN",
          error: "merchant access is forbidden",
        });
        return;
      }
      const orders = listServerOrders(merchantId);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        merchant_id: merchantId,
        count: orders.length,
        orders,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/order/:orderId",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = getServerOrder(merchantId, parameter(req.params.orderId));
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
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = updateServerOrderStatus({
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
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = updateServerPaymentStatus({
        merchantId,
        orderId: parameter(req.params.orderId),
        expectedVersion: req.body?.expected_version,
        paymentStatus: req.body?.payment_status,
        rejectionReason: req.body?.rejection_reason,
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
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = confirmServerPayment({
        merchantId,
        orderId: parameter(req.params.orderId),
        expectedVersion: req.body?.expected_version,
      });
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
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const order = rejectServerPayment({
        merchantId,
        orderId: parameter(req.params.orderId),
        expectedVersion: req.body?.expected_version,
        reason: req.body?.reason,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, order });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
