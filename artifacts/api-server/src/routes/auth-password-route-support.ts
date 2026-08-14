import type { Request, Response } from "express";
import { authAccountRepository } from "../services/authAccountRepository";
import { authPostgresSessionAuthority } from "../services/authPostgresSessionAuthority";
import { authSecurityStore } from "../services/authSecurityStore";
import {
  getPasswordValidationError,
  hashPassword,
  verifyPassword,
} from "../services/authPasswordService";
import { findAdminByIdAuthoritative } from "../services/postgresAdminAccountAuthority";
import {
  clearAdminMustChangePasswordAuthoritative,
  clearLegacyAdminMustChangePassword,
} from "../services/postgresAdminPasswordProfileAuthority";
import { auditAdminSecurityEventAuthoritative } from "../services/postgresAdminSecurityAuthority";
import { findMerchantByIdAuthoritative } from "../services/postgresMerchantAccountAuthority";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  clearAuthSessionCookie,
  getAuthContext,
  sendAuthError,
} from "../middleware/authSession";

export async function changePassword(
  req: Request,
  res: Response,
  kind: "merchant" | "admin",
): Promise<void> {
  const context = getAuthContext(res)!;
  const currentPassword = String(
    req.body?.current_password || req.body?.currentPassword || "",
  );
  const next = String(req.body?.new_password || req.body?.newPassword || "");
  const confirm = String(
    req.body?.confirm_password || req.body?.confirmPassword || "",
  );
  const validation = getPasswordValidationError(next);
  const current =
    kind === "merchant"
      ? await findMerchantByIdAuthoritative(context.account.id)
      : await findAdminByIdAuthoritative(context.account.id);
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
    sendAuthError(
      res,
      401,
      "CURRENT_PASSWORD_INVALID",
      "current password is incorrect",
    );
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

  const passwordHash = hashPassword(next);
  const adminPostgresCutover =
    kind === "admin" &&
    operationalPostgresAuthorityRequired() &&
    authPostgresSessionAuthority.enabled("admin");

  let postgresRevoked: number | null = null;
  if (kind === "admin") {
    if (adminPostgresCutover) {
      postgresRevoked = await authPostgresSessionAuthority.commitPasswordChange({
        accountId: context.account.id,
        accountKind: "admin",
        passwordHash,
        reason: "password_changed",
      });
      await clearAdminMustChangePasswordAuthoritative(context.account.id);
    } else {
      clearLegacyAdminMustChangePassword(context.account.id, passwordHash);
    }
  } else {
    if (!operationalPostgresAuthorityRequired()) {
      authAccountRepository.updatePassword(
        context.account.id,
        "merchant",
        passwordHash,
      );
    }
    postgresRevoked = await authPostgresSessionAuthority.commitPasswordChange({
      accountId: context.account.id,
      accountKind: "merchant",
      passwordHash,
      reason: "password_changed",
    });
  }

  if (
    kind === "merchant" &&
    operationalPostgresAuthorityRequired() &&
    postgresRevoked === null
  ) {
    sendAuthError(
      res,
      503,
      "AUTH_POSTGRES_CUTOVER_INCOMPLETE",
      "merchant authentication PostgreSQL authority is incomplete",
    );
    return;
  }
  if (kind === "admin" && operationalPostgresAuthorityRequired() && !adminPostgresCutover) {
    sendAuthError(
      res,
      503,
      "AUTH_POSTGRES_CUTOVER_INCOMPLETE",
      "administrator authentication PostgreSQL authority is incomplete",
    );
    return;
  }
  if (postgresRevoked === null) {
    authSecurityStore.revokeAllSessions({
      accountId: context.account.id,
      accountKind: kind,
      reason: "password_changed",
    });
  }
  if (adminPostgresCutover) {
    await auditAdminSecurityEventAuthoritative({
      event_type: forcedAdminChange
        ? "administrator_forced_password_changed"
        : "account_password_changed",
      actor_account_id: context.account.id,
      actor_kind: "admin",
      subject_hash: context.account.id,
    });
  } else {
    authSecurityStore.audit({
      event_type: forcedAdminChange
        ? "administrator_forced_password_changed"
        : "account_password_changed",
      actor_account_id: context.account.id,
      actor_kind: kind,
      subject_hash: context.account.id,
    });
  }
  clearAuthSessionCookie(res, kind);
  res.json({ ok: true, reauthentication_required: true });
}
