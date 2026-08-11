import crypto from "node:crypto";
import {
  authAccountRepository,
  normalizePhone,
  type AuthAccount,
  type RequestedPlan,
} from "./authAccountRepository";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  operationalDatabasePool,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type MerchantAccountRow = {
  id: string;
  kind: "merchant";
  phone: string;
  password_hash: string;
  state: "active" | "suspended" | "closed";
  language: "ar" | "ku" | "en";
  phone_verified: boolean;
  session_version: number;
  created_at: Date;
  owner_name: string;
  store_name: string;
  activity_type: string;
  merchant_status: "pending_activation" | "approved" | "rejected" | "suspended";
  account_status: "pending_review" | "approved" | "rejected" | "suspended";
  onboarding_status: string;
  requested_plan: string | null;
};

function requestedPlan(value: unknown): RequestedPlan | null {
  return value === "silver" || value === "gold" || value === "diamond"
    ? value
    : null;
}

function toAuthAccount(row: MerchantAccountRow): AuthAccount {
  const enabled =
    row.state === "active" &&
    row.merchant_status !== "rejected" &&
    row.merchant_status !== "suspended" &&
    row.account_status !== "rejected" &&
    row.account_status !== "suspended";
  return {
    account: {
      id: row.id,
      phone: normalizePhone(row.phone),
      passwordHash: row.password_hash,
      kind: "merchant",
      enabled,
      otpVerified: row.phone_verified === true,
      // The existing secure-session compatibility contract exposes database
      // version 1 as API account version 0.
      sessionVersion: Math.max(0, Number(row.session_version) - 1),
    },
    merchantProfile: {
      merchantId: row.id,
      tenantId: row.id,
      ownerName: row.owner_name,
      storeName: row.store_name,
      activityType: row.activity_type,
      language: row.language,
      accountStatus: row.account_status,
      onboardingStatus: row.onboarding_status,
      requestedPlan: requestedPlan(row.requested_plan),
      createdAt: row.created_at.toISOString(),
    },
  };
}

async function selectMerchant(
  target: OperationalQueryTarget,
  clause: string,
  values: unknown[],
  lock = false,
): Promise<MerchantAccountRow | null> {
  const rows = await operationalQueryRows<MerchantAccountRow>(
    target,
    `SELECT a.id, a.kind, a.phone, a.password_hash, a.state, a.language,
            a.phone_verified, a.session_version, a.created_at,
            m.owner_name, m.store_name, m.activity_type,
            m.status AS merchant_status, m.account_status,
            m.onboarding_status, m.requested_plan
       FROM accounts AS a
       JOIN merchants AS m ON m.id = a.id AND m.account_id = a.id
      WHERE a.kind = 'merchant' AND ${clause}
      LIMIT 1${lock ? " FOR UPDATE OF a, m" : ""}`,
    values,
  );
  return rows[0] || null;
}

export async function findMerchantByPhoneAuthoritative(
  phoneValue: unknown,
): Promise<AuthAccount | null> {
  const phone = normalizePhone(phoneValue);
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.findByPhone(phone, "merchant");
  }
  const pool = await operationalDatabasePool();
  const row = await selectMerchant(pool, "a.phone = $1", [phone]);
  return row ? toAuthAccount(row) : null;
}

export async function findMerchantByIdAuthoritative(
  accountIdValue: unknown,
): Promise<AuthAccount | null> {
  const accountId = String(accountIdValue || "").trim();
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.findById(accountId, "merchant");
  }
  const pool = await operationalDatabasePool();
  const row = await selectMerchant(pool, "a.id = $1", [accountId]);
  return row ? toAuthAccount(row) : null;
}

export async function upsertPendingMerchantAuthoritative(input: {
  phone: string;
  passwordHash: string;
  ownerName: string;
  storeName: string;
  activityType: string;
  language: "ar" | "ku" | "en";
  requestedPlan?: RequestedPlan | null;
}): Promise<AuthAccount> {
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.upsertPendingMerchant(input);
  }
  const phone = normalizePhone(input.phone);
  if (!/^07\d{9}$/.test(phone)) throw new Error("INVALID_PHONE");

  return withOperationalTransaction(async (client) => {
    const collision = await operationalQueryRows<{
      id: string;
      kind: "merchant" | "admin";
      phone_verified: boolean;
    }>(
      client,
      `SELECT id, kind, phone_verified
         FROM accounts
        WHERE phone = $1
        FOR UPDATE`,
      [phone],
    );
    if (collision[0]?.kind === "admin") throw new Error("PHONE_ALREADY_EXISTS");
    if (collision[0]?.kind === "merchant" && collision[0].phone_verified) {
      throw new Error("PHONE_ALREADY_EXISTS");
    }

    const accountId = collision[0]?.id || `merchant-${crypto.randomUUID()}`;
    if (!collision[0]) {
      await client.query(
        `INSERT INTO accounts (
           id, kind, phone, password_hash, state, language, phone_verified
         ) VALUES ($1, 'merchant', $2, $3, 'active', $4, false)`,
        [accountId, phone, input.passwordHash, input.language],
      );
      await client.query(
        `INSERT INTO merchants (
           id, account_id, profile_kind, owner_name, store_name, activity_type,
           status, account_status, onboarding_status, trial_status,
           signup_source, requested_plan
         ) VALUES (
           $1, $1, 'merchant', $2, $3, $4,
           'pending_activation', 'pending_review', 'pending_review', 'eligible',
           'direct', $5
         )`,
        [
          accountId,
          input.ownerName.trim(),
          input.storeName.trim(),
          input.activityType.trim(),
          input.requestedPlan ?? null,
        ],
      );
    } else {
      await client.query(
        `UPDATE accounts
            SET password_hash = $2,
                state = 'active',
                language = $3,
                phone_verified = false,
                phone_verified_at = NULL,
                updated_at = now()
          WHERE id = $1 AND kind = 'merchant'`,
        [accountId, input.passwordHash, input.language],
      );
      await client.query(
        `UPDATE merchants
            SET owner_name = $2,
                store_name = $3,
                activity_type = $4,
                status = 'pending_activation',
                account_status = 'pending_review',
                onboarding_status = 'pending_review',
                requested_plan = CASE
                  WHEN $5::text IS NULL THEN requested_plan
                  ELSE $5::subscription_plan
                END,
                updated_at = now()
          WHERE id = $1 AND account_id = $1`,
        [
          accountId,
          input.ownerName.trim(),
          input.storeName.trim(),
          input.activityType.trim(),
          input.requestedPlan ?? null,
        ],
      );
    }

    const row = await selectMerchant(client, "a.id = $1", [accountId]);
    if (!row) throw new Error("ACCOUNT_STATE_CHANGED");
    return toAuthAccount(row);
  });
}

export async function markMerchantOtpVerifiedAuthoritative(
  accountIdValue: unknown,
): Promise<AuthAccount | null> {
  const accountId = String(accountIdValue || "").trim();
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.markMerchantOtpVerified(accountId);
  }
  return withOperationalTransaction(async (client) => {
    const current = await selectMerchant(client, "a.id = $1", [accountId], true);
    if (!current) return null;
    await client.query(
      `UPDATE accounts
          SET phone_verified = true,
              phone_verified_at = COALESCE(phone_verified_at, now()),
              updated_at = now()
        WHERE id = $1 AND kind = 'merchant'`,
      [accountId],
    );
    await client.query(
      `UPDATE merchants
          SET status = 'pending_activation',
              account_status = 'pending_review',
              onboarding_status = COALESCE(onboarding_status, 'pending_review'),
              updated_at = now()
        WHERE id = $1`,
      [accountId],
    );
    const row = await selectMerchant(client, "a.id = $1", [accountId]);
    return row ? toAuthAccount(row) : null;
  });
}
