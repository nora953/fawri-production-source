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
      status === "approved" ? "channel_connected" : "pending_review",
    trial_status: status === "approved" ? "active" : "eligible",
    signup_source: "direct",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-01T00:00:00.000Z",
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
}

function catalogProduct(id, merchantId, name) {
  return {
    id,
    merchant_id: merchantId,
    name,
    price_iqd: 1000,
    stock_quantity: 2,
    low_stock_threshold: 1,
    status: "available",
    allow_fawri_reply: true,
    image_refs: [],
    variants: [],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    version: 1,
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

async function responseJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

test("merchant operational APIs require server-side approved status", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-merchant-status-access-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  const merchantsPath = path.join(dataDirectory, "merchants.json");
  const runtimeDatabasePath = path.join(
    dataDirectory,
    "fawri-runtime-db.json",
  );
  const merchants = [
    merchant("merchant-approved", "07111111111", "approved", "approved"),
    merchant(
      "merchant-pending",
      "07222222222",
      "pending_activation",
      "pending_review",
    ),
    merchant("merchant-suspended", "07333333333", "suspended", "suspended"),
    merchant("merchant-rejected", "07444444444", "rejected", "rejected"),
  ];

  await writeFile(
    merchantsPath,
    JSON.stringify({
      merchants,
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
    runtimeDatabasePath,
    JSON.stringify({
      productsByMerchant: {
        "merchant-approved": [
          {
            id: "legacy-approved-product",
            merchant_id: "merchant-approved",
            name: "Legacy approved product",
            quantity: 99,
          },
        ],
      },
      conversationsByMerchant: {},
      metaPagesByPageId: {},
      ordersByMerchant: {},
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
    }),
  );
  await writeFile(
    path.join(dataDirectory, "catalog-inventory.json"),
    JSON.stringify({
      version: 1,
      merchants: {
        "merchant-approved": {
          products: {
            "approved-product": catalogProduct(
              "approved-product",
              "merchant-approved",
              "Approved product",
            ),
          },
          idempotency: {},
        },
      },
    }),
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
    return responseJson(
      await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: record.phone,
          password: record.password,
        }),
      }),
    );
  }

  const approvedLogin = await login(merchants[0]);
  assert.equal(
    approvedLogin.response.status,
    200,
    JSON.stringify(approvedLogin.body),
  );
  const approvedCookie = cookiePair(getSetCookie(approvedLogin.response));

  const pendingLogin = await login(merchants[1]);
  assert.equal(
    pendingLogin.response.status,
    200,
    JSON.stringify(pendingLogin.body),
  );
  const pendingCookie = cookiePair(getSetCookie(pendingLogin.response));

  for (const inactiveMerchant of merchants.slice(2)) {
    await t.test(`${inactiveMerchant.status} account cannot obtain a session`, async () => {
      const result = await login(inactiveMerchant);
      assert.equal(result.response.status, 401, JSON.stringify(result.body));
      assert.equal(result.body?.code, "INVALID_CREDENTIALS");
      assert.doesNotMatch(
        getSetCookie(result.response),
        /^fawri_merchant_session_v2=/,
      );
    });
  }

  await t.test("pending account can read account state and support only", async () => {
    const me = await responseJson(
      await apiFetch("/api/auth/me", {
        headers: { Cookie: pendingCookie },
      }),
    );
    assert.equal(me.response.status, 200, JSON.stringify(me.body));
    assert.equal(me.body.merchant.id, "merchant-pending");
    assert.equal(me.body.merchant.status, "pending_activation");

    const support = await responseJson(
      await apiFetch("/api/auth/support/tickets", {
        headers: { Cookie: pendingCookie },
      }),
    );
    assert.equal(support.response.status, 200, JSON.stringify(support.body));
  });

  const approvedProducts = await responseJson(
    await apiFetch("/api/products", {
      headers: { Cookie: approvedCookie },
    }),
  );
  assert.equal(approvedProducts.response.status, 200);
  assert.equal(approvedProducts.body.authority, "server_catalog");
  assert.deepEqual(
    approvedProducts.body.products.map((item) => item.id),
    ["approved-product"],
  );
  assert.equal(
    approvedProducts.body.products.some(
      (item) => item.id === "legacy-approved-product",
    ),
    false,
  );

  const operationalPaths = [
    "/api/products",
    "/api/conversations",
    "/api/orders",
    "/api/saved-answers",
    "/api/bot-training/requests",
    "/api/meta/pages",
  ];

  for (const operationalPath of operationalPaths) {
    await t.test(`pending merchant is denied ${operationalPath}`, async () => {
      const result = await responseJson(
        await apiFetch(operationalPath, {
          headers: { Cookie: pendingCookie },
        }),
      );
      assert.equal(result.response.status, 403, JSON.stringify(result.body));
      assert.equal(result.body.code, "MERCHANT_OPERATIONAL_ACCESS_PENDING");
      assert.equal(result.response.headers.get("cache-control"), "no-store");
    });
  }

  await t.test("server re-checks merchant status for an existing session", async () => {
    const currentMerchantDatabase = JSON.parse(
      await readFile(merchantsPath, "utf8"),
    );
    const approvedMerchant = currentMerchantDatabase.merchants.find(
      (item) => item.id === "merchant-approved",
    );
    assert.ok(approvedMerchant);
    approvedMerchant.status = "suspended";
    approvedMerchant.account_status = "suspended";
    await writeFile(merchantsPath, JSON.stringify(currentMerchantDatabase));

    const suspendedSession = await responseJson(
      await apiFetch("/api/products", {
        headers: { Cookie: approvedCookie },
      }),
    );
    assert.equal(
      suspendedSession.response.status,
      401,
      JSON.stringify(suspendedSession.body),
    );
    assert.equal(suspendedSession.body.code, "SESSION_ACCOUNT_INVALID");
    assert.equal(
      suspendedSession.response.headers.get("cache-control"),
      "no-store",
    );
  });
});