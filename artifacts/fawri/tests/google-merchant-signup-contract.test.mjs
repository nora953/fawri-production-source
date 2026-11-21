import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const client = readFileSync(new URL('../src/lib/googleMerchantSignup.ts', import.meta.url), 'utf8');
const signup = readFileSync(new URL('../src/pages/SignupPage.tsx', import.meta.url), 'utf8');
const login = readFileSync(new URL('../src/pages/LoginPage.tsx', import.meta.url), 'utf8');
const admission = readFileSync(new URL('../../api-server/src/services/googleMerchantAdmissionAuthority.ts', import.meta.url), 'utf8');
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

test('returning Google merchant login is gated, uses nonce flow, and cannot create a store', () => {
  assert.match(client, /export function prepareGoogleMerchantLogin/);
  assert.match(client, /prepareGoogleMerchantIdentity\(container, undefined, 'signin_with'/);
  assert.match(client, /if \(!profile && account\.created\)/);
  assert.match(login, /googleMerchantSignupBuildReady\(\) &&/);
  assert.match(login, /prepareGoogleMerchantLogin/);
  assert.match(login, /setSession\(account\.account\.id\)/);
  assert.match(login, /merchant_profile\.accountStatus === 'approved'/);
  assert.match(admission, /a\.google_issuer = \$1 AND a\.google_subject = \$2/);
  const lookup = admission.indexOf('if (existing[0])');
  const requiredProfile = admission.indexOf('const ownerName = validatedText(input.ownerName, 160)');
  assert.ok(lookup >= 0 && requiredProfile > lookup);
  assert.match(admission, /created: false, trialActivated: false/);
  assert.match(admission, /created: true, trialActivated: false/);
});


// Vite inlines VITE_ values when Docker builds the commercial frontend.
// An environment-only runtime toggle on Render does not alter that bundle.
test('Render Docker build passes Google-only PUBLIC flags to Vite and fails closed on unsafe combinations', () => {
  const dockerfile = readFileSync(new URL('../../../Dockerfile.staging', import.meta.url), 'utf8');
  const build = dockerfile.indexOf('RUN pnpm --filter @workspace/fawri build');
  assert.ok(build > 0);
  for (const arg of [
    'ARG VITE_FAWRI_GOOGLE_MERCHANT_SIGNUP=0',
    'ARG VITE_FAWRI_GOOGLE_PHONE_CLAIM=0',
    'ARG VITE_FAWRI_GOOGLE_OAUTH_CLIENT_ID=',
  ]) {
    const location = dockerfile.indexOf(arg);
    assert.ok(location > 0 && location < build, arg);
  }
  assert.doesNotMatch(dockerfile, /^ARG (WHATSAPP_ACCESS_TOKEN|DATABASE_URL|FAWRI_AUTH_DATABASE_URL)=/m);
  const guard = /^RUN node -e '([^'\n]+)'$/m.exec(dockerfile)?.[1];
  assert.ok(guard && dockerfile.indexOf('V1_GOOGLE_BUILD_CONFIGURATION_INVALID') < build);
  for (const [signup, phone, clientId, accepted] of [
    ['0', '0', '', true],
    ['1', '0', '12345-fawri.apps.googleusercontent.com', true],
    ['1', '1', '12345-fawri.apps.googleusercontent.com', true],
    ['0', '1', '', false],
    ['1', '0', '', false],
    ['1', '0', 'invalid', false],
    ['true', '0', '12345-fawri.apps.googleusercontent.com', false],
    ['0', 'true', '', false],
  ]) {
    const result = spawnSync(process.execPath, ['-e', guard], {
      encoding: 'utf8',
      env: { ...process.env,
        VITE_FAWRI_GOOGLE_MERCHANT_SIGNUP: signup,
        VITE_FAWRI_GOOGLE_PHONE_CLAIM: phone,
        VITE_FAWRI_GOOGLE_OAUTH_CLIENT_ID: clientId,
      },
    });
    assert.equal(result.status === 0, accepted, signup + '/' + phone + '/' + clientId);
    if (!accepted) assert.match(result.stderr, /V1_GOOGLE_BUILD_CONFIGURATION_INVALID/);
  }
});
