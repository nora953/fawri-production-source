import crypto from "node:crypto";
import type { WhatsAppTextSendPlan } from "./whatsappOfflineContracts";
import type { ResolvedDormantWhatsAppChannel } from "./whatsappDormantChannelResolver";
import {
  assertWhatsAppOutboundAttemptCreateInputStructure,
  assertWhatsAppOutboundAttemptPlanStructure,
} from "./whatsappOutboundRuntimeGuards";

export type WhatsAppOutboundAttemptPlan = {
  boundary: "not_sent";
  logical_send_id: string;
  attempt_id: string;
  dedupe_key: string;
  attempt_number: 1;
  merchant_id: string;
  channel_id: string;
  phone_number_id: string;
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

function phoneNumberId(value: unknown): string {
  const normalized = text(value);
  if (!/^\d{1,40}$/.test(normalized)) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_ATTEMPT_IDENTITY_INVALID",
      "WhatsApp phone number id is invalid",
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

function assertRequestMatchesPhoneNumber(
  expectedPhoneNumberId: string,
  request: WhatsAppTextSendPlan,
): void {
  const graphVersion = text(request.graph_version);
  const expectedPath = `/${graphVersion}/${expectedPhoneNumberId}/messages`;
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
      "WhatsApp outbound request does not belong to the supplied phone-number identity",
    );
  }
}

function assertFirstAttemptOnly(value: unknown): 1 {
  const attemptNumber = Number(value);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 100) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_ATTEMPT_NUMBER_INVALID",
      "WhatsApp outbound attempt number is invalid",
    );
  }
  if (attemptNumber !== 1) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_NEW_REPLY_INTENT_REQUIRED",
      "A second WhatsApp provider attempt requires a new reply intent",
    );
  }
  return 1;
}

function expectedIdentities(input: {
  merchantId: string;
  channelId: string;
  replyIntentId: string;
  request: WhatsAppTextSendPlan;
}): {
  requestSha256: string;
  logicalSendId: string;
  attemptId: string;
  dedupeKey: string;
  recipientHash: string;
} {
  const requestSha256 = digest(stableJson(input.request));
  const logicalSendDigest = digest(
    `fawri:whatsapp:logical-send:${input.merchantId}:${input.channelId}:${input.replyIntentId}`,
  );
  const logicalSendId = `whatsapp-send-${logicalSendDigest.slice(0, 40)}`;
  const attemptDigest = digest(
    `fawri:whatsapp:attempt:${logicalSendId}:1:${requestSha256}`,
  );
  return {
    requestSha256,
    logicalSendId,
    attemptId: `whatsapp-attempt-${attemptDigest.slice(0, 40)}`,
    dedupeKey: `whatsapp-send:${attemptDigest}`,
    recipientHash: digest(`fawri:whatsapp:recipient:${input.request.body.to}`).slice(0, 24),
  };
}

/**
 * Revalidates a previously planned attempt before it crosses another trust
 * boundary. This detects accidental/malicious in-memory mutation of the request,
 * recipient, routing identity, or deterministic hashes before durable dispatch.
 */
export function assertWhatsAppOutboundAttemptIntegrity(
  attempt: WhatsAppOutboundAttemptPlan,
): void {
  assertWhatsAppOutboundAttemptPlanStructure(attempt);
  if (attempt.boundary !== "not_sent" || attempt.transport_authorized !== false) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_ATTEMPT_INTEGRITY_INVALID",
      "WhatsApp outbound attempt has crossed its pre-send boundary",
    );
  }
  const merchantId = safeIdentity(attempt.merchant_id, "merchant id");
  const channelId = safeIdentity(attempt.channel_id, "channel id");
  const replyIntentId = safeIdentity(attempt.reply_intent_id, "reply intent id");
  const expectedPhoneNumberId = phoneNumberId(attempt.phone_number_id);
  assertFirstAttemptOnly(attempt.attempt_number);
  assertRequestMatchesPhoneNumber(expectedPhoneNumberId, attempt.request);

  const expected = expectedIdentities({
    merchantId,
    channelId,
    replyIntentId,
    request: attempt.request,
  });
  if (
    attempt.request_sha256 !== expected.requestSha256 ||
    attempt.logical_send_id !== expected.logicalSendId ||
    attempt.attempt_id !== expected.attemptId ||
    attempt.dedupe_key !== expected.dedupeKey ||
    attempt.recipient_hash !== expected.recipientHash
  ) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_ATTEMPT_INTEGRITY_INVALID",
      "WhatsApp outbound attempt integrity check failed",
    );
  }
}

/**
 * Creates one deterministic provider-attempt identity for one reply intent.
 * Reprocessing the same logical send produces the same dedupe key. The current
 * canonical `outbound_deliveries` authority permits one delivery per
 * merchant/inbound-event/reply-intent, so attempt number 2+ is rejected: an
 * explicitly approved corrected resend must first create a new reply intent.
 */
export function createWhatsAppOutboundAttemptPlan(input: {
  merchantId: unknown;
  replyIntentId: unknown;
  attemptNumber: unknown;
  channel: ResolvedDormantWhatsAppChannel;
  request: WhatsAppTextSendPlan;
}): WhatsAppOutboundAttemptPlan {
  assertWhatsAppOutboundAttemptCreateInputStructure(input);
  const merchantId = safeIdentity(input.merchantId, "merchant id");
  const replyIntentId = safeIdentity(input.replyIntentId, "reply intent id");
  const attemptNumber = assertFirstAttemptOnly(input.attemptNumber);
  assertDormantChannel(input.channel);
  if (input.channel.merchant_id !== merchantId) {
    throw attemptError(
      "WHATSAPP_OUTBOUND_ATTEMPT_MERCHANT_MISMATCH",
      "WhatsApp outbound channel belongs to another merchant",
    );
  }
  const normalizedPhoneNumberId = phoneNumberId(input.channel.phone_number_id);
  assertRequestMatchesPhoneNumber(normalizedPhoneNumberId, input.request);

  const expected = expectedIdentities({
    merchantId,
    channelId: input.channel.id,
    replyIntentId,
    request: input.request,
  });

  return {
    boundary: "not_sent",
    logical_send_id: expected.logicalSendId,
    attempt_id: expected.attemptId,
    dedupe_key: expected.dedupeKey,
    attempt_number: attemptNumber,
    merchant_id: merchantId,
    channel_id: input.channel.id,
    phone_number_id: normalizedPhoneNumberId,
    reply_intent_id: replyIntentId,
    request_sha256: expected.requestSha256,
    recipient_hash: expected.recipientHash,
    request: structuredClone(input.request),
    transport_authorized: false,
  };
}
