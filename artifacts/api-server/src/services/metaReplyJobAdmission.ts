import crypto from "node:crypto";
import type { DurableJob } from "./durableJobQueue";
import {
  parseMetaInboundMessage,
  selectMetaInboundImageUrl,
  selectMetaInboundAudioUrl,
  selectMetaInboundVideoUrl,
  selectMetaInboundSafeMediaManifest,
} from "./metaInboundMessage";

export type ParsedMetaJob = {
  eventId: string;
  merchantId: string;
  pageId: string;
  senderId: string;
  externalMessageId: string;
  customerText: string | null;
  storageText: string;
  contentKind: "text" | "image" | "audio" | "video" | "shared_post" | "document" | "location" | "sticker";
  attachmentCount: number;
  contentIdentityHash: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  mediaManifest: {
    imageUrl: string | null;
    audioUrl: string | null;
    videoUrl: string | null;
  } | null;
  replyToMessageId: string | null;
  webhookBody: Record<string, unknown>;
  createdAt: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

export function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown): string {
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

export function parseMetaReplyJob(job: DurableJob): ParsedMetaJob {
  const payload = job.payload || {};
  const rowMerchantId = text(job.merchant_id);
  const rowEventId = text(job.dedupe_key);
  const eventId = text(payload.event_id);
  const merchantId = text(payload.merchant_id || rowMerchantId);
  const pageId = text(payload.page_id);
  const senderId = text(payload.sender_id);
  const externalMessageId = text(payload.external_message_id);
  const webhookBody = eventRecord(payload.webhook_body);
  const entries = Array.isArray(webhookBody.entry) ? webhookBody.entry : [];
  const entry = eventRecord(entries[0]);
  const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
  const event = eventRecord(messaging[0]);
  const sender = eventRecord(event.sender);
  const recipientProvided = Object.prototype.hasOwnProperty.call(event, "recipient");
  const bodyRecipientId = text(eventRecord(event.recipient).id);
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
  const videoUrl = inbound ? selectMetaInboundVideoUrl(inbound) : null;
  const mediaManifest = inbound
    ? selectMetaInboundSafeMediaManifest(inbound)
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
    webhookBody.object !== "page" ||
    entries.length !== 1 ||
    messaging.length !== 1 ||
    message.is_echo === true ||
    (recipientProvided && bodyRecipientId !== pageId) ||
    !rowMerchantId ||
    !rowEventId ||
    !eventId ||
    merchantId !== rowMerchantId ||
    eventId !== rowEventId ||
    !merchantId ||
    !pageId ||
    !senderId ||
    !externalMessageId ||
    !inbound ||
    (contentKind === "unsupported" ||
      contentKind === "shared_post" ||
      contentKind === "document" ||
      contentKind === "location" ||
      contentKind === "sticker") ||
    inbound.attachments.some((attachment) =>
      !["image", "audio", "video"].includes(attachment.type.toLowerCase()),
    ) ||
    !storageText ||
    storageText.length > 2_000 ||
    (customerText !== null && customerText.length > 2_000) ||
    bodyPageId !== pageId ||
    bodySenderId !== senderId ||
    bodyMessageId !== externalMessageId
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
    videoUrl,
    mediaManifest,
    replyToMessageId: inbound.replyToMessageId,
    webhookBody,
    createdAt: eventTimestamp(event.timestamp),
  };
}

