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

function merchant(id, phone) {
  return {
    id,
    owner_name: `Owner ${id}`,
    store_name: `Store ${id}`,
    phone,
    password: `Password-${id}-1!`,
    activity_type: "retail",
    status: "approved",
    account_status: "approved",
    onboarding_status: "channel_connected",
    trial_status: "active",
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
    server.close(error => (error ? reject(error) : resolve()));
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
    await new Promise(resolve => setTimeout(resolve, 100));
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

async function jsonResponse(response) {
  return {
    response,
    body: await response.json().catch(() => null),
  };
}

async function login(apiFetch, account) {
  const result = await jsonResponse(
    await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: account.phone, password: account.password }),
    }),
  );
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return cookiePair(getSetCookie(result.response));
}

test("merchant settings API is server-authoritative, isolated, and versioned", async t => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-merchant-settings-api-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });
  const merchantA = merchant("merchant-a", "07111111111");
  const merchantB = merchant("merchant-b", "07222222222");

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
      META_APP_SECRET: "test-meta-secret",
      META_CONFIG_ID: "test-meta-config",
      META_REDIRECT_URI: `${baseUrl}/api/meta/callback`,
      FAWRI_DISABLE_JOB_WORKERS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", chunk => {
    serverOutput += String(chunk);
  });
  child.stderr.on("data", chunk => {
    serverOutput += String(chunk);
  });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        new Promise(resolve => setTimeout(resolve, 2000)),
      ]);
    }
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => serverOutput);
  const apiFetch = (url, options = {}) => fetch(`${baseUrl}${url}`, options);
  const cookieA = await login(apiFetch, merchantA);
  const cookieB = await login(apiFetch, merchantB);

  const initialA = await jsonResponse(
    await apiFetch("/api/settings", { headers: { Cookie: cookieA } }),
  );
  assert.equal(initialA.response.status, 200, JSON.stringify(initialA.body));
  assert.equal(initialA.body.settings.merchant_id, "merchant-a");
  assert.equal(initialA.body.settings.version, 1);
  assert.equal(initialA.body.settings.auto_reply_enabled, true);
  await assert.rejects(
    readFile(path.join(dataDirectory, "merchant-settings.json"), "utf8"),
    error => error.code === "ENOENT",
  );

  const updatedA = await jsonResponse(
    await apiFetch("/api/settings", {
      method: "PATCH",
      headers: {
        Cookie: cookieA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expected_version: 1,
        settings: {
          auto_reply_enabled: false,
          reply_language: "ku",
          delivery: {
            fee_iqd: 5000,
            areas: ["Baghdad", "Erbil"],
          },
          payment: {
            cash_on_delivery_enabled: true,
            electronic_payment_enabled: true,
            methods: ["cash_on_delivery", "zaincash"],
            instructions: "Send the receipt",
          },
        },
      }),
    }),
  );
  assert.equal(updatedA.response.status, 200, JSON.stringify(updatedA.body));
  assert.equal(updatedA.body.settings.version, 2);
  assert.equal(updatedA.body.settings.auto_reply_enabled, false);
  assert.equal(updatedA.body.settings.reply_language, "ku");
  assert.deepEqual(updatedA.body.settings.payment.methods, [
    "cash_on_delivery",
    "zaincash",
  ]);

  const stale = await jsonResponse(
    await apiFetch("/api/settings", {
      method: "PATCH",
      headers: {
        Cookie: cookieA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expected_version: 1,
        settings: { reply_language: "en" },
      }),
    }),
  );
  assert.equal(stale.response.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.code, "MERCHANT_SETTINGS_VERSION_CONFLICT");
  assert.equal(stale.body.current_version, 2);
  assert.equal(stale.body.current_settings.reply_language, "ku");

  const initialB = await jsonResponse(
    await apiFetch("/api/settings", { headers: { Cookie: cookieB } }),
  );
  assert.equal(initialB.response.status, 200, JSON.stringify(initialB.body));
  assert.equal(initialB.body.settings.merchant_id, "merchant-b");
  assert.equal(initialB.body.settings.version, 1);
  assert.equal(initialB.body.settings.auto_reply_enabled, true);
  assert.equal(initialB.body.settings.reply_language, "auto");

  const persisted = JSON.parse(
    await readFile(path.join(dataDirectory, "merchant-settings.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(persisted.settings), ["merchant-a"]);
  assert.equal(persisted.settings["merchant-a"].version, 2);
  assert.equal(
    JSON.stringify(persisted).includes("merchant-b"),
    false,
    "reading defaults created another merchant's settings record",
  );
});
