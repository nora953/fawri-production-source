import crypto from "node:crypto";
import {
  calculateRetentionStatus,
  MerchantDeleteReason,
  MerchantRetentionStatus,
} from "./merchantLifecycle";
import { retireMerchantProviderIdentifiers } from "./merchantDeletionProviderIdentifierRetirement";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import { refreshMerchantRetentionPostgres } from "./postgresMerchantRetentionAuthority";

export type ManagedMerchantStatus =
  | "pending_activation"
  | "approved"
  | "rejected"
  | "suspended";

export type ManagedMerchant = {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string;
  activity_type: string;
  status: ManagedMerchantStatus;
  language: "ar" | "ku" | "en";
  theme_preference: "auto";
  created_at: string;
  is_admin: false;
  otp_verified: boolean;
  account_status: "pending_review" | "approved" | "rejected" | "suspended";
  onboarding_status: string;
  trial_status: string;
  signup_source: string;
  requested_plan: "silver" | "gold" | "diamond" | "trial" | null;
  approved_at?: string;
  channel_activation_deadline?: string;
  first_channel_connected_at?: string;
  trial_started_at?: string;
  trial_expires_at?: string;
  subscription_started_at?: string;
  subscription_expires_at?: string;
  last_subscription_ended_at?: string;
  warning_stage: number;
  retention_status: string;
  eligible_for_deletion_at?: string;
  grace_period_ends_at?: string;
  retention_suspended_at?: string;
};

export type ManagedDeletionRequest = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone: string;
  requested_by_admin_id: string;
  requested_by_admin_name: string;
  requested_by_admin_phone: string;
  reason: "policy_violation" | "retention_expired";
  details: string;
  status: "pending" | "rejected" | "completed";
  created_at: string;
  reviewed_by_admin_id?: string;
  reviewed_at?: string;
};

export class MerchantManagementError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "MerchantManagementError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

type ManagedMerchantRow = {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string | null;
  account_state: "active" | "suspended" | "closed";
  phone_verified: boolean;
  activity_type: string;
  status: ManagedMerchantStatus;
  language: "ar" | "ku" | "en";
  created_at: Date;
  account_status: "pending_review" | "approved" | "rejected" | "suspended";
  onboarding_status: string;
  trial_status: string;
  signup_source: string;
  requested_plan: "silver" | "gold" | "diamond" | "trial" | null;
  approved_at: Date | null;
  channel_activation_deadline: Date | null;
  first_channel_connected_at: Date | null;
  trial_started_at: Date | null;
  trial_expires_at: Date | null;
  last_subscription_ended_at: Date | null;
  warning_stage: number;
  retention_status: string | null;
  eligible_for_deletion_at: Date | null;
  grace_period_ends_at: Date | null;
  retention_suspended_at: Date | null;
  subscription_started_at: Date | null;
  subscription_expires_at: Date | null;
};

type AdminSnapshotRow = {
  id: string;
  phone: string | null;
  display_name: string;
  role: "owner_admin" | "assistant_admin";
};

type DeletionRequestRow = {
  id: string;
  merchant_id: string | null;
  merchant_id_snapshot: string;
  merchant_name_snapshot: string;
  merchant_phone_snapshot: string;
  requested_by_admin_id: string | null;
  requested_by_admin_id_snapshot: string;
  requested_by_admin_name_snapshot: string;
  requested_by_admin_phone_snapshot: string;
  reason: "policy_violation" | "retention_expired";
  details: string;
  status: "pending" | "rejected" | "completed";
  reviewed_by_admin_id: string | null;
  reviewed_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
};

function requirePostgres(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw new MerchantManagementError(
      503,
      "POSTGRES_OPERATIONAL_AUTHORITY_REQUIRED",
      "PostgreSQL merchant management authority is required",
    );
  }
}

function iso(value: Date | null | undefined): string | undefined {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : undefined;
}

function effectiveLifecycleEnd(row: ManagedMerchantRow): string | undefined {
  const timestamps = [
    row.last_subscription_ended_at?.getTime(),
    row.subscription_expires_at?.getTime(),
  ].filter((value): value is number => Number.isFinite(value));
  if (timestamps.length === 0) return undefined;
  return new Date(Math.max(...timestamps)).toISOString();
}

function managedMerchant(row: ManagedMerchantRow): ManagedMerchant {
  return {
    id: row.id,
    owner_name: row.owner_name,
    store_name: row.store_name,
    phone: row.phone || "",
    activity_type: row.activity_type,
    status: row.status,
    language: row.language,
    theme_preference: "auto",
    created_at: row.created_at.toISOString(),
    is_admin: false,
    otp_verified: row.phone_verified,
    account_status: row.account_status,
    onboarding_status: row.onboarding_status,
    trial_status: row.trial_status,
    signup_source: row.signup_source,
    requested_plan: row.requested_plan,
    ...(iso(row.approved_at) ? { approved_at: iso(row.approved_at)! } : {}),
    ...(iso(row.channel_activation_deadline)
      ? { channel_activation_deadline: iso(row.channel_activation_deadline)! }
      : {}),
    ...(iso(row.first_channel_connected_at)
      ? { first_channel_connected_at: iso(row.first_channel_connected_at)! }
      : {}),
    ...(iso(row.trial_started_at) ? { trial_started_at: iso(row.trial_started_at)! } : {}),
    ...(iso(row.trial_expires_at) ? { trial_expires_at: iso(row.trial_expires_at)! } : {}),
    ...(iso(row.subscription_started_at)
      ? { subscription_started_at: iso(row.subscription_started_at)! }
      : {}),
    ...(iso(row.subscription_expires_at)
      ? { subscription_expires_at: iso(row.subscription_expires_at)! }
      : {}),
    ...(iso(row.last_subscription_ended_at)
      ? { last_subscription_ended_at: iso(row.last_subscription_ended_at)! }
      : {}),
    warning_stage: row.warning_stage,
    retention_status: row.retention_status || MerchantRetentionStatus.Protected,
    ...(iso(row.eligible_for_deletion_at)
      ? { eligible_for_deletion_at: iso(row.eligible_for_deletion_at)! }
      : {}),
    ...(iso(row.grace_period_ends_at)
      ? { grace_period_ends_at: iso(row.grace_period_ends_at)! }
      : {}),
    ...(iso(row.retention_suspended_at)
      ? { retention_suspended_at: iso(row.retention_suspended_at)! }
      : {}),
  };
}

function deletionRequest(row: DeletionRequestRow): ManagedDeletionRequest {
  return {
    id: row.id,
    merchant_id: row.merchant_id_snapshot,
    merchant_name: row.merchant_name_snapshot,
    merchant_phone: row.merchant_phone_snapshot,
    requested_by_admin_id: row.requested_by_admin_id_snapshot,
    requested_by_admin_name: row.requested_by_admin_name_snapshot,
    requested_by_admin_phone: row.requested_by_admin_phone_snapshot,
    reason: row.reason,
    details: row.details,
    status: row.status,
    created_at: row.created_at.toISOString(),
    ...(row.reviewed_by_admin_id
      ? { reviewed_by_admin_id: row.reviewed_by_admin_id }
      : {}),
    ...(iso(row.reviewed_at) ? { reviewed_at: iso(row.reviewed_at)! } : {}),
  };
}

async function selectMerchant(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<ManagedMerchantRow | null> {
  const rows = await operationalQueryRows<ManagedMerchantRow>(
    target,
    `SELECT m.id, m.owner_name, m.store_name, a.phone,
            a.state AS account_state, a.phone_verified,
            m.activity_type, m.status, a.language, a.created_at,
            m.account_status, m.onboarding_status, m.trial_status,
            m.signup_source, m.requested_plan, m.approved_at,
            m.channel_activation_deadline, m.first_channel_connected_at,
            m.trial_started_at, m.trial_expires_at,
            m.last_subscription_ended_at, m.warning_stage,
            m.retention_status, m.eligible_for_deletion_at,
            m.grace_period_ends_at, m.retention_suspended_at,
            s.starts_at AS subscription_started_at,
            s.expires_at AS subscription_expires_at
       FROM merchants m
       JOIN accounts a ON a.id = m.account_id AND a.kind = 'merchant'
       LEFT JOIN subscriptions s ON s.merchant_id = m.id
      WHERE m.id = $1${lock ? " FOR UPDATE OF m, a" : ""}`,
    [merchantId],
  );
  return rows[0] || null;
}

async function adminSnapshot(
  target: OperationalQueryTarget,
  adminId: string,
): Promise<AdminSnapshotRow | null> {
  const rows = await operationalQueryRows<AdminSnapshotRow>(
    target,
    `SELECT a.id, a.phone, p.display_name, p.role
       FROM accounts a
       JOIN admin_profiles p ON p.account_id = a.id AND p.id = a.id
      WHERE a.id = $1 AND a.kind = 'admin' AND a.state = 'active' AND p.enabled = true
      LIMIT 1`,
    [adminId],
  );
  return rows[0] || null;
}

async function writeAudit(
  target: OperationalQueryTarget,
  input: {
    actorAdminId: string;
    merchantId: string;
    actionType: string;
    reasonCode?: string;
    details?: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await target.query(
    `INSERT INTO audit_events (
       id, actor_kind, actor_account_id, merchant_id,
       action_type, entity_type, entity_id, reason_code,
       details, metadata, created_at
     ) VALUES (
       $1, 'account', $2, $3,
       $4, 'merchant', $3, $5,
       $6, $7::jsonb, now()
     )`,
    [
      `audit-${crypto.randomUUID()}`,
      input.actorAdminId,
      input.merchantId,
      input.actionType,
      input.reasonCode || null,
      input.details || null,
      JSON.stringify(input.metadata || {}),
    ],
  );
}

export async function listManagedMerchantsPostgres(): Promise<ManagedMerchant[]> {
  requirePostgres();
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<ManagedMerchantRow>(
    pool,
    `SELECT m.id, m.owner_name, m.store_name, a.phone,
            a.state AS account_state, a.phone_verified,
            m.activity_type, m.status, a.language, a.created_at,
            m.account_status, m.onboarding_status, m.trial_status,
            m.signup_source, m.requested_plan, m.approved_at,
            m.channel_activation_deadline, m.first_channel_connected_at,
            m.trial_started_at, m.trial_expires_at,
            m.last_subscription_ended_at, m.warning_stage,
            m.retention_status, m.eligible_for_deletion_at,
            m.grace_period_ends_at, m.retention_suspended_at,
            s.starts_at AS subscription_started_at,
            s.expires_at AS subscription_expires_at
       FROM merchants m
       JOIN accounts a ON a.id = m.account_id AND a.kind = 'merchant'
       LEFT JOIN subscriptions s ON s.merchant_id = m.id
      WHERE a.state <> 'closed' AND a.phone_verified = true
      ORDER BY a.created_at DESC, m.id DESC`,
  );
  return rows.map(managedMerchant);
}

export async function getManagedMerchantPostgres(
  merchantId: string,
): Promise<ManagedMerchant | null> {
  requirePostgres();
  const pool = await operationalDatabasePool();
  const row = await selectMerchant(pool, merchantId);
  return row && row.account_state !== "closed" ? managedMerchant(row) : null;
}

export async function getMerchantAdminNotePostgres(merchantId: string): Promise<string> {
  requirePostgres();
  const pool = await operationalDatabasePool();
  const merchant = await selectMerchant(pool, merchantId);
  if (!merchant || merchant.account_state === "closed") {
    throw new MerchantManagementError(404, "MERCHANT_NOT_FOUND", "merchant not found");
  }
  const rows = await operationalQueryRows<{ note: string }>(
    pool,
    `SELECT note FROM merchant_admin_notes WHERE merchant_id = $1`,
    [merchantId],
  );
  return rows[0]?.note || "";
}

export async function setMerchantAdminNotePostgres(input: {
  merchantId: string;
  note: string;
  actorAdminId: string;
}): Promise<string> {
  requirePostgres();
  const note = String(input.note || "").trim();
  if (note.length > 5000) {
    throw new MerchantManagementError(400, "MERCHANT_NOTE_TOO_LONG", "note is too long");
  }
  return withOperationalTransaction(async (client) => {
    const merchant = await selectMerchant(client, input.merchantId, true);
    if (!merchant || merchant.account_state === "closed") {
      throw new MerchantManagementError(404, "MERCHANT_NOT_FOUND", "merchant not found");
    }
    if (!note) {
      await client.query(
        `DELETE FROM merchant_admin_notes WHERE merchant_id = $1`,
        [input.merchantId],
      );
    } else {
      await client.query(
        `INSERT INTO merchant_admin_notes (
           merchant_id, note, updated_by_admin_id, created_at, updated_at
         ) VALUES ($1, $2, $3, now(), now())
         ON CONFLICT (merchant_id) DO UPDATE
           SET note = EXCLUDED.note,
               updated_by_admin_id = EXCLUDED.updated_by_admin_id,
               updated_at = now()`,
        [input.merchantId, note, input.actorAdminId],
      );
    }
    await writeAudit(client, {
      actorAdminId: input.actorAdminId,
      merchantId: input.merchantId,
      actionType: "note_saved",
      details: "internal note saved",
      metadata: { note_length: note.length },
    });
    return note;
  });
}

export async function listMerchantChannelOverridesPostgres(): Promise<
  Record<string, Record<string, string>>
> {
  requirePostgres();
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<{
    merchant_id: string;
    platform: string;
    status: string;
  }>(
    pool,
    `SELECT o.merchant_id, o.platform::text AS platform, o.status::text AS status
       FROM merchant_channel_overrides o
       JOIN merchants m ON m.id = o.merchant_id
       JOIN accounts a ON a.id = m.account_id
      WHERE a.state <> 'closed'
      ORDER BY o.merchant_id, o.platform`,
  );
  const result: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    (result[row.merchant_id] ||= {})[row.platform] = row.status;
  }
  return result;
}

export async function setMerchantChannelOverridePostgres(input: {
  merchantId: string;
  platform: string;
  status: string;
  actorAdminId: string;
}): Promise<void> {
  requirePostgres();
  const allowedPlatforms = new Set([
    "messenger",
    "instagram",
    "whatsapp",
    "telegram",
    "tiktok",
    "web_chat",
  ]);
  const allowedStatuses = new Set([
    "connected",
    "disconnected",
    "pending",
    "error",
    "revoked",
  ]);
  if (!allowedPlatforms.has(input.platform) || !allowedStatuses.has(input.status)) {
    throw new MerchantManagementError(400, "CHANNEL_OVERRIDE_INVALID", "invalid channel override");
  }
  await withOperationalTransaction(async (client) => {
    const merchant = await selectMerchant(client, input.merchantId, true);
    if (!merchant || merchant.account_state === "closed") {
      throw new MerchantManagementError(404, "MERCHANT_NOT_FOUND", "merchant not found");
    }
    await client.query(
      `INSERT INTO merchant_channel_overrides (
         merchant_id, platform, status, updated_by_admin_id, created_at, updated_at
       ) VALUES ($1, $2::channel_platform, $3::channel_status, $4, now(), now())
       ON CONFLICT (merchant_id, platform) DO UPDATE
         SET status = EXCLUDED.status,
             updated_by_admin_id = EXCLUDED.updated_by_admin_id,
             updated_at = now()`,
      [input.merchantId, input.platform, input.status, input.actorAdminId],
    );
    await writeAudit(client, {
      actorAdminId: input.actorAdminId,
      merchantId: input.merchantId,
      actionType: "channel_status_changed",
      metadata: { platform: input.platform, status: input.status },
    });
  });
}

export async function updateMerchantStatusPostgres(input: {
  merchantId: string;
  status: ManagedMerchantStatus;
  reason?: string;
  actorAdminId: string;
}): Promise<ManagedMerchant> {
  requirePostgres();
  const reason = String(input.reason || "").trim();
  if (!["pending_activation", "approved", "rejected", "suspended"].includes(input.status)) {
    throw new MerchantManagementError(400, "INVALID_STATUS", "invalid status");
  }
  if ((input.status === "rejected" || input.status === "suspended") && !reason) {
    throw new MerchantManagementError(400, "STATUS_REASON_REQUIRED", "reason is required for this status");
  }

  const result = await withOperationalTransaction(async (client) => {
    const merchant = await selectMerchant(client, input.merchantId, true);
    if (!merchant || merchant.account_state === "closed") {
      throw new MerchantManagementError(404, "MERCHANT_NOT_FOUND", "merchant not found");
    }
    const pending = await operationalQueryRows<{ id: string }>(
      client,
      `SELECT id
         FROM merchant_deletion_requests
        WHERE merchant_id_snapshot = $1 AND status = 'pending'
        LIMIT 1
        FOR UPDATE`,
      [input.merchantId],
    );
    if (pending.length > 0 && input.status !== "suspended") {
      throw new MerchantManagementError(
        409,
        "MERCHANT_DELETION_REVIEW_PENDING",
        "merchant must remain suspended until the deletion request is reviewed",
      );
    }
    if (input.status === "approved" && !merchant.phone_verified) {
      throw new MerchantManagementError(
        409,
        "MERCHANT_PHONE_VERIFICATION_REQUIRED",
        "phone number must be verified before approval",
      );
    }

    const previousStatus = merchant.status;
    const suspensionLike = input.status === "suspended" || input.status === "rejected";
    const newlyBlocked = suspensionLike && merchant.account_state !== "suspended";

    if (input.status === "approved") {
      const fromSuspended = previousStatus === "suspended";
      await client.query(
        `UPDATE merchants
            SET status = 'approved',
                account_status = 'approved',
                approved_at = CASE WHEN $2::boolean THEN approved_at ELSE now() END,
                channel_activation_deadline = CASE
                  WHEN $2::boolean THEN channel_activation_deadline
                  ELSE now() + interval '10 days'
                END,
                onboarding_status = CASE
                  WHEN $2::boolean THEN onboarding_status
                  WHEN onboarding_status = 'channel_connected' THEN onboarding_status
                  ELSE 'awaiting_channel'
                END,
                trial_status = CASE
                  WHEN $2::boolean THEN trial_status
                  WHEN trial_status = 'eligible' THEN 'not_started'::trial_status
                  ELSE trial_status
                END,
                updated_at = now()
          WHERE id = $1`,
        [input.merchantId, fromSuspended],
      );
      await client.query(
        `UPDATE accounts
            SET state = 'active', suspended_at = NULL, updated_at = now()
          WHERE id = $1 AND kind = 'merchant' AND state <> 'closed'`,
        [input.merchantId],
      );
      if (fromSuspended) {
        await client.query(
          `UPDATE subscriptions
              SET status = CASE
                    WHEN expires_at <= now() THEN 'expired'::subscription_status
                    WHEN base_replies_remaining + addon_replies_remaining <= 0
                      THEN 'replies_exhausted'::subscription_status
                    ELSE 'active'::subscription_status
                  END,
                  auto_reply_enabled = (
                    expires_at > now()
                    AND base_replies_remaining + addon_replies_remaining > 0
                  ),
                  suspended_at = NULL,
                  version = version + 1,
                  updated_at = now()
            WHERE merchant_id = $1`,
          [input.merchantId],
        );
      }
    } else if (input.status === "pending_activation") {
      await client.query(
        `UPDATE merchants
            SET status = 'pending_activation',
                account_status = 'pending_review',
                onboarding_status = 'pending_review',
                approved_at = NULL,
                channel_activation_deadline = NULL,
                trial_status = CASE
                  WHEN trial_status = 'not_started' THEN 'eligible'::trial_status
                  ELSE trial_status
                END,
                updated_at = now()
          WHERE id = $1`,
        [input.merchantId],
      );
      await client.query(
        `UPDATE accounts
            SET state = 'active', suspended_at = NULL, updated_at = now()
          WHERE id = $1 AND kind = 'merchant' AND state <> 'closed'`,
        [input.merchantId],
      );
    } else {
      await client.query(
        `UPDATE merchants
            SET status = $2::merchant_status,
                account_status = $3::merchant_account_status,
                onboarding_status = CASE
                  WHEN $2::merchant_status = 'rejected' THEN 'pending_review'::onboarding_status
                  ELSE onboarding_status
                END,
                channel_activation_deadline = CASE
                  WHEN $2::merchant_status = 'rejected' THEN NULL
                  ELSE channel_activation_deadline
                END,
                updated_at = now()
          WHERE id = $1`,
        [
          input.merchantId,
          input.status,
          input.status === "rejected" ? "rejected" : "suspended",
        ],
      );
      await client.query(
        `UPDATE accounts
            SET state = 'suspended',
                suspended_at = COALESCE(suspended_at, now()),
                session_version = CASE WHEN $2::boolean THEN session_version + 1 ELSE session_version END,
                security_version = CASE WHEN $2::boolean THEN security_version + 1 ELSE security_version END,
                updated_at = now()
          WHERE id = $1 AND kind = 'merchant' AND state <> 'closed'`,
        [input.merchantId, newlyBlocked],
      );
      if (input.status === "suspended") {
        await client.query(
          `UPDATE subscriptions
              SET status = 'suspended',
                  auto_reply_enabled = false,
                  suspended_at = COALESCE(suspended_at, now()),
                  version = CASE WHEN status <> 'suspended' OR auto_reply_enabled THEN version + 1 ELSE version END,
                  updated_at = now()
            WHERE merchant_id = $1`,
          [input.merchantId],
        );
      }
      if (newlyBlocked) {
        await client.query(
          `UPDATE account_sessions
              SET status = 'revoked', revoked_at = now(), revoke_reason = 'account_disabled'
            WHERE account_id = $1 AND kind = 'merchant' AND status = 'active'`,
          [input.merchantId],
        );
      }
    }

    await writeAudit(client, {
      actorAdminId: input.actorAdminId,
      merchantId: input.merchantId,
      actionType:
        input.status === "approved" && previousStatus === "suspended"
          ? "unsuspended"
          : input.status === "pending_activation"
            ? "restore_pending"
            : input.status,
      ...(reason ? { reasonCode: input.status, details: reason } : {}),
      metadata: { previous_status: previousStatus, next_status: input.status },
    });

    const refreshed = await selectMerchant(client, input.merchantId);
    if (!refreshed) {
      throw new MerchantManagementError(409, "MERCHANT_STATE_CHANGED", "merchant state changed");
    }
    return managedMerchant(refreshed);
  });

  await refreshMerchantRetentionPostgres(input.merchantId).catch(() => null);
  return (await getManagedMerchantPostgres(input.merchantId)) || result;
}

export async function listDeletionRequestsPostgres(): Promise<ManagedDeletionRequest[]> {
  requirePostgres();
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<DeletionRequestRow>(
    pool,
    `SELECT id, merchant_id, merchant_id_snapshot, merchant_name_snapshot,
            merchant_phone_snapshot, requested_by_admin_id,
            requested_by_admin_id_snapshot, requested_by_admin_name_snapshot,
            requested_by_admin_phone_snapshot, reason, details, status,
            reviewed_by_admin_id, reviewed_at, completed_at, created_at
       FROM merchant_deletion_requests
      ORDER BY created_at DESC, id DESC`,
  );
  return rows.map(deletionRequest);
}

export async function createDeletionRequestPostgres(input: {
  merchantId: string;
  reason: "policy_violation" | "retention_expired";
  details: string;
  actorAdminId: string;
}): Promise<ManagedDeletionRequest> {
  requirePostgres();
  const details = String(input.details || "").trim();
  if (!details || details.length > 1000) {
    throw new MerchantManagementError(
      400,
      "DELETION_DETAILS_INVALID",
      "deletion details are required and must not exceed 1000 characters",
    );
  }
  if (input.reason !== "policy_violation" && input.reason !== "retention_expired") {
    throw new MerchantManagementError(400, "DELETION_REASON_INVALID", "invalid deletion reason");
  }
  return withOperationalTransaction(async (client) => {
    const merchant = await selectMerchant(client, input.merchantId, true);
    if (!merchant || merchant.account_state === "closed") {
      throw new MerchantManagementError(404, "MERCHANT_NOT_FOUND", "merchant not found");
    }
    if (merchant.status !== "suspended") {
      throw new MerchantManagementError(
        409,
        "MERCHANT_MUST_BE_SUSPENDED",
        "merchant must be suspended before deletion can be requested",
      );
    }
    const actor = await adminSnapshot(client, input.actorAdminId);
    if (!actor) {
      throw new MerchantManagementError(403, "ADMIN_ACCOUNT_INVALID", "administrator account is unavailable");
    }
    if (input.reason === "retention_expired") {
      const retention = calculateRetentionStatus(effectiveLifecycleEnd(merchant));
      if (retention.retentionStatus !== MerchantRetentionStatus.EligibleForDeletion) {
        throw new MerchantManagementError(
          409,
          "MERCHANT_NOT_ELIGIBLE_FOR_DELETION",
          "merchant is not eligible for retention deletion",
        );
      }
    }
    const id = `merchant-deletion-${crypto.randomUUID()}`;
    try {
      await client.query(
        `INSERT INTO merchant_deletion_requests (
           id, merchant_id, merchant_id_snapshot, merchant_name_snapshot,
           merchant_phone_snapshot, requested_by_admin_id,
           requested_by_admin_id_snapshot, requested_by_admin_name_snapshot,
           requested_by_admin_phone_snapshot, reason, details, status, created_at
         ) VALUES (
           $1, $2, $2, $3,
           $4, $5,
           $5, $6,
           $7, $8, $9, 'pending', now()
         )`,
        [
          id,
          input.merchantId,
          merchant.store_name,
          merchant.phone || "",
          actor.id,
          actor.display_name,
          actor.phone || "",
          input.reason,
          details,
        ],
      );
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new MerchantManagementError(
          409,
          "DELETION_REQUEST_ALREADY_PENDING",
          "a deletion request is already pending for this merchant",
        );
      }
      throw error;
    }
    await writeAudit(client, {
      actorAdminId: input.actorAdminId,
      merchantId: input.merchantId,
      actionType: "deletion_requested",
      reasonCode: input.reason,
      details: "merchant deletion requested",
      metadata: { deletion_request_id: id },
    });
    const rows = await operationalQueryRows<DeletionRequestRow>(
      client,
      `SELECT id, merchant_id, merchant_id_snapshot, merchant_name_snapshot,
              merchant_phone_snapshot, requested_by_admin_id,
              requested_by_admin_id_snapshot, requested_by_admin_name_snapshot,
              requested_by_admin_phone_snapshot, reason, details, status,
              reviewed_by_admin_id, reviewed_at, completed_at, created_at
         FROM merchant_deletion_requests WHERE id = $1`,
      [id],
    );
    return deletionRequest(rows[0]);
  });
}

export async function rejectDeletionRequestPostgres(input: {
  requestId: string;
  actorAdminId: string;
}): Promise<ManagedDeletionRequest> {
  requirePostgres();
  return withOperationalTransaction(async (client) => {
    const rows = await operationalQueryRows<DeletionRequestRow>(
      client,
      `SELECT id, merchant_id, merchant_id_snapshot, merchant_name_snapshot,
              merchant_phone_snapshot, requested_by_admin_id,
              requested_by_admin_id_snapshot, requested_by_admin_name_snapshot,
              requested_by_admin_phone_snapshot, reason, details, status,
              reviewed_by_admin_id, reviewed_at, completed_at, created_at
         FROM merchant_deletion_requests
        WHERE id = $1
        FOR UPDATE`,
      [input.requestId],
    );
    const request = rows[0];
    if (!request) {
      throw new MerchantManagementError(404, "DELETION_REQUEST_NOT_FOUND", "deletion request not found");
    }
    if (request.status !== "pending") {
      throw new MerchantManagementError(
        409,
        "DELETION_REQUEST_ALREADY_REVIEWED",
        "deletion request is already reviewed",
      );
    }
    await client.query(
      `UPDATE merchant_deletion_requests
          SET status = 'rejected', reviewed_by_admin_id = $2, reviewed_at = now()
        WHERE id = $1`,
      [input.requestId, input.actorAdminId],
    );
    await writeAudit(client, {
      actorAdminId: input.actorAdminId,
      merchantId: request.merchant_id_snapshot,
      actionType: "deletion_request_rejected",
      reasonCode: request.reason,
      details: "merchant deletion request rejected",
      metadata: { deletion_request_id: request.id },
    });
    const refreshed = await operationalQueryRows<DeletionRequestRow>(
      client,
      `SELECT id, merchant_id, merchant_id_snapshot, merchant_name_snapshot,
              merchant_phone_snapshot, requested_by_admin_id,
              requested_by_admin_id_snapshot, requested_by_admin_name_snapshot,
              requested_by_admin_phone_snapshot, reason, details, status,
              reviewed_by_admin_id, reviewed_at, completed_at, created_at
         FROM merchant_deletion_requests WHERE id = $1`,
      [input.requestId],
    );
    return deletionRequest(refreshed[0]);
  });
}

async function assertDeletionQuiescent(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<void> {
  const rows = await operationalQueryRows<{
    billing_pending: number;
    refund_pending: number;
    billing_events_pending: number;
    jobs_active: number;
    outbound_uncertain: number;
    reply_refunds_unresolved: number;
  }>(
    target,
    `SELECT
       (SELECT COUNT(*)::int FROM saas_billing_orders
         WHERE merchant_id = $1 AND status IN ('pending', 'paid_reconciliation_required')) AS billing_pending,
       (SELECT COUNT(*)::int FROM saas_billing_refunds
         WHERE merchant_id = $1 AND status = 'pending') AS refund_pending,
       (SELECT COUNT(*)::int FROM saas_billing_events
         WHERE merchant_id = $1 AND status = 'received') AS billing_events_pending,
       (SELECT COUNT(*)::int FROM background_jobs
         WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'retry')) AS jobs_active,
       (SELECT COUNT(*)::int FROM outbound_deliveries
         WHERE merchant_id = $1 AND outcome IN ('pending', 'uncertain')) AS outbound_uncertain,
       (SELECT COUNT(*)::int FROM reply_refunds
         WHERE merchant_id = $1 AND state IN ('pending', 'conflict')) AS reply_refunds_unresolved`,
    [merchantId],
  );
  const row = rows[0];
  if (
    !row ||
    Number(row.billing_pending) > 0 ||
    Number(row.refund_pending) > 0 ||
    Number(row.billing_events_pending) > 0 ||
    Number(row.jobs_active) > 0 ||
    Number(row.outbound_uncertain) > 0 ||
    Number(row.reply_refunds_unresolved) > 0
  ) {
    throw new MerchantManagementError(
      409,
      "MERCHANT_DELETION_OPERATIONS_PENDING",
      "merchant deletion is blocked while billing, refund, delivery, or durable job operations are unresolved",
    );
  }
}

async function purgeMerchantOperationalData(
  target: OperationalQueryTarget,
  merchantId: string,
): Promise<void> {
  // Preserve order/payment proof while removing customer/business free-text PII
  // and references to operational conversation/catalog records.
  await target.query(
    `UPDATE orders
        SET conversation_id = NULL,
            customer_external_id = NULL,
            customer_name = '[deleted customer]',
            customer_phone = NULL,
            customer_address = NULL,
            customer_area = NULL,
            notes = NULL,
            payment_rejection_reason = CASE
              WHEN payment_status = 'failed' THEN '[deleted reason]'
              ELSE NULL
            END,
            payment_conflict_resolution_note = CASE
              WHEN payment_reconciliation_status = 'resolved' THEN '[deleted note]'
              ELSE NULL
            END,
            metadata = '{}'::jsonb,
            updated_at = now()
      WHERE merchant_id = $1`,
    [merchantId],
  );
  await target.query(
    `UPDATE order_items
        SET product_id = NULL,
            product_variant_id = NULL,
            product_name_snapshot = '[deleted product]',
            variant_snapshot = '{}'::jsonb
      WHERE merchant_id = $1`,
    [merchantId],
  );
  await target.query(
    `UPDATE order_payment_decisions
        SET actor_session_fingerprint = NULL,
            reason = NULL
      WHERE merchant_id = $1`,
    [merchantId],
  );
  await target.query(
    `UPDATE order_payment_provider_events
        SET sanitized_metadata = '{}'::jsonb
      WHERE merchant_id = $1`,
    [merchantId],
  );

  await target.query(`DELETE FROM order_drafts WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM manual_reply_requests WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM messages WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM conversations WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM processed_channel_events WHERE merchant_id = $1`, [merchantId]);

  // Channel rows remain as FK anchors for exactly-once/reply history, but all
  // credentials/external-account identity are irreversibly scrubbed.
  await target.query(
    `UPDATE merchant_channels
        SET status = 'revoked',
            external_account_id = NULL,
            external_account_name = NULL,
            page_id = NULL,
            page_name = NULL,
            instagram_account_id = NULL,
            instagram_username = NULL,
            credential_ciphertext = NULL,
            credential_nonce = NULL,
            credential_auth_tag = NULL,
            credential_key_id = NULL,
            credential_algorithm = NULL,
            credential_expires_at = NULL,
            webhook_subscribed_at = NULL,
            last_error_code = NULL,
            metadata = '{}'::jsonb,
            disconnected_at = COALESCE(disconnected_at, now()),
            updated_at = now()
      WHERE merchant_id = $1`,
    [merchantId],
  );

  // Retained exactly-once/refund evidence keeps only Fawri-owned internal
  // linkage; raw Meta/provider Page, event, message, and dedupe identifiers are
  // retired before terminal job/ledger anchors are preserved.
  await retireMerchantProviderIdentifiers(target, merchantId);

  // Remove encrypted payloads. Completed/dead-letter jobs referenced by inbound
  // event history stay as non-sensitive anchors; unreferenced jobs are deleted.
  await target.query(`DELETE FROM background_job_payloads WHERE merchant_id = $1`, [merchantId]);
  await target.query(
    `UPDATE job_attempts
        SET error_code = NULL, metadata = '{}'::jsonb
      WHERE job_id IN (SELECT id FROM background_jobs WHERE merchant_id = $1)`,
    [merchantId],
  );
  await target.query(
    `UPDATE job_dead_letters
        SET payload_sha256 = NULL, metadata = '{}'::jsonb
      WHERE job_id IN (SELECT id FROM background_jobs WHERE merchant_id = $1)`,
    [merchantId],
  );
  await target.query(
    `UPDATE background_jobs
        SET payload_hash = NULL,
            last_error_code = NULL,
            result = '{}'::jsonb,
            updated_at = now()
      WHERE merchant_id = $1`,
    [merchantId],
  );
  await target.query(
    `DELETE FROM background_jobs j
      WHERE j.merchant_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM channel_inbound_events e WHERE e.enqueue_job_id = j.id
        )`,
    [merchantId],
  );

  await target.query(`DELETE FROM catalog_idempotency_keys WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM inventory_mutations WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM catalog_identifiers WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM catalog_image_references WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM catalog_variant_options WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM product_variants WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM products WHERE merchant_id = $1`, [merchantId]);

  await target.query(`DELETE FROM knowledge_embeddings WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM knowledge_audit_events WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM learned_answers WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM training_requests WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM saved_answers WHERE merchant_id = $1`, [merchantId]);

  await target.query(`DELETE FROM support_attachments WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM support_inspection_requests WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM support_messages WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM support_preview_sessions WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM support_tickets WHERE merchant_id = $1`, [merchantId]);

  await target.query(`DELETE FROM emergency_access_requests WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM notifications WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM merchant_settings WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM merchant_admin_notes WHERE merchant_id = $1`, [merchantId]);
  await target.query(`DELETE FROM merchant_channel_overrides WHERE merchant_id = $1`, [merchantId]);

  await target.query(`DELETE FROM auth_otp_challenges WHERE account_id = $1`, [merchantId]);
  await target.query(`DELETE FROM trusted_devices WHERE account_id = $1 AND kind = 'merchant'`, [merchantId]);
  await target.query(`DELETE FROM account_sessions WHERE account_id = $1 AND kind = 'merchant'`, [merchantId]);
  await target.query(`DELETE FROM login_attempts WHERE account_id = $1 AND kind = 'merchant'`, [merchantId]);

  // Retained financial/entitlement/audit rows keep only non-PII proof fields.
  await target.query(`UPDATE reply_ledger SET message_id = NULL, metadata = '{}'::jsonb WHERE merchant_id = $1`, [merchantId]);
  await target.query(`UPDATE saas_billing_orders SET metadata = '{}'::jsonb WHERE merchant_id = $1`, [merchantId]);
  await target.query(`UPDATE audit_events SET details = NULL, metadata = '{}'::jsonb WHERE merchant_id = $1`, [merchantId]);
}

export async function completeMerchantDeletionPostgres(input: {
  merchantId: string;
  deletionRequestId: string;
  actorAdminId: string;
}): Promise<{ ok: true; deletedMerchantId: string; deletionRequest: ManagedDeletionRequest }> {
  requirePostgres();
  return withOperationalTransaction(async (client) => {
    const merchant = await selectMerchant(client, input.merchantId, true);
    if (!merchant || merchant.account_state === "closed") {
      throw new MerchantManagementError(404, "MERCHANT_NOT_FOUND", "merchant not found");
    }
    if (merchant.status !== "suspended") {
      throw new MerchantManagementError(
        409,
        "MERCHANT_MUST_BE_SUSPENDED",
        "merchant must be suspended before deletion",
      );
    }
    const requests = await operationalQueryRows<DeletionRequestRow>(
      client,
      `SELECT id, merchant_id, merchant_id_snapshot, merchant_name_snapshot,
              merchant_phone_snapshot, requested_by_admin_id,
              requested_by_admin_id_snapshot, requested_by_admin_name_snapshot,
              requested_by_admin_phone_snapshot, reason, details, status,
              reviewed_by_admin_id, reviewed_at, completed_at, created_at
         FROM merchant_deletion_requests
        WHERE id = $1 AND merchant_id_snapshot = $2
        FOR UPDATE`,
      [input.deletionRequestId, input.merchantId],
    );
    const request = requests[0];
    if (!request) {
      throw new MerchantManagementError(404, "DELETION_REQUEST_NOT_FOUND", "deletion request not found");
    }
    if (request.status !== "pending") {
      throw new MerchantManagementError(
        409,
        "DELETION_REQUEST_ALREADY_REVIEWED",
        "deletion request is already reviewed",
      );
    }
    if (request.reason === MerchantDeleteReason.RetentionExpired) {
      const retention = calculateRetentionStatus(effectiveLifecycleEnd(merchant));
      if (retention.retentionStatus !== MerchantRetentionStatus.EligibleForDeletion) {
        throw new MerchantManagementError(
          409,
          "MERCHANT_NOT_ELIGIBLE_FOR_DELETION",
          "merchant is not eligible for retention deletion",
        );
      }
    }

    await assertDeletionQuiescent(client, input.merchantId);
    await purgeMerchantOperationalData(client, input.merchantId);

    await client.query(
      `UPDATE subscriptions
          SET status = 'suspended',
              auto_reply_enabled = false,
              suspended_at = COALESCE(suspended_at, now()),
              metadata = '{}'::jsonb,
              version = version + 1,
              updated_at = now()
        WHERE merchant_id = $1`,
      [input.merchantId],
    );
    await client.query(
      `UPDATE merchants
          SET owner_name = '[deleted merchant]',
              store_name = '[deleted merchant]',
              activity_type = '[deleted]',
              status = 'suspended',
              account_status = 'suspended',
              onboarding_status = 'pending_review',
              requested_plan = NULL,
              approved_at = NULL,
              first_channel_connected_at = NULL,
              channel_activation_deadline = NULL,
              trial_started_at = NULL,
              trial_expires_at = NULL,
              retention_status = 'deleted',
              products_read_only = true,
              metadata = jsonb_build_object(
                'deleted_at', now()::text,
                'deletion_request_id', $2::text,
                'deletion_reason', $3::text
              ),
              updated_at = now()
        WHERE id = $1`,
      [input.merchantId, input.deletionRequestId, request.reason],
    );
    await client.query(
      `UPDATE accounts
          SET phone = NULL,
              password_hash = $2,
              phone_verified = false,
              phone_verified_at = NULL,
              state = 'closed',
              closed_at = now(),
              suspended_at = NULL,
              password_version = password_version + 1,
              security_version = security_version + 1,
              session_version = session_version + 1,
              metadata = jsonb_build_object('deleted_at', now()::text),
              updated_at = now()
        WHERE id = $1 AND kind = 'merchant'`,
      [input.merchantId, `deleted$${crypto.randomUUID()}`],
    );

    await client.query(
      `UPDATE merchant_deletion_requests
          SET merchant_name_snapshot = '[deleted merchant]',
              merchant_phone_snapshot = '',
              details = '[merchant data deleted]'
        WHERE merchant_id_snapshot = $1`,
      [input.merchantId],
    );
    await client.query(
      `UPDATE merchant_deletion_requests
          SET status = 'completed',
              reviewed_by_admin_id = $2,
              reviewed_at = now(),
              completed_at = now()
        WHERE id = $1`,
      [input.deletionRequestId, input.actorAdminId],
    );
    await writeAudit(client, {
      actorAdminId: input.actorAdminId,
      merchantId: input.merchantId,
      actionType: "merchant_deleted",
      reasonCode: request.reason,
      metadata: {
        deletion_request_id: input.deletionRequestId,
        deletion_mode: "irreversible_tombstone",
      },
    });

    const refreshed = await operationalQueryRows<DeletionRequestRow>(
      client,
      `SELECT id, merchant_id, merchant_id_snapshot, merchant_name_snapshot,
              merchant_phone_snapshot, requested_by_admin_id,
              requested_by_admin_id_snapshot, requested_by_admin_name_snapshot,
              requested_by_admin_phone_snapshot, reason, details, status,
              reviewed_by_admin_id, reviewed_at, completed_at, created_at
         FROM merchant_deletion_requests WHERE id = $1`,
      [input.deletionRequestId],
    );
    return {
      ok: true as const,
      deletedMerchantId: input.merchantId,
      deletionRequest: deletionRequest(refreshed[0]),
    };
  });
}

export async function importLegacyAdminDataPostgres(input: {
  actorAdminId: string;
  logs: unknown[];
  notes: Record<string, unknown>;
  channelOverrides: Record<string, unknown>;
}): Promise<{ logs: number; notes: number; channels: number }> {
  requirePostgres();
  return withOperationalTransaction(async (client) => {
    const actor = await adminSnapshot(client, input.actorAdminId);
    if (!actor || actor.role !== "owner_admin") {
      throw new MerchantManagementError(403, "OWNER_ADMIN_REQUIRED", "owner administrator is required");
    }
    let importedLogs = 0;
    let importedNotes = 0;
    let importedChannels = 0;

    for (const candidate of input.logs.slice(0, 5000)) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const record = candidate as Record<string, unknown>;
      const id = String(record.id || "").trim();
      const merchantId = String(record.merchant_id || "").trim();
      const actionType = String(record.action_type || "").trim();
      const createdAt = new Date(String(record.created_at || ""));
      if (!id || !merchantId || !actionType || !Number.isFinite(createdAt.getTime())) continue;
      const merchant = await selectMerchant(client, merchantId);
      if (!merchant || merchant.account_state === "closed") continue;
      const result = await client.query(
        `INSERT INTO audit_events (
           id, actor_kind, actor_account_id, merchant_id,
           action_type, entity_type, entity_id, reason_code,
           details, metadata, created_at
         ) VALUES (
           $1, 'account', $2, $3,
           $4, 'merchant', $3, $5,
           $6, $7::jsonb, $8
         ) ON CONFLICT (id) DO NOTHING`,
        [
          id,
          input.actorAdminId,
          merchantId,
          actionType,
          record.reason ? String(record.reason).slice(0, 1000) : null,
          String(record.details || "").slice(0, 2000) || null,
          JSON.stringify({
            legacy_import: true,
            source_admin_id: String(record.admin_id || ""),
            source_admin_name: String(record.admin_name || ""),
            source_admin_phone: String(record.admin_phone || ""),
            source_admin_role: String(record.admin_role || ""),
            ...(record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
              ? { source_meta: record.meta }
              : {}),
          }),
          createdAt.toISOString(),
        ],
      );
      importedLogs += result.rowCount || 0;
    }

    for (const [merchantId, value] of Object.entries(input.notes)) {
      if (typeof value !== "string" || value.length > 5000) continue;
      const merchant = await selectMerchant(client, merchantId);
      if (!merchant || merchant.account_state === "closed") continue;
      const result = await client.query(
        `INSERT INTO merchant_admin_notes (
           merchant_id, note, updated_by_admin_id, created_at, updated_at
         ) VALUES ($1, $2, $3, now(), now())
         ON CONFLICT (merchant_id) DO NOTHING`,
        [merchantId, value, input.actorAdminId],
      );
      importedNotes += result.rowCount || 0;
    }

    const allowedPlatforms = new Set([
      "messenger",
      "instagram",
      "whatsapp",
      "telegram",
      "tiktok",
      "web_chat",
    ]);
    const allowedStatuses = new Set([
      "connected",
      "disconnected",
      "pending",
      "error",
      "revoked",
    ]);
    for (const [merchantId, raw] of Object.entries(input.channelOverrides)) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const merchant = await selectMerchant(client, merchantId);
      if (!merchant || merchant.account_state === "closed") continue;
      for (const [platform, statusValue] of Object.entries(raw as Record<string, unknown>)) {
        const status = String(statusValue || "");
        if (!allowedPlatforms.has(platform) || !allowedStatuses.has(status)) continue;
        const result = await client.query(
          `INSERT INTO merchant_channel_overrides (
             merchant_id, platform, status, updated_by_admin_id, created_at, updated_at
           ) VALUES ($1, $2::channel_platform, $3::channel_status, $4, now(), now())
           ON CONFLICT (merchant_id, platform) DO NOTHING`,
          [merchantId, platform, status, input.actorAdminId],
        );
        importedChannels += result.rowCount || 0;
      }
    }

    return { logs: importedLogs, notes: importedNotes, channels: importedChannels };
  });
}

export async function listAdminLogsPostgres(limit = 1000): Promise<unknown[]> {
  requirePostgres();
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<{
    id: string;
    actor_account_id: string | null;
    actor_name: string | null;
    actor_phone: string | null;
    actor_role: string | null;
    action_type: string;
    merchant_id: string | null;
    merchant_name: string | null;
    details: string | null;
    reason_code: string | null;
    metadata: Record<string, unknown> | null;
    created_at: Date;
  }>(
    pool,
    `SELECT e.id, e.actor_account_id,
            p.display_name AS actor_name,
            a.phone AS actor_phone,
            p.role::text AS actor_role,
            e.action_type, e.merchant_id,
            m.store_name AS merchant_name,
            e.details, e.reason_code, e.metadata, e.created_at
       FROM audit_events e
       LEFT JOIN accounts a ON a.id = e.actor_account_id
       LEFT JOIN admin_profiles p ON p.id = e.actor_account_id
       LEFT JOIN merchants m ON m.id = e.merchant_id
      WHERE e.entity_type = 'merchant' OR e.merchant_id IS NOT NULL
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $1`,
    [Math.max(1, Math.min(5000, limit))],
  );
  return rows.map((row) => ({
    id: row.id,
    ...(row.actor_account_id ? { admin_id: row.actor_account_id } : {}),
    admin_name:
      row.actor_name || String(row.metadata?.source_admin_name || "Fawri System"),
    admin_phone:
      row.actor_phone || String(row.metadata?.source_admin_phone || "system"),
    ...(row.actor_role || row.metadata?.source_admin_role
      ? { admin_role: row.actor_role || String(row.metadata?.source_admin_role) }
      : {}),
    action_type: row.action_type,
    merchant_id: row.merchant_id || "",
    merchant_name:
      row.merchant_name || String(row.metadata?.merchant_name_snapshot || "Merchant"),
    details: row.details || "",
    ...(row.reason_code ? { reason: row.reason_code } : {}),
    ...(row.metadata && Object.keys(row.metadata).length > 0 ? { meta: row.metadata } : {}),
    created_at: row.created_at.toISOString(),
  }));
}
