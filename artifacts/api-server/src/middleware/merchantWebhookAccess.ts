import type { NextFunction, Request, Response } from "express";
import { getMetaWebhookEventId } from "./metaWebhookSecurity";
import { readMetaPageMerchantMap } from "../services/metaPageDirectory";
import { getMerchantOperationalDecision } from "../services/merchantOperationalAccess";

function entryEventIds(entry: unknown): string[] {
  const record = entry && typeof entry === "object"
    ? (entry as Record<string, unknown>)
    : {};
  const pageId = String(record.id || "").trim();
  return (Array.isArray(record.messaging) ? record.messaging : [])
    .map((event) => getMetaWebhookEventId(pageId, event));
}

function unavailable(res: Response, code: string, error: string): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({ ok: false, code, error });
}

export function enforceMerchantWebhookOperationalAccess(
  req: Request,
  res: Response,
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

  try {
    const pageMerchantMap = readMetaPageMerchantMap();
    const permittedEntries: unknown[] = [];
    const terminalEventIds: string[] = [];

    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
      const pageId = String(entry?.id || "").trim();
      const merchantId = pageMerchantMap.get(pageId);
      if (!merchantId) {
        unavailable(
          res,
          "META_PAGE_DIRECTORY_UNAVAILABLE",
          "Meta page mapping is temporarily unavailable",
        );
        return;
      }

      const decision = getMerchantOperationalDecision(merchantId);
      if (decision.allowed) {
        permittedEntries.push(entry);
        continue;
      }

      if (decision.code === "MERCHANT_ACCESS_STATE_UNAVAILABLE") {
        unavailable(res, decision.code, decision.error);
        return;
      }

      if (res.locals.metaWebhookInternalReplay === true) {
        res.setHeader("Cache-Control", "no-store");
        res.status(409).json({ ok: false, code: decision.code, error: decision.error });
        return;
      }

      terminalEventIds.push(...entryEventIds(entry));
      console.warn("Meta webhook entry blocked for merchant state", {
        page_id: pageId,
        merchant_id: merchantId,
        code: decision.code,
      });
    }

    req.body = { ...body, entry: permittedEntries };
    res.locals.metaWebhookTerminalEventIds = terminalEventIds;
    next();
  } catch {
    unavailable(
      res,
      "MERCHANT_ACCESS_STATE_UNAVAILABLE",
      "merchant access state is unavailable",
    );
  }
}
