import type { NextFunction, Request, Response } from "express";
import { readMetaPageMerchantMap } from "../services/metaPageDirectory";
import { getMerchantOperationalDecision } from "../services/merchantOperationalAccess";

export function enforceMerchantWebhookOperationalAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.method !== "POST" || req.path !== "/api/meta/webhook") {
    next();
    return;
  }

  const body = req.body;
  if (!body || typeof body !== "object" || body.object !== "page") {
    next();
    return;
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];

  try {
    const pageMerchantMap = readMetaPageMerchantMap();
    const permittedEntries = entries.filter((entry) => {
      const pageId = String(entry?.id || "").trim();
      const merchantId = pageMerchantMap.get(pageId);
      if (!merchantId) return false;

      const decision = getMerchantOperationalDecision(merchantId);
      if (decision.allowed) return true;

      console.warn("Meta webhook entry blocked for merchant state", {
        page_id: pageId,
        merchant_id: merchantId,
        code: decision.code,
      });
      return false;
    });

    req.body = { ...body, entry: permittedEntries };
  } catch (error) {
    console.error("Meta webhook merchant access filtering failed:", error);
    req.body = { ...body, entry: [] };
  }

  next();
}
