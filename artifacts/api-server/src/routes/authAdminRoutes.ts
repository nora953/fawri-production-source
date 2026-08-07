import { Router } from "express";
import { authAccountRepository, normalizePhone } from "../services/authAccountRepository";
import { normalizeAdminPermissions } from "../services/authPolicy";
import { authSecurityStore, AuthSecurityStoreError } from "../services/authSecurityStore";
import { getPasswordValidationError, hashPassword, verifyPassword } from "../services/passwordService";
import { requireSecureAdminSession, sendAuthError } from "../middleware/authSession";
import { ownerContext, payload } from "./authRouteCommon";

const router = Router();
router.get("/admins", requireSecureAdminSession, (_req, res) => { if (!ownerContext(res)) return; res.json({ ok: true, admins: authAccountRepository.listAdmins().map(payload) }); });
router.post("/admins", requireSecureAdminSession, (req, res) => {
  const owner = ownerContext(res); if (!owner) return;
  const ownerName = String(req.body?.owner_name || "").trim(), phone = normalizePhone(req.body?.phone), password = String(req.body?.password || ""), confirm = String(req.body?.confirm_password || req.body?.confirmPassword || "");
  const language = req.body?.language === "en" || req.body?.language === "ku" ? req.body.language : "ar", validation = getPasswordValidationError(password);
  if (!ownerName || !/^07\d{9}$/.test(phone) || validation || password !== confirm) { sendAuthError(res, 400, validation?.code || "ADMIN_ACCOUNT_INPUT_INVALID", validation?.message || "assistant administrator input is invalid"); return; }
  try {
    const assistant = authAccountRepository.createAssistantAdmin({ ownerName, phone, passwordHash: hashPassword(password), language });
    authSecurityStore.audit({ event_type: "assistant_admin_created", actor_account_id: owner.account.id, actor_kind: "admin", subject_hash: assistant.account.id });
    res.status(201).json({ ok: true, ...payload(assistant) });
  } catch (error) { const code = error instanceof Error ? error.message : "ADMIN_CREATE_FAILED"; sendAuthError(res, code === "PHONE_ALREADY_EXISTS" ? 409 : 400, code, "unable to create assistant administrator"); }
});
router.patch("/admins/:adminId/enabled", requireSecureAdminSession, (req, res) => {
  const owner = ownerContext(res); if (!owner) return;
  const id = String(req.params.adminId || ""), enabled = req.body?.enabled, target = authAccountRepository.findById(id, "admin");
  if (!target?.adminProfile || target.adminProfile.role !== "assistant_admin") { sendAuthError(res, 404, "ASSISTANT_ADMIN_NOT_FOUND", "assistant administrator not found"); return; }
  if (typeof enabled !== "boolean") { sendAuthError(res, 400, "INVALID_ENABLED_VALUE", "enabled must be boolean"); return; }
  if (!authAccountRepository.setAdminEnabled(id, enabled)) { sendAuthError(res, 409, "ADMIN_STATE_CHANGE_FAILED", "administrator state was not changed"); return; }
  authSecurityStore.revokeAllSessions({ accountId: id, accountKind: "admin", reason: enabled ? "role_changed" : "account_disabled" });
  authSecurityStore.audit({ event_type: enabled ? "assistant_admin_enabled" : "assistant_admin_disabled", actor_account_id: owner.account.id, actor_kind: "admin", subject_hash: id });
  res.json({ ok: true, ...payload(authAccountRepository.findById(id, "admin")!) });
});
router.patch("/admins/:adminId/permissions", requireSecureAdminSession, (req, res) => {
  const owner = ownerContext(res); if (!owner) return;
  const id = String(req.params.adminId || ""), target = authAccountRepository.findById(id, "admin");
  if (!target?.adminProfile || target.adminProfile.role !== "assistant_admin") { sendAuthError(res, 404, "ASSISTANT_ADMIN_NOT_FOUND", "assistant administrator not found"); return; }
  if (!Array.isArray(req.body?.permissions)) { sendAuthError(res, 400, "INVALID_PERMISSIONS_VALUE", "permissions must be an array"); return; }
  const normalized = normalizeAdminPermissions(req.body.permissions);
  if (normalized.length !== new Set(req.body.permissions).size) { sendAuthError(res, 400, "INVALID_ADMIN_PERMISSION", "permissions contain an unknown value"); return; }
  authAccountRepository.setAssistantPermissions(id, normalized); authSecurityStore.revokeAllSessions({ accountId: id, accountKind: "admin", reason: "role_changed" });
  authSecurityStore.audit({ event_type: "assistant_admin_permissions_changed", actor_account_id: owner.account.id, actor_kind: "admin", subject_hash: id, metadata: { permission_count: normalized.length } });
  res.json({ ok: true, ...payload(authAccountRepository.findById(id, "admin")!) });
});
router.post("/admins/:adminId/logout-all", requireSecureAdminSession, (req, res) => {
  const owner = ownerContext(res); if (!owner) return; const id = String(req.params.adminId || ""), target = authAccountRepository.findById(id, "admin");
  if (!target?.adminProfile || target.adminProfile.role !== "assistant_admin") { sendAuthError(res, 404, "ASSISTANT_ADMIN_NOT_FOUND", "assistant administrator not found"); return; }
  const count = authSecurityStore.revokeAllSessions({ accountId: id, accountKind: "admin", reason: "manual_revocation" });
  authSecurityStore.audit({ event_type: "assistant_admin_sessions_revoked", actor_account_id: owner.account.id, actor_kind: "admin", subject_hash: id, metadata: { revoked_count: count } }); res.json({ ok: true, revoked_count: count });
});
router.patch("/admins/:adminId/password", requireSecureAdminSession, (req, res) => {
  const owner = ownerContext(res); if (!owner) return; const id = String(req.params.adminId || ""), target = authAccountRepository.findById(id, "admin");
  if (!target?.adminProfile || target.adminProfile.role !== "assistant_admin") { sendAuthError(res, 404, "ASSISTANT_ADMIN_NOT_FOUND", "assistant administrator not found"); return; }
  const ownerPassword = String(req.body?.owner_password || ""), temporary = String(req.body?.temporary_password || ""), confirm = String(req.body?.confirm_temporary_password || ""), validation = getPasswordValidationError(temporary);
  const ownerAccount = authAccountRepository.findById(owner.account.id, "admin");
  if (!ownerAccount || !verifyPassword(ownerPassword, ownerAccount.account.passwordHash)) { sendAuthError(res, 401, "OWNER_PASSWORD_INCORRECT", "owner password is incorrect"); return; }
  if (validation || temporary !== confirm) { sendAuthError(res, 400, validation?.code || "PASSWORD_CONFIRMATION_INVALID", validation?.message || "temporary password confirmation is invalid"); return; }
  authAccountRepository.updatePassword(id, "admin", hashPassword(temporary), { mustChangePassword: true }); authSecurityStore.revokeAllSessions({ accountId: id, accountKind: "admin", reason: "password_reset" });
  authSecurityStore.audit({ event_type: "assistant_admin_password_reset", actor_account_id: owner.account.id, actor_kind: "admin", subject_hash: id }); res.json({ ok: true, reauthentication_required: true });
});
router.get("/admin/devices", requireSecureAdminSession, (_req, res) => { if (!ownerContext(res)) return; res.json({ ok: true, devices: authSecurityStore.listDevices().map(({ device_hash: _hash, ...device }) => device) }); });
router.post("/admin/devices/:deviceRecordId/trust", requireSecureAdminSession, (req, res) => deviceTrust(req, res, true));
router.post("/admin/devices/:deviceRecordId/revoke", requireSecureAdminSession, (req, res) => deviceTrust(req, res, false));
function deviceTrust(req: any, res: any, trusted: boolean) {
  const owner = ownerContext(res); if (!owner) return;
  try { const device = authSecurityStore.setDeviceTrust({ deviceRecordId: String(req.params.deviceRecordId || ""), trusted, actorAccountId: owner.account.id }); if (!device) { sendAuthError(res, 404, "DEVICE_NOT_FOUND", "device not found"); return; } res.json({ ok: true }); }
  catch (error) { if (error instanceof AuthSecurityStoreError) { sendAuthError(res, 409, error.code, error.message); return; } throw error; }
}
export default router;
