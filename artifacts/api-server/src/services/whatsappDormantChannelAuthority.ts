import {
  type OperationalSqlClient,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import {
  normalizeWhatsAppChannelIdentity,
  whatsAppChannelKey,
  type WhatsAppChannelIdentity,
} from "./whatsappOfflineContracts";

export type DormantWhatsAppChannelSummary = {
  id: string;
  merchant_id: string;
  platform: "whatsapp";
  status: "pending";
  version: number;
  waba_id: string;
  phone_number_id: string;
  display_phone_number?: string;
  integration_mode: "dormant_offline";
};

type DormantWhatsAppChannelRow = {
  id: string;
  merchant_id: string;
  platform: string;
  status: string;
  version: number;
  whatsapp_business_account_id: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_display_phone_number: string | null;
  credential_ciphertext: string | null;
  credential_nonce: string | null;
  credential_auth_tag: string | null;
  credential_key_id: string | null;
  credential_algorithm: string | null;
  credential_expires_at: Date | string | null;
  webhook_subscribed_at: Date | string | null;
  last_webhook_at: Date | string | null;
  connected_at: Date | string | null;
  metadata: Record<string, unknown> | null;
};

function authorityError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function sqlState(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code || "").trim();
}

function dormantRecord(input: {
  merchantId: unknown;
  wabaId: unknown;
  phoneNumberId: unknown;
  displayPhoneNumber?: unknown;
}): { id: string; identity: WhatsAppChannelIdentity } {
  const identity = normalizeWhatsAppChannelIdentity(input);
  return {
    id: whatsAppChannelKey(identity),
    identity,
  };
}

function safeStoredDisplayPhoneNumber(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  if (normalized.length > 40 || !/^[+0-9 ()-]+$/.test(normalized)) {
    throw authorityError(
      "WHATSAPP_CHANNEL_STATE_INVALID",
      "Stored WhatsApp display phone number is invalid",
    );
  }
  return normalized;
}

function assertDormantRow(
  row: DormantWhatsAppChannelRow,
  expected: { id: string; identity: WhatsAppChannelIdentity },
): DormantWhatsAppChannelSummary {
  const identity = expected.identity;
  if (
    row.id !== expected.id ||
    row.merchant_id !== identity.merchant_id ||
    row.platform !== "whatsapp" ||
    row.whatsapp_business_account_id !== identity.waba_id ||
    row.whatsapp_phone_number_id !== identity.phone_number_id
  ) {
    throw authorityError(
      "WHATSAPP_CHANNEL_MAPPING_CONFLICT",
      "WhatsApp channel identity is already mapped differently",
    );
  }

  const integrationMode = String(row.metadata?.integration_mode ?? "").trim();
  if (integrationMode !== "dormant_offline") {
    throw authorityError(
      "WHATSAPP_CHANNEL_MODE_INVALID",
      "WhatsApp channel does not carry the exact dormant integration marker",
    );
  }

  const hasLiveState =
    row.status !== "pending" ||
    Boolean(row.credential_ciphertext) ||
    Boolean(row.credential_nonce) ||
    Boolean(row.credential_auth_tag) ||
    Boolean(row.credential_key_id) ||
    Boolean(row.credential_algorithm) ||
    Boolean(row.credential_expires_at) ||
    Boolean(row.webhook_subscribed_at) ||
    Boolean(row.last_webhook_at) ||
    Boolean(row.connected_at);

  if (hasLiveState) {
    throw authorityError(
      "WHATSAPP_DORMANT_STATE_VIOLATION",
      "WhatsApp channel cannot be treated as dormant after live state appears",
    );
  }

  if (!Number.isInteger(row.version) || row.version < 1) {
    throw authorityError(
      "WHATSAPP_CHANNEL_STATE_INVALID",
      "WhatsApp channel version is invalid",
    );
  }

  const displayPhoneNumber = safeStoredDisplayPhoneNumber(
    row.whatsapp_display_phone_number,
  );
  if (
    identity.display_phone_number &&
    displayPhoneNumber &&
    identity.display_phone_number !== displayPhoneNumber
  ) {
    throw authorityError(
      "WHATSAPP_CHANNEL_MAPPING_CONFLICT",
      "WhatsApp display phone number does not match the dormant channel identity",
    );
  }

  return {
    id: row.id,
    merchant_id: row.merchant_id,
    platform: "whatsapp",
    status: "pending",
    version: row.version,
    waba_id: row.whatsapp_business_account_id,
    phone_number_id: row.whatsapp_phone_number_id,
    ...(displayPhoneNumber ? { display_phone_number: displayPhoneNumber } : {}),
    integration_mode: "dormant_offline",
  };
}

/**
 * Persists only a dormant WhatsApp identity. It cannot store credentials,
 * subscribe a webhook, mark a channel connected, or contact an external
 * provider. The database constraint added with migration 0012 enforces the
 * same boundary even if this function is bypassed.
 */
export async function persistDormantWhatsAppChannelWithClient(
  client: OperationalSqlClient,
  input: {
    merchantId: unknown;
    wabaId: unknown;
    phoneNumberId: unknown;
    displayPhoneNumber?: unknown;
  },
): Promise<DormantWhatsAppChannelSummary> {
  const expected = dormantRecord(input);
  const identity = expected.identity;
  let inserted: DormantWhatsAppChannelRow | undefined;

  try {
    const result = await client.query<DormantWhatsAppChannelRow>(
      `INSERT INTO merchant_channels
        (id, merchant_id, platform, status, version,
         whatsapp_business_account_id, whatsapp_phone_number_id,
         whatsapp_display_phone_number, metadata, created_at, updated_at)
       VALUES
        ($1, $2, 'whatsapp'::channel_platform, 'pending'::channel_status, 1,
         $3, $4, $5, $6::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING
       RETURNING id, merchant_id, platform::text AS platform,
                 status::text AS status, version,
                 whatsapp_business_account_id, whatsapp_phone_number_id,
                 whatsapp_display_phone_number,
                 credential_ciphertext, credential_nonce, credential_auth_tag,
                 credential_key_id, credential_algorithm, credential_expires_at,
                 webhook_subscribed_at, last_webhook_at, connected_at, metadata`,
      [
        expected.id,
        identity.merchant_id,
        identity.waba_id,
        identity.phone_number_id,
        identity.display_phone_number || null,
        JSON.stringify({ integration_mode: "dormant_offline" }),
      ],
    );
    inserted = result.rows[0];
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw authorityError(
        "WHATSAPP_PHONE_NUMBER_ALREADY_MAPPED",
        "WhatsApp phone number identity is already assigned",
      );
    }
    throw error;
  }

  if (inserted) return assertDormantRow(inserted, expected);

  const existing = await client.query<DormantWhatsAppChannelRow>(
    `SELECT id, merchant_id, platform::text AS platform,
            status::text AS status, version,
            whatsapp_business_account_id, whatsapp_phone_number_id,
            whatsapp_display_phone_number,
            credential_ciphertext, credential_nonce, credential_auth_tag,
            credential_key_id, credential_algorithm, credential_expires_at,
            webhook_subscribed_at, last_webhook_at, connected_at, metadata
       FROM merchant_channels
      WHERE merchant_id = $1 AND id = $2
      LIMIT 1
      FOR UPDATE`,
    [identity.merchant_id, expected.id],
  );
  const row = existing.rows[0];
  if (!row) {
    throw authorityError(
      "WHATSAPP_CHANNEL_MAPPING_CONFLICT",
      "WhatsApp channel identity could not be reconciled safely",
    );
  }
  return assertDormantRow(row, expected);
}

export async function registerDormantWhatsAppChannelAuthoritative(input: {
  merchantId: unknown;
  wabaId: unknown;
  phoneNumberId: unknown;
  displayPhoneNumber?: unknown;
}): Promise<DormantWhatsAppChannelSummary> {
  const expected = dormantRecord(input);
  return withMerchantOperationalTransaction(
    expected.identity.merchant_id,
    (client) => persistDormantWhatsAppChannelWithClient(client, input),
  );
}
