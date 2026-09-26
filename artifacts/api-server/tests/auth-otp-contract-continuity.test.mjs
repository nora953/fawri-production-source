import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(apiRoot, "../..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

async function workspaceSource(relativePath) {
  return readFile(path.join(workspaceRoot, relativePath), "utf8");
}

test("server test-code guards require both non-production and explicit opt-in", async () => {
  const common = await source("src/routes/auth-route-common.ts");
  const legacy = await source("src/routes/authRuntimePart2.ts");
  const devCodeBody = common.match(/export function devCode\(code: string\) \{([\s\S]*?)\n\}/)?.[1];
  const includeBody = legacy.match(/function includeDevCode\(\): boolean \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(devCodeBody);
  assert.ok(includeBody);
  for (const NODE_ENV of ["production", "development", "test", undefined]) {
    for (const AUTH_INCLUDE_DEV_CODE of ["true", "false", "TRUE", undefined]) {
      const process = { env: { NODE_ENV, AUTH_INCLUDE_DEV_CODE } };
      const allowed = NODE_ENV !== "production" && AUTH_INCLUDE_DEV_CODE === "true";
      assert.deepEqual(new Function("process", "code", devCodeBody)(process, "012345"), allowed ? { devCode: "012345" } : {});
      assert.equal(new Function("process", includeBody)(process), allowed);
    }
  }
  const routes = await source("src/routes/auth-public-routes.ts");
  for (const endpoint of ["/signup", "/otp/resend"]) {
    const start = routes.indexOf(`router.post("${endpoint}"`);
    assert.ok(start >= 0);
    const next = routes.indexOf("router.post(", start + 1);
    assert.match(routes.slice(start, next < 0 ? undefined : next), /\.\.\.devCode\(issued\.code\)/);
  }
});

test("Auth v2 signup and verification are challenge based", async () => {
  const routes = await source("src/routes/auth-public-routes.ts");

  assert.match(routes, /router\.post\("\/signup"/);
  assert.match(routes, /challenge_id:\s*issued\.challengeId/);
  assert.match(routes, /router\.post\("\/verify-otp"/);
  assert.match(routes, /challengeId = String\(req\.body\?\.challenge_id \|\| ""\)/);
  assert.match(routes, /if \(!challengeId \|\| !\/\^\\d\{6\}\$\/\.test\(code\)\)/);
  assert.match(
    routes,
    /verifyMerchantOtpChallengeAuthoritative\(\{\s*challengeId,\s*target:\s*phone,\s*purpose:\s*"signup",\s*code,/s,
  );
});

test("OTP resend returns a replacement challenge and backend invalidates superseded challenges", async () => {
  const routes = await source("src/routes/auth-public-routes.ts");
  const otp = await source("src/services/authOtpSecurity.ts");

  assert.match(routes, /router\.post\("\/otp\/resend"/);
  assert.match(routes, /challenge_id:\s*issued\.challengeId/);
  assert.match(routes, /retry_after_seconds:\s*issued\.retryAfterSeconds/);

  assert.match(
    otp,
    /for \(const challenge of data\.otp_challenges\) if \(challenge\.target_hash === targetHash && challenge\.purpose === input\.purpose && !challenge\.used_at && !challenge\.revoked_at\) challenge\.revoked_at =/,
  );
  assert.match(otp, /if \(challenge\.used_at\) return "used"/);
  assert.match(otp, /if \(challenge\.revoked_at\) return "invalid"/);
  assert.match(otp, /if \(Date\.parse\(challenge\.expires_at\) <= now\) return "expired"/);
});

test("password recovery request and confirmation use the challenge authority", async () => {
  const routes = await source("src/routes/auth-public-routes.ts");

  assert.match(routes, /router\.post\("\/password-reset\/request"/);
  assert.match(routes, /issueOtp\(req, phone, "password_reset"\)/);
  assert.match(routes, /challenge_id:\s*issued\.challengeId/);

  assert.match(routes, /router\.post\("\/password-reset\/confirm"/);
  assert.match(routes, /challengeId = String\(req\.body\?\.challenge_id \|\| ""\)/);
  assert.match(
    routes,
    /verifyMerchantOtpChallengeAuthoritative\(\{\s*challengeId,\s*target:\s*phone,\s*purpose:\s*"password_reset",\s*code,/s,
  );
  assert.match(routes, /RECOVERY_CONFIRMATION_INVALID/);
  assert.match(routes, /reauthentication_required:\s*true/);
});

test("owner new-device login requires OTP while assistant new-device login requires owner approval", async () => {
  const loginSupport = await source("src/routes/auth-login-route-support.ts");
  const routes = await source("src/routes/auth-public-routes.ts");
  const types = await source("src/services/authSecurityTypes.ts");

  assert.match(types, /"admin_device_verification"/);
  assert.doesNotMatch(loginSupport, /FAWRI_OWNER_BOOTSTRAP_DEVICE_ID/);
  assert.match(
    loginSupport,
    /found\.adminProfile\?\.role === "owner_admin"[\s\S]*issueOtp\([\s\S]*"admin_device_verification"[\s\S]*OWNER_DEVICE_OTP_REQUIRED/,
  );
  assert.match(loginSupport, /ADMIN_DEVICE_APPROVAL_REQUIRED/);
  assert.match(routes, /router\.post\("\/admin\/device-otp\/resend"/);
  assert.match(routes, /router\.post\("\/admin\/device-otp\/verify"/);
  assert.match(
    routes,
    /verifyOtpChallenge\(\{\s*challengeId,\s*target:\s*phone,\s*purpose:\s*"admin_device_verification",\s*code,/s,
  );
  assert.match(
    routes,
    /setDeviceTrust\(\{\s*deviceRecordId:\s*current\.device\.id,\s*trusted:\s*true,\s*actorAccountId:\s*account\.account\.id,/s,
  );
  assert.match(routes, /setAuthSessionCookie\(res, "admin", issued\)/);
});

test("preview runtime is singleton and only exposes development OTP codes outside production", async () => {
  const preview = await workspaceSource("scripts/run-fawri-preview.mjs");
  const loginPage = await workspaceSource("artifacts/fawri/src/pages/LoginPage.tsx");
  const resend = await workspaceSource("artifacts/fawri/src/components/OtpResendSection.tsx");

  assert.match(preview, /acquirePreviewLock\(\)/);
  assert.match(preview, /Another Fawri preview is already running/);
  assert.match(preview, /process\.env\.NODE_ENV !== "production"/);
  assert.match(preview, /AUTH_ALLOW_DEV_OTP_BYPASS/);
  assert.match(preview, /AUTH_INCLUDE_DEV_CODE/);

  assert.match(loginPage, /OTP_DELIVERY_NOT_CONFIGURED/);
  assert.match(loginPage, /OTP_DELIVERY_FAILED/);
  assert.match(loginPage, /previewOtpLabel/);
  assert.match(loginPage, /devCode:\s*previewDevCode/);
  assert.match(resend, /devCode\?: string/);
  assert.match(resend, /devCode:\s*previewDevCode\(result\.devCode\)/);
});
