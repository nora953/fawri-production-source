import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminSession,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import { hasAdminPermission } from "../services/authPolicy";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
} from "../services/operationalPostgresAuthority";
import {
  addAdminSupportMessagePostgres,
  addMerchantSupportMessagePostgres,
  getMerchantSupportTicketPostgres,
  listAdminSupportTicketsPostgres,
  SupportPostgresError,
} from "../services/postgresSupportAuthority";

const router = Router();

router.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!operationalPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
});

function handleError(res: Response, error: unknown): void {
  if (error instanceof SupportPostgresError) {
    sendAuthError(res, error.statusCode, error.code, error.message);
    return;
  }
  console.error("PostgreSQL support message operation failed:", error);
  sendAuthError(res, 500, "SUPPORT_POSTGRES_FAILURE", "support operation failed");
}

router.post(
  "/support/tickets/:id/messages",
  requireSecureMerchantSession,
  async (req, res) => {
    try {
      const context = getAuthContext(res);
      const merchantId = context?.merchantProfile?.merchantId || "";
      const ticketId = String(req.params.id || "");
      await addMerchantSupportMessagePostgres({
        merchantId,
        ticketId,
        body: req.body?.message,
      });
      const pool = await operationalDatabasePool();
      await pool.query(
        `UPDATE support_tickets
            SET merchant_reminder_sent_at = NULL
          WHERE id = $1 AND merchant_id = $2`,
        [ticketId, merchantId],
      );
      const ticket = await getMerchantSupportTicketPostgres(merchantId, ticketId);
      res.status(201).json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/admin/support/tickets/:id/messages",
  requireSecureAdminSession,
  async (req, res) => {
    try {
      const context = getAuthContext(res);
      const profile = context?.adminProfile;
      if (
        profile?.role !== "assistant_admin" ||
        !hasAdminPermission(profile.role, profile.permissions, "manage_support")
      ) {
        sendAuthError(
          res,
          403,
          "ASSISTANT_SUPPORT_REQUIRED",
          "assistant administrator with manage_support permission is required",
        );
        return;
      }
      const ticketId = String(req.params.id || "");
      await addAdminSupportMessagePostgres({
        ticketId,
        adminId: context?.account.id || "",
        body: req.body?.message,
      });
      const pool = await operationalDatabasePool();
      await pool.query(
        `UPDATE support_tickets
            SET assistant_reminder_sent_at = NULL,
                owner_escalated_at = NULL
          WHERE id = $1`,
        [ticketId],
      );
      const ticket = (await listAdminSupportTicketsPostgres()).find(
        (item) => item.id === ticketId,
      );
      if (!ticket) {
        throw new SupportPostgresError(
          "SUPPORT_TICKET_NOT_FOUND",
          "support ticket not found",
          404,
        );
      }
      res.status(201).json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

export default router;
