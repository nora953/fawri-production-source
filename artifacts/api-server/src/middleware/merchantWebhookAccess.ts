import fs from "node:fs";
import type { NextFunction, Request, Response } from "express";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { getMerchantOperationalDecision } from "../services/merchantOperationalAccess";

type MetaPageRecord = {
  merchant_id?: unknown;
};

type RuntimeDatabase = {
  metaPagesByPageId?: unknown;
};

function readPageMerchantMap(): Map<string, string> {
  const runtimePath = getFawriDataFilePath("fawri-runtime-db.json");
  const parsed = JSON.parse(
    fs.readFileSync(runtimePath, "utf8"),
  ) as RuntimeDatabase;
  const records =
    parsed.metaPagesByPageId &&
    typeof parsed.metaPagesByPageId === "object" &&
    !Array.isArray(parsed.metaPagesByPageId)
      ? (parsed.metaPagesByPageId as Record<string, MetaPageRecord>)
      : {};

  const result = new Map<string, string>();
  for (const [pageId, record] of Object.entries(records)) {
    const merchantId = String(record?.merchant_id || "").trim();
    if (pageId && merchantId) result.set(pageId, merchantId);
  }
  return result;
}

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
    const pageMerchantMap = readPageMerchantMap();
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
