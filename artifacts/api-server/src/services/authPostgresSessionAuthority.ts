import crypto from "node:crypto";
import type { AccountKind, AdminPermission, AdminRole } from "./authPolicy";
import { authSecurityStore } from "./authSecurityStore";
import type {
  AuthSessionRecord,
  IssuedSession,
  PublicAuthSessionRecord,
  SessionRevocationReason,
  ValidatedSession,
} from "./authSecurityTypes";
import { parseSessionToken } from "./authSecurityDataStore";

const POSTGRES_AUTHORITY_ENV = "FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY";

type IssueInput = {
  accountId: string;
  accountKind: AccountKind;
  tenantId: string;
  accountVersion?: number;
  adminRole?: AdminRole;
  permissions?: readonly AdminPermission[];
  deviceId?: string;
  deviceLabel?: string;
  absoluteExpiresAt?: string;
};

type ValidateInput = {
  token: string;
  expectedKind: AccountKind;
  deviceId?: string;
};

type SessionRow = {
  id: string;
  account_id: string;
  kind: AccountKind;
  status: "active" | "revoked" | "expired";
  token_hash: string;
  tenant_id: string;
  device_fingerprint_hash: string | null;
  device_label: string;
  session_version: number;
  security_version: number;
  role_snapshot: AdminRole | null;
  permission_snapshot: AdminPermission[] | null;
  created_at: Date;
  last_seen_at: Date;
  last_activity_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  rotate_after: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
  replaced_by_session_id: string | null;
  current_session_version?: number;
  current_security_version?: number;
  account_state?: "active" | "suspended" | "closed";
};

type AccountVersionRow = {
  session_version: number;
  security_version: number;
  state: "active" | "suspended" | "closed";
};

function postgresRequired(kind: AccountKind): boolean {
  return kind === "merchant" && process.env[POSTGRES_AUTHORITY_ENV] === "required";
}

function requireDatabaseUrl(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      `${POSTGRES_AUTHORITY_ENV}=required requires DATABASE_URL`,
    );
  }
}

function envPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function sessionIdleTtlMs(): number {
  return envPositiveInt("FAWRI_SESSION_IDLE_TTL_MS", 8 * 60 * 60 * 1000);
}

function sessionAbsoluteTtlMs(): number {
  return envPositiveInt(
    "FAWRI_SESSION_ABSOLUTE_TTL_MS",
    7 * 24 * 60 * 60 * 1000,
  );
}

function sessionRotationMs(): number {
  return envPositiveInt("FAWRI_SESSION_ROTATION_MS", 30 * 60 * 1000);
}

function authSecret(): string {
  const configured = String(process.env.FAWRI_AUTH_SECURITY_SECRET || "");
  if (process.env.NODE_ENV === "production" && configured.length < 32) {
    throw new Error("FAWRI_AUTH_SECURITY_SECRET must contain at least 32 characters");
  }
  return configured || "fawri-local-auth-security-secret-not-for-production";
}

function fingerprint(domain: string, value: string): string {
  return crypto
    .createHmac("sha256", authSecret())
    .update(`${domain}:${value}`)
    .digest("base64url");
}

function createTokenMaterial(): { id: string; secret: string; token: string } {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  return { id, secret, token: `fs1.${id}.${secret}` };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizePermissions(
  permissions: readonly AdminPermission[] | null | undefined,
): AdminPermission[] {
  return Array.isArray(permissions) ? [...permissions] : [];
}

function toRecord(row: SessionRow): AuthSessionRecord {
  const dbVersion = Number(row.session_version);
  return {
    id: row.id,
    token_hash: row.token_hash,
    account_id: row.account_id,
    account_kind: row.kind,
    tenant_id: row.tenant_id,
    // Transitional JSON Auth v2 starts at zero while the PostgreSQL schema is
    // constrained to positive versions. The HTTP guard compares this projected
    // value with the current JSON projection until account authority cutover.
    account_version: Math.max(0, dbVersion - 1),
    ...(row.role_snapshot ? { admin_role: row.role_snapshot } : {}),
    permissions: normalizePermissions(row.permission_snapshot),
    ...(row.device_fingerprint_hash
      ? { device_hash: row.device_fingerprint_hash }
      : {}),
    device_label: row.device_label,
    created_at: row.created_at.toISOString(),
    last_seen_at: row.last_seen_at.toISOString(),
    idle_expires_at: row.idle_expires_at.toISOString(),
    absolute_expires_at: row.absolute_expires_at.toISOString(),
    rotate_after: row.rotate_after.toISOString(),
    ...(row.revoked_at ? { revoked_at: row.revoked_at.toISOString() } : {}),
    ...(row.revoke_reason
      ? { revoked_reason: row.revoke_reason as SessionRevocationReason }
      : {}),
    ...(row.replaced_by_session_id
      ? { replaced_by_session_id: row.replaced_by_session_id }
      : {}),
  };
}

async function pool() {
  requireDatabaseUrl();
  const module = await import("@workspace/db");
  return module.pool;
}

async function withTransaction<T>(
  work: (client: Awaited<ReturnType<typeof pool>> extends infer P
    ? P extends { connect(): Promise<infer C> }
      ? C
      : never
    : never) => Promise<T>,
): Promise<T> {
  const databasePool = await pool();
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client as never);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function lockAccount(
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: AccountVersionRow[] }> },
  accountId: string,
  kind: AccountKind,
): Promise<AccountVersionRow | null> {
  const result = await client.query(
    `SELECT session_version, security_version, state
       FROM accounts
      WHERE id = $1 AND kind = $2
      FOR UPDATE`,
    [accountId, kind],
  );
  return result.rows[0] || null;
}

async function issuePostgres(input: IssueInput): Promise<IssuedSession> {
  return withTransaction(async (client) => {
    const account = await lockAccount(client, input.accountId, input.accountKind);
    if (!account || account.state !== "active") {
      throw new Error("AUTH_POSTGRES_ACCOUNT_UNAVAILABLE");
    }

    const now = new Date();
    await client.query(
      `UPDATE account_sessions
          SET status = 'expired'
        WHERE account_id = $1
          AND kind = $2
          AND status = 'active'
          AND (idle_expires_at <= $3 OR absolute_expires_at <= $3)`,
      [input.accountId, input.accountKind, now],
    );

    const active = await client.query<{ id: string }>(
      `SELECT id
         FROM account_sessions
        WHERE account_id = $1 AND kind = $2 AND status = 'active'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE`,
      [input.accountId, input.accountKind],
    );
    const cap = input.accountKind === "admin" ? 2 : 5;
    const revokeCount = Math.max(0, active.rows.length - cap + 1);
    if (revokeCount > 0) {
      const revokeIds = active.rows.slice(0, revokeCount).map((row) => row.id);
      await client.query(
        `UPDATE account_sessions
            SET status = 'revoked', revoked_at = $2, revoke_reason = 'manual_revocation'
          WHERE id = ANY($1::text[]) AND status = 'active'`,
        [revokeIds, now],
      );
    }

    const material = createTokenMaterial();
    const absoluteRequested = input.absoluteExpiresAt
      ? new Date(input.absoluteExpiresAt)
      : null;
    const absoluteExpiresAt =
      absoluteRequested && absoluteRequested.getTime() > now.getTime()
        ? absoluteRequested
        : new Date(now.getTime() + sessionAbsoluteTtlMs());
    const idleExpiresAt = new Date(
      Math.min(now.getTime() + sessionIdleTtlMs(), absoluteExpiresAt.getTime()),
    );
    const rotateAfter = new Date(
      Math.min(now.getTime() + sessionRotationMs(), absoluteExpiresAt.getTime()),
    );
    if (rotateAfter.getTime() <= now.getTime()) {
      throw new Error("AUTH_POSTGRES_SESSION_ABSOLUTE_EXPIRY_TOO_CLOSE");
    }

    const tokenHash = fingerprint("session", material.secret);
    const deviceHash = input.deviceId
      ? fingerprint("device", input.deviceId)
      : null;
    const deviceLabel = String(input.deviceLabel || "Unknown device")
      .replace(/\s+/g, " ")
      .slice(0, 120);
    const permissionSnapshot = normalizePermissions(input.permissions);

    const inserted = await client.query<SessionRow>(
      `INSERT INTO account_sessions (
         id, account_id, kind, status, token_hash, tenant_id,
         device_fingerprint_hash, device_label, session_version, security_version,
         role_snapshot, permission_snapshot, created_at, last_seen_at,
         last_activity_at, idle_expires_at, absolute_expires_at, rotate_after
       ) VALUES (
         $1, $2, $3, 'active', $4, $5,
         $6, $7, $8, $9,
         $10, $11::jsonb, $12, $12,
         $12, $13, $14, $15
       )
       RETURNING *`,
      [
        material.id,
        input.accountId,
        input.accountKind,
        tokenHash,
        input.tenantId,
        deviceHash,
        deviceLabel,
        account.session_version,
        account.security_version,
        input.adminRole || null,
        JSON.stringify(permissionSnapshot),
        now,
        idleExpiresAt,
        absoluteExpiresAt,
        rotateAfter,
      ],
    );

    return { token: material.token, session: toRecord(inserted.rows[0]) };
  });
}

async function validatePostgres(input: ValidateInput): Promise<ValidatedSession | null> {
  const parsed = parseSessionToken(input.token);
  if (!parsed) return null;

  return withTransaction(async (client) => {
    const result = await client.query<SessionRow>(
      `SELECT s.*,
              a.session_version AS current_session_version,
              a.security_version AS current_security_version,
              a.state AS account_state
         FROM account_sessions AS s
         JOIN accounts AS a ON a.id = s.account_id AND a.kind = s.kind
        WHERE s.id = $1
        FOR UPDATE OF s`,
      [parsed.id],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.kind !== input.expectedKind ||
      row.status !== "active" ||
      !safeEqual(row.token_hash, fingerprint("session", parsed.secret))
    ) {
      return null;
    }

    const now = new Date();
    if (
      row.account_state !== "active" ||
      row.current_session_version !== row.session_version ||
      row.current_security_version !== row.security_version
    ) {
      await client.query(
        `UPDATE account_sessions
            SET status = 'revoked', revoked_at = $2,
                revoke_reason = $3
          WHERE id = $1 AND status = 'active'`,
        [
          row.id,
          now,
          row.account_state === "active" ? "role_changed" : "account_disabled",
        ],
      );
      return null;
    }

    if (
      row.idle_expires_at.getTime() <= now.getTime() ||
      row.absolute_expires_at.getTime() <= now.getTime()
    ) {
      await client.query(
        `UPDATE account_sessions
            SET status = 'expired'
          WHERE id = $1 AND status = 'active'`,
        [row.id],
      );
      return null;
    }

    if (row.device_fingerprint_hash) {
      if (
        !input.deviceId ||
        !safeEqual(
          row.device_fingerprint_hash,
          fingerprint("device", input.deviceId),
        )
      ) {
        return null;
      }
      if (
        row.kind === "admin" &&
        !authSecurityStore.isDeviceTrusted(row.account_id, "admin", input.deviceId)
      ) {
        return null;
      }
    }

    const nextIdle = new Date(
      Math.min(
        now.getTime() + sessionIdleTtlMs(),
        row.absolute_expires_at.getTime(),
      ),
    );
    const touched = await client.query<SessionRow>(
      `UPDATE account_sessions
          SET last_seen_at = $2, last_activity_at = $2, idle_expires_at = $3
        WHERE id = $1 AND status = 'active'
        RETURNING *`,
      [row.id, now, nextIdle],
    );
    const session = touched.rows[0];
    if (!session) return null;
    return {
      session: toRecord(session),
      needsRotation: session.rotate_after.getTime() <= now.getTime(),
    };
  });
}

async function rotatePostgres(input: ValidateInput): Promise<IssuedSession | null> {
  const parsed = parseSessionToken(input.token);
  if (!parsed) return null;

  return withTransaction(async (client) => {
    const selected = await client.query<SessionRow>(
      `SELECT s.*,
              a.session_version AS current_session_version,
              a.security_version AS current_security_version,
              a.state AS account_state
         FROM account_sessions AS s
         JOIN accounts AS a ON a.id = s.account_id AND a.kind = s.kind
        WHERE s.id = $1
        FOR UPDATE OF s`,
      [parsed.id],
    );
    const old = selected.rows[0];
    if (
      !old ||
      old.kind !== input.expectedKind ||
      old.status !== "active" ||
      !safeEqual(old.token_hash, fingerprint("session", parsed.secret)) ||
      old.account_state !== "active" ||
      old.current_session_version !== old.session_version ||
      old.current_security_version !== old.security_version
    ) {
      return null;
    }

    const now = new Date();
    if (
      old.idle_expires_at.getTime() <= now.getTime() ||
      old.absolute_expires_at.getTime() <= now.getTime()
    ) {
      await client.query(
        `UPDATE account_sessions SET status = 'expired'
          WHERE id = $1 AND status = 'active'`,
        [old.id],
      );
      return null;
    }

    if (old.device_fingerprint_hash) {
      if (
        !input.deviceId ||
        !safeEqual(
          old.device_fingerprint_hash,
          fingerprint("device", input.deviceId),
        )
      ) {
        return null;
      }
    }

    const material = createTokenMaterial();
    const idleExpiresAt = new Date(
      Math.min(
        now.getTime() + sessionIdleTtlMs(),
        old.absolute_expires_at.getTime(),
      ),
    );
    const rotateAfter = new Date(
      Math.min(
        now.getTime() + sessionRotationMs(),
        old.absolute_expires_at.getTime(),
      ),
    );
    if (rotateAfter.getTime() <= now.getTime()) return null;

    const inserted = await client.query<SessionRow>(
      `INSERT INTO account_sessions (
         id, account_id, kind, status, token_hash, tenant_id,
         device_fingerprint_hash, device_label, session_version, security_version,
         role_snapshot, permission_snapshot, created_at, last_seen_at,
         last_activity_at, idle_expires_at, absolute_expires_at, rotate_after
       ) VALUES (
         $1, $2, $3, 'active', $4, $5,
         $6, $7, $8, $9,
         $10, $11::jsonb, $12, $12,
         $12, $13, $14, $15
       ) RETURNING *`,
      [
        material.id,
        old.account_id,
        old.kind,
        fingerprint("session", material.secret),
        old.tenant_id,
        old.device_fingerprint_hash,
        old.device_label,
        old.session_version,
        old.security_version,
        old.role_snapshot,
        JSON.stringify(normalizePermissions(old.permission_snapshot)),
        now,
        idleExpiresAt,
        old.absolute_expires_at,
        rotateAfter,
      ],
    );

    const revoked = await client.query(
      `UPDATE account_sessions
          SET status = 'revoked', revoked_at = $2,
              revoke_reason = 'rotated', replaced_by_session_id = $3
        WHERE id = $1 AND status = 'active'`,
      [old.id, now, material.id],
    );
    if (revoked.rowCount !== 1) {
      throw new Error("AUTH_POSTGRES_ROTATION_LOST_LOCK");
    }

    return { token: material.token, session: toRecord(inserted.rows[0]) };
  });
}

async function revokePostgres(
  token: string,
  expectedKind: AccountKind,
  reason: SessionRevocationReason,
): Promise<boolean> {
  const parsed = parseSessionToken(token);
  if (!parsed) return false;
  return withTransaction(async (client) => {
    const selected = await client.query<SessionRow>(
      `SELECT * FROM account_sessions WHERE id = $1 FOR UPDATE`,
      [parsed.id],
    );
    const row = selected.rows[0];
    if (
      !row ||
      row.kind !== expectedKind ||
      row.status !== "active" ||
      !safeEqual(row.token_hash, fingerprint("session", parsed.secret))
    ) {
      return false;
    }
    const now = new Date();
    if (reason === "expired") {
      const result = await client.query(
        `UPDATE account_sessions SET status = 'expired'
          WHERE id = $1 AND status = 'active'`,
        [row.id],
      );
      return result.rowCount === 1;
    }
    const result = await client.query(
      `UPDATE account_sessions
          SET status = 'revoked', revoked_at = $2, revoke_reason = $3
        WHERE id = $1 AND status = 'active'`,
      [row.id, now, reason],
    );
    return result.rowCount === 1;
  });
}

async function revokeForAccountPostgres(input: {
  actorAccountId?: string;
  accountId: string;
  accountKind: AccountKind;
  sessionId: string;
  reason: SessionRevocationReason;
}): Promise<boolean> {
  if (input.actorAccountId && input.actorAccountId !== input.accountId) {
    return false;
  }
  return withTransaction(async (client) => {
    const selected = await client.query<SessionRow>(
      `SELECT * FROM account_sessions
        WHERE id = $1 AND account_id = $2 AND kind = $3
        FOR UPDATE`,
      [input.sessionId, input.accountId, input.accountKind],
    );
    const row = selected.rows[0];
    if (!row || row.status !== "active") return false;
    const result = await client.query(
      `UPDATE account_sessions
          SET status = 'revoked', revoked_at = $2, revoke_reason = $3
        WHERE id = $1 AND status = 'active'`,
      [row.id, new Date(), input.reason],
    );
    return result.rowCount === 1;
  });
}

async function revokeAllPostgres(input: {
  accountId: string;
  accountKind: AccountKind;
  reason: SessionRevocationReason;
  deviceHash?: string;
}): Promise<number> {
  return withTransaction(async (client) => {
    const account = await lockAccount(client, input.accountId, input.accountKind);
    if (!account) return 0;
    const values: unknown[] = [
      input.accountId,
      input.accountKind,
      new Date(),
      input.reason,
    ];
    let deviceClause = "";
    if (input.deviceHash) {
      values.push(input.deviceHash);
      deviceClause = " AND device_fingerprint_hash = $5";
    }
    const result = await client.query(
      `UPDATE account_sessions
          SET status = 'revoked', revoked_at = $3, revoke_reason = $4
        WHERE account_id = $1 AND kind = $2 AND status = 'active'${deviceClause}`,
      values,
    );
    return result.rowCount || 0;
  });
}

async function listPostgres(
  accountId: string,
  kind: AccountKind,
): Promise<PublicAuthSessionRecord[]> {
  const databasePool = await pool();
  const result = await databasePool.query<SessionRow>(
    `SELECT s.*
       FROM account_sessions AS s
       JOIN accounts AS a ON a.id = s.account_id AND a.kind = s.kind
      WHERE s.account_id = $1
        AND s.kind = $2
        AND s.status = 'active'
        AND s.idle_expires_at > now()
        AND s.absolute_expires_at > now()
        AND s.session_version = a.session_version
        AND s.security_version = a.security_version
        AND a.state = 'active'
      ORDER BY s.created_at DESC, s.id DESC`,
    [accountId, kind],
  );
  return result.rows.map((row) => {
    const { token_hash: _tokenHash, ...safe } = toRecord(row);
    return safe;
  });
}

async function commitPasswordChangePostgres(input: {
  accountId: string;
  accountKind: AccountKind;
  passwordHash: string;
  reason: "password_changed" | "password_reset";
}): Promise<number> {
  return withTransaction(async (client) => {
    const account = await lockAccount(client, input.accountId, input.accountKind);
    if (!account) throw new Error("AUTH_POSTGRES_ACCOUNT_UNAVAILABLE");
    const now = new Date();
    await client.query(
      `UPDATE accounts
          SET password_hash = $3,
              password_version = password_version + 1,
              session_version = session_version + 1,
              security_version = security_version + 1,
              password_changed_at = $4,
              updated_at = $4
        WHERE id = $1 AND kind = $2`,
      [input.accountId, input.accountKind, input.passwordHash, now],
    );
    const revoked = await client.query(
      `UPDATE account_sessions
          SET status = 'revoked', revoked_at = $3, revoke_reason = $4
        WHERE account_id = $1 AND kind = $2 AND status = 'active'`,
      [input.accountId, input.accountKind, now, input.reason],
    );
    return revoked.rowCount || 0;
  });
}

export const authPostgresSessionAuthority = {
  enabled(kind: AccountKind): boolean {
    return postgresRequired(kind);
  },

  async issueSession(input: IssueInput): Promise<IssuedSession> {
    return postgresRequired(input.accountKind)
      ? issuePostgres(input)
      : authSecurityStore.issueSession(input);
  },

  async validateSession(input: ValidateInput): Promise<ValidatedSession | null> {
    return postgresRequired(input.expectedKind)
      ? validatePostgres(input)
      : authSecurityStore.validateSession(input);
  },

  async rotateSession(input: ValidateInput): Promise<IssuedSession | null> {
    return postgresRequired(input.expectedKind)
      ? rotatePostgres(input)
      : authSecurityStore.rotateSession(input);
  },

  async revokeSession(
    token: string,
    kind: AccountKind,
    reason: SessionRevocationReason,
  ): Promise<boolean> {
    return postgresRequired(kind)
      ? revokePostgres(token, kind, reason)
      : authSecurityStore.revokeSession(token, reason);
  },

  async revokeSessionById(input: {
    actorAccountId: string;
    accountId: string;
    accountKind: AccountKind;
    sessionId: string;
  }): Promise<boolean> {
    return postgresRequired(input.accountKind)
      ? revokeForAccountPostgres({ ...input, reason: "manual_revocation" })
      : authSecurityStore.revokeSessionById(input);
  },

  async revokeSessionForAccount(input: {
    accountId: string;
    accountKind: AccountKind;
    sessionId: string;
    reason: SessionRevocationReason;
  }): Promise<boolean> {
    return postgresRequired(input.accountKind)
      ? revokeForAccountPostgres(input)
      : authSecurityStore.revokeSessionForAccount(input);
  },

  async revokeAllSessions(input: {
    accountId: string;
    accountKind: AccountKind;
    reason: SessionRevocationReason;
    deviceHash?: string;
  }): Promise<number> {
    return postgresRequired(input.accountKind)
      ? revokeAllPostgres(input)
      : authSecurityStore.revokeAllSessions(input);
  },

  async listActiveSessions(
    accountId: string,
    kind: AccountKind,
  ): Promise<PublicAuthSessionRecord[]> {
    return postgresRequired(kind)
      ? listPostgres(accountId, kind)
      : authSecurityStore.listActiveSessions(accountId, kind);
  },

  async commitPasswordChange(input: {
    accountId: string;
    accountKind: AccountKind;
    passwordHash: string;
    reason: "password_changed" | "password_reset";
  }): Promise<number | null> {
    if (!postgresRequired(input.accountKind)) return null;
    return commitPasswordChangePostgres(input);
  },
};
