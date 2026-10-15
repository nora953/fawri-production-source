import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

function merchant(id, phone, status, accountStatus) {
  return {
    id,
    owner_name: `Owner ${id}`,
    store_name: `Store ${id}`,
    phone,
    password: `Password-${id}-1!`,
    activity_type: "retail",
    status,
    account_status: accountStatus,
    onboarding_status:
      accountStatus === "approved" ? "awaiting_channel" : "pending_review",
    trial_status: accountStatus === "approved" ? "not_started" : "eligible",
    signup_source: "direct",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-01T00:00:00.000Z",
    otp_verified: true,
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early.\n${logs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
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
  assert.match(setCookie, /^fawri_merchant_session_v2=/);
  return setCookie.split(";", 1)[0];
}

function cookieToken(cookie) {
  return cookie.slice(cookie.indexOf("=") + 1);
}

async function responseJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

test("merchant lifecycle status is self-scoped and remains operationally fail-closed", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-merchant-lifecycle-status-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  const merchantsPath = path.join(dataDirectory, "merchants.json");
  const pendingMerchant = merchant(
    "merchant-pending",
    "07222222222",
    "pending_activation",
    "pending_review",
  );
  const approvedMerchant = merchant(
    "merchant-approved",
    "07111111111",
    "approved",
    "approved",
  );

  await writeFile(
    merchantsPath,
    JSON.stringify({
      merchants: [pendingMerchant, approvedMerchant],
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
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_MERCHANT_SESSION_SECRET: "test-merchant-session-secret",
      META_VERIFY_TOKEN: "test-meta-verify-token",
      META_APP_ID: "test-meta-app",
      META_CONFIG_ID: "test-meta-config",
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
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => serverOutput);
  const apiFetch = (url, options = {}) => fetch(`${baseUrl}${url}`, options);

  async function login(record) {
    const result = await responseJson(
      await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: record.phone,
          password: record.password,
        }),
      }),
    );
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    return cookiePair(getSetCookie(result.response));
  }

  const pendingCookie = await login(pendingMerchant);
  const approvedCookie = await login(approvedMerchant);

  await t.test("unauthenticated, random, legacy-cookie, and bearer callers cannot enumerate lifecycle", async () => {
    const unauthenticated = await responseJson(
      await apiFetch("/api/auth/lifecycle"),
    );
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.body?.code, "SESSION_REQUIRED");

    const random = await responseJson(
      await apiFetch("/api/auth/lifecycle", {
        headers: {
          Cookie:
            "fawri_merchant_session_v2=fs1.00000000-0000-4000-8000-000000000000.invalid",
        },
      }),
    );
    assert.equal(random.response.status, 401);
    assert.equal(random.body?.code, "SESSION_INVALID");

    const legacy = await responseJson(
      await apiFetch("/api/auth/lifecycle", {
        headers: { Cookie: "fawri_session=merchant-pending" },
      }),
    );
    assert.equal(legacy.response.status, 401);
    assert.equal(legacy.body?.code, "SESSION_REQUIRED");

    const bearer = await responseJson(
      await apiFetch("/api/auth/lifecycle", {
        headers: { Authorization: `Bearer ${cookieToken(pendingCookie)}` },
      }),
    );
    assert.equal(bearer.response.status, 401);
    assert.equal(bearer.body?.code, "SESSION_REQUIRED");
  });

  const pending = await responseJson(
    await apiFetch(
      "/api/auth/lifecycle?merchant_id=merchant-approved&phone=07111111111",
      { headers: { Cookie: pendingCookie } },
    ),
  );
  assert.equal(pending.response.status, 200, JSON.stringify(pending.body));
  assert.equal(pending.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(pending.body?.lifecycle, {
    merchant_id: "merchant-pending",
    account_status: "pending_review",
    merchant_status: "pending_activation",
    onboarding_status: "pending_review",
  });

  const approved = await responseJson(
    await apiFetch("/api/auth/lifecycle", {
      headers: { Cookie: approvedCookie },
    }),
  );
  assert.equal(approved.response.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body?.lifecycle?.account_status, "approved");

  const pendingOperational = await responseJson(
    await apiFetch("/api/products", {
      headers: { Cookie: pendingCookie },
    }),
  );
  assert.equal(pendingOperational.response.status, 403);
  assert.equal(
    pendingOperational.body?.code,
    "MERCHANT_OPERATIONAL_ACCESS_PENDING",
  );

  async function changeLifecycle(id, status, accountStatus, onboardingStatus) {
    const current = JSON.parse(await readFile(merchantsPath, "utf8"));
    const record = current.merchants.find((item) => item.id === id);
    assert.ok(record);
    record.status = status;
    record.account_status = accountStatus;
    record.onboarding_status = onboardingStatus;
    await writeFile(merchantsPath, JSON.stringify(current));
  }

  await changeLifecycle(
    "merchant-pending",
    "approved",
    "approved",
    "awaiting_channel",
  );
  const pendingBecameApproved = await responseJson(
    await apiFetch("/api/auth/lifecycle", {
      headers: { Cookie: pendingCookie },
    }),
  );
  assert.equal(pendingBecameApproved.response.status, 200);
  assert.equal(
    pendingBecameApproved.body?.lifecycle?.account_status,
    "approved",
  );

  await changeLifecycle(
    "merchant-pending",
    "pending_activation",
    "pending_review",
    "pending_review",
  );
  const restoredPending = await responseJson(
    await apiFetch("/api/auth/lifecycle", {
      headers: { Cookie: pendingCookie },
    }),
  );
  assert.equal(restoredPending.response.status, 200);
  assert.equal(restoredPending.body?.lifecycle?.account_status, "pending_review");

  await changeLifecycle(
    "merchant-pending",
    "rejected",
    "rejected",
    "pending_review",
  );
  const rejected = await responseJson(
    await apiFetch("/api/auth/lifecycle", {
      headers: { Cookie: pendingCookie },
    }),
  );
  assert.equal(rejected.response.status, 200, JSON.stringify(rejected.body));
  assert.equal(rejected.body?.lifecycle?.account_status, "rejected");

  await changeLifecycle(
    "merchant-approved",
    "suspended",
    "suspended",
    "awaiting_channel",
  );
  const suspended = await responseJson(
    await apiFetch("/api/auth/lifecycle", {
      headers: { Cookie: approvedCookie },
    }),
  );
  assert.equal(suspended.response.status, 200, JSON.stringify(suspended.body));
  assert.equal(suspended.body?.lifecycle?.account_status, "suspended");
  assert.notEqual(
    rejected.body?.lifecycle?.account_status,
    suspended.body?.lifecycle?.account_status,
  );

  await changeLifecycle(
    "merchant-approved",
    "approved",
    "approved",
    "awaiting_channel",
  );
  const unsuspended = await responseJson(
    await apiFetch("/api/auth/lifecycle", {
      headers: { Cookie: approvedCookie },
    }),
  );
  assert.equal(unsuspended.response.status, 200);
  assert.equal(unsuspended.body?.lifecycle?.account_status, "approved");

  await changeLifecycle(
    "merchant-approved",
    "suspended",
    "suspended",
    "awaiting_channel",
  );
  const suspendedAgain = await responseJson(
    await apiFetch("/api/auth/lifecycle", {
      headers: { Cookie: approvedCookie },
    }),
  );
  assert.equal(suspendedAgain.response.status, 200);
  assert.equal(suspendedAgain.body?.lifecycle?.account_status, "suspended");

  for (const [label, cookie] of [
    ["rejected", pendingCookie],
    ["suspended", approvedCookie],
  ]) {
    const blocked = await responseJson(
      await apiFetch("/api/products", {
        headers: { Cookie: cookie },
      }),
    );
    assert.equal(blocked.response.status, 401, `${label}: ${JSON.stringify(blocked.body)}`);
    assert.equal(blocked.body?.code, "SESSION_ACCOUNT_INVALID");
    assert.equal(blocked.response.headers.get("cache-control"), "no-store");

    const revokedLifecycle = await responseJson(
      await apiFetch("/api/auth/lifecycle", {
        headers: { Cookie: cookie },
      }),
    );
    assert.equal(revokedLifecycle.response.status, 401);
    assert.equal(revokedLifecycle.body?.code, "SESSION_INVALID");
  }
});
