import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

function merchant(id, phone, password) {
  return {
    id,
    owner_name: `Owner ${id}`,
    store_name: `Store ${id}`,
    phone,
    password,
    activity_type: "retail",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-07-24T00:00:00.000Z",
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
}

function conversation(id, merchantId) {
  return {
    id,
    merchant_id: merchantId,
    platform: "messenger",
    customer_name: `Customer ${merchantId}`,
    customer_handle: `customer-${merchantId}`,
    status: "auto_replying",
    assigned_to_human: false,
    needs_training: false,
    updated_at: "2026-07-24T00:00:00.000Z",
    messages: [],
  };
}

function order(id, merchantId) {
  return {
    id,
    merchant_id: merchantId,
    conversation_id: `conversation-${merchantId}`,
    customer_id: `customer-${merchantId}`,
    customer_name: `Customer ${merchantId}`,
    customer_phone: "07000000000",
    customer_address: "Baghdad",
    product_name: `Product ${merchantId}`,
    quantity: 1,
    unit_price: 1000,
    total_price: 1000,
    status: "new",
    source_channel: "messenger",
    created_at: "2026-07-24T00:00:00.000Z",
    updated_at: "2026-07-24T00:00:00.000Z",
  };
}

function trainingRequest(id, merchantId) {
  return {
    id,
    merchantId,
    customerId: `customer-${merchantId}`,
    customerMessage: `Question for ${merchantId}`,
    normalizedMessage: `question for ${merchantId}`,
    detectedIntent: "product_question",
    detectedLanguage: "en",
    reason: "needs merchant reply",
    suggestedReply: null,
    status: "pending_merchant_reply",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
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
  const port = address.port;

  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });

  return port;
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
      // The process is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`API server did not become ready.\n${getLogs()}`);
}

function getSetCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];

  return values[0] || response.headers.get("set-cookie") || "";
}

function cookiePair(setCookie) {
  assert.match(setCookie, /^fawri_merchant_session=/);
  return setCookie.split(";", 1)[0];
}

function tamperCookie(cookie) {
  const separator = cookie.indexOf("=");
  const name = cookie.slice(0, separator + 1);
  const value = cookie.slice(separator + 1);
  const index = Math.max(0, value.length - 2);
  const replacement = value[index] === "a" ? "b" : "a";

  return `${name}${value.slice(0, index)}${replacement}${value.slice(index + 1)}`;
}

async function parseJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

test("merchant session authenticates and isolates tenant APIs", async (t) => {
  const runtimeDir = await mkdtemp(
    path.join(os.tmpdir(), "fawri-merchant-session-"),
  );
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const merchantA = merchant("merchant-a", "07111111111", "MerchantA1@");
  const merchantB = merchant("merchant-b", "07222222222", "MerchantB1@");

  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [merchantA, merchantB],
      otps: [],
      admin_logs: [],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
    }),
  );

  await writeFile(
    path.join(dataDir, "fawri-runtime-db.json"),
    JSON.stringify({
      productsByMerchant: {
        "merchant-a": [{
          id: "product-a",
          merchant_id: "merchant-a",
          name: "Product A",
          quantity: 3,
        }],
        "merchant-b": [{
          id: "product-b",
          merchant_id: "merchant-b",
          name: "Product B",
          quantity: 4,
        }],
      },
      conversationsByMerchant: {
        "merchant-a": [conversation("conversation-a", "merchant-a")],
        "merchant-b": [conversation("conversation-b", "merchant-b")],
      },
      metaPagesByPageId: {
        "page-a": {
          merchant_id: "merchant-a",
          page_id: "page-a",
          page_name: "Page A",
          page_access_token: "test-page-token-a",
          connected_at: "2026-07-24T00:00:00.000Z",
          platform: "messenger",
        },
        "page-b": {
          merchant_id: "merchant-b",
          page_id: "page-b",
          page_name: "Page B",
          page_access_token: "test-page-token-b",
          connected_at: "2026-07-24T00:00:00.000Z",
          platform: "messenger",
        },
      },
      ordersByMerchant: {
        "merchant-a": [order("order-a", "merchant-a")],
        "merchant-b": [order("order-b", "merchant-b")],
      },
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
    }),
  );

  await writeFile(
    path.join(dataDir, "training-requests.json"),
    JSON.stringify({
      requests: [
        trainingRequest("training-a", "merchant-a"),
        trainingRequest("training-b", "merchant-b"),
      ],
    }),
  );
  await writeFile(
    path.join(dataDir, "learned-answers.json"),
    JSON.stringify({ answers: [] }),
  );

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverOutput = "";

  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      LOG_LEVEL: "silent",
      BOT_DEBUG: "false",
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_MERCHANT_SESSION_SECRET: "test-merchant-session-secret",
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
    await rm(runtimeDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => serverOutput);

  const apiFetch = (url, options = {}) => fetch(`${baseUrl}${url}`, options);

  async function login(phone, password) {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    const body = await response.json();
    return { response, body, setCookie: getSetCookie(response) };
  }

  await t.test("rejects missing and tampered sessions", async () => {
    const withoutSession = await apiFetch(
      "/api/auth/me?merchantId=merchant-a",
    );
    assert.equal(withoutSession.status, 401);

    const savedAnswerWithoutSession = await apiFetch("/api/saved-answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantId: "merchant-a",
        question_pattern: "Question",
        answer_text: "Answer",
      }),
    });
    assert.equal(savedAnswerWithoutSession.status, 401);
  });

  const loginA = await login("07111111111", "MerchantA1@");
  assert.equal(loginA.response.status, 200);
  assert.equal(loginA.body.merchant.id, "merchant-a");
  assert.match(loginA.setCookie, /HttpOnly/i);
  assert.match(loginA.setCookie, /SameSite=Lax/i);
  assert.match(loginA.setCookie, /Path=\/api/i);
  const cookieA = cookiePair(loginA.setCookie);

  const loginB = await login("07222222222", "MerchantB1@");
  assert.equal(loginB.response.status, 200);
  const cookieB = cookiePair(loginB.setCookie);

  await t.test("derives identity from the signed session", async () => {
    const me = await parseJson(await apiFetch(
      "/api/auth/me?merchantId=merchant-b",
      { headers: { Cookie: cookieA } },
    ));
    assert.equal(me.response.status, 200);
    assert.equal(me.body.merchant.id, "merchant-a");

    const tampered = await apiFetch("/api/auth/me", {
      headers: { Cookie: tamperCookie(cookieA) },
    });
    assert.equal(tampered.status, 401);
  });

  await t.test("isolates product, conversation, order, and Meta reads", async () => {
    const productsA = await parseJson(await apiFetch(
      "/api/products?merchantId=merchant-b",
      { headers: { Cookie: cookieA } },
    ));
    assert.deepEqual(
      productsA.body.products.map((item) => item.id),
      ["product-a"],
    );

    const productsB = await parseJson(await apiFetch(
      "/api/products?merchantId=merchant-a",
      { headers: { Cookie: cookieB } },
    ));
    assert.deepEqual(
      productsB.body.products.map((item) => item.id),
      ["product-b"],
    );

    const crossTenantPath = await apiFetch(
      "/api/bot/products/merchant-b",
      { headers: { Cookie: cookieA } },
    );
    assert.equal(crossTenantPath.status, 403);

    const conversationsA = await parseJson(await apiFetch(
      "/api/conversations?merchantId=merchant-b",
      { headers: { Cookie: cookieA } },
    ));
    assert.deepEqual(
      conversationsA.body.conversations.map((item) => item.id),
      ["conversation-a"],
    );

    const ordersA = await parseJson(await apiFetch(
      "/api/orders?merchantId=merchant-b",
      { headers: { Cookie: cookieA } },
    ));
    assert.deepEqual(
      ordersA.body.orders.map((item) => item.id),
      ["order-a"],
    );

    const pagesA = await parseJson(await apiFetch(
      "/api/meta/pages?merchantId=merchant-b",
      { headers: { Cookie: cookieA } },
    ));
    assert.deepEqual(
      pagesA.body.pages.map((item) => item.page_id),
      ["page-a"],
    );
  });

  await t.test("forces product writes into the authenticated tenant", async () => {
    const sync = await parseJson(await apiFetch("/api/bot/products/sync", {
      method: "POST",
      headers: {
        Cookie: cookieA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merchant_id: "merchant-b",
        products: [{
          id: "injected-product",
          merchant_id: "merchant-b",
          name: "Authenticated A Product",
        }],
      }),
    }));

    assert.equal(sync.response.status, 200);
    assert.equal(sync.body.merchant_id, "merchant-a");

    const productsB = await parseJson(await apiFetch("/api/products", {
      headers: { Cookie: cookieB },
    }));
    assert.deepEqual(
      productsB.body.products.map((item) => item.id),
      ["product-b"],
    );
  });

  await t.test("isolates saved answers and training actions", async () => {
    const created = await parseJson(await apiFetch("/api/saved-answers", {
      method: "POST",
      headers: {
        Cookie: cookieA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merchantId: "merchant-b",
        question_pattern: "Delivery time?",
        answer_text: "Tomorrow",
        language: "en",
      }),
    }));
    assert.equal(created.response.status, 201);
    assert.equal(created.body.answer.merchant_id, "merchant-a");

    const answersB = await parseJson(await apiFetch(
      "/api/saved-answers?merchantId=merchant-a",
      { headers: { Cookie: cookieB } },
    ));
    assert.equal(answersB.body.answers.length, 0);

    const trainingA = await parseJson(await apiFetch(
      "/api/bot-training/requests?merchantId=merchant-b",
      { headers: { Cookie: cookieA } },
    ));
    assert.deepEqual(
      trainingA.body.requests.map((item) => item.id),
      ["training-a"],
    );

    const rejectOtherTenant = await apiFetch(
      "/api/bot-training/requests/training-b/reject",
      {
        method: "POST",
        headers: {
          Cookie: cookieA,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ merchantId: "merchant-b" }),
      },
    );
    assert.equal(rejectOtherTenant.status, 404);
  });

  await t.test("changes only the authenticated merchant password", async () => {
    const withoutSession = await apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "07111111111",
        currentPassword: "MerchantA1@",
        newPassword: "MerchantA2@",
        confirmPassword: "MerchantA2@",
      }),
    });
    assert.equal(withoutSession.status, 401);

    const changed = await apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        Cookie: cookieA,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: "07222222222",
        currentPassword: "MerchantA1@",
        newPassword: "MerchantA2@",
        confirmPassword: "MerchantA2@",
      }),
    });
    assert.equal(changed.status, 200);

    const oldPassword = await login("07111111111", "MerchantA1@");
    assert.equal(oldPassword.response.status, 401);

    const newPassword = await login("07111111111", "MerchantA2@");
    assert.equal(newPassword.response.status, 200);

    const unchangedMerchantB = await login("07222222222", "MerchantB1@");
    assert.equal(unchangedMerchantB.response.status, 200);
  });

  await t.test("requires a session for Meta login and rejects tampered state", async () => {
    const withoutSession = await apiFetch(
      "/api/meta/login?merchantId=merchant-a",
      { redirect: "manual" },
    );
    assert.equal(withoutSession.status, 401);

    const loginRedirect = await apiFetch(
      "/api/meta/login?merchantId=merchant-b&platform=messenger",
      {
        headers: { Cookie: cookieA },
        redirect: "manual",
      },
    );
    assert.equal(loginRedirect.status, 302);

    const location = loginRedirect.headers.get("location");
    assert.ok(location);
    const state = new URL(location).searchParams.get("state");
    assert.ok(state);

    const [payload, signature] = state.split(".");
    const alteredSignature =
      `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    const tamperedState = `${payload}.${alteredSignature}`;

    const callback = await apiFetch(
      `/api/meta/callback?code=fake&state=${encodeURIComponent(tamperedState)}`,
    );
    assert.equal(callback.status, 400);
    assert.equal(await callback.text(), "Invalid or expired Meta state");
  });

  await t.test("clears the browser session cookie on logout", async () => {
    const logout = await apiFetch("/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookieA },
    });
    assert.equal(logout.status, 200);
    const clearedCookie = getSetCookie(logout);
    assert.match(clearedCookie, /^fawri_merchant_session=/);
    assert.match(clearedCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
  });
});
