import type { NextFunction, Request, Response } from "express";
import { getMetaWebhookEventId } from "./metaWebhookSecurity";
import { readMetaPageMerchantMap } from "../services/metaPageDirectory";
import { getMerchantOperationalDecision } from "../services/merchantOperationalAccess";

function entryEventIds(entry: unknown): string[] {
  const record =
    entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)
      : {};
  const pageId = String(record.id || "").trim();
  const messaging = Array.isArray(record.messaging) ? record.messaging : [];
  return messaging.map((event) => getMetaWebhookEventId(pageId, event));
}

function sendUnavailable(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(503).json({
    ok: false,
    code: "MERCHANT_ACCESS_STATE_UNAVAILABLE",
    error: "merchant access state is unavailable",
  });
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

  const entries = Array.isArray(body.entry) ? body.entry : [];

  try {
    const pageMerchantMap = readMetaPageMerchantMap();
    const permittedEntries: unknown[] = [];
    const terminalEventIds: string[] = [];

    for (const entry of entries) {
      const pageId = String(entry?.id || "").trim();
      const merchantId = pageMerchantMap.get(pageId);
      if (!merchantId) {
        if (res.locals.metaWebhookInternalReplay === true) {
          res.setHeader("Cache-Control", "no-store");
          res.status(404).json({
            ok: false,
            code: "META_PAGE_NOT_CONNECTED",
            error: "Meta page is not connected to a merchant",
          });
          return;
        }
        terminalEventIds.push(...entryEventIds(entry));
        continue;
      }

      const decision = getMerchantOperationalDecision(merchantId);
      if (decision.allowed) {
        permittedEntries.push(entry);
        continue;
      }

      if (decision.code === "MERCHANT_ACCESS_STATE_UNAVAILABLE") {
        sendUnavailable(res);
        return;
      }

      if (res.locals.metaWebhookInternalReplay === true) {
        res.setHeader("Cache-Control", "no-store");
        res.status(409).json({
          ok: false,
          code: decision.code,
          error: decision.error,
        });
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
  } catch (error) {
    console.error("Meta webhook merchant access filtering failed:", error);
    sendUnavailable(res);
  }
}
