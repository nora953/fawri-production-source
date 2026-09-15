import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const authority = fs.readFileSync(
  new URL("../src/services/ownerBreakGlassRecoveryAuthority.ts", import.meta.url),
  "utf8",
);
const routes = fs.readFileSync(
  new URL("../src/routes/auth-owner-recovery-postgres-routes.ts", import.meta.url),
  "utf8",
);
const authRouter = fs.readFileSync(
  new URL("../src/routes/auth-security.ts", import.meta.url),
  "utf8",
);
const sessionAuthority = fs.readFileSync(
  new URL("../src/services/authPostgresSessionAuthority.ts", import.meta.url),
  "utf8",
);
const loginRoute = fs.readFileSync(
  new URL("../src/routes/auth-login-route-support.ts", import.meta.url),
  "utf8",
);
const deviceOtpRoute = fs.readFileSync(
  new URL("../src/routes/auth-admin-device-otp-pg-routes.ts", import.meta.url),
  "utf8",
);
const otpAuthority = fs.readFileSync(
  new URL("../src/services/postgresMerchantAuthSecurityAuthority.ts", import.meta.url),
  "utf8",
);
const setupPage = fs.readFileSync(
  new URL("../../fawri/src/pages/OwnerRecoverySetupPage.tsx", import.meta.url),
  "utf8",
);
const passwordInput = fs.readFileSync(
  new URL("../../fawri/src/components/ui/password-input.tsx", import.meta.url),
  "utf8",
);
const recoveryPage = fs.readFileSync(
  new URL("../../fawri/src/pages/OwnerRecoveryPage.tsx", import.meta.url),
  "utf8",
);
const app = fs.readFileSync(
  new URL("../../fawri/src/App.tsx", import.meta.url),
  "utf8",
);

test("recovery bundle uses high-entropy one-time secrets and stores fingerprints only", () => {
  assert.match(authority, /const recoveryId = randomHex\(24\)/);
  assert.match(authority, /const key1 = randomHex\(32\)/);
  assert.match(authority, /const key2 = randomHex\(32\)/);
  assert.match(authority, /key_1_hash: ownerRecoveryFingerprint\("key-1", key1\)/);
  assert.match(authority, /key_2_hash: ownerRecoveryFingerprint\("key-2", key2\)/);
  assert.match(authority, /enabled: false/);
  assert.match(authority, /used_at: now\.toISOString\(\)/);
  assert.doesNotMatch(authority, /metadata[^\n]*key_1:/);
  assert.doesNotMatch(authority, /metadata[^\n]*key_2:/);
});

test("recovery follows key1 then old phone and new-phone OTP then key2", () => {
  assert.match(routes, /router\.post\("\/owner-recovery\/:recoveryId\/start"/);
  assert.match(routes, /verifyOwnerRecoveryKey1\(\{\s*recoveryId,\s*key1,/s);
  assert.match(routes, /verifyOwnerRecoveryOldPhone/);
  assert.match(routes, /issueOtp\(req, newPhone, "admin_recovery"\)/);
  assert.match(routes, /purpose: "admin_recovery"/);
  assert.match(routes, /router\.post\("\/owner-recovery\/:recoveryId\/complete"/);
  assert.match(routes, /key_2/);
  assert.match(recoveryPage, /key_1:/);
  assert.match(recoveryPage, /old_phone:/);
  assert.match(recoveryPage, /confirm_new_phone:/);
  assert.match(recoveryPage, /key_2:/);
  assert.match(recoveryPage, /<Dialog open=\{key2Open\}/);
});

test("malformed public recovery starts are rate limited before failure recording", () => {
  const start = routes.indexOf('router.post("/owner-recovery/:recoveryId/start"');
  assert.notEqual(start, -1);
  const limiter = routes.indexOf("if (!(await rateLimit(req, res, target))) return;", start);
  const shapeCheck = routes.indexOf("if (!/^[0-9a-f]{48}$/.test(recoveryId)", start);
  assert.notEqual(limiter, -1);
  assert.notEqual(shapeCheck, -1);
  assert.ok(limiter < shapeCheck);
});

test("forgot-password recovery requires a replacement password rather than the lost password", () => {
  assert.match(routes, /forgot_password === true \? "reset_password" : "current_password"/);
  assert.match(authority, /input\.mode === "current_password"/);
  assert.match(authority, /getPasswordValidationError\(next\)/);
  assert.match(authority, /next !== confirm/);
  assert.match(recoveryPage, /forgot_password: forgotPassword/);
  assert.match(recoveryPage, /new_password: forgotPassword \? newPassword : ""/);
  assert.match(recoveryPage, /confirm_new_password: forgotPassword \? confirmNewPassword : ""/);
});

test("successful break-glass recovery revokes sessions and trusted devices atomically", () => {
  assert.match(authority, /security_version = security_version \+ 1/);
  assert.match(authority, /session_version = session_version \+ 1/);
  assert.match(authority, /UPDATE account_sessions[\s\S]*status = 'revoked'/);
  assert.match(authority, /UPDATE trusted_devices[\s\S]*status = 'revoked'/);
  assert.match(routes, /all_sessions_revoked: true/);
  assert.match(routes, /all_devices_revoked: true/);
  assert.match(routes, /recovery_keys_consumed: true/);
});

test("recovery generation and completion audit records are inside the security transaction", () => {
  assert.match(
    authority,
    /await writeRecoveryAudit\(client, \{\s*eventType: "owner_recovery_bundle_generated"/s,
  );
  assert.match(
    authority,
    /await writeRecoveryAudit\(client, \{\s*eventType: "owner_break_glass_recovery_completed"/s,
  );
  assert.doesNotMatch(authority, /auditAdminSecurityEventAuthoritative/);
  assert.match(
    routes,
    /clearRecoveryCookie\(res\);[\s\S]*recordAttempt\([\s\S]*\)\.catch\(\(\) => undefined\);[\s\S]*res\.json\(/,
  );
});

test("recovery setup is owner-session protected, password reauthenticated, and never cached", () => {
  assert.match(authRouter, /router\.use\("\/admin\/owner-recovery", requireSecureAdminSession\)/);
  assert.match(
    authRouter,
    /router\.post\(\s*"\/admin\/owner-recovery\/generate",\s*requireOwnerRecoverySetupPassword/s,
  );
  assert.match(authRouter, /Cache-Control", "no-store, max-age=0"/);
  assert.match(setupPage, /owner_password: ownerPassword/);
  assert.match(setupPage, /<PasswordInput/);
  assert.match(setupPage, /autoComplete="current-password"/);
  assert.match(passwordInput, /type=\{isVisible \? 'text' : 'password'\}/);
  assert.doesNotMatch(setupPage, /localStorage/);
  assert.doesNotMatch(recoveryPage, /localStorage/);
});

test("public recovery state is held in a short encrypted HttpOnly strict cookie", () => {
  assert.match(routes, /createCipheriv\("aes-256-gcm"/);
  assert.match(routes, /RECOVERY_TTL_MS = 20 \* 60 \* 1000/);
  assert.match(routes, /httpOnly: true/);
  assert.match(routes, /sameSite: "strict"/);
  assert.match(routes, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(routes, /path: "\/api\/auth\/owner-recovery"/);
});

test("admin recovery OTP and owner session cap remain PostgreSQL authoritative", () => {
  assert.match(otpAuthority, /input\.purpose === "admin_recovery"/);
  assert.match(otpAuthority, /"admin_device_verification" \|\| input\.purpose === "admin_recovery"/);
  assert.match(sessionAuthority, /input\.adminRole === "owner_admin"/);
  assert.match(sessionAuthority, /activeOnDevice\.length >= 2/);
  assert.match(sessionAuthority, /fingerprint\("device", input\.deviceId\)/);
  assert.match(sessionAuthority, /throw new Error\("OWNER_SESSION_LIMIT_REACHED"\)/);
  assert.match(loginRoute, /OWNER_SESSION_LIMIT_REACHED/);
  assert.match(deviceOtpRoute, /OWNER_SESSION_LIMIT_REACHED/);
});

test("frontend exposes only the dedicated owner setup and recovery routes", () => {
  assert.match(app, /path="\/owner-recovery\/:recoveryId"/);
  assert.match(app, /path="\/admin\/owner-recovery-setup"/);
  assert.match(setupPage, /displayOnce/);
  assert.match(setupPage, /recovery_path/);
  assert.match(setupPage, /key_1/);
  assert.match(setupPage, /key_2/);
});
