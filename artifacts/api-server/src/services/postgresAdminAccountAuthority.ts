import crypto from "node:crypto";
import {
  authAccountRepository,
  normalizePhone,
  type AuthAccount,
} from "./authAccountRepository";
import {
  normalizeAdminPermissions,
  type AdminPermission,
} from "./authPolicy";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type AdminAccountRow = {
  id: string;
  phone: string;
  password_hash: string;
  state: "active" | "suspended" | "closed";
  language: "ar" | "ku" | "en";
  phone_verified: boolean;
  session_version: number;
  created_at: Date;
  display_name: string;
  role: "owner_admin" | "assistant_admin";
  profile_enabled: boolean;
  must_change_password: boolean;
};

async function selectAdmin(
  target: OperationalQueryTarget,
  clause: string,
  values: unknown[],
  lock = false,
): Promise<AuthAccount | null> {
  const rows = await operationalQueryRows<AdminAccountRow>(
    target,
    `SELECT a.id, a.phone, a.password_hash, a.state, a.language,
            a.phone_verified, a.session_version, a.created_at,
            p.display_name, p.role, p.enabled AS profile_enabled,
            p.must_change_password
       FROM accounts AS a
       JOIN admin_profiles AS p ON p.id = a.id AND p.account_id = a.id
      WHERE a.kind = 'admin' AND ${clause}
      LIMIT 1${lock ? " FOR UPDATE OF a, p" : ""}`,
    values,
  );
  const row = rows[0];
  if (!row) return null;
  const permissionRows = await operationalQueryRows<{ permission: AdminPermission }>(
    target,
    `SELECT permission
       FROM admin_permissions
      WHERE admin_id = $1
      ORDER BY permission`,
    [row.id],
  );
  const permissions = normalizeAdminPermissions(
    permissionRows.map((entry) => entry.permission),
  );
  return {
    account: {
      id: row.id,
      phone: normalizePhone(row.phone),
      passwordHash: row.password_hash,
      kind: "admin",
      enabled: row.state === "active" && row.profile_enabled,
      otpVerified: row.phone_verified === true,
      // PostgreSQL starts at version 1 while the compatibility API starts at 0.
      sessionVersion: Math.max(0, Number(row.session_version) - 1),
    },
    adminProfile: {
      adminId: row.id,
      role: row.role,
      permissions,
      displayName: row.display_name,
      language: row.language,
      createdAt: row.created_at.toISOString(),
      mustChangePassword: row.must_change_password,
    },
  };
}

export async function findAdminByPhoneAuthoritative(
  phoneValue: unknown,
): Promise<AuthAccount | null> {
  const phone = normalizePhone(phoneValue);
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.findByPhone(phone, "admin");
  }
  const pool = await operationalDatabasePool();
  return selectAdmin(pool, "a.phone = $1", [phone]);
}

export async function findAdminByIdAuthoritative(
  accountIdValue: unknown,
): Promise<AuthAccount | null> {
  const accountId = String(accountIdValue || "").trim();
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.findById(accountId, "admin");
  }
  const pool = await operationalDatabasePool();
  return selectAdmin(pool, "a.id = $1", [accountId]);
}

export async function listAdminsAuthoritative(): Promise<AuthAccount[]> {
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.listAdmins();
  }
  const pool = await operationalDatabasePool();
  const ids = await operationalQueryRows<{ id: string }>(
    pool,
    `SELECT a.id
       FROM accounts AS a
       JOIN admin_profiles AS p ON p.id = a.id AND p.account_id = a.id
      WHERE a.kind = 'admin'
      ORDER BY p.created_at, a.id`,
  );
  const admins = await Promise.all(ids.map((row) => selectAdmin(pool, "a.id = $1", [row.id])));
  return admins.filter((entry): entry is AuthAccount => Boolean(entry));
}

export async function createAssistantAdminAuthoritative(input: {
  ownerName: string;
  phone: string;
  passwordHash: string;
  language: "ar" | "ku" | "en";
}): Promise<AuthAccount> {
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.createAssistantAdmin(input);
  }
  const phone = normalizePhone(input.phone);
  if (!/^07\d{9}$/.test(phone)) throw new Error("INVALID_PHONE");

  return withOperationalTransaction(async (client) => {
    const collisions = await operationalQueryRows<{ id: string }>(
      client,
      "SELECT id FROM accounts WHERE phone = $1 FOR UPDATE",
      [phone],
    );
    if (collisions.length > 0) throw new Error("PHONE_ALREADY_EXISTS");

    const id = `admin-${crypto.randomUUID()}`;
    await client.query(
      `INSERT INTO accounts (
         id, kind, phone, password_hash, state, language,
         phone_verified, phone_verified_at
       ) VALUES ($1, 'admin', $2, $3, 'active', $4, true, now())`,
      [id, phone, input.passwordHash, input.language],
    );
    await client.query(
      `INSERT INTO admin_profiles (
         id, account_id, profile_kind, display_name, role, enabled,
         must_change_password
       ) VALUES ($1, $1, 'admin', $2, 'assistant_admin', true, true)`,
      [id, input.ownerName.trim()],
    );
    const created = await selectAdmin(client, "a.id = $1", [id]);
    if (!created) throw new Error("ADMIN_CREATE_FAILED");
    return created;
  });
}

export async function setAdminEnabledAuthoritative(
  accountIdValue: unknown,
  enabled: boolean,
): Promise<boolean> {
  const accountId = String(accountIdValue || "").trim();
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.setAdminEnabled(accountId, enabled);
  }
  return withOperationalTransaction(async (client) => {
    const target = await selectAdmin(client, "a.id = $1", [accountId], true);
    if (!target?.adminProfile || target.adminProfile.role !== "assistant_admin") return false;
    await client.query(
      `UPDATE admin_profiles
          SET enabled = $2, updated_at = now()
        WHERE id = $1 AND role = 'assistant_admin'`,
      [accountId, enabled],
    );
    await client.query(
      `UPDATE accounts
          SET session_version = session_version + 1,
              security_version = security_version + 1,
              updated_at = now()
        WHERE id = $1 AND kind = 'admin'`,
      [accountId],
    );
    return true;
  });
}

export async function setAssistantPermissionsAuthoritative(
  accountIdValue: unknown,
  permissionsValue: readonly AdminPermission[],
  grantedByAdminId?: string,
): Promise<boolean> {
  const accountId = String(accountIdValue || "").trim();
  const permissions = normalizeAdminPermissions(permissionsValue);
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.setAssistantPermissions(accountId, permissions);
  }
  return withOperationalTransaction(async (client) => {
    const target = await selectAdmin(client, "a.id = $1", [accountId], true);
    if (!target?.adminProfile || target.adminProfile.role !== "assistant_admin") return false;
    await client.query("DELETE FROM admin_permissions WHERE admin_id = $1", [accountId]);
    for (const permission of permissions) {
      await client.query(
        `INSERT INTO admin_permissions (admin_id, permission, granted_by_admin_id)
         VALUES ($1, $2, $3)`,
        [accountId, permission, grantedByAdminId || null],
      );
    }
    await client.query(
      `UPDATE accounts
          SET session_version = session_version + 1,
              security_version = security_version + 1,
              updated_at = now()
        WHERE id = $1 AND kind = 'admin'`,
      [accountId],
    );
    return true;
  });
}

export async function updateAdminPasswordAuthoritative(
  accountIdValue: unknown,
  passwordHash: string,
  options: { mustChangePassword?: boolean } = {},
): Promise<boolean> {
  const accountId = String(accountIdValue || "").trim();
  if (!operationalPostgresAuthorityRequired()) {
    return authAccountRepository.updatePassword(accountId, "admin", passwordHash, options);
  }
  return withOperationalTransaction(async (client) => {
    const target = await selectAdmin(client, "a.id = $1", [accountId], true);
    if (!target?.adminProfile) return false;
    await client.query(
      `UPDATE accounts
          SET password_hash = $2,
              password_version = password_version + 1,
              security_version = security_version + 1,
              session_version = session_version + 1,
              password_changed_at = now(),
              updated_at = now()
        WHERE id = $1 AND kind = 'admin'`,
      [accountId, passwordHash],
    );
    if (typeof options.mustChangePassword === "boolean") {
      await client.query(
        `UPDATE admin_profiles
            SET must_change_password = $2, updated_at = now()
          WHERE id = $1`,
        [accountId, options.mustChangePassword],
      );
    }
    return true;
  });
}
