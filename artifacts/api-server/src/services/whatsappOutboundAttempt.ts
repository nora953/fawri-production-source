import crypto from "node:crypto";
import type { WhatsAppTextSendPlan } from "./whatsappOfflineContracts";
import type { ResolvedDormantWhatsAppChannel } from "./whatsappDormantChannelResolver";

export type WhatsAppOutboundAttemptPlan = {
  boundary: "not_sent";
  logical_send_id: string;
  attempt_id: string;
  dedupe_key: string;
  attempt_number: number;
  merchant_id: string;
  channel_id: string;
  reply_intent_id: string;
  request_sha256: string;
  recipient_hash: string;
  request: WhatsAppTextSendPlan;
  transport_authorized: false;
};

function attemptError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function text(value: unknown): string {
  return String(value ?? "").trim();
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

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeIdentity(value: unknown, label: string): string {
  const normalized = text(value);
  if (!normalized || normalized.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_ATTEMPT_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function assertDormantChannel(channel: ResolvedDormantWhatsAppChannel): void {
  if (
    channel.platform !== "whatsapp" ||
    channel.status !== "pending" ||
    channel.integration_mode !== "dormant_offline" ||
    !/^\d{1,40}$/.test(channel.waba_id) ||
    !/^\d{1,40}$/.test(channel.phone_number_id)
  ) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_CHANNEL_STATE_INVALID",
      "WhatsApp outbound channel is not a valid dormant channel",
    );
  }
}

function assertRequestMatchesChannel(
  channel: ResolvedDormantWhatsAppChannel,
  request: WhatsAppTextSendPlan,
): void {
  const graphVersion = text(request.graph_version);
  const expectedPath = `/${graphVersion}/${channel.phone_number_id}/messages`;
  if (
    request.method !== "POST" ||
    !/^v\d{1,3}\.\d{1,3}$/.test(graphVersion) ||
    request.path !== expectedPath ||
    request.body.messaging_product !== "whatsapp" ||
    request.body.recipient_type !== "individual" ||
    request.body.type !== "text" ||
    request.body.text.preview_url !== false ||
    !request.body.text.body ||
    request.body.text.body.length > 4_000 ||
    !/^\d{6,20}$/.test(request.body.to)
  ) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_REQUEST_CHANNEL_MISMATCH",
      "WhatsApp outbound request does not belong to the supplied channel",
    );
  }
}

/**
 * Creates a deterministic logical-send/attempt identity before any transport
 * exists. Reprocessing the same attempt produces the same dedupe key. A later
 * confirmed-failure retry must use a larger attempt number and pass the
 * separate retry policy; nothing here can send or authorize a provider call.
 */
export function createWhatsAppOutboundAttemptPlan(input: {
  merchantId: unknown;
  replyIntentId: unknown;
  attemptNumber: unknown;
  channel: ResolvedDormantWhatsAppChannel;
  request: WhatsAppTextSendPlan;
}): WhatsAppOutboundAttemptPlan {
  const merchantId = safeIdentity(input.merchantId, "merchant id");
  const replyIntentId = safeIdentity(input.replyIntentId, "reply intent id");
  const attemptNumber = Number(input.attemptNumber);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 100) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_ATTEMPT_NUMBER_INVALID",
      "WhatsApp outbound attempt number is invalid",
    );
  }
  assertDormantChannel(input.channel);
  if (input.channel.merchant_id !== merchantId) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_ATTEMPT_MERCHANT_MISMATCH",
      "WhatsApp outbound channel belongs to another merchant",
    );
  }
  assertRequestMatchesChannel(input.channel, input.request);

  const requestSha256 = digest(stableJson(input.request));
  const logicalSendDigest = digest(
    `fawri:whatsapp:logical-send:${merchantId}:${input.channel.id}:${replyIntentId}`,
  );
  const logicalSendId = `whatsapp-send-${logicalSendDigest.slice(0, 40)}`;
  const attemptDigest = digest(
    `fawri:whatsapp:attempt:${logicalSendId}:${attemptNumber}:${requestSha256}`,
  );
  const attemptId = `whatsapp-attempt-${attemptDigest.slice(0, 40)}`;

  return {
    boundary: "not_sent",
    logical_send_id: logicalSendId,
    attempt_id: attemptId,
    dedupe_key: `whatsapp-send:${attemptDigest}`,
    attempt_number: attemptNumber,
    merchant_id: merchantId,
    channel_id: input.channel.id,
    reply_intent_id: replyIntentId,
    request_sha256: requestSha256,
    recipient_hash: digest(`fawri:whatsapp:recipient:${input.request.body.to}`).slice(0, 24),
    request: structuredClone(input.request),
    transport_authorized: false,
  };
}
