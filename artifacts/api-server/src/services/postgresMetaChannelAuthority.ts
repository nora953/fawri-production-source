import crypto from "node:crypto";
import {
  createEnvironmentMetaCredentialKeyProvider,
  decryptMetaCredential,
  encryptMetaCredential,
  type MetaCredentialEnvelope,
  type MetaCredentialKeyProvider,
} from "./metaCredentialVault";
import { evaluateMerchantOperationalAccess } from "./merchantOperationalAccess";
import {
  operationalPostgresAuthorityRequired,
  withMerchantOperationalTransaction,
  withOperationalTransaction,
  type OperationalSqlClient,
} from "./operationalPostgresAuthority";
import {
  completeMetaChannelDisconnect,
  connectMetaChannel,
  listActiveMetaPageMappings,
  listMetaChannels,
  markMetaChannelError,
  readMetaChannelCredential,
  requestMetaChannelDisconnect,
  type MetaChannelSummary,
} from "./metaChannelRuntime";

let configuredProvider: MetaCredentialKeyProvider | null = null;

export function configurePostgresMetaChannelCredentialKeyProvider(
  provider: MetaCredentialKeyProvider | null,
): void {
  configuredProvider = provider;
}

function provider(explicit?: MetaCredentialKeyProvider): MetaCredentialKeyProvider {
  return explicit || configuredProvider || createEnvironmentMetaCredentialKeyProvider();
}

function text(value: unknown): string {
  return String(value || "").trim();
}

function channelId(merchantId: string, platform: string, pageId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${merchantId}:${platform}:${pageId}`)
    .digest("hex")
    .slice(0, 32);
}

type ChannelRow = {
  id: string;
  merchant_id: string;
  platform: "messenger" | "instagram";
  status: "connected" | "disconnected" | "pending" | "error" | "revoked";
  version: number;
  page_id: string | null;
  page_name: string | null;
  instagram_account_id: string | null;
  instagram_username: string | null;
  credential_ciphertext: string | null;
  credential_nonce: string | null;
  credential_auth_tag: string | null;
  credential_key_id: string | null;
  credential_algorithm: string | null;
  webhook_subscribed_at: Date | string | null;
  connected_at: Date | string | null;
  disconnected_at: Date | string | null;
  last_error_code: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type MerchantOperationalRow = {
  id: string;
  phone_verified: boolean;
  merchant_status: string;
  account_status: string;
};

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function summary(row: ChannelRow): MetaChannelSummary {
  const operation = text(row.metadata?.operation);
  const status =
    row.status === "connected"
      ? "active"
      : row.status === "disconnected" || row.status === "revoked"
        ? "disconnected"
        : row.status === "error"
          ? "error"
          : operation === "disconnecting"
            ? "disconnecting"
            : "connecting";
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    platform: row.platform,
    page_id: row.page_id || "",
    page_name: row.page_name || "",
    ...(row.instagram_account_id
      ? { instagram_account_id: row.instagram_account_id }
      : {}),
    ...(row.instagram_username
      ? { instagram_username: row.instagram_username }
      : {}),
    status,
    webhook_subscribed: Boolean(row.webhook_subscribed_at),
    connection_version: row.version,
    ...(iso(row.connected_at) ? { connected_at: iso(row.connected_at)! } : {}),
    ...(text(row.metadata?.disconnect_requested_at)
      ? { disconnect_requested_at: text(row.metadata?.disconnect_requested_at) }
      : {}),
    ...(iso(row.disconnected_at)
      ? { disconnected_at: iso(row.disconnected_at)! }
      : {}),
    ...(row.last_error_code ? { last_error_code: row.last_error_code } : {}),
    created_at: iso(row.created_at) || new Date(0).toISOString(),
    updated_at: iso(row.updated_at) || new Date(0).toISOString(),
    credential_configured: Boolean(
      row.credential_ciphertext &&
        row.credential_nonce &&
        row.credential_auth_tag &&
        row.credential_key_id &&
        row.credential_algorithm === "aes-256-gcm",
    ),
  };
}

const SELECT_CHANNEL = `
SELECT id, merchant_id, platform::text AS platform, status::text AS status,
       version, page_id, page_name, instagram_account_id, instagram_username,
       credential_ciphertext, credential_nonce, credential_auth_tag,
       credential_key_id, credential_algorithm, webhook_subscribed_at,
       connected_at, disconnected_at, last_error_code, metadata,
       created_at, updated_at
FROM merchant_channels`;

async function findChannel(
  client: OperationalSqlClient,
  merchantId: string,
  platform: "messenger" | "instagram",
  pageId: string,
  lock = false,
): Promise<ChannelRow | null> {
  const result = await client.query<ChannelRow>(
    `${SELECT_CHANNEL}
      WHERE merchant_id = $1 AND platform = $2::channel_platform AND page_id = $3
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [merchantId, platform, pageId],
  );
  return result.rows[0] || null;
}

async function assertMerchantOperationalAccessForChannelWrite(
  client: OperationalSqlClient,
  merchantId: string,
): Promise<void> {
  const result = await client.query<MerchantOperationalRow>(
    `SELECT a.id,
            a.phone_verified,
            m.status::text AS merchant_status,
            m.account_status::text AS account_status
       FROM accounts AS a
       JOIN merchants AS m ON m.id = a.id AND m.account_id = a.id
      WHERE a.id = $1 AND a.kind = 'merchant'
      LIMIT 1
      FOR UPDATE OF a, m`,
    [merchantId],
  );
  const row = result.rows[0];
  const decision = evaluateMerchantOperationalAccess(
    row
      ? {
          id: row.id,
          is_admin: false,
          otp_verified: row.phone_verified,
          status: row.merchant_status,
          account_status: row.account_status,
        }
      : undefined,
  );
  if (!decision.allowed) {
    throw Object.assign(new Error(decision.error), {
      code: decision.code,
      statusCode: decision.statusCode,
    });
  }
}

export async function listMetaChannelsAuthoritative(
  merchantId: string,
): Promise<MetaChannelSummary[]> {
  if (!operationalPostgresAuthorityRequired()) return listMetaChannels(merchantId);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<ChannelRow>(
      `${SELECT_CHANNEL}
        WHERE merchant_id = $1
        ORDER BY updated_at DESC, id`,
      [merchantId],
    );
    return result.rows.map(summary);
  });
}

export async function listActiveMetaPageMappingsAuthoritative(): Promise<
  Array<{ pageId: string; merchantId: string }>
> {
  if (!operationalPostgresAuthorityRequired()) return listActiveMetaPageMappings();
  return withOperationalTransaction(async (client) => {
    const result = await client.query<{ page_id: string; merchant_id: string }>(
      `SELECT page_id, merchant_id
         FROM merchant_channels
        WHERE platform = 'messenger'
          AND status = 'connected'
          AND page_id IS NOT NULL
        ORDER BY page_id`,
    );
    return result.rows.map((row) => ({
      pageId: row.page_id,
      merchantId: row.merchant_id,
    }));
  });
}

export async function connectMetaChannelAuthoritative(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  pageName: string;
  accessToken: string;
  webhookSubscribed?: boolean;
  instagramAccountId?: string;
  instagramUsername?: string;
  keyProvider?: MetaCredentialKeyProvider;
  now?: Date;
}): Promise<MetaChannelSummary> {
  if (!operationalPostgresAuthorityRequired()) return connectMetaChannel(input);
  const merchantId = text(input.merchantId);
  const pageId = text(input.pageId);
  const pageName = text(input.pageName);
  if (!merchantId || !pageId || !pageName) {
    throw Object.assign(new Error("Meta channel identity is incomplete"), {
      code: "META_CHANNEL_IDENTITY_INVALID",
    });
  }
  const now = input.now || new Date();
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await assertMerchantOperationalAccessForChannelWrite(client, merchantId);
    const encrypted = encryptMetaCredential(
      input.accessToken,
      provider(input.keyProvider),
      `fawri:meta:${merchantId}:${input.platform}:${pageId}`,
    );
    const id = channelId(merchantId, input.platform, pageId);
    await client.query(
      `INSERT INTO merchant_channels
        (id, merchant_id, platform, status, version,
         page_id, page_name, instagram_account_id, instagram_username,
         credential_ciphertext, credential_nonce, credential_auth_tag,
         credential_key_id, credential_algorithm,
         webhook_subscribed_at, connected_at, disconnected_at,
         last_error_code, metadata, created_at, updated_at)
       VALUES
        ($1, $2, $3::channel_platform, 'connected', 1,
         $4, $5, $6, $7,
         $8, $9, $10, $11, $12,
         CASE WHEN $13 THEN $14::timestamptz ELSE NULL END,
         $14::timestamptz, NULL, NULL, '{}'::jsonb,
         $14::timestamptz, $14::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         status = 'connected',
         version = merchant_channels.version + 1,
         page_name = EXCLUDED.page_name,
         instagram_account_id = EXCLUDED.instagram_account_id,
         instagram_username = EXCLUDED.instagram_username,
         credential_ciphertext = EXCLUDED.credential_ciphertext,
         credential_nonce = EXCLUDED.credential_nonce,
         credential_auth_tag = EXCLUDED.credential_auth_tag,
         credential_key_id = EXCLUDED.credential_key_id,
         credential_algorithm = EXCLUDED.credential_algorithm,
         webhook_subscribed_at = EXCLUDED.webhook_subscribed_at,
         connected_at = EXCLUDED.connected_at,
         disconnected_at = NULL,
         last_error_code = NULL,
         metadata = '{}'::jsonb,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        merchantId,
        input.platform,
        pageId,
        pageName,
        text(input.instagramAccountId) || null,
        text(input.instagramUsername) || null,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.auth_tag,
        encrypted.key_id,
        encrypted.algorithm,
        input.webhookSubscribed === true,
        now.toISOString(),
      ],
    );
    const row = await findChannel(client, merchantId, input.platform, pageId);
    return summary(row!);
  });
}

export async function readMetaChannelCredentialAuthoritative(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  keyProvider?: MetaCredentialKeyProvider;
}): Promise<string> {
  if (!operationalPostgresAuthorityRequired()) return readMetaChannelCredential(input);
  const merchantId = text(input.merchantId);
  const pageId = text(input.pageId);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const row = await findChannel(client, merchantId, input.platform, pageId);
    if (
      !row ||
      row.status === "disconnected" ||
      row.status === "revoked" ||
      !row.credential_ciphertext ||
      !row.credential_nonce ||
      !row.credential_auth_tag ||
      !row.credential_key_id ||
      row.credential_algorithm !== "aes-256-gcm"
    ) {
      throw Object.assign(new Error("Meta channel credential is unavailable"), {
        code: "META_CHANNEL_CREDENTIAL_UNAVAILABLE",
      });
    }
    const envelope: MetaCredentialEnvelope = {
      version: 1,
      algorithm: "aes-256-gcm",
      key_id: row.credential_key_id,
      iv: row.credential_nonce,
      ciphertext: row.credential_ciphertext,
      auth_tag: row.credential_auth_tag,
    };
    return decryptMetaCredential(
      envelope,
      provider(input.keyProvider),
      `fawri:meta:${merchantId}:${input.platform}:${pageId}`,
    );
  });
}

export async function requestMetaChannelDisconnectAuthoritative(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  expectedVersion: number;
  now?: Date;
}): Promise<MetaChannelSummary> {
  if (!operationalPostgresAuthorityRequired()) return requestMetaChannelDisconnect(input);
  const merchantId = text(input.merchantId);
  const pageId = text(input.pageId);
  const now = input.now || new Date();
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const current = await findChannel(client, merchantId, input.platform, pageId, true);
    if (!current) {
      throw Object.assign(new Error("Meta channel was not found"), {
        code: "META_CHANNEL_NOT_FOUND",
      });
    }
    if (current.version !== input.expectedVersion) {
      throw Object.assign(new Error("Meta channel version conflict"), {
        code: "META_CHANNEL_VERSION_CONFLICT",
        current: summary(current),
      });
    }
    if (current.status === "disconnected" || current.status === "revoked") {
      return summary(current);
    }
    const updated = await client.query<ChannelRow>(
      `${SELECT_CHANNEL.replace("FROM merchant_channels", "FROM merchant_channels")}
       WHERE FALSE`,
    ).catch(() => ({ rows: [] as ChannelRow[] }));
    void updated;
    await client.query(
      `UPDATE merchant_channels
          SET status = 'pending',
              version = version + 1,
              metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{operation}', '\"disconnecting\"'::jsonb, true)
                         || jsonb_build_object('disconnect_requested_at', $4::text),
              updated_at = $4::timestamptz
        WHERE merchant_id = $1 AND platform = $2::channel_platform AND page_id = $3`,
      [merchantId, input.platform, pageId, now.toISOString()],
    );
    const row = await findChannel(client, merchantId, input.platform, pageId);
    return summary(row!);
  });
}

export async function completeMetaChannelDisconnectAuthoritative(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  now?: Date;
}): Promise<MetaChannelSummary> {
  if (!operationalPostgresAuthorityRequired()) return completeMetaChannelDisconnect(input);
  const merchantId = text(input.merchantId);
  const now = input.now || new Date();
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE merchant_channels
          SET status = 'disconnected',
              version = version + 1,
              credential_ciphertext = NULL,
              credential_nonce = NULL,
              credential_auth_tag = NULL,
              credential_key_id = NULL,
              credential_algorithm = NULL,
              webhook_subscribed_at = NULL,
              disconnected_at = $4::timestamptz,
              metadata = '{}'::jsonb,
              updated_at = $4::timestamptz
        WHERE merchant_id = $1 AND platform = $2::channel_platform AND page_id = $3
        RETURNING id`,
      [merchantId, input.platform, text(input.pageId), now.toISOString()],
    );
    if (updated.rows.length !== 1) {
      throw Object.assign(new Error("Meta channel was not found"), {
        code: "META_CHANNEL_NOT_FOUND",
      });
    }
    const row = await findChannel(client, merchantId, input.platform, text(input.pageId));
    return summary(row!);
  });
}

export async function markMetaChannelErrorAuthoritative(input: {
  merchantId: string;
  platform: "messenger" | "instagram";
  pageId: string;
  code: string;
  now?: Date;
}): Promise<MetaChannelSummary> {
  if (!operationalPostgresAuthorityRequired()) return markMetaChannelError(input);
  const merchantId = text(input.merchantId);
  const now = input.now || new Date();
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE merchant_channels
          SET status = 'error',
              version = version + 1,
              last_error_code = $4,
              last_error_at = $5::timestamptz,
              updated_at = $5::timestamptz
        WHERE merchant_id = $1 AND platform = $2::channel_platform AND page_id = $3
        RETURNING id`,
      [
        merchantId,
        input.platform,
        text(input.pageId),
        text(input.code) || "META_CHANNEL_ERROR",
        now.toISOString(),
      ],
    );
    if (updated.rows.length !== 1) {
      throw Object.assign(new Error("Meta channel was not found"), {
        code: "META_CHANNEL_NOT_FOUND",
      });
    }
    const row = await findChannel(client, merchantId, input.platform, text(input.pageId));
    return summary(row!);
  });
}
