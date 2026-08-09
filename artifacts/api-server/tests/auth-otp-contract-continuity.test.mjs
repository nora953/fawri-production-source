import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

test("Auth v2 signup and verification are challenge based", async () => {
  const routes = await source("src/routes/auth-public-routes.ts");

  assert.match(routes, /router\.post\("\/signup"/);
  assert.match(routes, /challenge_id:\s*issued\.challengeId/);
  assert.match(routes, /router\.post\("\/verify-otp"/);
  assert.match(routes, /challengeId = String\(req\.body\?\.challenge_id \|\| ""\)/);
  assert.match(routes, /if \(!challengeId \|\| !\/\^\\d\{6\}\$\/\.test\(code\)\)/);
  assert.match(routes, /verifyOtpChallenge\(\{ challengeId, target: phone, purpose: "signup", code/);
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
  assert.match(routes, /verifyOtpChallenge\(\{ challengeId, target: phone, purpose: "password_reset", code/);
  assert.match(routes, /RECOVERY_CONFIRMATION_INVALID/);
  assert.match(routes, /reauthentication_required:\s*true/);
});
