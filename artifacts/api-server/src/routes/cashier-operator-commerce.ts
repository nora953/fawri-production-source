import { Router, type Request, type Response } from "express";
import {
  getCashierOperatorContext,
  requireCashierOperatorSession,
} from "../middleware/cashierStaffSession";
import {
  getCashierOperatorCatalogSnapshotAuthoritative,
  syncCashierOperatorCompensationAuthoritative,
  syncCashierOperatorSaleAuthoritative,
} from "../services/cashierOperatorCommerceAuthority";
import { assertCashierOperatorManualDiscountAuthority } from "../services/cashierOperatorDiscountAuthority";
import {
  issueCashierDiscountOverrideApprovalAuthoritative,
  listCashierDiscountOverrideApproversAuthoritative,
} from "../services/cashierDiscountOverrideAuthority";
import { getCashierReceiptProfileAuthoritative } from "../services/cashierReceiptProfileAuthority";
import { buildCashierOperatorReportAuthoritative } from "../services/postgresCashierOperatorReportAuthority";
import { assertCashierOperatorCompensationScope } from "../services/cashierOperatorSaleScope";
import { CashierStaffAuthorityError } from "../services/postgresCashierStaffAuthority";
import { CashierSyncError } from "../services/postgresCashierSyncAuthority";

const router = Router();

function operatorContext(res: Response) {
  const context = getCashierOperatorContext(res);
  if (!context) {
    throw new CashierStaffAuthorityError(
      "CASHIER_OPERATOR_SESSION_INVALID",
      "cashier operator session is unavailable",
      401,
    );
  }
  return context;
}

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof CashierSyncError || error instanceof CashierStaffAuthorityError) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details || {}),
    });
    return;
  }
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = Number(candidate?.status);
  const code = String(candidate?.code || "").trim();
  if (Number.isInteger(status) && status >= 400 && status <= 599 && code) {
    res.status(status).json({
      ok: false,
      code,
      error: String(candidate?.message || "cashier operator commerce operation failed"),
    });
    return;
  }
  console.error("Cashier operator commerce operation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  res.status(500).json({
    ok: false,
    code: "CASHIER_OPERATOR_COMMERCE_FAILED",
    error: "cashier operator commerce operation failed",
  });
}

router.get(
  "/cashier/operator/catalog-snapshot",
  requireCashierOperatorSession("sale.create"),
  async (_req: Request, res: Response) => {
    try {
      const snapshot = await getCashierOperatorCatalogSnapshotAuthoritative(
        operatorContext(res),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...snapshot });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/operator/receipt-profile",
  requireCashierOperatorSession("sale.create"),
  async (_req: Request, res: Response) => {
    try {
      const context = operatorContext(res);
      const profile = await getCashierReceiptProfileAuthoritative({
        merchantId: context.merchant_id,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, receipt_profile: profile });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/operator/report",
  requireCashierOperatorSession("reports.sales"),
  async (req: Request, res: Response) => {
    try {
      const result = await buildCashierOperatorReportAuthoritative({
        context: operatorContext(res),
        from: req.query.from,
        to: req.query.to,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/cashier/operator/discount-override/approvers",
  requireCashierOperatorSession("sale.discount"),
  async (_req: Request, res: Response) => {
    try {
      const approvers = await listCashierDiscountOverrideApproversAuthoritative(
        operatorContext(res),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, approvers });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/operator/discount-override",
  requireCashierOperatorSession("sale.discount"),
  async (req: Request, res: Response) => {
    try {
      const approval = await issueCashierDiscountOverrideApprovalAuthoritative({
        context: operatorContext(res),
        approverStaffId: req.body?.approver_staff_id,
        pin: req.body?.pin,
        operationId: req.body?.operation_id,
        manualDiscountMinor: req.body?.manual_discount_minor,
        reason: req.body?.manual_discount_reason,
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ ok: true, approval });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/operator/sync/sale",
  requireCashierOperatorSession("sale.create"),
  async (req: Request, res: Response) => {
    try {
      const context = operatorContext(res);
      // Manual-discount authority is re-read from PostgreSQL immediately before
      // sale reconciliation. Browser state alone can never grant a discount.
      await assertCashierOperatorManualDiscountAuthority({
        context,
        body: req.body,
      });
      const result = await syncCashierOperatorSaleAuthoritative({
        context,
        body: req.body,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/operator/sync/return",
  requireCashierOperatorSession("sale.return"),
  async (req: Request, res: Response) => {
    try {
      const context = operatorContext(res);
      await assertCashierOperatorCompensationScope({
        context,
        body: req.body,
        kind: "return",
      });
      const result = await syncCashierOperatorCompensationAuthoritative({
        context,
        body: req.body,
        kind: "return",
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/cashier/operator/sync/void",
  requireCashierOperatorSession("sale.void"),
  async (req: Request, res: Response) => {
    try {
      const context = operatorContext(res);
      await assertCashierOperatorCompensationScope({
        context,
        body: req.body,
        kind: "void",
      });
      const result = await syncCashierOperatorCompensationAuthoritative({
        context,
        body: req.body,
        kind: "void",
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
