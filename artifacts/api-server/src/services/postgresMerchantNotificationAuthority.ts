import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";

const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_EXPIRY_REMINDER_DAYS = 7;
const ADDON_EXPIRY_REMINDER_DAYS = 10;

export class MerchantNotificationPostgresError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "MerchantNotificationPostgresError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function deterministicId(type: string, merchantId: string, sourceId: string): string {
  return `notification-${crypto
    .createHash("sha256")
    .update(`${type}:${merchantId}:${sourceId}`)
    .digest("hex")}`;
}

function assertRequired(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw new MerchantNotificationPostgresError(
      "NOTIFICATION_POSTGRES_AUTHORITY_REQUIRED",
      "PostgreSQL notification authority is not required",
      503,
    );
  }
}

async function insertMerchantNotification(
  client: {
    query<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      values?: unknown[],
    ): Promise<{ rows: T[]; rowCount?: number | null }>;
  },
  input: {
    id: string;
    merchantId: string;
    type: string;
    titleKey: string;
    bodyKey: string;
    variables: Record<string, string | number | boolean | null>;
    sourceEntityType?: string;
    sourceEntityId?: string;
    createdAt: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO notifications
       (id, audience, merchant_id, account_id, type, title_key, body_key,
        variables, source_entity_type, source_entity_id, created_at)
     VALUES ($1, 'merchant', $2,
             (SELECT account_id FROM merchants WHERE id = $2),
             $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz)
     ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      input.merchantId,
      input.type,
      input.titleKey,
      input.bodyKey,
      JSON.stringify(input.variables),
      input.sourceEntityType || null,
      input.sourceEntityId || null,
      input.createdAt,
    ],
  );
}

export async function refreshSubscriptionNotificationsPostgres(
  merchantIdValue: string,
  now = new Date(),
): Promise<void> {
  assertRequired();
  const merchantId = text(merchantIdValue);
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  await withMerchantOperationalTransaction(merchantId, async (client) => {
    const subscriptionResult = await client.query<{
      id: string;
      plan_name: string;
      expires_at: Date | string;
      addon_replies_remaining: number;
      expiry_reminder_sent_at: Date | string | null;
      expired_notification_sent_at: Date | string | null;
    }>(
      `SELECT id, plan_name, expires_at, addon_replies_remaining,
              expiry_reminder_sent_at, expired_notification_sent_at
         FROM subscriptions
        WHERE merchant_id = $1
        LIMIT 1
        FOR UPDATE`,
      [merchantId],
    );
    const subscription = subscriptionResult.rows[0];
    if (!subscription) return;

    const expiresAt = new Date(subscription.expires_at);
    const timeUntilExpiry = expiresAt.getTime() - nowMs;
    if (
      timeUntilExpiry > 0 &&
      timeUntilExpiry <= SUBSCRIPTION_EXPIRY_REMINDER_DAYS * DAY_MS &&
      !subscription.expiry_reminder_sent_at
    ) {
      await insertMerchantNotification(client, {
        id: deterministicId(
          "subscription_expiry_reminder",
          merchantId,
          `${subscription.id}:${expiresAt.toISOString()}`,
        ),
        merchantId,
        type: "subscription_expiry_reminder",
        titleKey: "notifications.subscription_expiry_reminder.title",
        bodyKey: "notifications.subscription_expiry_reminder.body",
        variables: {
          plan_name: subscription.plan_name,
          expires_at: expiresAt.toISOString(),
          days_remaining: Math.max(1, Math.ceil(timeUntilExpiry / DAY_MS)),
        },
        sourceEntityType: "subscription",
        sourceEntityId: subscription.id,
        createdAt: nowIso,
      });
      await client.query(
        `UPDATE subscriptions
            SET expiry_reminder_sent_at = $2::timestamptz, updated_at = now()
          WHERE id = $1`,
        [subscription.id, nowIso],
      );
    }

    if (timeUntilExpiry <= 0 && !subscription.expired_notification_sent_at) {
      await insertMerchantNotification(client, {
        id: deterministicId(
          "subscription_expired",
          merchantId,
          `${subscription.id}:${expiresAt.toISOString()}`,
        ),
        merchantId,
        type: "subscription_expired",
        titleKey: "notifications.subscription_expired.title",
        bodyKey: "notifications.subscription_expired.body",
        variables: {
          plan_name: subscription.plan_name,
          expired_at: expiresAt.toISOString(),
          addon_replies_remaining: Number(subscription.addon_replies_remaining || 0),
        },
        sourceEntityType: "subscription",
        sourceEntityId: subscription.id,
        createdAt: nowIso,
      });
      await client.query(
        `UPDATE subscriptions
            SET expired_notification_sent_at = $2::timestamptz, updated_at = now()
          WHERE id = $1`,
        [subscription.id, nowIso],
      );
    }

    const batches = await client.query<{
      id: string;
      source: string;
      remaining: number;
      expires_at: Date | string;
      expiry_reminder_sent_at: Date | string | null;
    }>(
      `SELECT id, source, remaining, expires_at, expiry_reminder_sent_at
         FROM subscription_reply_batches
        WHERE merchant_id = $1 AND subscription_id = $2
          AND remaining > 0 AND expires_at > $3::timestamptz
        ORDER BY expires_at, id
        FOR UPDATE`,
      [merchantId, subscription.id, nowIso],
    );
    for (const batch of batches.rows) {
      const batchExpiresAt = new Date(batch.expires_at);
      const remainingMs = batchExpiresAt.getTime() - nowMs;
      if (
        remainingMs > 0 &&
        remainingMs <= ADDON_EXPIRY_REMINDER_DAYS * DAY_MS &&
        !batch.expiry_reminder_sent_at
      ) {
        await insertMerchantNotification(client, {
          id: deterministicId(
            "addon_expiry_reminder",
            merchantId,
            `${batch.id}:${batchExpiresAt.toISOString()}`,
          ),
          merchantId,
          type: "addon_expiry_reminder",
          titleKey: "notifications.addon_expiry_reminder.title",
          bodyKey: "notifications.addon_expiry_reminder.body",
          variables: {
            addon_batch_id: batch.id,
            source: batch.source,
            remaining_replies: Number(batch.remaining),
            expires_at: batchExpiresAt.toISOString(),
            days_remaining: Math.max(1, Math.ceil(remainingMs / DAY_MS)),
          },
          sourceEntityType: "subscription_reply_batch",
          sourceEntityId: batch.id,
          createdAt: nowIso,
        });
        await client.query(
          `UPDATE subscription_reply_batches
              SET expiry_reminder_sent_at = $2::timestamptz
            WHERE id = $1`,
          [batch.id, nowIso],
        );
      }
    }
  });
}

function mapNotification(row: {
  id: string;
  type: string;
  variables: unknown;
  read_at: Date | string | null;
  created_at: Date | string;
}) {
  return {
    id: row.id,
    type: row.type,
    ...record(row.variables),
    created_at: iso(row.created_at) || new Date().toISOString(),
    ...(row.read_at ? { read_at: iso(row.read_at) } : {}),
  };
}

export async function listMerchantNotificationsPostgresCanonical(input: {
  merchantId: string;
  unreadOnly?: boolean;
  limit?: number;
}) {
  assertRequired();
  const merchantId = text(input.merchantId);
  await refreshSubscriptionNotificationsPostgres(merchantId);
  const limit = Number.isInteger(input.limit)
    ? Math.max(1, Math.min(50, Number(input.limit)))
    : 20;
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<{
      id: string;
      type: string;
      variables: unknown;
      read_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT id, type, variables, read_at, created_at
         FROM notifications
        WHERE audience = 'merchant' AND merchant_id = $1
          AND ($2::boolean = false OR read_at IS NULL)
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      [merchantId, Boolean(input.unreadOnly), limit],
    );
    return result.rows.map(mapNotification);
  });
}

export async function countUnreadMerchantNotificationsPostgresCanonical(
  merchantIdValue: string,
): Promise<number> {
  assertRequired();
  const merchantId = text(merchantIdValue);
  await refreshSubscriptionNotificationsPostgres(merchantId);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count
         FROM notifications
        WHERE audience = 'merchant' AND merchant_id = $1
          AND read_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())`,
      [merchantId],
    );
    return Number(result.rows[0]?.count || 0);
  });
}

export async function markMerchantNotificationReadPostgresCanonical(input: {
  merchantId: string;
  notificationId: string;
}) {
  assertRequired();
  const merchantId = text(input.merchantId);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<{
      id: string;
      type: string;
      variables: unknown;
      read_at: Date | string | null;
      created_at: Date | string;
    }>(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND audience = 'merchant' AND merchant_id = $2
      RETURNING id, type, variables, read_at, created_at`,
      [text(input.notificationId), merchantId],
    );
    if (!result.rows[0]) {
      throw new MerchantNotificationPostgresError(
        "NOTIFICATION_NOT_FOUND",
        "notification not found",
        404,
      );
    }
    return mapNotification(result.rows[0]);
  });
}

export async function markAllMerchantNotificationsReadPostgresCanonical(
  merchantIdValue: string,
) {
  assertRequired();
  const merchantId = text(merchantIdValue);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, now())
        WHERE audience = 'merchant' AND merchant_id = $1 AND read_at IS NULL`,
      [merchantId],
    );
    return Number(result.rowCount || 0);
  });
}
