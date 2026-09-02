import crypto from "node:crypto";
import type { EnqueueDurableJobInput } from "./durableJobQueue";
import type { WhatsAppWebhookProcessingPlan } from "./whatsappWebhookPlanner";

export type PlannedWhatsAppChannelInboundEvent = {
  id: string;
  merchant_id: string;
  channel_id: string;
  provider: "whatsapp";
  external_event_id: string;
  payload_hash: string;
  enqueue_job_id: string;
};

export type PlannedWhatsAppBackgroundJob = {
  id: string;
  enqueue: EnqueueDurableJobInput;
  payload_sha256: string;
  encrypted_payload_required: true;
};

export type WhatsAppInboundIntakeUnit = {
  event: PlannedWhatsAppChannelInboundEvent;
  job: PlannedWhatsAppBackgroundJob;
};

export type WhatsAppInboundIntakeTransactionPlan = {
  boundary: "not_persisted_not_enqueued";
  provider: "whatsapp";
  atomic_write_required: true;
  encrypted_payload_required: true;
  units: WhatsAppInboundIntakeUnit[];
};

function intakeError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deterministicId(namespace: string, ...parts: string[]): string {
  return `whatsapp-${namespace}-${sha256(
    `fawri:whatsapp:${namespace}:${parts.join("\0")}`,
  ).slice(0, 40)}`;
}

function unit(input: {
  type: string;
  eventId: string;
  merchantId: string;
  channelId: string;
  payload: Record<string, unknown>;
  maxAttempts: number;
  priority?: number;
}): WhatsAppInboundIntakeUnit {
  if (!input.channelId || input.channelId.length > 200) {
    throw intakeError(
      "WHATSAPP_INTAKE_CHANNEL_ID_INVALID",
      "WhatsApp intake channel identity is invalid",
    );
  }
  const payloadSha256 = sha256(canonical(input.payload));
  const jobId = deterministicId(
    "job",
    input.type,
    input.merchantId,
    input.channelId,
    input.eventId,
  );
  const eventRowId = deterministicId(
    "event",
    input.merchantId,
    input.channelId,
    input.eventId,
  );
  return {
    event: {
      id: eventRowId,
      merchant_id: input.merchantId,
      channel_id: input.channelId,
      provider: "whatsapp",
      external_event_id: input.eventId,
      payload_hash: payloadSha256,
      enqueue_job_id: jobId,
    },
    job: {
      id: jobId,
      enqueue: {
        type: input.type,
        dedupeKey: `whatsapp:${input.type}:${sha256(input.eventId)}`,
        merchantId: input.merchantId,
        payload: input.payload,
        priority: input.priority ?? 0,
        maxAttempts: input.maxAttempts,
      },
      payload_sha256: payloadSha256,
      encrypted_payload_required: true,
    },
  };
}

/**
 * Describes the single-transaction database boundary needed by a future live
 * WhatsApp ingress. Each provider event must atomically create its encrypted
 * background job and `channel_inbound_events` marker using the planned job id.
 * This function intentionally performs neither write and cannot bypass the
 * encrypted payload authority.
 */
export function buildWhatsAppInboundIntakeTransactionPlan(
  plan: WhatsAppWebhookProcessingPlan,
): WhatsAppInboundIntakeTransactionPlan {
  if (plan.mode !== "offline_replay") {
    throw intakeError(
      "WHATSAPP_INTAKE_PLAN_MODE_INVALID",
      "WhatsApp intake plan mode is invalid",
    );
  }
  if (
    !plan.supported &&
    (plan.inbound_messages.length > 0 ||
      plan.delivery_statuses.length > 0 ||
      plan.provider_errors.length > 0)
  ) {
    throw intakeError(
      "WHATSAPP_INTAKE_UNSUPPORTED_EVENTS",
      "Unsupported WhatsApp delivery cannot contain planned events",
    );
  }

  const units: WhatsAppInboundIntakeUnit[] = [];

  for (const message of plan.inbound_messages) {
    units.push(
      unit({
        type: "whatsapp_inbound_message",
        eventId: message.event_id,
        merchantId: message.merchant_id,
        channelId: message.channel_id,
        payload: { ...message },
        maxAttempts: 5,
      }),
    );
  }

  for (const status of plan.delivery_statuses) {
    units.push(
      unit({
        type: "whatsapp_delivery_status",
        eventId: status.event_id,
        merchantId: status.merchant_id,
        channelId: status.channel_id,
        payload: { ...status },
        maxAttempts: 5,
      }),
    );
  }

  for (const providerError of plan.provider_errors) {
    units.push(
      unit({
        type: "whatsapp_provider_error",
        eventId: providerError.event_id,
        merchantId: providerError.merchant_id,
        channelId: providerError.channel_id,
        payload: { ...providerError },
        maxAttempts: 1,
        priority: 10,
      }),
    );
  }

  const seenExternal = new Set<string>();
  for (const item of units) {
    if (seenExternal.has(item.event.external_event_id)) {
      throw intakeError(
        "WHATSAPP_INTAKE_DUPLICATE_EXTERNAL_EVENT",
        "WhatsApp intake contains a duplicate provider event identity",
      );
    }
    seenExternal.add(item.event.external_event_id);
    if (item.event.enqueue_job_id !== item.job.id) {
      throw intakeError(
        "WHATSAPP_INTAKE_JOB_LINK_INVALID",
        "WhatsApp intake event/job identity link is invalid",
      );
    }
  }

  return {
    boundary: "not_persisted_not_enqueued",
    provider: "whatsapp",
    atomic_write_required: true,
    encrypted_payload_required: true,
    units,
  };
}
