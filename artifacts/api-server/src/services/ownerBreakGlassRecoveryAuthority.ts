import crypto from "node:crypto";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "./authPasswordService";
import {
  auditAdminSecurityEventAuthoritative,
} from "./postgresAdminSecurityAuthority";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

const RECOVERY_METADATA_KEY = "owner_recovery";

export class OwnerRecoveryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "OwnerRecoveryError";
    this.code = code;
    this.status = status;
  }
}

type RecoveryMetadata = {
  version: 1;
  generation: string;
  recovery_id_hash: string;
  key_1_hash?: string;
  key_2_hash?: string;
  enabled: boolean;
  created_at: string;
  used_at?: string | null;
};

type OwnerRecoveryRow = {
  id: string;
  phone: string;
  password_hash: string;
  metadata: Record<string, unknown>;
};

function authSecret(): string {
  const configured = String(process.env.FAWRI_AUTH_SECURITY_SECRET || "");
  if (process.env.NODE_ENV === "production" && configured.length < 32) {
    throw new Error("FAWRI_AUTH_SECURITY_SECRET must contain at least 32 characters");
  }
  return configured || "fawri-local-auth-security-secret-not-for-production";
}

export function ownerRecoveryFingerprint(domain: string, value: string): string {
  return crypto
    .createHmac("sha256", authSecret())
    .update(`owner-recovery:${domain}:${value}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function recoveryFromMetadata(metadata: Record<string, unknown>): RecoveryMetadata | null {
  const value = metadata?.[RECOVERY_METADATA_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Partial<RecoveryMetadata>;
  if (
    state.version !== 1 ||
    typeof state.generation !== "string" ||
    typeof state.recovery_id_hash !== "string" ||
    typeof state.enabled !== "boolean" ||
    typeof state.created_at !== "string"
  ) {
    return null;
  }
  return state as RecoveryMetadata;
}

async function ownerById(
  target: OperationalQueryTarget,
  accountId: string,
  lock = false,
): Promise<OwnerRecoveryRow | null> {
  const rows = await operationalQueryRows<OwnerRecoveryRow>(
    target,
    `SELECT a.id, a.phone, a.password_hash, a.metadata
       FROM accounts AS a
       JOIN admin_profiles AS p ON p.id = a.id AND p.account_id = a.id
      WHERE a.id = $1
        AND a.kind = 'admin'
        AND a.state = 'active'
        AND p.enabled = TRUE
        AND p.role = 'owner_admin'
      LIMIT 1${lock ? " FOR UPDATE OF a" : ""}`,
    [accountId],
  );
  return rows[0] || null;
}

export async function getOwnerRecoveryStatus(accountId: string): Promise<{
  enabled: boolean;
  created_at: string | null;
  used_at: string | null;
}> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OwnerRecoveryError(
      "OWNER_RECOVERY_POSTGRES_REQUIRED",
      "owner recovery requires PostgreSQL authority",
      503,
    );
  }
  const pool = await operationalDatabasePool();
  const owner = await ownerById(pool, accountId);
  if (!owner) {
    throw new OwnerRecoveryError("OWNER_ADMIN_REQUIRED", "owner administrator is required", 403);
  }
  const recovery = recoveryFromMetadata(owner.metadata || {});
  return {
    enabled: recovery?.enabled === true,
    created_at: recovery?.created_at || null,
    used_at: recovery?.used_at || null,
  };
}

export async function generateOwnerRecoveryBundle(accountId: string): Promise<{
  recovery_id: string;
  recovery_path: string;
  key_1: string;
  key_2: string;
  created_at: string;
}> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OwnerRecoveryError(
      "OWNER_RECOVERY_POSTGRES_REQUIRED",
      "owner recovery requires PostgreSQL authority",
      503,
    );
  }
  const generated = await withOperationalTransaction(async (client) => {
    const owner = await ownerById(client, accountId, true);
    if (!owner) {
      throw new OwnerRecoveryError("OWNER_ADMIN_REQUIRED", "owner administrator is required", 403);
    }
    const recoveryId = randomHex(24);
    const key1 = randomHex(32);
    const key2 = randomHex(32);
    const now = new Date().toISOString();
    const state: RecoveryMetadata = {
      version: 1,
      generation: crypto.randomUUID(),
      recovery_id_hash: ownerRecoveryFingerprint("recovery-id", recoveryId),
      key_1_hash: ownerRecoveryFingerprint("key-1", key1),
      key_2_hash: ownerRecoveryFingerprint("key-2", key2),
      enabled: true,
      created_at: now,
      used_at: null,
    };
    await client.query(
      `UPDATE accounts
          SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{owner_recovery}', $2::jsonb, TRUE),
              updated_at = now()
        WHERE id = $1 AND kind = 'admin'`,
      [accountId, JSON.stringify(state)],
    );
    return {
      recovery_id: recoveryId,
      recovery_path: `/owner-recovery/${recoveryId}`,
      key_1: key1,
      key_2: key2,
      created_at: now,
    };
  });
  await auditAdminSecurityEventAuthoritative({
    event_type: "owner_recovery_bundle_generated",
    actor_account_id: accountId,
    actor_kind: "admin",
    subject_hash: accountId,
  });
  return generated;
}

export async function verifyOwnerRecoveryKey1(input: {
  recoveryId: string;
  oldPhone: string;
  key1: string;
}): Promise<{
  owner_id: string;
  recovery_id_hash: string;
  old_phone_hash: string;
  generation: string;
}> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OwnerRecoveryError(
      "OWNER_RECOVERY_POSTGRES_REQUIRED",
      "owner recovery requires PostgreSQL authority",
      503,
    );
  }
  const recoveryIdHash = ownerRecoveryFingerprint("recovery-id", input.recoveryId);
  return withOperationalTransaction(async (client) => {
    const rows = await operationalQueryRows<OwnerRecoveryRow>(
      client,
      `SELECT a.id, a.phone, a.password_hash, a.metadata
         FROM accounts AS a
         JOIN admin_profiles AS p ON p.id = a.id AND p.account_id = a.id
        WHERE a.kind = 'admin'
          AND a.state = 'active'
          AND p.enabled = TRUE
          AND p.role = 'owner_admin'
          AND a.phone = $2
          AND a.metadata -> 'owner_recovery' ->> 'recovery_id_hash' = $1
        LIMIT 1
        FOR UPDATE OF a`,
      [recoveryIdHash, input.oldPhone],
    );
    const owner = rows[0];
    const recovery = owner ? recoveryFromMetadata(owner.metadata || {}) : null;
    if (
      !owner ||
      !recovery?.enabled ||
      !recovery.key_1_hash ||
      !safeEqual(
        recovery.key_1_hash,
        ownerRecoveryFingerprint("key-1", input.key1),
      )
    ) {
      throw new OwnerRecoveryError(
        "OWNER_RECOVERY_INVALID",
        "owner recovery credentials are invalid",
        401,
      );
    }
    return {
      owner_id: owner.id,
      recovery_id_hash: recovery.recovery_id_hash,
      old_phone_hash: ownerRecoveryFingerprint("old-phone", owner.phone),
      generation: recovery.generation,
    };
  });
}

export async function ensureOwnerRecoveryPhoneAvailable(input: {
  ownerId: string;
  newPhone: string;
}): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OwnerRecoveryError(
      "OWNER_RECOVERY_POSTGRES_REQUIRED",
      "owner recovery requires PostgreSQL authority",
      503,
    );
  }
  const pool = await operationalDatabasePool();
  const collision = await operationalQueryRows<{ id: string }>(
    pool,
    `SELECT id FROM accounts WHERE phone = $1 AND id <> $2 LIMIT 1`,
    [input.newPhone, input.ownerId],
  );
  if (collision.length > 0) {
    throw new OwnerRecoveryError(
      "OWNER_RECOVERY_NEW_PHONE_UNAVAILABLE",
      "new phone cannot be used for recovery",
      409,
    );
  }
}

export async function completeOwnerRecovery(input: {
  ownerId: string;
  recoveryIdHash: string;
  oldPhoneHash: string;
  generation: string;
  newPhone: string;
  key2: string;
  mode: "current_password" | "reset_password";
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
}): Promise<{ password_reset: boolean }> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new OwnerRecoveryError(
      "OWNER_RECOVERY_POSTGRES_REQUIRED",
      "owner recovery requires PostgreSQL authority",
      503,
    );
  }
  const result = await withOperationalTransaction(async (client) => {
    const owner = await ownerById(client, input.ownerId, true);
    const recovery = owner ? recoveryFromMetadata(owner.metadata || {}) : null;
    if (
      !owner ||
      !recovery?.enabled ||
      recovery.generation !== input.generation ||
      recovery.recovery_id_hash !== input.recoveryIdHash ||
      !recovery.key_2_hash ||
      !safeEqual(
        recovery.key_2_hash,
        ownerRecoveryFingerprint("key-2", input.key2),
      ) ||
      !safeEqual(
        input.oldPhoneHash,
        ownerRecoveryFingerprint("old-phone", owner.phone),
      )
    ) {
      throw new OwnerRecoveryError(
        "OWNER_RECOVERY_INVALID",
        "owner recovery credentials are invalid",
        401,
      );
    }
    if (input.newPhone === owner.phone) {
      throw new OwnerRecoveryError(
        "OWNER_RECOVERY_PHONE_UNCHANGED",
        "new phone must be different from the old phone",
        400,
      );
    }
    const collisions = await operationalQueryRows<{ id: string }>(
      client,
      `SELECT id FROM accounts WHERE phone = $1 AND id <> $2 FOR UPDATE`,
      [input.newPhone, owner.id],
    );
    if (collisions.length > 0) {
      throw new OwnerRecoveryError(
        "OWNER_RECOVERY_NEW_PHONE_UNAVAILABLE",
        "new phone cannot be used for recovery",
        409,
      );
    }

    let nextPasswordHash: string | null = null;
    if (input.mode === "current_password") {
      if (!input.currentPassword || !verifyPassword(input.currentPassword, owner.password_hash)) {
        throw new OwnerRecoveryError(
          "OWNER_RECOVERY_CURRENT_PASSWORD_INVALID",
          "current password is incorrect",
          401,
        );
      }
    } else {
      const next = String(input.newPassword || "");
      const confirm = String(input.confirmNewPassword || "");
      const validation = getPasswordValidationError(next);
      if (validation || !next || next !== confirm) {
        throw new OwnerRecoveryError(
          validation?.code || "OWNER_RECOVERY_NEW_PASSWORD_INVALID",
          validation?.message || "new password confirmation is invalid",
          400,
        );
      }
      nextPasswordHash = hashPassword(next);
    }

    const now = new Date();
    const disabledState: RecoveryMetadata = {
      version: 1,
      generation: recovery.generation,
      recovery_id_hash: recovery.recovery_id_hash,
      enabled: false,
      created_at: recovery.created_at,
      used_at: now.toISOString(),
    };

    if (nextPasswordHash) {
      await client.query(
        `UPDATE accounts
            SET phone = $2,
                phone_verified = TRUE,
                phone_verified_at = $3,
                password_hash = $4,
                password_version = password_version + 1,
                password_changed_at = $3,
                security_version = security_version + 1,
                session_version = session_version + 1,
                metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{owner_recovery}', $5::jsonb, TRUE),
                updated_at = $3
          WHERE id = $1 AND kind = 'admin'`,
        [owner.id, input.newPhone, now, nextPasswordHash, JSON.stringify(disabledState)],
      );
    } else {
      await client.query(
        `UPDATE accounts
            SET phone = $2,
                phone_verified = TRUE,
                phone_verified_at = $3,
                security_version = security_version + 1,
                session_version = session_version + 1,
                metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{owner_recovery}', $4::jsonb, TRUE),
                updated_at = $3
          WHERE id = $1 AND kind = 'admin'`,
        [owner.id, input.newPhone, now, JSON.stringify(disabledState)],
      );
    }

    await client.query(
      `UPDATE account_sessions
          SET status = 'revoked', revoked_at = $2, revoke_reason = $3
        WHERE account_id = $1 AND kind = 'admin' AND status = 'active'`,
      [owner.id, now, nextPasswordHash ? "password_reset" : "manual_revocation"],
    );
    await client.query(
      `UPDATE trusted_devices
          SET status = 'revoked', trust_slot = NULL, trusted_at = NULL,
              trusted_by_account_id = NULL, revoked_at = $2,
              revoked_by_account_id = $1
        WHERE account_id = $1 AND kind = 'admin' AND status <> 'revoked'`,
      [owner.id, now],
    );
    return { password_reset: Boolean(nextPasswordHash) };
  });

  await auditAdminSecurityEventAuthoritative({
    event_type: "owner_break_glass_recovery_completed",
    actor_kind: "admin",
    subject_hash: input.ownerId,
    reason_code: result.password_reset ? "phone_and_password_recovered" : "phone_recovered",
    decision_code: "all_sessions_and_devices_revoked",
  });
  return result;
}
