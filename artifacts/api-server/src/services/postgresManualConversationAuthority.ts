import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  withMerchantOperationalTransaction,
  withOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";
import {
  getServerConversation,
  listServerConversations,
  ManualConversationError,
  type PreparedManualReply,
  type RuntimeConversation,
  type RuntimeMessage,
} from "./manualConversationRuntime";
import { readMetaChannelCredentialAuthoritative } from "./postgresMetaChannelAuthority";
import { learnFromMerchantManualReply } from "./merchantManualKnowledgeLearning";

function text(value: unknown): string {
  return String(value || "").trim();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function messageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
}

function timestamp(value: unknown): string {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
}

type ConversationRow = {
  id: string;
  merchant_id: string;
  channel_id: string;
  platform: string;
  page_id: string | null;
  customer_external_id: string;
  customer_name: string | null;
  customer_handle: string | null;
  status: string;
  assigned_to_human: boolean;
  needs_training: boolean;
  updated_at: Date | string;
};

type MessageRow = {
  id: string;
  external_message_id: string | null;
  conversation_id: string;
  sender: "customer" | "fawri" | "merchant" | "system";
  text: string;
  created_at: Date | string;
  counted_as_auto_reply: boolean;
  reply_type: "ai" | "database" | "fallback" | "manual" | "system" | null;
  status: "received" | "queued" | "sent" | "failed";
};

function mapMessage(row: MessageRow): RuntimeMessage {
  return {
    id: row.id,
    ...(row.external_message_id
      ? { external_message_id: row.external_message_id }
      : {}),
    conversation_id: row.conversation_id,
    sender: row.sender === "system" ? "fawri" : row.sender,
    text: row.text,
    created_at: timestamp(row.created_at),
    counted_as_auto_reply: row.counted_as_auto_reply,
    ...(row.reply_type && row.reply_type !== "system"
      ? { reply_type: row.reply_type }
      : {}),
    ...(row.status === "received" || row.status === "sent" || row.status === "failed"
      ? { status: row.status }
      : {}),
  };
}

async function loadConversationRows(
  client: OperationalSqlClient,
  merchantId: string,
  conversationId?: string,
): Promise<Array<{ conversation: ConversationRow; messages: RuntimeMessage[] }>> {
  const conversationResult = await client.query<ConversationRow>(
    `SELECT c.id, c.merchant_id, c.channel_id,
            ch.platform::text AS platform, ch.page_id,
            c.customer_external_id, c.customer_name, c.customer_handle,
            c.status::text AS status, c.assigned_to_human, c.needs_training,
            c.updated_at
       FROM conversations c
       JOIN merchant_channels ch
         ON ch.id = c.channel_id AND ch.merchant_id = c.merchant_id
      WHERE c.merchant_id = $1
        AND ($2::text IS NULL OR c.id = $2)
      ORDER BY c.updated_at DESC, c.id`,
    [merchantId, conversationId || null],
  );
  if (conversationId && conversationResult.rows.length === 0) {
    throw new ManualConversationError(
      "CONVERSATION_NOT_FOUND",
      "conversation was not found",
      404,
    );
  }
  const result: Array<{ conversation: ConversationRow; messages: RuntimeMessage[] }> = [];
  for (const conversation of conversationResult.rows) {
    if (conversation.merchant_id !== merchantId) {
      throw new ManualConversationError(
        "CONVERSATION_TENANT_VIOLATION",
        "conversation tenant boundary is invalid",
        503,
      );
    }
    const messageResult = await client.query<MessageRow>(
      `SELECT id, external_message_id, conversation_id, sender::text AS sender,
              text, created_at, counted_as_auto_reply,
              reply_type::text AS reply_type, status::text AS status
         FROM messages
        WHERE merchant_id = $1 AND conversation_id = $2
        ORDER BY created_at, id`,
      [merchantId, conversation.id],
    );
    result.push({
      conversation,
      messages: messageResult.rows.map(mapMessage),
    });
  }
  return result;
}

function mapConversation(input: {
  conversation: ConversationRow;
  messages: RuntimeMessage[];
}): RuntimeConversation {
  const row = input.conversation;
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    platform: row.platform,
    ...(row.page_id ? { page_id: row.page_id } : {}),
    customer_name: row.customer_name || "",
    customer_handle: row.customer_handle || row.customer_external_id,
    status: row.status,
    assigned_to_human: row.assigned_to_human,
    needs_training: row.needs_training,
    updated_at: timestamp(row.updated_at),
    messages: input.messages,
  };
}

export async function listServerConversationsAuthoritative(
  merchantId: string,
): Promise<RuntimeConversation[]> {
  if (!operationalPostgresAuthorityRequired()) {
    return listServerConversations(merchantId);
  }
  return withMerchantOperationalTransaction(merchantId, async (client) =>
    (await loadConversationRows(client, merchantId)).map(mapConversation),
  );
}

export async function getServerConversationAuthoritative(
  merchantId: string,
  conversationId: string,
): Promise<RuntimeConversation> {
  if (!operationalPostgresAuthorityRequired()) {
    return getServerConversation(merchantId, conversationId);
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const [loaded] = await loadConversationRows(client, merchantId, conversationId);
    if (!loaded) {
      throw new ManualConversationError(
        "CONVERSATION_NOT_FOUND",
        "conversation was not found",
        404,
      );
    }
    return mapConversation(loaded);
  });
}

async function updateConversationControl(
  merchantId: string,
  conversationId: string,
  manual: boolean,
): Promise<RuntimeConversation> {
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const unresolved = manual
      ? { rows: [] as Array<{ id: string }> }
      : await client.query<{ id: string }>(
          `SELECT id
             FROM manual_reply_requests
            WHERE merchant_id = $1 AND conversation_id = $2
              AND status IN ('pending', 'uncertain')
            LIMIT 1`,
          [merchantId, conversationId],
        );
    if (!manual && unresolved.rows.length > 0) {
      throw new ManualConversationError(
        "MANUAL_REPLY_RECONCILIATION_REQUIRED",
        "manual reply delivery must be reconciled before returning to Fawri",
      );
    }
    if (!manual) {
      const paymentConflict = await client.query<{ id: string }>(
        `SELECT id
           FROM orders
          WHERE merchant_id = $1 AND conversation_id = $2
            AND payment_reconciliation_status = 'reconciliation_required'
          LIMIT 1`,
        [merchantId, conversationId],
      );
      if (paymentConflict.rows.length > 0) {
        throw new ManualConversationError(
          "PAYMENT_RECONCILIATION_REQUIRED",
          "payment conflict must be resolved before returning the conversation to Fawri",
        );
      }
    }
    const updated = await client.query<{ id: string }>(
      `UPDATE conversations
          SET status = $3::conversation_status,
              assigned_to_human = $4,
              updated_at = now()
        WHERE merchant_id = $1 AND id = $2
        RETURNING id`,
      [merchantId, conversationId, manual ? "manual" : "auto_replying", manual],
    );
    if (updated.rows.length !== 1) {
      throw new ManualConversationError(
        "CONVERSATION_NOT_FOUND",
        "conversation was not found",
        404,
      );
    }
    const [loaded] = await loadConversationRows(client, merchantId, conversationId);
    return mapConversation(loaded!);
  });
}

export async function takeOverConversationAuthoritative(
  merchantId: string,
  conversationId: string,
): Promise<RuntimeConversation> {
  if (!operationalPostgresAuthorityRequired()) {
    const { takeOverConversation } = await import("./manualConversationRuntime");
    return takeOverConversation(merchantId, conversationId);
  }
  return updateConversationControl(merchantId, conversationId, true);
}

export async function returnConversationToFawriAuthoritative(
  merchantId: string,
  conversationId: string,
): Promise<RuntimeConversation> {
  if (!operationalPostgresAuthorityRequired()) {
    const { returnConversationToFawri } = await import("./manualConversationRuntime");
    return returnConversationToFawri(merchantId, conversationId);
  }
  return updateConversationControl(merchantId, conversationId, false);
}

export async function isConversationUnderManualControlAuthoritative(
  merchantId: string,
  conversationId: string,
): Promise<boolean> {
  if (!operationalPostgresAuthorityRequired()) {
    const { isConversationUnderManualControl } = await import("./manualConversationRuntime");
    return isConversationUnderManualControl(merchantId, conversationId);
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<{ status: string; assigned_to_human: boolean }>(
      `SELECT status::text AS status, assigned_to_human
         FROM conversations
        WHERE merchant_id = $1 AND id = $2
        LIMIT 1`,
      [merchantId, conversationId],
    );
    const row = result.rows[0];
    return Boolean(row && row.status === "manual" && row.assigned_to_human);
  });
}

export async function recordManualInboundMessageAuthoritative(input: {
  merchantId: string;
  conversationId: string;
  externalMessageId: string;
  messageText: string;
  createdAt?: unknown;
}): Promise<RuntimeMessage> {
  if (!operationalPostgresAuthorityRequired()) {
    const { recordManualInboundMessage } = await import("./manualConversationRuntime");
    return recordManualInboundMessage(input);
  }
  const merchantId = text(input.merchantId);
  const conversationId = text(input.conversationId);
  const externalMessageId = text(input.externalMessageId);
  const messageText = text(input.messageText);
  if (!externalMessageId || !messageText) {
    throw new ManualConversationError(
      "MANUAL_INBOUND_MESSAGE_INVALID",
      "manual inbound message identity and text are required",
      400,
    );
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const control = await client.query<{ status: string; assigned_to_human: boolean }>(
      `SELECT status::text AS status, assigned_to_human
         FROM conversations
        WHERE merchant_id = $1 AND id = $2
        LIMIT 1`,
      [merchantId, conversationId],
    );
    if (!control.rows[0] || control.rows[0].status !== "manual" || !control.rows[0].assigned_to_human) {
      throw new ManualConversationError(
        "MANUAL_TAKEOVER_REQUIRED",
        "conversation is not under manual control",
      );
    }
    const existing = await client.query<MessageRow>(
      `SELECT id, external_message_id, conversation_id, sender::text AS sender,
              text, created_at, counted_as_auto_reply,
              reply_type::text AS reply_type, status::text AS status
         FROM messages
        WHERE merchant_id = $1 AND external_message_id = $2
        LIMIT 1`,
      [merchantId, externalMessageId],
    );
    if (existing.rows[0]) return mapMessage(existing.rows[0]);
    const id = messageId("msg-customer-manual");
    const createdAt = timestamp(input.createdAt);
    const inserted = await client.query<MessageRow>(
      `INSERT INTO messages
        (id, merchant_id, conversation_id, external_message_id, sender, text,
         status, counted_as_auto_reply, created_at)
       VALUES ($1, $2, $3, $4, 'customer', $5, 'received', FALSE, $6::timestamptz)
       RETURNING id, external_message_id, conversation_id, sender::text AS sender,
                 text, created_at, counted_as_auto_reply,
                 reply_type::text AS reply_type, status::text AS status`,
      [id, merchantId, conversationId, externalMessageId, messageText, createdAt],
    );
    await client.query(
      `UPDATE conversations
          SET last_message_at = GREATEST(COALESCE(last_message_at, $3::timestamptz), $3::timestamptz),
              updated_at = GREATEST(updated_at, $3::timestamptz)
        WHERE merchant_id = $1 AND id = $2`,
      [merchantId, conversationId, createdAt],
    );
    return mapMessage(inserted.rows[0]!);
  });
}

export async function prepareManualReplyAuthoritative(input: {
  merchantId: string;
  conversationId: string;
  idempotencyKey: string;
  messageText: string;
}): Promise<PreparedManualReply> {
  if (!operationalPostgresAuthorityRequired()) {
    const { prepareManualReply } = await import("./manualConversationRuntime");
    return prepareManualReply(input);
  }
  const merchantId = text(input.merchantId);
  const conversationId = text(input.conversationId);
  const idempotencyKey = text(input.idempotencyKey);
  const messageText = text(input.messageText);
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    throw new ManualConversationError(
      "IDEMPOTENCY_KEY_INVALID",
      "a valid Idempotency-Key header is required",
      400,
    );
  }
  if (!messageText || messageText.length > 2000) {
    throw new ManualConversationError(
      "MANUAL_REPLY_TEXT_INVALID",
      "manual reply must contain 1 to 2000 characters",
      400,
    );
  }
  const prepared = await withMerchantOperationalTransaction(merchantId, async (client) => {
    const conversationResult = await client.query<{
      status: string;
      assigned_to_human: boolean;
      customer_external_id: string;
      customer_handle: string | null;
      page_id: string | null;
      platform: string;
    }>(
      `SELECT c.status::text AS status, c.assigned_to_human,
              c.customer_external_id, c.customer_handle,
              ch.page_id, ch.platform::text AS platform
         FROM conversations c
         JOIN merchant_channels ch
           ON ch.id = c.channel_id AND ch.merchant_id = c.merchant_id
        WHERE c.merchant_id = $1 AND c.id = $2
        LIMIT 1`,
      [merchantId, conversationId],
    );
    const conversation = conversationResult.rows[0];
    if (!conversation) {
      throw new ManualConversationError(
        "CONVERSATION_NOT_FOUND",
        "conversation was not found",
        404,
      );
    }
    if (conversation.status !== "manual" || !conversation.assigned_to_human) {
      throw new ManualConversationError(
        "MANUAL_TAKEOVER_REQUIRED",
        "conversation must be taken over before sending a manual reply",
      );
    }
    const hash = sha256(messageText);
    const existing = await client.query<{
      status: string;
      text_sha256: string;
      message_id: string | null;
    }>(
      `SELECT status::text AS status, text_sha256, message_id
         FROM manual_reply_requests
        WHERE merchant_id = $1 AND idempotency_key = $2
        LIMIT 1`,
      [merchantId, idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].text_sha256 !== hash) {
        throw new ManualConversationError(
          "IDEMPOTENCY_KEY_REUSED",
          "Idempotency-Key was already used with different content",
        );
      }
      if (existing.rows[0].status === "sent" && existing.rows[0].message_id) {
        const messageResult = await client.query<MessageRow>(
          `SELECT id, external_message_id, conversation_id, sender::text AS sender,
                  text, created_at, counted_as_auto_reply,
                  reply_type::text AS reply_type, status::text AS status
             FROM messages
            WHERE merchant_id = $1 AND id = $2
            LIMIT 1`,
          [merchantId, existing.rows[0].message_id],
        );
        if (messageResult.rows[0]) {
          return { deduplicated: true, existingMessage: mapMessage(messageResult.rows[0]) };
        }
      }
      if (existing.rows[0].status === "failed") {
        throw new ManualConversationError(
          "MANUAL_REPLY_REQUEST_FAILED",
          "this manual reply request already failed; use a new Idempotency-Key",
        );
      }
      throw new ManualConversationError(
        "MANUAL_REPLY_OUTCOME_UNCERTAIN",
        "manual reply delivery outcome is not safe to retry automatically",
      );
    }
    const pageId = text(conversation.page_id);
    if (!pageId) {
      throw new ManualConversationError(
        "CONVERSATION_CHANNEL_UNRESOLVED",
        "conversation has no connected Meta page",
      );
    }
    const requestId = `manual-${crypto.randomUUID()}`;
    await client.query(
      `INSERT INTO manual_reply_requests
        (id, merchant_id, conversation_id, idempotency_key, text_sha256, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [requestId, merchantId, conversationId, idempotencyKey, hash],
    );
    return {
      deduplicated: false,
      pageId,
      customerId: text(conversation.customer_handle || conversation.customer_external_id),
      platform: conversation.platform,
    } as PreparedManualReply & { platform: string };
  });
  if (prepared.deduplicated) return prepared;
  const extended = prepared as PreparedManualReply & { platform?: string };
  try {
    const pageAccessToken = await readMetaChannelCredentialAuthoritative({
      merchantId,
      platform: extended.platform === "instagram" ? "instagram" : "messenger",
      pageId: extended.pageId || "",
    });
    return { ...prepared, pageAccessToken };
  } catch {
    await failManualReplyAuthoritative({
      merchantId,
      conversationId,
      idempotencyKey,
      errorCode: "META_PAGE_TOKEN_UNAVAILABLE",
      uncertain: false,
    });
    throw new ManualConversationError(
      "META_PAGE_TOKEN_UNAVAILABLE",
      "Meta page access token is unavailable",
    );
  }
}

export async function completeManualReplyAuthoritative(input: {
  merchantId: string;
  conversationId: string;
  idempotencyKey: string;
  messageText: string;
  externalMessageId?: string;
}): Promise<RuntimeMessage> {
  if (!operationalPostgresAuthorityRequired()) {
    const { completeManualReply } = await import("./manualConversationRuntime");
    return completeManualReply(input);
  }
  const merchantId = text(input.merchantId);
  const conversationId = text(input.conversationId);
  const idempotencyKey = text(input.idempotencyKey);
  const messageText = text(input.messageText);

  const completed = await withMerchantOperationalTransaction(
    merchantId,
    async (client) => {
      const request = await client.query<{
        id: string;
        status: string;
        text_sha256: string;
      }>(
        `SELECT id, status::text AS status, text_sha256
           FROM manual_reply_requests
          WHERE merchant_id = $1 AND conversation_id = $2 AND idempotency_key = $3
          FOR UPDATE`,
        [merchantId, conversationId, idempotencyKey],
      );
      const row = request.rows[0];
      if (!row || row.status !== "pending" || row.text_sha256 !== sha256(messageText)) {
        throw new ManualConversationError(
          "MANUAL_REPLY_STATE_INVALID",
          "manual reply completion state is invalid",
          500,
        );
      }

      const handoffResult = await client.query<{
        id: string;
        created_at: Date | string;
        metadata: Record<string, unknown> | null;
      }>(
        `SELECT id, created_at, metadata
           FROM messages
          WHERE merchant_id = $1
            AND conversation_id = $2
            AND sender = 'fawri'
            AND status = 'sent'
            AND metadata->>'handoff_after_reply' = 'true'
          ORDER BY created_at DESC, id DESC
          LIMIT 1`,
        [merchantId, conversationId],
      );

      let trainingRequestId = "";
      const handoff = handoffResult.rows[0];
      if (handoff) {
        const metadata =
          handoff.metadata &&
          typeof handoff.metadata === "object" &&
          !Array.isArray(handoff.metadata)
            ? handoff.metadata
            : {};
        const candidateTrainingRequestId = text(metadata.training_request_id);
        if (candidateTrainingRequestId) {
          const laterCustomer = await client.query<{ id: string }>(
            `SELECT id
               FROM messages
              WHERE merchant_id = $1
                AND conversation_id = $2
                AND sender = 'customer'
                AND status = 'received'
                AND (
                  created_at > $3::timestamptz
                  OR (created_at = $3::timestamptz AND id > $4)
                )
              LIMIT 1`,
            [merchantId, conversationId, handoff.created_at, handoff.id],
          );
          if (laterCustomer.rows.length === 0) {
            trainingRequestId = candidateTrainingRequestId;
          }
        }
      }

      const id = messageId("msg-merchant");
      const externalMessageId = text(input.externalMessageId) || null;
      const message = await client.query<MessageRow>(
        `INSERT INTO messages
          (id, merchant_id, conversation_id, external_message_id, sender, text,
           status, reply_type, counted_as_auto_reply, sent_at)
         VALUES ($1, $2, $3, $4, 'merchant', $5, 'sent', 'manual', FALSE, now())
         RETURNING id, external_message_id, conversation_id, sender::text AS sender,
                   text, created_at, counted_as_auto_reply,
                   reply_type::text AS reply_type, status::text AS status`,
        [id, merchantId, conversationId, externalMessageId, messageText],
      );
      await client.query(
        `UPDATE manual_reply_requests
            SET status = 'sent', message_id = $4, external_message_id = $5, updated_at = now()
          WHERE id = $1 AND merchant_id = $2 AND conversation_id = $3`,
        [row.id, merchantId, conversationId, id, externalMessageId],
      );
      await client.query(
        `UPDATE conversations
            SET last_message_at = now(), updated_at = now()
          WHERE merchant_id = $1 AND id = $2`,
        [merchantId, conversationId],
      );
      return {
        message: mapMessage(message.rows[0]!),
        messageId: id,
        trainingRequestId,
      };
    },
  );

  if (completed.trainingRequestId) {
    try {
      const learning = await learnFromMerchantManualReply({
        merchantId,
        trainingRequestId: completed.trainingRequestId,
        merchantReply: messageText,
      });

      await withMerchantOperationalTransaction(merchantId, async (client) => {
        await client.query(
          `UPDATE messages
              SET metadata = metadata || $4::jsonb
            WHERE merchant_id = $1
              AND conversation_id = $2
              AND id = $3
              AND sender = 'merchant'`,
          [
            merchantId,
            conversationId,
            completed.messageId,
            JSON.stringify({
              manual_reply_learning: learning.reasonCode,
              learned_training_request_id: learning.learned
                ? learning.trainingRequestId
                : null,
              learned_answer_id: learning.learnedAnswerId || null,
            }),
          ],
        );
        if (learning.learned) {
          await client.query(
            `UPDATE conversations
                SET needs_training = FALSE, updated_at = now()
              WHERE merchant_id = $1 AND id = $2`,
            [merchantId, conversationId],
          );
        }
      });
    } catch {
      console.error("Merchant manual reply learning failed", {
        code: "MANUAL_REPLY_LEARNING_FAILED",
        merchant_id: merchantId,
        conversation_id: conversationId,
      });
    }
  }

  return completed.message;
}

export async function failManualReplyAuthoritative(input: {
  merchantId: string;
  conversationId: string;
  idempotencyKey: string;
  errorCode: string;
  uncertain: boolean;
}): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) {
    const { failManualReply } = await import("./manualConversationRuntime");
    failManualReply(input);
    return;
  }
  const merchantId = text(input.merchantId);
  await withMerchantOperationalTransaction(merchantId, async (client) => {
    await client.query(
      `UPDATE manual_reply_requests
          SET status = $4::manual_reply_request_status,
              error_code = $5,
              updated_at = now()
        WHERE merchant_id = $1 AND conversation_id = $2
          AND idempotency_key = $3 AND status = 'pending'`,
      [
        merchantId,
        text(input.conversationId),
        text(input.idempotencyKey),
        input.uncertain ? "uncertain" : "failed",
        text(input.errorCode) || "MANUAL_REPLY_FAILED",
      ],
    );
  });
}
