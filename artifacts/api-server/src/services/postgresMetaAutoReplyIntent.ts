import crypto from "node:crypto";
import type { DurableJob } from "./durableJobQueue";
import { getKnowledgeDecisionEngine } from "./ai/knowledgeDecisionEngine";
import {
  withMerchantOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";
import type { KnowledgeConversationMessage } from "./knowledge/types";
import {
  parseMetaInboundMessage,
  selectMetaInboundImageUrl,
  selectMetaInboundAudioUrl,
} from "./metaInboundMessage";
import {
  getMetaImageUnderstandingService,
} from "./metaImageUnderstandingRuntime";
import {
  getMetaAudioUnderstandingService,
} from "./metaAudioUnderstandingRuntime.js";
import { TrustedMediaCatalogMatcher } from "./mediaCatalogMatcher";
import { notifyMerchantNewCustomerMessagePostgres } from "./postgresOperationalNotificationAuthority";
import { notifyMerchantKnowledgeGapPostgres } from "./postgresOperationalNotificationAuthority.js";

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
      sourceCustomerMessageId: string;
      replyIntentId: string;
      replyMessageId: string;
      pageId: string;
      recipientId: string;
      messageText: string;
      handoffAfterReply: boolean;
    };

const trustedMediaCatalogMatcher = new TrustedMediaCatalogMatcher();

type ParsedMetaJob = {
  eventId: string;
  merchantId: string;
  pageId: string;
  senderId: string;
  externalMessageId: string;
  customerText: string | null;
  storageText: string;
  contentKind: "text" | "image" | "audio" | "video" | "shared_post";
  attachmentCount: number;
  contentIdentityHash: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  webhookBody: Record<string, unknown>;
  createdAt: string;
};

type ConversationRow = {
  id: string;
  status: "auto_replying" | "needs_reply" | "manual" | "closed";
  assigned_to_human: boolean;
  metadata?: Record<string, unknown> | null;
};

type ReplyMessageRow = {
  id: string;
  text: string;
  status: string;
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
  const inbound = parseMetaInboundMessage(message);
  const customerText = inbound?.text || null;
  const storageText = inbound?.storageText || "";
  const contentKind = inbound?.kind ?? "unsupported";
  const imageUrl = inbound
    ? selectMetaInboundImageUrl(inbound)
    : null;
  const audioUrl = inbound
    ? selectMetaInboundAudioUrl(inbound)
    : null;
  const contentIdentityHash =
    inbound && inbound.attachments.length > 0
      ? digest(
          stableJson(
            inbound.attachments.map((attachment) => ({
              type: attachment.type,
              url: attachment.url,
              title: attachment.title,
            })),
          ),
        )
      : null;
  const bodyPageId = text(entry.id);
  const bodySenderId = text(sender.id);
  const bodyMessageId = text(message.mid);

  if (
    !eventId ||
    !merchantId ||
    !pageId ||
    !senderId ||
    !externalMessageId ||
    !inbound ||
    contentKind === "unsupported" ||
    !storageText ||
    storageText.length > 2_000 ||
    (customerText !== null && customerText.length > 2_000) ||
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
    storageText,
    contentKind,
    attachmentCount: inbound.attachments.length,
    contentIdentityHash,
    imageUrl,
    audioUrl,
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
  sourceCustomerMessageId: string;
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
         RETURNING id, status::text AS status, assigned_to_human`,
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

    const existingCustomer = await client.query<{
      id: string;
      conversation_id: string;
      text: string;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, conversation_id, text, metadata
         FROM messages
        WHERE merchant_id = $1 AND external_message_id = $2
        LIMIT 1`,
      [parsed.merchantId, parsed.externalMessageId],
    );
    let customerInserted = false;
    let sourceCustomerMessageId = existingCustomer.rows[0]?.id || "";

    if (!existingCustomer.rows[0]) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO messages
          (id, merchant_id, conversation_id, external_message_id,
           external_event_id, sender, text, status, counted_as_auto_reply,
           metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, 'customer', $6, 'received', FALSE,
                 $7::jsonb, $8::timestamptz)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          customerMessageId(parsed.eventId),
          parsed.merchantId,
          conversation.id,
          parsed.externalMessageId,
          parsed.eventId,
          parsed.storageText,
          JSON.stringify(
            parsed.contentKind === "text" &&
              parsed.attachmentCount === 0
              ? {}
              : {
                  media: {
                    content_kind: parsed.contentKind,
                    attachment_count: parsed.attachmentCount,
                    has_attachment: parsed.attachmentCount > 0,
                    content_identity_hash: parsed.contentIdentityHash,
                  },
                },
          ),
          parsed.createdAt,
        ],
      );
      customerInserted = inserted.rows.length === 1;
      sourceCustomerMessageId =
        inserted.rows[0]?.id || customerMessageId(parsed.eventId);
    } else {
      const existingMedia =
        existingCustomer.rows[0].metadata?.media &&
        typeof existingCustomer.rows[0].metadata.media === "object" &&
        !Array.isArray(existingCustomer.rows[0].metadata.media)
          ? (existingCustomer.rows[0].metadata.media as Record<string, unknown>)
          : null;
      const existingContentIdentityHash =
        typeof existingMedia?.content_identity_hash === "string"
          ? existingMedia.content_identity_hash
          : null;

      if (
        existingCustomer.rows[0].conversation_id !== conversation.id ||
        existingCustomer.rows[0].text !== parsed.storageText ||
        existingContentIdentityHash !== parsed.contentIdentityHash
      ) {
        throw Object.assign(new Error("Meta message identity collision detected"), {
          code: "META_MESSAGE_IDENTITY_COLLISION",
        });
      }
    }

    await client.query(
      `UPDATE conversations
          SET last_message_at = GREATEST(COALESCE(last_message_at, $3::timestamptz), $3::timestamptz),
              updated_at = GREATEST(updated_at, $3::timestamptz),
              metadata = CASE
                WHEN $4::boolean THEN jsonb_set(
                  COALESCE(metadata, '{}'::jsonb),
                  '{latest_customer_message_id}',
                  to_jsonb($5::text),
                  true
                )
                ELSE metadata
              END
        WHERE merchant_id = $1 AND id = $2`,
      [
        parsed.merchantId,
        conversation.id,
        parsed.createdAt,
        customerInserted,
        sourceCustomerMessageId,
      ],
    );

    return {
      conversation,
      conversationId: conversation.id,
      inboundEventId: inboundRow.id,
      customerInserted,
      existingReply: await findReplyMessage(client, parsed.merchantId, parsed.eventId),
      sourceCustomerMessageId,
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

      const media =
        metadata.media &&
        typeof metadata.media === "object" &&
        !Array.isArray(metadata.media)
          ? metadata.media as Record<string, unknown>
          : null;

      const imageSha256 =
        media && typeof media.image_sha256 === "string"
          ? media.image_sha256.trim()
          : "";
      const visionProviderId =
        media && typeof media.vision_provider_id === "string"
          ? media.vision_provider_id.trim()
          : "";
      const visionModel =
        media && typeof media.vision_model === "string"
          ? media.vision_model.trim()
          : "";
      const matchConfidence = media?.match_confidence;
      const audioTranscript =
        row.sender === "customer" &&
        media &&
        typeof media.audio_transcript === "string" &&
        media.audio_transcript.trim().length > 0 &&
        media.audio_transcript.trim().length <= 2_000 &&
        typeof media.audio_sha256 === "string" &&
        /^[a-f0-9]{64}$/i.test(media.audio_sha256) &&
        typeof media.transcription_provider_id === "string" &&
        media.transcription_provider_id.trim().length > 0 &&
        typeof media.transcription_model === "string" &&
        media.transcription_model.trim().length > 0
          ? media.audio_transcript.trim()
          : "";

      const trustedCatalogRef =
        row.sender === "customer" &&
        Boolean(matchedRecordId) &&
        /^[a-f0-9]{64}$/i.test(imageSha256) &&
        Boolean(visionProviderId) &&
        Boolean(visionModel) &&
        typeof matchConfidence === "number" &&
        Number.isFinite(matchConfidence) &&
        matchConfidence >= 0 &&
        matchConfidence <= 1;

      const createdAt = new Date(row.created_at).toISOString();
      return {
        sender: row.sender,
        text: audioTranscript || text(row.text),
        createdAt,
        ...(matchedRecordId ? { matchedRecordId } : {}),
        ...(trustedCatalogRef ? { trustedCatalogRef: true } : {}),
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
): PreparedPostgresMetaAutoReply {
  return {
    action: "send",
    eventId: parsed.eventId,
    merchantId: parsed.merchantId,
    conversationId: conversationIdValue,
    inboundEventId: inboundId,
    sourceCustomerMessageId:
      text(existing.metadata?.source_customer_message_id) ||
      customerMessageId(parsed.eventId),
    replyIntentId: replyIntentId(parsed.eventId),
    replyMessageId: existing.id,
    pageId: parsed.pageId,
    recipientId: parsed.senderId,
    messageText: existing.text,
    handoffAfterReply: existing.metadata?.handoff_after_reply === true,
  };
}

export async function preparePostgresMetaAutoReply(
  job: DurableJob,
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
    );
  }

  if (
    inbound.conversation.status === "manual" ||
    inbound.conversation.assigned_to_human
  ) {
    return {
      action: "suppress",
      eventId: parsed.eventId,
      merchantId: parsed.merchantId,
      conversationId: inbound.conversationId,
      code: "CONVERSATION_MANUAL_TAKEOVER",
    };
  }

  let trustedAudioTranscript: string | null = null;
  let trustedAudioUnderstood = false;

  if (parsed.audioUrl) {
    const persistedAudio =
      await withMerchantOperationalTransaction(
        parsed.merchantId,
        async (client) => {
          const result = await client.query<{
            metadata: Record<string, unknown> | null;
          }>(
            `SELECT metadata
               FROM messages
              WHERE merchant_id = $1
                AND id = $2
                AND conversation_id = $3
                AND sender = 'customer'
              LIMIT 1`,
            [
              parsed.merchantId,
              inbound.sourceCustomerMessageId,
              inbound.conversationId,
            ],
          );
          const metadata = result.rows[0]?.metadata;
          const media =
            metadata &&
            typeof metadata === "object" &&
            !Array.isArray(metadata) &&
            metadata.media &&
            typeof metadata.media === "object" &&
            !Array.isArray(metadata.media)
              ? metadata.media as Record<string, unknown>
              : null;
          if (!media) return null;

          const transcript =
            typeof media.audio_transcript === "string"
              ? media.audio_transcript.trim()
              : "";
          const audioSha256 =
            typeof media.audio_sha256 === "string"
              ? media.audio_sha256.trim()
              : "";
          const providerId =
            typeof media.transcription_provider_id === "string"
              ? media.transcription_provider_id.trim()
              : "";
          const model =
            typeof media.transcription_model === "string"
              ? media.transcription_model.trim()
              : "";
          const sameContent =
            typeof media.content_identity_hash === "string" &&
            media.content_identity_hash === parsed.contentIdentityHash;

          if (
            !sameContent ||
            !transcript ||
            transcript.length > 2_000 ||
            !/^[a-f0-9]{64}$/i.test(audioSha256) ||
            !providerId ||
            providerId.length > 160 ||
            !model ||
            model.length > 160
          ) {
            return null;
          }
          return transcript;
        },
      );

    if (persistedAudio) {
      trustedAudioTranscript = persistedAudio;
      trustedAudioUnderstood = true;
    } else {
      const audioService = getMetaAudioUnderstandingService();
      if (audioService) {
        const understood = await audioService.understand({
          merchantId: parsed.merchantId,
          audioUrl: parsed.audioUrl,
        });
        const transcript = understood?.transcript?.trim() || "";
        const hasSafeProvenance =
          transcript.length > 0 &&
          transcript.length <= 2_000 &&
          typeof understood?.audioSha256 === "string" &&
          /^[a-f0-9]{64}$/i.test(understood.audioSha256) &&
          typeof understood?.transcriptionProviderId === "string" &&
          understood.transcriptionProviderId.trim().length > 0 &&
          understood.transcriptionProviderId.length <= 160 &&
          typeof understood?.transcriptionModel === "string" &&
          understood.transcriptionModel.trim().length > 0 &&
          understood.transcriptionModel.length <= 160;

        if (understood && hasSafeProvenance) {
          await withMerchantOperationalTransaction(
            parsed.merchantId,
            async (client) => {
              const customer = await client.query<{
                metadata: Record<string, unknown> | null;
              }>(
                `SELECT metadata
                   FROM messages
                  WHERE merchant_id = $1
                    AND id = $2
                    AND conversation_id = $3
                    AND sender = 'customer'
                  FOR UPDATE`,
                [
                  parsed.merchantId,
                  inbound.sourceCustomerMessageId,
                  inbound.conversationId,
                ],
              );
              const metadata = customer.rows[0]?.metadata;
              const media =
                metadata &&
                typeof metadata === "object" &&
                !Array.isArray(metadata) &&
                metadata.media &&
                typeof metadata.media === "object" &&
                !Array.isArray(metadata.media)
                  ? metadata.media as Record<string, unknown>
                  : null;
              if (
                !media ||
                media.content_identity_hash !== parsed.contentIdentityHash
              ) {
                throw Object.assign(
                  new Error("Meta audio content identity changed"),
                  { code: "META_MESSAGE_IDENTITY_COLLISION" },
                );
              }
              const nextMetadata = {
                ...metadata,
                media: {
                  ...media,
                  audio_transcript: transcript,
                  audio_sha256: understood.audioSha256,
                  transcription_provider_id: understood.transcriptionProviderId,
                  transcription_model: understood.transcriptionModel,
                },
              };
              await client.query(
                `UPDATE messages
                    SET metadata = $4::jsonb
                  WHERE merchant_id = $1
                    AND id = $2
                    AND conversation_id = $3`,
                [
                  parsed.merchantId,
                  inbound.sourceCustomerMessageId,
                  inbound.conversationId,
                  JSON.stringify(nextMetadata),
                ],
              );
            },
          );
          trustedAudioTranscript = transcript;
          trustedAudioUnderstood = true;
        }
      }
    }
  }

  let trustedImageUnderstood = false;
  let trustedImageMatchedRecordId: string | null = null;
  let trustedImageAlternatives: Array<{
    productId: string;
    variantId?: string;
    confidence: number;
  }> = [];

  if (parsed.imageUrl) {
    const persistedImageResult =
      await withMerchantOperationalTransaction(
        parsed.merchantId,
        async (client) => {
          const result = await client.query<{
            metadata: Record<string, unknown> | null;
          }>(
            `SELECT metadata
               FROM messages
              WHERE merchant_id = $1
                AND id = $2
                AND conversation_id = $3
                AND sender = 'customer'
              LIMIT 1`,
            [
              parsed.merchantId,
              inbound.sourceCustomerMessageId,
              inbound.conversationId,
            ],
          );

          const metadata = result.rows[0]?.metadata;
          if (
            !metadata ||
            typeof metadata !== "object" ||
            Array.isArray(metadata)
          ) {
            return null;
          }

          const media =
            metadata.media &&
            typeof metadata.media === "object" &&
            !Array.isArray(metadata.media)
              ? metadata.media as Record<string, unknown>
              : null;

          if (!media) return null;

          const sameContent =
            typeof media.content_identity_hash === "string" &&
            media.content_identity_hash === parsed.contentIdentityHash;

          const hasTrustedMatch =
            typeof metadata.matched_record_id === "string" &&
            metadata.matched_record_id.trim().length > 0;

          const hasSafeProvenance =
            typeof media.image_sha256 === "string" &&
            media.image_sha256.trim().length > 0 &&
            typeof media.vision_provider_id === "string" &&
            media.vision_provider_id.trim().length > 0 &&
            typeof media.vision_model === "string" &&
            media.vision_model.trim().length > 0 &&
            typeof media.match_confidence === "number" &&
            Number.isFinite(media.match_confidence) &&
            media.match_confidence >= 0 &&
            media.match_confidence <= 1;

          if (!sameContent || !hasTrustedMatch || !hasSafeProvenance) {
            return null;
          }

          return metadata.matched_record_id as string;
        },
      );

    const persistedImageAlternatives =
      await withMerchantOperationalTransaction(
        parsed.merchantId,
        async (client) => {
          const result = await client.query<{
            metadata: Record<string, unknown> | null;
          }>(
            `SELECT metadata
               FROM messages
              WHERE merchant_id = $1
                AND id = $2
                AND conversation_id = $3
                AND sender = 'customer'
              LIMIT 1`,
            [
              parsed.merchantId,
              inbound.sourceCustomerMessageId,
              inbound.conversationId,
            ],
          );

          const metadata = result.rows[0]?.metadata;
          if (
            !metadata ||
            typeof metadata !== "object" ||
            Array.isArray(metadata)
          ) {
            return null;
          }

          const media =
            metadata.media &&
            typeof metadata.media === "object" &&
            !Array.isArray(metadata.media)
              ? metadata.media as Record<string, unknown>
              : null;

          if (!media) return null;

          const sameContent =
            typeof media.content_identity_hash === "string" &&
            media.content_identity_hash === parsed.contentIdentityHash;

          const hasSafeProvenance =
            typeof media.image_sha256 === "string" &&
            /^[a-f0-9]{64}$/i.test(media.image_sha256) &&
            typeof media.vision_provider_id === "string" &&
            media.vision_provider_id.trim().length > 0 &&
            media.vision_provider_id.length <= 160 &&
            typeof media.vision_model === "string" &&
            media.vision_model.trim().length > 0 &&
            media.vision_model.length <= 160;

          if (
            !sameContent ||
            !hasSafeProvenance ||
            !Array.isArray(media.visual_alternatives) ||
            media.visual_alternatives.length === 0
          ) {
            return null;
          }

          const candidates = [];

          for (const value of media.visual_alternatives) {
            if (
              !value ||
              typeof value !== "object" ||
              Array.isArray(value)
            ) {
              return null;
            }

            const alternative = value as Record<string, unknown>;
            const productId =
              typeof alternative.product_id === "string"
                ? alternative.product_id.trim()
                : "";
            const variantId =
              typeof alternative.variant_id === "string"
                ? alternative.variant_id.trim()
                : "";
            const confidence = alternative.confidence;

            if (
              !productId ||
              typeof confidence !== "number" ||
              !Number.isFinite(confidence) ||
              confidence < 0 ||
              confidence > 1
            ) {
              return null;
            }

            candidates.push({
              productId,
              ...(variantId ? { variantId } : {}),
              confidence,
            });
          }

          return candidates;
        },
      );

    let trustedPersistedImageResult: string | null = null;

    if (persistedImageResult) {
      const productMatch =
        /^catalog-product:([^:]+)$/.exec(persistedImageResult);
      const variantMatch =
        /^catalog-variant:([^:]+):([^:]+)$/.exec(persistedImageResult);

      const persistedCandidate = productMatch
        ? {
            productId: productMatch[1],
            confidence: 1,
          }
        : variantMatch
          ? {
              productId: variantMatch[1],
              variantId: variantMatch[2],
              confidence: 1,
            }
          : null;

      if (persistedCandidate) {
        const revalidatedPersistedMatch =
          await trustedMediaCatalogMatcher.resolve({
            merchantId: parsed.merchantId,
            candidates: [persistedCandidate],
          });

        if (
          revalidatedPersistedMatch?.matchedRecordId ===
          persistedImageResult
        ) {
          trustedPersistedImageResult = persistedImageResult;
        }
      }
    }

    trustedImageUnderstood = Boolean(trustedPersistedImageResult);
    trustedImageMatchedRecordId = trustedPersistedImageResult;

    if (
      !trustedPersistedImageResult &&
      persistedImageAlternatives
    ) {
      const revalidatedAlternatives =
        await trustedMediaCatalogMatcher.resolveAlternatives({
          merchantId: parsed.merchantId,
          candidates: persistedImageAlternatives,
        });

      const persistedIdentities = persistedImageAlternatives
        .map((alternative) =>
          `${alternative.productId}:${alternative.variantId ?? ""}:${alternative.confidence}`,
        )
        .sort();

      const revalidatedIdentities = revalidatedAlternatives
        .map((alternative) =>
          `${alternative.productId}:${alternative.variantId ?? ""}:${alternative.confidence}`,
        )
        .sort();

      const alternativesMatch =
        persistedIdentities.length === revalidatedIdentities.length &&
        persistedIdentities.every(
          (identity, index) =>
            identity === revalidatedIdentities[index],
        );

      if (alternativesMatch) {
        trustedImageAlternatives = revalidatedAlternatives;
        trustedImageUnderstood = true;
      }
    }

    const imageService =
      trustedPersistedImageResult || trustedImageAlternatives.length > 0
        ? null
        : getMetaImageUnderstandingService();

    if (imageService) {
      const imageInput = {
        merchantId: parsed.merchantId,
        imageUrl: parsed.imageUrl,
      };

      const understoodWithAlternatives =
        typeof imageService.understandWithAlternatives === "function"
          ? await imageService.understandWithAlternatives(imageInput)
          : null;

      const legacyUnderstood =
        typeof imageService.understandWithAlternatives === "function"
          ? null
          : await imageService.understand(imageInput);

      const understood =
        understoodWithAlternatives?.exactMatch ?? legacyUnderstood ?? null;

      if (
        understoodWithAlternatives &&
        !understood &&
        understoodWithAlternatives.alternatives.length > 0
      ) {
        const trustedAlternatives =
          await trustedMediaCatalogMatcher.resolveAlternatives({
            merchantId: parsed.merchantId,
            candidates: understoodWithAlternatives.alternatives,
          });

        const hasSafeAlternativeProvenance =
          typeof understoodWithAlternatives.imageSha256 === "string" &&
          /^[a-f0-9]{64}$/i.test(understoodWithAlternatives.imageSha256) &&
          typeof understoodWithAlternatives.visionProviderId === "string" &&
          understoodWithAlternatives.visionProviderId.trim().length > 0 &&
          understoodWithAlternatives.visionProviderId.length <= 160 &&
          typeof understoodWithAlternatives.visionModel === "string" &&
          understoodWithAlternatives.visionModel.trim().length > 0 &&
          understoodWithAlternatives.visionModel.length <= 160;

        if (hasSafeAlternativeProvenance && trustedAlternatives.length > 0) {
          trustedImageAlternatives = trustedAlternatives;
          trustedImageUnderstood = true;

          await withMerchantOperationalTransaction(
            parsed.merchantId,
            async (client) => {
              const customer = await client.query<{
                id: string;
                metadata: Record<string, unknown> | null;
              }>(
                `SELECT id, metadata
                   FROM messages
                  WHERE merchant_id = $1
                    AND id = $2
                    AND conversation_id = $3
                    AND sender = 'customer'
                  LIMIT 1
                  FOR UPDATE`,
                [
                  parsed.merchantId,
                  inbound.sourceCustomerMessageId,
                  inbound.conversationId,
                ],
              );

              const row = customer.rows[0];
              if (!row) {
                throw Object.assign(
                  new Error("Meta customer message is unavailable"),
                  { code: "META_CUSTOMER_MESSAGE_UNAVAILABLE" },
                );
              }

              const metadata =
                row.metadata &&
                typeof row.metadata === "object" &&
                !Array.isArray(row.metadata)
                  ? row.metadata
                  : {};

              const media =
                metadata.media &&
                typeof metadata.media === "object" &&
                !Array.isArray(metadata.media)
                  ? metadata.media as Record<string, unknown>
                  : {};

              const storedContentIdentityHash =
                typeof media.content_identity_hash === "string"
                  ? media.content_identity_hash
                  : null;

              if (
                !parsed.contentIdentityHash ||
                storedContentIdentityHash !== parsed.contentIdentityHash
              ) {
                throw Object.assign(
                  new Error("Meta image content identity changed"),
                  { code: "META_MESSAGE_IDENTITY_COLLISION" },
                );
              }

              const nextMetadata = {
                ...metadata,
                media: {
                  ...media,
                  image_sha256: understoodWithAlternatives.imageSha256,
                  vision_provider_id:
                    understoodWithAlternatives.visionProviderId,
                  vision_model: understoodWithAlternatives.visionModel,
                  visual_alternatives: trustedAlternatives.map(
                    (alternative) => ({
                      product_id: alternative.productId,
                      ...(alternative.variantId
                        ? { variant_id: alternative.variantId }
                        : {}),
                      confidence: alternative.confidence,
                    }),
                  ),
                },
              };

              await client.query(
                `UPDATE messages
                    SET metadata = $4::jsonb
                  WHERE merchant_id = $1
                    AND id = $2
                    AND conversation_id = $3`,
                [
                  parsed.merchantId,
                  inbound.sourceCustomerMessageId,
                  inbound.conversationId,
                  JSON.stringify(nextMetadata),
                ],
              );
            },
          );
        }
      }

      if (understood) {
        const revalidatedMatch =
          await trustedMediaCatalogMatcher.resolve({
            merchantId: parsed.merchantId,
            candidates: [
              {
                productId: understood.productId,
                ...(understood.variantId
                  ? { variantId: understood.variantId }
                  : {}),
                confidence: understood.confidence,
              },
            ],
          });

        const hasSafeRuntimeProvenance =
          typeof understood.imageSha256 === "string" &&
          /^[a-f0-9]{64}$/i.test(understood.imageSha256) &&
          typeof understood.visionProviderId === "string" &&
          understood.visionProviderId.trim().length > 0 &&
          understood.visionProviderId.length <= 160 &&
          typeof understood.visionModel === "string" &&
          understood.visionModel.trim().length > 0 &&
          understood.visionModel.length <= 160 &&
          typeof understood.confidence === "number" &&
          Number.isFinite(understood.confidence) &&
          understood.confidence >= 0 &&
          understood.confidence <= 1;

        const trustedUnderstood =
          hasSafeRuntimeProvenance &&
          revalidatedMatch &&
          revalidatedMatch.matchedRecordId === understood.matchedRecordId
            ? revalidatedMatch
            : null;

        if (trustedUnderstood) {
          trustedImageUnderstood = true;
          trustedImageMatchedRecordId =
            trustedUnderstood.matchedRecordId;

          await withMerchantOperationalTransaction(
            parsed.merchantId,
            async (client) => {
            const customer = await client.query<{
              id: string;
              metadata: Record<string, unknown> | null;
            }>(
              `SELECT id, metadata
                 FROM messages
                WHERE merchant_id = $1
                  AND id = $2
                  AND conversation_id = $3
                  AND sender = 'customer'
                LIMIT 1
                FOR UPDATE`,
              [
                parsed.merchantId,
                inbound.sourceCustomerMessageId,
                inbound.conversationId,
              ],
            );

            const row = customer.rows[0];
            if (!row) {
              throw Object.assign(
                new Error("Meta customer message is unavailable"),
                { code: "META_CUSTOMER_MESSAGE_UNAVAILABLE" },
              );
            }

            const metadata =
              row.metadata &&
              typeof row.metadata === "object" &&
              !Array.isArray(row.metadata)
                ? row.metadata
                : {};

            const media =
              metadata.media &&
              typeof metadata.media === "object" &&
              !Array.isArray(metadata.media)
                ? metadata.media as Record<string, unknown>
                : {};

            const storedContentIdentityHash =
              typeof media.content_identity_hash === "string"
                ? media.content_identity_hash
                : null;

            if (
              !parsed.contentIdentityHash ||
              storedContentIdentityHash !== parsed.contentIdentityHash
            ) {
              throw Object.assign(
                new Error("Meta image content identity changed"),
                { code: "META_MESSAGE_IDENTITY_COLLISION" },
              );
            }

            const nextMetadata = {
              ...metadata,
              matched_record_id: trustedUnderstood.matchedRecordId,
              media: {
                ...media,
                image_sha256: understood.imageSha256,
                vision_provider_id: understood.visionProviderId,
                vision_model: understood.visionModel,
                match_confidence: understood.confidence,
              },
            };

            await client.query(
              `UPDATE messages
                  SET metadata = $4::jsonb
                WHERE merchant_id = $1
                  AND id = $2
                  AND conversation_id = $3`,
              [
                parsed.merchantId,
                inbound.sourceCustomerMessageId,
                inbound.conversationId,
                JSON.stringify(nextMetadata),
              ],
            );
            },
          );
        }
      }
    }
  }

  if (inbound.conversation.status === "needs_reply") {
    return {
      action: "suppress",
      eventId: parsed.eventId,
      merchantId: parsed.merchantId,
      conversationId: inbound.conversationId,
      code: "CONVERSATION_NEEDS_REPLY",
    };
  }

  const effectiveCustomerText =
    trustedAudioUnderstood && trustedAudioTranscript
      ? trustedAudioTranscript
      : parsed.customerText;

  const trustedImageTextMessage =
    parsed.contentKind === "text" &&
    Boolean(parsed.customerText) &&
    parsed.attachmentCount > 0 &&
    trustedImageUnderstood &&
    (Boolean(trustedImageMatchedRecordId) ||
      trustedImageAlternatives.length > 0);

  if (
    (parsed.contentKind !== "text" && !trustedAudioUnderstood) ||
    !effectiveCustomerText ||
    (parsed.attachmentCount > 0 &&
      !trustedImageTextMessage &&
      !trustedAudioUnderstood)
  ) {
    if (!trustedImageUnderstood) {
      await withMerchantOperationalTransaction(
        parsed.merchantId,
        async (client) => {
          await client.query(
            `UPDATE conversations
                SET status = 'needs_reply', assigned_to_human = FALSE,
                    needs_training = FALSE, updated_at = now()
              WHERE merchant_id = $1 AND id = $2 AND status = 'auto_replying'`,
            [parsed.merchantId, inbound.conversationId],
          );
        },
      );
    }

    return {
      action: "suppress",
      eventId: parsed.eventId,
      merchantId: parsed.merchantId,
      conversationId: inbound.conversationId,
      code: "META_MEDIA_PROCESSING_UNAVAILABLE",
    };
  }

  const recentMessages = await loadRecentConversationContext(
    parsed.merchantId,
    inbound.conversationId,
    inbound.sourceCustomerMessageId,
  );

  if (trustedImageTextMessage && trustedImageMatchedRecordId) {
    recentMessages.push({
      sender: "customer",
      text: parsed.customerText || effectiveCustomerText,
      createdAt: parsed.createdAt,
      matchedRecordId: trustedImageMatchedRecordId,
      trustedCatalogRef: true,
    });
  }

  let decision;
  try {
    decision = await getKnowledgeDecisionEngine().decide({
      merchantId: parsed.merchantId,
      customerText: effectiveCustomerText,
      requestId: parsed.eventId,
      conversationId: inbound.conversationId,
      customerExternalId: parsed.senderId,
      recentMessages,
      ...(trustedImageAlternatives[0]
        ? {
            // Keep the singular field for backward compatibility while the
            // ranked set enables authoritative stock fallback across similar
            // current-merchant catalog candidates.
            trustedVisualAlternative: trustedImageAlternatives[0],
            trustedVisualAlternatives: trustedImageAlternatives,
          }
        : {}),
    });
  } catch {
    throw Object.assign(new Error("Knowledge reply decision is unavailable"), {
      code: "META_REPLY_DECISION_UNAVAILABLE",
    });
  }

  const answerText = text(decision.answerText);
  if (decision.action === "no_answer" || !answerText) {
    await withMerchantOperationalTransaction(parsed.merchantId, async (client) => {
      await client.query(
        `UPDATE conversations
            SET status = 'needs_reply', assigned_to_human = FALSE,
                needs_training = TRUE, updated_at = now()
          WHERE merchant_id = $1 AND id = $2 AND status = 'auto_replying'`,
        [parsed.merchantId, inbound.conversationId],
      );
    });
    return {
      action: "suppress",
      eventId: parsed.eventId,
      merchantId: parsed.merchantId,
      conversationId: inbound.conversationId,
      code: text(decision.reasonCode) || "KNOWLEDGE_NO_ANSWER",
    };
  }

  const handoff = decision.action === "handoff";
  const replyType = decision.stage === "ai_fallback"
    ? "ai"
    : handoff || decision.stage === "clarification"
      ? "fallback"
      : "database";

  let knowledgeGapConversationId = "";
  const prepared = await withMerchantOperationalTransaction(parsed.merchantId, async (client) => {
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
      );
    }
    const latestCustomerMessageId = text(
      current?.metadata?.latest_customer_message_id,
    );
    if (
      !current ||
      latestCustomerMessageId !== inbound.sourceCustomerMessageId
    ) {
      return {
        action: "suppress" as const,
        eventId: parsed.eventId,
        merchantId: parsed.merchantId,
        conversationId: inbound.conversationId,
        code: "CONVERSATION_CONTEXT_SUPERSEDED",
      };
    }
    if (
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
          source_customer_message_id: inbound.sourceCustomerMessageId,
          training_request_id: decision.trainingRequestId,
          handoff_after_reply: handoff,
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

      if (
        [
          "AUTHORITATIVE_FACT_UNAVAILABLE",
          "NO_TRUSTED_ANSWER",
          "AI_CANDIDATE_REQUIRES_MERCHANT_APPROVAL",
        ].includes(decision.reasonCode) &&
        decision.trainingRequestId
      ) {
        knowledgeGapConversationId = current.id;
      }
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
    );
  });
  // Release the reply transaction's connection before the notification opens
  // its own transaction. Only notify after the handoff was committed.
  if (knowledgeGapConversationId && decision.trainingRequestId) {
    try {
      await notifyMerchantKnowledgeGapPostgres({
        merchantId: parsed.merchantId,
        trainingRequestId: decision.trainingRequestId,
        conversationId: knowledgeGapConversationId,
      });
    } catch {
      console.error("Meta knowledge gap notification failed", {
        code: "OPERATIONAL_NOTIFICATION_UNAVAILABLE",
        merchant_id: parsed.merchantId,
        conversation_id: knowledgeGapConversationId,
        training_request_id: decision.trainingRequestId,
      });
    }
  }
  return prepared;
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
