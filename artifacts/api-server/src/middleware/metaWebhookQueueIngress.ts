import type { NextFunction, Request, Response } from "express";
import {
  getMetaWebhookEventId,
  markMetaWebhookEventsProcessed,
} from "./metaWebhookSecurity";
import { enqueueDurableJob } from "../services/durableJobQueue";
import { isTrustedMetaWebhookInternalReplay } from "../services/metaWebhookInternalReplay";
import { readMetaPageMerchantMap } from "../services/metaPageDirectory";

function eventRecord(event: unknown): Record<string, unknown> {
  return event && typeof event === "object" && !Array.isArray(event)
    ? (event as Record<string, unknown>)
    : {};
}

function replyEligible(event: unknown): boolean {
  const record = eventRecord(event);
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

function eventExternalMessageId(event: unknown): string {
  const record = eventRecord(event);
  const message =
    record.message && typeof record.message === "object"
      ? (record.message as Record<string, unknown>)
      : {};
  return String(message.mid || "").trim();
}

function eventSenderId(event: unknown): string {
  const record = eventRecord(event);
  const sender =
    record.sender && typeof record.sender === "object"
      ? (record.sender as Record<string, unknown>)
      : {};
  return String(sender.id || "").trim();
}

function terminalIds(res: Response): string[] {
  return Array.isArray(res.locals.metaWebhookTerminalEventIds)
    ? res.locals.metaWebhookTerminalEventIds.map(String).filter(Boolean)
    : [];
}

export function enqueueMetaWebhookEvents(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== "POST" || req.path !== "/api/meta/webhook") {
    next();
    return;
  }

  if (isTrustedMetaWebhookInternalReplay(req)) {
    next();
    return;
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  if (body.object !== "page") {
    res.sendStatus(200);
    return;
  }

  try {
    const pageMerchantMap = readMetaPageMerchantMap();
    const entries = Array.isArray(body.entry) ? body.entry : [];
    const processedEventIds = new Set(terminalIds(res));
    let enqueued = 0;
    let deduplicated = 0;
    let ignored = 0;

    for (const entry of entries) {
      const entryRecord =
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? (entry as Record<string, unknown>)
          : {};
      const pageId = String(entryRecord.id || "").trim();
      const merchantId = pageMerchantMap.get(pageId);
      if (!merchantId) {
        throw Object.assign(new Error("Meta page merchant mapping is unavailable"), {
          code: "META_PAGE_MERCHANT_UNAVAILABLE",
        });
      }

      const messaging = Array.isArray(entryRecord.messaging)
        ? entryRecord.messaging
        : [];
      for (const event of messaging) {
        const eventId = getMetaWebhookEventId(pageId, event);
        processedEventIds.add(eventId);

        if (!replyEligible(event)) {
          ignored += 1;
          continue;
        }

        const result = enqueueDurableJob({
          type: "meta.webhook.reply",
          dedupeKey: eventId,
          merchantId,
          priority: 10,
          maxAttempts: 5,
          payload: {
            event_id: eventId,
            page_id: pageId,
            merchant_id: merchantId,
            external_message_id: eventExternalMessageId(event),
            sender_id: eventSenderId(event),
            webhook_body: {
              object: "page",
              entry: [
                {
                  ...entryRecord,
                  messaging: [event],
                },
              ],
            },
          },
        });
        if (result.deduplicated) deduplicated += 1;
        else enqueued += 1;
      }
    }

    markMetaWebhookEventsProcessed([...processedEventIds]);
    res.locals.metaWebhookEnqueuedJobs = enqueued;
    res.locals.metaWebhookDeduplicatedJobs = deduplicated;
    res.locals.metaWebhookIgnoredEvents = ignored;
    res.sendStatus(200);
  } catch (error) {
    console.error("Meta webhook durable enqueue failed:", error);
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      ok: false,
      code: "META_WEBHOOK_QUEUE_UNAVAILABLE",
      error: "Meta webhook queue is unavailable",
    });
  }
}
