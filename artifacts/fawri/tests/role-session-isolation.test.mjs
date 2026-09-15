import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const store = await readFile(new URL("../src/lib/store.ts", import.meta.url), "utf8");
const login = await readFile(new URL("../src/pages/LoginPage.tsx", import.meta.url), "utf8");
const dashboard = await readFile(
  new URL("../src/components/layout/DashboardLayout.tsx", import.meta.url),
  "utf8",
);
const authClient = await readFile(
  new URL("../src/lib/authClientCutover.ts", import.meta.url),
  "utf8",
);

function sliceBetween(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: start marker must exist`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label}: end marker must exist after start marker`);
  return source.slice(start, end);
}

test("merchant and administrator browser state stays isolated by tab and role", () => {
  assert.match(
    store,
    /sessionStorage\.getItem\(MERCHANT_SESSION_ID_KEY\)/,
    "merchant session id must remain tab-scoped",
  );
  assert.match(
    store,
    /merchants\.filter\(merchant => merchant\.is_admin !== true\)/,
    "administrator accounts must never enter merchant cache",
  );
  assert.match(
    store,
    /merchant => merchant\.id === id && merchant\.is_admin !== true/,
    "current merchant lookup must reject administrator records",
  );

  const merchantSuccess = sliceBetween(
    login,
    "if (\n        merchantAttempt.response.ok",
    "const mayBeAdmin =",
    "merchant login branch",
  );
  assert.match(
    merchantSuccess,
    /await secureAdminLogout\(\);/,
    "merchant login must revoke any administrator cookie session first",
  );
  assert.match(merchantSuccess, /clearMerchantTabSession\(\);/);
  assert.match(merchantSuccess, /cacheMerchantLocally\(user\);/);
  assert.match(merchantSuccess, /setSession\(user\.id\);/);

  const adminSuccess = sliceBetween(
    login,
    "const adminAttempt = await loginRequest(",
    "if (adminAttempt.result?.code === 'OWNER_DEVICE_OTP_REQUIRED')",
    "administrator login branch",
  );
  assert.match(
    adminSuccess,
    /await secureMerchantLogout\(\);/,
    "administrator login must revoke any merchant cookie session first",
  );
  assert.match(adminSuccess, /clearMerchantTabSession\(\);/);
  assert.doesNotMatch(
    adminSuccess,
    /cacheMerchantLocally\(/,
    "administrator login must not populate merchant cache",
  );
  assert.doesNotMatch(
    adminSuccess,
    /setSession\(/,
    "administrator login must not create a merchant tab session",
  );

  const ownerOtpSuccess = sliceBetween(
    login,
    "if (\n        response.ok &&\n        result?.ok &&\n        result?.admin_profile?.role === 'owner_admin'",
    "if (result?.code === 'OTP_INVALID')",
    "owner device OTP success branch",
  );
  assert.match(ownerOtpSuccess, /await secureMerchantLogout\(\);/);
  assert.match(ownerOtpSuccess, /clearMerchantTabSession\(\);/);
  assert.doesNotMatch(ownerOtpSuccess, /cacheMerchantLocally\(/);
  assert.doesNotMatch(ownerOtpSuccess, /setSession\(/);

  assert.match(
    authClient,
    /sessionStorage\.removeItem\(LEGACY_ADMIN_TOKEN_KEY\);/,
    "legacy administrator bearer token must be removed from browser storage",
  );
  assert.match(
    authClient,
    /headers\.delete\('Authorization'\);/,
    "same-origin Auth v2 transport must strip legacy bearer credentials",
  );
  assert.match(
    authClient,
    /credentials: 'same-origin'/,
    "Auth v2 browser transport must use HttpOnly same-origin cookie sessions",
  );
  assert.match(authClient, /fetch\('\/api\/auth\/admin\/logout'/);
  assert.match(authClient, /fetch\('\/api\/auth\/logout'/);

  assert.match(
    dashboard,
    /const lifecycle = await checkMerchantLifecycle\(controller\.signal\);/,
    "merchant dashboard access must be revalidated against server authority",
  );
  assert.match(dashboard, /lifecycle\.reason === 'unauthenticated' \? '\/login' : '\/pending'/);
  assert.match(dashboard, /updated\.is_admin === true/);
  assert.match(dashboard, /clearMerchantTabSession\(\);/);
  assert.match(dashboard, /if \(checkingAccess\)/);
});
