import assert from "node:assert/strict";
import test from "node:test";
import {
  assessWhatsAppActivationReadiness,
  type WhatsAppActivationEvidence,
} from "../src/services/whatsappActivationReadiness";

function evidence(overrides: Partial<WhatsAppActivationEvidence> = {}): WhatsAppActivationEvidence {
  return {
    environment: "staging",
    explicit_cutover_approved: true,
    deployment_revision_pinned: true,
    dormant_database_barrier_replaced: true,
    channel_identity_verified: true,
    business_verification_ready: true,
    meta_app_configuration_ready: true,
    credential_provider_ready: true,
    provider_credential_configured: true,
    webhook_verification_ready: true,
    app_secret_configured: true,
    durable_queue_ready: true,
    inbound_persistence_ready: true,
    reply_engine_handoff_ready: true,
    data_policy_ready: true,
    media_policy_ready: true,
    inbound_worker_ready: true,
    outbound_transport_ready: true,
    delivery_reconciliation_ready: true,
    observability_ready: true,
    ...overrides,
  };
}

test("readiness remains dormant while live cutover is not explicitly requested", () => {
  const result = assessWhatsAppActivationReadiness(evidence(), {
    FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1",
  } as NodeJS.ProcessEnv);
  assert.equal(result.mode, "dormant");
  assert.equal(result.ready_for_external_activation, false);
  assert.deepEqual(result.blockers, ["WHATSAPP_LIVE_CUTOVER_NOT_REQUESTED"]);
});

test("dormant database barrier independently blocks activation", () => {
  const result = assessWhatsAppActivationReadiness(
    evidence({ dormant_database_barrier_replaced: false }),
    {
      FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1",
      FAWRI_WHATSAPP_LIVE_CUTOVER: "1",
    } as NodeJS.ProcessEnv,
  );
  assert.equal(result.mode, "blocked");
  assert.equal(result.ready_for_external_activation, false);
  assert.ok(result.blockers.includes("WHATSAPP_DORMANT_DATABASE_BARRIER_ACTIVE"));
});

test("every external dependency must be explicitly evidenced", () => {
  const result = assessWhatsAppActivationReadiness(
    evidence({
      credential_provider_ready: false,
      provider_credential_configured: false,
      webhook_verification_ready: false,
      durable_queue_ready: false,
      outbound_transport_ready: false,
    }),
    {
      FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1",
      FAWRI_WHATSAPP_LIVE_CUTOVER: "1",
    } as NodeJS.ProcessEnv,
  );
  assert.equal(result.ready_for_external_activation, false);
  assert.ok(result.blockers.includes("WHATSAPP_CREDENTIAL_PROVIDER_NOT_READY"));
  assert.ok(result.blockers.includes("WHATSAPP_PROVIDER_CREDENTIAL_NOT_CONFIGURED"));
  assert.ok(result.blockers.includes("WHATSAPP_WEBHOOK_VERIFICATION_NOT_READY"));
  assert.ok(result.blockers.includes("WHATSAPP_DURABLE_QUEUE_NOT_READY"));
  assert.ok(result.blockers.includes("WHATSAPP_OUTBOUND_TRANSPORT_NOT_READY"));
});

test("internal persistence, reply, data, and media gates independently block cutover", () => {
  const result = assessWhatsAppActivationReadiness(
    evidence({
      inbound_persistence_ready: false,
      reply_engine_handoff_ready: false,
      data_policy_ready: false,
      media_policy_ready: false,
    }),
    {
      FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1",
      FAWRI_WHATSAPP_LIVE_CUTOVER: "1",
    } as NodeJS.ProcessEnv,
  );
  assert.equal(result.mode, "blocked");
  assert.ok(result.blockers.includes("WHATSAPP_INBOUND_PERSISTENCE_NOT_READY"));
  assert.ok(result.blockers.includes("WHATSAPP_REPLY_ENGINE_HANDOFF_NOT_READY"));
  assert.ok(result.blockers.includes("WHATSAPP_DATA_POLICY_NOT_READY"));
  assert.ok(result.blockers.includes("WHATSAPP_MEDIA_POLICY_NOT_READY"));
});

test("complete evidence produces only an activation candidate, not activation", () => {
  const result = assessWhatsAppActivationReadiness(evidence(), {
    FAWRI_WHATSAPP_OFFLINE_FOUNDATION: "1",
    FAWRI_WHATSAPP_LIVE_CUTOVER: "1",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(result, {
    mode: "activation_candidate",
    environment: "staging",
    offline_foundation_enabled: true,
    live_cutover_requested: true,
    ready_for_external_activation: true,
    blockers: [],
  });
});

test("readiness accepts no secret values", () => {
  const serializedKeys = Object.keys(evidence()).join(" ");
  assert.equal(serializedKeys.includes("token"), false);
  assert.equal(serializedKeys.includes("password"), false);
  assert.equal(serializedKeys.includes("secret_value"), false);
});
