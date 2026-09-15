import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { pool } from "@workspace/db";
import { hashPassword } from "../src/services/authPasswordService.ts";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");
const merchantCookieName = "fawri_merchant_session_v2";
const legacyCookieName = "fawri_merchant_session";
const accountIds = ["auth-proof-merchant-a", "auth-proof-merchant-b"];

function merchant(id, phone, passwordHash) {
  return {
    id,
    owner_name: `Owner ${id}`,
    store_name: `Store ${id}`,
    phone,
    password: passwordHash,
    activity_type: "retail",
    status: "approved",
    account_status: "approved",
    onboarding_status: "channel_connected",
    trial_status: "active",
    signup_source: "direct",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-08T00:00:00.000Z",
    otp_verified: true,
    auth_session_version: 0,
    warning_stage: 0,
    retention_status: "protected",
  };
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

function getSetCookie(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  return values[0] || response.headers.get("set-cookie") || "";
}

function cookiePair(setCookie) {
  assert.match(setCookie, new RegExp(`^${merchantCookieName}=`));
  return setCookie.split(";", 1)[0];
}

function cookieValue(cookie) {
  const separator = cookie.indexOf("=");
  return cookie.slice(separator + 1);
}

async function json(response) {
  return {
    response,
    body: await response.json().catch(() => null),
  };
}

async function seedAccounts(records) {
  await pool.query(
    `DELETE FROM accounts WHERE id = ANY($1::text[])`,
    [records.map((record) => record.id)],
  );
  for (const record of records) {
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
      [record.id, record.phone, record.password],
    );
  }
}

async function sessionRows(accountId) {
  const result = await pool.query(
    `SELECT id, account_id, kind, status, tenant_id, device_fingerprint_hash,
            session_version, security_version, revoke_reason,
            replaced_by_session_id, created_at
       FROM account_sessions
      WHERE account_id = $1
      ORDER BY created_at ASC, id ASC`,
    [accountId],
  );
  return result.rows;
}

async function activeSessionRows(accountId) {
  const result = await pool.query(
    `SELECT id, account_id, status, tenant_id, device_fingerprint_hash,
            session_version, security_version, created_at
       FROM account_sessions
      WHERE account_id = $1 AND status = 'active'
      ORDER BY created_at ASC, id ASC`,
    [accountId],
  );
  return result.rows;
}

test("Auth v2 is atomic under real HTTP concurrency on PostgreSQL 16", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  assert.equal(
    process.env.FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY,
    "required",
    "PostgreSQL Auth session authority must be required for this proof",
  );

  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-auth-postgres-concurrency-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  const passwordA = "MerchantA1!";
  const passwordB = "MerchantB1!";
  const nextPasswordA = "MerchantA2!";
  const merchantA = merchant(
    accountIds[0],
    "07111111111",
    hashPassword(passwordA),
  );
  const merchantB = merchant(
    accountIds[1],
    "07222222222",
    hashPassword(passwordB),
  );

  await writeFile(
    path.join(dataDirectory, "merchants.json"),
    JSON.stringify({
      merchants: [merchantA, merchantB],
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
  await writeFile(
    path.join(dataDirectory, "fawri-runtime-db.json"),
    JSON.stringify({
      productsByMerchant: {},
      conversationsByMerchant: {},
      metaPagesByPageId: {},
      ordersByMerchant: {},
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
    }),
  );
  await writeFile(
    path.join(dataDirectory, "catalog-inventory.json"),
    JSON.stringify({ version: 1, merchants: {} }),
  );
  await writeFile(
    path.join(dataDirectory, "saved-answers.json"),
    JSON.stringify({ answers: [] }),
  );
  await writeFile(
    path.join(dataDirectory, "training-requests.json"),
    JSON.stringify({ requests: [] }),
  );
  await writeFile(
    path.join(dataDirectory, "learned-answers.json"),
    JSON.stringify({ answers: [] }),
  );

  await seedAccounts([merchantA, merchantB]);

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverOutput = "";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDirectory,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      LOG_LEVEL: "silent",
      BOT_DEBUG: "false",
      FAWRI_PASSWORD_SALT: "auth-proof-password-salt",
      FAWRI_AUTH_SECURITY_SECRET:
        "auth-proof-session-secret-with-more-than-thirty-two-characters",
      FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
      FAWRI_SESSION_IDLE_TTL_MS: "60000",
      FAWRI_SESSION_ABSOLUTE_TTL_MS: "300000",
      FAWRI_SESSION_ROTATION_MS: "2000",
      META_VERIFY_TOKEN: "auth-proof-meta-verify-token",
      META_APP_ID: "auth-proof-meta-app",
      META_CONFIG_ID: "auth-proof-meta-config",
      META_REDIRECT_URI: `${baseUrl}/api/meta/callback`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
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
    await pool.query(`DELETE FROM accounts WHERE id = ANY($1::text[])`, [accountIds]);
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => serverOutput);

  const apiFetch = (url, options = {}) => fetch(`${baseUrl}${url}`, options);

  async function login(record, password, deviceId) {
    return json(
      await apiFetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Fawri-Device-Id": deviceId,
        },
        body: JSON.stringify({
          phone: record.phone,
          password,
          device_label: `Proof ${deviceId}`,
        }),
      }),
    );
  }

  const loginA = await login(merchantA, passwordA, "device-a");
  assert.equal(loginA.response.status, 200, JSON.stringify(loginA.body));
  let cookieA = cookiePair(getSetCookie(loginA.response));

  await t.test("simultaneous session validation is serialized without duplicate state", async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        apiFetch("/api/auth/me", {
          headers: {
            Cookie: cookieA,
            "X-Fawri-Device-Id": "device-a",
          },
        }),
      ),
    );
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(responses.map((response) => response.status), Array(12).fill(200));
    assert.ok(bodies.every((body) => body.merchant?.id === merchantA.id));

    const active = await activeSessionRows(merchantA.id);
    assert.equal(active.length, 1);
    assert.equal(active[0].tenant_id, merchantA.id);
    assert.ok(active[0].device_fingerprint_hash);
  });

  await t.test("legacy cookie and Bearer fallbacks remain rejected", async () => {
    const token = cookieValue(cookieA);
    const bearer = await apiFetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(bearer.status, 401);

    const legacy = await apiFetch("/api/auth/me", {
      headers: { Cookie: `${legacyCookieName}=${token}` },
    });
    assert.equal(legacy.status, 401);
  });

  const loginB = await login(merchantB, passwordB, "device-b");
  assert.equal(loginB.response.status, 200, JSON.stringify(loginB.body));
  const cookieB = cookiePair(getSetCookie(loginB.response));

  await t.test("device binding and session ownership isolate tenants", async () => {
    const wrongDevice = await apiFetch("/api/auth/me", {
      headers: {
        Cookie: cookieA,
        "X-Fawri-Device-Id": "device-b",
      },
    });
    assert.equal(wrongDevice.status, 401);

    const forgedTenant = await json(
      await apiFetch(`/api/auth/me?merchantId=${merchantB.id}`, {
        headers: {
          Cookie: cookieA,
          "X-Fawri-Device-Id": "device-a",
        },
      }),
    );
    assert.equal(forgedTenant.response.status, 200);
    assert.equal(forgedTenant.body.merchant.id, merchantA.id);

    const bSessions = await activeSessionRows(merchantB.id);
    assert.equal(bSessions.length, 1);
    const crossTenantRevoke = await apiFetch(
      `/api/auth/sessions/${bSessions[0].id}`,
      {
        method: "DELETE",
        headers: {
          Cookie: cookieA,
          "X-Fawri-Device-Id": "device-a",
        },
      },
    );
    assert.equal(crossTenantRevoke.status, 404);

    const bStillValid = await apiFetch("/api/auth/me", {
      headers: {
        Cookie: cookieB,
        "X-Fawri-Device-Id": "device-b",
      },
    });
    assert.equal(bStillValid.status, 200);
  });

  await t.test("concurrent rotation creates one replacement and replay stays revoked", async () => {
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    const oldCookie = cookieA;
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        apiFetch("/api/auth/me", {
          headers: {
            Cookie: oldCookie,
            "X-Fawri-Device-Id": "device-a",
          },
        }),
      ),
    );
    const successes = responses.filter((response) => response.status === 200);
    assert.equal(successes.length, 1, responses.map((response) => response.status).join(","));
    cookieA = cookiePair(getSetCookie(successes[0]));

    const rows = await sessionRows(merchantA.id);
    const oldId = cookieValue(oldCookie).split(".")[1];
    const oldRow = rows.find((row) => row.id === oldId);
    assert.ok(oldRow);
    assert.equal(oldRow.status, "revoked");
    assert.equal(oldRow.revoke_reason, "rotated");
    assert.ok(oldRow.replaced_by_session_id);
    assert.equal(rows.filter((row) => row.status === "active").length, 1);
    assert.equal(
      rows.filter((row) => row.id === oldRow.replaced_by_session_id).length,
      1,
    );

    const replay = await apiFetch("/api/auth/me", {
      headers: {
        Cookie: oldCookie,
        "X-Fawri-Device-Id": "device-a",
      },
    });
    assert.equal(replay.status, 401);

    const replacement = await apiFetch("/api/auth/me", {
      headers: {
        Cookie: cookieA,
        "X-Fawri-Device-Id": "device-a",
      },
    });
    assert.equal(replacement.status, 200);
  });

  await t.test("logout versus request is linearizable and cannot reactivate a session", async () => {
    const racingCookie = cookieA;
    const [logout, request] = await Promise.all([
      apiFetch("/api/auth/logout", {
        method: "POST",
        headers: {
          Cookie: racingCookie,
          "X-Fawri-Device-Id": "device-a",
        },
      }),
      apiFetch("/api/auth/me", {
        headers: {
          Cookie: racingCookie,
          "X-Fawri-Device-Id": "device-a",
        },
      }),
    ]);
    assert.equal(logout.status, 200);
    assert.ok([200, 401].includes(request.status));

    const replay = await apiFetch("/api/auth/me", {
      headers: {
        Cookie: racingCookie,
        "X-Fawri-Device-Id": "device-a",
      },
    });
    assert.equal(replay.status, 401);
    assert.equal((await activeSessionRows(merchantA.id)).length, 0);
  });

  await t.test("password change races revoke old authority and advance security versions atomically", async () => {
    const fresh = await login(merchantA, passwordA, "device-a");
    assert.equal(fresh.response.status, 200, JSON.stringify(fresh.body));
    const oldCookie = cookiePair(getSetCookie(fresh.response));

    const [changed, request] = await Promise.all([
      apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: oldCookie,
          "X-Fawri-Device-Id": "device-a",
        },
        body: JSON.stringify({
          current_password: passwordA,
          new_password: nextPasswordA,
          confirm_password: nextPasswordA,
        }),
      }),
      apiFetch("/api/auth/me", {
        headers: {
          Cookie: oldCookie,
          "X-Fawri-Device-Id": "device-a",
        },
      }),
    ]);
    assert.equal(changed.status, 200, await changed.text());
    assert.ok([200, 401].includes(request.status));

    const account = await pool.query(
      `SELECT password_version, session_version, security_version
         FROM accounts WHERE id = $1`,
      [merchantA.id],
    );
    assert.equal(account.rows[0].password_version, 2);
    assert.equal(account.rows[0].session_version, 2);
    assert.equal(account.rows[0].security_version, 2);
    assert.equal((await activeSessionRows(merchantA.id)).length, 0);

    const stale = await apiFetch("/api/auth/me", {
      headers: {
        Cookie: oldCookie,
        "X-Fawri-Device-Id": "device-a",
      },
    });
    assert.equal(stale.status, 401);

    const oldPassword = await login(merchantA, passwordA, "device-a");
    assert.equal(oldPassword.response.status, 401);

    const newPassword = await login(merchantA, nextPasswordA, "device-a");
    assert.equal(newPassword.response.status, 200, JSON.stringify(newPassword.body));
    const newCookie = cookiePair(getSetCookie(newPassword.response));
    const newSession = await apiFetch("/api/auth/me", {
      headers: {
        Cookie: newCookie,
        "X-Fawri-Device-Id": "device-a",
      },
    });
    assert.equal(newSession.status, 200);
  });

  await t.test("database uniqueness invariants contain no raced duplicates", async () => {
    const duplicateTokens = await pool.query(
      `SELECT token_hash, count(*)::integer AS count
         FROM account_sessions
        WHERE account_id = ANY($1::text[])
        GROUP BY token_hash
       HAVING count(*) > 1`,
      [accountIds],
    );
    assert.deepEqual(duplicateTokens.rows, []);

    const duplicateReplacements = await pool.query(
      `SELECT replaced_by_session_id, count(*)::integer AS count
         FROM account_sessions
        WHERE account_id = ANY($1::text[])
          AND replaced_by_session_id IS NOT NULL
        GROUP BY replaced_by_session_id
       HAVING count(*) > 1`,
      [accountIds],
    );
    assert.deepEqual(duplicateReplacements.rows, []);
  });
});
