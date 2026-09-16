import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import crypto from "node:crypto";
import {
  calculateRetentionStatus,
  deleteMerchant,
  MerchantDeleteReason,
  MerchantRetentionStatus,
} from "../services/merchantLifecycle";
import { registerMerchantAuthDeletion } from "../services/merchantAuthData";
import {
  registerMerchantRetentionUpdate,
  startMerchantRetentionScheduler,
} from "../services/merchantRetentionScheduler";
import {
  AdminManagementError,
  createAssistantAdmin,
  listAdmins,
  setAssistantAdminEnabled,
  updateAssistantAdminPermissions,
  registerAdminManagement,
  type AdminSummary,
} from "../services/adminManagement";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/passwordService";
import {
  AdminWorkMonitorError,
  adminDeviceSecurityEnforced,
  approveAdminTrustedDevice,
  createAdminTrackedSession,
  getAdminCardSecuritySummary,
  getAdminWorkMonitor,
  isAdminDeviceTrusted,
  normalizeAdminDeviceId,
  recordAdminFailedLogin,
  registerAdminDeviceAttempt,
  revokeAdminTrackedSession,
  revokeAdminTrustedDevice,
  revokeAllAdminTrackedSessions,
  touchAdminTrackedSession,
  validateAdminTrackedSession,
  type AdminTrackedSession,
} from "../services/adminWorkMonitor";
import './authRoutesPart1';
import { appendAdminLog, appendMerchantInspectionNotification, createAdminSessionToken, createAssistantTrackedSession, emitMerchantRealtimeState, ensureDb, findRegularMerchant, getBearerToken, hasActiveInspectionRequest, isAdminPermission, isAdminRole, isAssistantAdmin, isChannelPlatform, isChannelStatus, isInspectionSessionMode, makeId, now, publicMerchant, refreshInspectionRequestExpirations, requireAdminPermission, requireAdminSession, requireAnyAdminPermission, requireInspectionSupportAssistant, requireOwner, requireOwnerPassword, requireSupportAssistant, revokeAdminSessions, router, sendAdminWorkMonitorError, sendError, setSupportTicketWaitingOn, toAdminSummary, verifyAdminSessionToken, writeDb } from './authRuntime';
import type { AdminPermission, InspectionSessionMode, InspectionSessionRequestRecord, SupportTicketMessage, SupportTicketStatus } from './authRuntime';

router.post(
  "/admin/support/tickets/:id/messages",
  (req: Request, res: Response) => {
    const admin = requireSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const body = String(req.body?.message || "").trim();
    const db = ensureDb();
    const ticket = db.support_tickets.find((item) => item.id === ticketId);

    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status === "resolved" || ticket.status === "closed") {
      return sendError(res, 409, "support ticket is closed");
    }
    if (!ticket.assigned_admin_id) {
      return sendError(res, 409, "support ticket must be claimed first", {
        code: "SUPPORT_TICKET_NOT_CLAIMED",
      });
    }
    if (ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 403, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ASSIGNED_TO_ANOTHER_ADMIN",
      });
    }
    if (body.length < 1 || body.length > 4000) {
      return sendError(res, 400, "invalid support message");
    }

    const message: SupportTicketMessage = {
      id: makeId("support-message"),
      sender_type: "admin",
      sender_id: admin.id,
      sender_name: admin.owner_name,
      body,
      created_at: now(),
    };
    ticket.messages.push(message);
    ticket.status = "in_progress";
    ticket.updated_at = message.created_at;
    setSupportTicketWaitingOn(ticket, "merchant", message.created_at);

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      "support_ticket_replied",
      ticket.subject,
      { meta: { ticket_id: ticket.id, subject: ticket.subject } },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    return res.status(201).json({ ok: true, ticket, message });
  },
);

router.post(
  "/admin/support/tickets/:id/inspection-requests",
  (req: Request, res: Response) => {
    const admin = requireInspectionSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const mode = String(req.body?.mode || "").trim() as InspectionSessionMode;
    const reason = String(req.body?.reason || "").trim();
    const db = ensureDb();
    refreshInspectionRequestExpirations(db);

    const ticket = db.support_tickets.find((item) => item.id === ticketId);
    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status !== "open" && ticket.status !== "in_progress") {
      return sendError(res, 409, "inspection request requires an active support ticket", {
        code: "INSPECTION_ACTIVE_TICKET_REQUIRED",
      });
    }
    if (!ticket.assigned_admin_id) {
      return sendError(res, 409, "support ticket must be claimed first", {
        code: "SUPPORT_TICKET_NOT_CLAIMED",
      });
    }
    if (ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 403, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ASSIGNED_TO_ANOTHER_ADMIN",
      });
    }
    if (!isInspectionSessionMode(mode)) {
      return sendError(res, 400, "invalid inspection session mode");
    }
    if (reason.length < 5 || reason.length > 500) {
      return sendError(res, 400, "invalid inspection session reason");
    }
    if (hasActiveInspectionRequest(db, ticket.merchant_id)) {
      return sendError(res, 409, "merchant already has an active inspection request", {
        code: "INSPECTION_REQUEST_ALREADY_ACTIVE",
      });
    }

    const requestedAt = now();
    const inspectionRequest: InspectionSessionRequestRecord = {
      id: makeId("inspection-request"),
      ticket_id: ticket.id,
      merchant_id: ticket.merchant_id,
      admin_id: admin.id,
      admin_name: admin.owner_name,
      mode,
      reason,
      status: "pending",
      read_only: true,
      session_duration_minutes: 30,
      requested_at: requestedAt,
      request_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };

    ticket.inspection_requests = ticket.inspection_requests || [];
    ticket.inspection_requests.unshift(inspectionRequest);
    ticket.updated_at = requestedAt;
    appendMerchantInspectionNotification(db, ticket, inspectionRequest);

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      "inspection_session_requested",
      ticket.subject,
      {
        meta: {
          ticket_id: ticket.id,
          request_id: inspectionRequest.id,
          mode,
        },
        reason,
      },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    emitMerchantRealtimeState(db, ticket.merchant_id, "notifications_updated");
    return res.status(201).json({
      ok: true,
      ticket,
      inspection_request: inspectionRequest,
    });
  },
);

router.patch(
  "/admin/support/tickets/:id/status",
  (req: Request, res: Response) => {
    const admin = requireSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const status = String(req.body?.status || "").trim() as SupportTicketStatus;
    const db = ensureDb();
    const ticket = db.support_tickets.find((item) => item.id === ticketId);

    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (status !== "in_progress" && status !== "resolved") {
      return sendError(res, 400, "invalid support ticket status");
    }
    if (!ticket.assigned_admin_id) {
      return sendError(res, 409, "support ticket must be claimed first", {
        code: "SUPPORT_TICKET_NOT_CLAIMED",
      });
    }
    if (ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 403, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ASSIGNED_TO_ANOTHER_ADMIN",
      });
    }
    if (ticket.status === "closed") {
      return sendError(res, 409, "support ticket is closed");
    }

    ticket.status = status;
    ticket.updated_at = now();
    if (status === "resolved") {
      ticket.closed_at = ticket.updated_at;
      refreshInspectionRequestExpirations(db);
    } else {
      delete ticket.closed_at;
    }

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      status === "resolved"
        ? "support_ticket_resolved"
        : "support_ticket_in_progress",
      ticket.subject,
      {
        meta: {
          ticket_id: ticket.id,
          subject: ticket.subject,
          status,
        },
      },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    return res.json({ ok: true, ticket });
  },
);

router.get("/admin/me", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res, {
    allowPasswordChangeRequired: true,
  });
  if (!admin) return;

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, admin: toAdminSummary(admin) });
});

router.patch(
  "/admin/password/change-required",
  (req: Request, res: Response) => {
    const admin = requireAdminSession(req, res, {
      allowPasswordChangeRequired: true,
    });
    if (!admin) return;

    if (!isAssistantAdmin(admin)) {
      return sendError(res, 403, "assistant admin account is required", {
        code: "ASSISTANT_ADMIN_REQUIRED",
      });
    }
    if (admin.must_change_password !== true) {
      return sendError(res, 409, "password change is not required", {
        code: "ADMIN_PASSWORD_CHANGE_NOT_REQUIRED",
      });
    }

    const newPassword = String(req.body?.new_password || "").trim();
    const confirmPassword = String(
      req.body?.confirm_password || "",
    ).trim();
    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      return sendError(res, 400, passwordError.message, {
        code: passwordError.code,
      });
    }
    if (newPassword !== confirmPassword) {
      return sendError(res, 400, "password confirmation does not match", {
        code: "PASSWORD_CONFIRMATION_MISMATCH",
      });
    }
    if (verifyPassword(newPassword, admin.password)) {
      return sendError(res, 409, "new password must differ from temporary password", {
        code: "PASSWORD_UNCHANGED",
      });
    }

    const db = ensureDb();
    const persistedAdmin = db.merchants.find(
      (item) => item.id === admin.id && item.is_admin === true,
    );
    if (!persistedAdmin || !isAssistantAdmin(persistedAdmin)) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }

    persistedAdmin.password = hashPassword(newPassword);
    persistedAdmin.must_change_password = false;
    revokeAdminSessions(persistedAdmin);
    appendAdminLog(
      db,
      persistedAdmin,
      { id: persistedAdmin.id, store_name: persistedAdmin.owner_name },
      "assistant_admin_password_changed",
      "assistant administrator replaced temporary password with a permanent password",
      {
        meta: {
          assistant_admin_id: persistedAdmin.id,
          assistant_admin_phone: persistedAdmin.phone,
        },
      },
    );
    writeDb(db);

    let trackedSession: AdminTrackedSession | undefined;
    try {
      trackedSession = createAssistantTrackedSession(persistedAdmin, req);
    } catch (error) {
      const response = sendAdminWorkMonitorError(res, error);
      if (response) return response;
      throw error;
    }

    return res.json({
      ok: true,
      admin: toAdminSummary(persistedAdmin),
      admin_token: createAdminSessionToken(persistedAdmin, trackedSession),
    });
  },
);

router.get("/merchants", (req: Request, res: Response) => {
  const admin = requireAnyAdminPermission(req, res, [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "inspect_merchant_sessions",
  ]);
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    merchants: db.merchants
      .filter(
        (merchant) =>
          merchant.is_admin !== true && merchant.otp_verified === true,
      )
      .map(publicMerchant),
  });
});

router.get("/admins", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  return res.json({
    ok: true,
    admins: listAdmins().map((admin) => ({
      ...admin,
      ...getAdminCardSecuritySummary(admin.id),
    })),
  });
});

router.post("/admin/session/heartbeat", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res, {
    allowPasswordChangeRequired: true,
    recordActivity: false,
  });
  if (!admin) return;
  const payload = verifyAdminSessionToken(getBearerToken(req));
  if (payload?.sessionId) {
    touchAdminTrackedSession(payload.sessionId, req.body?.activity === true);
  }
  return res.json({ ok: true });
});

router.post("/admin/session/logout", (req: Request, res: Response) => {
  const payload = verifyAdminSessionToken(getBearerToken(req));
  if (payload?.sessionId) {
    try {
      revokeAdminTrackedSession({
        adminId: payload.adminId,
        sessionId: payload.sessionId,
        reason: "administrator_logout",
      });
    } catch (error) {
      if (!(error instanceof AdminWorkMonitorError) || error.code !== "ADMIN_SESSION_NOT_FOUND") {
        throw error;
      }
    }
  }
  return res.json({ ok: true });
});

router.get("/admins/:adminId/work-monitor", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;
  const adminId = String(req.params.adminId || "").trim();
  const db = ensureDb();
  const assistant = db.merchants.find(
    (item) => item.id === adminId && isAssistantAdmin(item),
  );
  if (!assistant) {
    return sendError(res, 404, "assistant admin account not found", {
      code: "ADMIN_NOT_FOUND",
    });
  }
  const monitor = getAdminWorkMonitor(adminId);
  const recentLogs = db.admin_logs
    .filter((log) => log.admin_id === adminId)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    )
    .slice(0, 50);
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ok: true,
    admin: toAdminSummary(assistant),
    ...monitor,
    recent_logs: recentLogs,
  });
});

router.post(
  "/admins/:adminId/devices/:deviceId/trust",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner || !requireOwnerPassword(owner, req, res)) return;
    const adminId = String(req.params.adminId || "").trim();
    const deviceId = normalizeAdminDeviceId(req.params.deviceId);
    const db = ensureDb();
    const assistant = db.merchants.find(
      (item) => item.id === adminId && isAssistantAdmin(item),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }
    try {
      const device = approveAdminTrustedDevice({
        adminId,
        deviceId,
        ownerId: owner.id,
      });
      appendAdminLog(
        db,
        owner,
        { id: assistant.id, store_name: assistant.owner_name },
        "assistant_device_trusted",
        "assistant administrator device was trusted",
        { meta: { device_id: device.device_id, device_label: device.device_label } },
      );
      writeDb(db);
      return res.json({ ok: true, device });
    } catch (error) {
      const response = sendAdminWorkMonitorError(res, error);
      if (response) return response;
      throw error;
    }
  },
);

router.post(
  "/admins/:adminId/devices/:deviceId/revoke",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner || !requireOwnerPassword(owner, req, res)) return;
    const adminId = String(req.params.adminId || "").trim();
    const deviceId = normalizeAdminDeviceId(req.params.deviceId);
    const db = ensureDb();
    const assistant = db.merchants.find(
      (item) => item.id === adminId && isAssistantAdmin(item),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }
    try {
      const device = revokeAdminTrustedDevice({
        adminId,
        deviceId,
        ownerId: owner.id,
      });
      appendAdminLog(
        db,
        owner,
        { id: assistant.id, store_name: assistant.owner_name },
        "assistant_device_trust_revoked",
        "assistant administrator device trust was revoked",
        { meta: { device_id: device.device_id, device_label: device.device_label } },
      );
      writeDb(db);
      return res.json({ ok: true, device });
    } catch (error) {
      const response = sendAdminWorkMonitorError(res, error);
      if (response) return response;
      throw error;
    }
  },
);

router.post(
  "/admins/:adminId/sessions/:sessionId/revoke",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner || !requireOwnerPassword(owner, req, res)) return;
    const adminId = String(req.params.adminId || "").trim();
    const sessionId = String(req.params.sessionId || "").trim();
    const db = ensureDb();
    const assistant = db.merchants.find(
      (item) => item.id === adminId && isAssistantAdmin(item),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }
    try {
      const session = revokeAdminTrackedSession({
        adminId,
        sessionId,
        reason: "owner_terminated_session",
      });
      appendAdminLog(
        db,
        owner,
        { id: assistant.id, store_name: assistant.owner_name },
        "assistant_session_revoked",
        "assistant administrator session was terminated",
        { meta: { session_id: session.id, device_label: session.device_label } },
      );
      writeDb(db);
      return res.json({ ok: true, session });
    } catch (error) {
      const response = sendAdminWorkMonitorError(res, error);
      if (response) return response;
      throw error;
    }
  },
);

router.post(
  "/admins/:adminId/sessions/revoke-all",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner || !requireOwnerPassword(owner, req, res)) return;
    const adminId = String(req.params.adminId || "").trim();
    const db = ensureDb();
    const assistant = db.merchants.find(
      (item) => item.id === adminId && isAssistantAdmin(item),
    );
    if (!assistant) {
      return sendError(res, 404, "assistant admin account not found", {
        code: "ADMIN_NOT_FOUND",
      });
    }
    const revokedCount = revokeAllAdminTrackedSessions(
      adminId,
      "owner_terminated_all_sessions",
    );
    appendAdminLog(
      db,
      owner,
      { id: assistant.id, store_name: assistant.owner_name },
      "assistant_sessions_revoked",
      "all assistant administrator sessions were terminated",
      { meta: { revoked_count: revokedCount } },
    );
    writeDb(db);
    return res.json({ ok: true, revoked_count: revokedCount });
  },
);

router.post("/admins", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  try {
    const admin = createAssistantAdmin({
      ownerName: String(req.body?.owner_name || ""),
      phone: String(req.body?.phone || ""),
      password: String(req.body?.password || ""),
      language: String(req.body?.language || "ar"),
    });

    return res.status(201).json({
      ok: true,
      admin,
    });
  } catch (error) {
    if (error instanceof AdminManagementError) {
      return sendError(
        res,
        error.statusCode,
        error.message,
        { code: error.code },
      );
    }

    console.error("Failed to create assistant admin:", error);
    return sendError(res, 500, "failed to create assistant admin");
  }
});

router.patch("/admins/:adminId/enabled", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const adminId = String(req.params.adminId || "").trim();
  const enabled = req.body?.enabled;

  if (!adminId) {
    return sendError(res, 400, "adminId is required");
  }

  if (typeof enabled !== "boolean") {
    return sendError(
      res,
      400,
      "enabled must be boolean",
      { code: "INVALID_ENABLED_VALUE" },
    );
  }

  try {
    const admin = setAssistantAdminEnabled(adminId, enabled);

    return res.json({
      ok: true,
      admin,
    });
  } catch (error) {
    if (error instanceof AdminManagementError) {
      return sendError(
        res,
        error.statusCode,
        error.message,
        { code: error.code },
      );
    }

    console.error("Failed to update assistant admin status:", error);
    return sendError(
      res,
      500,
      "failed to update assistant admin status",
    );
  }
});

router.patch(
  "/admins/:adminId/permissions",
  (req: Request, res: Response) => {
    const owner = requireOwner(req, res);
    if (!owner) return;

    const adminId = String(req.params.adminId || "").trim();
    const permissions = req.body?.permissions;

    if (!adminId) {
      return sendError(res, 400, "adminId is required");
    }

    if (!Array.isArray(permissions)) {
      return sendError(
        res,
        400,
        "permissions must be an array",
        { code: "INVALID_PERMISSIONS_VALUE" },
      );
    }

    const hasInvalidPermission = permissions.some(
      (permission) => !isAdminPermission(permission),
    );

    if (hasInvalidPermission) {
      return sendError(
        res,
        400,
        "permissions contain an unknown value",
        { code: "INVALID_ADMIN_PERMISSION" },
      );
    }

    const normalizedPermissions = Array.from(
      new Set(permissions),
    ) as AdminPermission[];

    try {
      const admin = updateAssistantAdminPermissions(
        adminId,
        normalizedPermissions,
      );

      return res.json({
        ok: true,
        admin,
      });
    } catch (error) {
      if (error instanceof AdminManagementError) {
        return sendError(
          res,
          error.statusCode,
          error.message,
          { code: error.code },
        );
      }

      console.error(
        "Failed to update assistant admin permissions:",
        error,
      );

      return sendError(
        res,
        500,
        "failed to update assistant admin permissions",
      );
    }
  },
);

router.patch("/admins/:adminId/password", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const adminId = String(req.params.adminId || "").trim();
  const ownerPassword = String(req.body?.owner_password || "");
  const temporaryPassword = String(
    req.body?.temporary_password || "",
  ).trim();
  const confirmTemporaryPassword = String(
    req.body?.confirm_temporary_password || "",
  ).trim();

  if (!adminId) {
    return sendError(res, 400, "adminId is required", {
      code: "ADMIN_ID_REQUIRED",
    });
  }
  if (!ownerPassword) {
    return sendError(res, 400, "owner password is required", {
      code: "OWNER_PASSWORD_REQUIRED",
    });
  }
  if (!verifyPassword(ownerPassword, owner.password)) {
    return sendError(res, 401, "owner password is incorrect", {
      code: "OWNER_PASSWORD_INCORRECT",
    });
  }

  const passwordError = getPasswordValidationError(temporaryPassword);
  if (passwordError) {
    return sendError(res, 400, passwordError.message, {
      code: passwordError.code,
    });
  }
  if (temporaryPassword !== confirmTemporaryPassword) {
    return sendError(res, 400, "temporary password confirmation does not match", {
      code: "PASSWORD_CONFIRMATION_MISMATCH",
    });
  }

  const db = ensureDb();
  const assistant = db.merchants.find(
    (item) => item.id === adminId && item.is_admin === true,
  );
  if (!assistant) {
    return sendError(res, 404, "assistant admin account not found", {
      code: "ADMIN_NOT_FOUND",
    });
  }
  if (!isAssistantAdmin(assistant)) {
    return sendError(res, 400, "owner admin password cannot be reset here", {
      code: "OWNER_ADMIN_PASSWORD_CANNOT_BE_RESET",
    });
  }
  if (verifyPassword(temporaryPassword, assistant.password)) {
    return sendError(res, 409, "temporary password must differ from current password", {
      code: "PASSWORD_UNCHANGED",
    });
  }

  assistant.password = hashPassword(temporaryPassword);
  assistant.must_change_password = true;
  revokeAdminSessions(assistant);
  appendAdminLog(
    db,
    owner,
    { id: assistant.id, store_name: assistant.owner_name },
    "assistant_admin_password_reset",
    "assistant administrator temporary password issued",
    {
      meta: {
        assistant_admin_id: assistant.id,
        assistant_admin_phone: assistant.phone,
      },
    },
  );
  writeDb(db);

  return res.json({
    ok: true,
    admin: toAdminSummary(assistant),
  });
});

router.post("/admin/local-data-migration", (req: Request, res: Response) => {
  const owner = requireOwner(req, res);
  if (!owner) return;

  const db = ensureDb();
  const sourceLogs = Array.isArray(req.body?.logs) ? req.body.logs.slice(0, 5000) : [];
  const sourceNotes =
    req.body?.notes && typeof req.body.notes === "object" && !Array.isArray(req.body.notes)
      ? req.body.notes as Record<string, unknown>
      : {};
  const sourceChannels =
    req.body?.channel_overrides &&
    typeof req.body.channel_overrides === "object" &&
    !Array.isArray(req.body.channel_overrides)
      ? req.body.channel_overrides as Record<string, unknown>
      : {};

  const knownLogIds = new Set(db.admin_logs.map((log) => log.id));
  let importedLogs = 0;
  let importedNotes = 0;
  let importedChannels = 0;

  for (const candidate of sourceLogs) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const id = String(record.id || "").trim();
    const merchantId = String(record.merchant_id || "").trim();
    const merchantName = String(record.merchant_name || "").trim();
    const actionType = String(record.action_type || "").trim();
    const createdAt = String(record.created_at || "").trim();
    const adminId = String(record.admin_id || "").trim();
    const adminName = String(record.admin_name || "").trim();
    const adminRole = isAdminRole(record.admin_role)
      ? record.admin_role
      : undefined;
    if (!id || knownLogIds.has(id) || !merchantId || !merchantName || !actionType) continue;
    if (!Number.isFinite(new Date(createdAt).getTime())) continue;

    db.admin_logs.push({
      id,
      ...(adminId ? { admin_id: adminId } : {}),
      ...(adminName ? { admin_name: adminName } : {}),
      admin_phone: String(record.admin_phone || owner.phone).trim(),
      ...(adminRole ? { admin_role: adminRole } : {}),
      action_type: actionType,
      merchant_id: merchantId,
      merchant_name: merchantName,
      details: String(record.details || "").slice(0, 2000),
      ...(record.meta && typeof record.meta === "object" && !Array.isArray(record.meta)
        ? { meta: record.meta as Record<string, string | number> }
        : {}),
      ...(record.reason ? { reason: String(record.reason).slice(0, 1000) } : {}),
      created_at: createdAt,
    });
    knownLogIds.add(id);
    importedLogs += 1;
  }

  for (const [merchantId, value] of Object.entries(sourceNotes)) {
    if (typeof value !== "string" || value.length > 5000) continue;
    if (db.admin_notes[merchantId] !== undefined) continue;
    if (!findRegularMerchant(db, merchantId)) continue;
    db.admin_notes[merchantId] = value;
    importedNotes += 1;
  }

  for (const [merchantId, value] of Object.entries(sourceChannels)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (!findRegularMerchant(db, merchantId)) continue;

    const current = db.channel_overrides[merchantId] || {};
    const candidate = value as Record<string, unknown>;
    for (const [platform, status] of Object.entries(candidate)) {
      if (!isChannelPlatform(platform) || !isChannelStatus(status)) continue;
      if (current[platform] !== undefined) continue;
      current[platform] = status;
      importedChannels += 1;
    }
    db.channel_overrides[merchantId] = current;
  }

  db.admin_logs.sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  writeDb(db);

  return res.json({
    ok: true,
    imported: {
      logs: importedLogs,
      notes: importedNotes,
      channels: importedChannels,
    },
  });
});

router.post("/admin/logs", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_subscriptions");
  if (!admin) return;

  const allowedActions = new Set([
    "plan_activated",
    "plan_changed",
    "plan_renewed",
    "replies_reset",
    "replies_added",
    "replies_deducted",
    "auto_reply_enabled",
    "auto_reply_disabled",
  ]);
  const actionType = String(req.body?.action_type || "").trim();
  const merchantId = String(req.body?.merchant_id || "").trim();
  const details = String(req.body?.details || "").trim();
  const reason = String(req.body?.reason || "").trim();
  const meta =
    req.body?.meta && typeof req.body.meta === "object" && !Array.isArray(req.body.meta)
      ? req.body.meta as Record<string, string | number>
      : undefined;

  if (!allowedActions.has(actionType)) {
    return sendError(res, 400, "invalid admin log action");
  }
  if (!merchantId) return sendError(res, 400, "merchantId is required");

  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  const log = appendAdminLog(db, admin, merchant, actionType, details, {
    ...(meta ? { meta } : {}),
    ...(reason ? { reason } : {}),
  });
  writeDb(db);

  return res.status(201).json({ ok: true, log });
});

router.get("/admin/logs", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "view_logs");
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    logs: db.admin_logs.slice(0, 1000),
  });
});

router.get("/admin/channels", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_channels");
  if (!admin) return;

  const db = ensureDb();
  return res.json({
    ok: true,
    channel_overrides: db.channel_overrides,
  });
});

router.patch(
  "/merchants/:id/channels/:platform",
  (req: Request, res: Response) => {
    const admin = requireAdminPermission(req, res, "manage_channels");
    if (!admin) return;

    const merchantId = String(req.params.id || "").trim();
    const platform = String(req.params.platform || "").trim();
    const status = String(req.body?.status || "").trim();

    if (!merchantId) return sendError(res, 400, "merchantId is required");
    if (!isChannelPlatform(platform)) {
      return sendError(res, 400, "invalid channel platform");
    }
    if (!isChannelStatus(status)) {
      return sendError(res, 400, "invalid channel status");
    }

    const db = ensureDb();
    const merchant = findRegularMerchant(db, merchantId);
    if (!merchant) return sendError(res, 404, "merchant not found");

    db.channel_overrides[merchantId] = {
      ...(db.channel_overrides[merchantId] || {}),
      [platform]: status,
    };
    appendAdminLog(
      db,
      admin,
      merchant,
      "channel_status_changed",
      `${platform}: ${status}`,
      { meta: { platform, status } },
    );
    writeDb(db);

    return res.json({
      ok: true,
      merchant_id: merchantId,
      platform,
      status,
    });
  },
);

router.get("/merchants/:id/note", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_merchant_status");
  if (!admin) return;

  const merchantId = String(req.params.id || "").trim();
  const db = ensureDb();
  const merchant = findRegularMerchant(db, merchantId);
  if (!merchant) return sendError(res, 404, "merchant not found");

  return res.json({
    ok: true,
    merchant_id: merchantId,
    note: db.admin_notes[merchantId] || "",
  });
});
