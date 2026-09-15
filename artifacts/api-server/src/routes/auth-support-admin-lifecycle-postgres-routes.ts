import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminSession,
  sendAuthError,
} from "../middleware/authSession";
import { hasAdminPermission } from "../services/authPolicy";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
} from "../services/operationalPostgresAuthority";
import { listAdminSupportTicketsPostgres } from "../services/postgresSupportAuthority";
import { refreshSupportLifecyclePostgresCanonical } from "../services/postgresSupportLifecycleAuthority";

const router = Router();

router.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!operationalPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
});

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

router.get(
  "/admin/support/tickets",
  requireSecureAdminSession,
  async (_req, res) => {
    try {
      const profile = getAuthContext(res)?.adminProfile;
      if (
        !profile ||
        (profile.role !== "owner_admin" &&
          !hasAdminPermission(profile.role, profile.permissions, "manage_support"))
      ) {
        sendAuthError(
          res,
          403,
          "ADMIN_PERMISSION_REQUIRED",
          "manage_support permission is required",
          { permission: "manage_support" },
        );
        return;
      }

      await refreshSupportLifecyclePostgresCanonical();
      const tickets = await listAdminSupportTicketsPostgres();
      const pool = await operationalDatabasePool();
      const lifecycle = await pool.query<{
        id: string;
        assistant_reminder_sent_at: Date | string | null;
        owner_escalated_at: Date | string | null;
      }>(
        `SELECT id, assistant_reminder_sent_at, owner_escalated_at
           FROM support_tickets`,
      );
      const byId = new Map(lifecycle.rows.map((row) => [row.id, row]));
      const hydrated = tickets.map((ticket) => {
        const row = byId.get(ticket.id);
        const assistantReminder = iso(row?.assistant_reminder_sent_at);
        const ownerEscalated = iso(row?.owner_escalated_at);
        return {
          ...ticket,
          ...(assistantReminder
            ? { assistant_reminder_sent_at: assistantReminder }
            : {}),
          ...(ownerEscalated ? { owner_escalated_at: ownerEscalated } : {}),
        };
      });
      res.json({ ok: true, tickets: hydrated });
    } catch (error) {
      console.error("PostgreSQL support lifecycle view failed:", error);
      sendAuthError(
        res,
        500,
        "SUPPORT_POSTGRES_FAILURE",
        "support operation failed",
      );
    }
  },
);

export default router;
