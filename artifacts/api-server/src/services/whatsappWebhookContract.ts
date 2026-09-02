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
    text(buttonReply.title) ||
    text(buttonReply.id) ||
    text(listReply.title) ||
    text(listReply.id)
  );
}

function normalizedMessageText(message: Record<string, unknown>): string {
  const kind = safeMessageKind(message.type);
  if (kind === "text") return text(record(message.text).body);
  if (kind === "button") {
    const button = record(message.button);
    return text(button.text) || text(button.payload);
  }
  if (kind === "interactive") return normalizedInteractiveText(message);
  return "";
}

function contactNameByWaId(value: Record<string, unknown>): Map<string, string> {
  const names = new Map<string, string>();
  for (const candidate of list(value.contacts)) {
    const contact = record(candidate);
    const waId = text(contact.wa_id);
    const name = text(record(contact.profile).name);
    if (waId && name && !names.has(waId)) names.set(waId, name);
  }
  return names;
}

function errorCodes(value: unknown): string[] {
  return [
    ...new Set(
      list(value)
        .map((candidate) => text(record(candidate).code))
        .filter(Boolean),
    ),
  ];
}

function hashEvent(parts: unknown[]): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");
}

function buildMessageEvent(input: {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  message: Record<string, unknown>;
  contactNames: Map<string, string>;
}): NormalizedWhatsAppMessageEvent | null {
  const externalMessageId = text(input.message.id);
  const customerId = text(input.message.from);
  if (!input.wabaId || !input.phoneNumberId || !externalMessageId || !customerId) {
    return null;
  }

  const normalizedText = normalizedMessageText(input.message);
  const replyToMessageId = text(record(input.message.context).id);
  const timestamp = cleanTimestamp(input.message.timestamp);
  const customerName = input.contactNames.get(customerId);

  return {
    event_id: `whatsapp:${input.wabaId}:${input.phoneNumberId}:message:${externalMessageId}`,
    event_kind: "message",
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    ...(input.displayPhoneNumber
      ? { display_phone_number: input.displayPhoneNumber }
      : {}),
    external_message_id: externalMessageId,
    customer_id: customerId,
    ...(customerName ? { customer_name: customerName } : {}),
    message_kind: safeMessageKind(input.message.type),
    ...(normalizedText ? { text: normalizedText } : {}),
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
}

function buildStatusEvent(input: {
  wabaId: string;
  phoneNumberId: string;
  status: Record<string, unknown>;
}): NormalizedWhatsAppStatusEvent | null {
  const externalMessageId = text(input.status.id);
  const status = text(input.status.status).toLowerCase();
  if (!input.wabaId || !input.phoneNumberId || !externalMessageId || !status) {
    return null;
  }
  const recipientId = text(input.status.recipient_id);
  const timestamp = cleanTimestamp(input.status.timestamp);
  return {
    event_id: `whatsapp:${input.wabaId}:${input.phoneNumberId}:status:${externalMessageId}:${status}`,
    event_kind: "status",
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    external_message_id: externalMessageId,
    ...(recipientId ? { recipient_id: recipientId } : {}),
    status,
    ...(timestamp ? { timestamp } : {}),
    error_codes: errorCodes(input.status.errors),
  };
}

function buildErrorEvent(input: {
  wabaId: string;
  phoneNumberId: string;
  error: Record<string, unknown>;
}): NormalizedWhatsAppErrorEvent | null {
  const code = text(input.error.code);
  if (!input.wabaId || !input.phoneNumberId || !code) return null;
  const title = text(input.error.title);
  const message = text(input.error.message) || text(record(input.error.error_data).details);
  const digest = hashEvent([
    input.wabaId,
    input.phoneNumberId,
    code,
    title,
    message,
  ]);
  return {
    event_id: `whatsapp:${input.wabaId}:${input.phoneNumberId}:error:${digest}`,
    event_kind: "error",
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    code,
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
  };
}

/**
 * Pure, side-effect-free WhatsApp Business Platform webhook parser.
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
      if (!wabaId || !phoneNumberId) {
        malformedChanges += 1;
        continue;
      }
      const displayPhoneNumber = text(metadata.display_phone_number);
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
      }

      for (const statusValue of list(value.statuses)) {
        const event = buildStatusEvent({
          wabaId,
          phoneNumberId,
          status: record(statusValue),
        });
        if (event) events.push(event);
      }

      for (const errorValue of list(value.errors)) {
        const event = buildErrorEvent({
          wabaId,
          phoneNumberId,
          error: record(errorValue),
        });
        if (event) events.push(event);
      }
    }
  }

  const uniqueEvents = [...new Map(events.map((event) => [event.event_id, event])).values()];
  return {
    supported: true,
    object,
    events: uniqueEvents,
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
