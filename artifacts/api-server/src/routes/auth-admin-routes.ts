import { Router, type Request, type Response } from "express";
import {
  authAccountRepository,
  normalizePhone,
  type AuthAccount,
} from "../services/authAccountRepository";
import { normalizeAdminPermissions } from "../services/authPolicy";
import {
  authSecurityStore,
  AuthSecurityStoreError,
  MAX_TRUSTED_DEVICES_PER_ACCOUNT,
} from "../services/authSecurityStore";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/authPasswordService";
import {
  requireSecureAdminSession,
  sendAuthError,
} from "../middleware/authSession";
import { ownerContext, payload } from "./auth-route-common";

const router = Router();

function assistantTarget(
  adminId: string,
  res: Response,
): AuthAccount | null {
  const target = authAccountRepository.findById(adminId, "admin");
  if (!target?.adminProfile || target.adminProfile.role !== "assistant_admin") {
    sendAuthError(
      res,
      404,
      "ASSISTANT_ADMIN_NOT_FOUND",
      "assistant administrator not found",
    );
    return null;
  }
  return target;
}

function requireOwnerPassword(
  req: Request,
  res: Response,
  ownerId: string,
): boolean {
  const ownerPassword = String(req.body?.owner_password || "");
  const ownerAccount = authAccountRepository.findById(ownerId, "admin");
  if (
    !ownerPassword ||
    !ownerAccount ||
    !verifyPassword(ownerPassword, ownerAccount.account.passwordHash)
  ) {
    sendAuthError(
      res,
      401,
      "OWNER_PASSWORD_INCORRECT",
      "owner password is incorrect",
    );
    return false;
  }
  return true;
}

function targetLastSeen(adminId: string): string | null {
  const sessions = authSecurityStore.listActiveSessions(adminId, "admin");
  const timestamps = sessions
    .map((session) => Date.parse(session.last_seen_at))
    .filter(Number.isFinite);
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

router.get("/admins", requireSecureAdminSession, (_req, res) => {
  if (!ownerContext(res)) return;
  res.json({
    ok: true,
    admins: authAccountRepository.listAdmins().map(payload),
  });
});

router.post("/admins", requireSecureAdminSession, (req, res) => {
  const owner = ownerContext(res);
  if (!owner) return;
  const ownerName = String(req.body?.owner_name || "").trim();
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password || "");
  const confirm = String(
    req.body?.confirm_password || req.body?.confirmPassword || "",
  );
  const language =
    req.body?.language === "en" || req.body?.language === "ku"
      ? req.body.language
      : "ar";
  const validation = getPasswordValidationError(password);
  if (
    !ownerName ||
    !/^07\d{9}$/.test(phone) ||
    validation ||
    password !== confirm
  ) {
    sendAuthError(
      res,
      400,
      validation?.code || "ADMIN_ACCOUNT_INPUT_INVALID",
      validation?.message || "assistant administrator input is invalid",
    );
    return;
  }
  try {
    const assistant = authAccountRepository.createAssistantAdmin({
      ownerName,
      phone,
      passwordHash: hashPassword(password),
      language,
    });
    authSecurityStore.audit({
      event_type: "assistant_admin_created",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: assistant.account.id,
    });
    res.status(201).json({ ok: true, ...payload(assistant) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_CREATE_FAILED";
    sendAuthError(
      res,
      code === "PHONE_ALREADY_EXISTS" ? 409 : 400,
      code,
      "unable to create assistant administrator",
    );
  }
});

router.patch(
  "/admins/:adminId/enabled",
  requireSecureAdminSession,
  (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const id = String(req.params.adminId || "");
    const enabled = req.body?.enabled;
    if (!assistantTarget(id, res)) return;
    if (typeof enabled !== "boolean") {
      sendAuthError(res, 400, "INVALID_ENABLED_VALUE", "enabled must be boolean");
      return;
    }
    if (!authAccountRepository.setAdminEnabled(id, enabled)) {
      sendAuthError(
        res,
        409,
        "ADMIN_STATE_CHANGE_FAILED",
        "administrator state was not changed",
      );
      return;
    }
    authSecurityStore.revokeAllSessions({
      accountId: id,
      accountKind: "admin",
      reason: enabled ? "role_changed" : "account_disabled",
    });
    authSecurityStore.audit({
      event_type: enabled
        ? "assistant_admin_enabled"
        : "assistant_admin_disabled",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: id,
    });
    res.json({ ok: true, ...payload(authAccountRepository.findById(id, "admin")!) });
  },
);

router.patch(
  "/admins/:adminId/permissions",
  requireSecureAdminSession,
  (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const id = String(req.params.adminId || "");
    if (!assistantTarget(id, res)) return;
    if (!Array.isArray(req.body?.permissions)) {
      sendAuthError(
        res,
        400,
        "INVALID_PERMISSIONS_VALUE",
        "permissions must be an array",
      );
      return;
    }
    const normalized = normalizeAdminPermissions(req.body.permissions);
    if (normalized.length !== new Set(req.body.permissions).size) {
      sendAuthError(
        res,
        400,
        "INVALID_ADMIN_PERMISSION",
        "permissions contain an unknown value",
      );
      return;
    }
    authAccountRepository.setAssistantPermissions(id, normalized);
    authSecurityStore.revokeAllSessions({
      accountId: id,
      accountKind: "admin",
      reason: "role_changed",
    });
    authSecurityStore.audit({
      event_type: "assistant_admin_permissions_changed",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: id,
      metadata: { permission_count: normalized.length },
    });
    res.json({ ok: true, ...payload(authAccountRepository.findById(id, "admin")!) });
  },
);

router.post(
  "/admins/:adminId/logout-all",
  requireSecureAdminSession,
  (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const id = String(req.params.adminId || "");
    if (!assistantTarget(id, res)) return;
    const count = authSecurityStore.revokeAllSessions({
      accountId: id,
      accountKind: "admin",
      reason: "manual_revocation",
    });
    authSecurityStore.audit({
      event_type: "assistant_admin_sessions_revoked",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: id,
      metadata: { revoked_count: count },
    });
    res.json({ ok: true, revoked_count: count });
  },
);

router.patch(
  "/admins/:adminId/password",
  requireSecureAdminSession,
  (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const id = String(req.params.adminId || "");
    if (!assistantTarget(id, res)) return;
    const ownerPassword = String(req.body?.owner_password || "");
    const temporary = String(req.body?.temporary_password || "");
    const confirm = String(req.body?.confirm_temporary_password || "");
    const validation = getPasswordValidationError(temporary);
    const ownerAccount = authAccountRepository.findById(owner.account.id, "admin");
    if (
      !ownerAccount ||
      !verifyPassword(ownerPassword, ownerAccount.account.passwordHash)
    ) {
      sendAuthError(
        res,
        401,
        "OWNER_PASSWORD_INCORRECT",
        "owner password is incorrect",
      );
      return;
    }
    if (validation || temporary !== confirm) {
      sendAuthError(
        res,
        400,
        validation?.code || "PASSWORD_CONFIRMATION_INVALID",
        validation?.message || "temporary password confirmation is invalid",
      );
      return;
    }
    authAccountRepository.updatePassword(
      id,
      "admin",
      hashPassword(temporary),
      { mustChangePassword: true },
    );
    authSecurityStore.revokeAllSessions({
      accountId: id,
      accountKind: "admin",
      reason: "password_reset",
    });
    authSecurityStore.audit({
      event_type: "assistant_admin_password_reset",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: id,
    });
    res.json({ ok: true, reauthentication_required: true });
  },
);

// Secure v2 compatibility surface for the existing Work Monitor UI. These
// routes intentionally use authSecurityStore only; the legacy session/device
// stores are not consulted or mutated.
router.get(
  "/admins/:adminId/work-monitor",
  requireSecureAdminSession,
  (req, res) => {
    if (!ownerContext(res)) return;
    const id = String(req.params.adminId || "");
    const target = assistantTarget(id, res);
    if (!target?.adminProfile) return;

    const sessions = authSecurityStore.listActiveSessions(id, "admin");
    const devices = authSecurityStore.listDevices(id);
    const lastSeen = targetLastSeen(id);
    const lastSeenMs = lastSeen ? Date.parse(lastSeen) : 0;
    const age = lastSeenMs ? Date.now() - lastSeenMs : Number.POSITIVE_INFINITY;
    const workStatus =
      age <= 2 * 60 * 1000 ? "active" : age <= 15 * 60 * 1000 ? "idle" : "offline";
    const recentLogs = authSecurityStore
      .readAuditEvents()
      .filter(
        (event) =>
          event.actor_account_id === id || event.subject_hash === id,
      )
      .slice(-20)
      .reverse()
      .map((event) => ({
        id: event.id,
        action_type: event.event_type,
        details: event.event_type,
        created_at: event.created_at,
      }));

    res.json({
      ok: true,
      admin: {
        id: target.account.id,
        owner_name: target.adminProfile.displayName,
        phone: target.account.phone,
        admin_enabled: target.account.enabled,
      },
      summary: {
        work_status: workStatus,
        open_session_count: sessions.length,
        last_activity_at: lastSeen,
        pending_device_count: devices.filter((device) => device.status === "pending").length,
        session_limit: 2,
        trusted_device_limit: MAX_TRUSTED_DEVICES_PER_ACCOUNT,
        trusted_device_count: devices.filter((device) => device.status === "trusted").length,
        failed_login_count_24h: 0,
      },
      sessions: sessions.map((session) => ({
        id: session.id,
        device_id: session.id,
        device_label: session.device_label,
        user_agent: "",
        created_at: session.created_at,
        last_seen_at: session.last_seen_at,
        last_activity_at: session.last_seen_at,
        expires_at: session.idle_expires_at,
      })),
      devices: devices.map((device) => ({
        id: device.id,
        device_id: device.id,
        device_label: device.label,
        user_agent: "",
        status: device.status,
        first_seen_at: device.created_at,
        last_seen_at: device.last_seen_at,
        ...(device.trusted_at ? { trusted_at: device.trusted_at } : {}),
      })),
      failed_logins: [],
      recent_logs: recentLogs,
    });
  },
);

router.post(
  "/admins/:adminId/devices/:deviceRecordId/trust",
  requireSecureAdminSession,
  (req, res) => workMonitorDeviceAction(req, res, true),
);
router.post(
  "/admins/:adminId/devices/:deviceRecordId/revoke",
  requireSecureAdminSession,
  (req, res) => workMonitorDeviceAction(req, res, false),
);

function workMonitorDeviceAction(
  req: Request,
  res: Response,
  trusted: boolean,
): void {
  const owner = ownerContext(res);
  if (!owner) return;
  const adminId = String(req.params.adminId || "");
  if (!assistantTarget(adminId, res)) return;
  if (!requireOwnerPassword(req, res, owner.account.id)) return;
  const recordId = String(req.params.deviceRecordId || "");
  const device = authSecurityStore
    .listDevices(adminId)
    .find((item) => item.id === recordId);
  if (!device) {
    sendAuthError(res, 404, "DEVICE_NOT_FOUND", "device not found");
    return;
  }
  try {
    authSecurityStore.setDeviceTrust({
      deviceRecordId: recordId,
      trusted,
      actorAccountId: owner.account.id,
    });
    authSecurityStore.audit({
      event_type: trusted
        ? "assistant_device_trusted"
        : "assistant_device_trust_revoked",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: adminId,
      metadata: { device_record_id: recordId },
    });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthSecurityStoreError) {
      sendAuthError(
        res,
        409,
        error.code === "TRUSTED_DEVICE_LIMIT_REACHED"
          ? "ADMIN_TRUSTED_DEVICE_LIMIT_REACHED"
          : error.code,
        error.message,
      );
      return;
    }
    throw error;
  }
}

router.post(
  "/admins/:adminId/sessions/:sessionId/revoke",
  requireSecureAdminSession,
  (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const adminId = String(req.params.adminId || "");
    if (!assistantTarget(adminId, res)) return;
    if (!requireOwnerPassword(req, res, owner.account.id)) return;
    const sessionId = String(req.params.sessionId || "");
    const revoked = authSecurityStore.revokeSessionForAccount({
      accountId: adminId,
      accountKind: "admin",
      sessionId,
      reason: "manual_revocation",
    });
    if (!revoked) {
      sendAuthError(res, 404, "SESSION_NOT_FOUND", "session not found");
      return;
    }
    authSecurityStore.audit({
      event_type: "assistant_session_revoked",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: adminId,
      metadata: { session_id: sessionId },
    });
    res.json({ ok: true });
  },
);

router.post(
  "/admins/:adminId/sessions/revoke-all",
  requireSecureAdminSession,
  (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const adminId = String(req.params.adminId || "");
    if (!assistantTarget(adminId, res)) return;
    if (!requireOwnerPassword(req, res, owner.account.id)) return;
    const count = authSecurityStore.revokeAllSessions({
      accountId: adminId,
      accountKind: "admin",
      reason: "manual_revocation",
    });
    authSecurityStore.audit({
      event_type: "assistant_sessions_revoked",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: adminId,
      metadata: { revoked_count: count },
    });
    res.json({ ok: true, revoked_count: count });
  },
);

router.get("/admin/devices", requireSecureAdminSession, (_req, res) => {
  if (!ownerContext(res)) return;
  res.json({
    ok: true,
    devices: authSecurityStore.listDevices().map(({ device_hash: _hash, ...device }) =>
      device,
    ),
  });
});
router.post(
  "/admin/devices/:deviceRecordId/trust",
  requireSecureAdminSession,
  (req, res) => deviceTrust(req, res, true),
);
router.post(
  "/admin/devices/:deviceRecordId/revoke",
  requireSecureAdminSession,
  (req, res) => deviceTrust(req, res, false),
);

function deviceTrust(req: Request, res: Response, trusted: boolean): void {
  const owner = ownerContext(res);
  if (!owner) return;
  try {
    const device = authSecurityStore.setDeviceTrust({
      deviceRecordId: String(req.params.deviceRecordId || ""),
      trusted,
      actorAccountId: owner.account.id,
    });
    if (!device) {
      sendAuthError(res, 404, "DEVICE_NOT_FOUND", "device not found");
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthSecurityStoreError) {
      sendAuthError(res, 409, error.code, error.message);
      return;
    }
    throw error;
  }
}

export default router;
