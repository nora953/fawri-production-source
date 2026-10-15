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

test("order APIs enforce tenant isolation and optimistic concurrency", async t => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-order-operations-"),
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

  const runtime = {
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
          product_id: "product-a",
          product_name: "Product A",
          quantity: 1,
          unit_price: 25000,
          total_price: 25000,
          status: "pending_confirmation",
          payment_method: "zaincash",
          payment_status: "electronic_pending",
          source_channel: "messenger",
          created_at: "2026-08-06T10:00:00.000Z",
          updated_at: "2026-08-06T10:00:00.000Z",
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
          payment_method: "cash_on_delivery",
          source_channel: "messenger",
          created_at: "2026-08-06T11:00:00.000Z",
          updated_at: "2026-08-06T11:00:00.000Z",
        },
      ],
    },
  };
  await writeFile(
    path.join(dataDirectory, "fawri-runtime-db.json"),
    JSON.stringify(runtime),
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
  const login = await jsonResponse(
    await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: merchantA.phone,
        password: merchantA.password,
      }),
    }),
  );
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  const cookie = cookiePair(getSetCookie(login.response));
  const headers = { Cookie: cookie };

  const list = await jsonResponse(
    await apiFetch("/api/orders", { headers }),
  );
  assert.equal(list.response.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.orders.length, 1);
  assert.equal(list.body.orders[0].id, "order-a");
  assert.equal(list.body.orders[0].version, 1);
  assert.equal(list.body.orders[0].payment_status, "electronic_pending");

  const crossTenantList = await jsonResponse(
    await apiFetch("/api/orders/merchant-b", { headers }),
  );
  assert.equal(crossTenantList.response.status, 403);
  assert.equal(crossTenantList.body.code, "MERCHANT_ACCESS_FORBIDDEN");

  const crossTenantOrder = await jsonResponse(
    await apiFetch("/api/order/order-b", { headers }),
  );
  assert.equal(crossTenantOrder.response.status, 404);
  assert.equal(crossTenantOrder.body.code, "ORDER_NOT_FOUND");

  const confirm = await jsonResponse(
    await apiFetch("/api/orders/order-a/payment/confirm", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expected_version: 1 }),
    }),
  );
  assert.equal(confirm.response.status, 200, JSON.stringify(confirm.body));
  assert.equal(confirm.body.order.status, "confirmed");
  assert.equal(confirm.body.order.payment_status, "paid");
  assert.equal(confirm.body.order.version, 2);

  const stale = await jsonResponse(
    await apiFetch("/api/orders/order-a/status", {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        expected_version: 1,
        status: "cancelled",
      }),
    }),
  );
  assert.equal(stale.response.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.code, "ORDER_VERSION_CONFLICT");
  assert.equal(stale.body.current_version, 2);
  assert.equal(stale.body.current_order.status, "confirmed");

  const preparing = await jsonResponse(
    await apiFetch("/api/orders/order-a/status", {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        expected_version: 2,
        status: "preparing",
      }),
    }),
  );
  assert.equal(preparing.response.status, 200, JSON.stringify(preparing.body));
  assert.equal(preparing.body.order.status, "preparing");
  assert.equal(preparing.body.order.version, 3);

  const baseRuntime = JSON.parse(
    await readFile(path.join(dataDirectory, "fawri-runtime-db.json"), "utf8"),
  );
  assert.equal(baseRuntime.ordersByMerchant["merchant-a"][0].status, "pending_confirmation");
  assert.equal(
    baseRuntime.ordersByMerchant["merchant-a"][0].payment_status,
    "electronic_pending",
  );

  const operations = JSON.parse(
    await readFile(path.join(dataDirectory, "order-operations.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(operations.orders), ["merchant-a"]);
  assert.equal(operations.orders["merchant-a"]["order-a"].version, 3);
  assert.equal(operations.orders["merchant-a"]["order-a"].status, "preparing");
  assert.equal(
    operations.orders["merchant-a"]["order-a"].payment_status,
    "paid",
  );
});
