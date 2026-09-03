import {
  whatsAppLiveCutoverRequested,
  whatsAppOfflineFoundationEnabled,
} from "./whatsappWebhookContract";

export type WhatsAppActivationEnvironment =
  | "development"
  | "staging"
  | "production";

export type WhatsAppActivationEvidence = {
  environment: WhatsAppActivationEnvironment;
  explicit_cutover_approved: boolean;
  deployment_revision_pinned: boolean;
  dormant_database_barrier_replaced: boolean;
  channel_identity_verified: boolean;
  business_verification_ready: boolean;
  meta_app_configuration_ready: boolean;
  credential_provider_ready: boolean;
  provider_credential_configured: boolean;
  webhook_verification_ready: boolean;
  app_secret_configured: boolean;
  durable_queue_ready: boolean;
  inbound_persistence_ready: boolean;
  reply_engine_handoff_ready: boolean;
  data_policy_ready: boolean;
  media_policy_ready: boolean;
  inbound_worker_ready: boolean;
  outbound_transport_ready: boolean;
  delivery_reconciliation_ready: boolean;
  observability_ready: boolean;
};

export type WhatsAppActivationBlocker =
  | "WHATSAPP_OFFLINE_FOUNDATION_DISABLED"
  | "WHATSAPP_LIVE_CUTOVER_NOT_REQUESTED"
  | "WHATSAPP_EXPLICIT_CUTOVER_APPROVAL_REQUIRED"
  | "WHATSAPP_DEPLOYMENT_REVISION_NOT_PINNED"
  | "WHATSAPP_DORMANT_DATABASE_BARRIER_ACTIVE"
  | "WHATSAPP_CHANNEL_IDENTITY_NOT_VERIFIED"
  | "WHATSAPP_BUSINESS_VERIFICATION_NOT_READY"
  | "WHATSAPP_META_APP_CONFIGURATION_NOT_READY"
  | "WHATSAPP_CREDENTIAL_PROVIDER_NOT_READY"
  | "WHATSAPP_PROVIDER_CREDENTIAL_NOT_CONFIGURED"
  | "WHATSAPP_WEBHOOK_VERIFICATION_NOT_READY"
  | "WHATSAPP_APP_SECRET_NOT_CONFIGURED"
  | "WHATSAPP_DURABLE_QUEUE_NOT_READY"
  | "WHATSAPP_INBOUND_PERSISTENCE_NOT_READY"
  | "WHATSAPP_REPLY_ENGINE_HANDOFF_NOT_READY"
  | "WHATSAPP_DATA_POLICY_NOT_READY"
  | "WHATSAPP_MEDIA_POLICY_NOT_READY"
  | "WHATSAPP_INBOUND_WORKER_NOT_READY"
  | "WHATSAPP_OUTBOUND_TRANSPORT_NOT_READY"
  | "WHATSAPP_DELIVERY_RECONCILIATION_NOT_READY"
  | "WHATSAPP_OBSERVABILITY_NOT_READY";

export type WhatsAppActivationReadiness = {
  mode: "dormant" | "blocked" | "activation_candidate";
  environment: WhatsAppActivationEnvironment;
  offline_foundation_enabled: boolean;
  live_cutover_requested: boolean;
  ready_for_external_activation: boolean;
  blockers: WhatsAppActivationBlocker[];
};

const BOOLEAN_EVIDENCE: Array<{
  key: Exclude<keyof WhatsAppActivationEvidence, "environment">;
  blocker: WhatsAppActivationBlocker;
}> = [
  {
    key: "explicit_cutover_approved",
    blocker: "WHATSAPP_EXPLICIT_CUTOVER_APPROVAL_REQUIRED",
  },
  {
    key: "deployment_revision_pinned",
    blocker: "WHATSAPP_DEPLOYMENT_REVISION_NOT_PINNED",
  },
  {
    key: "dormant_database_barrier_replaced",
    blocker: "WHATSAPP_DORMANT_DATABASE_BARRIER_ACTIVE",
  },
  {
    key: "channel_identity_verified",
    blocker: "WHATSAPP_CHANNEL_IDENTITY_NOT_VERIFIED",
  },
  {
    key: "business_verification_ready",
    blocker: "WHATSAPP_BUSINESS_VERIFICATION_NOT_READY",
  },
  {
    key: "meta_app_configuration_ready",
    blocker: "WHATSAPP_META_APP_CONFIGURATION_NOT_READY",
  },
  {
    key: "credential_provider_ready",
    blocker: "WHATSAPP_CREDENTIAL_PROVIDER_NOT_READY",
  },
  {
    key: "provider_credential_configured",
    blocker: "WHATSAPP_PROVIDER_CREDENTIAL_NOT_CONFIGURED",
  },
  {
    key: "webhook_verification_ready",
    blocker: "WHATSAPP_WEBHOOK_VERIFICATION_NOT_READY",
  },
  {
    key: "app_secret_configured",
    blocker: "WHATSAPP_APP_SECRET_NOT_CONFIGURED",
  },
  {
    key: "durable_queue_ready",
    blocker: "WHATSAPP_DURABLE_QUEUE_NOT_READY",
  },
  {
    key: "inbound_persistence_ready",
    blocker: "WHATSAPP_INBOUND_PERSISTENCE_NOT_READY",
  },
  {
    key: "reply_engine_handoff_ready",
    blocker: "WHATSAPP_REPLY_ENGINE_HANDOFF_NOT_READY",
  },
  {
    key: "data_policy_ready",
    blocker: "WHATSAPP_DATA_POLICY_NOT_READY",
  },
  {
    key: "media_policy_ready",
    blocker: "WHATSAPP_MEDIA_POLICY_NOT_READY",
  },
  {
    key: "inbound_worker_ready",
    blocker: "WHATSAPP_INBOUND_WORKER_NOT_READY",
  },
  {
    key: "outbound_transport_ready",
    blocker: "WHATSAPP_OUTBOUND_TRANSPORT_NOT_READY",
  },
  {
    key: "delivery_reconciliation_ready",
    blocker: "WHATSAPP_DELIVERY_RECONCILIATION_NOT_READY",
  },
  {
    key: "observability_ready",
    blocker: "WHATSAPP_OBSERVABILITY_NOT_READY",
  },
];

function assertEvidence(input: WhatsAppActivationEvidence): void {
  if (!["development", "staging", "production"].includes(input.environment)) {
    throw Object.assign(new Error("WhatsApp activation environment is invalid"), {
      code: "WHATSAPP_ACTIVATION_EVIDENCE_INVALID",
    });
  }
  for (const item of BOOLEAN_EVIDENCE) {
    if (typeof input[item.key] !== "boolean") {
      throw Object.assign(new Error("WhatsApp activation evidence is invalid"), {
        code: "WHATSAPP_ACTIVATION_EVIDENCE_INVALID",
      });
    }
  }
}

/**
 * Evaluates only readiness evidence and feature switches. Secret material is
 * intentionally represented as booleans, never as values, and this function
 * cannot activate a route, store a credential, subscribe a webhook, or send a
 * provider request. Internal persistence/data/media gates are explicit so a
 * provider cutover cannot outrun the verified offline contracts.
 */
export function assessWhatsAppActivationReadiness(
  evidence: WhatsAppActivationEvidence,
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppActivationReadiness {
  assertEvidence(evidence);
  const offlineEnabled = whatsAppOfflineFoundationEnabled(env);
  const liveRequested = whatsAppLiveCutoverRequested(env);
  const blockers: WhatsAppActivationBlocker[] = [];

  if (!offlineEnabled) blockers.push("WHATSAPP_OFFLINE_FOUNDATION_DISABLED");
  if (!liveRequested) blockers.push("WHATSAPP_LIVE_CUTOVER_NOT_REQUESTED");
  for (const item of BOOLEAN_EVIDENCE) {
    if (!evidence[item.key]) blockers.push(item.blocker);
  }

  const ready = blockers.length === 0;
  return {
    mode: ready
      ? "activation_candidate"
      : !liveRequested
        ? "dormant"
        : "blocked",
    environment: evidence.environment,
    offline_foundation_enabled: offlineEnabled,
    live_cutover_requested: liveRequested,
    ready_for_external_activation: ready,
    blockers,
  };
}
