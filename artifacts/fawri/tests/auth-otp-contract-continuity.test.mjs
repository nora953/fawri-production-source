import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";

const fawriRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(fawriRoot, relativePath), "utf8");
}

test("preview signup test code survives reload and resend replaces or clears it", async () => {
  const helper = stripTypeScriptTypes(await source("src/lib/authOtpChallenge.ts"));
  const context = await import(`data:text/javascript;base64,${Buffer.from(helper).toString("base64")}`);
  const values = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { sessionStorage: {
    setItem: (key, value) => values.set(key, value),
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  } };
  try {
    const input = { challengeId: "signup-1", phone: "+9647700000000", purpose: "signup",
      expiresAt: new Date(Date.now() + 60_000).toISOString(), devCode: "012345" };
    context.savePendingSignupChallenge(context.createOtpChallengeContext(input));
    assert.equal(context.readPendingSignupChallenge().devCode, "012345");
    for (const devCode of ["654321", undefined, "invalid", "12345", "1234567"]) {
      const replacement = context.createOtpChallengeContext({ ...input, challengeId: "signup-2", devCode });
      context.savePendingSignupChallenge(replacement);
      const restored = context.readPendingSignupChallenge();
      assert.equal(restored.challengeId, "signup-2");
      assert.equal(restored.devCode, devCode === "654321" ? devCode : undefined);
      assert.doesNotMatch([...values.values()][0], /012345/);
    }
    context.savePendingSignupChallenge(context.createOtpChallengeContext({ ...input, expiresAt: "2000-01-01" }));
    assert.equal(context.readPendingSignupChallenge(), null);
    assert.equal(values.size, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("signup and resend wire the optional server test code into the labelled OTP UI", async () => {
  const signup = await source("src/pages/SignupPage.tsx");
  const otp = await source("src/pages/OTPPage.tsx");
  assert.match(signup, /devCode:\s*result\.devCode/);
  assert.match(otp, /devCode:\s*resentChallenge\.devCode/);
  assert.match(otp, /signupChallenge\?\.devCode && \(/);
  assert.match(otp, /t\.forgot_dev_code/);
  assert.match(otp, /\{signupChallenge\.devCode\}/);
  assert.doesNotMatch(otp, /setValue\([^)]*devCode/);
});

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

test("pending signup persistence is session scoped and never stores entered OTP values", async () => {
  const helper = await source("src/lib/authOtpChallenge.ts");
  const signup = await source("src/pages/SignupPage.tsx");
  const otp = await source("src/pages/OTPPage.tsx");

  assert.match(helper, /window\.sessionStorage\.setItem/);
  assert.match(helper, /fawri_signup_otp_challenge_v2/);
  assert.doesNotMatch(helper, /localStorage/);
  assert.doesNotMatch(helper, /input\.code|parsed\.code/);
  assert.match(signup, /devCode:\s*result\.devCode/);
  assert.doesNotMatch(otp, /sessionStorage\.setItem\([^\n]*code/i);
});
