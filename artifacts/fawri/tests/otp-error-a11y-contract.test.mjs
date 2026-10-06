import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const signupOtpSource = fs.readFileSync(
  new URL("../src/pages/OTPPage.tsx", import.meta.url),
  "utf8",
);
const loginSource = fs.readFileSync(
  new URL("../src/pages/LoginPage.tsx", import.meta.url),
  "utf8",
);

test("signup OTP errors are announced and associated with the OTP input", () => {
  assert.match(signupOtpSource, /aria-invalid=\{!!displayedError\}/);
  assert.match(signupOtpSource, /aria-describedby=\{displayedError \? "signup-otp-error" : undefined\}/);
  assert.match(signupOtpSource, /id="signup-otp-error"[^>]*role="alert"/);
});

test("owner device OTP errors are announced and associated with the OTP input", () => {
  assert.match(loginSource, /aria-invalid=\{!!ownerOtpError\}/);
  assert.match(loginSource, /aria-describedby=\{ownerOtpError \? "owner-device-otp-error" : undefined\}/);
  assert.match(loginSource, /id="owner-device-otp-error"[^>]*role="alert"/);
});
