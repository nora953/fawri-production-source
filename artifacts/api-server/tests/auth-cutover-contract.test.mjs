import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

test("secure auth router precedes legacy business compatibility", async () => {
  const app = await source("src/app.ts");
  const secureMount = app.indexOf('app.use("/api/auth", authSecurityRouter)');
  const originGuard = app.indexOf('app.use("/api/auth", enforceAuthOrigin)');
  const bridge = app.indexOf("app.use(enforceAuthCutoverCompatibility)");
  const legacyRoot = app.indexOf('app.use("/api", router)');
  assert.ok(secureMount >= 0, "secure auth router must be mounted");
  assert.ok(originGuard > secureMount, "legacy auth business routes need origin protection");
  assert.ok(bridge > originGuard, "compatibility bridge must run after secure auth router");
  assert.ok(legacyRoot > bridge, "legacy business router must run only after v2 validation bridge");
});

test("client legacy credentials are not accepted as auth authority", async () => {
  const bridge = await source("src/middleware/authCutoverCompatibility.ts");
  assert.match(bridge, /LEGACY_ADMIN_BEARER_DISABLED/);
  assert.match(bridge, /delete req\.cookies\[LEGACY_MERCHANT_COOKIE\]/);
  assert.match(bridge, /requireSecureAdminSession/);
  assert.match(bridge, /requireSecureMerchantSession/);
  assert.match(bridge, /ROLE_SESSION_CONFUSION/);
  assert.match(bridge, /LEGACY_AUTH_ENDPOINT_DISABLED/);
  assert.match(bridge, /FAWRI_AUTH_SSE_REVALIDATE_MS/);
});

test("merchant operational authority uses the secure server session context", async () => {
  const middleware = await source("src/middleware/merchantOperationalAccess.ts");
  assert.match(middleware, /from "\.\/authSession"/);
  assert.doesNotMatch(
    middleware,
    /getMerchantIdFromSession,\s*requireMerchantSession,\s*verifyMerchantOAuthState,?\s*}\s*from "\.\.\/routes\/auth"/s,
  );
});

test("production password pepper fails closed", async () => {
  const passwordService = await source("src/services/authPasswordService.ts");
  assert.match(passwordService, /NODE_ENV === "production"/);
  assert.match(passwordService, /CONFIGURED_PASSWORD_SALT\.length < 32/);
  assert.match(passwordService, /FAWRI_PASSWORD_SALT must be explicitly configured/);
});

test("frontend login and transport no longer use a bearer credential", async () => {
  const login = await source("../fawri/src/pages/LoginPage.tsx");
  const client = await source("../fawri/src/lib/authClientCutover.ts");
  const app = await source("../fawri/src/App.tsx");

  assert.match(login, /\/api\/auth\/admin\/login/);
  assert.match(login, /credentials:\s*'same-origin'/);
  assert.doesNotMatch(login, /admin_token|setAdminSessionToken/);

  assert.match(client, /sessionStorage\.removeItem\(LEGACY_ADMIN_TOKEN_KEY\)/);
  assert.match(client, /headers\.delete\('Authorization'\)/);
  assert.match(client, /X-Fawri-Device-Id/);
  assert.match(client, /credentials:\s*'same-origin'/);

  assert.match(app, /installAuthClientCutover\(\)/);
  assert.match(app, /\/api\/auth\/admin\/me/);
  assert.doesNotMatch(app, /getAdminSessionToken|Authorization:\s*`Bearer/);
});

test("forced administrator password change revokes sessions and requires reauthentication", async () => {
  const helper = await source("src/routes/auth-password-route-support.ts");
  const dialog = await source(
    "../fawri/src/components/admin/RequiredAdminPasswordChangeDialog.tsx",
  );

  assert.match(helper, /forcedAdminChange/);
  assert.match(helper, /reason:\s*"password_changed"/);
  assert.match(helper, /clearAuthSessionCookie\(res, kind\)/);
  assert.match(dialog, /\/api\/auth\/admin\/change-password/);
  assert.match(dialog, /reauthentication_required/);
  assert.doesNotMatch(dialog, /admin_token|setAdminSessionToken/);
});

test("work monitor security actions are served by the v2 auth store", async () => {
  const adminRoutes = await source("src/routes/auth-admin-routes.ts");
  const store = await source("src/services/authSecurityStore.ts");
  const sessionStore = await source("src/services/authSessionSecurity.ts");

  assert.match(adminRoutes, /\/admins\/:adminId\/work-monitor/);
  assert.match(adminRoutes, /authSecurityStore\.listDevices\(id\)/);
  assert.match(adminRoutes, /authSecurityStore\.listActiveSessions\(id, "admin"\)/);
  assert.match(adminRoutes, /requireOwnerPassword/);
  assert.match(adminRoutes, /assistant_device_trusted/);
  assert.match(adminRoutes, /assistant_session_revoked/);
  assert.match(store, /revokeSessionForAccount/);
  assert.match(sessionStore, /revokeForAccount/);
});
