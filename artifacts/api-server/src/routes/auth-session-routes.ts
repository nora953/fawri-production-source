import { Router } from "express";
import { authAccountRepository } from "../services/authAccountRepository";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import {
  clearAuthSessionCookie,
  getAuthContext,
  getSessionToken,
  requireSecureAdminSession,
  requireSecureMerchantSession,
} from "../middleware/authSession";
import { payload } from "./auth-route-common";
import { changePassword } from "./auth-password-route-support";

const router = Router();

router.post("/logout", async (req, res) => {
  const token = getSessionToken(req, "merchant");
  if (token) {
    await authPostgresSessionAuthority.revokeSession(token, "merchant", "logout");
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

router.delete("/sessions/:sessionId", requireSecureMerchantSession, async (req, res) => {
  const context = getAuthContext(res)!;
  const ok = await authPostgresSessionAuthority.revokeSessionById({
    actorAccountId: context.account.id,
    accountId: context.account.id,
    accountKind: "merchant",
    sessionId: String(req.params.sessionId || ""),
  });
  res.status(ok ? 200 : 404).json({ ok });
});

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

router.get("/me", requireSecureMerchantSession, (_req, res) => {
  const context = getAuthContext(res)!;
  const account = authAccountRepository.findById(context.account.id, "merchant");
  if (!account) {
    res.status(404).json({
      ok: false,
      code: "ACCOUNT_NOT_FOUND",
      error: "account not found",
    });
    return;
  }
  res.json({ ok: true, ...payload(account) });
});

router.get("/admin/me", requireSecureAdminSession, (_req, res) => {
  const context = getAuthContext(res)!;
  const account = authAccountRepository.findById(context.account.id, "admin");
  if (!account) {
    res.status(404).json({
      ok: false,
      code: "ACCOUNT_NOT_FOUND",
      error: "account not found",
    });
    return;
  }
  res.json({ ok: true, ...payload(account) });
});

export default router;
