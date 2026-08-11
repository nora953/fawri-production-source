import type { NextFunction, Request, Response } from "express";
import {
  getMetaWebhookEventId,
  markMetaWebhookEventsProcessed,
} from "./metaWebhookSecurity";
import { enqueueDurableJob } from "../services/durableJobQueue";
import { enqueueDurableJobAuthoritative } from "../services/postgresDurableJobQueue";
import { isTrustedMetaWebhookInternalReplay } from "../services/metaWebhookInternalReplay";
import {
  readMetaPageMerchantMapAuthoritative,
} from "../services/metaPageDirectory";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function replyEligible(event: unknown): boolean {
  const eventRecord = record(event);
  const message = record(eventRecord.message);
  const sender = record(eventRecord.sender);
  return Boolean(
    message.is_echo !== true &&
      String(message.text || "").trim() &&
      String(sender.id || "").trim(),
  );
}

function externalMessageId(event: unknown): string {
  return String(record(record(event).message).mid || "").trim();
}

function senderId(event: unknown): string {
  return String(record(record(event).sender).id || "").trim();
}

function terminalIds(res: Response): string[] {
  return Array.isArray(res.locals.metaWebhookTerminalEventIds)
    ? res.locals.metaWebhookTerminalEventIds.map(String).filter(Boolean)
    : [];
}

export async function enqueueMetaWebhookEvents(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.method !== "POST" || req.path !== "/api/meta/webhook") {
    next();
    return;
  }
  if (isTrustedMetaWebhookInternalReplay(req)) {
    next();
    return;
  }

  const body = record(req.body);
  if (body.object !== "page") {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({
      ok: false,
      code: "META_WEBHOOK_OBJECT_UNSUPPORTED",
      error: "unsupported Meta webhook object",
    });
    return;
  }

  try {
    const pageMerchantMap = await readMetaPageMerchantMapAuthoritative();
    const processed = new Set<string>();
    let enqueued = 0;
    let deduplicated = Number(res.locals.metaWebhookDuplicateEvents || 0);

    for (const entryValue of Array.isArray(body.entry) ? body.entry : []) {
      const entry = record(entryValue);
      const pageId = String(entry.id || "").trim();
      const merchantId = pageMerchantMap.get(pageId);
      if (!merchantId) {
        const error = new Error("Meta page merchant mapping is unavailable");
        (error as NodeJS.ErrnoException).code = "META_PAGE_DIRECTORY_UNAVAILABLE";
        throw error;
      }

      for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {
        const eventId = getMetaWebhookEventId(pageId, event);
        processed.add(eventId);
        const isReply = replyEligible(event);
        const input = {
          type: isReply ? "meta.webhook.reply" : "meta.webhook.event",
          dedupeKey: eventId,
          merchantId,
          priority: isReply ? 10 : 0,
          maxAttempts: 5,
          payload: isReply
            ? {
                event_id: eventId,
                page_id: pageId,
                merchant_id: merchantId,
                external_message_id: externalMessageId(event),
                sender_id: senderId(event),
                webhook_body: {
                  object: "page",
                  entry: [{ ...entry, messaging: [event] }],
                },
              }
            : {
                event_id: eventId,
                page_id: pageId,
                merchant_id: merchantId,
                event_kind: "non_reply",
              },
        };
        const result = operationalPostgresAuthorityRequired()
          ? await enqueueDurableJobAuthoritative(input)
          : enqueueDurableJob(input);
        result.deduplicated ? (deduplicated += 1) : (enqueued += 1);
      }
    }

    for (const eventId of terminalIds(res)) {
      processed.add(eventId);
      if (!operationalPostgresAuthorityRequired()) {
        const result = enqueueDurableJob({
          type: "meta.webhook.terminal",
          dedupeKey: eventId,
          payload: { event_id: eventId, event_kind: "terminal" },
          priority: 20,
          maxAttempts: 1,
        });
        result.deduplicated ? (deduplicated += 1) : (enqueued += 1);
      }
    }

    if (processed.size === 0 && deduplicated === 0) {
      res.setHeader("Cache-Control", "no-store");
      res.status(400).json({
        ok: false,
        code: "META_WEBHOOK_EVENT_REQUIRED",
        error: "Meta webhook contains no processable event",
      });
      return;
    }

    markMetaWebhookEventsProcessed([...processed]);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      ok: true,
      enqueued,
      deduplicated,
      accepted: processed.size,
    });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      ok: false,
      code: "META_WEBHOOK_QUEUE_UNAVAILABLE",
      error: "Meta webhook queue is unavailable",
    });
  }
}
