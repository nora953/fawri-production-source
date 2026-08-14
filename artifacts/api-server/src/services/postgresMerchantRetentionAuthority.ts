import {
  calculateRetentionStatus,
  MerchantRetentionStatus,
} from "./merchantLifecycle";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export type MerchantRetentionAccessAuthoritative = {
  productsReadOnly: boolean;
  accountSuspended: boolean;
  retentionStatus: string;
};

type MerchantRetentionRow = {
  id: string;
  account_state: "active" | "suspended" | "closed";
  merchant_status: "pending_activation" | "approved" | "rejected" | "suspended";
  account_status: "pending_review" | "approved" | "rejected" | "suspended";
  last_subscription_ended_at: Date | null;
  retention_status: string | null;
  warning_stage: number;
  products_read_only: boolean;
  retention_suspended_at: Date | null;
};

type SubscriptionRetentionRow = {
  id: string;
  status: "pending_activation" | "active" | "expired" | "replies_exhausted" | "suspended";
  expires_at: Date;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  auto_reply_enabled: boolean;
};

async function selectMerchantForUpdate(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<MerchantRetentionRow | null> {
  const rows = await operationalQueryRows<MerchantRetentionRow>(
    target,
    `SELECT m.id,
            a.state AS account_state,
            m.status AS merchant_status,
            m.account_status,
            m.last_subscription_ended_at,
            m.retention_status,
            m.warning_stage,
            m.products_read_only,
            m.retention_suspended_at
       FROM merchants m
       JOIN accounts a ON a.id = m.account_id AND a.kind = 'merchant'
      WHERE m.id = $1
      FOR UPDATE OF m, a`,
    [merchantId],
  );
  return rows[0] || null;
}

async function selectSubscriptionForUpdate(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<SubscriptionRetentionRow | null> {
  const rows = await operationalQueryRows<SubscriptionRetentionRow>(
    target,
    `SELECT id, status, expires_at, base_replies_remaining,
            addon_replies_remaining, auto_reply_enabled
       FROM subscriptions
      WHERE merchant_id = $1
      LIMIT 1
      FOR UPDATE`,
    [merchantId],
  );
  return rows[0] || null;
}

function effectiveSubscriptionEnd(
  merchant: MerchantRetentionRow,
  subscription: SubscriptionRetentionRow | null,
): string | undefined {
  const values = [
    merchant.last_subscription_ended_at?.getTime(),
    subscription?.expires_at?.getTime(),
  ].filter((value): value is number => Number.isFinite(value));
  if (values.length === 0) return undefined;
  return new Date(Math.max(...values)).toISOString();
}

function restoredSubscriptionStatus(
  subscription: SubscriptionRetentionRow,
  now: Date,
): "active" | "expired" | "replies_exhausted" {
  if (subscription.expires_at.getTime() <= now.getTime()) return "expired";
  return subscription.base_replies_remaining + subscription.addon_replies_remaining > 0
    ? "active"
    : "replies_exhausted";
}

async function revokeMerchantSessions(
  target: OperationalQueryTarget,
  merchantId: string,
  reason: string,
): Promise<void> {
  await target.query(
    `UPDATE account_sessions
        SET status = 'revoked',
            revoked_at = now(),
            revoke_reason = $2
      WHERE account_id = $1
        AND kind = 'merchant'
        AND status = 'active'`,
    [merchantId, reason],
  );
}

export async function refreshMerchantRetentionPostgres(
  merchantIdValue: unknown,
  now: Date = new Date(),
): Promise<MerchantRetentionAccessAuthoritative | null> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new Error("POSTGRES_OPERATIONAL_AUTHORITY_REQUIRED");
  }
  const merchantId = String(merchantIdValue || "").trim();
  if (!merchantId) return null;

  return withOperationalTransaction(async (client) => {
    const merchant = await selectMerchantForUpdate(client, merchantId);
    if (!merchant || merchant.account_state === "closed") return null;
    const subscription = await selectSubscriptionForUpdate(client, merchantId);
    const effectiveEnd = effectiveSubscriptionEnd(merchant, subscription);
    const retention = calculateRetentionStatus(effectiveEnd, now);
    const activeSubscription = Boolean(
      subscription && subscription.expires_at.getTime() > now.getTime(),
    );
    const wasRetentionSuspended = Boolean(merchant.retention_suspended_at);

    if (activeSubscription && wasRetentionSuspended) {
      const restoredStatus = restoredSubscriptionStatus(subscription!, now);
      await client.query(
        `UPDATE merchants
            SET status = 'approved',
                account_status = 'approved',
                retention_status = 'protected',
                warning_stage = 0,
                products_read_only = false,
                retention_suspended_at = NULL,
                grace_period_ends_at = NULL,
                eligible_for_deletion_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [merchantId],
      );
      await client.query(
        `UPDATE accounts
            SET state = 'active',
                suspended_at = NULL,
                updated_at = now()
          WHERE id = $1 AND kind = 'merchant' AND state <> 'closed'`,
        [merchantId],
      );
      await client.query(
        `UPDATE subscriptions
            SET status = $2::subscription_status,
                auto_reply_enabled = ($2::subscription_status = 'active'),
                suspended_at = NULL,
                version = version + 1,
                updated_at = now()
          WHERE merchant_id = $1`,
        [merchantId, restoredStatus],
      );
      return {
        productsReadOnly: false,
        accountSuspended: false,
        retentionStatus: MerchantRetentionStatus.Protected,
      };
    }

    const newlyRetentionSuspended =
      retention.accountShouldBeSuspended && !wasRetentionSuspended;

    await client.query(
      `UPDATE merchants
          SET retention_status = $2,
              warning_stage = $3,
              products_read_only = $4,
              grace_period_ends_at = $5,
              eligible_for_deletion_at = $6,
              retention_suspended_at = CASE
                WHEN $7::boolean THEN COALESCE(retention_suspended_at, now())
                ELSE retention_suspended_at
              END,
              status = CASE WHEN $7::boolean THEN 'suspended'::merchant_status ELSE status END,
              account_status = CASE WHEN $7::boolean THEN 'suspended'::merchant_account_status ELSE account_status END,
              updated_at = now()
        WHERE id = $1`,
      [
        merchantId,
        retention.retentionStatus,
        retention.warningStage,
        retention.productsReadOnly,
        retention.gracePeriodEndsAt || null,
        retention.eligibleForDeletionAt || null,
        retention.accountShouldBeSuspended,
      ],
    );

    if (retention.accountShouldBeSuspended) {
      await client.query(
        `UPDATE accounts
            SET state = 'suspended',
                suspended_at = COALESCE(suspended_at, now()),
                session_version = CASE WHEN $2::boolean THEN session_version + 1 ELSE session_version END,
                security_version = CASE WHEN $2::boolean THEN security_version + 1 ELSE security_version END,
                updated_at = now()
          WHERE id = $1 AND kind = 'merchant' AND state <> 'closed'`,
        [merchantId, newlyRetentionSuspended],
      );
      if (subscription) {
        await client.query(
          `UPDATE subscriptions
              SET status = 'suspended',
                  auto_reply_enabled = false,
                  suspended_at = COALESCE(suspended_at, now()),
                  version = CASE WHEN status <> 'suspended' OR auto_reply_enabled THEN version + 1 ELSE version END,
                  updated_at = now()
            WHERE merchant_id = $1`,
          [merchantId],
        );
      }
      if (newlyRetentionSuspended) {
        await revokeMerchantSessions(client, merchantId, "retention_suspended");
      }
    }

    return {
      productsReadOnly: retention.productsReadOnly,
      accountSuspended:
        retention.accountShouldBeSuspended ||
        merchant.account_state === "suspended" && wasRetentionSuspended,
      retentionStatus: retention.retentionStatus,
    };
  });
}

export async function refreshAllMerchantRetentionPostgres(
  now: Date = new Date(),
): Promise<{ checked: number; suspended: number }> {
  if (!operationalPostgresAuthorityRequired()) {
    return { checked: 0, suspended: 0 };
  }
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<{ id: string }>(
    pool,
    `SELECT m.id
       FROM merchants m
       JOIN accounts a ON a.id = m.account_id AND a.kind = 'merchant'
      WHERE a.state <> 'closed'
      ORDER BY m.id`,
  );
  let suspended = 0;
  for (const row of rows) {
    const access = await refreshMerchantRetentionPostgres(row.id, now);
    if (access?.accountSuspended) suspended += 1;
  }
  return { checked: rows.length, suspended };
}

export async function getMerchantRetentionAccessPostgres(
  merchantId: string,
): Promise<MerchantRetentionAccessAuthoritative | null> {
  return refreshMerchantRetentionPostgres(merchantId);
}

export async function isRetentionSuspendedPhonePostgres(
  phoneValue: unknown,
): Promise<boolean> {
  if (!operationalPostgresAuthorityRequired()) return false;
  const phone = String(phoneValue || "").replace(/\D/g, "");
  if (!phone) return false;
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<{ suspended: boolean }>(
    pool,
    `SELECT (
       a.state = 'suspended'
       AND m.status = 'suspended'
       AND m.retention_suspended_at IS NOT NULL
     ) AS suspended
       FROM accounts a
       JOIN merchants m ON m.id = a.id AND m.account_id = a.id
      WHERE a.kind = 'merchant' AND a.phone = $1
      LIMIT 1`,
    [phone],
  );
  return rows[0]?.suspended === true;
}
