import { Router, type NextFunction, type Request, type Response } from "express";
import {
  getAuthContext,
  requireSecureAdminSession,
  sendAuthError,
} from "../middleware/authSession";
import {
  hasAdminPermission,
  type AdminPermission,
} from "../services/authPolicy";
import { adminAuthPostgresCutoverMode } from "../services/adminAuthPostgresCutover";
import {
  appendMerchantAdminLogPostgres,
  merchantAdminLogActionAllowed,
} from "../services/postgresMerchantAdminLogAuthority";
import {
  completeMerchantDeletionPostgres,
  createDeletionRequestPostgres,
  getMerchantAdminNotePostgres,
  importLegacyAdminDataPostgres,
  listAdminLogsPostgres,
  listDeletionRequestsPostgres,
  listManagedMerchantsPostgres,
  listMerchantChannelOverridesPostgres,
  MerchantManagementError,
  rejectDeletionRequestPostgres,
  setMerchantAdminNotePostgres,
  setMerchantChannelOverridePostgres,
  updateMerchantStatusPostgres,
  type ManagedMerchantStatus,
} from "../services/postgresMerchantManagementAuthority";
import { findAdminByIdAuthoritative } from "../services/postgresAdminAccountAuthority";
import { verifyPassword } from "../services/authPasswordService";

const router = Router();

function isManagedSurface(path: string): boolean {
  return (
    path === "/merchants" ||
    path.startsWith("/merchants/") ||
    path === "/admin/deletion-requests" ||
    path.startsWith("/admin/deletion-requests/") ||
    path === "/admin/local-data-migration" ||
    path === "/admin/logs" ||
    path === "/admin/channels"
  );
}

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!isManagedSurface(String(req.path || ""))) {
    next("router");
    return;
  }
  const mode = adminAuthPostgresCutoverMode();
  if (mode === "legacy") {
    next("router");
    return;
  }
  if (mode === "incomplete") {
    sendAuthError(
      res,
      503,
      "AUTH_POSTGRES_CUTOVER_INCOMPLETE",
      "administrator merchant-management PostgreSQL authority is incomplete",
    );
    return;
  }
  next();
});

function handleManagementError(res: Response, error: unknown): void {
  if (error instanceof MerchantManagementError) {
    sendAuthError(res, error.statusCode, error.code, error.message);
    return;
  }
  console.error("PostgreSQL merchant management failed:", error);
  sendAuthError(
    res,
    500,
    "MERCHANT_MANAGEMENT_FAILURE",
    "merchant management operation failed",
  );
}

function requirePermission(
  res: Response,
  permission: AdminPermission,
): ReturnType<typeof getAuthContext> {
  const context = getAuthContext(res);
  const profile = context?.adminProfile;
  if (
    !profile ||
    !hasAdminPermission(profile.role, profile.permissions, permission)
  ) {
    sendAuthError(
      res,
      403,
      "ADMIN_PERMISSION_REQUIRED",
      "admin permission is required",
      { permission },
    );
    return null;
  }
  return context;
}

function requireAnyPermission(
  res: Response,
  permissions: readonly AdminPermission[],
): ReturnType<typeof getAuthContext> {
  const context = getAuthContext(res);
  const profile = context?.adminProfile;
  if (
    !profile ||
    !permissions.some((permission) =>
      hasAdminPermission(profile.role, profile.permissions, permission),
    )
  ) {
    sendAuthError(
      res,
      403,
      "ADMIN_PERMISSION_REQUIRED",
      "admin permission is required",
      { permissions },
    );
    return null;
  }
  return context;
}

function requireOwner(res: Response): ReturnType<typeof getAuthContext> {
  const context = getAuthContext(res);
  if (context?.adminProfile?.role !== "owner_admin") {
    sendAuthError(
      res,
      403,
      "OWNER_ADMIN_REQUIRED",
      "owner administrator is required",
    );
    return null;
  }
  return context;
}

function requireAssistant(res: Response): ReturnType<typeof getAuthContext> {
  const context = getAuthContext(res);
  if (context?.adminProfile?.role !== "assistant_admin") {
    sendAuthError(
      res,
      403,
      "ASSISTANT_ADMIN_REQUIRED",
      "only an assistant administrator can submit a deletion request",
    );
    return null;
  }
  return context;
}

const MERCHANT_VIEW_PERMISSIONS: readonly AdminPermission[] = [
  "view_merchants",
  "manage_merchant_status",
  "manage_subscriptions",
  "manage_channels",
  "inspect_merchant_sessions",
];

router.get("/merchants", requireSecureAdminSession, async (_req, res) => {
  if (!requireAnyPermission(res, MERCHANT_VIEW_PERMISSIONS)) return;
  try {
    res.json({ ok: true, merchants: await listManagedMerchantsPostgres() });
  } catch (error) {
    handleManagementError(res, error);
  }
});

router.get(
  "/merchants/:id/note",
  requireSecureAdminSession,
  async (req, res) => {
    if (!requirePermission(res, "manage_merchant_status")) return;
    const merchantId = String(req.params.id || "").trim();
    try {
      res.json({
        ok: true,
        merchant_id: merchantId,
        note: await getMerchantAdminNotePostgres(merchantId),
      });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

router.put(
  "/merchants/:id/note",
  requireSecureAdminSession,
  async (req, res) => {
    const context = requirePermission(res, "manage_merchant_status");
    if (!context) return;
    const merchantId = String(req.params.id || "").trim();
    try {
      const note = await setMerchantAdminNotePostgres({
        merchantId,
        note: String(req.body?.note || ""),
        actorAdminId: context.account.id,
      });
      res.json({ ok: true, merchant_id: merchantId, note });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

router.patch(
  "/merchants/:id/status",
  requireSecureAdminSession,
  async (req, res) => {
    const context = requirePermission(res, "manage_merchant_status");
    if (!context) return;
    const status = String(req.body?.status || "").trim() as ManagedMerchantStatus;
    try {
      const merchant = await updateMerchantStatusPostgres({
        merchantId: String(req.params.id || "").trim(),
        status,
        reason: String(req.body?.reason || ""),
        actorAdminId: context.account.id,
      });
      res.json({ ok: true, merchant });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

router.get(
  "/admin/deletion-requests",
  requireSecureAdminSession,
  async (_req, res) => {
    const context = getAuthContext(res);
    const profile = context?.adminProfile;
    if (
      !profile ||
      (profile.role !== "owner_admin" &&
        !hasAdminPermission(
          profile.role,
          profile.permissions,
          "manage_merchant_status",
        ))
    ) {
      sendAuthError(
        res,
        403,
        "ADMIN_PERMISSION_REQUIRED",
        "admin permission is required",
        { permission: "manage_merchant_status" },
      );
      return;
    }
    try {
      res.json({
        ok: true,
        deletion_requests: await listDeletionRequestsPostgres(),
      });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

router.post(
  "/merchants/:id/deletion-requests",
  requireSecureAdminSession,
  async (req, res) => {
    const permissionContext = requirePermission(res, "manage_merchant_status");
    if (!permissionContext || !requireAssistant(res)) return;
    try {
      const deletionRequest = await createDeletionRequestPostgres({
        merchantId: String(req.params.id || "").trim(),
        reason: String(req.body?.reason || "").trim() as
          | "policy_violation"
          | "retention_expired",
        details: String(req.body?.details || ""),
        actorAdminId: permissionContext.account.id,
      });
      res.status(201).json({ ok: true, deletion_request: deletionRequest });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

router.post(
  "/admin/deletion-requests/:requestId/reject",
  requireSecureAdminSession,
  async (req, res) => {
    const owner = requireOwner(res);
    if (!owner) return;
    try {
      const deletionRequest = await rejectDeletionRequestPostgres({
        requestId: String(req.params.requestId || "").trim(),
        actorAdminId: owner.account.id,
      });
      res.json({ ok: true, deletion_request: deletionRequest });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

async function ownerPasswordValid(
  ownerId: string,
  password: string,
): Promise<boolean> {
  const owner = await findAdminByIdAuthoritative(ownerId);
  return Boolean(
    password &&
      owner?.adminProfile?.role === "owner_admin" &&
      verifyPassword(password, owner.account.passwordHash),
  );
}

router.post(
  "/merchants/:id/delete",
  requireSecureAdminSession,
  async (req, res) => {
    const owner = requireOwner(res);
    if (!owner) return;
    const merchantId = String(req.params.id || "").trim();
    const adminId = String(req.body?.adminId || "").trim();
    const adminPassword = String(req.body?.adminPassword || "");
    const deletionRequestId = String(req.body?.deletionRequestId || "").trim();
    if (!merchantId || !adminId || !adminPassword || !deletionRequestId) {
      sendAuthError(
        res,
        400,
        "MERCHANT_DELETION_INPUT_REQUIRED",
        "merchantId, adminId, adminPassword, and deletionRequestId are required",
      );
      return;
    }
    if (
      adminId !== owner.account.id ||
      !(await ownerPasswordValid(owner.account.id, adminPassword))
    ) {
      sendAuthError(
        res,
        401,
        "ADMIN_CREDENTIALS_INCORRECT",
        "admin credentials are incorrect",
      );
      return;
    }
    try {
      const result = await completeMerchantDeletionPostgres({
        merchantId,
        deletionRequestId,
        actorAdminId: owner.account.id,
      });
      res.json({
        ok: true,
        deletedMerchantId: result.deletedMerchantId,
        deletion_request: result.deletionRequest,
      });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

router.post(
  "/admin/local-data-migration",
  requireSecureAdminSession,
  async (req, res) => {
    const owner = requireOwner(res);
    if (!owner) return;
    const notes =
      req.body?.notes &&
      typeof req.body.notes === "object" &&
      !Array.isArray(req.body.notes)
        ? (req.body.notes as Record<string, unknown>)
        : {};
    const channelOverrides =
      req.body?.channel_overrides &&
      typeof req.body.channel_overrides === "object" &&
      !Array.isArray(req.body.channel_overrides)
        ? (req.body.channel_overrides as Record<string, unknown>)
        : {};
    try {
      const imported = await importLegacyAdminDataPostgres({
        actorAdminId: owner.account.id,
        logs: Array.isArray(req.body?.logs) ? req.body.logs : [],
        notes,
        channelOverrides,
      });
      res.json({ ok: true, imported });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

router.get("/admin/logs", requireSecureAdminSession, async (_req, res) => {
  if (!requirePermission(res, "view_logs")) return;
  try {
    res.json({ ok: true, logs: await listAdminLogsPostgres(1000) });
  } catch (error) {
    handleManagementError(res, error);
  }
});

router.post("/admin/logs", requireSecureAdminSession, async (req, res) => {
  const context = requirePermission(res, "manage_subscriptions");
  if (!context) return;
  const actionType = String(req.body?.action_type || "").trim();
  if (!merchantAdminLogActionAllowed(actionType)) {
    sendAuthError(res, 400, "ADMIN_LOG_ACTION_INVALID", "invalid admin log action");
    return;
  }
  const rawMeta = req.body?.meta;
  const meta =
    rawMeta && typeof rawMeta === "object" && !Array.isArray(rawMeta)
      ? Object.fromEntries(
          Object.entries(rawMeta as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" || typeof value === "number")
            .map(([key, value]) => [key, value as string | number]),
        )
      : undefined;
  try {
    const log = await appendMerchantAdminLogPostgres({
      actorAdminId: context.account.id,
      merchantId: String(req.body?.merchant_id || "").trim(),
      actionType,
      details: String(req.body?.details || ""),
      reason: String(req.body?.reason || ""),
      ...(meta ? { meta } : {}),
    });
    res.status(201).json({ ok: true, log });
  } catch (error) {
    handleManagementError(res, error);
  }
});

router.get("/admin/channels", requireSecureAdminSession, async (_req, res) => {
  if (!requirePermission(res, "manage_channels")) return;
  try {
    res.json({
      ok: true,
      channel_overrides: await listMerchantChannelOverridesPostgres(),
    });
  } catch (error) {
    handleManagementError(res, error);
  }
});

router.patch(
  "/merchants/:id/channels/:platform",
  requireSecureAdminSession,
  async (req, res) => {
    const context = requirePermission(res, "manage_channels");
    if (!context) return;
    const merchantId = String(req.params.id || "").trim();
    const platform = String(req.params.platform || "").trim();
    const status = String(req.body?.status || "").trim();
    try {
      await setMerchantChannelOverridePostgres({
        merchantId,
        platform,
        status,
        actorAdminId: context.account.id,
      });
      res.json({ ok: true, merchant_id: merchantId, platform, status });
    } catch (error) {
      handleManagementError(res, error);
    }
  },
);

export default router;
