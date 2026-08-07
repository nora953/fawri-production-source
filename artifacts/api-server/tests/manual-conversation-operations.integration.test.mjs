import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
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

async function jsonResponse(response) {
  return {
    response,
    body: await response.json().catch(() => null),
  };
}

async function startFakeMetaServer(t) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) : {};
    requests.push({ url: req.url, body });

    res.setHeader("Content-Type", "application/json");
    if (body?.message?.text === "force confirmed failure") {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: { code: 19001, message: "confirmed test failure" },
        }),
      );
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ message_id: `meta-message-${requests.length}` }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
  };
}

function signedWebhook(secret, body) {
  const rawBody = JSON.stringify(body);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return {
    rawBody,
    signature: `sha256=${signature}`,
  };
}

test("manual conversation operations are server-authoritative and idempotent", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-manual-conversation-"),
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
      conversationsByMerchant: {
        "merchant-a": [
          {
            id: "messenger-customer-a",
            merchant_id: "merchant-a",
            platform: "messenger",
            customer_name: "Customer A",
            customer_handle: "customer-a",
            status: "auto_replying",
            assigned_to_human: false,
            needs_training: false,
            updated_at: "2026-08-06T10:00:00.000Z",
            messages: [
              {
                id: "customer-message-a",
                external_message_id: "incoming-a",
                conversation_id: "messenger-customer-a",
                sender: "customer",
                text: "Hello",
                created_at: "2026-08-06T10:00:00.000Z",
                counted_as_auto_reply: false,
                status: "received",
              },
            ],
          },
        ],
        "merchant-b": [
          {
            id: "messenger-customer-b",
            merchant_id: "merchant-b",
            platform: "messenger",
            customer_name: "Customer B",
            customer_handle: "customer-b",
            status: "auto_replying",
            assigned_to_human: false,
            needs_training: false,
            updated_at: "2026-08-06T10:00:00.000Z",
            messages: [],
          },
        ],
      },
      metaPagesByPageId: {
        "page-a": {
          merchant_id: "merchant-a",
          page_id: "page-a",
          page_name: "Page A",
          page_access_token: "token-a",
          connected_at: "2026-08-01T00:00:00.000Z",
          platform: "messenger",
        },
        "page-b": {
          merchant_id: "merchant-b",
          page_id: "page-b",
          page_name: "Page B",
          page_access_token: "token-b",
          connected_at: "2026-08-01T00:00:00.000Z",
          platform: "messenger",
        },
      },
      ordersByMerchant: {},
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
    }),
  );
  await writeFile(
    path.join(dataDirectory, "background-jobs.json"),
    JSON.stringify({ version: 1, jobs: [] }),
  );
  await writeFile(
    path.join(dataDirectory, "processed-meta-events.json"),
    JSON.stringify({ events: {} }),
  );
  await writeFile(
    path.join(dataDirectory, "reply-reservations.json"),
    JSON.stringify({ reservations: {} }),
  );

  const fakeMeta = await startFakeMetaServer(t);
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const metaAppSecret = "test-meta-app-secret";
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
      META_APP_SECRET: metaAppSecret,
      META_CONFIG_ID: "test-meta-config",
      META_REDIRECT_URI: `${baseUrl}/api/meta/callback`,
      META_GRAPH_BASE_URL: fakeMeta.baseUrl,
      FAWRI_DISABLE_JOB_WORKERS: "1",
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
  const authenticatedHeaders = { Cookie: cookie };

  const initial = await jsonResponse(
    await apiFetch("/api/conversations", { headers: authenticatedHeaders }),
  );
  assert.equal(initial.response.status, 200, JSON.stringify(initial.body));
  assert.equal(initial.body.conversations.length, 1);
  assert.equal(initial.body.conversations[0].status, "auto_replying");

  const beforeTakeover = await jsonResponse(
    await apiFetch("/api/conversations/messenger-customer-a/messages", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "manual-before-takeover-0001",
      },
      body: JSON.stringify({ text: "must be blocked" }),
    }),
  );
  assert.equal(beforeTakeover.response.status, 409);
  assert.equal(beforeTakeover.body.code, "MANUAL_TAKEOVER_REQUIRED");
  assert.equal(fakeMeta.requests.length, 0);

  const takeover = await jsonResponse(
    await apiFetch("/api/conversations/messenger-customer-a/takeover", {
      method: "POST",
      headers: authenticatedHeaders,
    }),
  );
  assert.equal(takeover.response.status, 200, JSON.stringify(takeover.body));
  assert.equal(takeover.body.conversation.status, "manual");
  assert.equal(takeover.body.conversation.assigned_to_human, true);
  assert.equal(takeover.body.conversation.page_id, "page-a");

  const suppressedBody = {
    object: "page",
    entry: [
      {
        id: "page-a",
        messaging: [
          {
            sender: { id: "customer-a" },
            message: {
              mid: "incoming-during-manual",
              text: "Do not auto reply",
            },
          },
        ],
      },
    ],
  };
  const signed = signedWebhook(metaAppSecret, suppressedBody);
  const suppressed = await apiFetch("/api/meta/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signed.signature,
    },
    body: signed.rawBody,
  });
  assert.equal(suppressed.status, 200);
  const queueAfterSuppression = JSON.parse(
    await readFile(path.join(dataDirectory, "background-jobs.json"), "utf8"),
  );
  assert.deepEqual(queueAfterSuppression.jobs, []);
  const processedAfterSuppression = JSON.parse(
    await readFile(
      path.join(dataDirectory, "processed-meta-events.json"),
      "utf8",
    ),
  );
  assert.ok(
    Object.hasOwn(
      processedAfterSuppression.events,
      "meta:page-a:incoming-during-manual",
    ),
  );

  const requestKey = "manual-success-request-0001";
  const sent = await jsonResponse(
    await apiFetch("/api/conversations/messenger-customer-a/messages", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": requestKey,
      },
      body: JSON.stringify({ text: "Manual reply sent" }),
    }),
  );
  assert.equal(sent.response.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.message.sender, "merchant");
  assert.equal(sent.body.message.status, "sent");
  assert.equal(sent.body.message.text, "Manual reply sent");
  assert.equal(fakeMeta.requests.length, 1);
  assert.match(fakeMeta.requests[0].url, /access_token=token-a/);
  assert.deepEqual(fakeMeta.requests[0].body, {
    recipient: { id: "customer-a" },
    message: { text: "Manual reply sent" },
  });

  const duplicate = await jsonResponse(
    await apiFetch("/api/conversations/messenger-customer-a/messages", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": requestKey,
      },
      body: JSON.stringify({ text: "Manual reply sent" }),
    }),
  );
  assert.equal(duplicate.response.status, 200, JSON.stringify(duplicate.body));
  assert.equal(duplicate.body.deduplicated, true);
  assert.equal(fakeMeta.requests.length, 1, "duplicate request resent to Meta");

  const reusedKey = await jsonResponse(
    await apiFetch("/api/conversations/messenger-customer-a/messages", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": requestKey,
      },
      body: JSON.stringify({ text: "Different content" }),
    }),
  );
  assert.equal(reusedKey.response.status, 409);
  assert.equal(reusedKey.body.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(fakeMeta.requests.length, 1);

  const failed = await jsonResponse(
    await apiFetch("/api/conversations/messenger-customer-a/messages", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "manual-failure-request-0001",
      },
      body: JSON.stringify({ text: "force confirmed failure" }),
    }),
  );
  assert.equal(failed.response.status, 502);
  assert.equal(failed.body.code, "MANUAL_REPLY_DELIVERY_FAILED");
  assert.equal(fakeMeta.requests.length, 2);

  const afterFailure = await jsonResponse(
    await apiFetch("/api/conversations", { headers: authenticatedHeaders }),
  );
  assert.equal(afterFailure.response.status, 200);
  const merchantMessages = afterFailure.body.conversations[0].messages.filter(
    (message) => message.sender === "merchant",
  );
  assert.deepEqual(
    merchantMessages.map((message) => message.text),
    ["Manual reply sent"],
    "failed reply was stored as if it had been delivered",
  );

  const crossMerchant = await jsonResponse(
    await apiFetch("/api/conversations/messenger-customer-b/takeover", {
      method: "POST",
      headers: authenticatedHeaders,
    }),
  );
  assert.equal(crossMerchant.response.status, 404);
  assert.equal(crossMerchant.body.code, "CONVERSATION_NOT_FOUND");

  const returned = await jsonResponse(
    await apiFetch(
      "/api/conversations/messenger-customer-a/return-to-fawri",
      {
        method: "POST",
        headers: authenticatedHeaders,
      },
    ),
  );
  assert.equal(returned.response.status, 200, JSON.stringify(returned.body));
  assert.equal(returned.body.conversation.status, "auto_replying");
  assert.equal(returned.body.conversation.assigned_to_human, false);

  const afterReturn = await jsonResponse(
    await apiFetch("/api/conversations/messenger-customer-a/messages", {
      method: "POST",
      headers: {
        ...authenticatedHeaders,
        "Content-Type": "application/json",
        "Idempotency-Key": "manual-after-return-0001",
      },
      body: JSON.stringify({ text: "must be blocked again" }),
    }),
  );
  assert.equal(afterReturn.response.status, 409);
  assert.equal(afterReturn.body.code, "MANUAL_TAKEOVER_REQUIRED");
  assert.equal(fakeMeta.requests.length, 2);

  const baseRuntime = JSON.parse(
    await readFile(path.join(dataDirectory, "fawri-runtime-db.json"), "utf8"),
  );
  assert.equal(
    baseRuntime.conversationsByMerchant["merchant-a"][0].messages.length,
    1,
    "manual operations modified the legacy bot runtime conversation",
  );
  const overlay = JSON.parse(
    await readFile(
      path.join(dataDirectory, "manual-conversation-operations.json"),
      "utf8",
    ),
  );
  const overlayConversation =
    overlay.conversations["merchant-a"]["messenger-customer-a"];
  assert.equal(overlayConversation.manual_messages.length, 1);
  assert.equal(overlayConversation.requests[requestKey].status, "sent");
  assert.equal(
    overlayConversation.requests["manual-failure-request-0001"].status,
    "failed",
  );
});
