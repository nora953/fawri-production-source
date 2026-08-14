import crypto from "node:crypto";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
  type OperationalQueryTarget,
  withMerchantOperationalTransaction,
  withOperationalTransaction,
} from "./operationalPostgresAuthority";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type SupportCategory = "technical" | "billing" | "channels" | "account" | "other";
export type InspectionDecision = "approve" | "reject";

const ACTIVE_TICKET_STATUSES = new Set<SupportTicketStatus>(["open", "in_progress"]);
const SUPPORT_CATEGORIES = new Set<SupportCategory>([
  "technical",
  "billing",
  "channels",
  "account",
  "other",
]);

export class SupportPostgresError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = "SupportPostgresError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function requiredText(value: unknown, name: string, min: number, max: number): string {
  const valueText = text(value);
  if (valueText.length < min || valueText.length > max) {
    throw new SupportPostgresError(
      "SUPPORT_VALIDATION_FAILED",
      `${name} must be between ${min} and ${max} characters`,
      400,
    );
  }
  return valueText;
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
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function supportId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function assertPostgresRequired(): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) {
    throw new SupportPostgresError(
      "SUPPORT_POSTGRES_AUTHORITY_REQUIRED",
      "PostgreSQL support authority is not required",
      503,
    );
  }
  await operationalDatabasePool();
}

type TicketRow = {
  id: string;
  merchant_id: string;
  subject: string;
  category: string;
  status: SupportTicketStatus;
  assigned_admin_account_id: string | null;
  assigned_admin_name: string | null;
  merchant_name: string | null;
  merchant_phone: string | null;
  waiting_on: "admin" | "merchant" | null;
  waiting_since: Date | string | null;
  merchant_reminder_sent_at: Date | string | null;
  assistant_reminder_sent_at: Date | string | null;
  owner_escalated_at: Date | string | null;
  resolved_at: Date | string | null;
  closed_at: Date | string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type MessageRow = {
  id: string;
  ticket_id: string;
  sender_type: "merchant" | "admin" | "system";
  sender_account_id: string | null;
  sender_name_snapshot: string;
  body: string;
  created_at: Date | string;
};

type AttachmentRow = {
  id: string;
  message_id: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_provider: string;
  storage_key: string;
  created_at: Date | string;
};

type InspectionRow = {
  id: string;
  ticket_id: string;
  merchant_id: string;
  admin_account_id: string;
  admin_name: string | null;
  mode: "live_observation" | "independent_read_only";
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired";
  consent_decision: "approved" | "rejected" | null;
  read_only: boolean;
  session_duration_minutes: number;
  requested_at: Date | string;
  request_expires_at: Date | string;
  responded_at: Date | string | null;
  approved_at: Date | string | null;
  rejected_at: Date | string | null;
  expired_at: Date | string | null;
  ended_at: Date | string | null;
  end_reason: string | null;
  metadata: unknown;
};

function mapAttachment(row: AttachmentRow) {
  return {
    id: row.id,
    kind: "image",
    original_name: row.original_file_name,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    url: `/api/auth/support-images/attachments/${encodeURIComponent(row.id)}`,
    created_at: iso(row.created_at),
  };
}

function mapInspection(row: InspectionRow) {
  const approvedAt = iso(row.approved_at);
  const duration = Number(row.session_duration_minutes || 30);
  const sessionExpiresAt = approvedAt
    ? new Date(new Date(approvedAt).getTime() + duration * 60_000).toISOString()
    : undefined;
  return {
    id: row.id,
    ticket_id: row.ticket_id,
    merchant_id: row.merchant_id,
    admin_id: row.admin_account_id,
    admin_name: row.admin_name || "Support",
    mode: row.mode,
    reason: row.reason,
    status: row.status,
    ...(row.consent_decision ? { consent_decision: row.consent_decision } : {}),
    ...(row.end_reason ? { end_reason: row.end_reason } : {}),
    ...(iso(row.ended_at) ? { ended_at: iso(row.ended_at) } : {}),
    read_only: true as const,
    session_duration_minutes: duration,
    requested_at: iso(row.requested_at),
    request_expires_at: iso(row.request_expires_at),
    ...(iso(row.responded_at) ? { responded_at: iso(row.responded_at) } : {}),
    ...(approvedAt ? { approved_at: approvedAt } : {}),
    ...(iso(row.rejected_at) ? { rejected_at: iso(row.rejected_at) } : {}),
    ...(iso(row.expired_at) ? { expired_at: iso(row.expired_at) } : {}),
    ...(sessionExpiresAt ? { session_expires_at: sessionExpiresAt } : {}),
  };
}

async function loadTicketRows(
  target: OperationalQueryTarget,
  ticketId: string,
  merchantId?: string,
): Promise<TicketRow | null> {
  const result = await target.query<TicketRow>(
    `SELECT t.id, t.merchant_id, t.subject, t.category, t.status,
            t.assigned_admin_account_id,
            ap.display_name AS assigned_admin_name,
            m.store_name AS merchant_name,
            a.phone AS merchant_phone,
            t.waiting_on, t.waiting_since, t.merchant_reminder_sent_at,
            t.assistant_reminder_sent_at, t.owner_escalated_at,
            t.resolved_at, t.closed_at, t.metadata, t.created_at, t.updated_at
       FROM support_tickets t
       JOIN merchants m ON m.id = t.merchant_id
       JOIN accounts a ON a.id = m.account_id
       LEFT JOIN admin_profiles ap ON ap.id = t.assigned_admin_account_id
      WHERE t.id = $1
        AND ($2::text IS NULL OR t.merchant_id = $2)
      LIMIT 1`,
    [ticketId, merchantId || null],
  );
  return result.rows[0] || null;
}

async function hydrateTicket(target: OperationalQueryTarget, ticket: TicketRow) {
  const messages = await target.query<MessageRow>(
    `SELECT id, ticket_id, sender_type, sender_account_id, sender_name_snapshot,
            body, created_at
       FROM support_messages
      WHERE ticket_id = $1
      ORDER BY created_at ASC, id ASC`,
    [ticket.id],
  );
  const attachments = await target.query<AttachmentRow>(
    `SELECT id, message_id, original_file_name, mime_type, size_bytes,
            storage_provider, storage_key, created_at
       FROM support_attachments
      WHERE ticket_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC`,
    [ticket.id],
  );
  const byMessage = new Map<string, ReturnType<typeof mapAttachment>[]>();
  for (const item of attachments.rows) {
    const list = byMessage.get(item.message_id) || [];
    list.push(mapAttachment(item));
    byMessage.set(item.message_id, list);
  }
  const inspections = await target.query<InspectionRow>(
    `SELECT r.id, r.ticket_id, r.merchant_id, r.admin_account_id,
            ap.display_name AS admin_name, r.mode, r.reason, r.status,
            r.consent_decision, r.read_only, r.session_duration_minutes,
            r.requested_at, r.request_expires_at, r.responded_at,
            r.approved_at, r.rejected_at, r.expired_at, r.ended_at,
            r.end_reason, r.metadata
       FROM support_inspection_requests r
       LEFT JOIN admin_profiles ap ON ap.id = r.admin_account_id
      WHERE r.ticket_id = $1
      ORDER BY r.requested_at DESC, r.id DESC`,
    [ticket.id],
  );
  const metadata = record(ticket.metadata);
  return {
    id: ticket.id,
    merchant_id: ticket.merchant_id,
    merchant_name: ticket.merchant_name || "",
    merchant_phone: ticket.merchant_phone || "",
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    ...(ticket.assigned_admin_account_id
      ? { assigned_admin_id: ticket.assigned_admin_account_id }
      : {}),
    ...(ticket.assigned_admin_name
      ? { assigned_admin_name: ticket.assigned_admin_name }
      : {}),
    created_at: iso(ticket.created_at),
    updated_at: iso(ticket.updated_at),
    ...(iso(ticket.closed_at) ? { closed_at: iso(ticket.closed_at) } : {}),
    ...(ticket.waiting_on ? { waiting_on: ticket.waiting_on } : {}),
    ...(iso(ticket.waiting_since) ? { waiting_since: iso(ticket.waiting_since) } : {}),
    ...(iso(ticket.merchant_reminder_sent_at)
      ? { merchant_reminder_sent_at: iso(ticket.merchant_reminder_sent_at) }
      : {}),
    ...(metadata.auto_closed_at ? { auto_closed_at: String(metadata.auto_closed_at) } : {}),
    ...(metadata.auto_closed_reason
      ? { auto_closed_reason: String(metadata.auto_closed_reason) }
      : {}),
    messages: messages.rows.map((message) => ({
      id: message.id,
      sender_type: message.sender_type,
      sender_id: message.sender_account_id || "system",
      sender_name: message.sender_name_snapshot,
      body: message.body,
      created_at: iso(message.created_at),
      attachments: byMessage.get(message.id) || [],
    })),
    inspection_requests: inspections.rows.map(mapInspection),
  };
}

async function loadHydratedTicket(
  target: OperationalQueryTarget,
  ticketId: string,
  merchantId?: string,
) {
  const ticket = await loadTicketRows(target, ticketId, merchantId);
  if (!ticket) {
    throw new SupportPostgresError("SUPPORT_TICKET_NOT_FOUND", "support ticket not found", 404);
  }
  return hydrateTicket(target, ticket);
}

async function merchantDisplayName(target: OperationalQueryTarget, merchantId: string): Promise<string> {
  const result = await target.query<{ owner_name: string; store_name: string }>(
    `SELECT owner_name, store_name FROM merchants WHERE id = $1 LIMIT 1`,
    [merchantId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new SupportPostgresError("MERCHANT_NOT_FOUND", "merchant account not found", 404);
  }
  return text(row.owner_name) || text(row.store_name) || "Merchant";
}

async function adminDisplayName(target: OperationalQueryTarget, adminId: string): Promise<string> {
  const result = await target.query<{ display_name: string }>(
    `SELECT display_name FROM admin_profiles WHERE id = $1 AND enabled = true LIMIT 1`,
    [adminId],
  );
  if (!result.rows[0]) {
    throw new SupportPostgresError("ADMIN_NOT_FOUND", "administrator account not found", 404);
  }
  return text(result.rows[0].display_name) || "Support";
}

export async function listMerchantSupportTicketsPostgres(merchantIdValue: string) {
  await assertPostgresRequired();
  const merchantId = text(merchantIdValue);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<TicketRow>(
      `SELECT t.id, t.merchant_id, t.subject, t.category, t.status,
              t.assigned_admin_account_id, ap.display_name AS assigned_admin_name,
              m.store_name AS merchant_name, a.phone AS merchant_phone,
              t.waiting_on, t.waiting_since, t.merchant_reminder_sent_at,
              t.assistant_reminder_sent_at, t.owner_escalated_at,
              t.resolved_at, t.closed_at, t.metadata, t.created_at, t.updated_at
         FROM support_tickets t
         JOIN merchants m ON m.id = t.merchant_id
         JOIN accounts a ON a.id = m.account_id
         LEFT JOIN admin_profiles ap ON ap.id = t.assigned_admin_account_id
        WHERE t.merchant_id = $1
        ORDER BY t.updated_at DESC, t.id DESC`,
      [merchantId],
    );
    return Promise.all(result.rows.map((row) => hydrateTicket(client, row)));
  });
}

export async function createMerchantSupportTicketPostgres(input: {
  merchantId: string;
  subject: unknown;
  category: unknown;
  message: unknown;
}) {
  await assertPostgresRequired();
  const merchantId = text(input.merchantId);
  const subject = requiredText(input.subject, "subject", 3, 160);
  const category = text(input.category) as SupportCategory;
  if (!SUPPORT_CATEGORIES.has(category)) {
    throw new SupportPostgresError("SUPPORT_CATEGORY_INVALID", "support category is invalid", 400);
  }
  const body = requiredText(input.message, "message", 1, 5000);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const senderName = await merchantDisplayName(client, merchantId);
    const ticketId = supportId("support-ticket");
    const messageId = supportId("support-message");
    await client.query(
      `INSERT INTO support_tickets
         (id, merchant_id, subject, category, status, waiting_on, waiting_since,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'open', 'admin', now(), now(), now())`,
      [ticketId, merchantId, subject, category],
    );
    await client.query(
      `INSERT INTO support_messages
         (id, ticket_id, merchant_id, sender_type, sender_account_id,
          sender_name_snapshot, body, created_at)
       VALUES ($1, $2, $3, 'merchant', $3, $4, $5, now())`,
      [messageId, ticketId, merchantId, senderName, body],
    );
    return loadHydratedTicket(client, ticketId, merchantId);
  });
}

export async function getMerchantSupportTicketPostgres(merchantIdValue: string, ticketIdValue: string) {
  await assertPostgresRequired();
  const merchantId = text(merchantIdValue);
  const ticketId = text(ticketIdValue);
  return withMerchantOperationalTransaction(merchantId, (client) =>
    loadHydratedTicket(client, ticketId, merchantId),
  );
}

export async function addMerchantSupportMessagePostgres(input: {
  merchantId: string;
  ticketId: string;
  body: unknown;
}) {
  await assertPostgresRequired();
  const merchantId = text(input.merchantId);
  const ticketId = text(input.ticketId);
  const body = requiredText(input.body, "message", 1, 5000);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const ticket = await loadTicketRows(client, ticketId, merchantId);
    if (!ticket) throw new SupportPostgresError("SUPPORT_TICKET_NOT_FOUND", "support ticket not found", 404);
    if (!ACTIVE_TICKET_STATUSES.has(ticket.status)) {
      throw new SupportPostgresError("SUPPORT_TICKET_NOT_ACTIVE", "support ticket is not active", 409);
    }
    const senderName = await merchantDisplayName(client, merchantId);
    await client.query(
      `INSERT INTO support_messages
         (id, ticket_id, merchant_id, sender_type, sender_account_id,
          sender_name_snapshot, body, created_at)
       VALUES ($1, $2, $3, 'merchant', $3, $4, $5, now())`,
      [supportId("support-message"), ticketId, merchantId, senderName, body],
    );
    await client.query(
      `UPDATE support_tickets
          SET waiting_on = 'admin', waiting_since = now(),
              assistant_reminder_sent_at = NULL, owner_escalated_at = NULL,
              updated_at = now()
        WHERE id = $1`,
      [ticketId],
    );
    return loadHydratedTicket(client, ticketId, merchantId);
  });
}

export async function listAdminSupportTicketsPostgres() {
  await assertPostgresRequired();
  const pool = await operationalDatabasePool();
  const result = await pool.query<TicketRow>(
    `SELECT t.id, t.merchant_id, t.subject, t.category, t.status,
            t.assigned_admin_account_id, ap.display_name AS assigned_admin_name,
            m.store_name AS merchant_name, a.phone AS merchant_phone,
            t.waiting_on, t.waiting_since, t.merchant_reminder_sent_at,
            t.assistant_reminder_sent_at, t.owner_escalated_at,
            t.resolved_at, t.closed_at, t.metadata, t.created_at, t.updated_at
       FROM support_tickets t
       JOIN merchants m ON m.id = t.merchant_id
       JOIN accounts a ON a.id = m.account_id
       LEFT JOIN admin_profiles ap ON ap.id = t.assigned_admin_account_id
      ORDER BY t.updated_at DESC, t.id DESC`,
  );
  return Promise.all(result.rows.map((row) => hydrateTicket(pool, row)));
}

async function assertAssignedToAdmin(target: OperationalQueryTarget, ticketId: string, adminId: string) {
  const ticket = await loadTicketRows(target, ticketId);
  if (!ticket) throw new SupportPostgresError("SUPPORT_TICKET_NOT_FOUND", "support ticket not found", 404);
  if (!ticket.assigned_admin_account_id) {
    throw new SupportPostgresError("SUPPORT_TICKET_NOT_CLAIMED", "support ticket must be claimed first", 409);
  }
  if (ticket.assigned_admin_account_id !== adminId) {
    throw new SupportPostgresError("SUPPORT_TICKET_ASSIGNED_ELSEWHERE", "support ticket is assigned to another administrator", 409);
  }
  return ticket;
}

export async function claimSupportTicketPostgres(input: { ticketId: string; adminId: string }) {
  await assertPostgresRequired();
  const ticketId = text(input.ticketId);
  const adminId = text(input.adminId);
  return withOperationalTransaction(async (client) => {
    await adminDisplayName(client, adminId);
    const result = await client.query<{ assigned_admin_account_id: string | null }>(
      `SELECT assigned_admin_account_id
         FROM support_tickets
        WHERE id = $1
        FOR UPDATE`,
      [ticketId],
    );
    const row = result.rows[0];
    if (!row) throw new SupportPostgresError("SUPPORT_TICKET_NOT_FOUND", "support ticket not found", 404);
    if (row.assigned_admin_account_id && row.assigned_admin_account_id !== adminId) {
      throw new SupportPostgresError("SUPPORT_TICKET_ALREADY_CLAIMED", "support ticket is already claimed", 409);
    }
    await client.query(
      `UPDATE support_tickets
          SET assigned_admin_account_id = $2,
              status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
              updated_at = now()
        WHERE id = $1`,
      [ticketId, adminId],
    );
    return loadHydratedTicket(client, ticketId);
  });
}

export async function addAdminSupportMessagePostgres(input: {
  ticketId: string;
  adminId: string;
  body: unknown;
}) {
  await assertPostgresRequired();
  const ticketId = text(input.ticketId);
  const adminId = text(input.adminId);
  const body = requiredText(input.body, "message", 1, 5000);
  return withOperationalTransaction(async (client) => {
    const ticket = await assertAssignedToAdmin(client, ticketId, adminId);
    if (!ACTIVE_TICKET_STATUSES.has(ticket.status)) {
      throw new SupportPostgresError("SUPPORT_TICKET_NOT_ACTIVE", "support ticket is not active", 409);
    }
    const senderName = await adminDisplayName(client, adminId);
    await client.query(
      `INSERT INTO support_messages
         (id, ticket_id, merchant_id, sender_type, sender_account_id,
          sender_name_snapshot, body, created_at)
       VALUES ($1, $2, $3, 'admin', $4, $5, $6, now())`,
      [supportId("support-message"), ticketId, ticket.merchant_id, adminId, senderName, body],
    );
    await client.query(
      `UPDATE support_tickets
          SET waiting_on = 'merchant', waiting_since = now(),
              merchant_reminder_sent_at = NULL, updated_at = now()
        WHERE id = $1`,
      [ticketId],
    );
    return loadHydratedTicket(client, ticketId);
  });
}

async function endActiveInspectionForTicket(
  target: OperationalQueryTarget,
  ticketId: string,
  reason: "ticket_resolved" | "ticket_closed",
) {
  await target.query(
    `UPDATE support_inspection_requests
        SET ended_at = COALESCE(ended_at, now()), end_reason = COALESCE(end_reason, $2)
      WHERE ticket_id = $1 AND status = 'approved' AND ended_at IS NULL`,
    [ticketId, reason],
  );
  await target.query(
    `UPDATE support_preview_sessions
        SET status = 'ended', ended_at = COALESCE(ended_at, now()),
            end_reason = COALESCE(end_reason, $2), last_seen_at = now()
      WHERE ticket_id = $1 AND status = 'active'`,
    [ticketId, reason],
  );
}

export async function updateSupportTicketStatusPostgres(input: {
  ticketId: string;
  adminId: string;
  status: unknown;
}) {
  await assertPostgresRequired();
  const ticketId = text(input.ticketId);
  const adminId = text(input.adminId);
  const status = text(input.status) as SupportTicketStatus;
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
    throw new SupportPostgresError("SUPPORT_STATUS_INVALID", "support ticket status is invalid", 400);
  }
  return withOperationalTransaction(async (client) => {
    await assertAssignedToAdmin(client, ticketId, adminId);
    await client.query(
      `UPDATE support_tickets
          SET status = $2,
              resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END,
              closed_at = CASE WHEN $2 = 'closed' THEN now() ELSE CASE WHEN $2 IN ('open','in_progress') THEN NULL ELSE closed_at END END,
              waiting_on = CASE WHEN $2 IN ('resolved','closed') THEN NULL ELSE waiting_on END,
              waiting_since = CASE WHEN $2 IN ('resolved','closed') THEN NULL ELSE waiting_since END,
              updated_at = now()
        WHERE id = $1`,
      [ticketId, status],
    );
    if (status === "resolved" || status === "closed") {
      await endActiveInspectionForTicket(
        client,
        ticketId,
        status === "resolved" ? "ticket_resolved" : "ticket_closed",
      );
    }
    return loadHydratedTicket(client, ticketId);
  });
}

export async function createInspectionRequestPostgres(input: {
  ticketId: string;
  adminId: string;
  reason: unknown;
}) {
  await assertPostgresRequired();
  const ticketId = text(input.ticketId);
  const adminId = text(input.adminId);
  const reason = requiredText(input.reason, "reason", 5, 500);
  return withOperationalTransaction(async (client) => {
    const ticket = await assertAssignedToAdmin(client, ticketId, adminId);
    if (!ACTIVE_TICKET_STATUSES.has(ticket.status)) {
      throw new SupportPostgresError("SUPPORT_TICKET_NOT_ACTIVE", "support ticket is not active", 409);
    }
    const active = await client.query<{ id: string }>(
      `SELECT id
         FROM support_inspection_requests
        WHERE merchant_id = $1
          AND ((status = 'pending' AND request_expires_at > now())
            OR (status = 'approved' AND ended_at IS NULL
                AND approved_at + (session_duration_minutes * interval '1 minute') > now()))
        LIMIT 1
        FOR UPDATE`,
      [ticket.merchant_id],
    );
    if (active.rows[0]) {
      throw new SupportPostgresError("SUPPORT_INSPECTION_ALREADY_ACTIVE", "merchant already has an active inspection request or session", 409);
    }
    const requestId = supportId("inspection-request");
    await client.query(
      `INSERT INTO support_inspection_requests
         (id, ticket_id, merchant_id, admin_account_id, mode, reason, status,
          read_only, session_duration_minutes, requested_at, request_expires_at)
       VALUES ($1, $2, $3, $4, 'independent_read_only', $5, 'pending',
               true, 30, now(), now() + interval '10 minutes')`,
      [requestId, ticketId, ticket.merchant_id, adminId, reason],
    );
    await insertMerchantNotification(client, {
      merchantId: ticket.merchant_id,
      id: `notification-inspection-${requestId}`,
      type: "inspection_session_request",
      titleKey: "notifications.inspection_request.title",
      bodyKey: "notifications.inspection_request.body",
      variables: {
        ticket_id: ticketId,
        request_id: requestId,
        action_url: `/dashboard/support?ticket=${encodeURIComponent(ticketId)}`,
      },
      sourceEntityType: "support_inspection_request",
      sourceEntityId: requestId,
    });
    return loadHydratedTicket(client, ticketId);
  });
}

export async function decideInspectionRequestPostgres(input: {
  merchantId: string;
  ticketId: string;
  requestId: string;
  decision: InspectionDecision;
}) {
  await assertPostgresRequired();
  const merchantId = text(input.merchantId);
  const ticketId = text(input.ticketId);
  const requestId = text(input.requestId);
  if (!(["approve", "reject"] as string[]).includes(input.decision)) {
    throw new SupportPostgresError("SUPPORT_INSPECTION_DECISION_INVALID", "inspection decision is invalid", 400);
  }
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await loadHydratedTicket(client, ticketId, merchantId);
    const result = await client.query<InspectionRow>(
      `SELECT r.id, r.ticket_id, r.merchant_id, r.admin_account_id,
              ap.display_name AS admin_name, r.mode, r.reason, r.status,
              r.consent_decision, r.read_only, r.session_duration_minutes,
              r.requested_at, r.request_expires_at, r.responded_at,
              r.approved_at, r.rejected_at, r.expired_at, r.ended_at,
              r.end_reason, r.metadata
         FROM support_inspection_requests r
         LEFT JOIN admin_profiles ap ON ap.id = r.admin_account_id
        WHERE r.id = $1 AND r.ticket_id = $2 AND r.merchant_id = $3
        FOR UPDATE`,
      [requestId, ticketId, merchantId],
    );
    const request = result.rows[0];
    if (!request) throw new SupportPostgresError("SUPPORT_INSPECTION_NOT_FOUND", "inspection request not found", 404);
    if (request.status !== "pending") {
      throw new SupportPostgresError("SUPPORT_INSPECTION_NOT_PENDING", "inspection request is no longer pending", 409);
    }
    if (new Date(request.request_expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE support_inspection_requests
            SET status = 'expired', expired_at = now(), ended_at = now(), end_reason = 'request_timeout'
          WHERE id = $1`,
        [requestId],
      );
      throw new SupportPostgresError("SUPPORT_INSPECTION_EXPIRED", "inspection request has expired", 409);
    }
    if (input.decision === "approve") {
      await client.query(
        `UPDATE support_inspection_requests
            SET status = 'approved', consent_decision = 'approved',
                responded_at = now(), approved_at = now()
          WHERE id = $1`,
        [requestId],
      );
    } else {
      await client.query(
        `UPDATE support_inspection_requests
            SET status = 'rejected', consent_decision = 'rejected',
                responded_at = now(), rejected_at = now(), ended_at = now()
          WHERE id = $1`,
        [requestId],
      );
    }
    return loadHydratedTicket(client, ticketId, merchantId);
  });
}

export async function terminateInspectionRequestPostgres(input: {
  merchantId: string;
  ticketId: string;
  requestId: string;
}) {
  await assertPostgresRequired();
  const merchantId = text(input.merchantId);
  const ticketId = text(input.ticketId);
  const requestId = text(input.requestId);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<{ status: string; ended_at: unknown }>(
      `SELECT status, ended_at
         FROM support_inspection_requests
        WHERE id = $1 AND ticket_id = $2 AND merchant_id = $3
        FOR UPDATE`,
      [requestId, ticketId, merchantId],
    );
    const request = result.rows[0];
    if (!request) throw new SupportPostgresError("SUPPORT_INSPECTION_NOT_FOUND", "inspection request not found", 404);
    if (request.status !== "approved" || request.ended_at) {
      throw new SupportPostgresError("SUPPORT_INSPECTION_NOT_ACTIVE", "inspection session is not active", 409);
    }
    await client.query(
      `UPDATE support_inspection_requests
          SET ended_at = now(), end_reason = 'merchant_terminated'
        WHERE id = $1`,
      [requestId],
    );
    await client.query(
      `UPDATE support_preview_sessions
          SET status = 'ended', ended_at = COALESCE(ended_at, now()),
              end_reason = 'merchant_terminated', last_seen_at = now()
        WHERE request_id = $1 AND status = 'active'`,
      [requestId],
    );
    return loadHydratedTicket(client, ticketId, merchantId);
  });
}

export async function startSupportPreviewSessionPostgres(input: {
  ticketId: string;
  requestId: string;
  adminId: string;
  adminSessionId: string;
}) {
  await assertPostgresRequired();
  const ticketId = text(input.ticketId);
  const requestId = text(input.requestId);
  const adminId = text(input.adminId);
  const adminSessionId = text(input.adminSessionId);
  return withOperationalTransaction(async (client) => {
    const requestResult = await client.query<{
      merchant_id: string;
      admin_account_id: string;
      status: string;
      approved_at: Date | string | null;
      ended_at: Date | string | null;
      session_duration_minutes: number;
    }>(
      `SELECT merchant_id, admin_account_id, status, approved_at, ended_at,
              session_duration_minutes
         FROM support_inspection_requests
        WHERE id = $1 AND ticket_id = $2
        FOR UPDATE`,
      [requestId, ticketId],
    );
    const request = requestResult.rows[0];
    if (!request) throw new SupportPostgresError("SUPPORT_INSPECTION_NOT_FOUND", "inspection request not found", 404);
    if (request.admin_account_id !== adminId) {
      throw new SupportPostgresError("SUPPORT_INSPECTION_ADMIN_MISMATCH", "inspection request belongs to another administrator", 403);
    }
    if (request.status !== "approved" || !request.approved_at || request.ended_at) {
      throw new SupportPostgresError("SUPPORT_INSPECTION_NOT_ACTIVE", "inspection request is not approved and active", 409);
    }
    const expiry = new Date(
      new Date(request.approved_at).getTime() + Number(request.session_duration_minutes || 30) * 60_000,
    );
    if (expiry.getTime() <= Date.now()) {
      await client.query(
        `UPDATE support_inspection_requests
            SET ended_at = COALESCE(ended_at, now()), end_reason = COALESCE(end_reason, 'approval_window_expired')
          WHERE id = $1`,
        [requestId],
      );
      throw new SupportPostgresError("SUPPORT_INSPECTION_EXPIRED", "inspection approval window has expired", 409);
    }
    const existing = await client.query<{
      id: string;
      status: string;
      expires_at: Date | string;
      started_at: Date | string;
    }>(
      `SELECT id, status, expires_at, started_at
         FROM support_preview_sessions
        WHERE request_id = $1
        FOR UPDATE`,
      [requestId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].status !== "active") {
        throw new SupportPostgresError("SUPPORT_PREVIEW_ALREADY_ENDED", "support preview session has already ended", 409);
      }
      await client.query(
        `UPDATE support_preview_sessions SET last_seen_at = now() WHERE id = $1`,
        [existing.rows[0].id],
      );
      return {
        id: existing.rows[0].id,
        ticket_id: ticketId,
        request_id: requestId,
        merchant_id: request.merchant_id,
        started_at: iso(existing.rows[0].started_at),
        expires_at: iso(existing.rows[0].expires_at),
        read_only: true,
      };
    }
    const sessionId = supportId("support-preview");
    await client.query(
      `INSERT INTO support_preview_sessions
         (id, request_id, ticket_id, merchant_id, admin_account_id,
          admin_session_id, status, started_at, expires_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', now(), $7::timestamptz, now())`,
      [sessionId, requestId, ticketId, request.merchant_id, adminId, adminSessionId || null, expiry.toISOString()],
    );
    return {
      id: sessionId,
      ticket_id: ticketId,
      request_id: requestId,
      merchant_id: request.merchant_id,
      started_at: new Date().toISOString(),
      expires_at: expiry.toISOString(),
      read_only: true,
    };
  });
}

export async function validateSupportPreviewSessionPostgres(input: {
  sessionId: string;
  adminId: string;
  adminSessionId?: string;
  viewedSection?: string;
}) {
  await assertPostgresRequired();
  const sessionId = text(input.sessionId);
  const adminId = text(input.adminId);
  return withOperationalTransaction(async (client) => {
    const result = await client.query<{
      id: string;
      request_id: string;
      ticket_id: string;
      merchant_id: string;
      admin_account_id: string;
      admin_session_id: string | null;
      status: string;
      started_at: Date | string;
      expires_at: Date | string;
      ended_at: Date | string | null;
      viewed_sections: unknown;
    }>(
      `SELECT id, request_id, ticket_id, merchant_id, admin_account_id,
              admin_session_id, status, started_at, expires_at, ended_at,
              viewed_sections
         FROM support_preview_sessions
        WHERE id = $1
        FOR UPDATE`,
      [sessionId],
    );
    const session = result.rows[0];
    if (!session) throw new SupportPostgresError("SUPPORT_PREVIEW_NOT_FOUND", "support preview session not found", 404);
    if (session.admin_account_id !== adminId) {
      throw new SupportPostgresError("SUPPORT_PREVIEW_ADMIN_MISMATCH", "support preview session belongs to another administrator", 403);
    }
    if (session.admin_session_id && input.adminSessionId && session.admin_session_id !== input.adminSessionId) {
      throw new SupportPostgresError("SUPPORT_PREVIEW_SESSION_MISMATCH", "support preview is bound to another admin session", 403);
    }
    if (session.status !== "active" || session.ended_at) {
      throw new SupportPostgresError("SUPPORT_PREVIEW_ENDED", "support preview session has ended", 409);
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await client.query(
        `UPDATE support_preview_sessions
            SET status = 'ended', ended_at = now(), end_reason = 'approval_window_expired', last_seen_at = now()
          WHERE id = $1`,
        [sessionId],
      );
      throw new SupportPostgresError("SUPPORT_PREVIEW_EXPIRED", "support preview session has expired", 409);
    }
    const viewed = new Set(stringArray(session.viewed_sections));
    if (text(input.viewedSection)) viewed.add(text(input.viewedSection));
    await client.query(
      `UPDATE support_preview_sessions
          SET last_seen_at = now(), viewed_sections = $2::jsonb
        WHERE id = $1`,
      [sessionId, JSON.stringify([...viewed])],
    );
    return {
      id: session.id,
      request_id: session.request_id,
      ticket_id: session.ticket_id,
      merchant_id: session.merchant_id,
      started_at: iso(session.started_at),
      expires_at: iso(session.expires_at),
      read_only: true,
    };
  });
}

export async function endSupportPreviewSessionPostgres(input: {
  sessionId: string;
  adminId: string;
  reason?: unknown;
}) {
  await assertPostgresRequired();
  const reason = text(input.reason) || "admin_ended";
  return withOperationalTransaction(async (client) => {
    const result = await client.query<{ admin_account_id: string; status: string }>(
      `SELECT admin_account_id, status FROM support_preview_sessions WHERE id = $1 FOR UPDATE`,
      [text(input.sessionId)],
    );
    const session = result.rows[0];
    if (!session) throw new SupportPostgresError("SUPPORT_PREVIEW_NOT_FOUND", "support preview session not found", 404);
    if (session.admin_account_id !== text(input.adminId)) {
      throw new SupportPostgresError("SUPPORT_PREVIEW_ADMIN_MISMATCH", "support preview session belongs to another administrator", 403);
    }
    await client.query(
      `UPDATE support_preview_sessions
          SET status = 'ended', ended_at = COALESCE(ended_at, now()),
              end_reason = COALESCE(end_reason, $2), last_seen_at = now()
        WHERE id = $1`,
      [text(input.sessionId), reason.slice(0, 100)],
    );
    return { ok: true };
  });
}

type NotificationInput = {
  merchantId: string;
  id: string;
  type: string;
  titleKey: string;
  bodyKey: string;
  variables: Record<string, string | number | boolean | null>;
  sourceEntityType?: string;
  sourceEntityId?: string;
};

async function insertMerchantNotification(target: OperationalQueryTarget, input: NotificationInput) {
  await target.query(
    `INSERT INTO notifications
       (id, audience, merchant_id, account_id, type, title_key, body_key,
        variables, source_entity_type, source_entity_id, created_at)
     VALUES ($1, 'merchant', $2, $2, $3, $4, $5, $6::jsonb, $7, $8, now())
     ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      input.merchantId,
      input.type,
      input.titleKey,
      input.bodyKey,
      JSON.stringify(input.variables),
      input.sourceEntityType || null,
      input.sourceEntityId || null,
    ],
  );
}

function mapNotification(row: {
  id: string;
  type: string;
  variables: unknown;
  read_at: Date | string | null;
  created_at: Date | string;
}) {
  return {
    id: row.id,
    type: row.type,
    ...record(row.variables),
    read_at: iso(row.read_at),
    created_at: iso(row.created_at),
  };
}

export async function listMerchantNotificationsPostgres(merchantIdValue: string, limitValue = 50) {
  await assertPostgresRequired();
  const merchantId = text(merchantIdValue);
  const limit = Math.max(1, Math.min(100, Number(limitValue) || 50));
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<{
      id: string;
      type: string;
      variables: unknown;
      read_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT id, type, variables, read_at, created_at
         FROM notifications
        WHERE audience = 'merchant' AND merchant_id = $1
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [merchantId, limit],
    );
    return result.rows.map(mapNotification);
  });
}

export async function markMerchantNotificationReadPostgres(merchantIdValue: string, notificationIdValue: string) {
  await assertPostgresRequired();
  const merchantId = text(merchantIdValue);
  const notificationId = text(notificationIdValue);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query<{
      id: string;
      type: string;
      variables: unknown;
      read_at: Date | string | null;
      created_at: Date | string;
    }>(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, now())
        WHERE id = $1 AND audience = 'merchant' AND merchant_id = $2
      RETURNING id, type, variables, read_at, created_at`,
      [notificationId, merchantId],
    );
    if (!result.rows[0]) {
      throw new SupportPostgresError("NOTIFICATION_NOT_FOUND", "notification not found", 404);
    }
    return mapNotification(result.rows[0]);
  });
}

export async function markAllMerchantNotificationsReadPostgres(merchantIdValue: string) {
  await assertPostgresRequired();
  const merchantId = text(merchantIdValue);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const result = await client.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
        WHERE audience = 'merchant' AND merchant_id = $1 AND read_at IS NULL`,
      [merchantId],
    );
    return { updated: Number(result.rowCount || 0) };
  });
}

export async function refreshSupportLifecyclePostgres(now = new Date()) {
  await assertPostgresRequired();
  return withOperationalTransaction(async (client) => {
    const expiredRequests = await client.query<{ id: string; merchant_id: string; ticket_id: string }>(
      `UPDATE support_inspection_requests
          SET status = 'expired', expired_at = now(), ended_at = COALESCE(ended_at, now()),
              end_reason = COALESCE(end_reason, 'request_timeout')
        WHERE status = 'pending' AND request_expires_at <= $1::timestamptz
      RETURNING id, merchant_id, ticket_id`,
      [now.toISOString()],
    );
    const expiredPreviews = await client.query(
      `UPDATE support_preview_sessions
          SET status = 'ended', ended_at = COALESCE(ended_at, $1::timestamptz),
              end_reason = COALESCE(end_reason, 'approval_window_expired'),
              last_seen_at = $1::timestamptz
        WHERE status = 'active' AND expires_at <= $1::timestamptz`,
      [now.toISOString()],
    );

    // Merchant follow-up reminder after 24h; auto-close after 7 days of merchant inactivity.
    const reminderRows = await client.query<{ id: string; merchant_id: string }>(
      `UPDATE support_tickets
          SET merchant_reminder_sent_at = $1::timestamptz, updated_at = updated_at
        WHERE status IN ('open','in_progress')
          AND waiting_on = 'merchant'
          AND waiting_since <= $1::timestamptz - interval '24 hours'
          AND merchant_reminder_sent_at IS NULL
      RETURNING id, merchant_id`,
      [now.toISOString()],
    );
    for (const row of reminderRows.rows) {
      await insertMerchantNotification(client, {
        merchantId: row.merchant_id,
        id: `notification-support-reply-reminder-${row.id}`,
        type: "support_reply_reminder",
        titleKey: "notifications.support_reply_reminder.title",
        bodyKey: "notifications.support_reply_reminder.body",
        variables: {
          ticket_id: row.id,
          action_url: `/dashboard/support?ticket=${encodeURIComponent(row.id)}`,
        },
        sourceEntityType: "support_ticket",
        sourceEntityId: row.id,
      });
    }
    const autoClosed = await client.query<{ id: string }>(
      `UPDATE support_tickets
          SET status = 'closed', closed_at = $1::timestamptz,
              waiting_on = NULL, waiting_since = NULL,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'auto_closed_at', $2::text,
                'auto_closed_reason', 'merchant_inactivity'
              ),
              updated_at = $1::timestamptz
        WHERE status IN ('open','in_progress')
          AND waiting_on = 'merchant'
          AND waiting_since <= $1::timestamptz - interval '7 days'
      RETURNING id`,
      [now.toISOString(), now.toISOString()],
    );
    for (const row of autoClosed.rows) {
      await endActiveInspectionForTicket(client, row.id, "ticket_closed");
    }
    return {
      expired_inspection_requests: expiredRequests.rowCount || 0,
      expired_preview_sessions: expiredPreviews.rowCount || 0,
      merchant_reminders: reminderRows.rowCount || 0,
      auto_closed_tickets: autoClosed.rowCount || 0,
    };
  });
}

export async function createSupportAttachmentMetadataPostgres(input: {
  merchantId: string;
  ticketId: string;
  messageId: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageProvider: string;
  storageKey: string;
}) {
  await assertPostgresRequired();
  const merchantId = text(input.merchantId);
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const message = await client.query<{ id: string }>(
      `SELECT m.id
         FROM support_messages m
         JOIN support_tickets t ON t.id = m.ticket_id
        WHERE m.id = $1 AND m.ticket_id = $2 AND t.merchant_id = $3
        LIMIT 1`,
      [text(input.messageId), text(input.ticketId), merchantId],
    );
    if (!message.rows[0]) {
      throw new SupportPostgresError("SUPPORT_MESSAGE_NOT_FOUND", "support message not found", 404);
    }
    const id = supportId("support-attachment");
    await client.query(
      `INSERT INTO support_attachments
         (id, message_id, ticket_id, merchant_id, kind, original_file_name,
          mime_type, size_bytes, sha256, storage_provider, storage_key, created_at)
       VALUES ($1, $2, $3, $4, 'image', $5, $6, $7, $8, $9, $10, now())`,
      [
        id,
        text(input.messageId),
        text(input.ticketId),
        merchantId,
        text(input.originalFileName) || "support-image",
        text(input.mimeType),
        Math.trunc(input.sizeBytes),
        text(input.sha256),
        text(input.storageProvider),
        text(input.storageKey),
      ],
    );
    return { id, url: `/api/auth/support-images/attachments/${encodeURIComponent(id)}` };
  });
}

export async function getSupportAttachmentPostgres(attachmentIdValue: string) {
  await assertPostgresRequired();
  const pool = await operationalDatabasePool();
  const result = await pool.query<{
    id: string;
    message_id: string;
    ticket_id: string;
    merchant_id: string;
    original_file_name: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
    storage_provider: string;
    storage_key: string;
    deleted_at: Date | string | null;
  }>(
    `SELECT id, message_id, ticket_id, merchant_id, original_file_name,
            mime_type, size_bytes, sha256, storage_provider, storage_key, deleted_at
       FROM support_attachments
      WHERE id = $1
      LIMIT 1`,
    [text(attachmentIdValue)],
  );
  const row = result.rows[0];
  if (!row || row.deleted_at) {
    throw new SupportPostgresError("SUPPORT_ATTACHMENT_NOT_FOUND", "support attachment not found", 404);
  }
  return row;
}
