import crypto from "node:crypto";
import type { DurableJob } from "./durableJobQueue";
import { getKnowledgeDecisionEngine } from "./ai/knowledgeDecisionEngine";
import {
  withMerchantOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";
import type { KnowledgeConversationMessage } from "./knowledge/types";
import { notifyMerchantNewCustomerMessagePostgres } from "./postgresOperationalNotificationAuthority";

export type PreparedPostgresMetaAutoReply =
  | {
      action: "suppress";
      eventId: string;
      merchantId: string;
      conversationId: string;
      code: string;
    }
  | {
      action: "send";
      eventId: string;
      merchantId: string;
      conversationId: string;
      inboundEventId: string;
      replyIntentId: string;
      replyMessageId: string;
      pageId: string;
      recipientId: string;
      messageText: string;
      handoffAfterReply: boolean;
      sourceConversationGeneration: number | null;
    };

type ParsedMetaJob = {
  eventId: string;
  merchantId: string;
  pageId: string;
  senderId: string;
  externalMessageId: string;
  customerText: string;
  webhookBody: Record<string, unknown>;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  status: "auto_replying" | "needs_reply" | "manual" | "closed";
  assigned_to_human: boolean;
  metadata: Record<string, unknown> | null;
};

type ReplyMessageRow = {
  id: string;
  text: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

type CustomerMessageRow = {
  id: string;
  conversation_id: string;
  text: string;
  metadata: Record<string, unknown> | null;
};

type ConversationContextRow = {
  sender: "customer" | "fawri" | "merchant";
  text: string;
  created_at: Date | string;
  metadata: Record<string, unknown> | null;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function eventRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function eventTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : new Date().toISOString();
}

function parseJob(job: DurableJob): ParsedMetaJob {
  const payload = job.payload || {};
  const eventId = text(payload.event_id || job.dedupe_key);
  const merchantId = text(payload.merchant_id || job.merchant_id);
  const pageId = text(payload.page_id);
  const senderId = text(payload.sender_id);
  const externalMessageId = text(payload.external_message_id);
  const webhookBody = eventRecord(payload.webhook_body);
  const entries = Array.isArray(webhookBody.entry) ? webhookBody.entry : [];
  const entry = eventRecord(entries[0]);
  const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
  const event = eventRecord(messaging[0]);
  const sender = eventRecord(event.sender);
  const message = eventRecord(event.message);
  const customerText = text(message.text);
  const bodyPageId = text(entry.id);
  const bodySenderId = text(sender.id);
  const bodyMessageId = text(message.mid);

  if (
    !eventId ||
    !merchantId ||
    !pageId ||
    !senderId ||
    !externalMessageId ||
    !customerText ||
    customerText.length > 2_000 ||
    (bodyPageId && bodyPageId !== pageId) ||
    (bodySenderId && bodySenderId !== senderId) ||
    (bodyMessageId && bodyMessageId !== externalMessageId)
  ) {
    throw Object.assign(new Error("Meta reply job payload is invalid"), {
      code: "META_JOB_PAYLOAD_INVALID",
    });
  }

  return {
    eventId,
    merchantId,
    pageId,
    senderId,
    externalMessageId,
    customerText,
    webhookBody,
    createdAt: eventTimestamp(event.timestamp),
  };
}

function conversationId(senderId: string): string {
  return `messenger-${senderId}`;
}

function inboundEventId(eventId: string): string {
  return `channel-inbound-${digest(eventId).slice(0, 40)}`;
}

function replyIntentId(eventId: string): string {
  return `auto:${eventId}`;
}

function replyEventId(eventId: string): string {
  return `reply:${eventId}`;
}

function replyMessageId(eventId: string): string {
  return `msg-fawri-auto-${digest(eventId).slice(0, 40)}`;
}

function customerMessageId(eventId: string): string {
  return `msg-customer-${digest(eventId).slice(0, 40)}`;
}

const CONVERSATION_GENERATION_METADATA_KEY = "customer_message_generation";
const MESSAGE_GENERATION_METADATA_KEY = "conversation_generation";

function generationFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = Number(metadata?.[key]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function conversationGeneration(conversation: ConversationRow): number {
  return generationFromMetadata(
    conversation.metadata,
    CONVERSATION_GENERATION_METADATA_KEY,
  ) ?? 0;
}

function customerMessageGeneration(message: CustomerMessageRow | undefined): number | null {
  return generationFromMetadata(message?.metadata, MESSAGE_GENERATION_METADATA_KEY);
}

async function findReplyMessage(
  client: OperationalSqlClient,
  merchantId: string,
  eventId: string,
): Promise<ReplyMessageRow | null> {
  const result = await client.query<ReplyMessageRow>(
    `SELECT id, text, status::text AS status, metadata
       FROM messages
      WHERE merchant_id = $1 AND external_event_id = $2
      LIMIT 1`,
    [merchantId, replyEventId(eventId)],
  );
  return result.rows[0] || null;
}

async function ensureInboundState(
  parsed: ParsedMetaJob,
  job: DurableJob,
): Promise<{
  conversation: ConversationRow;
  conversationId: string;
  inboundEventId: string;
  customerInserted: boolean;
  existingReply: ReplyMessageRow | null;
  sourceConversationGeneration: number | null;
}> {
  return withMerchantOperationalTransaction(parsed.merchantId, async (client) => {
    const channelResult = await client.query<{ id: string }>(
      `SELECT id
         FROM merchant_channels
        WHERE merchant_id = $1
          AND platform = 'messenger'
          AND page_id = $2
          AND status = 'connected'
        LIMIT 2`,
      [parsed.merchantId, parsed.pageId],
    );
    if (channelResult.rows.length !== 1) {
      throw Object.assign(new Error("Meta Messenger channel is unavailable"), {
        code: "META_CHANNEL_UNAVAILABLE",
      });
    }
    const channelId = channelResult.rows[0].id;
    const inboundId = inboundEventId(parsed.eventId);
    const payloadHash = digest(stableJson(parsed.webhookBody));

    await client.query(
      `INSERT INTO channel_inbound_events
        (id, merchant_id, channel_id, provider, external_event_id,
         payload_hash, enqueue_job_id, received_at, enqueue_committed_at)
       VALUES ($1, $2, $3, 'messenger', $4, $5, $6, $7::timestamptz, now())
       ON CONFLICT (provider, external_event_id) DO NOTHING`,
      [
        inboundId,
        parsed.merchantId,
        channelId,
        parsed.eventId,
        payloadHash,
        job.id,
        parsed.createdAt,
      ],
    );
    const inbound = await client.query<{
      id: string;
      merchant_id: string;
      channel_id: string;
      payload_hash: string;
    }>(
      `SELECT id, merchant_id, channel_id, payload_hash
         FROM channel_inbound_events
        WHERE merchant_id = $1 AND provider = 'messenger'
          AND external_event_id = $2
        LIMIT 1`,
      [parsed.merchantId, parsed.eventId],
    );
    const inboundRow = inbound.rows[0];
    if (
      !inboundRow ||
      inboundRow.channel_id !== channelId ||
      inboundRow.payload_hash !== payloadHash
    ) {
      throw Object.assign(new Error("Meta event identity collision detected"), {
        code: "META_EVENT_IDENTITY_COLLISION",
      });
    }

    const existingConversation = await client.query<ConversationRow>(
      `SELECT id, status::text AS status, assigned_to_human, metadata
         FROM conversations
        WHERE merchant_id = $1 AND channel_id = $2 AND customer_external_id = $3
        LIMIT 1
        FOR UPDATE`,
      [parsed.merchantId, channelId, parsed.senderId],
    );
    let conversation = existingConversation.rows[0];
    if (!conversation) {
      const id = conversationId(parsed.senderId);
      const inserted = await client.query<ConversationRow>(
        `INSERT INTO conversations
          (id, merchant_id, channel_id, external_conversation_id,
           customer_external_id, customer_handle, status, assigned_to_human,
           needs_training, last_message_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4, $4, 'auto_replying', FALSE, FALSE,
                 $5::timestamptz, $5::timestamptz, $5::timestamptz)
         ON CONFLICT (merchant_id, channel_id, customer_external_id)
         DO UPDATE SET
           last_message_at = GREATEST(COALESCE(conversations.last_message_at, EXCLUDED.last_message_at), EXCLUDED.last_message_at),
           updated_at = GREATEST(conversations.updated_at, EXCLUDED.updated_at)
         RETURNING id, status::text AS status, assigned_to_human, metadata`,
        [id, parsed.merchantId, channelId, parsed.senderId, parsed.createdAt],
      );
      conversation = inserted.rows[0];
    }
    if (!conversation) {
      throw Object.assign(new Error("Meta conversation is unavailable"), {
        code: "META_CONVERSATION_UNAVAILABLE",
      });
    }

    if (conversation.status === "closed") {
      const reopened = await client.query<ConversationRow>(
        `UPDATE conversations
            SET status = 'auto_replying', assigned_to_human = FALSE,
                closed_at = NULL, updated_at = now()
          WHERE merchant_id = $1 AND id = $2
          RETURNING id, status::text AS status, assigned_to_human, metadata`,
        [parsed.merchantId, conversation.id],
      );
      conversation = reopened.rows[0] || conversation;
    }

    const existingCustomer = await client.query<CustomerMessageRow>(
      `SELECT id, conversation_id, text, metadata
         FROM messages
        WHERE merchant_id = $1 AND external_message_id = $2
        LIMIT 1`,
      [parsed.merchantId, parsed.externalMessageId],
    );
    let customerInserted = false;
    let sourceConversationGeneration = customerMessageGeneration(
      existingCustomer.rows[0],
    );
    if (!existingCustomer.rows[0]) {
      const nextGeneration = conversationGeneration(conversation) + 1;
      const inserted = await client.query<CustomerMessageRow>(
        `INSERT INTO messages
          (id, merchant_id, conversation_id, external_message_id,
           external_event_id, sender, text, status, counted_as_auto_reply,
           metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, 'customer', $6, 'received', FALSE,
                 $7::jsonb, $8::timestamptz)
         ON CONFLICT DO NOTHING
         RETURNING id, conversation_id, text, metadata`,
        [
          customerMessageId(parsed.eventId),
          parsed.merchantId,
          conversation.id,
          parsed.externalMessageId,
          parsed.eventId,
          parsed.customerText,
          JSON.stringify({ [MESSAGE_GENERATION_METADATA_KEY]: nextGeneration }),
          parsed.createdAt,
        ],
      );
      customerInserted = inserted.rows.length === 1;
      if (customerInserted) {
        sourceConversationGeneration = nextGeneration;
        const updatedConversation = await client.query<ConversationRow>(
          `UPDATE conversations
              SET metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{customer_message_generation}',
                    to_jsonb($3::bigint),
                    TRUE
                  ),
                  last_message_at = GREATEST(
                    COALESCE(last_message_at, $4::timestamptz),
                    $4::timestamptz
                  ),
                  updated_at = GREATEST(updated_at, now())
            WHERE merchant_id = $1 AND id = $2
            RETURNING id, status::text AS status, assigned_to_human, metadata`,
          [
            parsed.merchantId,
            conversation.id,
            nextGeneration,
            parsed.createdAt,
          ],
        );
        conversation = updatedConversation.rows[0] || conversation;
      } else {
        const collided = await client.query<CustomerMessageRow>(
          `SELECT id, conversation_id, text, metadata
             FROM messages
            WHERE merchant_id = $1 AND external_message_id = $2
            LIMIT 1`,
          [parsed.merchantId, parsed.externalMessageId],
        );
        const row = collided.rows[0];
        if (
          !row ||
          row.conversation_id !== conversation.id ||
          row.text !== parsed.customerText
        ) {
          throw Object.assign(new Error("Meta message identity collision detected"), {
            code: "META_MESSAGE_IDENTITY_COLLISION",
          });
        }
        sourceConversationGeneration = customerMessageGeneration(row);
      }
    } else if (
      existingCustomer.rows[0].conversation_id !== conversation.id ||
      existingCustomer.rows[0].text !== parsed.customerText
    ) {
      throw Object.assign(new Error("Meta message identity collision detected"), {
        code: "META_MESSAGE_IDENTITY_COLLISION",
      });
    } else {
      await client.query(
        `UPDATE conversations
            SET last_message_at = GREATEST(
                  COALESCE(last_message_at, $3::timestamptz),
                  $3::timestamptz
                ),
                updated_at = GREATEST(updated_at, $3::timestamptz)
          WHERE merchant_id = $1 AND id = $2`,
        [parsed.merchantId, conversation.id, parsed.createdAt],
      );
    }

    return {
      conversation,
      conversationId: conversation.id,
      inboundEventId: inboundRow.id,
      customerInserted,
      existingReply: await findReplyMessage(client, parsed.merchantId, parsed.eventId),
      sourceConversationGeneration,
    };
  });
}

async function loadRecentConversationContext(
  merchantId: string,
  conversationIdValue: string,
  currentCustomerMessageId: string,
): Promise<KnowledgeConversationMessage[]> {
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<ConversationContextRow>(
      `SELECT sender::text AS sender, text, created_at, metadata
         FROM messages
        WHERE merchant_id = $1
          AND conversation_id = $2
          AND id <> $3
          AND sender IN ('customer', 'fawri', 'merchant')
          AND status IN ('received', 'sent')
        ORDER BY created_at DESC, id DESC
        LIMIT 8`,
      [merchantId, conversationIdValue, currentCustomerMessageId],
    );

    return result.rows.reverse().map((row) => {
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? row.metadata
          : {};
      const matchedRecordId = text(metadata.matched_record_id);
      const reasonCode = text(metadata.reason_code);
      const createdAt = new Date(row.created_at).toISOString();
      return {
        sender: row.sender,
        text: text(row.text),
        createdAt,
        ...(matchedRecordId ? { matchedRecordId } : {}),
        ...(reasonCode ? { reasonCode } : {}),
      };
    });
  });
}

function existingSendIntent(
  parsed: ParsedMetaJob,
  inboundId: string,
  conversationIdValue: string,
  existing: ReplyMessageRow,
  sourceConversationGeneration: number | null,
): PreparedPostgresMetaAutoReply {
  return {
    action: "send",
    eventId: parsed.eventId,
    merchantId: parsed.merchantId,
    conversationId: conversationIdValue,
    inboundEventId: inboundId,
    replyIntentId: replyIntentId(parsed.eventId),
    replyMessageId: existing.id,
    pageId: parsed.pageId,
    recipientId: parsed.senderId,
    messageText: existing.text,
    handoffAfterReply: existing.metadata?.handoff_after_reply === true,
    sourceConversationGeneration:
      generationFromMetadata(existing.metadata, "source_conversation_generation") ??
      sourceConversationGeneration,
  };
}

export async function preparePostgresMetaAutoReply(
  job: DurableJob,
  options: {
    hooks?: {
      afterDecision?: (input: {
        merchantId: string;
        conversationId: string;
        eventId: string;
        sourceConversationGeneration: number | null;
      }) => void | Promise<void>;
    };
  } = {},
): Promise<PreparedPostgresMetaAutoReply> {
  const parsed = parseJob(job);
  const inbound = await ensureInboundState(parsed, job);

  if (inbound.customerInserted) {
    try {
      await notifyMerchantNewCustomerMessagePostgres({
        merchantId: parsed.merchantId,
        conversationId: inbound.conversationId,
        sourceEventId: parsed.eventId,
        createdAt: parsed.createdAt,
      });
    } catch {
      console.error("Meta customer message notification failed", {
        code: "OPERATIONAL_NOTIFICATION_UNAVAILABLE",
        merchant_id: parsed.merchantId,
        conversation_id: inbound.conversationId,
      });
    }
  }

  if (inbound.existingReply) {
    return existingSendIntent(
      parsed,
      inbound.inboundEventId,
      inbound.conversationId,
      inbound.existingReply,
      inbound.sourceConversationGeneration,
    );
  }

  if (
    inbound.conversation.status === "manual" ||
    inbound.conversation.status === "needs_reply" ||
    inbound.conversation.assigned_to_human
  ) {
    return {
      action: "suppress",
      eventId: parsed.eventId,
      merchantId: parsed.merchantId,
      conversationId: inbound.conversationId,
      code:
        inbound.conversation.status === "manual" || inbound.conversation.assigned_to_human
          ? "CONVERSATION_MANUAL_TAKEOVER"
          : "CONVERSATION_NEEDS_REPLY",
    };
  }

  const recentMessages = await loadRecentConversationContext(
    parsed.merchantId,
    inbound.conversationId,
    customerMessageId(parsed.eventId),
  );

  let decision;
  try {
    decision = await getKnowledgeDecisionEngine().decide({
      merchantId: parsed.merchantId,
      customerText: parsed.customerText,
      requestId: parsed.eventId,
      conversationId: inbound.conversationId,
      customerExternalId: parsed.senderId,
      recentMessages,
    });
  } catch {
    throw Object.assign(new Error("Knowledge reply decision is unavailable"), {
      code: "META_REPLY_DECISION_UNAVAILABLE",
    });
  }

  await options.hooks?.afterDecision?.({
    merchantId: parsed.merchantId,
    conversationId: inbound.conversationId,
    eventId: parsed.eventId,
    sourceConversationGeneration: inbound.sourceConversationGeneration,
  });

  const answerText = text(decision.answerText);
  if (decision.action === "no_answer" || !answerText) {
    const stillCurrent = await withMerchantOperationalTransaction(
      parsed.merchantId,
      async (client) => {
        const currentConversation = await client.query<ConversationRow>(
          `SELECT id, status::text AS status, assigned_to_human, metadata
             FROM conversations
            WHERE merchant_id = $1 AND id = $2
            FOR UPDATE`,
          [parsed.merchantId, inbound.conversationId],
        );
        const current = currentConversation.rows[0];
        if (
          !current ||
          inbound.sourceConversationGeneration === null ||
          conversationGeneration(current) !== inbound.sourceConversationGeneration
        ) {
          return false;
        }
        await client.query(
          `UPDATE conversations
              SET status = 'needs_reply', assigned_to_human = FALSE,
                  needs_training = TRUE, updated_at = now()
            WHERE merchant_id = $1 AND id = $2 AND status = 'auto_replying'`,
          [parsed.merchantId, inbound.conversationId],
        );
        return true;
      },
    );
    return {
      action: "suppress",
      eventId: parsed.eventId,
      merchantId: parsed.merchantId,
      conversationId: inbound.conversationId,
      code: stillCurrent
        ? text(decision.reasonCode) || "KNOWLEDGE_NO_ANSWER"
        : "CONVERSATION_SUPERSEDED",
    };
  }

  const handoff = decision.action === "handoff";
  const replyType = decision.stage === "ai_fallback"
    ? "ai"
    : handoff || decision.stage === "clarification"
      ? "fallback"
      : "database";

  return withMerchantOperationalTransaction(parsed.merchantId, async (client) => {
    const currentConversation = await client.query<ConversationRow>(
      `SELECT id, status::text AS status, assigned_to_human, metadata
         FROM conversations
        WHERE merchant_id = $1 AND id = $2
        FOR UPDATE`,
      [parsed.merchantId, inbound.conversationId],
    );
    const current = currentConversation.rows[0];
    const existing = await findReplyMessage(client, parsed.merchantId, parsed.eventId);
    if (existing) {
      return existingSendIntent(
        parsed,
        inbound.inboundEventId,
        inbound.conversationId,
        existing,
        inbound.sourceConversationGeneration,
      );
    }
    if (
      !current ||
      current.status === "manual" ||
      current.status === "needs_reply" ||
      current.assigned_to_human
    ) {
      return {
        action: "suppress" as const,
        eventId: parsed.eventId,
        merchantId: parsed.merchantId,
        conversationId: inbound.conversationId,
        code: "CONVERSATION_MANUAL_TAKEOVER",
      };
    }
    if (
      inbound.sourceConversationGeneration === null ||
      conversationGeneration(current) !== inbound.sourceConversationGeneration
    ) {
      return {
        action: "suppress" as const,
        eventId: parsed.eventId,
        merchantId: parsed.merchantId,
        conversationId: inbound.conversationId,
        code: "CONVERSATION_SUPERSEDED",
      };
    }

    const messageId = replyMessageId(parsed.eventId);
    await client.query(
      `INSERT INTO messages
        (id, merchant_id, conversation_id, external_event_id,
         sender, text, status, reply_type, counted_as_auto_reply, metadata)
       VALUES ($1, $2, $3, $4, 'fawri', $5, 'queued', $6::reply_type,
               FALSE, $7::jsonb)
       ON CONFLICT DO NOTHING`,
      [
        messageId,
        parsed.merchantId,
        inbound.conversationId,
        replyEventId(parsed.eventId),
        answerText,
        replyType,
        JSON.stringify({
          knowledge_stage: decision.stage,
          knowledge_source: decision.source,
          reason_code: decision.reasonCode,
          confidence: decision.confidence,
          matched_record_id: decision.matchedRecordId,
          grounding_record_ids: decision.groundingRecordIds || [],
          training_request_id: decision.trainingRequestId,
          handoff_after_reply: handoff,
          source_conversation_generation: inbound.sourceConversationGeneration,
        }),
      ],
    );

    if (handoff) {
      await client.query(
        `UPDATE conversations
            SET status = 'manual', assigned_to_human = TRUE,
                needs_training = TRUE, updated_at = now()
          WHERE merchant_id = $1 AND id = $2`,
        [parsed.merchantId, inbound.conversationId],
      );
    }

    const persisted = await findReplyMessage(client, parsed.merchantId, parsed.eventId);
    if (!persisted || persisted.text !== answerText) {
      throw Object.assign(new Error("Meta reply intent could not be persisted"), {
        code: "META_REPLY_INTENT_PERSIST_FAILED",
      });
    }
    return existingSendIntent(
      parsed,
      inbound.inboundEventId,
      inbound.conversationId,
      persisted,
      inbound.sourceConversationGeneration,
    );
  });
}

export async function suppressPreparedPostgresMetaAutoReply(input: {
  merchantId: string;
  replyMessageId: string;
  conversationId: string;
}): Promise<void> {
  await withMerchantOperationalTransaction(input.merchantId, async (client) => {
    await client.query(
      `DELETE FROM messages
        WHERE merchant_id = $1 AND id = $2 AND conversation_id = $3
          AND sender = 'fawri' AND status = 'queued'
          AND external_message_id IS NULL`,
      [input.merchantId, input.replyMessageId, input.conversationId],
    );
  });
}
