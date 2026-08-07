import { Router } from "express";
import { authAccountRepository } from "../services/authAccountRepository";
import { authSecurityStore } from "../services/authSecurityStore";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/authPasswordService";
import {
  clearAuthSessionCookie,
  getAuthContext,
  getSessionToken,
  requireSecureAdminSession,
  requireSecureMerchantSession,
  sendAuthError,
} from "../middleware/authSession";
import { payload } from "./auth-route-common";
import { changePassword } from "./auth-password-route-support";

const router = Router();
router.post("/logout", (req, res) => {
  const token = getSessionToken(req, "merchant");
  if (token) authSecurityStore.revokeSession(token, "logout");
  clearAuthSessionCookie(res, "merchant");
  res.json({ ok: true });
});
router.post("/admin/logout", (req, res) => {
  const token = getSessionToken(req, "admin");
  if (token) authSecurityStore.revokeSession(token, "logout");
  clearAuthSessionCookie(res, "admin");
  res.json({ ok: true });
});
router.post("/logout-all", requireSecureMerchantSession, (_req, res) => {
  const context = getAuthContext(res)!;
  authSecurityStore.revokeAllSessions({
    accountId: context.account.id,
    accountKind: "merchant",
    reason: "logout_all",
  });
  clearAuthSessionCookie(res, "merchant");
  res.json({ ok: true });
});
router.post("/admin/logout-all", requireSecureAdminSession, (_req, res) => {
  const context = getAuthContext(res)!;
  authSecurityStore.revokeAllSessions({
    accountId: context.account.id,
    accountKind: "admin",
    reason: "logout_all",
  });
  clearAuthSessionCookie(res, "admin");
  res.json({ ok: true });
});
router.get("/sessions", requireSecureMerchantSession, (_req, res) => {
  const context = getAuthContext(res)!;
  res.json({
    ok: true,
    sessions: authSecurityStore.listActiveSessions(context.account.id, "merchant"),
  });
});
router.get("/admin/sessions", requireSecureAdminSession, (_req, res) => {
  const context = getAuthContext(res)!;
  res.json({
    ok: true,
    sessions: authSecurityStore.listActiveSessions(context.account.id, "admin"),
  });
});
router.delete("/sessions/:sessionId", requireSecureMerchantSession, (req, res) => {
  const context = getAuthContext(res)!;
  const ok = authSecurityStore.revokeSessionById({
    actorAccountId: context.account.id,
    accountId: context.account.id,
    accountKind: "merchant",
    sessionId: String(req.params.sessionId || ""),
  });
  res.status(ok ? 200 : 404).json({ ok });
});
router.delete("/admin/sessions/:sessionId", requireSecureAdminSession, (req, res) => {
  const context = getAuthContext(res)!;
  const ok = authSecurityStore.revokeSessionById({
    actorAccountId: context.account.id,
    accountId: context.account.id,
    accountKind: "admin",
    sessionId: String(req.params.sessionId || ""),
  });
  res.status(ok ? 200 : 404).json({ ok });
});
router.post("/change-password", requireSecureMerchantSession, (req, res) =>
  changePassword(req, res, "merchant"),
);
router.post("/admin/change-password", requireSecureAdminSession, (req, res) =>
  changePassword(req, res, "admin"),
);
router.post(
  "/admin/change-password-required",
  requireSecureAdminSession,
  (req, res) => {
    const context = getAuthContext(res)!;
    const account = authAccountRepository.findById(context.account.id, "admin");
    if (!account?.adminProfile || account.adminProfile.mustChangePassword !== true) {
      sendAuthError(
        res,
        409,
        "ADMIN_PASSWORD_CHANGE_NOT_REQUIRED",
        "forced administrator password change is not required",
      );
      return;
    }

    const next = String(req.body?.new_password || req.body?.newPassword || "");
    const confirm = String(
      req.body?.confirm_password || req.body?.confirmPassword || "",
    );
    const validation = getPasswordValidationError(next);
    if (validation || next !== confirm) {
      sendAuthError(
        res,
        400,
        validation?.code || "PASSWORD_CONFIRMATION_INVALID",
        validation?.message || "password confirmation is invalid",
      );
      return;
    }
    if (verifyPassword(next, account.account.passwordHash)) {
      sendAuthError(
        res,
        409,
        "PASSWORD_UNCHANGED",
        "new password must differ from the temporary password",
      );
      return;
    }

    authAccountRepository.updatePassword(
      context.account.id,
      "admin",
      hashPassword(next),
      { mustChangePassword: false },
    );
    authSecurityStore.revokeAllSessions({
      accountId: context.account.id,
      accountKind: "admin",
      reason: "password_changed",
    });
    authSecurityStore.audit({
      event_type: "administrator_forced_password_changed",
      actor_account_id: context.account.id,
      actor_kind: "admin",
      subject_hash: context.account.id,
    });
    clearAuthSessionCookie(res, "admin");
    res.json({ ok: true, reauthentication_required: true });
  },
);
router.get("/me", requireSecureMerchantSession, (_req, res) => {
  const context = getAuthContext(res)!;
  const account = authAccountRepository.findById(context.account.id, "merchant");
  if (!account) {
    res.status(404).json({ ok: false, code: "ACCOUNT_NOT_FOUND", error: "account not found" });
    return;
  }
  res.json({ ok: true, ...payload(account) });
});
router.get("/admin/me", requireSecureAdminSession, (_req, res) => {
  const context = getAuthContext(res)!;
  const account = authAccountRepository.findById(context.account.id, "admin");
  if (!account) {
    res.status(404).json({ ok: false, code: "ACCOUNT_NOT_FOUND", error: "account not found" });
    return;
  }
  res.json({ ok: true, ...payload(account) });
});
export default router;
