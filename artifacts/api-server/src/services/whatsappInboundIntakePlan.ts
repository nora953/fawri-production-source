import crypto from "node:crypto";
import {
  buildWhatsAppPrivilegedJobPlan,
  type WhatsAppPrivilegedJobPlan,
  type WhatsAppPrivilegedJobType,
} from "./whatsappPrivilegedJobPlan";
import { assertWhatsAppWebhookProcessingPlanRuntime } from "./whatsappRuntimeGuards";
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

export type WhatsAppInboundIntakeUnit = {
  event: PlannedWhatsAppChannelInboundEvent;
  job: WhatsAppPrivilegedJobPlan;
};

export type WhatsAppInboundIntakeTransactionPlan = {
  boundary: "not_persisted_not_enqueued";
  provider: "whatsapp";
  storage_authority: "postgres_background_jobs_encrypted_payload";
  atomic_write_required: true;
  encrypted_payload_required: true;
  units: WhatsAppInboundIntakeUnit[];
};

function intakeError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deterministicEventId(input: {
  merchantId: string;
  channelId: string;
  eventId: string;
}): string {
  return `whatsapp-event-${sha256(
    `fawri:whatsapp:event:${input.merchantId}:${input.channelId}:${input.eventId}`,
  ).slice(0, 40)}`;
}

function unit(input: {
  type: WhatsAppPrivilegedJobType;
  eventId: string;
  merchantId: string;
  channelId: string;
  payload: Record<string, unknown>;
  maxAttempts: number;
  priority?: number;
}): WhatsAppInboundIntakeUnit {
  const job = buildWhatsAppPrivilegedJobPlan({
    type: input.type,
    eventId: input.eventId,
    merchantId: input.merchantId,
    channelId: input.channelId,
    payload: input.payload,
    maxAttempts: input.maxAttempts,
    priority: input.priority,
  });
  const eventRowId = deterministicEventId({
    merchantId: job.job_row.merchant_id,
    channelId: job.channel_id,
    eventId: job.external_event_id,
  });
  return {
    event: {
      id: eventRowId,
      merchant_id: job.job_row.merchant_id,
      channel_id: job.channel_id,
      provider: "whatsapp",
      external_event_id: job.external_event_id,
      payload_hash: job.encrypted_payload.payload_sha256,
      enqueue_job_id: job.job_row.id,
    },
    job,
  };
}

/**
 * Describes the single-transaction PostgreSQL boundary required by a future
 * live WhatsApp ingress. Each provider event must atomically create:
 *
 * - a `channel_inbound_events` dedupe marker;
 * - its administrative `background_jobs` row; and
 * - its encrypted `background_job_payloads` record.
 *
 * Synthetic/manual processing plans are runtime-guarded before any item is
 * spread, hashed, cloned, or accumulated, so callers cannot bypass parser
 * budgets by constructing an oversized or accessor-bearing plan directly.
 *
 * This function performs none of those writes. It is deliberately detached
 * from the legacy JSON queue and carries plaintext only as ephemeral input to a
 * future encryption adapter; plaintext persistence is forbidden by the job
 * contract.
 */
export function buildWhatsAppInboundIntakeTransactionPlan(
  plan: WhatsAppWebhookProcessingPlan,
): WhatsAppInboundIntakeTransactionPlan {
  assertWhatsAppWebhookProcessingPlanRuntime(plan);
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
    if (
      item.event.enqueue_job_id !== item.job.job_row.id ||
      item.event.payload_hash !== item.job.encrypted_payload.payload_sha256 ||
      item.event.merchant_id !== item.job.job_row.merchant_id ||
      item.event.channel_id !== item.job.channel_id
    ) {
      throw intakeError(
        "WHATSAPP_INTAKE_JOB_LINK_INVALID",
        "WhatsApp intake event/job identity link is invalid",
      );
    }
  }

  return {
    boundary: "not_persisted_not_enqueued",
    provider: "whatsapp",
    storage_authority: "postgres_background_jobs_encrypted_payload",
    atomic_write_required: true,
    encrypted_payload_required: true,
    units,
  };
}
