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

function cookiePair(response) {
  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  const value = values[0] || response.headers.get("set-cookie") || "";
  assert.match(value, /^fawri_merchant_session=/);
  return value.split(";", 1)[0];
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("HTTP payment API rejects generic terminal writes and persists one audited decision", async t => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-payment-hardening-http-"),
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
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
      ordersByMerchant: {
        "merchant-a": [
          {
            id: "order-a",
            merchant_id: "merchant-a",
            customer_name: "Customer A",
            customer_phone: "07333333333",
            customer_address: "Baghdad",
            product_name: "Product A",
            quantity: 1,
            unit_price: 25000,
            total_price: 25000,
            status: "pending_confirmation",
            payment_method: "zaincash",
            payment_status: "electronic_pending",
            source_channel: "messenger",
            created_at: "2026-08-07T00:00:00.000Z",
            updated_at: "2026-08-07T00:00:00.000Z",
          },
        ],
        "merchant-b": [
          {
            id: "order-b",
            merchant_id: "merchant-b",
            customer_name: "Customer B",
            customer_phone: "07444444444",
            customer_address: "Basra",
            product_name: "Product B",
            quantity: 1,
            unit_price: 10000,
            total_price: 10000,
            status: "pending_confirmation",
            payment_method: "zaincash",
            payment_status: "electronic_pending",
            source_channel: "messenger",
            created_at: "2026-08-07T00:00:00.000Z",
            updated_at: "2026-08-07T00:00:00.000Z",
          },
        ],
      },
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
  const login = await json(
    await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: merchantA.phone,
        password: merchantA.password,
      }),
    }),
  );
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  const cookie = cookiePair(login.response);
  const request = (url, options = {}) =>
    fetch(`${baseUrl}${url}`, {
      ...options,
      headers: { Cookie: cookie, ...(options.headers || {}) },
    });

  const genericPaid = await json(
    await request("/api/orders/order-a/payment-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_version: 1, payment_status: "paid" }),
    }),
  );
  assert.equal(
    genericPaid.response.status,
    409,
    JSON.stringify(genericPaid.body),
  );
  assert.equal(
    genericPaid.body.code,
    "ORDER_PAYMENT_TERMINAL_OPERATION_REQUIRED",
  );

  const crossTenant = await json(await request("/api/order/order-b"));
  assert.equal(crossTenant.response.status, 404);
  assert.equal(crossTenant.body.code, "ORDER_NOT_FOUND");

  const confirmed = await json(
    await request("/api/orders/order-a/payment/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "integration-request-1",
      },
      body: JSON.stringify({ expected_version: 1 }),
    }),
  );
  assert.equal(confirmed.response.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.order.version, 2);
  assert.equal(confirmed.body.order.payment_status, "paid");
  assert.equal(confirmed.body.order.last_payment_decision.operation, "confirm");
  assert.equal(
    confirmed.body.order.last_payment_decision.request_id,
    "integration-request-1",
  );

  const invalidJump = await json(
    await request("/api/orders/order-a/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_version: 2, status: "delivered" }),
    }),
  );
  assert.equal(
    invalidJump.response.status,
    409,
    JSON.stringify(invalidJump.body),
  );
  assert.equal(invalidJump.body.code, "ORDER_STATUS_TRANSITION_INVALID");

  const stale = await json(
    await request("/api/orders/order-a/payment/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_version: 1, reason: "stale device" }),
    }),
  );
  assert.equal(stale.response.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.code, "ORDER_VERSION_CONFLICT");
  assert.equal(stale.body.current_version, 2);

  const operationStore = JSON.parse(
    await readFile(path.join(dataDirectory, "order-operations.json"), "utf8"),
  );
  assert.equal(operationStore.version, 2);
  assert.equal(operationStore.payment_decisions.length, 1);
  assert.equal(operationStore.payment_decisions[0].merchant_id, "merchant-a");
  assert.equal(operationStore.payment_decisions[0].order_id, "order-a");
  assert.equal(operationStore.payment_decisions[0].resulting_version, 2);
});
