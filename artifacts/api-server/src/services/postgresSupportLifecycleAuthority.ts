import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  withOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";
import { SupportPostgresError } from "./postgresSupportAuthority";

function durationMs(envName: string, fallbackMinutes: number): number {
  const configured = Number(process.env[envName]);
  const minutes = Number.isFinite(configured) && configured > 0
    ? configured
    : fallbackMinutes;
  return minutes * 60 * 1000;
}

export const SUPPORT_ASSISTANT_REMINDER_MS = durationMs(
  "SUPPORT_ASSISTANT_REMINDER_MINUTES",
  24 * 60,
);
export const SUPPORT_OWNER_ESCALATION_MS = durationMs(
  "SUPPORT_OWNER_ESCALATION_MINUTES",
  48 * 60,
);
export const SUPPORT_MERCHANT_REMINDER_MS = durationMs(
  "SUPPORT_MERCHANT_REMINDER_MINUTES",
  24 * 60,
);
export const SUPPORT_MERCHANT_AUTO_CLOSE_MS = durationMs(
  "SUPPORT_AUTO_CLOSE_MINUTES",
  72 * 60,
);
export const SUPPORT_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;

function deterministicId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${crypto
    .createHash("sha256")
    .update(parts.join(":"))
    .digest("hex")}`;
}

function autoCloseMessage(language: string): { sender: string; body: string } {
  if (language === "en") {
    return {
      sender: "Fawri",
      body: "This ticket was closed automatically because no merchant reply was received for 72 hours. You can open a new ticket if the issue continues.",
    };
  }
  if (language === "ku") {
    return {
      sender: "فورى",
      body: "ئەم تیکێتە خۆکارانە داخرا، چونکە بۆ ماوەی ٧٢ کاتژمێر هیچ وەڵامێک لە بازرگانەوە نەگەیشت. ئەگەر کێشەکە بەردەوامە دەتوانیت تیکێتێکی نوێ بکەیتەوە.",
    };
  }
  return {
    sender: "فوري",
    body: "تم إغلاق هذه التذكرة تلقائيًا لعدم ورود رد من التاجر خلال 72 ساعة. يمكنك فتح تذكرة جديدة إذا استمرت المشكلة.",
  };
}

async function insertAudit(
  target: OperationalQueryTarget,
  input: {
    merchantId: string;
    ticketId: string;
    actionType: string;
    details: string;
    createdAt: string;
  },
): Promise<void> {
  const id = deterministicId(
    "audit",
    input.actionType,
    input.ticketId,
    input.createdAt,
  );
  await target.query(
    `INSERT INTO audit_events
       (id, actor_kind, merchant_id, action_type, entity_type, entity_id,
        details, metadata, created_at)
     VALUES ($1, 'system', $2, $3, 'support_ticket', $4, $5,
             jsonb_build_object('ticket_id', $4::text), $6::timestamptz)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      input.merchantId,
      input.actionType,
      input.ticketId,
      input.details,
      input.createdAt,
    ],
  );
}

async function insertMerchantNotification(
  target: OperationalQueryTarget,
  input: {
    id: string;
    merchantId: string;
    type: string;
    variables: Record<string, string | number | boolean | null>;
    sourceEntityType: string;
    sourceEntityId: string;
    createdAt: string;
  },
): Promise<void> {
  await target.query(
    `INSERT INTO notifications
       (id, audience, merchant_id, account_id, type, title_key, body_key,
        variables, source_entity_type, source_entity_id, created_at)
     VALUES ($1, 'merchant', $2,
             (SELECT account_id FROM merchants WHERE id = $2),
             $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz)
     ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      input.merchantId,
      input.type,
      `notifications.${input.type}.title`,
      `notifications.${input.type}.body`,
      JSON.stringify(input.variables),
      input.sourceEntityType,
      input.sourceEntityId,
      input.createdAt,
    ],
  );
}

async function closeInspectionForTicket(
  target: OperationalQueryTarget,
  ticketId: string,
  nowIso: string,
): Promise<void> {
  await target.query(
    `UPDATE support_inspection_requests
        SET ended_at = COALESCE(ended_at, $2::timestamptz),
            end_reason = COALESCE(end_reason, 'ticket_closed')
      WHERE ticket_id = $1 AND ended_at IS NULL`,
    [ticketId, nowIso],
  );
  await target.query(
    `UPDATE support_preview_sessions
        SET status = 'ended', ended_at = COALESCE(ended_at, $2::timestamptz),
            end_reason = COALESCE(end_reason, 'ticket_closed'),
            last_seen_at = $2::timestamptz
      WHERE ticket_id = $1 AND status = 'active'`,
    [ticketId, nowIso],
  );
}

export async function refreshSupportLifecyclePostgresCanonical(now = new Date()) {
  if (!operationalPostgresAuthorityRequired()) {
    throw new SupportPostgresError(
      "SUPPORT_POSTGRES_AUTHORITY_REQUIRED",
      "PostgreSQL support authority is not required",
      503,
    );
  }
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  return withOperationalTransaction(async (client) => {
    const expiredPending = await client.query(
      `UPDATE support_inspection_requests
          SET status = 'expired', expired_at = $1::timestamptz,
              ended_at = COALESCE(ended_at, $1::timestamptz),
              end_reason = COALESCE(end_reason, 'request_timeout')
        WHERE status = 'pending' AND request_expires_at <= $1::timestamptz`,
      [nowIso],
    );
    const expiredApproved = await client.query(
      `UPDATE support_inspection_requests
          SET ended_at = COALESCE(ended_at, $1::timestamptz),
              end_reason = COALESCE(end_reason, 'approval_window_expired')
        WHERE status = 'approved' AND ended_at IS NULL
          AND approved_at IS NOT NULL
          AND approved_at + (session_duration_minutes * interval '1 minute') <= $1::timestamptz`,
      [nowIso],
    );
    const expiredPreviews = await client.query(
      `UPDATE support_preview_sessions
          SET status = 'ended', ended_at = COALESCE(ended_at, $1::timestamptz),
              end_reason = COALESCE(end_reason, 'approval_window_expired'),
              last_seen_at = $1::timestamptz
        WHERE status = 'active' AND expires_at <= $1::timestamptz`,
      [nowIso],
    );

    const active = await client.query<{
      id: string;
      merchant_id: string;
      subject: string;
      waiting_on: "admin" | "merchant" | null;
      waiting_since: Date | string | null;
      updated_at: Date | string;
      merchant_reminder_sent_at: Date | string | null;
      assistant_reminder_sent_at: Date | string | null;
      owner_escalated_at: Date | string | null;
      language: string;
    }>(
      `SELECT t.id, t.merchant_id, t.subject, t.waiting_on, t.waiting_since,
              t.updated_at, t.merchant_reminder_sent_at,
              t.assistant_reminder_sent_at, t.owner_escalated_at, a.language
         FROM support_tickets t
         JOIN merchants m ON m.id = t.merchant_id
         JOIN accounts a ON a.id = m.account_id
        WHERE t.status IN ('open','in_progress')
        ORDER BY t.id
        FOR UPDATE OF t`,
    );

    let merchantReminders = 0;
    let assistantReminders = 0;
    let ownerEscalations = 0;
    let autoClosed = 0;

    for (const ticket of active.rows) {
      const waitingSince = new Date(ticket.waiting_since || ticket.updated_at);
      if (!Number.isFinite(waitingSince.getTime())) continue;
      const elapsed = nowMs - waitingSince.getTime();

      if (ticket.waiting_on === "merchant") {
        if (
          !ticket.merchant_reminder_sent_at &&
          elapsed >= SUPPORT_MERCHANT_REMINDER_MS
        ) {
          await insertMerchantNotification(client, {
            id: deterministicId(
              "notification-support-reply-reminder",
              ticket.id,
              waitingSince.toISOString(),
            ),
            merchantId: ticket.merchant_id,
            type: "support_reply_reminder",
            variables: {
              ticket_id: ticket.id,
              ticket_subject: ticket.subject,
              action_url: `/dashboard/support?ticket=${encodeURIComponent(ticket.id)}`,
            },
            sourceEntityType: "support_ticket",
            sourceEntityId: ticket.id,
            createdAt: nowIso,
          });
          await client.query(
            `UPDATE support_tickets
                SET merchant_reminder_sent_at = $2::timestamptz
              WHERE id = $1`,
            [ticket.id, nowIso],
          );
          merchantReminders += 1;
        }

        if (elapsed >= SUPPORT_MERCHANT_AUTO_CLOSE_MS) {
          const localized = autoCloseMessage(ticket.language);
          const messageId = deterministicId(
            "support-message-auto-close",
            ticket.id,
            waitingSince.toISOString(),
          );
          await client.query(
            `INSERT INTO support_messages
               (id, ticket_id, merchant_id, sender_type, sender_account_id,
                sender_name_snapshot, body, created_at)
             VALUES ($1, $2, $3, 'system', NULL, $4, $5, $6::timestamptz)
             ON CONFLICT (id) DO NOTHING`,
            [
              messageId,
              ticket.id,
              ticket.merchant_id,
              localized.sender,
              localized.body,
              nowIso,
            ],
          );
          await client.query(
            `UPDATE support_tickets
                SET status = 'closed', closed_at = $2::timestamptz,
                    waiting_on = NULL, waiting_since = NULL,
                    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                      'auto_closed_at', $3::text,
                      'auto_closed_reason', 'merchant_inactivity'
                    ),
                    updated_at = $2::timestamptz
              WHERE id = $1`,
            [ticket.id, nowIso, nowIso],
          );
          await client.query(
            `UPDATE notifications
                SET read_at = COALESCE(read_at, $3::timestamptz)
              WHERE audience = 'merchant' AND merchant_id = $1
                AND type = 'support_reply_reminder'
                AND source_entity_type = 'support_ticket'
                AND source_entity_id = $2 AND read_at IS NULL`,
            [ticket.merchant_id, ticket.id, nowIso],
          );
          await closeInspectionForTicket(client, ticket.id, nowIso);
          await insertAudit(client, {
            merchantId: ticket.merchant_id,
            ticketId: ticket.id,
            actionType: "support_ticket_auto_closed_merchant_inactivity",
            details: "Ticket auto-closed after 72 hours without a merchant reply",
            createdAt: nowIso,
          });
          autoClosed += 1;
        }
        continue;
      }

      if (
        !ticket.assistant_reminder_sent_at &&
        elapsed >= SUPPORT_ASSISTANT_REMINDER_MS
      ) {
        await client.query(
          `UPDATE support_tickets
              SET assistant_reminder_sent_at = $2::timestamptz
            WHERE id = $1`,
          [ticket.id, nowIso],
        );
        assistantReminders += 1;
      }

      if (
        !ticket.owner_escalated_at &&
        elapsed >= SUPPORT_OWNER_ESCALATION_MS
      ) {
        await client.query(
          `UPDATE support_tickets
              SET owner_escalated_at = $2::timestamptz
            WHERE id = $1`,
          [ticket.id, nowIso],
        );
        await insertAudit(client, {
          merchantId: ticket.merchant_id,
          ticketId: ticket.id,
          actionType: "support_ticket_owner_escalated",
          details: "Ticket escalated to the owner because the merchant is still waiting for support",
          createdAt: nowIso,
        });
        ownerEscalations += 1;
      }
    }

    return {
      expired_inspection_requests:
        Number(expiredPending.rowCount || 0) + Number(expiredApproved.rowCount || 0),
      expired_preview_sessions: Number(expiredPreviews.rowCount || 0),
      merchant_reminders: merchantReminders,
      assistant_reminders: assistantReminders,
      owner_escalations: ownerEscalations,
      auto_closed_tickets: autoClosed,
    };
  });
}
