import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const phoneSource = fs.readFileSync(
  new URL("../src/components/InternationalPhoneField.tsx", import.meta.url),
  "utf8",
);
const signupSource = fs.readFileSync(
  new URL("../src/pages/SignupPage.tsx", import.meta.url),
  "utf8",
);

test("phone validation error is programmatically associated with the input", () => {
  assert.match(phoneSource, /const phoneErrorId = `\$\{phoneTestId\}-error`/);
  assert.match(phoneSource, /aria-describedby=\{phoneError \? phoneErrorId : undefined\}/);
  assert.match(phoneSource, /id=\{phoneErrorId\}/);
});

test("signup password validation errors are programmatically associated", () => {
  assert.match(signupSource, /aria-describedby=\{passwordInlineError \? "password-error" : undefined\}/);
  assert.match(signupSource, /id="password-error"/);
  assert.match(signupSource, /aria-describedby=\{confirmPasswordInlineError \? "confirm-password-error" : undefined\}/);
  assert.match(signupSource, /id="confirm-password-error"/);
});
