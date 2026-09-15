import fs from "node:fs";
import path from "node:path";
import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  getAuthContext,
  getSessionToken,
  requireSecureAdminSession,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import { hasAdminPermission } from "../services/authPolicy";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  addAdminSupportMessagePostgres,
  addMerchantSupportMessagePostgres,
  claimSupportTicketPostgres,
  createMerchantSupportTicketPostgres,
  decideInspectionRequestPostgres,
  endSupportPreviewSessionPostgres,
  getMerchantSupportTicketPostgres,
  getSupportAttachmentPostgres,
  listAdminSupportTicketsPostgres,
  listMerchantSupportTicketsPostgres,
  startSupportPreviewSessionPostgres,
  SupportPostgresError,
  terminateInspectionRequestPostgres,
  updateSupportTicketStatusPostgres,
  validateSupportPreviewSessionPostgres,
} from "../services/postgresSupportAuthority";
import { createInspectionRequestCanonicalPostgres } from "../services/postgresSupportInspectionAuthority";
import {
  SUPPORT_IMAGE_DIR,
  SUPPORT_IMAGE_MAX_BYTES,
  saveSupportImagePostgres,
} from "../services/postgresSupportImageAuthority";
import { buildSupportPreviewSnapshotPostgres } from "../services/postgresSupportSnapshot";
import { refreshSupportLifecyclePostgresCanonical } from "../services/postgresSupportLifecycleAuthority";
import {
  listMerchantNotificationsPostgresCanonical,
  markAllMerchantNotificationsReadPostgresCanonical,
  markMerchantNotificationReadPostgresCanonical,
  MerchantNotificationPostgresError,
} from "../services/postgresMerchantNotificationAuthority";

const router = Router();
const rawSupportImage = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: SUPPORT_IMAGE_MAX_BYTES,
});

function postgresOnly(_req: Request, _res: Response, next: NextFunction): void {
  if (!operationalPostgresAuthorityRequired()) {
    next("router");
    return;
  }
  next();
}
router.use(postgresOnly);

function handleError(res: Response, error: unknown): void {
  if (error instanceof SupportPostgresError) {
    sendAuthError(res, error.statusCode, error.code, error.message);
    return;
  }
  if (error instanceof MerchantNotificationPostgresError) {
    sendAuthError(res, error.statusCode, error.code, error.message);
    return;
  }
  console.error("PostgreSQL support operation failed:", error);
  sendAuthError(
    res,
    500,
    "SUPPORT_POSTGRES_FAILURE",
    "support operation failed",
  );
}

function adminViewerAllowed(res: Response): boolean {
  const profile = getAuthContext(res)?.adminProfile;
  if (!profile) return false;
  return (
    profile.role === "owner_admin" ||
    hasAdminPermission(profile.role, profile.permissions, "manage_support")
  );
}

function requireAdminViewer(req: Request, res: Response, next: NextFunction): void {
  requireSecureAdminSession(req, res, () => {
    if (!adminViewerAllowed(res)) {
      sendAuthError(
        res,
        403,
        "ADMIN_PERMISSION_REQUIRED",
        "manage_support permission is required",
        { permission: "manage_support" },
      );
      return;
    }
    next();
  });
}

function requireAssistantSupport(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireSecureAdminSession(req, res, () => {
    const profile = getAuthContext(res)?.adminProfile;
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
    next();
  });
}

function requireAssistantInspection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireAssistantSupport(req, res, () => {
    const profile = getAuthContext(res)?.adminProfile;
    if (
      !profile ||
      !hasAdminPermission(
        profile.role,
        profile.permissions,
        "inspect_merchant_sessions",
      )
    ) {
      sendAuthError(
        res,
        403,
        "ADMIN_PERMISSION_REQUIRED",
        "inspect_merchant_sessions permission is required",
        { permission: "inspect_merchant_sessions" },
      );
      return;
    }
    next();
  });
}

function requireSupportViewer(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (getSessionToken(req, "admin")) {
    requireAdminViewer(req, res, next);
    return;
  }
  requireSecureMerchantSession(req, res, next);
}

function merchantId(res: Response): string {
  return getAuthContext(res)?.merchantProfile?.merchantId || "";
}

async function refreshLifecycle(): Promise<void> {
  await refreshSupportLifecyclePostgresCanonical();
}

router.get(
  "/support/tickets",
  requireSecureMerchantSession,
  async (_req, res) => {
    try {
      await refreshLifecycle();
      res.json({
        ok: true,
        tickets: await listMerchantSupportTicketsPostgres(merchantId(res)),
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/support/tickets",
  requireSecureMerchantSession,
  async (req, res) => {
    try {
      const ticket = await createMerchantSupportTicketPostgres({
        merchantId: merchantId(res),
        subject: req.body?.subject,
        category: req.body?.category,
        message: req.body?.message,
      });
      res.status(201).json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.get(
  "/support/tickets/:id",
  requireSecureMerchantSession,
  async (req, res) => {
    try {
      await refreshLifecycle();
      res.json({
        ok: true,
        ticket: await getMerchantSupportTicketPostgres(
          merchantId(res),
          String(req.params.id || ""),
        ),
      });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/support/tickets/:id/messages",
  requireSecureMerchantSession,
  async (req, res) => {
    try {
      const ticket = await addMerchantSupportMessagePostgres({
        merchantId: merchantId(res),
        ticketId: String(req.params.id || ""),
        body: req.body?.message,
      });
      res.status(201).json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/support/tickets/:id/inspection-requests/:requestId/decision",
  requireSecureMerchantSession,
  async (req, res) => {
    try {
      const decision = String(req.body?.decision || "");
      if (decision !== "approve" && decision !== "reject") {
        throw new SupportPostgresError(
          "SUPPORT_INSPECTION_DECISION_INVALID",
          "inspection decision is invalid",
          400,
        );
      }
      const ticket = await decideInspectionRequestPostgres({
        merchantId: merchantId(res),
        ticketId: String(req.params.id || ""),
        requestId: String(req.params.requestId || ""),
        decision,
      });
      res.json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/support/tickets/:id/inspection-requests/:requestId/terminate",
  requireSecureMerchantSession,
  async (req, res) => {
    try {
      const ticket = await terminateInspectionRequestPostgres({
        merchantId: merchantId(res),
        ticketId: String(req.params.id || ""),
        requestId: String(req.params.requestId || ""),
      });
      res.json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.get("/admin/support/tickets", requireAdminViewer, async (_req, res) => {
  try {
    await refreshLifecycle();
    res.json({ ok: true, tickets: await listAdminSupportTicketsPostgres() });
  } catch (error) {
    handleError(res, error);
  }
});

router.post(
  "/admin/support/tickets/:id/claim",
  requireAssistantSupport,
  async (req, res) => {
    try {
      const ticket = await claimSupportTicketPostgres({
        ticketId: String(req.params.id || ""),
        adminId: getAuthContext(res)?.account.id || "",
      });
      res.json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/admin/support/tickets/:id/messages",
  requireAssistantSupport,
  async (req, res) => {
    try {
      const ticket = await addAdminSupportMessagePostgres({
        ticketId: String(req.params.id || ""),
        adminId: getAuthContext(res)?.account.id || "",
        body: req.body?.message,
      });
      res.status(201).json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.patch(
  "/admin/support/tickets/:id/status",
  requireAssistantSupport,
  async (req, res) => {
    try {
      const ticket = await updateSupportTicketStatusPostgres({
        ticketId: String(req.params.id || ""),
        adminId: getAuthContext(res)?.account.id || "",
        status: req.body?.status,
      });
      res.json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/admin/support/tickets/:id/inspection-requests",
  requireAssistantInspection,
  async (req, res) => {
    try {
      if (String(req.body?.mode || "independent_read_only") !== "independent_read_only") {
        throw new SupportPostgresError(
          "INSPECTION_MODE_UNSUPPORTED",
          "only independent read-only inspection sessions are supported",
          400,
        );
      }
      const ticket = await createInspectionRequestCanonicalPostgres({
        ticketId: String(req.params.id || ""),
        adminId: getAuthContext(res)?.account.id || "",
        reason: req.body?.reason,
      });
      res.status(201).json({ ok: true, ticket });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.post(
  "/admin/support-preview/start",
  requireAssistantInspection,
  async (req, res) => {
    try {
      const context = getAuthContext(res);
      const session = await startSupportPreviewSessionPostgres({
        ticketId: String(req.body?.ticket_id || ""),
        requestId: String(req.body?.request_id || ""),
        adminId: context?.account.id || "",
        adminSessionId: context?.session.id || "",
      });
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ ok: true, session, resumed: false });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.get(
  "/admin/support-preview/:sessionId/snapshot",
  requireAssistantInspection,
  async (req, res) => {
    try {
      const context = getAuthContext(res);
      const session = await validateSupportPreviewSessionPostgres({
        sessionId: String(req.params.sessionId || ""),
        adminId: context?.account.id || "",
        adminSessionId: context?.session.id || "",
        viewedSection: "snapshot",
      });
      const tickets = await listAdminSupportTicketsPostgres();
      const ticket = tickets.find((item) => item.id === session.ticket_id);
      if (!ticket) {
        throw new SupportPostgresError(
          "SUPPORT_TICKET_NOT_FOUND",
          "support ticket not found",
          404,
        );
      }
      const snapshot = await buildSupportPreviewSnapshotPostgres({
        merchantId: session.merchant_id,
        session: {
          id: session.id,
          merchant_name: ticket.merchant_name,
          admin_name: context?.adminProfile?.displayName || "Support",
          started_at: String(session.started_at || ""),
          expires_at: String(session.expires_at || ""),
          status: "active",
        },
        ticket: {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
        },
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, snapshot });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.all(
  "/admin/support-preview/:sessionId/snapshot",
  requireAssistantInspection,
  (req, res) => {
    sendAuthError(res, 403, "SUPPORT_PREVIEW_READ_ONLY", "support preview is read-only", {
      method: req.method,
    });
  },
);

router.post(
  "/admin/support-preview/:sessionId/end",
  requireAssistantInspection,
  async (req, res) => {
    try {
      const context = getAuthContext(res);
      await endSupportPreviewSessionPostgres({
        sessionId: String(req.params.sessionId || ""),
        adminId: context?.account.id || "",
        reason: "admin_terminated",
      });
      res.json({ ok: true });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.get("/notifications", requireSecureMerchantSession, async (req, res) => {
  try {
    await refreshLifecycle();
    const requestedLimit = Number(req.query.limit);
    const notifications = await listMerchantNotificationsPostgresCanonical({
      merchantId: merchantId(res),
      unreadOnly: String(req.query.unread || "") === "1",
      limit: Number.isInteger(requestedLimit) ? requestedLimit : 20,
    });
    res.json({ ok: true, notifications });
  } catch (error) {
    handleError(res, error);
  }
});

router.post(
  "/notifications/read-all",
  requireSecureMerchantSession,
  async (_req, res) => {
    try {
      const updated = await markAllMerchantNotificationsReadPostgresCanonical(
        merchantId(res),
      );
      res.json({ ok: true, updated });
    } catch (error) {
      handleError(res, error);
    }
  },
);

router.patch(
  "/notifications/:id/read",
  requireSecureMerchantSession,
  async (req, res) => {
    try {
      const notification = await markMerchantNotificationReadPostgresCanonical({
        merchantId: merchantId(res),
        notificationId: String(req.params.id || ""),
      });
      res.json({ ok: true, notification });
    } catch (error) {
      handleError(res, error);
    }
  },
);

function safeAttachmentPath(storageKey: string): string | null {
  const parts = String(storageKey || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (
    parts.length !== 2 ||
    parts.some((part) => part === "." || part === ".." || path.basename(part) !== part)
  ) {
    return null;
  }
  return path.join(SUPPORT_IMAGE_DIR, parts[0], parts[1]);
}

router.post(
  "/support-images/tickets/:ticketId/messages",
  requireSupportViewer,
  rawSupportImage,
  async (req, res) => {
    try {
      const context = getAuthContext(res);
      const isAdmin = context?.account.kind === "admin";
      if (isAdmin) {
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
      }
      const ticketId = String(req.params.ticketId || "");
      await saveSupportImagePostgres({
        ticketId,
        buffer: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
        suppliedMime: req.headers["content-type"],
        fileName: req.headers["x-file-name"],
        senderType: isAdmin ? "admin" : "merchant",
        senderAccountId: context?.account.id || "",
        senderName: isAdmin
          ? context?.adminProfile?.displayName || "Support"
          : context?.merchantProfile?.ownerName ||
            context?.merchantProfile?.storeName ||
            "Merchant",
        ...(isAdmin ? {} : { merchantId: merchantId(res) }),
      });
      const ticket = isAdmin
        ? (await listAdminSupportTicketsPostgres()).find((item) => item.id === ticketId)
        : await getMerchantSupportTicketPostgres(merchantId(res), ticketId);
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

router.get(
  "/support-images/attachments/:attachmentId",
  requireSupportViewer,
  async (req, res) => {
    try {
      const attachment = await getSupportAttachmentPostgres(
        String(req.params.attachmentId || ""),
      );
      const context = getAuthContext(res);
      if (
        context?.account.kind !== "admin" &&
        attachment.merchant_id !== merchantId(res)
      ) {
        throw new SupportPostgresError(
          "SUPPORT_IMAGE_NOT_FOUND",
          "support image not found",
          404,
        );
      }
      if (attachment.storage_provider !== "filesystem") {
        throw new SupportPostgresError(
          "SUPPORT_IMAGE_PROVIDER_UNAVAILABLE",
          "support image storage provider is unavailable",
          503,
        );
      }
      const filePath = safeAttachmentPath(attachment.storage_key);
      if (!filePath || !fs.existsSync(filePath)) {
        throw new SupportPostgresError(
          "SUPPORT_IMAGE_NOT_FOUND",
          "support image not found",
          404,
        );
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.type(attachment.mime_type);
      res.sendFile(filePath);
    } catch (error) {
      handleError(res, error);
    }
  },
);

export default router;
