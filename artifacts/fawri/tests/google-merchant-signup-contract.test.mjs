import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../src/lib/googleMerchantSignup.ts', import.meta.url), 'utf8');
const signup = readFileSync(new URL('../src/pages/SignupPage.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../api-server/src/routes/auth-google-merchant-routes.ts', import.meta.url), 'utf8');

test('Google signup client is build-time opt-in and uses only official GIS script', () => {
  assert.match(client, /VITE_FAWRI_GOOGLE_MERCHANT_SIGNUP === '1'/);
  assert.match(client, /VITE_FAWRI_GOOGLE_OAUTH_CLIENT_ID/);
  assert.match(client, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.doesNotMatch(client, /localStorage\.|sessionStorage\.|document\.cookie/);
  assert.match(client, /auto_select: false/);
  assert.match(client, /ux_mode: 'popup'/);
});

test('Google signup is nonce/CSRF server-bound without browser JWT persistence', () => {
  assert.match(client, /\/api\/auth\/google\/begin/);
  assert.match(client, /\/api\/auth\/google\/complete/);
  assert.match(client, /credentials: 'same-origin'/);
  assert.match(client, /nonce: challenge\.nonce/);
  assert.match(client, /id_token: token/);
  assert.match(client, /trial_activated !== false/);
  assert.match(client, /merchant_profile\.tenantId !== v\.account\.id/);
  assert.match(server, /csrfProofFromCookie: csrfProof/);
  assert.match(server, /googleOriginAllowed/);
  assert.match(server, /trial_activated: false/);
  assert.match(server, /googleMerchantHttpReady\(\)/);
});

test('Google signup UX is separately gated and retains normal password-OTP signup', () => {
  assert.match(signup, /googleMerchantSignupBuildReady\(\) &&/);
  assert.match(signup, /disabled=\{loading \|\| googlePreparing \|\| !googleProfileReady\}/);
  assert.match(signup, /formData\.agree_terms && formData\.confirm_legal/);
  assert.match(signup, /type="button"[\s\S]*?onClick=\{handleGoogleSignup\}/);
  assert.match(signup, /prepareGoogleMerchantSignup/);
  assert.match(signup, /setLocation\(account\.merchant_profile\.accountStatus === 'approved'/);
  assert.match(signup, /fetch\('\/api\/auth\/signup'/);
  assert.match(signup, /savePendingSignupChallenge\(challenge\)/);
  assert.match(signup, /disabled=\{loading \|\| !isFormReady\}/);
});
