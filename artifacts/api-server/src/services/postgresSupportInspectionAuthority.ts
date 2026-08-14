import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  withOperationalTransaction,
} from "./operationalPostgresAuthority";
import {
  listAdminSupportTicketsPostgres,
  SupportPostgresError,
} from "./postgresSupportAuthority";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function requiredReason(value: unknown): string {
  const reason = text(value);
  if (reason.length < 5 || reason.length > 500) {
    throw new SupportPostgresError(
      "SUPPORT_INSPECTION_REASON_INVALID",
      "inspection reason must be between 5 and 500 characters",
      400,
    );
  }
  return reason;
}

export async function createInspectionRequestCanonicalPostgres(input: {
  ticketId: string;
  adminId: string;
  reason: unknown;
}) {
  if (!operationalPostgresAuthorityRequired()) {
    throw new SupportPostgresError(
      "SUPPORT_POSTGRES_AUTHORITY_REQUIRED",
      "PostgreSQL support authority is not required",
      503,
    );
  }
  const ticketId = text(input.ticketId);
  const adminId = text(input.adminId);
  const reason = requiredReason(input.reason);
  const requestId = `inspection-request-${crypto.randomUUID()}`;
  const notificationId = `notification-inspection-${requestId}`;

  await withOperationalTransaction(async (client) => {
    const ticketResult = await client.query<{
      merchant_id: string;
      subject: string;
      status: string;
      assigned_admin_account_id: string | null;
    }>(
      `SELECT merchant_id, subject, status, assigned_admin_account_id
         FROM support_tickets
        WHERE id = $1
        FOR UPDATE`,
      [ticketId],
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) {
      throw new SupportPostgresError(
        "SUPPORT_TICKET_NOT_FOUND",
        "support ticket not found",
        404,
      );
    }
    if (ticket.assigned_admin_account_id !== adminId) {
      throw new SupportPostgresError(
        "SUPPORT_TICKET_ADMIN_MISMATCH",
        "support ticket belongs to another administrator",
        403,
      );
    }
    if (ticket.status !== "open" && ticket.status !== "in_progress") {
      throw new SupportPostgresError(
        "SUPPORT_TICKET_NOT_ACTIVE",
        "support ticket is not active",
        409,
      );
    }

    const active = await client.query<{ id: string }>(
      `SELECT id
         FROM support_inspection_requests
        WHERE merchant_id = $1
          AND ((status = 'pending' AND request_expires_at > now())
            OR (status = 'approved' AND ended_at IS NULL
                AND approved_at IS NOT NULL
                AND approved_at + (session_duration_minutes * interval '1 minute') > now()))
        LIMIT 1
        FOR UPDATE`,
      [ticket.merchant_id],
    );
    if (active.rows[0]) {
      throw new SupportPostgresError(
        "SUPPORT_INSPECTION_ALREADY_ACTIVE",
        "merchant already has an active inspection request or session",
        409,
      );
    }

    const adminResult = await client.query<{ display_name: string }>(
      `SELECT display_name FROM admin_profiles
        WHERE id = $1 AND enabled = true
        LIMIT 1`,
      [adminId],
    );
    const adminName = text(adminResult.rows[0]?.display_name) || "Support";

    const created = await client.query<{
      requested_at: Date | string;
      request_expires_at: Date | string;
    }>(
      `INSERT INTO support_inspection_requests
         (id, ticket_id, merchant_id, admin_account_id, mode, reason,
          status, read_only, session_duration_minutes,
          requested_at, request_expires_at)
       VALUES ($1, $2, $3, $4, 'independent_read_only', $5,
               'pending', true, 30, now(), now() + interval '10 minutes')
       RETURNING requested_at, request_expires_at`,
      [requestId, ticketId, ticket.merchant_id, adminId, reason],
    );
    const timestamps = created.rows[0];
    if (!timestamps) {
      throw new SupportPostgresError(
        "SUPPORT_INSPECTION_CREATE_FAILED",
        "inspection request could not be created",
        500,
      );
    }

    await client.query(
      `INSERT INTO notifications
         (id, audience, merchant_id, account_id, type, title_key, body_key,
          variables, source_entity_type, source_entity_id, created_at)
       VALUES ($1, 'merchant', $2, $2, 'inspection_session_request',
               'notifications.inspection_session_request.title',
               'notifications.inspection_session_request.body',
               $3::jsonb, 'support_inspection_request', $4, $5::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        notificationId,
        ticket.merchant_id,
        JSON.stringify({
          ticket_id: ticketId,
          inspection_request_id: requestId,
          ticket_subject: ticket.subject,
          admin_name: adminName,
          mode: "independent_read_only",
          request_expires_at: new Date(timestamps.request_expires_at).toISOString(),
          action_url: `/dashboard/support?ticket=${encodeURIComponent(ticketId)}`,
        }),
        requestId,
        new Date(timestamps.requested_at).toISOString(),
      ],
    );
  });

  const tickets = await listAdminSupportTicketsPostgres();
  const ticket = tickets.find((item) => item.id === ticketId);
  if (!ticket) {
    throw new SupportPostgresError(
      "SUPPORT_TICKET_NOT_FOUND",
      "support ticket not found after inspection request",
      404,
    );
  }
  return ticket;
}
