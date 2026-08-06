import type { NextFunction, Request, Response } from "express";
import { getMetaWebhookEventId } from "./metaWebhookSecurity";
import { isTrustedMetaWebhookInternalReplay } from "../services/metaWebhookInternalReplay";
import { readMetaPageMerchantMap } from "../services/metaPageDirectory";
import { isConversationUnderManualControl } from "../services/manualConversationRuntime";

function eventRecord(event: unknown): Record<string, unknown> {
  return event && typeof event === "object" && !Array.isArray(event)
    ? (event as Record<string, unknown>)
    : {};
}

function senderId(event: unknown): string {
  const sender = eventRecord(event).sender;
  return sender && typeof sender === "object" && !Array.isArray(sender)
    ? String((sender as Record<string, unknown>).id || "").trim()
    : "";
}

function isCustomerMessage(event: unknown): boolean {
  const message = eventRecord(event).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const record = message as Record<string, unknown>;
  return record.is_echo !== true && Boolean(String(record.text || "").trim());
}

function existingTerminalEventIds(res: Response): string[] {
  return Array.isArray(res.locals.metaWebhookTerminalEventIds)
    ? res.locals.metaWebhookTerminalEventIds.map(String).filter(Boolean)
    : [];
}

export function enforceManualConversationWebhookAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== "POST" || req.path !== "/api/meta/webhook") {
    next();
    return;
  }

  const body =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
  if (body.object !== "page") {
    next();
    return;
  }

  try {
    const pageMerchantMap = readMetaPageMerchantMap();
    const terminalEventIds = new Set(existingTerminalEventIds(res));
    const filteredEntries: Record<string, unknown>[] = [];
    const internalReplay = isTrustedMetaWebhookInternalReplay(req);

    for (const entryValue of Array.isArray(body.entry) ? body.entry : []) {
      const entry = eventRecord(entryValue);
      const pageId = String(entry.id || "").trim();
      const merchantId = pageMerchantMap.get(pageId);
      if (!merchantId) {
        filteredEntries.push(entry);
        continue;
      }

      const filteredMessaging: unknown[] = [];
      for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {
        const customerId = senderId(event);
        if (!customerId || !isCustomerMessage(event)) {
          filteredMessaging.push(event);
          continue;
        }

        const conversationId = `messenger-${customerId}`;
        if (!isConversationUnderManualControl(merchantId, conversationId)) {
          filteredMessaging.push(event);
          continue;
        }

        const eventId = getMetaWebhookEventId(pageId, event);
        if (internalReplay) {
          res.setHeader("Cache-Control", "no-store");
          res.status(409).json({
            ok: false,
            code: "CONVERSATION_MANUAL_TAKEOVER",
            error: "conversation is currently controlled by the merchant",
            conversation_id: conversationId,
            event_id: eventId,
          });
          return;
        }

        terminalEventIds.add(eventId);
        console.info("Meta customer message suppressed during manual takeover", {
          page_id: pageId,
          merchant_id: merchantId,
          conversation_id: conversationId,
          event_id: eventId,
        });
      }

      filteredEntries.push({ ...entry, messaging: filteredMessaging });
    }

    req.body = { ...body, entry: filteredEntries };
    res.locals.metaWebhookTerminalEventIds = [...terminalEventIds];
    next();
  } catch (error) {
    console.error("Manual conversation webhook enforcement failed:", error);
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      ok: false,
      code: "MANUAL_CONVERSATION_STATE_UNAVAILABLE",
      error: "manual conversation state is unavailable",
    });
  }
}
