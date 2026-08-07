import { Router, type Request, type Response } from "express";
import {
  getMerchantIdFromSession,
  requireMerchantSession,
} from "./auth";
import {
  adjustCatalogInventory,
  CatalogRuntimeError,
  createCatalogProduct,
  deleteCatalogProduct,
  getCatalogProduct,
  importCatalogProducts,
  listCatalogProducts,
  setCatalogInventory,
  updateCatalogProduct,
} from "../services/catalogInventoryRuntime";

const router = Router();

function parameter(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return typeof value === "string" ? value.trim() : "";
}

function idempotencyKey(req: Request): string {
  return parameter(req.get("Idempotency-Key") || req.body?.idempotency_key);
}

function productBody(req: Request): Record<string, unknown> {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const nested = (body as Record<string, unknown>).product;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : (body as Record<string, unknown>);
}

function rejectMerchantOverride(
  req: Request,
  res: Response,
  sessionMerchantId: string,
): boolean {
  const requested = parameter(
    req.body?.merchant_id ?? req.body?.product?.merchant_id,
  );
  if (requested && requested !== sessionMerchantId) {
    res.setHeader("Cache-Control", "no-store");
    res.status(403).json({
      ok: false,
      code: "MERCHANT_ACCESS_FORBIDDEN",
      error: "merchant access is forbidden",
    });
    return true;
  }
  return false;
}

function sendError(res: Response, error: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  if (error instanceof CatalogRuntimeError) {
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details || {}),
    });
    return;
  }

  console.error("Catalog operation failed:", error);
  res.status(500).json({
    ok: false,
    code: "CATALOG_OPERATION_FAILED",
    error: "catalog operation failed",
  });
}

router.get(
  "/catalog/products",
  requireMerchantSession,
  (_req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const products = listCatalogProducts(merchantId);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        merchant_id: merchantId,
        count: products.length,
        products,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get(
  "/catalog/products/:productId",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      const product = getCatalogProduct(
        merchantId,
        parameter(req.params.productId),
      );
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, product });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/catalog/products",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (rejectMerchantOverride(req, res, merchantId)) return;
      const result = createCatalogProduct({
        merchantId,
        idempotencyKey: idempotencyKey(req),
        input: productBody(req),
      });
      res.setHeader("Cache-Control", "no-store");
      if (result.replayed) res.setHeader("Idempotent-Replay", "true");
      res.status(result.replayed ? 200 : 201).json({
        ok: true,
        replayed: result.replayed,
        product: result.product,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/catalog/products/import",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (rejectMerchantOverride(req, res, merchantId)) return;
      const result = importCatalogProducts({
        merchantId,
        idempotencyKey: idempotencyKey(req),
        items: req.body?.products,
      });
      res.setHeader("Cache-Control", "no-store");
      if (result.replayed) res.setHeader("Idempotent-Replay", "true");
      res.status(result.replayed ? 200 : 201).json({
        ok: true,
        replayed: result.replayed,
        created_count: result.created_count,
        products: result.products,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.patch(
  "/catalog/products/:productId",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (rejectMerchantOverride(req, res, merchantId)) return;
      const product = updateCatalogProduct({
        merchantId,
        productId: parameter(req.params.productId),
        expectedVersion: req.body?.expected_version,
        input: productBody(req),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, product });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.delete(
  "/catalog/products/:productId",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (rejectMerchantOverride(req, res, merchantId)) return;
      const result = deleteCatalogProduct({
        merchantId,
        productId: parameter(req.params.productId),
        expectedVersion:
          req.body?.expected_version ?? parameter(req.query.expected_version),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...result });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/inventory/products/:productId/set",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (rejectMerchantOverride(req, res, merchantId)) return;
      const product = setCatalogInventory({
        merchantId,
        productId: parameter(req.params.productId),
        variantId: req.body?.variant_id,
        expectedVersion: req.body?.expected_version,
        quantity: req.body?.quantity,
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, product });
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.post(
  "/inventory/products/:productId/adjust",
  requireMerchantSession,
  (req: Request, res: Response) => {
    try {
      const merchantId = getMerchantIdFromSession(res);
      if (rejectMerchantOverride(req, res, merchantId)) return;
      const result = adjustCatalogInventory({
        merchantId,
        productId: parameter(req.params.productId),
        variantId: req.body?.variant_id,
        expectedVersion: req.body?.expected_version,
        delta: req.body?.delta,
        reason: req.body?.reason,
        idempotencyKey: idempotencyKey(req),
      });
      res.setHeader("Cache-Control", "no-store");
      if (result.replayed) res.setHeader("Idempotent-Replay", "true");
      res.json({
        ok: true,
        replayed: result.replayed,
        product: result.product,
      });
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
