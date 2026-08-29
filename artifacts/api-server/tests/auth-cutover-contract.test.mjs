import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early.\n${logs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready.\n${logs()}`);
}

function cookiePair(response, cookieName) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
  const cookie = setCookies.find((value) => value.startsWith(`${cookieName}=`));
  assert.ok(cookie, `${cookieName} cookie must be issued`);
  return cookie.split(";", 1)[0];
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

test("catalog gate reuses an already validated merchant context", async () => {
  const app = await source("src/app.ts");
  const start = app.indexOf("function enforceCatalogSecureSession");
  const end = app.indexOf("\n}\n\napp.use(", start);
  assert.ok(start >= 0 && end > start, "catalog secure-session gate must exist");
  const gate = app.slice(start, end);

  assert.match(gate, /getAuthContext\(res\)/);
  assert.match(gate, /existing\?\.merchantProfile/);
  assert.match(gate, /requireSecureMerchantSession\(req,\s*res,\s*next\)/);

  const bridgeMount = app.indexOf("app.use(enforceAuthCutoverCompatibility)");
  const catalogMount = app.indexOf("app.use(enforceCatalogSecureSession)");
  assert.ok(bridgeMount >= 0, "auth cutover compatibility must be mounted");
  assert.ok(catalogMount > bridgeMount, "catalog gate must run after v2 validation bridge");
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

test("business compatibility guard prefers the validated PostgreSQL merchant context", async () => {
  const auth = await source("src/routes/auth.ts");
  const legacyRuntime = await source("src/routes/authRuntimePart4.ts");

  assert.match(auth, /getAuthContext/);
  assert.match(auth, /getAuthContext\(res\)\?\.merchantProfile\?\.merchantId/);
  assert.match(auth, /res\.locals\.merchantId = merchantId/);
  assert.match(auth, /requireLegacyMerchantSession\(req, res, next\)/);

  const contextRead = auth.indexOf("getAuthContext(res)?.merchantProfile?.merchantId");
  const legacyFallback = auth.indexOf("requireLegacyMerchantSession(req, res, next)");
  assert.ok(contextRead >= 0, "secure merchant context must be read");
  assert.ok(
    legacyFallback > contextRead,
    "legacy guard may run only after the secure server-derived context is absent",
  );

  assert.doesNotMatch(
    auth,
    /notifyMerchantNewOrder,\s*requireMerchantSession,\s*verifyMerchantOAuthState/s,
  );
  assert.match(
    legacyRuntime,
    /!payload \|\| !merchantSessionAccountExists\(payload\.merchantId\)/,
    "legacy fallback must retain its existing account-existence fail-closed check",
  );
});

test(
  "validated PostgreSQL merchant context reaches business routes without merchants.json authority",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const { pool } = await import("@workspace/db");
    const merchantId = "auth-cutover-business-proof";
    const phone = "07899999991";
    const password = "BridgePass1!";
    const runtimeDirectory = await mkdtemp(
      path.join(os.tmpdir(), "fawri-auth-cutover-business-"),
    );
    const dataDirectory = path.join(runtimeDirectory, "data");
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(
      path.join(dataDirectory, "merchants.json"),
      JSON.stringify({
        merchants: [],
        subscriptions: [],
        otps: [],
        admin_logs: [],
        deletion_requests: [],
        channel_overrides: {},
        admin_notes: {},
        merchant_notifications: [],
        support_tickets: [],
      }),
    );

    await pool.query("DELETE FROM merchants WHERE id = $1", [merchantId]);
    await pool.query("DELETE FROM accounts WHERE id = $1 OR phone = $2", [
      merchantId,
      phone,
    ]);
    await pool.query(
      `INSERT INTO accounts (
         id, kind, phone, password_hash, password_version, security_version,
         state, language, phone_verified, phone_verified_at, session_version,
         created_at, updated_at
       ) VALUES (
         $1, 'merchant', $2, $3, 1, 1,
         'active', 'en', true, now(), 1,
         now(), now()
       )`,
      [merchantId, phone, password],
    );
    await pool.query(
      `INSERT INTO merchants (
         id, account_id, profile_kind, owner_name, store_name, activity_type,
         status, account_status, onboarding_status, trial_status,
         signup_source, requested_plan
       ) VALUES (
         $1, $1, 'merchant', 'Cutover Owner', 'Cutover Store', 'retail',
         'approved', 'approved', 'channel_connected', 'active',
         'direct', NULL
       )`,
      [merchantId],
    );

    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let serverOutput = "";
    const child = spawn(
      process.execPath,
      [path.join(apiRoot, "dist", "index.mjs")],
      {
        cwd: runtimeDirectory,
        env: {
          ...process.env,
          NODE_ENV: "test",
          PORT: String(port),
          LOG_LEVEL: "silent",
          BOT_DEBUG: "false",
          FAWRI_DATA_DIR: dataDirectory,
          FAWRI_PASSWORD_SALT: "auth-cutover-business-password-salt",
          FAWRI_AUTH_SECURITY_SECRET:
            "auth-cutover-business-session-secret-over-thirty-two-characters",
          FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
          FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
          FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
          FAWRI_SESSION_IDLE_TTL_MS: "60000",
          FAWRI_SESSION_ABSOLUTE_TTL_MS: "300000",
          FAWRI_SESSION_ROTATION_MS: "60000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (chunk) => {
      serverOutput += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      serverOutput += String(chunk);
    });

    t.after(async () => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await Promise.race([
          new Promise((resolve) => child.once("exit", resolve)),
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);
      }
      await pool.query("DELETE FROM merchants WHERE id = $1", [merchantId]);
      await pool.query("DELETE FROM accounts WHERE id = $1 OR phone = $2", [
        merchantId,
        phone,
      ]);
      await pool.end();
      await rm(runtimeDirectory, { recursive: true, force: true });
    });

    await waitForServer(baseUrl, child, () => serverOutput);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": "auth-cutover-proof-device",
      },
      body: JSON.stringify({
        phone,
        password,
        device_label: "Auth cutover proof device",
      }),
    });
    const loginBody = await login.json().catch(() => null);
    assert.equal(login.status, 200, JSON.stringify(loginBody));
    const merchantCookie = cookiePair(login, "fawri_merchant_session_v2");

    const legacyState = JSON.parse(
      await readFile(path.join(dataDirectory, "merchants.json"), "utf8"),
    );
    assert.deepEqual(legacyState.merchants, []);

    const catalog = await fetch(`${baseUrl}/api/catalog/products`, {
      headers: {
        Cookie: merchantCookie,
        "X-Fawri-Device-Id": "auth-cutover-proof-device",
      },
    });
    const catalogBody = await catalog.json().catch(() => null);
    assert.equal(catalog.status, 200, JSON.stringify(catalogBody));
    assert.equal(catalogBody?.merchant_id, merchantId);
    assert.deepEqual(catalogBody?.products, []);
  },
);

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
