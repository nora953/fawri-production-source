import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import { calculateRetentionStatus } from "./merchantLifecycle";

const RETENTION_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

type MerchantRecord = {
  id: string;
  is_admin?: boolean;
  status?: string;
  account_status?: string;
  subscription_expires_at?: string;
  warning_stage?: number;
  retention_status?: string;
  eligible_for_deletion_at?: string;
  grace_period_ends_at?: string;
  retention_suspended_at?: string;
};

type AuthDb = {
  merchants?: MerchantRecord[];
  subscriptions?: Array<{
    merchant_id?: string;
    expires_at?: string;
    status?: string;
  }>;
  [key: string]: unknown;
};

export type MerchantRetentionAccess = {
  productsReadOnly: boolean;
  accountSuspended: boolean;
  retentionStatus: string;
};

const DB_PATH = getFawriDataFilePath("merchants.json");

function readDb(): AuthDb {
  if (!fs.existsSync(DB_PATH)) return { merchants: [], subscriptions: [] };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as AuthDb;
}

function writeDb(db: AuthDb): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function effectiveSubscriptionExpiry(
  db: AuthDb,
  merchant: MerchantRecord,
): string | undefined {
  const subscription = db.subscriptions?.find(
    (item) => item.merchant_id === merchant.id,
  );
  return subscription?.expires_at || merchant.subscription_expires_at;
}

function isActiveSubscription(db: AuthDb, merchant: MerchantRecord): boolean {
  const expiresAt = effectiveSubscriptionExpiry(db, merchant);
  if (!expiresAt) return false;
  const expiryTime = new Date(expiresAt).getTime();
  return Number.isFinite(expiryTime) && expiryTime > Date.now();
}

export function refreshMerchantRetentionPolicy(
  merchantId?: string,
): { checked: number; updated: number } {
  const db = readDb();
  const merchants = Array.isArray(db.merchants) ? db.merchants : [];
  let checked = 0;
  let updated = 0;

  for (const merchant of merchants) {
    if (merchant.is_admin === true) continue;
    if (merchantId && merchant.id !== merchantId) continue;
    checked += 1;

    const activeSubscription = isActiveSubscription(db, merchant);
    const retention = calculateRetentionStatus(
      effectiveSubscriptionExpiry(db, merchant),
    );

    const before = JSON.stringify({
      status: merchant.status,
      account_status: merchant.account_status,
      warning_stage: merchant.warning_stage,
      retention_status: merchant.retention_status,
      eligible_for_deletion_at: merchant.eligible_for_deletion_at,
      grace_period_ends_at: merchant.grace_period_ends_at,
      retention_suspended_at: merchant.retention_suspended_at,
    });

    merchant.warning_stage = retention.warningStage;
    merchant.retention_status = retention.retentionStatus;
    merchant.eligible_for_deletion_at = retention.eligibleForDeletionAt;
    merchant.grace_period_ends_at = retention.gracePeriodEndsAt;

    if (activeSubscription && merchant.retention_suspended_at) {
      merchant.status = "approved";
      merchant.account_status = "approved";
      delete merchant.retention_suspended_at;
    } else if (
      retention.accountShouldBeSuspended &&
      merchant.status !== "suspended"
    ) {
      merchant.status = "suspended";
      merchant.account_status = "suspended";
      merchant.retention_suspended_at = new Date().toISOString();

      const subscription = db.subscriptions?.find(
        (item) => item.merchant_id === merchant.id,
      );
      if (subscription) subscription.status = "suspended";
    }

    const after = JSON.stringify({
      status: merchant.status,
      account_status: merchant.account_status,
      warning_stage: merchant.warning_stage,
      retention_status: merchant.retention_status,
      eligible_for_deletion_at: merchant.eligible_for_deletion_at,
      grace_period_ends_at: merchant.grace_period_ends_at,
      retention_suspended_at: merchant.retention_suspended_at,
    });

    if (before !== after) updated += 1;
  }

  if (updated > 0) writeDb(db);
  return { checked, updated };
}

export function getMerchantRetentionAccess(
  merchantId: string,
): MerchantRetentionAccess {
  refreshMerchantRetentionPolicy(merchantId);
  const db = readDb();
  const merchant = db.merchants?.find(
    (item) => item.id === merchantId && item.is_admin !== true,
  );

  const retention = calculateRetentionStatus(
    merchant ? effectiveSubscriptionExpiry(db, merchant) : undefined,
  );

  return {
    productsReadOnly: retention.productsReadOnly,
    accountSuspended:
      merchant?.status === "suspended" && Boolean(merchant.retention_suspended_at),
    retentionStatus: retention.retentionStatus,
  };
}

export function startMerchantRetentionPolicyScheduler(): void {
  const globalState = globalThis as typeof globalThis & {
    __fawriRetentionPolicySchedulerStarted?: boolean;
  };

  if (globalState.__fawriRetentionPolicySchedulerStarted) return;
  globalState.__fawriRetentionPolicySchedulerStarted = true;

  refreshMerchantRetentionPolicy();
  const timer = setInterval(() => {
    try {
      refreshMerchantRetentionPolicy();
    } catch (error) {
      console.error("Merchant retention policy update failed:", error);
    }
  }, RETENTION_CHECK_INTERVAL_MS);
  timer.unref?.();
}
