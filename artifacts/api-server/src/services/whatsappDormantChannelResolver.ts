import {
  type OperationalSqlClient,
  withOperationalTransaction,
} from "./operationalPostgresAuthority";

export type ResolvedDormantWhatsAppChannel = {
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

type DormantResolutionRow = {
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

function resolverError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function metaNumericId(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!/^\d{1,40}$/.test(normalized)) {
    throw resolverError(
      "WHATSAPP_CHANNEL_IDENTITY_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function localIdentity(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (
    !normalized ||
    normalized.length > 200 ||
    /[\r\n\u0000]/.test(normalized)
  ) {
    throw resolverError(
      "WHATSAPP_CHANNEL_STATE_INVALID",
      `${label} is invalid`,
    );
  }
  return normalized;
}

function displayPhoneNumber(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  if (!normalized) return undefined;
  if (normalized.length > 40 || !/^[+0-9 ()-]+$/.test(normalized)) {
    throw resolverError(
      "WHATSAPP_CHANNEL_STATE_INVALID",
      "WhatsApp display phone number is invalid",
    );
  }
  return normalized;
}

function hasLiveState(row: DormantResolutionRow): boolean {
  return (
    row.status !== "pending" ||
    Boolean(row.credential_ciphertext) ||
    Boolean(row.credential_nonce) ||
    Boolean(row.credential_auth_tag) ||
    Boolean(row.credential_key_id) ||
    Boolean(row.credential_algorithm) ||
    Boolean(row.credential_expires_at) ||
    Boolean(row.webhook_subscribed_at) ||
    Boolean(row.last_webhook_at) ||
    Boolean(row.connected_at)
  );
}

function resolved(row: DormantResolutionRow): ResolvedDormantWhatsAppChannel {
  if (row.platform !== "whatsapp" || hasLiveState(row)) {
    throw resolverError(
      "WHATSAPP_DORMANT_STATE_VIOLATION",
      "WhatsApp channel mapping is not safely dormant",
    );
  }
  const channelId = localIdentity(row.id, "WhatsApp channel id");
  const merchantId = localIdentity(row.merchant_id, "merchant id");
  const wabaId = metaNumericId(
    row.whatsapp_business_account_id,
    "stored WhatsApp business account id",
  );
  const phoneNumberId = metaNumericId(
    row.whatsapp_phone_number_id,
    "stored WhatsApp phone number id",
  );
  if (!Number.isInteger(row.version) || row.version < 1) {
    throw resolverError(
      "WHATSAPP_CHANNEL_STATE_INVALID",
      "WhatsApp channel version is invalid",
    );
  }
  const mode = String(row.metadata?.integration_mode ?? "").trim();
  if (mode !== "dormant_offline") {
    throw resolverError(
      "WHATSAPP_CHANNEL_MODE_INVALID",
      "WhatsApp channel integration mode is not explicitly dormant",
    );
  }
  const display = displayPhoneNumber(row.whatsapp_display_phone_number);
  return {
    id: channelId,
    merchant_id: merchantId,
    platform: "whatsapp",
    status: "pending",
    version: row.version,
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    ...(display ? { display_phone_number: display } : {}),
    integration_mode: "dormant_offline",
  };
}

/**
 * Resolves an external WABA/phone-number identity without knowing a merchant in
 * advance. The lookup returns only dormant identity metadata; credentials are
 * selected solely so their absence can be enforced and are never exposed.
 */
export async function resolveDormantWhatsAppChannelWithClient(
  client: OperationalSqlClient,
  input: { wabaId: unknown; phoneNumberId: unknown },
): Promise<ResolvedDormantWhatsAppChannel> {
  const wabaId = metaNumericId(input.wabaId, "WhatsApp business account id");
  const phoneNumberId = metaNumericId(
    input.phoneNumberId,
    "WhatsApp phone number id",
  );
  const result = await client.query<DormantResolutionRow>(
    `SELECT id, merchant_id, platform::text AS platform, status::text AS status,
            version, whatsapp_business_account_id, whatsapp_phone_number_id,
            whatsapp_display_phone_number,
            credential_ciphertext, credential_nonce, credential_auth_tag,
            credential_key_id, credential_algorithm, credential_expires_at,
            webhook_subscribed_at, last_webhook_at, connected_at, metadata
       FROM merchant_channels
      WHERE platform = 'whatsapp'::channel_platform
        AND whatsapp_business_account_id = $1
        AND whatsapp_phone_number_id = $2
      ORDER BY id
      LIMIT 2`,
    [wabaId, phoneNumberId],
  );

  if (result.rows.length === 0) {
    throw resolverError(
      "WHATSAPP_CHANNEL_NOT_MAPPED",
      "WhatsApp channel identity is not mapped",
    );
  }
  if (result.rows.length !== 1) {
    throw resolverError(
      "WHATSAPP_CHANNEL_MAPPING_AMBIGUOUS",
      "WhatsApp channel identity is mapped more than once",
    );
  }

  const row = result.rows[0];
  if (
    row.whatsapp_business_account_id !== wabaId ||
    row.whatsapp_phone_number_id !== phoneNumberId
  ) {
    throw resolverError(
      "WHATSAPP_CHANNEL_MAPPING_MISMATCH",
      "WhatsApp channel resolver returned a mismatched identity",
    );
  }
  return resolved(row);
}

export async function resolveDormantWhatsAppChannelAuthoritative(input: {
  wabaId: unknown;
  phoneNumberId: unknown;
}): Promise<ResolvedDormantWhatsAppChannel> {
  return withOperationalTransaction((client) =>
    resolveDormantWhatsAppChannelWithClient(client, input),
  );
}
