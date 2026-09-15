import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const fawriRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(fawriRoot, relativePath), "utf8");
}

test("signup challenge reaches OTP verification without a phone-only fallback", async () => {
  const signup = await source("src/pages/SignupPage.tsx");
  const otp = await source("src/pages/OTPPage.tsx");

  assert.match(signup, /challengeId:\s*result\.challenge_id/);
  assert.match(signup, /savePendingSignupChallenge\(challenge\)/);
  assert.match(signup, /setLocation\('\/verify-otp'\)/);
  assert.doesNotMatch(signup, /fawri_signup_phone/);

  assert.match(otp, /readPendingSignupChallenge\(\)/);
  assert.match(otp, /challenge_id:\s*signupChallenge\.challengeId/);
  assert.match(otp, /phone:\s*signupChallenge\.phone/);
  assert.match(otp, /code:\s*value/);
  assert.doesNotMatch(otp, /JSON\.stringify\(\{\s*phone\s*,\s*code:\s*value\s*\}\)/s);
  assert.match(otp, /!signupChallenge\s*\|\|\s*isOtpChallengeExpired\(signupChallenge\)/);
});

test("resend replaces the active signup challenge used by later verification", async () => {
  const resend = await source("src/components/OtpResendSection.tsx");
  const otp = await source("src/pages/OTPPage.tsx");

  assert.match(resend, /challenge_id\?:\s*string/);
  assert.match(resend, /const challengeId = String\(result\.challenge_id \|\| ''\)\.trim\(\)/);
  assert.match(resend, /if \(!challengeId\)/);
  assert.match(resend, /onChallengeUnavailable\?\.\(\)/);
  assert.match(resend, /onResent\?\.\(\{\s*challengeId,/s);

  assert.match(otp, /onResent=\{\(resentChallenge\) => \{/);
  assert.match(otp, /challengeId:\s*resentChallenge\.challengeId/);
  assert.match(otp, /savePendingSignupChallenge\(replacement\)/);
  assert.match(otp, /setSignupChallenge\(replacement\)/);
  assert.match(otp, /challenge_id:\s*signupChallenge\.challengeId/);
});

test("password recovery retains and confirms the authoritative challenge", async () => {
  const passwordReset = await source("src/lib/passwordReset.ts");
  const modal = await source("src/components/ForgotPasswordModal.tsx");

  assert.match(passwordReset, /challenge_id\?:\s*string/);
  assert.match(passwordReset, /if \(!result\.challenge_id\)/);
  assert.match(passwordReset, /challenge_id:\s*cleanChallengeId/);
  assert.match(passwordReset, /new_password:\s*newPassword/);
  assert.match(passwordReset, /confirm_password:\s*confirmPassword/);
  assert.doesNotMatch(passwordReset, /body:\s*JSON\.stringify\(\{\s*phone:\s*cleanPhone,\s*code:\s*cleanCode,\s*newPassword/s);

  assert.match(modal, /const \[recoveryChallenge, setRecoveryChallenge\]/);
  assert.match(modal, /setRecoveryChallenge\(challenge\)/);
  assert.match(modal, /recoveryChallenge\.challengeId/);
  assert.match(modal, /challengeId:\s*resentChallenge\.challengeId/);
  assert.match(modal, /onChallengeUnavailable=\{restartRecovery\}/);
  assert.match(modal, /recoveryChallengeExpired\(recoveryChallenge\)/);
});

test("pending signup persistence is scoped and never persists an OTP code", async () => {
  const helper = await source("src/lib/authOtpChallenge.ts");
  const signup = await source("src/pages/SignupPage.tsx");
  const otp = await source("src/pages/OTPPage.tsx");

  assert.match(helper, /window\.sessionStorage\.setItem/);
  assert.match(helper, /fawri_signup_otp_challenge_v2/);
  assert.doesNotMatch(helper, /localStorage/);
  assert.doesNotMatch(helper, /\bcode\b/);
  assert.doesNotMatch(signup, /devCode/);
  assert.doesNotMatch(otp, /sessionStorage\.setItem\([^\n]*code/i);
});
