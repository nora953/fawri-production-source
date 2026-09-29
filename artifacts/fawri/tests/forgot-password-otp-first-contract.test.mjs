import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const modal = await readFile(
  new URL('../src/components/ForgotPasswordModal.tsx', import.meta.url),
  'utf8',
);
const client = await readFile(
  new URL('../src/lib/passwordReset.ts', import.meta.url),
  'utf8',
);

test('forgot password verifies OTP before showing password stage', () => {
  assert.match(modal, /type Step = 'phone' \| 'verify' \| 'password'/);
  assert.match(modal, /setStep\('password'\)/);
  assert.match(modal, /step === 'verify'/);
  assert.match(modal, /onClick=\{handleVerifyCode\}/);
});

test('OTP verification and password confirmation use separate server endpoints', () => {
  assert.match(client, /fetch\('\/api\/auth\/password-reset\/verify'/);
  assert.match(client, /fetch\('\/api\/auth\/password-reset\/confirm'/);

  const confirmStart = client.indexOf('export async function confirmPasswordReset');
  const confirmSource = client.slice(confirmStart);
  assert.doesNotMatch(confirmSource, /challenge_id/);
  assert.doesNotMatch(confirmSource, /\bcode:/);
  assert.doesNotMatch(confirmSource, /\bphone:/);
});

test('verification input is six ASCII digits and password stage has no resend UI', () => {
  assert.match(modal, /replace\(\/\\D\/g, ''\)\.slice\(0, 6\)/);
  assert.match(modal, /form\.code\.length !== 6/);

  const passwordStage = modal.slice(
    modal.indexOf(") : (\\n            <>", modal.indexOf("step === 'verify'"))
  );
  assert.doesNotMatch(passwordStage, /<OtpResendSection/);
});
