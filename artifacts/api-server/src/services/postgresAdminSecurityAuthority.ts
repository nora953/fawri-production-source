import crypto from "node:crypto";
import { authSecurityStore } from "./authSecurityStore";
import {
  AuthSecurityStoreError,
  MAX_TRUSTED_DEVICES_PER_ACCOUNT,
  type SecurityAuditEvent,
  type TrustedDeviceRecord,
} from "./authSecurityTypes";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

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

type DeviceRow = {
  id: string;
  account_id: string;
  kind: "admin" | "merchant";
  device_fingerprint_hash: string;
  label: string;
  status: "pending" | "trusted" | "revoked";
  first_seen_at: Date;
  last_seen_at: Date;
  trusted_at: Date | null;
  trusted_by_account_id: string | null;
  revoked_at: Date | null;
};

function toDevice(row: DeviceRow): TrustedDeviceRecord {
  return {
    id: row.id,
    account_id: row.account_id,
    account_kind: row.kind,
    device_hash: row.device_fingerprint_hash,
    label: row.label,
    status: row.status,
    created_at: row.first_seen_at.toISOString(),
    last_seen_at: row.last_seen_at.toISOString(),
    ...(row.trusted_at ? { trusted_at: row.trusted_at.toISOString() } : {}),
    ...(row.trusted_by_account_id ? { trusted_by: row.trusted_by_account_id } : {}),
    ...(row.revoked_at ? { revoked_at: row.revoked_at.toISOString() } : {}),
  };
}

async function selectDevice(
  target: OperationalQueryTarget,
  clause: string,
  values: unknown[],
  lock = false,
): Promise<DeviceRow | null> {
  const rows = await operationalQueryRows<DeviceRow>(
    target,
    `SELECT id, account_id, kind, device_fingerprint_hash, label, status,
            first_seen_at, last_seen_at, trusted_at, trusted_by_account_id,
            revoked_at
       FROM trusted_devices
      WHERE ${clause}
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    values,
  );
  return rows[0] || null;
}

export async function registerAdminDeviceAuthoritative(input: {
  accountId: string;
  accountKind: "admin";
  deviceId: string;
  deviceLabel: string;
}): Promise<TrustedDeviceRecord> {
  if (!operationalPostgresAuthorityRequired()) {
    return authSecurityStore.registerDevice(input);
  }
  const deviceHash = fingerprint("device", input.deviceId);
  return withOperationalTransaction(async (client) => {
    const account = await operationalQueryRows<{ id: string }>(
      client,
      "SELECT id FROM accounts WHERE id = $1 AND kind = 'admin' AND state = 'active' FOR UPDATE",
      [input.accountId],
    );
    if (!account[0]) throw new Error("AUTH_POSTGRES_ACCOUNT_UNAVAILABLE");
    const existing = await selectDevice(
      client,
      "account_id = $1 AND device_fingerprint_hash = $2",
      [input.accountId, deviceHash],
      true,
    );
    const now = new Date();
    if (existing) {
      const rows = await operationalQueryRows<DeviceRow>(
        client,
        `UPDATE trusted_devices
            SET label = $3,
                last_seen_at = $4,
                status = CASE WHEN status = 'revoked' THEN 'pending' ELSE status END,
                trust_slot = CASE WHEN status = 'revoked' THEN NULL ELSE trust_slot END,
                trusted_at = CASE WHEN status = 'revoked' THEN NULL ELSE trusted_at END,
                trusted_by_account_id = CASE WHEN status = 'revoked' THEN NULL ELSE trusted_by_account_id END,
                revoked_at = CASE WHEN status = 'revoked' THEN NULL ELSE revoked_at END,
                revoked_by_account_id = CASE WHEN status = 'revoked' THEN NULL ELSE revoked_by_account_id END
          WHERE account_id = $1 AND device_fingerprint_hash = $2
          RETURNING id, account_id, kind, device_fingerprint_hash, label, status,
                    first_seen_at, last_seen_at, trusted_at, trusted_by_account_id,
                    revoked_at`,
        [input.accountId, deviceHash, input.deviceLabel, now],
      );
      return toDevice(rows[0]);
    }
    const id = crypto.randomUUID();
    const rows = await operationalQueryRows<DeviceRow>(
      client,
      `INSERT INTO trusted_devices
        (id, account_id, kind, device_fingerprint_hash, label, status,
         first_seen_at, last_seen_at)
       VALUES ($1, $2, 'admin', $3, $4, 'pending', $5, $5)
       RETURNING id, account_id, kind, device_fingerprint_hash, label, status,
                 first_seen_at, last_seen_at, trusted_at, trusted_by_account_id,
                 revoked_at`,
      [id, input.accountId, deviceHash, input.deviceLabel, now],
    );
    return toDevice(rows[0]);
  });
}

export async function isAdminDeviceTrustedAuthoritative(
  accountId: string,
  deviceId: string,
): Promise<boolean> {
  if (!operationalPostgresAuthorityRequired()) {
    return authSecurityStore.isDeviceTrusted(accountId, "admin", deviceId);
  }
  const pool = await operationalDatabasePool();
  const row = await selectDevice(
    pool,
    "account_id = $1 AND kind = 'admin' AND device_fingerprint_hash = $2 AND status = 'trusted'",
    [accountId, fingerprint("device", deviceId)],
  );
  return Boolean(row);
}

export async function listAdminDevicesAuthoritative(
  accountId?: string,
): Promise<TrustedDeviceRecord[]> {
  if (!operationalPostgresAuthorityRequired()) {
    return authSecurityStore.listDevices(accountId);
  }
  const pool = await operationalDatabasePool();
  const values: unknown[] = [];
  let accountClause = "";
  if (accountId) {
    values.push(accountId);
    accountClause = " AND account_id = $1";
  }
  const rows = await operationalQueryRows<DeviceRow>(
    pool,
    `SELECT id, account_id, kind, device_fingerprint_hash, label, status,
            first_seen_at, last_seen_at, trusted_at, trusted_by_account_id,
            revoked_at
       FROM trusted_devices
      WHERE kind = 'admin'${accountClause}
      ORDER BY first_seen_at DESC, id DESC`,
    values,
  );
  return rows.map(toDevice);
}

export async function setAdminDeviceTrustAuthoritative(input: {
  deviceRecordId: string;
  trusted: boolean;
  actorAccountId: string;
}): Promise<TrustedDeviceRecord | null> {
  if (!operationalPostgresAuthorityRequired()) {
    return authSecurityStore.setDeviceTrust(input);
  }
  return withOperationalTransaction(async (client) => {
    const device = await selectDevice(
      client,
      "id = $1 AND kind = 'admin'",
      [input.deviceRecordId],
      true,
    );
    if (!device) return null;
    const now = new Date();
    if (input.trusted) {
      const slots = await operationalQueryRows<{ trust_slot: number }>(
        client,
        `SELECT trust_slot
           FROM trusted_devices
          WHERE account_id = $1 AND kind = 'admin' AND status = 'trusted'
            AND trust_slot IS NOT NULL AND id <> $2
          FOR UPDATE`,
        [device.account_id, device.id],
      );
      const used = new Set(slots.map((row) => Number(row.trust_slot)));
      const slot = [1, 2].find((candidate) => !used.has(candidate));
      if (!slot) {
        throw new AuthSecurityStoreError(
          "TRUSTED_DEVICE_LIMIT_REACHED",
          `no more than ${MAX_TRUSTED_DEVICES_PER_ACCOUNT} trusted devices are allowed`,
        );
      }
      const rows = await operationalQueryRows<DeviceRow>(
        client,
        `UPDATE trusted_devices
            SET status = 'trusted', trust_slot = $2, trusted_at = $3,
                trusted_by_account_id = $4, revoked_at = NULL,
                revoked_by_account_id = NULL, last_seen_at = GREATEST(last_seen_at, $3)
          WHERE id = $1
          RETURNING id, account_id, kind, device_fingerprint_hash, label, status,
                    first_seen_at, last_seen_at, trusted_at, trusted_by_account_id,
                    revoked_at`,
        [device.id, slot, now, input.actorAccountId],
      );
      return toDevice(rows[0]);
    }
    const rows = await operationalQueryRows<DeviceRow>(
      client,
      `UPDATE trusted_devices
          SET status = 'revoked', trust_slot = NULL, trusted_at = NULL,
              trusted_by_account_id = NULL, revoked_at = $2,
              revoked_by_account_id = $3
        WHERE id = $1
        RETURNING id, account_id, kind, device_fingerprint_hash, label, status,
                  first_seen_at, last_seen_at, trusted_at, trusted_by_account_id,
                  revoked_at`,
      [device.id, now, input.actorAccountId],
    );
    return toDevice(rows[0]);
  });
}

export async function auditAdminSecurityEventAuthoritative(input: {
  event_type: string;
  actor_account_id?: string;
  actor_kind?: "admin" | "merchant";
  subject_hash?: string;
  reason_code?: string;
  decision_code?: string;
}): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) {
    authSecurityStore.audit(input);
    return;
  }
  const pool = await operationalDatabasePool();
  await pool.query(
    `INSERT INTO auth_audit_events
      (id, event_type, actor_account_id, actor_kind, subject_hash,
       reason_code, decision_code)
     VALUES ($1, $2, $3, $4::account_kind, $5, $6, $7)`,
    [
      crypto.randomUUID(),
      String(input.event_type || "auth_event").slice(0, 120),
      input.actor_account_id || null,
      input.actor_kind || null,
      input.subject_hash ? fingerprint("audit-subject", input.subject_hash) : null,
      input.reason_code || null,
      input.decision_code || null,
    ],
  );
}

export async function listAdminAuditEventsAuthoritative(
  accountId: string,
  limit = 20,
): Promise<SecurityAuditEvent[]> {
  if (!operationalPostgresAuthorityRequired()) {
    return authSecurityStore
      .readAuditEvents()
      .filter(
        (event) =>
          event.actor_account_id === accountId || event.subject_hash === accountId,
      )
      .slice(-limit)
      .reverse();
  }
  const pool = await operationalDatabasePool();
  const rows = await operationalQueryRows<{
    id: string;
    event_type: string;
    actor_account_id: string | null;
    actor_kind: "admin" | "merchant" | null;
    subject_hash: string | null;
    created_at: Date;
  }>(
    pool,
    `SELECT id, event_type, actor_account_id, actor_kind, subject_hash, created_at
       FROM auth_audit_events
      WHERE actor_account_id = $1 OR subject_hash = $2
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [accountId, fingerprint("audit-subject", accountId), Math.max(1, Math.min(100, limit))],
  );
  return rows.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    ...(row.actor_account_id ? { actor_account_id: row.actor_account_id } : {}),
    ...(row.actor_kind ? { actor_kind: row.actor_kind } : {}),
    ...(row.subject_hash ? { subject_hash: row.subject_hash } : {}),
    created_at: row.created_at.toISOString(),
  }));
}
