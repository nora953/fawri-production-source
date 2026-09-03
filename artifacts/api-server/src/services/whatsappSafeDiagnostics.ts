import crypto from "node:crypto";
import {
  assertNormalizedWhatsAppWebhookEventRuntime,
  assertWhatsAppWebhookProcessingPlanRuntime,
} from "./whatsappRuntimeGuards";
import type { NormalizedWhatsAppWebhookEvent } from "./whatsappWebhookContract";
import type { WhatsAppWebhookProcessingPlan } from "./whatsappWebhookPlanner";

export type SafeWhatsAppEventDiagnostic = {
  event_hash: string;
  event_kind: NormalizedWhatsAppWebhookEvent["event_kind"];
  channel_hash: string;
  external_message_hash?: string;
  customer_hash?: string;
  status?: string;
  provider_error_codes?: string[];
};

export type SafeWhatsAppPlanDiagnostic = {
  mode: WhatsAppWebhookProcessingPlan["mode"];
  supported: boolean;
  provider_object: string;
  inbound_message_count: number;
  delivery_status_count: number;
  provider_error_count: number;
  ignored_change_count: number;
  malformed_change_count: number;
  duplicate_event_count: number;
  merchant_hashes: string[];
  channel_hashes: string[];
};

function hash(value: string, namespace: string): string {
  return crypto
    .createHash("sha256")
    .update(`fawri:whatsapp:${namespace}:${value}`)
    .digest("hex")
    .slice(0, 24);
}

function safeCode(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return /^[A-Za-z0-9_.:-]{1,160}$/.test(normalized)
    ? normalized
    : "WHATSAPP_PROVIDER_ERROR_REDACTED";
}

/**
 * Builds redacted event diagnostics only after a coercion-free runtime shape
 * guard has validated bounded provider identities and event metadata. Synthetic
 * accessor/proxy/oversized events fail before any diagnostic field is hashed.
 */
export function safeWhatsAppEventDiagnostic(
  event: NormalizedWhatsAppWebhookEvent,
): SafeWhatsAppEventDiagnostic {
  assertNormalizedWhatsAppWebhookEventRuntime(event);
  const diagnostic: SafeWhatsAppEventDiagnostic = {
    event_hash: hash(event.event_id, "event"),
    event_kind: event.event_kind,
    channel_hash: hash(
      `${event.waba_id}:${event.phone_number_id}`,
      "channel",
    ),
  };

  if (event.event_kind === "message") {
    diagnostic.external_message_hash = hash(
      event.external_message_id,
      "message",
    );
    diagnostic.customer_hash = hash(event.customer_id, "customer");
    return diagnostic;
  }

  if (event.event_kind === "status") {
    diagnostic.external_message_hash = hash(
      event.external_message_id,
      "message",
    );
    diagnostic.status = safeCode(event.status.toLowerCase());
    diagnostic.provider_error_codes = event.error_codes.map(safeCode);
    return diagnostic;
  }

  diagnostic.provider_error_codes = [safeCode(event.code)];
  return diagnostic;
}

/**
 * Builds plan-level diagnostics only after the processing-plan runtime guard has
 * bounded all collections and validated plain data properties. This prevents a
 * manually constructed plan from forcing unbounded spreads/iteration or from
 * executing accessors while diagnostics are being produced.
 */
export function safeWhatsAppPlanDiagnostic(
  plan: WhatsAppWebhookProcessingPlan,
): SafeWhatsAppPlanDiagnostic {
  assertWhatsAppWebhookProcessingPlanRuntime(plan);
  const merchantHashes = new Set<string>();
  const channelHashes = new Set<string>();

  for (const item of [
    ...plan.inbound_messages,
    ...plan.delivery_statuses,
    ...plan.provider_errors,
  ]) {
    merchantHashes.add(hash(item.merchant_id, "merchant"));
    channelHashes.add(hash(String(item.channel_id), "channel-row"));
  }

  return {
    mode: plan.mode,
    supported: plan.supported,
    provider_object: safeCode(plan.provider_object),
    inbound_message_count: plan.inbound_messages.length,
    delivery_status_count: plan.delivery_statuses.length,
    provider_error_count: plan.provider_errors.length,
    ignored_change_count: plan.ignored_changes,
    malformed_change_count: plan.malformed_changes,
    duplicate_event_count: plan.duplicate_events,
    merchant_hashes: [...merchantHashes].sort(),
    channel_hashes: [...channelHashes].sort(),
  };
}
