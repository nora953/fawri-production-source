import { types as utilTypes } from "node:util";
import type {
  WhatsAppActivationEvidence,
  WhatsAppActivationEnvironment,
} from "./whatsappActivationReadiness";

const ACTIVATION_SWITCH_KEYS = [
  "FAWRI_WHATSAPP_OFFLINE_FOUNDATION",
  "FAWRI_WHATSAPP_LIVE_CUTOVER",
] as const;

const EVIDENCE_BOOLEAN_KEYS = [
  "explicit_cutover_approved",
  "deployment_revision_pinned",
  "dormant_database_barrier_replaced",
  "channel_identity_verified",
  "business_verification_ready",
  "meta_app_configuration_ready",
  "credential_provider_ready",
  "provider_credential_configured",
  "webhook_verification_ready",
  "webhook_signature_verification_ready",
  "app_secret_configured",
  "durable_queue_ready",
  "encrypted_job_payload_authority_ready",
  "inbound_persistence_ready",
  "reply_engine_handoff_ready",
  "data_policy_ready",
  "media_policy_ready",
  "inbound_worker_ready",
  "outbound_dispatch_persistence_ready",
  "outbound_transport_ready",
  "delivery_reconciliation_ready",
  "observability_ready",
] as const satisfies ReadonlyArray<
  Exclude<keyof WhatsAppActivationEvidence, "environment">
>;

const EVIDENCE_KEYS = ["environment", ...EVIDENCE_BOOLEAN_KEYS] as const;
const ACTIVATION_ENVIRONMENTS = new Set<WhatsAppActivationEnvironment>([
  "development",
  "staging",
  "production",
]);

function guardError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: "WHATSAPP_ACTIVATION_EVIDENCE_INVALID",
  });
}

function fail(message: string): never {
  throw guardError(message);
}

function plainEvidenceRecord(value: unknown): Record<string, unknown> {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      fail("WhatsApp activation evidence must be a plain object");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail("WhatsApp activation evidence cannot contain symbol properties");
    }
    const names = Object.getOwnPropertyNames(value);
    const keys = Object.keys(value);
    if (names.length !== keys.length) {
      fail("WhatsApp activation evidence cannot contain hidden properties");
    }
    if (keys.length !== EVIDENCE_KEYS.length) {
      fail("WhatsApp activation evidence has an unexpected field count");
    }
    const allowed = new Set<string>(EVIDENCE_KEYS);
    for (const key of keys) {
      if (!allowed.has(key)) {
        fail(`WhatsApp activation evidence contains unsupported field ${key}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail("WhatsApp activation evidence must contain data properties only");
      }
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if ((error as { code?: string })?.code === "WHATSAPP_ACTIVATION_EVIDENCE_INVALID") {
      throw error;
    }
    fail("WhatsApp activation evidence could not be inspected safely");
  }
}

function ownDataValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
    fail(`WhatsApp activation evidence field ${key} is invalid`);
  }
  return descriptor.value;
}

/**
 * Rejects proxies, accessors, hidden/symbol properties, missing/extra fields,
 * and non-boolean evidence before readiness code reads any evidence value.
 */
export function assertWhatsAppActivationEvidenceStructure(
  value: unknown,
): asserts value is WhatsAppActivationEvidence {
  const record = plainEvidenceRecord(value);
  const environment = ownDataValue(record, "environment");
  if (
    typeof environment !== "string" ||
    !ACTIVATION_ENVIRONMENTS.has(environment as WhatsAppActivationEnvironment)
  ) {
    fail("WhatsApp activation environment is invalid");
  }

  for (const key of EVIDENCE_BOOLEAN_KEYS) {
    if (typeof ownDataValue(record, key) !== "boolean") {
      fail(`WhatsApp activation evidence field ${key} must be boolean`);
    }
  }
}

/**
 * Copies only the two inert feature switches required by readiness evaluation.
 * Accessors/proxies are rejected without invocation, and inherited values are
 * ignored, so a synthetic environment cannot execute code during flag reads.
 */
export function snapshotWhatsAppActivationSwitches(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  try {
    if (!env || typeof env !== "object" || utilTypes.isProxy(env)) {
      fail("WhatsApp activation environment switches are invalid");
    }
    const snapshot: NodeJS.ProcessEnv = {};
    for (const key of ACTIVATION_SWITCH_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(env, key);
      if (!descriptor) continue;
      if (!("value" in descriptor) || !descriptor.enumerable) {
        fail(`WhatsApp activation switch ${key} must be a data property`);
      }
      const value = descriptor.value;
      if (value !== undefined && typeof value !== "string") {
        fail(`WhatsApp activation switch ${key} must be a string`);
      }
      if (value !== undefined) snapshot[key] = value;
    }
    return snapshot;
  } catch (error) {
    if ((error as { code?: string })?.code === "WHATSAPP_ACTIVATION_EVIDENCE_INVALID") {
      throw error;
    }
    fail("WhatsApp activation environment switches could not be inspected safely");
  }
}
