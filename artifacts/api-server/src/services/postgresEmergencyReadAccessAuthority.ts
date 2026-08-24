import crypto from "node:crypto";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  type OperationalQueryTarget,
  withOperationalTransaction,
} from "./operationalPostgresAuthority";
import { buildEmergencyReadOnlySnapshotPostgres } from "./postgresEmergencySnapshot";

export type EmergencySeverity = "high" | "critical";
export type EmergencyStatus = "pending" | "active" | "rejected" | "expired" | "ended";
export type EmergencyActivationMode =
  | "owner_approval"
  | "critical_self_activation"
  | "owner_direct_activation";

const REQUEST_WINDOW_MINUTES = 10;
const AUDIT_ENTITY_TYPE = "emergency_read_access";
const AUDIT_LOCK_KEY = "fawri-emergency-audit-chain-v1";

export class EmergencyPostgresError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly extra?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 400,
    extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EmergencyPostgresError";
    this.code = code;
    this.statusCode = statusCode;
    this.extra = extra;
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}

function parseJsonRecord(value: unknown): Record<string, string | number | boolean> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([, item]) =>
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean",
      ),
    ) as Record<string, string | number | boolean>;
  } catch {
    return {};
  }
}

function assertRequired(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw new EmergencyPostgresError(
      "EMERGENCY_POSTGRES_AUTHORITY_REQUIRED",
      "PostgreSQL emergency authority is not required",
      503,
    );
  }
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

type RequestRow = {
  id: string;
  merchant_id: string;
  merchant_name: string;
  requested_by_admin_account_id: string;
  requested_by_admin_name: string;
  incident_reference: string;
  severity: EmergencySeverity;
  reason: string;
  duration_minutes: number;
  read_only: boolean;
  status: EmergencyStatus;
  activation_mode: EmergencyActivationMode;
  reviewed_by_owner_account_id: string | null;
  reviewed_by_owner_name: string | null;
  admin_session_id: string | null;
  request_expires_at: Date | string | null;
  reviewed_at: Date | string | null;
  started_at: Date | string | null;
  expires_at: Date | string | null;
  ended_at: Date | string | null;
  end_reason: string | null;
  first_viewed_at: Date | string | null;
  viewed_sections: unknown;
  created_at: Date | string;
};

type AuthorizationRow = {
  admin_account_id: string;
  admin_name: string;
  can_request: boolean;
  can_critical_self_activate: boolean;
  granted_by_owner_account_id: string;
  granted_by_owner_name: string;
  granted_at: Date | string;
  updated_at: Date | string;
  revoked_at: Date | string | null;
};

function mapAuthorization(row: AuthorizationRow) {
  return {
    admin_id: row.admin_account_id,
    admin_name: row.admin_name,
    can_request: Boolean(row.can_request),
    can_critical_self_activate: Boolean(row.can_critical_self_activate),
    granted_by_owner_id: row.granted_by_owner_account_id,
    granted_by_owner_name: row.granted_by_owner_name,
    granted_at: iso(row.granted_at),
    updated_at: iso(row.updated_at),
    ...(iso(row.revoked_at) ? { revoked_at: iso(row.revoked_at) } : {}),
  };
}

function mapRequest(row: RequestRow) {
  const reviewedAt = iso(row.reviewed_at);
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    merchant_name: row.merchant_name,
    requested_by_admin_id: row.requested_by_admin_account_id,
    requested_by_admin_name: row.requested_by_admin_name,
    incident_reference: row.incident_reference,
    severity: row.severity,
    reason: row.reason,
    duration_minutes: Number(row.duration_minutes) as 15 | 30,
    read_only: true as const,
    status: row.status,
    activation_mode: row.activation_mode,
    requested_at: iso(row.created_at),
    ...(iso(row.request_expires_at)
      ? { request_expires_at: iso(row.request_expires_at) }
      : {}),
    ...(row.reviewed_by_owner_account_id
      ? { reviewed_by_owner_id: row.reviewed_by_owner_account_id }
      : {}),
    ...(row.reviewed_by_owner_name
      ? { reviewed_by_owner_name: row.reviewed_by_owner_name }
      : {}),
    ...(reviewedAt ? { reviewed_at: reviewedAt } : {}),
    ...(row.status === "rejected" && reviewedAt ? { rejected_at: reviewedAt } : {}),
    ...(iso(row.started_at) ? { started_at: iso(row.started_at) } : {}),
    ...(iso(row.expires_at) ? { expires_at: iso(row.expires_at) } : {}),
    ...(iso(row.ended_at) ? { ended_at: iso(row.ended_at) } : {}),
    ...(row.end_reason ? { end_reason: row.end_reason } : {}),
    ...(row.admin_session_id ? { admin_session_id: row.admin_session_id } : {}),
    ...(iso(row.first_viewed_at) ? { first_viewed_at: iso(row.first_viewed_at) } : {}),
    viewed_sections: stringArray(row.viewed_sections),
  };
}

async function requestRows(
  target: OperationalQueryTarget,
  whereSql = "",
  values: unknown[] = [],
): Promise<RequestRow[]> {
  const result = await target.query<RequestRow>(
    `SELECT r.id, r.merchant_id, m.store_name AS merchant_name,
            r.requested_by_admin_account_id,
            requester.display_name AS requested_by_admin_name,
            r.incident_reference, r.severity, r.reason, r.duration_minutes,
            r.read_only, r.status, r.activation_mode,
            r.reviewed_by_owner_account_id,
            reviewer.display_name AS reviewed_by_owner_name,
            r.admin_session_id, r.request_expires_at, r.reviewed_at,
            r.started_at, r.expires_at, r.ended_at, r.end_reason,
            r.first_viewed_at, r.viewed_sections, r.created_at
       FROM emergency_access_requests r
       JOIN merchants m ON m.id = r.merchant_id
       JOIN admin_profiles requester ON requester.id = r.requested_by_admin_account_id
       LEFT JOIN admin_profiles reviewer ON reviewer.id = r.reviewed_by_owner_account_id
       ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC`,
    values,
  );
  return result.rows;
}

async function requestForUpdate(
  target: OperationalQueryTarget,
  requestId: string,
): Promise<RequestRow | null> {
  const result = await target.query<RequestRow>(
    `SELECT r.id, r.merchant_id, m.store_name AS merchant_name,
            r.requested_by_admin_account_id,
            requester.display_name AS requested_by_admin_name,
            r.incident_reference, r.severity, r.reason, r.duration_minutes,
            r.read_only, r.status, r.activation_mode,
            r.reviewed_by_owner_account_id,
            reviewer.display_name AS reviewed_by_owner_name,
            r.admin_session_id, r.request_expires_at, r.reviewed_at,
            r.started_at, r.expires_at, r.ended_at, r.end_reason,
            r.first_viewed_at, r.viewed_sections, r.created_at
       FROM emergency_access_requests r
       JOIN merchants m ON m.id = r.merchant_id
       JOIN admin_profiles requester ON requester.id = r.requested_by_admin_account_id
       LEFT JOIN admin_profiles reviewer ON reviewer.id = r.reviewed_by_owner_account_id
      WHERE r.id = $1
      FOR UPDATE OF r`,
    [requestId],
  );
  return result.rows[0] || null;
}

async function authorizationRows(
  target: OperationalQueryTarget,
  adminId?: string,
): Promise<AuthorizationRow[]> {
  const values: unknown[] = [];
  const where = adminId ? "WHERE e.admin_account_id = $1" : "";
  if (adminId) values.push(adminId);
  const result = await target.query<AuthorizationRow>(
    `SELECT e.admin_account_id, a.display_name AS admin_name,
            e.can_request, e.can_critical_self_activate,
            e.granted_by_owner_account_id,
            owner.display_name AS granted_by_owner_name,
            e.granted_at, e.updated_at, e.revoked_at
       FROM emergency_authorizations e
       JOIN admin_profiles a ON a.id = e.admin_account_id
       JOIN admin_profiles owner ON owner.id = e.granted_by_owner_account_id
       ${where}
      ORDER BY a.display_name, e.admin_account_id`,
    values,
  );
  return result.rows;
}

async function activeAuthorization(
  target: OperationalQueryTarget,
  adminId: string,
): Promise<AuthorizationRow | null> {
  const rows = await authorizationRows(target, adminId);
  const row = rows[0];
  return row && row.can_request && !row.revoked_at ? row : null;
}

async function appendAuditEvent(
  target: OperationalQueryTarget,
  input: {
    eventType: string;
    requestId?: string;
    actorAdminId?: string;
    actorAdminName?: string;
    merchantId?: string;
    incidentReference?: string;
    metadata?: Record<string, string | number | boolean>;
  },
) {
  await target.query("SELECT pg_advisory_xact_lock(hashtext($1))", [AUDIT_LOCK_KEY]);
  const previous = await target.query<{ event_hash: string | null; metadata: unknown }>(
    `SELECT event_hash, metadata
       FROM audit_events
      WHERE entity_type = $1 AND event_hash IS NOT NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [AUDIT_ENTITY_TYPE],
  );
  const previousRow = previous.rows[0];
  const previousHash = previousRow?.event_hash || "GENESIS";
  const previousSequence = Number(record(previousRow?.metadata).sequence || 0);
  const sequence = previousSequence + 1;
  const eventId = id("emergency-audit");
  const createdAt = new Date().toISOString();
  const eventMetadata = input.metadata || {};
  const chainPayload = JSON.stringify({
    id: eventId,
    sequence,
    event_type: input.eventType,
    request_id: input.requestId || null,
    actor_admin_id: input.actorAdminId || null,
    actor_admin_name: input.actorAdminName || null,
    merchant_id: input.merchantId || null,
    incident_reference: input.incidentReference || null,
    metadata: eventMetadata,
    created_at: createdAt,
  });
  const eventHash = crypto
    .createHash("sha256")
    .update(`${previousHash}:${chainPayload}`)
    .digest("hex");

  await target.query(
    `INSERT INTO audit_events
       (id, actor_kind, actor_account_id, merchant_id, action_type,
        entity_type, entity_id, reason_code, metadata,
        previous_hash, event_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::timestamptz)`,
    [
      eventId,
      input.actorAdminId ? "account" : "system",
      input.actorAdminId || null,
      input.merchantId || null,
      input.eventType,
      AUDIT_ENTITY_TYPE,
      input.requestId || null,
      input.incidentReference || null,
      JSON.stringify({
        sequence,
        chain_payload: chainPayload,
        actor_admin_name: input.actorAdminName || "",
        incident_reference: input.incidentReference || "",
        event_metadata: JSON.stringify(eventMetadata),
      }),
      previousHash,
      eventHash,
      createdAt,
    ],
  );
}

async function createOwnerAlert(
  target: OperationalQueryTarget,
  request: RequestRow,
  type: "approval_required" | "critical_self_activation",
) {
  const summary = `${request.requested_by_admin_name} — ${request.merchant_name} — ${request.incident_reference}`;
  await target.query(
    `INSERT INTO emergency_owner_alerts
       (id, request_id, type, title_key, details, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, now())
     ON CONFLICT (request_id, type) DO NOTHING`,
    [
      id("emergency-owner-alert"),
      request.id,
      type,
      type === "approval_required"
        ? "Emergency read access approval required"
        : "Critical emergency read access activated",
      JSON.stringify({ summary }),
    ],
  );
}

async function createMerchantNotice(
  target: OperationalQueryTarget,
  request: RequestRow,
) {
  if (!request.started_at || !request.ended_at) return;
  await target.query(
    `INSERT INTO emergency_merchant_notices
       (id, request_id, merchant_id, accessed_by_admin_account_id,
        incident_reference, activation_mode, started_at, ended_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, now())
     ON CONFLICT (request_id) DO NOTHING`,
    [
      id("emergency-merchant-notice"),
      request.id,
      request.merchant_id,
      request.requested_by_admin_account_id,
      request.incident_reference,
      request.activation_mode,
      iso(request.started_at),
      iso(request.ended_at),
    ],
  );
}

export async function refreshEmergencyAccessPostgres(now = new Date()) {
  assertRequired();
  return withOperationalTransaction(async (client) => {
    const pending = await client.query<RequestRow>(
      `UPDATE emergency_access_requests
          SET status = 'expired', ended_at = $1::timestamptz,
              end_reason = 'duration_expired', updated_at = $1::timestamptz
        WHERE status = 'pending'
          AND request_expires_at IS NOT NULL
          AND request_expires_at <= $1::timestamptz
      RETURNING id, merchant_id, ''::text AS merchant_name,
                requested_by_admin_account_id, ''::text AS requested_by_admin_name,
                incident_reference, severity, reason, duration_minutes, read_only,
                status, activation_mode, reviewed_by_owner_account_id,
                NULL::text AS reviewed_by_owner_name, admin_session_id,
                request_expires_at, reviewed_at, started_at, expires_at,
                ended_at, end_reason, first_viewed_at, viewed_sections, created_at`,
      [now.toISOString()],
    );
    for (const row of pending.rows) {
      await appendAuditEvent(client, {
        eventType: "emergency_request_expired",
        requestId: row.id,
        merchantId: row.merchant_id,
        incidentReference: row.incident_reference,
      });
    }

    const active = await client.query<{ id: string }>(
      `SELECT id FROM emergency_access_requests
        WHERE status = 'active' AND expires_at IS NOT NULL
          AND expires_at <= $1::timestamptz
        FOR UPDATE`,
      [now.toISOString()],
    );
    for (const item of active.rows) {
      await client.query(
        `UPDATE emergency_access_requests
            SET status = 'expired', ended_at = expires_at,
                end_reason = 'duration_expired', updated_at = $2::timestamptz
          WHERE id = $1`,
        [item.id, now.toISOString()],
      );
      const row = await requestForUpdate(client, item.id);
      if (!row) continue;
      await appendAuditEvent(client, {
        eventType: "emergency_access_duration_expired",
        requestId: row.id,
        merchantId: row.merchant_id,
        incidentReference: row.incident_reference,
      });
      await createMerchantNotice(client, row);
    }

    // Reconcile rows written by older runtimes that used cleanup time as the
    // incident end time. The security boundary is expires_at; merchant notices
    // must report that factual cutoff, not when a later cleanup happened.
    const reconciled = await client.query<{
      id: string;
      merchant_id: string;
      incident_reference: string;
    }>(
      `UPDATE emergency_access_requests
          SET ended_at = expires_at, updated_at = $1::timestamptz
        WHERE end_reason = 'duration_expired'
          AND expires_at IS NOT NULL
          AND ended_at IS DISTINCT FROM expires_at
      RETURNING id, merchant_id, incident_reference`,
      [now.toISOString()],
    );

    for (const row of reconciled.rows) {
      await appendAuditEvent(client, {
        eventType: "emergency_duration_expiry_time_reconciled",
        requestId: row.id,
        merchantId: row.merchant_id,
        incidentReference: row.incident_reference,
        metadata: {
          ended_at_source: "expires_at",
        },
      });
    }

    await client.query(
      `UPDATE emergency_merchant_notices n
          SET ended_at = r.expires_at
         FROM emergency_access_requests r
        WHERE n.request_id = r.id
          AND r.end_reason = 'duration_expired'
          AND r.expires_at IS NOT NULL
          AND n.ended_at IS DISTINCT FROM r.expires_at`,
    );

    return {
      pending_expired: pending.rowCount || 0,
      active_expired: active.rowCount || 0,
    };
  });
}

export async function getEmergencyDirectoryPostgres(input: {
  adminId: string;
  isOwner: boolean;
}) {
  assertRequired();
  await refreshEmergencyAccessPostgres();
  const pool = await operationalDatabasePool();
  if (!input.isOwner) {
    const authorization = await activeAuthorization(pool, input.adminId);
    if (!authorization) {
      throw new EmergencyPostgresError(
        "EMERGENCY_AUTHORIZATION_REQUIRED",
        "emergency read access is not authorized",
        403,
      );
    }
  }

  const merchants = await pool.query<{
    id: string;
    store_name: string;
    owner_name: string;
    status: string;
  }>(
    `SELECT id, store_name, owner_name, status
       FROM merchants
      WHERE retention_status IS DISTINCT FROM 'deleted'
      ORDER BY store_name, id`,
  );

  let assistants: Array<Record<string, unknown>> | undefined;
  if (input.isOwner) {
    const result = await pool.query<{
      id: string;
      display_name: string;
      phone: string | null;
      enabled: boolean;
      state: string;
    }>(
      `SELECT ap.id, ap.display_name, a.phone, ap.enabled, a.state
         FROM admin_profiles ap
         JOIN accounts a ON a.id = ap.account_id
        WHERE ap.role = 'assistant_admin'
        ORDER BY ap.display_name, ap.id`,
    );
    assistants = result.rows.map((row) => ({
      id: row.id,
      owner_name: row.display_name,
      phone: row.phone || "",
      status: row.enabled && row.state === "active" ? "approved" : "suspended",
      admin_enabled: Boolean(row.enabled),
    }));
  }

  return {
    is_owner: input.isOwner,
    merchants: merchants.rows,
    ...(assistants ? { assistants } : {}),
  };
}

async function ownerAlerts(target: OperationalQueryTarget) {
  const result = await target.query<{
    id: string;
    request_id: string;
    type: "approval_required" | "critical_self_activation";
    title_key: string;
    details: unknown;
    created_at: Date | string;
    read_at: Date | string | null;
  }>(
    `SELECT id, request_id, type, title_key, details, created_at, read_at
       FROM emergency_owner_alerts
      ORDER BY created_at DESC, id DESC`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    request_id: row.request_id,
    type: row.type,
    title: row.title_key,
    details: text(record(row.details).summary),
    created_at: iso(row.created_at),
    ...(iso(row.read_at) ? { read_at: iso(row.read_at) } : {}),
  }));
}

async function merchantNotices(target: OperationalQueryTarget, merchantId?: string) {
  const result = await target.query<{
    id: string;
    merchant_id: string;
    request_id: string;
    incident_reference: string;
    admin_name: string | null;
    activation_mode: EmergencyActivationMode;
    started_at: Date | string;
    ended_at: Date | string;
    created_at: Date | string;
    read_at: Date | string | null;
  }>(
    `SELECT n.id, n.merchant_id, n.request_id, n.incident_reference,
            ap.display_name AS admin_name, n.activation_mode,
            n.started_at, n.ended_at, n.created_at, n.read_at
       FROM emergency_merchant_notices n
       LEFT JOIN admin_profiles ap ON ap.id = n.accessed_by_admin_account_id
      WHERE ($1::text IS NULL OR n.merchant_id = $1)
      ORDER BY n.created_at DESC, n.id DESC`,
    [merchantId || null],
  );
  return result.rows.map((row) => ({
    id: row.id,
    merchant_id: row.merchant_id,
    request_id: row.request_id,
    incident_reference: row.incident_reference,
    accessed_by_admin_name: row.admin_name || "Support",
    activation_mode: row.activation_mode,
    started_at: iso(row.started_at),
    ended_at: iso(row.ended_at),
    created_at: iso(row.created_at),
    ...(iso(row.read_at) ? { read_at: iso(row.read_at) } : {}),
  }));
}

export async function getEmergencyOverviewPostgres(input: {
  adminId: string;
  isOwner: boolean;
}) {
  assertRequired();
  await refreshEmergencyAccessPostgres();
  const pool = await operationalDatabasePool();
  const authorizations = await authorizationRows(pool);
  const authorization = authorizations.find(
    (item) => item.admin_account_id === input.adminId && item.can_request && !item.revoked_at,
  );
  const requests = await requestRows(
    pool,
    input.isOwner ? "" : "WHERE r.requested_by_admin_account_id = $1",
    input.isOwner ? [] : [input.adminId],
  );
  const verification = input.isOwner ? await verifyEmergencyAuditChainPostgres() : undefined;
  return {
    is_owner: input.isOwner,
    authorization: authorization ? mapAuthorization(authorization) : null,
    ...(input.isOwner
      ? { authorizations: authorizations.map(mapAuthorization) }
      : {}),
    requests: requests.map(mapRequest),
    ...(input.isOwner ? { owner_alerts: await ownerAlerts(pool) } : {}),
    ...(input.isOwner ? { merchant_notices: await merchantNotices(pool) } : {}),
    ...(input.isOwner
      ? {
          audit_chain: {
            valid: verification?.valid === true,
            event_count: verification?.event_count || 0,
            latest_hash: verification?.latest_hash || "GENESIS",
          },
        }
      : {}),
  };
}

export async function upsertEmergencyAuthorizationPostgres(input: {
  ownerAdminId: string;
  ownerName: string;
  assistantAdminId: string;
  canRequest: boolean;
  canCriticalSelfActivate: boolean;
}) {
  assertRequired();
  return withOperationalTransaction(async (client) => {
    const assistant = await client.query<{
      id: string;
      display_name: string;
      enabled: boolean;
      state: string;
    }>(
      `SELECT ap.id, ap.display_name, ap.enabled, a.state
         FROM admin_profiles ap
         JOIN accounts a ON a.id = ap.account_id
        WHERE ap.id = $1 AND ap.role = 'assistant_admin'
        LIMIT 1`,
      [input.assistantAdminId],
    );
    const row = assistant.rows[0];
    if (!row) {
      throw new EmergencyPostgresError(
        "EMERGENCY_ASSISTANT_NOT_FOUND",
        "assistant administrator not found",
        404,
      );
    }
    if (!row.enabled || row.state !== "active") {
      throw new EmergencyPostgresError(
        "EMERGENCY_ASSISTANT_INACTIVE",
        "assistant administrator is not active",
        409,
      );
    }
    const canCritical = input.canRequest && input.canCriticalSelfActivate;
    const updated = await client.query<AuthorizationRow>(
      `INSERT INTO emergency_authorizations
         (admin_account_id, can_request, can_critical_self_activate,
          granted_by_owner_account_id, granted_at, updated_at, revoked_at)
       VALUES ($1, $2, $3, $4, now(), now(), CASE WHEN $2 THEN NULL ELSE now() END)
       ON CONFLICT (admin_account_id) DO UPDATE SET
         can_request = EXCLUDED.can_request,
         can_critical_self_activate = EXCLUDED.can_critical_self_activate,
         granted_by_owner_account_id = EXCLUDED.granted_by_owner_account_id,
         updated_at = now(),
         revoked_at = CASE WHEN EXCLUDED.can_request THEN NULL ELSE now() END
       RETURNING admin_account_id,
         $5::text AS admin_name,
         can_request, can_critical_self_activate,
         granted_by_owner_account_id,
         $6::text AS granted_by_owner_name,
         granted_at, updated_at, revoked_at`,
      [
        input.assistantAdminId,
        input.canRequest,
        canCritical,
        input.ownerAdminId,
        row.display_name,
        input.ownerName,
      ],
    );
    await appendAuditEvent(client, {
      eventType: input.canRequest
        ? "emergency_authorization_granted"
        : "emergency_authorization_revoked",
      actorAdminId: input.ownerAdminId,
      actorAdminName: input.ownerName,
      metadata: {
        assistant_admin_id: input.assistantAdminId,
        can_request: input.canRequest,
        can_critical_self_activate: canCritical,
      },
    });
    return mapAuthorization(updated.rows[0]);
  });
}

function validateCreateInput(input: {
  merchantId: string;
  incidentReference: string;
  severity: string;
  reason: string;
  durationMinutes: number;
}) {
  if (!input.merchantId) {
    throw new EmergencyPostgresError(
      "EMERGENCY_MERCHANT_REQUIRED",
      "merchant id is required",
      400,
    );
  }
  if (input.incidentReference.length < 5 || input.incidentReference.length > 120) {
    throw new EmergencyPostgresError(
      "EMERGENCY_INCIDENT_REFERENCE_INVALID",
      "incident reference must be 5 to 120 characters",
      400,
    );
  }
  if (input.severity !== "high" && input.severity !== "critical") {
    throw new EmergencyPostgresError(
      "EMERGENCY_SEVERITY_INVALID",
      "severity must be high or critical",
      400,
    );
  }
  if (input.reason.length < 10 || input.reason.length > 1000) {
    throw new EmergencyPostgresError(
      "EMERGENCY_REASON_INVALID",
      "incident reason must be 10 to 1000 characters",
      400,
    );
  }
  if (input.durationMinutes !== 15 && input.durationMinutes !== 30) {
    throw new EmergencyPostgresError(
      "EMERGENCY_DURATION_INVALID",
      "duration must be 15 or 30 minutes",
      400,
    );
  }
}

export async function createEmergencyRequestPostgres(input: {
  adminId: string;
  adminName: string;
  adminSessionId: string;
  isOwner: boolean;
  merchantId: string;
  incidentReference: string;
  severity: string;
  reason: string;
  durationMinutes: number;
  criticalSelfActivate: boolean;
}) {
  assertRequired();
  validateCreateInput(input);
  return withOperationalTransaction(async (client) => {
    await refreshEmergencyAccessPostgres();
    let authorization: AuthorizationRow | null = null;
    if (!input.isOwner) {
      authorization = await activeAuthorization(client, input.adminId);
      if (!authorization) {
        throw new EmergencyPostgresError(
          "EMERGENCY_AUTHORIZATION_REQUIRED",
          "emergency read access is not authorized",
          403,
        );
      }
    }

    const merchantResult = await client.query<{ id: string }>(
      `SELECT id FROM merchants
        WHERE id = $1 AND retention_status IS DISTINCT FROM 'deleted'
        LIMIT 1`,
      [input.merchantId],
    );
    if (!merchantResult.rows[0]) {
      throw new EmergencyPostgresError(
        "EMERGENCY_MERCHANT_NOT_FOUND",
        "merchant not found",
        404,
      );
    }

    const duplicate = await client.query<{ id: string }>(
      `SELECT id FROM emergency_access_requests
        WHERE requested_by_admin_account_id = $1 AND merchant_id = $2
          AND status IN ('pending','active')
        LIMIT 1
        FOR UPDATE`,
      [input.adminId, input.merchantId],
    );
    if (duplicate.rows[0]) {
      throw new EmergencyPostgresError(
        "EMERGENCY_REQUEST_ALREADY_EXISTS",
        "an active or pending emergency request already exists",
        409,
        { request_id: duplicate.rows[0].id },
      );
    }

    const criticalSelfActivation =
      !input.isOwner &&
      input.criticalSelfActivate &&
      input.severity === "critical" &&
      authorization?.can_critical_self_activate === true;
    if (input.criticalSelfActivate && !input.isOwner && !criticalSelfActivation) {
      throw new EmergencyPostgresError(
        "EMERGENCY_CRITICAL_SELF_ACTIVATION_FORBIDDEN",
        "critical self-activation is not authorized",
        403,
      );
    }

    const status: EmergencyStatus =
      input.isOwner || criticalSelfActivation ? "active" : "pending";
    const activationMode: EmergencyActivationMode = input.isOwner
      ? "owner_direct_activation"
      : criticalSelfActivation
        ? "critical_self_activation"
        : "owner_approval";
    const requestId = id("emergency-read-access");
    const nowIso = new Date().toISOString();
    const requestExpiresAt =
      status === "pending"
        ? new Date(Date.now() + REQUEST_WINDOW_MINUTES * 60_000).toISOString()
        : null;
    const expiresAt =
      status === "active"
        ? new Date(Date.now() + input.durationMinutes * 60_000).toISOString()
        : null;

    await client.query(
      `INSERT INTO emergency_access_requests
         (id, merchant_id, requested_by_admin_account_id, incident_reference,
          severity, reason, duration_minutes, read_only, status, activation_mode,
          reviewed_by_owner_account_id, admin_session_id, request_expires_at,
          reviewed_at, started_at, expires_at, viewed_sections, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9,
          $10, $11, $12::timestamptz, $13::timestamptz,
          $14::timestamptz, $15::timestamptz, '[]'::jsonb,
          $16::timestamptz, $16::timestamptz)`,
      [
        requestId,
        input.merchantId,
        input.adminId,
        input.incidentReference,
        input.severity,
        input.reason,
        input.durationMinutes,
        status,
        activationMode,
        input.isOwner ? input.adminId : null,
        input.adminSessionId || null,
        requestExpiresAt,
        input.isOwner ? nowIso : null,
        status === "active" ? nowIso : null,
        expiresAt,
        nowIso,
      ],
    );

    await appendAuditEvent(client, {
      eventType: "emergency_access_requested",
      requestId,
      actorAdminId: input.adminId,
      actorAdminName: input.adminName,
      merchantId: input.merchantId,
      incidentReference: input.incidentReference,
      metadata: {
        severity: input.severity,
        duration_minutes: input.durationMinutes,
        critical_self_activate_requested: input.criticalSelfActivate,
      },
    });

    const created = await requestForUpdate(client, requestId);
    if (!created) {
      throw new EmergencyPostgresError(
        "EMERGENCY_REQUEST_CREATE_FAILED",
        "emergency request could not be created",
        500,
      );
    }

    if (input.isOwner) {
      await appendAuditEvent(client, {
        eventType: "emergency_owner_direct_access_activated",
        requestId,
        actorAdminId: input.adminId,
        actorAdminName: input.adminName,
        merchantId: input.merchantId,
        incidentReference: input.incidentReference,
        metadata: {
          duration_minutes: input.durationMinutes,
          severity: input.severity,
          activation_mode: activationMode,
        },
      });
    } else if (criticalSelfActivation) {
      await appendAuditEvent(client, {
        eventType: "emergency_critical_self_access_activated",
        requestId,
        actorAdminId: input.adminId,
        actorAdminName: input.adminName,
        merchantId: input.merchantId,
        incidentReference: input.incidentReference,
        metadata: {
          duration_minutes: input.durationMinutes,
          severity: input.severity,
          activation_mode: activationMode,
        },
      });
      await createOwnerAlert(client, created, "critical_self_activation");
    } else {
      await createOwnerAlert(client, created, "approval_required");
    }

    return mapRequest(created);
  });
}

export async function decideEmergencyRequestPostgres(input: {
  ownerAdminId: string;
  ownerName: string;
  requestId: string;
  decision: string;
}) {
  assertRequired();
  if (input.decision !== "approve" && input.decision !== "reject") {
    throw new EmergencyPostgresError(
      "EMERGENCY_DECISION_INVALID",
      "decision must be approve or reject",
      400,
    );
  }
  return withOperationalTransaction(async (client) => {
    const row = await requestForUpdate(client, input.requestId);
    if (!row) {
      throw new EmergencyPostgresError(
        "EMERGENCY_REQUEST_NOT_FOUND",
        "emergency request not found",
        404,
      );
    }
    if (row.status !== "pending") {
      throw new EmergencyPostgresError(
        "EMERGENCY_REQUEST_NOT_PENDING",
        "emergency request is not pending",
        409,
      );
    }
    if (row.request_expires_at && new Date(row.request_expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE emergency_access_requests
            SET status = 'expired', ended_at = now(),
                end_reason = 'duration_expired', updated_at = now()
          WHERE id = $1`,
        [row.id],
      );
      await appendAuditEvent(client, {
        eventType: "emergency_request_expired",
        requestId: row.id,
        merchantId: row.merchant_id,
        incidentReference: row.incident_reference,
      });
      throw new EmergencyPostgresError(
        "EMERGENCY_REQUEST_NOT_PENDING",
        "emergency request is not pending",
        409,
      );
    }

    const reviewedAt = new Date().toISOString();
    if (input.decision === "approve") {
      const expiresAt = new Date(
        Date.now() + Number(row.duration_minutes) * 60_000,
      ).toISOString();
      await client.query(
        `UPDATE emergency_access_requests
            SET status = 'active', reviewed_by_owner_account_id = $2,
                reviewed_at = $3::timestamptz, started_at = $3::timestamptz,
                expires_at = $4::timestamptz, updated_at = $3::timestamptz
          WHERE id = $1`,
        [row.id, input.ownerAdminId, reviewedAt, expiresAt],
      );
      await appendAuditEvent(client, {
        eventType: "emergency_owner_approved_access",
        requestId: row.id,
        actorAdminId: input.ownerAdminId,
        actorAdminName: input.ownerName,
        merchantId: row.merchant_id,
        incidentReference: row.incident_reference,
        metadata: {
          duration_minutes: Number(row.duration_minutes),
          severity: row.severity,
          activation_mode: row.activation_mode,
        },
      });
    } else {
      await client.query(
        `UPDATE emergency_access_requests
            SET status = 'rejected', reviewed_by_owner_account_id = $2,
                reviewed_at = $3::timestamptz, ended_at = $3::timestamptz,
                end_reason = 'owner_rejected', updated_at = $3::timestamptz
          WHERE id = $1`,
        [row.id, input.ownerAdminId, reviewedAt],
      );
      await appendAuditEvent(client, {
        eventType: "emergency_owner_rejected_access",
        requestId: row.id,
        actorAdminId: input.ownerAdminId,
        actorAdminName: input.ownerName,
        merchantId: row.merchant_id,
        incidentReference: row.incident_reference,
      });
    }
    const updated = await requestForUpdate(client, row.id);
    return mapRequest(updated!);
  });
}

async function assertActiveRequestAccess(
  target: OperationalQueryTarget,
  input: {
    requestId: string;
    adminId: string;
    adminSessionId: string;
    isOwner: boolean;
  },
) {
  const row = await requestForUpdate(target, input.requestId);
  if (!row) {
    throw new EmergencyPostgresError(
      "EMERGENCY_REQUEST_NOT_FOUND",
      "emergency request not found",
      404,
    );
  }
  if (!input.isOwner) {
    if (row.requested_by_admin_account_id !== input.adminId) {
      throw new EmergencyPostgresError(
        "EMERGENCY_ADMIN_MISMATCH",
        "emergency access belongs to another administrator",
        403,
      );
    }
    if (row.admin_session_id && row.admin_session_id !== input.adminSessionId) {
      throw new EmergencyPostgresError(
        "EMERGENCY_SESSION_MISMATCH",
        "emergency access belongs to another login session",
        403,
      );
    }
    const authorization = await activeAuthorization(target, input.adminId);
    if (!authorization) {
      throw new EmergencyPostgresError(
        "EMERGENCY_AUTHORIZATION_REVOKED",
        "emergency authorization was revoked",
        403,
      );
    }
  }
  if (
    row.status !== "active" ||
    !row.expires_at ||
    new Date(row.expires_at).getTime() <= Date.now()
  ) {
    throw new EmergencyPostgresError(
      "EMERGENCY_ACCESS_INACTIVE",
      "emergency access is not active",
      410,
    );
  }
  return row;
}

export async function getEmergencySnapshotPostgres(input: {
  requestId: string;
  adminId: string;
  adminName: string;
  adminSessionId: string;
  isOwner: boolean;
}) {
  assertRequired();
  await refreshEmergencyAccessPostgres();
  const request = await withOperationalTransaction(async (client) => {
    const row = await assertActiveRequestAccess(client, input);
    const marker = input.isOwner ? `owner_snapshot:${input.adminId}` : "snapshot";
    const viewed = new Set(stringArray(row.viewed_sections));
    if (!viewed.has(marker)) {
      viewed.add(marker);
      await client.query(
        `UPDATE emergency_access_requests
            SET viewed_sections = $2::jsonb,
                first_viewed_at = COALESCE(first_viewed_at, now()),
                updated_at = now()
          WHERE id = $1`,
        [row.id, JSON.stringify([...viewed])],
      );
      await appendAuditEvent(client, {
        eventType: input.isOwner
          ? "emergency_owner_snapshot_viewed"
          : "emergency_snapshot_viewed",
        requestId: row.id,
        actorAdminId: input.adminId,
        actorAdminName: input.adminName,
        merchantId: row.merchant_id,
        incidentReference: row.incident_reference,
        metadata: input.isOwner
          ? {
              section: "snapshot",
              view_role: "owner",
              requester_admin_id: row.requested_by_admin_account_id,
            }
          : { section: "snapshot" },
      });
    }
    return row;
  });

  return buildEmergencyReadOnlySnapshotPostgres({
    merchantId: request.merchant_id,
    emergencyAccess: {
      request_id: request.id,
      incident_reference: request.incident_reference,
      severity: request.severity,
      reason: request.reason,
      expires_at: iso(request.expires_at)!,
    },
  });
}

export async function endEmergencyRequestPostgres(input: {
  requestId: string;
  adminId: string;
  adminName: string;
  isOwner: boolean;
}) {
  assertRequired();
  return withOperationalTransaction(async (client) => {
    const row = await requestForUpdate(client, input.requestId);
    if (!row) {
      throw new EmergencyPostgresError(
        "EMERGENCY_REQUEST_NOT_FOUND",
        "emergency request not found",
        404,
      );
    }
    if (!input.isOwner && row.requested_by_admin_account_id !== input.adminId) {
      throw new EmergencyPostgresError(
        "EMERGENCY_ADMIN_MISMATCH",
        "emergency access belongs to another administrator",
        403,
      );
    }
    if (row.status !== "active") {
      throw new EmergencyPostgresError(
        "EMERGENCY_ACCESS_INACTIVE",
        "emergency access is not active",
        409,
      );
    }
    const endReason = input.isOwner ? "owner_ended" : "admin_ended";
    await client.query(
      `UPDATE emergency_access_requests
          SET status = 'ended', ended_at = now(), end_reason = $2,
              updated_at = now()
        WHERE id = $1`,
      [row.id, endReason],
    );
    const updated = await requestForUpdate(client, row.id);
    if (!updated) throw new EmergencyPostgresError("EMERGENCY_REQUEST_NOT_FOUND", "emergency request not found", 404);
    await appendAuditEvent(client, {
      eventType: input.isOwner
        ? "emergency_access_ended_by_owner"
        : "emergency_access_ended_by_requester",
      requestId: row.id,
      actorAdminId: input.adminId,
      actorAdminName: input.adminName,
      merchantId: row.merchant_id,
      incidentReference: row.incident_reference,
    });
    await createMerchantNotice(client, updated);
    return mapRequest(updated);
  });
}

type AuditRow = {
  id: string;
  action_type: string;
  entity_id: string | null;
  actor_account_id: string | null;
  merchant_id: string | null;
  metadata: unknown;
  created_at: Date | string;
  previous_hash: string | null;
  event_hash: string | null;
};

function mapAudit(row: AuditRow) {
  const metadata = record(row.metadata);
  return {
    id: row.id,
    sequence: Number(metadata.sequence || 0),
    event_type: row.action_type,
    ...(row.entity_id ? { request_id: row.entity_id } : {}),
    ...(row.actor_account_id ? { actor_admin_id: row.actor_account_id } : {}),
    ...(text(metadata.actor_admin_name)
      ? { actor_admin_name: text(metadata.actor_admin_name) }
      : {}),
    ...(row.merchant_id ? { merchant_id: row.merchant_id } : {}),
    ...(text(metadata.incident_reference)
      ? { incident_reference: text(metadata.incident_reference) }
      : {}),
    metadata: parseJsonRecord(metadata.event_metadata),
    created_at: iso(row.created_at),
    previous_hash: row.previous_hash || "GENESIS",
    hash: row.event_hash || "",
  };
}

async function auditRows(target: OperationalQueryTarget): Promise<AuditRow[]> {
  const result = await target.query<AuditRow>(
    `SELECT id, action_type, entity_id, actor_account_id, merchant_id,
            metadata, created_at, previous_hash, event_hash
       FROM audit_events
      WHERE entity_type = $1 AND event_hash IS NOT NULL
      ORDER BY created_at ASC, id ASC`,
    [AUDIT_ENTITY_TYPE],
  );
  return result.rows;
}

export async function verifyEmergencyAuditChainPostgres() {
  assertRequired();
  const pool = await operationalDatabasePool();
  const rows = await auditRows(pool);
  let previousHash = "GENESIS";
  let expectedSequence = 1;
  for (const row of rows) {
    const metadata = record(row.metadata);
    const chainPayload = text(metadata.chain_payload);
    const sequence = Number(metadata.sequence || 0);
    const expectedHash = crypto
      .createHash("sha256")
      .update(`${previousHash}:${chainPayload}`)
      .digest("hex");
    if (
      sequence !== expectedSequence ||
      row.previous_hash !== previousHash ||
      row.event_hash !== expectedHash ||
      !chainPayload
    ) {
      return {
        valid: false,
        invalid_sequence: sequence || expectedSequence,
        event_count: rows.length,
        latest_hash: previousHash,
      };
    }
    previousHash = row.event_hash || "";
    expectedSequence += 1;
  }
  return {
    valid: true,
    event_count: rows.length,
    latest_hash: previousHash,
  };
}

export async function getEmergencyAuditPostgres() {
  assertRequired();
  const verification = await verifyEmergencyAuditChainPostgres();
  if (!verification.valid) {
    throw new EmergencyPostgresError(
      "EMERGENCY_AUDIT_CHAIN_INVALID",
      "emergency audit chain verification failed",
      503,
      { invalid_sequence: verification.invalid_sequence },
    );
  }
  const pool = await operationalDatabasePool();
  const rows = await auditRows(pool);
  return {
    verification: {
      valid: true,
      event_count: rows.length,
      latest_hash: verification.latest_hash,
    },
    events: rows.map(mapAudit).reverse(),
  };
}

export async function listEmergencyMerchantNoticesPostgres(input: {
  merchantId: string;
  unreadOnly?: boolean;
  limit?: number;
}) {
  assertRequired();
  await refreshEmergencyAccessPostgres();
  const pool = await operationalDatabasePool();
  const all = await merchantNotices(pool, input.merchantId);
  const filtered = input.unreadOnly ? all.filter((item) => !("read_at" in item)) : all;
  const limit = Number.isInteger(input.limit)
    ? Math.max(1, Math.min(50, Number(input.limit)))
    : 20;
  return {
    notices: filtered.slice(0, limit),
    unread_count: all.filter((item) => !("read_at" in item)).length,
  };
}

export async function markEmergencyMerchantNoticeReadPostgres(input: {
  merchantId: string;
  noticeId: string;
}) {
  assertRequired();
  return withOperationalTransaction(async (client) => {
    const result = await client.query<{
      request_id: string;
      incident_reference: string;
    }>(
      `UPDATE emergency_merchant_notices
          SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND merchant_id = $2
      RETURNING request_id, incident_reference`,
      [input.noticeId, input.merchantId],
    );
    if (!result.rows[0]) {
      throw new EmergencyPostgresError(
        "EMERGENCY_MERCHANT_NOTICE_NOT_FOUND",
        "emergency incident notice not found",
        404,
      );
    }
    const notices = await merchantNotices(client, input.merchantId);
    const notice = notices.find((item) => item.id === input.noticeId)!;
    await appendAuditEvent(client, {
      eventType: "emergency_merchant_notice_read",
      requestId: result.rows[0].request_id,
      merchantId: input.merchantId,
      incidentReference: result.rows[0].incident_reference,
      metadata: { notice_id: input.noticeId },
    });
    return notice;
  });
}
