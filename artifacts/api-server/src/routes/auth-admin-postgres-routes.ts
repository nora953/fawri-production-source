import { Router, type NextFunction, type Request, type Response } from "express";
import {
  normalizePhone,
  type AuthAccount,
} from "../services/authAccountRepository";
import { normalizeAdminPermissions } from "../services/authPolicy";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import {
  createAssistantAdminAuthoritative,
  findAdminByIdAuthoritative,
  listAdminsAuthoritative,
  setAdminEnabledAuthoritative,
  setAssistantPermissionsAuthoritative,
  updateAdminPasswordAuthoritative,
} from "../services/postgresAdminAccountAuthority";
import {
  auditAdminSecurityEventAuthoritative,
  listAdminAuditEventsAuthoritative,
  listAdminDevicesAuthoritative,
  setAdminDeviceTrustAuthoritative,
} from "../services/postgresAdminSecurityAuthority";
import {
  AuthSecurityStoreError,
  MAX_TRUSTED_DEVICES_PER_ACCOUNT,
} from "../services/authSecurityTypes";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/authPasswordService";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  requireSecureAdminSession,
  sendAuthError,
} from "../middleware/authSession";
import { ownerContext, payload } from "./auth-route-common";

const router = Router();

router.use((_req: Request, _res: Response, next: NextFunction) => {
  if (
    !operationalPostgresAuthorityRequired() ||
    !authPostgresSessionAuthority.enabled("admin")
  ) {
    next("router");
    return;
  }
  next();
});

async function assistantTarget(
  adminId: string,
  res: Response,
): Promise<AuthAccount | null> {
  const target = await findAdminByIdAuthoritative(adminId);
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

async function requireOwnerPassword(
  req: Request,
  res: Response,
  ownerId: string,
): Promise<boolean> {
  const ownerPassword = String(req.body?.owner_password || "");
  const ownerAccount = await findAdminByIdAuthoritative(ownerId);
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

async function audit(input: Parameters<typeof auditAdminSecurityEventAuthoritative>[0]) {
  await auditAdminSecurityEventAuthoritative(input);
}

async function adminWorkMonitorState(adminId: string) {
  const [sessions, devices] = await Promise.all([
    authPostgresSessionAuthority.listActiveSessions(adminId, "admin"),
    listAdminDevicesAuthoritative(adminId),
  ]);
  const timestamps = sessions
    .map((session) => Date.parse(session.last_seen_at))
    .filter(Number.isFinite);
  const lastSeen = timestamps.length
    ? new Date(Math.max(...timestamps)).toISOString()
    : null;
  const lastSeenMs = lastSeen ? Date.parse(lastSeen) : 0;
  const age = lastSeenMs ? Date.now() - lastSeenMs : Number.POSITIVE_INFINITY;
  const workStatus: "active" | "idle" | "offline" =
    age <= 2 * 60 * 1000 ? "active" : age <= 15 * 60 * 1000 ? "idle" : "offline";

  return {
    sessions,
    devices,
    summary: {
      work_status: workStatus,
      open_session_count: sessions.length,
      last_activity_at: lastSeen,
      pending_device_count: devices.filter((device) => device.status === "pending").length,
    },
  };
}

router.get("/admins", requireSecureAdminSession, async (_req, res) => {
  if (!ownerContext(res)) return;
  const admins = await listAdminsAuthoritative();
  const enrichedAdmins = await Promise.all(
    admins.map(async (admin) => ({
      ...payload(admin),
      ...(await adminWorkMonitorState(admin.account.id)).summary,
    })),
  );
  res.json({
    ok: true,
    admins: enrichedAdmins,
  });
});

router.post("/admins", requireSecureAdminSession, async (req, res) => {
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
    const assistant = await createAssistantAdminAuthoritative({
      ownerName,
      phone,
      passwordHash: hashPassword(password),
      language,
    });
    await audit({
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
  async (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const id = String(req.params.adminId || "");
    const enabled = req.body?.enabled;
    if (!(await assistantTarget(id, res))) return;
    if (typeof enabled !== "boolean") {
      sendAuthError(res, 400, "INVALID_ENABLED_VALUE", "enabled must be boolean");
      return;
    }
    if (!(await setAdminEnabledAuthoritative(id, enabled))) {
      sendAuthError(
        res,
        409,
        "ADMIN_STATE_CHANGE_FAILED",
        "administrator state was not changed",
      );
      return;
    }
    await authPostgresSessionAuthority.revokeAllSessions({
      accountId: id,
      accountKind: "admin",
      reason: enabled ? "role_changed" : "account_disabled",
    });
    await audit({
      event_type: enabled
        ? "assistant_admin_enabled"
        : "assistant_admin_disabled",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: id,
    });
    const refreshed = await findAdminByIdAuthoritative(id);
    res.json({ ok: true, ...(refreshed ? payload(refreshed) : {}) });
  },
);

router.patch(
  "/admins/:adminId/permissions",
  requireSecureAdminSession,
  async (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const id = String(req.params.adminId || "");
    if (!(await assistantTarget(id, res))) return;
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
    if (!(await setAssistantPermissionsAuthoritative(id, normalized, owner.account.id))) {
      sendAuthError(res, 409, "ADMIN_PERMISSION_CHANGE_FAILED", "permissions were not changed");
      return;
    }
    await authPostgresSessionAuthority.revokeAllSessions({
      accountId: id,
      accountKind: "admin",
      reason: "role_changed",
    });
    await audit({
      event_type: "assistant_admin_permissions_changed",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: id,
    });
    const refreshed = await findAdminByIdAuthoritative(id);
    res.json({ ok: true, ...(refreshed ? payload(refreshed) : {}) });
  },
);

router.post(
  "/admins/:adminId/logout-all",
  requireSecureAdminSession,
  async (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const id = String(req.params.adminId || "");
    if (!(await assistantTarget(id, res))) return;
    const count = await authPostgresSessionAuthority.revokeAllSessions({
      accountId: id,
      accountKind: "admin",
      reason: "manual_revocation",
    });
    await audit({
      event_type: "assistant_admin_sessions_revoked",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: id,
    });
    res.json({ ok: true, revoked_count: count });
  },
);

router.patch(
  "/admins/:adminId/password",
  requireSecureAdminSession,
  async (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const id = String(req.params.adminId || "");
    if (!(await assistantTarget(id, res))) return;
    const ownerPassword = String(req.body?.owner_password || "");
    const temporary = String(req.body?.temporary_password || "");
    const confirm = String(req.body?.confirm_temporary_password || "");
    const validation = getPasswordValidationError(temporary);
    const ownerAccount = await findAdminByIdAuthoritative(owner.account.id);
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
    await updateAdminPasswordAuthoritative(id, hashPassword(temporary), {
      mustChangePassword: true,
    });
    const count = await authPostgresSessionAuthority.revokeAllSessions({
      accountId: id,
      accountKind: "admin",
      reason: "password_reset",
    });
    await audit({
      event_type: "assistant_admin_password_reset",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: id,
      reason_code: count > 0 ? "sessions_revoked" : "no_active_sessions",
    });
    res.json({ ok: true, reauthentication_required: true });
  },
);

router.get(
  "/admins/:adminId/work-monitor",
  requireSecureAdminSession,
  async (req, res) => {
    if (!ownerContext(res)) return;
    const id = String(req.params.adminId || "");
    const target = await assistantTarget(id, res);
    if (!target?.adminProfile) return;

    const { sessions, devices, summary } = await adminWorkMonitorState(id);
    const recentLogs = (await listAdminAuditEventsAuthoritative(id, 20)).map((event) => ({
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
        ...summary,
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
  async (req, res) => workMonitorDeviceAction(req, res, true),
);
router.post(
  "/admins/:adminId/devices/:deviceRecordId/revoke",
  requireSecureAdminSession,
  async (req, res) => workMonitorDeviceAction(req, res, false),
);

async function workMonitorDeviceAction(
  req: Request,
  res: Response,
  trusted: boolean,
): Promise<void> {
  const owner = ownerContext(res);
  if (!owner) return;
  const adminId = String(req.params.adminId || "");
  if (!(await assistantTarget(adminId, res))) return;
  if (!(await requireOwnerPassword(req, res, owner.account.id))) return;
  const recordId = String(req.params.deviceRecordId || "");
  const devices = await listAdminDevicesAuthoritative(adminId);
  if (!devices.some((item) => item.id === recordId)) {
    sendAuthError(res, 404, "DEVICE_NOT_FOUND", "device not found");
    return;
  }
  try {
    await setAdminDeviceTrustAuthoritative({
      deviceRecordId: recordId,
      trusted,
      actorAccountId: owner.account.id,
    });
    if (!trusted) {
      const device = devices.find((item) => item.id === recordId);
      if (device) {
        await authPostgresSessionAuthority.revokeAllSessions({
          accountId: adminId,
          accountKind: "admin",
          reason: "device_revoked",
          deviceHash: device.device_hash,
        });
      }
    }
    await audit({
      event_type: trusted
        ? "assistant_device_trusted"
        : "assistant_device_trust_revoked",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: adminId,
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
  async (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const adminId = String(req.params.adminId || "");
    if (!(await assistantTarget(adminId, res))) return;
    if (!(await requireOwnerPassword(req, res, owner.account.id))) return;
    const sessionId = String(req.params.sessionId || "");
    const revoked = await authPostgresSessionAuthority.revokeSessionForAccount({
      accountId: adminId,
      accountKind: "admin",
      sessionId,
      reason: "manual_revocation",
    });
    if (!revoked) {
      sendAuthError(res, 404, "SESSION_NOT_FOUND", "session not found");
      return;
    }
    await audit({
      event_type: "assistant_session_revoked",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: adminId,
    });
    res.json({ ok: true });
  },
);

router.post(
  "/admins/:adminId/sessions/revoke-all",
  requireSecureAdminSession,
  async (req, res) => {
    const owner = ownerContext(res);
    if (!owner) return;
    const adminId = String(req.params.adminId || "");
    if (!(await assistantTarget(adminId, res))) return;
    if (!(await requireOwnerPassword(req, res, owner.account.id))) return;
    const count = await authPostgresSessionAuthority.revokeAllSessions({
      accountId: adminId,
      accountKind: "admin",
      reason: "manual_revocation",
    });
    await audit({
      event_type: "assistant_sessions_revoked",
      actor_account_id: owner.account.id,
      actor_kind: "admin",
      subject_hash: adminId,
    });
    res.json({ ok: true, revoked_count: count });
  },
);

router.get("/admin/devices", requireSecureAdminSession, async (_req, res) => {
  if (!ownerContext(res)) return;
  res.json({
    ok: true,
    devices: (await listAdminDevicesAuthoritative()).map(({ device_hash: _hash, ...device }) =>
      device,
    ),
  });
});
router.post(
  "/admin/devices/:deviceRecordId/trust",
  requireSecureAdminSession,
  async (req, res) => deviceTrust(req, res, true),
);
router.post(
  "/admin/devices/:deviceRecordId/revoke",
  requireSecureAdminSession,
  async (req, res) => deviceTrust(req, res, false),
);

async function deviceTrust(
  req: Request,
  res: Response,
  trusted: boolean,
): Promise<void> {
  const owner = ownerContext(res);
  if (!owner) return;
  try {
    const device = await setAdminDeviceTrustAuthoritative({
      deviceRecordId: String(req.params.deviceRecordId || ""),
      trusted,
      actorAccountId: owner.account.id,
    });
    if (!device) {
      sendAuthError(res, 404, "DEVICE_NOT_FOUND", "device not found");
      return;
    }
    if (!trusted) {
      await authPostgresSessionAuthority.revokeAllSessions({
        accountId: device.account_id,
        accountKind: "admin",
        reason: "device_revoked",
        deviceHash: device.device_hash,
      });
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