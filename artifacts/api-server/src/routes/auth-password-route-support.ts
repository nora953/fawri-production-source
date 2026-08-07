import type { Request, Response } from "express";
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
  sendAuthError,
} from "../middleware/authSession";

export function changePassword(
  req: Request,
  res: Response,
  kind: "merchant" | "admin",
) {
  const context = getAuthContext(res)!;
  const currentPassword = String(
    req.body?.current_password || req.body?.currentPassword || "",
  );
  const next = String(req.body?.new_password || req.body?.newPassword || "");
  const confirm = String(
    req.body?.confirm_password || req.body?.confirmPassword || "",
  );
  const validation = getPasswordValidationError(next);
  const current = authAccountRepository.findById(context.account.id, kind);
  const forcedAdminChange =
    kind === "admin" && current?.adminProfile?.mustChangePassword === true;

  if (validation || next !== confirm || (!forcedAdminChange && !currentPassword)) {
    sendAuthError(
      res,
      400,
      validation?.code || "PASSWORD_CONFIRMATION_INVALID",
      validation?.message || "password confirmation is invalid",
    );
    return;
  }
  if (!current) {
    sendAuthError(res, 401, "CURRENT_PASSWORD_INVALID", "current password is incorrect");
    return;
  }
  if (
    (!forcedAdminChange &&
      !verifyPassword(currentPassword, current.account.passwordHash)) ||
    (forcedAdminChange && verifyPassword(next, current.account.passwordHash))
  ) {
    sendAuthError(
      res,
      forcedAdminChange ? 409 : 401,
      forcedAdminChange ? "PASSWORD_UNCHANGED" : "CURRENT_PASSWORD_INVALID",
      forcedAdminChange
        ? "new password must differ from the temporary password"
        : "current password is incorrect",
    );
    return;
  }

  authAccountRepository.updatePassword(
    context.account.id,
    kind,
    hashPassword(next),
    kind === "admin" ? { mustChangePassword: false } : {},
  );
  authSecurityStore.revokeAllSessions({
    accountId: context.account.id,
    accountKind: kind,
    reason: "password_changed",
  });
  authSecurityStore.audit({
    event_type: forcedAdminChange
      ? "administrator_forced_password_changed"
      : "account_password_changed",
    actor_account_id: context.account.id,
    actor_kind: kind,
    subject_hash: context.account.id,
  });
  clearAuthSessionCookie(res, kind);
  res.json({ ok: true, reauthentication_required: true });
}
