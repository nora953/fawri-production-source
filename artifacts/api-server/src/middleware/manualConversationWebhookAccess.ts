import type { NextFunction, Request, Response } from "express";
import { getMetaWebhookEventId } from "./metaWebhookSecurity";
import { isTrustedMetaWebhookInternalReplay } from "../services/metaWebhookInternalReplay";
import {
  readMetaPageMerchantMapAuthoritative,
} from "../services/metaPageDirectory";
import {
  isConversationUnderManualControlAuthoritative,
  recordManualInboundMessageAuthoritative,
} from "../services/postgresManualConversationAuthority";
import { notifyMerchantNewCustomerMessage } from "../routes/auth";

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

function customerMessage(event: unknown): {
  text: string;
  externalMessageId: string;
  createdAt?: unknown;
} | null {
  const record = eventRecord(event);
  const message = record.message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  const messageRecord = message as Record<string, unknown>;
  const messageText = String(messageRecord.text || "").trim();
  if (messageRecord.is_echo === true || !messageText) return null;
  return {
    text: messageText,
    externalMessageId: String(messageRecord.mid || "").trim(),
    createdAt: record.timestamp,
  };
}

function existingTerminalEventIds(res: Response): string[] {
  return Array.isArray(res.locals.metaWebhookTerminalEventIds)
    ? res.locals.metaWebhookTerminalEventIds.map(String).filter(Boolean)
    : [];
}

export async function enforceManualConversationWebhookAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
    const pageMerchantMap = await readMetaPageMerchantMapAuthoritative();
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
        const message = customerMessage(event);
        if (!customerId || !message) {
          filteredMessaging.push(event);
          continue;
        }

        const conversationId = `messenger-${customerId}`;
        if (
          !(await isConversationUnderManualControlAuthoritative(
            merchantId,
            conversationId,
          ))
        ) {
          filteredMessaging.push(event);
          continue;
        }

        const eventId = getMetaWebhookEventId(pageId, event);
        await recordManualInboundMessageAuthoritative({
          merchantId,
          conversationId,
          externalMessageId: message.externalMessageId || eventId,
          messageText: message.text,
          createdAt: message.createdAt,
        });
        notifyMerchantNewCustomerMessage({
          merchantId,
          conversationId,
          sourceEventId: eventId,
          createdAt: message.createdAt,
        });

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
        console.info("Meta customer message persisted during manual takeover", {
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
