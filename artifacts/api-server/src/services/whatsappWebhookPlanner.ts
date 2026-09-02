import {
  buildWhatsAppInboundMessageJob,
  type WhatsAppInboundMessageJob,
} from "./whatsappOfflineContracts";
import type {
  NormalizedWhatsAppErrorEvent,
  NormalizedWhatsAppStatusEvent,
  NormalizedWhatsAppWebhookEvent,
  WhatsAppWebhookParseResult,
} from "./whatsappWebhookContract";
import type { ResolvedDormantWhatsAppChannel } from "./whatsappDormantChannelResolver";

export type WhatsAppWebhookChannelResolver = (input: {
  wabaId: string;
  phoneNumberId: string;
}) => Promise<ResolvedDormantWhatsAppChannel>;

export type WhatsAppDeliveryStatusPlan = {
  event_id: string;
  merchant_id: string;
  channel_id: string;
  waba_id: string;
  phone_number_id: string;
  external_message_id: string;
  status: string;
  recipient_id?: string;
  provider_timestamp?: string;
  error_codes: string[];
};

export type WhatsAppProviderErrorPlan = {
  event_id: string;
  merchant_id: string;
  channel_id: string;
  waba_id: string;
  phone_number_id: string;
  code: string;
};

export type WhatsAppWebhookProcessingPlan = {
  mode: "offline_replay";
  supported: boolean;
  provider_object: string;
  inbound_messages: WhatsAppInboundMessageJob[];
  delivery_statuses: WhatsAppDeliveryStatusPlan[];
  provider_errors: WhatsAppProviderErrorPlan[];
  ignored_changes: number;
  malformed_changes: number;
  duplicate_events: number;
};

type PlannerError = Error & { code: string };

function plannerError(code: string, message: string): PlannerError {
  return Object.assign(new Error(message), { code });
}

function resolutionKey(event: NormalizedWhatsAppWebhookEvent): string {
  return `${event.waba_id}:${event.phone_number_id}`;
}

function assertResolvedChannel(
  event: NormalizedWhatsAppWebhookEvent,
  channel: ResolvedDormantWhatsAppChannel,
): void {
  if (
    channel.platform !== "whatsapp" ||
    channel.status !== "pending" ||
    channel.integration_mode !== "dormant_offline" ||
    channel.waba_id !== event.waba_id ||
    channel.phone_number_id !== event.phone_number_id
  ) {
    throw plannerError(
      "WHATSAPP_WEBHOOK_CHANNEL_MAPPING_MISMATCH",
      "WhatsApp webhook event does not match the resolved dormant channel",
    );
  }
}

function statusPlan(
  event: NormalizedWhatsAppStatusEvent,
  channel: ResolvedDormantWhatsAppChannel,
): WhatsAppDeliveryStatusPlan {
  return {
    event_id: event.event_id,
    merchant_id: channel.merchant_id,
    channel_id: channel.id,
    waba_id: event.waba_id,
    phone_number_id: event.phone_number_id,
    external_message_id: event.external_message_id,
    status: event.status,
    ...(event.recipient_id ? { recipient_id: event.recipient_id } : {}),
    ...(event.timestamp ? { provider_timestamp: event.timestamp } : {}),
    error_codes: [...new Set(event.error_codes)],
  };
}

function errorPlan(
  event: NormalizedWhatsAppErrorEvent,
  channel: ResolvedDormantWhatsAppChannel,
): WhatsAppProviderErrorPlan {
  return {
    event_id: event.event_id,
    merchant_id: channel.merchant_id,
    channel_id: channel.id,
    waba_id: event.waba_id,
    phone_number_id: event.phone_number_id,
    code: event.code,
  };
}

function eventFingerprint(event: NormalizedWhatsAppWebhookEvent): string {
  return JSON.stringify(event);
}

/**
 * Converts normalized WhatsApp webhook events into queue- and reconciliation-
 * ready plans. It deliberately performs no enqueue, persistence, transport, or
 * provider call. Channel resolution is injected so offline fixtures and a
 * future authenticated ingress can share the same fail-closed planner.
 */
export async function planWhatsAppWebhookProcessing(input: {
  parsed: WhatsAppWebhookParseResult;
  resolveChannel: WhatsAppWebhookChannelResolver;
}): Promise<WhatsAppWebhookProcessingPlan> {
  const base: WhatsAppWebhookProcessingPlan = {
    mode: "offline_replay",
    supported: input.parsed.supported,
    provider_object: input.parsed.object,
    inbound_messages: [],
    delivery_statuses: [],
    provider_errors: [],
    ignored_changes: input.parsed.ignored_changes,
    malformed_changes: input.parsed.malformed_changes,
    duplicate_events: 0,
  };

  if (!input.parsed.supported) return base;
  if (input.parsed.object !== "whatsapp_business_account") {
    throw plannerError(
      "WHATSAPP_WEBHOOK_OBJECT_MISMATCH",
      "Supported WhatsApp delivery reported an unexpected provider object",
    );
  }

  const seen = new Map<string, string>();
  const channelCache = new Map<string, ResolvedDormantWhatsAppChannel>();

  for (const event of input.parsed.events) {
    const fingerprint = eventFingerprint(event);
    const existingFingerprint = seen.get(event.event_id);
    if (existingFingerprint) {
      if (existingFingerprint !== fingerprint) {
        throw plannerError(
          "WHATSAPP_EVENT_ID_COLLISION",
          "WhatsApp event identity collision was detected",
        );
      }
      base.duplicate_events += 1;
      continue;
    }
    seen.set(event.event_id, fingerprint);

    const key = resolutionKey(event);
    let channel = channelCache.get(key);
    if (!channel) {
      try {
        channel = await input.resolveChannel({
          wabaId: event.waba_id,
          phoneNumberId: event.phone_number_id,
        });
      } catch (error) {
        const causeCode = String((error as { code?: unknown }).code || "").trim();
        throw Object.assign(
          plannerError(
            "WHATSAPP_WEBHOOK_CHANNEL_RESOLUTION_FAILED",
            "WhatsApp webhook channel could not be resolved safely",
          ),
          { cause_code: causeCode || "WHATSAPP_CHANNEL_RESOLUTION_FAILED" },
        );
      }
      assertResolvedChannel(event, channel);
      channelCache.set(key, channel);
    } else {
      assertResolvedChannel(event, channel);
    }

    if (event.event_kind === "message") {
      base.inbound_messages.push(
        buildWhatsAppInboundMessageJob({
          identity: {
            merchant_id: channel.merchant_id,
            waba_id: channel.waba_id,
            phone_number_id: channel.phone_number_id,
            ...(channel.display_phone_number
              ? { display_phone_number: channel.display_phone_number }
              : {}),
          },
          event,
        }),
      );
      continue;
    }

    if (event.event_kind === "status") {
      base.delivery_statuses.push(statusPlan(event, channel));
      continue;
    }

    base.provider_errors.push(errorPlan(event, channel));
  }

  return base;
}
