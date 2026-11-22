import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
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
  assert.match(signup, /googleMerchantNewSignupBuildReady\(\) &&/);
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

test('Google begin is reachable after an intentional role switch, not while old role cookies remain', () => {
  assert.match(server, /noMixedSession\(req\)/);
  assert.match(server, /!req\.cookies\?\.\[ADMIN_SESSION_COOKIE\] && !req\.cookies\?\.\[MERCHANT_SESSION_COOKIE\]/);

  for (const [page, name, before, call] of [
    [login, 'login', 'const handleGoogleLogin = async () => {', 'const dispose = await prepareGoogleMerchantLogin('],
    [signup, 'signup', 'const handleGoogleSignup = async () => {', 'const dispose = await prepareGoogleMerchantSignup('],
  ]) {
    const start = page.indexOf(before);
    const challenge = page.indexOf(call, start);
    assert.ok(start >= 0 && challenge > start, name + ': Google click must initiate challenge');
    const click = page.slice(start, challenge);
    const admin = click.indexOf('await secureAdminLogout();');
    const merchant = click.indexOf('await secureMerchantLogout();');
    const clear = click.indexOf('clearMerchantTabSession();');
    assert.ok(admin >= 0 && merchant > admin && clear > merchant,
      name + ': revoke both previous role cookies before the Google begin call');
  }
});

test('Google merchant local cache preserves phone-less accounts when switching identities', () => {
  for (const [page, name] of [[login, 'login'], [signup, 'signup']]) {
    const declaration = /function cacheMerchantLocally\(merchant: any\) \{[\s\S]*?\n\}/.exec(page)?.[0];
    assert.ok(declaration, name + ': local account cache helper is present');
    // Exercise the actual page helper in isolation without mounting a browser.
    const cache = declaration.replace('merchant: any', 'merchant');
    const reconcile = (prior, next) => {
      let saved = null;
      runInNewContext(cache + '\ncacheMerchantLocally(next)', {
        next,
        getMerchants: () => prior,
        saveMerchants: value => { saved = value; },
      });
      return Array.from(saved, value => value.id);
    };
    const prior = [
      { id: 'google-a', phone: null },
      { id: 'legacy-c', phone: '+15551234567' },
    ];
    assert.deepEqual(reconcile(prior, { id: 'google-b', phone: null }),
      ['google-b', 'google-a', 'legacy-c'], name + ': distinct unverified Google merchants must coexist');
    assert.deepEqual(reconcile(prior, { id: 'google-a', phone: null }),
      ['google-a', 'legacy-c'], name + ': same account must be replaced exactly once');
    assert.deepEqual(reconcile(prior, { id: 'legacy-d', phone: '+15551234567' }),
      ['legacy-d', 'google-a'], name + ': a real matching phone still deduplicates');
  }
});

test('new Google signup UI requires phone-claim build switch, but returning login does not', () => {
  assert.match(client, /export function googleMerchantNewSignupBuildReady\(\): boolean/);
  assert.match(client, /return googleMerchantSignupBuildReady\(\) &&\s*import\.meta\.env\.VITE_FAWRI_GOOGLE_PHONE_CLAIM === '1'/);
  assert.match(signup, /if \(!googleMerchantNewSignupBuildReady\(\) \|\| !googleProfileReady/);
  assert.match(signup, /\{googleMerchantNewSignupBuildReady\(\) && \(/);
  assert.doesNotMatch(signup, /googleMerchantSignupBuildReady\(\)/);
  assert.match(client, /if \(!googleMerchantNewSignupBuildReady\(\)\) \{\s*return Promise\.reject\(new Error\('GOOGLE_SIGNUP_DISABLED'\)\)/);
  // A provider pause may prevent first phone proof, but must not hide a
  // returning merchant's linked Google sign-in.
  assert.match(login, /\{googleMerchantSignupBuildReady\(\) && \(/);
  assert.match(client, /export function prepareGoogleMerchantLogin/);
});
