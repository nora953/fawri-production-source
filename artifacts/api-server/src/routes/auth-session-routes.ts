import { Router } from "express";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import { findAdminByIdAuthoritative } from "../services/postgresAdminAccountAuthority";
import { listAdminDevicesAuthoritative } from "../services/postgresAdminSecurityAuthority";
import { findMerchantByIdAuthoritative } from "../services/postgresMerchantAccountAuthority";
import {
  clearAuthSessionCookie,
  getAuthContext,
  getSessionToken,
  requestDeviceId,
  requireSecureAdminSession,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import { payload } from "./auth-route-common";
import { changePassword } from "./auth-password-route-support";

const router = Router();

router.post("/logout", async (req, res) => {
  const token = getSessionToken(req, "merchant");
  if (token) {
    await authPostgresSessionAuthority.revokeSession(
      token,
      "merchant",
      "logout",
    );
  }
  clearAuthSessionCookie(res, "merchant");
  res.json({ ok: true });
});

router.post("/admin/logout", async (req, res) => {
  const token = getSessionToken(req, "admin");
  if (token) {
    await authPostgresSessionAuthority.revokeSession(token, "admin", "logout");
  }
  clearAuthSessionCookie(res, "admin");
  res.json({ ok: true });
});

router.post("/logout-all", requireSecureMerchantSession, async (_req, res) => {
  const context = getAuthContext(res)!;
  await authPostgresSessionAuthority.revokeAllSessions({
    accountId: context.account.id,
    accountKind: "merchant",
    reason: "logout_all",
  });
  clearAuthSessionCookie(res, "merchant");
  res.json({ ok: true });
});

router.post("/admin/logout-all", requireSecureAdminSession, async (_req, res) => {
  const context = getAuthContext(res)!;
  await authPostgresSessionAuthority.revokeAllSessions({
    accountId: context.account.id,
    accountKind: "admin",
    reason: "logout_all",
  });
  clearAuthSessionCookie(res, "admin");
  res.json({ ok: true });
});

router.get("/sessions", requireSecureMerchantSession, async (_req, res) => {
  const context = getAuthContext(res)!;
  res.json({
    ok: true,
    current_session_id: context.session.id,
    sessions: await authPostgresSessionAuthority.listActiveSessions(
      context.account.id,
      "merchant",
    ),
  });
});

router.get("/admin/sessions", requireSecureAdminSession, async (_req, res) => {
  const context = getAuthContext(res)!;
  res.json({
    ok: true,
    sessions: await authPostgresSessionAuthority.listActiveSessions(
      context.account.id,
      "admin",
    ),
  });
});

router.delete(
  "/sessions/:sessionId",
  requireSecureMerchantSession,
  async (req, res) => {
    const context = getAuthContext(res)!;
    const ok = await authPostgresSessionAuthority.revokeSessionById({
      actorAccountId: context.account.id,
      accountId: context.account.id,
      accountKind: "merchant",
      sessionId: String(req.params.sessionId || ""),
    });
    res.status(ok ? 200 : 404).json({ ok });
  },
);

router.delete(
  "/admin/sessions/:sessionId",
  requireSecureAdminSession,
  async (req, res) => {
    const context = getAuthContext(res)!;
    const ok = await authPostgresSessionAuthority.revokeSessionById({
      actorAccountId: context.account.id,
      accountId: context.account.id,
      accountKind: "admin",
      sessionId: String(req.params.sessionId || ""),
    });
    res.status(ok ? 200 : 404).json({ ok });
  },
);

router.post("/change-password", requireSecureMerchantSession, (req, res) =>
  changePassword(req, res, "merchant"),
);
router.post("/admin/change-password", requireSecureAdminSession, (req, res) =>
  changePassword(req, res, "admin"),
);

router.get("/lifecycle", async (req, res) => {
  const token = getSessionToken(req, "merchant");
  if (!token) {
    sendAuthError(
      res,
      401,
      "SESSION_REQUIRED",
      "merchant session is required",
    );
    return;
  }

  const deviceId = requestDeviceId(req);
  const validated = await authPostgresSessionAuthority.validateSession({
    token,
    expectedKind: "merchant",
    ...(deviceId ? { deviceId } : {}),
  });
  if (!validated) {
    clearAuthSessionCookie(res, "merchant");
    sendAuthError(
      res,
      401,
      "SESSION_INVALID",
      "merchant session is invalid or expired",
    );
    return;
  }

  const account = await findMerchantByIdAuthoritative(
    validated.session.account_id,
  );
  if (!account?.merchantProfile || !account.account.otpVerified) {
    await authPostgresSessionAuthority.revokeSession(
      token,
      "merchant",
      "account_disabled",
    );
    clearAuthSessionCookie(res, "merchant");
    sendAuthError(
      res,
      401,
      "SESSION_ACCOUNT_INVALID",
      "session account is no longer available",
    );
    return;
  }

  if (account.account.sessionVersion !== validated.session.account_version) {
    await authPostgresSessionAuthority.revokeSession(
      token,
      "merchant",
      "role_changed",
    );
    clearAuthSessionCookie(res, "merchant");
    sendAuthError(
      res,
      401,
      "SESSION_VERSION_REVOKED",
      "session was revoked by an account security change",
    );
    return;
  }

  const accountStatus = account.merchantProfile.accountStatus;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    lifecycle: {
      merchant_id: validated.session.account_id,
      account_status: accountStatus,
      merchant_status:
        accountStatus === "pending_review"
          ? "pending_activation"
          : accountStatus,
      onboarding_status: account.merchantProfile.onboardingStatus,
    },
  });
});

router.get("/me", requireSecureMerchantSession, async (_req, res) => {
  const context = getAuthContext(res)!;
  const account = await findMerchantByIdAuthoritative(context.account.id);
  if (!account) {
    res.status(404).json({
      ok: false,
      code: "ACCOUNT_NOT_FOUND",
      error: "account not found",
    });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, ...payload(account) });
});

router.get("/admin/me", requireSecureAdminSession, async (_req, res) => {
  const context = getAuthContext(res)!;
  const account = await findAdminByIdAuthoritative(context.account.id);
  if (!account) {
    res.status(404).json({
      ok: false,
      code: "ACCOUNT_NOT_FOUND",
      error: "account not found",
    });
    return;
  }

  const responsePayload = payload(account);
  const pendingDeviceCount =
    account.adminProfile?.role === "owner_admin" && responsePayload.admin
      ? (await listAdminDevicesAuthoritative()).filter(
          (device) => device.status === "pending",
        ).length
      : null;

  res.json({
    ok: true,
    ...responsePayload,
    ...(pendingDeviceCount !== null && responsePayload.admin
      ? {
          admin: {
            ...responsePayload.admin,
            pending_device_count: pendingDeviceCount,
          },
        }
      : {}),
  });
});

export default router;