import crypto from "node:crypto";

export type WhatsAppMessageKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "reaction"
  | "button"
  | "interactive"
  | "unknown";

export type WhatsAppMessageProviderReference =
  | {
      kind: "media";
      media_kind: "image" | "audio" | "video" | "document" | "sticker";
      id: string;
      mime_type?: string;
      sha256?: string;
      caption?: string;
      filename?: string;
      voice?: boolean;
      animated?: boolean;
    }
  | {
      kind: "location";
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    }
  | {
      kind: "reaction";
      message_id: string;
      emoji?: string;
    }
  | {
      kind: "contacts";
      count: number;
    };

export type NormalizedWhatsAppMessageEvent = {
  event_id: string;
  event_kind: "message";
  waba_id: string;
  phone_number_id: string;
  display_phone_number?: string;
  external_message_id: string;
  customer_id: string;
  customer_name?: string;
  message_kind: WhatsAppMessageKind;
  text?: string;
  provider_reference?: WhatsAppMessageProviderReference;
  reply_to_message_id?: string;
  timestamp?: string;
};

export type NormalizedWhatsAppStatusEvent = {
  event_id: string;
  event_kind: "status";
  waba_id: string;
  phone_number_id: string;
  external_message_id: string;
  recipient_id?: string;
  status: string;
  timestamp?: string;
  error_codes: string[];
};

export type NormalizedWhatsAppErrorEvent = {
  event_id: string;
  event_kind: "error";
  waba_id: string;
  phone_number_id: string;
  code: string;
  title?: string;
  message?: string;
};

export type NormalizedWhatsAppWebhookEvent =
  | NormalizedWhatsAppMessageEvent
  | NormalizedWhatsAppStatusEvent
  | NormalizedWhatsAppErrorEvent;

export type WhatsAppWebhookParseResult = {
  supported: boolean;
  object: string;
  events: NormalizedWhatsAppWebhookEvent[];
  ignored_changes: number;
  malformed_changes: number;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function boundedText(value: unknown, max: number): string | undefined {
  const normalized = text(value);
  return normalized && normalized.length <= max ? normalized : undefined;
}

function boundedProviderId(value: unknown, max = 512): string | undefined {
  const normalized = text(value);
  if (
    !normalized ||
    normalized.length > max ||
    /[\u0000-\u001F\u007F]/.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function safeToken(value: unknown, max: number): string | undefined {
  const normalized = text(value).toLowerCase();
  return /^[a-z0-9_.:-]+$/.test(normalized) && normalized.length <= max
    ? normalized
    : undefined;
}

function cleanTimestamp(value: unknown): string | undefined {
  const raw = text(value);
  return /^\d{1,20}$/.test(raw) ? raw : undefined;
}

function safeMessageKind(value: unknown): WhatsAppMessageKind {
  const kind = text(value).toLowerCase();
  switch (kind) {
    case "text":
    case "image":
    case "audio":
    case "video":
    case "document":
    case "sticker":
    case "location":
    case "contacts":
    case "reaction":
    case "button":
    case "interactive":
      return kind;
    default:
      return "unknown";
  }
}

function normalizedInteractiveText(value: Record<string, unknown>): string {
  const interactive = record(value.interactive);
  const buttonReply = record(interactive.button_reply);
  const listReply = record(interactive.list_reply);
  return (
    boundedText(buttonReply.title, 4_000) ||
    boundedText(buttonReply.id, 4_000) ||
    boundedText(listReply.title, 4_000) ||
    boundedText(listReply.id, 4_000) ||
    ""
  );
}

function normalizedMessageText(message: Record<string, unknown>): string {
  const kind = safeMessageKind(message.type);
  if (kind === "text") return boundedText(record(message.text).body, 4_000) || "";
  if (kind === "button") {
    const button = record(message.button);
    return boundedText(button.text, 4_000) || boundedText(button.payload, 4_000) || "";
  }
  if (kind === "interactive") return normalizedInteractiveText(message);
  return "";
}

function mediaReference(
  message: Record<string, unknown>,
  kind: "image" | "audio" | "video" | "document" | "sticker",
): WhatsAppMessageProviderReference | undefined {
  const media = record(message[kind]);
  const id = boundedProviderId(media.id, 160);
  if (!id) return undefined;
  const mimeType = boundedText(media.mime_type, 160);
  const sha = boundedText(media.sha256, 256);
  const caption = boundedText(media.caption, 1_024);
  const filename = boundedText(media.filename, 512);
  return {
    kind: "media",
    media_kind: kind,
    id,
    ...(mimeType ? { mime_type: mimeType } : {}),
    ...(sha ? { sha256: sha } : {}),
    ...(caption ? { caption } : {}),
    ...(filename ? { filename } : {}),
    ...(kind === "audio" && typeof media.voice === "boolean"
      ? { voice: media.voice }
      : {}),
    ...(kind === "sticker" && typeof media.animated === "boolean"
      ? { animated: media.animated }
      : {}),
  };
}

function providerReference(
  message: Record<string, unknown>,
  kind: WhatsAppMessageKind,
): WhatsAppMessageProviderReference | undefined {
  if (
    kind === "image" ||
    kind === "audio" ||
    kind === "video" ||
    kind === "document" ||
    kind === "sticker"
  ) {
    return mediaReference(message, kind);
  }

  if (kind === "location") {
    const location = record(message.location);
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return undefined;
    }
    const name = boundedText(location.name, 300);
    const address = boundedText(location.address, 1_000);
    return {
      kind: "location",
      latitude,
      longitude,
      ...(name ? { name } : {}),
      ...(address ? { address } : {}),
    };
  }

  if (kind === "reaction") {
    const reaction = record(message.reaction);
    const messageId = boundedProviderId(reaction.message_id, 512);
    if (!messageId) return undefined;
    const emoji = boundedText(reaction.emoji, 32);
    return {
      kind: "reaction",
      message_id: messageId,
      ...(emoji ? { emoji } : {}),
    };
  }

  if (kind === "contacts") {
    const count = list(message.contacts).length;
    return count > 0 && count <= 1_000 ? { kind: "contacts", count } : undefined;
  }

  return undefined;
}

function contactNameByWaId(value: Record<string, unknown>): Map<string, string> {
  const names = new Map<string, string>();
  for (const candidate of list(value.contacts)) {
    const contact = record(candidate);
    const waId = text(contact.wa_id);
    const name = boundedText(record(contact.profile).name, 300);
    if (/^\d{6,20}$/.test(waId) && name && !names.has(waId)) names.set(waId, name);
  }
  return names;
}

function errorCodes(value: unknown): string[] {
  return [
    ...new Set(
      list(value)
        .map((candidate) => text(record(candidate).code))
        .filter((code) => /^[A-Za-z0-9_.:-]{1,160}$/.test(code)),
    ),
  ];
}

function hashEvent(parts: unknown[]): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");
}

function eventId(kind: "message" | "status" | "error", parts: unknown[]): string {
  return `whatsapp:${kind}:${hashEvent(parts)}`;
}

function buildMessageEvent(input: {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  message: Record<string, unknown>;
  contactNames: Map<string, string>;
}): NormalizedWhatsAppMessageEvent | null {
  const externalMessageId = boundedProviderId(input.message.id, 512);
  const customerId = text(input.message.from);
  if (
    !input.wabaId ||
    !input.phoneNumberId ||
    !externalMessageId ||
    !/^\d{6,20}$/.test(customerId)
  ) {
    return null;
  }

  const messageKind = safeMessageKind(input.message.type);
  const normalizedText = normalizedMessageText(input.message);
  const reference = providerReference(input.message, messageKind);
  const replyToMessageId = boundedProviderId(record(input.message.context).id, 512);
  const timestamp = cleanTimestamp(input.message.timestamp);
  const customerName = input.contactNames.get(customerId);

  return {
    event_id: eventId("message", [
      input.wabaId,
      input.phoneNumberId,
      externalMessageId,
    ]),
    event_kind: "message",
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    ...(input.displayPhoneNumber
      ? { display_phone_number: input.displayPhoneNumber }
      : {}),
    external_message_id: externalMessageId,
    customer_id: customerId,
    ...(customerName ? { customer_name: customerName } : {}),
    message_kind: messageKind,
    ...(normalizedText ? { text: normalizedText } : {}),
    ...(reference ? { provider_reference: reference } : {}),
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
}

function buildStatusEvent(input: {
  wabaId: string;
  phoneNumberId: string;
  status: Record<string, unknown>;
}): NormalizedWhatsAppStatusEvent | null {
  const externalMessageId = boundedProviderId(input.status.id, 512);
  const status = safeToken(input.status.status, 80);
  const rawRecipientId = text(input.status.recipient_id);
  if (
    !input.wabaId ||
    !input.phoneNumberId ||
    !externalMessageId ||
    !status ||
    (rawRecipientId && !/^\d{6,20}$/.test(rawRecipientId))
  ) {
    return null;
  }
  const recipientId = rawRecipientId || undefined;
  const timestamp = cleanTimestamp(input.status.timestamp);
  const errors = errorCodes(input.status.errors);
  return {
    event_id: eventId("status", [
      input.wabaId,
      input.phoneNumberId,
      externalMessageId,
      status,
      recipientId ?? "",
      timestamp ?? "",
      [...errors].sort(),
    ]),
    event_kind: "status",
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    external_message_id: externalMessageId,
    ...(recipientId ? { recipient_id: recipientId } : {}),
    status,
    ...(timestamp ? { timestamp } : {}),
    error_codes: errors,
  };
}

function buildErrorEvent(input: {
  wabaId: string;
  phoneNumberId: string;
  error: Record<string, unknown>;
}): NormalizedWhatsAppErrorEvent | null {
  const code = safeToken(input.error.code, 160);
  if (!input.wabaId || !input.phoneNumberId || !code) return null;
  const title = boundedText(input.error.title, 300);
  const message =
    boundedText(input.error.message, 1_000) ||
    boundedText(record(input.error.error_data).details, 1_000);
  return {
    event_id: eventId("error", [
      input.wabaId,
      input.phoneNumberId,
      code,
      title,
      message,
    ]),
    event_kind: "error",
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    code,
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
  };
}

function deduplicateEvents(events: NormalizedWhatsAppWebhookEvent[]): {
  events: NormalizedWhatsAppWebhookEvent[];
  collisions: number;
} {
  const unique = new Map<
    string,
    { fingerprint: string; event: NormalizedWhatsAppWebhookEvent }
  >();
  const conflicted = new Set<string>();
  let collisions = 0;

  for (const event of events) {
    if (conflicted.has(event.event_id)) continue;
    const fingerprint = JSON.stringify(event);
    const existing = unique.get(event.event_id);
    if (!existing) {
      unique.set(event.event_id, { fingerprint, event });
      continue;
    }
    if (existing.fingerprint === fingerprint) continue;

    unique.delete(event.event_id);
    conflicted.add(event.event_id);
    collisions += 1;
  }

  return {
    events: [...unique.values()].map((entry) => entry.event),
    collisions,
  };
}

/**
 * Pure, side-effect-free WhatsApp Business Platform webhook parser.
 *
 * Provider event identities are compact deterministic hashes. Raw provider
 * message ids remain separately bounded for correlation, so maximum-length
 * valid provider ids cannot overflow downstream job/persistence identities.
 * Conflicting normalized payloads claiming the same provider event identity are
 * removed and counted as malformed instead of allowing last-write-wins data.
 *
 * This contract deliberately performs no Meta network calls, does not persist
 * credentials, and is not mounted on an HTTP route. It can therefore be built
 * and tested while WhatsApp/Meta cutover remains physically disabled.
 */
export function parseWhatsAppWebhookPayload(
  payload: unknown,
): WhatsAppWebhookParseResult {
  const body = record(payload);
  const object = text(body.object);
  if (object !== "whatsapp_business_account") {
    return {
      supported: false,
      object,
      events: [],
      ignored_changes: 0,
      malformed_changes: 0,
    };
  }

  const events: NormalizedWhatsAppWebhookEvent[] = [];
  let ignoredChanges = 0;
  let malformedChanges = 0;

  for (const entryValue of list(body.entry)) {
    const entry = record(entryValue);
    const wabaId = text(entry.id);
    for (const changeValue of list(entry.changes)) {
      const change = record(changeValue);
      if (text(change.field) !== "messages") {
        ignoredChanges += 1;
        continue;
      }
      const value = record(change.value);
      const metadata = record(value.metadata);
      const phoneNumberId = text(metadata.phone_number_id);
      if (!/^\d{1,40}$/.test(wabaId) || !/^\d{1,40}$/.test(phoneNumberId)) {
        malformedChanges += 1;
        continue;
      }
      const rawDisplayPhoneNumber = text(metadata.display_phone_number);
      const displayPhoneNumber = /^[+0-9 ()-]{1,40}$/.test(rawDisplayPhoneNumber)
        ? rawDisplayPhoneNumber
        : "";
      const contactNames = contactNameByWaId(value);

      for (const messageValue of list(value.messages)) {
        const event = buildMessageEvent({
          wabaId,
          phoneNumberId,
          displayPhoneNumber,
          message: record(messageValue),
          contactNames,
        });
        if (event) events.push(event);
        else malformedChanges += 1;
      }

      for (const statusValue of list(value.statuses)) {
        const event = buildStatusEvent({
          wabaId,
          phoneNumberId,
          status: record(statusValue),
        });
        if (event) events.push(event);
        else malformedChanges += 1;
      }

      for (const errorValue of list(value.errors)) {
        const event = buildErrorEvent({
          wabaId,
          phoneNumberId,
          error: record(errorValue),
        });
        if (event) events.push(event);
        else malformedChanges += 1;
      }
    }
  }

  const deduplicated = deduplicateEvents(events);
  malformedChanges += deduplicated.collisions;
  return {
    supported: true,
    object,
    events: deduplicated.events,
    ignored_changes: ignoredChanges,
    malformed_changes: malformedChanges,
  };
}

export function whatsAppOfflineFoundationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return text(env.FAWRI_WHATSAPP_OFFLINE_FOUNDATION).toLowerCase() === "1";
}

/**
 * Live cutover is intentionally a separate switch from the offline foundation.
 * Nothing in this module consumes it; exposing the predicate makes accidental
 * future coupling testable and keeps live activation fail-closed by default.
 */
export function whatsAppLiveCutoverRequested(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return text(env.FAWRI_WHATSAPP_LIVE_CUTOVER).toLowerCase() === "1";
}
