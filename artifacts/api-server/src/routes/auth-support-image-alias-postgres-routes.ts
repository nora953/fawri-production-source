import express, { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminSession,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import { hasAdminPermission } from "../services/authPolicy";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  getMerchantSupportTicketPostgres,
  listAdminSupportTicketsPostgres,
  SupportPostgresError,
} from "../services/postgresSupportAuthority";
import {
  SUPPORT_IMAGE_MAX_BYTES,
  saveSupportImagePostgres,
} from "../services/postgresSupportImageAuthority";

const router = Router();
const rawSupportImage = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: SUPPORT_IMAGE_MAX_BYTES,
});

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
  console.error("PostgreSQL support image operation failed:", error);
  sendAuthError(res, 500, "SUPPORT_IMAGE_SAVE_FAILED", "could not save support image");
}

router.post(
  "/support-images/merchant/tickets/:ticketId/messages",
  requireSecureMerchantSession,
  rawSupportImage,
  async (req, res) => {
    try {
      const context = getAuthContext(res);
      const merchantId = context?.merchantProfile?.merchantId || "";
      const ticketId = String(req.params.ticketId || "");
      await saveSupportImagePostgres({
        ticketId,
        buffer: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
        suppliedMime: req.headers["content-type"],
        fileName: req.headers["x-file-name"],
        senderType: "merchant",
        senderAccountId: context?.account.id || "",
        senderName:
          context?.merchantProfile?.storeName ||
          context?.merchantProfile?.ownerName ||
          "Merchant",
        merchantId,
      });
      const ticket = await getMerchantSupportTicketPostgres(merchantId, ticketId);
      res.status(201).json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/support-images/admin/tickets/:ticketId/messages",
  requireSecureAdminSession,
  rawSupportImage,
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
      const ticketId = String(req.params.ticketId || "");
      await saveSupportImagePostgres({
        ticketId,
        buffer: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
        suppliedMime: req.headers["content-type"],
        fileName: req.headers["x-file-name"],
        senderType: "admin",
        senderAccountId: context?.account.id || "",
        senderName: profile.displayName || "Support",
      });
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
