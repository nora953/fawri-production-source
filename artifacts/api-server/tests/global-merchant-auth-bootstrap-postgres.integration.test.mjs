import { cleanupResources, stopTestChild } from "./helpers/cleanup-resources.mjs";
import { assertDisposablePostgres } from "../../../scripts/lib/disposable-postgres-test-guard.mjs";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

if (process.env.DATABASE_URL) await assertDisposablePostgres();

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

function suffix() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to reserve API test port")));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, child, getLogs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The unified API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready.\n${getLogs()}`);
}

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function cookieByName(response, name) {
  const prefix = `${name}=`;
  for (const header of responseCookies(response)) {
    for (const candidate of String(header).split(/,(?=[^;,]+=)/)) {
      const cookie = candidate.trim().split(";", 1)[0];
      if (cookie.startsWith(prefix)) return cookie;
    }
  }
  return "";
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

test(
  "merchant signup, OTP verification and login keep credentials PostgreSQL-backed and hashed",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const {createDisposableKnowledgeRuntime}=await import("./helpers/disposable-knowledge-runtime.mjs");
    const runtimeFixture=await createDisposableKnowledgeRuntime();
    const pool=runtimeFixture.admin;
    const id = suffix();
    const phone = `+9665${String(crypto.randomInt(0, 100_000_000)).padStart(8, "0")}`;
    const password = "GoldenAuth1!";
    const deviceId = `golden-auth-device-${id}`;
    const dataDirectory = path.join(os.tmpdir(), `fawri-golden-auth-${id}`);
    const runtimeDirectory = path.join(dataDirectory, "runtime");
    let merchantId = "";
    let phoneOwned = false;
    const peerId = `golden-self-peer-${id}`;
    let peerOwned = false;

    let child;
    t.after(async () => cleanupResources([
      ["server", () => stopTestChild(child)],
      ["fixture accounts", async () => {
        if (peerOwned) await pool.query("DELETE FROM accounts WHERE id = $1", [peerId]);
        if (phoneOwned) await pool.query("DELETE FROM accounts WHERE phone = $1 AND kind = 'merchant'", [phone]);
      }],
      ["actual runtime fixture", () => runtimeFixture.dispose()],
      ["temporary directory", () => rm(dataDirectory, { recursive: true, force: true })],
    ]));

    await mkdir(runtimeDirectory, { recursive: true });
    const collision = await pool.query(
      "SELECT id FROM accounts WHERE phone = $1 LIMIT 1",
      [phone],
    );
    assert.equal(
      collision.rows.length,
      0,
      "generated auth-bootstrap phone must not collide with an existing account",
    );

    phoneOwned = true;

    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let serverOutput = "";
    child = spawn(process.execPath, [serverEntry], {
      cwd: runtimeDirectory,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        LOG_LEVEL: "silent",
        BOT_DEBUG: "false",
        FAWRI_DATA_DIR: dataDirectory,
        FAWRI_PASSWORD_SALT: "global-golden-auth-password-salt-over-thirty-two-characters",
        FAWRI_AUTH_SECURITY_SECRET:
          "global-golden-auth-session-secret-over-thirty-two-characters",
        FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
        FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
        FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
        AUTH_ALLOW_DEV_OTP_BYPASS: "true",
        AUTH_INCLUDE_DEV_CODE: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });

    await waitForServer(baseUrl, child, () => serverOutput);

    const unknownPhone = phone.slice(0, -1) + ((Number(phone.at(-1)) + 1) % 10);
    assert.equal((await pool.query("SELECT id FROM accounts WHERE phone = $1", [unknownPhone])).rowCount, 0);
    const resendObservations = [];
    async function ineligibleResend(targetPhone, purpose, label) {
      async function snapshot() {
        const result = await pool.query(`SELECT
          (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb) FROM accounts a WHERE phone = ANY($1::text[])) AS accounts,
          (SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.id), '[]'::jsonb) FROM auth_otp_challenges o) AS challenges,
          (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) FROM account_sessions s WHERE account_id IN (SELECT id FROM accounts WHERE phone = ANY($1::text[]))) AS sessions,
          (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]'::jsonb) FROM trusted_devices d WHERE account_id IN (SELECT id FROM accounts WHERE phone = ANY($1::text[]))) AS devices`, [[phone, unknownPhone]]);
        return result.rows[0];
      }
      const before = await snapshot();
      const denied = await jsonRequest(`${baseUrl}/api/auth/otp/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Fawri-Device-Id": deviceId },
        body: JSON.stringify({ phone: targetPhone, purpose }),
        signal: AbortSignal.timeout(3000),
      });
      assert.equal(denied.response.status, 202);
      assert.equal(denied.body?.ok, true);
      assert.equal(cookieByName(denied.response, "fawri_merchant_session_v2"), "");
      for (const key of ["devCode", "account", "merchant"]) {
        assert.equal(denied.body?.[key], undefined);
      }
      if (purpose === "password_reset") {
        assert.match(String(denied.body?.challenge_id || ""), /^[0-9a-f-]{36}$/i);
        assert.equal(denied.body?.retry_after_seconds, 60);
        assert.ok(Number.isFinite(Date.parse(denied.body?.expires_at)));
        assert.equal((await pool.query("SELECT id FROM auth_otp_challenges WHERE id = $1", [denied.body.challenge_id])).rowCount, 0,
          "generic recovery response challenge must remain synthetic");
      } else {
        for (const key of ["challenge_id", "expires_at", "retry_after_seconds"]) assert.equal(denied.body?.[key], undefined);
      }
      assert.deepEqual(await snapshot(), before, "ineligible resend must not issue OTP/session or mutate account/device rows");
      resendObservations.push({ label, purpose, status: denied.response.status, unchangedState: true, durableChallengeCreated: false, sessionIssued: false });
    }
    await ineligibleResend(unknownPhone, "signup", "unknown-account");
    await ineligibleResend(unknownPhone, "password_reset", "unknown-account");

    const signup = await jsonRequest(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": deviceId,
      },
      body: JSON.stringify({
        phone,
        password,
        owner_name: "Golden Auth Owner",
        store_name: "Golden Auth Store",
        activity_type: "retail",
        country_code: "SA",
        currency_code: "SAR",
        timezone: "Asia/Riyadh",
        language: "en",
      }),
    });
    assert.equal(signup.response.status, 201, JSON.stringify(signup.body));
    assert.equal(signup.body?.ok, true);
    assert.ok(signup.body?.challenge_id);
    assert.match(String(signup.body?.devCode || ""), /^\d{6}$/);
    merchantId = String(signup.body?.merchant?.id || signup.body?.account?.id || "");
    assert.ok(merchantId, "signup must return the PostgreSQL merchant identity");

    const credential = await pool.query(
      `SELECT a.password_hash, a.phone_verified, a.phone,
              m.country_code, m.currency_code, m.timezone
         FROM accounts AS a
         JOIN merchants AS m ON m.id = a.id AND m.account_id = a.id
        WHERE a.id = $1 AND a.kind = 'merchant'`,
      [merchantId],
    );
    assert.equal(credential.rows.length, 1);
    assert.notEqual(credential.rows[0].password_hash, password);
    assert.match(
      String(credential.rows[0].password_hash || ""),
      /^sha256\$v2\$scrypt\$/,
      "signup must persist the current scrypt password format",
    );
    assert.equal(credential.rows[0].phone_verified, false);
    assert.equal(credential.rows[0].phone, phone);
    assert.equal(credential.rows[0].country_code, "SA");
    assert.equal(credential.rows[0].currency_code, "SAR");
    assert.equal(credential.rows[0].timezone, "Asia/Riyadh");

    const verified = await jsonRequest(`${baseUrl}/api/auth/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": deviceId,
      },
      body: JSON.stringify({
        phone,
        challenge_id: signup.body.challenge_id,
        code: signup.body.devCode,
      }),
    });
    assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body?.ok, true);
    assert.equal(verified.body?.merchant?.id, merchantId);
    assert.ok(
      cookieByName(verified.response, "fawri_merchant_session_v2"),
      "OTP verification must issue a secure v2 merchant session",
    );

    const verifiedRow = await pool.query(
      "SELECT phone_verified FROM accounts WHERE id = $1 AND kind = 'merchant'",
      [merchantId],
    );
    assert.equal(verifiedRow.rows[0]?.phone_verified, true);
    await ineligibleResend(phone, "signup", "already-verified-account");
    assert.equal(resendObservations.length, 3);
    console.log("P0_MERCHANT_INELIGIBLE_OTP_RESEND_OBSERVED " + JSON.stringify({ observations: resendObservations, actualApp: true, devOtpOnly: true }));

    const login = await jsonRequest(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": deviceId,
      },
      body: JSON.stringify({
        phone,
        password,
        device_label: "Golden auth bootstrap device",
      }),
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.body));
    assert.equal(login.body?.merchant?.id, merchantId);
    assert.ok(
      cookieByName(login.response, "fawri_merchant_session_v2"),
      "hashed-password login must issue the secure v2 merchant session cookie",
    );

    const originalCookie = cookieByName(login.response, "fawri_merchant_session_v2");
    const verificationCookie = cookieByName(verified.response, "fawri_merchant_session_v2");
    const peerDevice = `golden-self-peer-device-${id}`;
    await pool.query(`INSERT INTO accounts
      (id, kind, phone, password_hash, state, language, phone_verified, phone_verified_at)
      SELECT $2, 'merchant', $3, password_hash, 'active', language, TRUE, now()
      FROM accounts WHERE id = $1`, [merchantId, peerId, unknownPhone]);
    peerOwned = true;
    await pool.query(`INSERT INTO merchants
      (id, account_id, owner_name, store_name, activity_type, status, account_status, onboarding_status, country_code, currency_code, timezone)
      SELECT $2, $2, 'Peer Owner', 'Peer Store', activity_type, status, account_status, onboarding_status, country_code, currency_code, timezone
      FROM merchants WHERE id = $1`, [merchantId, peerId]);
    async function secureRequest(endpoint, cookie, device = deviceId, method = "GET", body) {
      return jsonRequest(`${baseUrl}/api/auth/${endpoint}`, {
        method,
        headers: { ...(cookie ? { Cookie: cookie } : {}), "X-Fawri-Device-Id": device,
          ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(3000),
      });
    }
    async function passwordLogin(loginPhone, loginPassword, device = deviceId) {
      return jsonRequest(`${baseUrl}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Fawri-Device-Id": device },
        body: JSON.stringify({ phone: loginPhone, password: loginPassword }),
        signal: AbortSignal.timeout(3000),
      });
    }
    const peerLogin = await passwordLogin(unknownPhone, password, peerDevice);
    assert.equal(peerLogin.response.status, 200, JSON.stringify(peerLogin.body));
    const peerCookie = cookieByName(peerLogin.response, "fawri_merchant_session_v2");
    assert.ok(peerCookie);
    const lifecycleRow = (await pool.query(
      "SELECT account_status, onboarding_status FROM merchants WHERE id = $1", [merchantId])).rows[0];
    for (const endpoint of ["me", "lifecycle"]) {
      for (const [cookie, device] of [[undefined, deviceId], ["fawri_merchant_session_v2=invalid", deviceId], [originalCookie, peerDevice]]) {
        assert.equal((await secureRequest(endpoint, cookie, device)).response.status, 401);
      }
      const own = await secureRequest(`${endpoint}?merchant_id=${peerId}&merchantId=${peerId}&phone=${unknownPhone}`, originalCookie);
      assert.equal(own.response.status, 200, JSON.stringify(own.body));
      assert.match(own.response.headers.get("cache-control") || "", /no-store/);
      if (endpoint === "me") {
        assert.equal(own.body?.account?.id, merchantId);
        assert.equal(own.body?.merchant?.id, merchantId);
        assert.equal(own.body?.merchant_profile?.tenantId, merchantId);
        assert.equal(JSON.stringify(own.body).includes(credential.rows[0].password_hash), false);
      } else {
        assert.deepEqual(own.body?.lifecycle, {
          merchant_id: merchantId, account_status: lifecycleRow.account_status,
          merchant_status: lifecycleRow.account_status === "pending_review" ? "pending_activation" : lifecycleRow.account_status,
          onboarding_status: lifecycleRow.onboarding_status,
        });
      }
    }
    async function authorityState(accountId) {
      const account = (await pool.query(
        "SELECT password_hash, password_version, session_version, security_version FROM accounts WHERE id = $1", [accountId])).rows[0];
      const sessions = (await pool.query(
        "SELECT id, status, revoke_reason FROM account_sessions WHERE account_id = $1 ORDER BY id", [accountId])).rows;
      return { account, sessions };
    }
    const beforeBadPassword = await authorityState(merchantId);
    const peerBefore = await authorityState(peerId);
    const nextPassword = "GoldenAuth2!";
    const badPassword = await secureRequest("change-password", originalCookie, deviceId, "POST", {
      current_password: "WrongCurrent1!", new_password: nextPassword, confirm_password: nextPassword,
    });
    assert.equal(badPassword.response.status, 401);
    assert.equal(badPassword.body?.code, "CURRENT_PASSWORD_INVALID");
    assert.deepEqual(await authorityState(merchantId), beforeBadPassword);
    assert.equal((await secureRequest("me", originalCookie)).response.status, 200);

    const changed = await secureRequest("change-password", originalCookie, deviceId, "POST", {
      current_password: password, new_password: nextPassword, confirm_password: nextPassword,
    });
    assert.equal(changed.response.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body?.reauthentication_required, true);
    const afterPassword = await authorityState(merchantId);
    assert.notEqual(afterPassword.account.password_hash, beforeBadPassword.account.password_hash);
    for (const version of ["password_version", "session_version", "security_version"]) {
      assert.equal(afterPassword.account[version], beforeBadPassword.account[version] + 1);
    }
    assert.ok(afterPassword.sessions.length >= 2);
    assert.ok(afterPassword.sessions.every(row => row.status === "revoked"));
    for (const stale of [originalCookie, verificationCookie]) {
      for (const endpoint of ["me", "lifecycle"]) {
        assert.equal((await secureRequest(endpoint, stale)).response.status, 401);
      }
    }
    assert.equal((await passwordLogin(phone, password)).response.status, 401);
    const renewed = await passwordLogin(phone, nextPassword);
    assert.equal(renewed.response.status, 200, JSON.stringify(renewed.body));
    const renewedCookie = cookieByName(renewed.response, "fawri_merchant_session_v2");
    assert.ok(renewedCookie);
    assert.equal((await secureRequest("me", renewedCookie)).response.status, 200);
    const logout = await secureRequest("logout", renewedCookie, deviceId, "POST");
    assert.equal(logout.response.status, 200);
    assert.equal(cookieByName(logout.response, "fawri_merchant_session_v2"), "fawri_merchant_session_v2=");
    for (const endpoint of ["me", "lifecycle"]) {
      assert.equal((await secureRequest(endpoint, renewedCookie)).response.status, 401);
    }
    assert.ok((await authorityState(merchantId)).sessions.every(row => row.status === "revoked"));
    assert.equal((await secureRequest("me", peerCookie, peerDevice)).response.status, 200);
    assert.deepEqual(await authorityState(peerId), peerBefore);
    console.log("P0_MERCHANT_SELF_SERVICE_FULL_APP_OBSERVED " + JSON.stringify({
      actualApp: true, operationalPostgresRequired: true, authSessionsPostgresRequired: true,
      routes: 4, merchants: 2, invalidActorReads: 6, selfProjectionChecks: 2,
      badPasswordPreservedAuthority: true, passwordAdvancedVersionsAndRevokedSessions: true,
      logoutReplayDenied: true, peerAuthorityUnchanged: true, devOtpOnly: true,
    }));
  },
);
