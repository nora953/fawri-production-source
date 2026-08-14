import crypto from "node:crypto";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import { productionReleaseGateRequired } from "./productionReleaseReadiness";

export type OwnerAdminLanguage = "ar" | "ku" | "en";

export type OwnerAdminProvisioningResult = {
  adminId: string;
  phone: string;
  displayName: string;
  language: OwnerAdminLanguage;
};

export type OwnerAdminReadiness = {
  ownerCount: number;
  usableOwnerCount: number;
};

export class OwnerAdminProvisioningError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OwnerAdminProvisioningError";
    this.code = code;
  }
}

function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeLanguage(value: unknown): OwnerAdminLanguage {
  return value === "en" || value === "ku" ? value : "ar";
}

function numericCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function fail(code: string, message: string): never {
  throw new OwnerAdminProvisioningError(code, message);
}

export async function getOwnerAdminReadiness(
  target?: OperationalQueryTarget,
): Promise<OwnerAdminReadiness> {
  const queryTarget = target || (await operationalDatabasePool());
  const rows = await operationalQueryRows<{
    owner_count: string | number;
    usable_owner_count: string | number;
  }>(
    queryTarget,
    `SELECT
       COUNT(*) FILTER (WHERE p.role = 'owner_admin') AS owner_count,
       COUNT(*) FILTER (
         WHERE p.role = 'owner_admin'
           AND a.kind = 'admin'
           AND a.state = 'active'
           AND a.phone_verified = TRUE
           AND p.profile_kind = 'admin'
           AND p.enabled = TRUE
           AND length(a.password_hash) > 0
       ) AS usable_owner_count
     FROM admin_profiles p
     JOIN accounts a ON a.id = p.account_id`,
  );
  return {
    ownerCount: numericCount(rows[0]?.owner_count),
    usableOwnerCount: numericCount(rows[0]?.usable_owner_count),
  };
}

export async function assertProductionOwnerAdminReady(
  env: NodeJS.ProcessEnv = process.env,
  target?: OperationalQueryTarget,
): Promise<void> {
  if (!productionReleaseGateRequired(env)) return;
  if (String(env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY || "").trim() !== "required") {
    fail(
      "PRODUCTION_OWNER_ADMIN_POSTGRES_AUTHORITY_REQUIRED",
      "production owner administrator readiness requires PostgreSQL authority",
    );
  }

  const readiness = await getOwnerAdminReadiness(target);
  if (readiness.ownerCount === 0) {
    fail(
      "PRODUCTION_OWNER_ADMIN_REQUIRED",
      "production owner administrator has not been provisioned",
    );
  }
  if (readiness.ownerCount !== 1) {
    fail(
      "PRODUCTION_OWNER_ADMIN_SINGLETON_REQUIRED",
      "production requires exactly one owner administrator",
    );
  }
  if (readiness.usableOwnerCount !== 1) {
    fail(
      "PRODUCTION_OWNER_ADMIN_NOT_READY",
      "production owner administrator is not usable",
    );
  }
}

export async function provisionOwnerAdminPostgres(input: {
  displayName: unknown;
  phone: unknown;
  password: string;
  language?: unknown;
}): Promise<OwnerAdminProvisioningResult> {
  if (!operationalPostgresAuthorityRequired()) {
    fail(
      "OWNER_PROVISIONING_POSTGRES_AUTHORITY_REQUIRED",
      "owner administrator provisioning requires PostgreSQL authority",
    );
  }

  const displayName = String(input.displayName ?? "").trim();
  const phone = normalizePhone(input.phone);
  const language = normalizeLanguage(input.language);
  const password = String(input.password ?? "");

  if (!displayName || displayName.length > 200) {
    fail("OWNER_DISPLAY_NAME_INVALID", "owner display name is invalid");
  }
  if (!/^07\d{9}$/.test(phone)) {
    fail("INVALID_PHONE", "owner phone is invalid");
  }

  // Keep startup readiness free of password-service module side effects. The
  // password policy and hashing implementation are loaded only when an
  // operator explicitly invokes provisioning.
  const { getPasswordValidationError, hashPassword } = await import(
    "./authPasswordService"
  );
  const passwordValidation = getPasswordValidationError(password);
  if (passwordValidation) {
    fail(passwordValidation.code, passwordValidation.message);
  }

  const passwordHash = hashPassword(password);
  const adminId = `admin-${crypto.randomUUID()}`;

  try {
    await withOperationalTransaction(async (client) => {
      // Serialize the one-time control-plane bootstrap even when no owner row
      // exists yet. This prevents concurrent provisioning from creating two
      // owner administrators.
      await client.query("SELECT pg_advisory_xact_lock(740001)");

      const existingOwners = await operationalQueryRows<{ id: string; phone: string }>(
        client,
        `SELECT a.id, a.phone
           FROM admin_profiles p
           JOIN accounts a ON a.id = p.account_id
          WHERE p.role = 'owner_admin'
          ORDER BY a.created_at ASC, a.id ASC
          FOR UPDATE OF a, p`,
      );
      if (existingOwners.length > 0) {
        fail(
          "OWNER_ADMIN_ALREADY_PROVISIONED",
          "owner administrator is already provisioned",
        );
      }

      const phoneCollision = await operationalQueryRows<{ id: string }>(
        client,
        `SELECT id FROM accounts WHERE phone = $1 FOR UPDATE`,
        [phone],
      );
      if (phoneCollision.length > 0) {
        fail("PHONE_ALREADY_EXISTS", "phone is already assigned to an account");
      }

      await client.query(
        `INSERT INTO accounts (
           id, kind, phone, password_hash, state, language,
           phone_verified, phone_verified_at, created_at, updated_at
         ) VALUES (
           $1, 'admin', $2, $3, 'active', $4,
           TRUE, now(), now(), now()
         )`,
        [adminId, phone, passwordHash, language],
      );
      await client.query(
        `INSERT INTO admin_profiles (
           id, account_id, profile_kind, display_name, role,
           enabled, must_change_password, created_at, updated_at
         ) VALUES (
           $1, $1, 'admin', $2, 'owner_admin',
           TRUE, FALSE, now(), now()
         )`,
        [adminId, displayName],
      );
    });
  } catch (error) {
    if (error instanceof OwnerAdminProvisioningError) throw error;
    const databaseCode =
      error && typeof error === "object"
        ? String((error as { code?: unknown }).code || "")
        : "";
    if (databaseCode === "23505") {
      fail("PHONE_ALREADY_EXISTS", "phone is already assigned to an account");
    }
    throw error;
  }

  return { adminId, phone, displayName, language };
}
