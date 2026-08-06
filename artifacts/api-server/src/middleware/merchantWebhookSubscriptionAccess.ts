import type { NextFunction, Request, Response } from "express";
import { getMetaWebhookEventId } from "./metaWebhookSecurity";
import { readMetaPageMerchantMap } from "../services/metaPageDirectory";
import { reserveMerchantAutoReply } from "../services/merchantReplyEntitlement";

function isReplyEligibleEvent(event: unknown): boolean {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const record = event as Record<string, unknown>;
  const message =
    record.message && typeof record.message === "object"
      ? (record.message as Record<string, unknown>)
      : null;
  const sender =
    record.sender && typeof record.sender === "object"
      ? (record.sender as Record<string, unknown>)
      : null;

  return Boolean(
    message &&
      message.is_echo !== true &&
      String(message.text || "").trim() &&
      sender &&
      String(sender.id || "").trim(),
  );
}

function sendInternalDecision(
  res: Response,
  code: string,
  error: string,
): void {
  const unavailable = code === "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE";
  res.setHeader("Cache-Control", "no-store");
  res.status(unavailable ? 503 : 409).json({ ok: false, code, error });
}

export function enforceMerchantWebhookSubscriptionAccess(
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
    const entries = Array.isArray(body.entry) ? body.entry : [];
    let reservedReplies = 0;
    let blockedReplies = 0;

    const filteredEntries = [];
    for (const entry of entries) {
      const entryRecord =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      const pageId = String(entryRecord.id || "").trim();
      const merchantId = pageMerchantMap.get(pageId);
      const messaging = Array.isArray(entryRecord.messaging)
        ? entryRecord.messaging
        : [];
      const filteredMessaging = [];

      for (const event of messaging) {
        if (!isReplyEligibleEvent(event)) {
          filteredMessaging.push(event);
          continue;
        }
        if (!merchantId) {
          blockedReplies += 1;
          if (res.locals.metaWebhookInternalReplay === true) {
            sendInternalDecision(
              res,
              "META_PAGE_NOT_CONNECTED",
              "Meta page is not connected to a merchant",
            );
            return;
          }
          continue;
        }

        const eventId = getMetaWebhookEventId(pageId, event);
        const decision = reserveMerchantAutoReply(merchantId, eventId);
        if (decision.allowed) {
          if (!decision.duplicate) reservedReplies += 1;
          filteredMessaging.push(event);
          continue;
        }

        blockedReplies += 1;
        console.warn("Meta webhook reply blocked by subscription state", {
          page_id: pageId,
          merchant_id: merchantId,
          event_id: eventId,
          code: decision.code,
        });
        if (res.locals.metaWebhookInternalReplay === true) {
          sendInternalDecision(res, decision.code, decision.error);
          return;
        }
      }

      filteredEntries.push({ ...entryRecord, messaging: filteredMessaging });
    }

    req.body = { ...body, entry: filteredEntries };
    res.locals.metaWebhookReservedReplies = reservedReplies;
    res.locals.metaWebhookBlockedReplies = blockedReplies;
    next();
  } catch (error) {
    console.error("Meta webhook subscription enforcement failed:", error);
    if (res.locals.metaWebhookInternalReplay === true) {
      sendInternalDecision(
        res,
        "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
        "merchant reply entitlement is unavailable",
      );
      return;
    }
    req.body = { ...body, entry: [] };
    res.locals.metaWebhookSubscriptionUnavailable = true;
    next();
  }
}
