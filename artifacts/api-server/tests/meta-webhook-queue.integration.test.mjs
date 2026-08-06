import assert from "node:assert/strict";
import crypto from "node:crypto";
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
const appSecret = "queue-test-meta-app-secret";

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

function signature(payload) {
  return `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex")}`;
}

function subscription() {
  return {
    id: "subscription-approved",
    merchant_id: "merchant-approved",
    plan_name: "silver",
    price_iqd: 25_000,
    reply_limit: 10,
    replies_used: 0,
    replies_remaining: 10,
    base_reply_limit: 10,
    base_replies_used: 0,
    base_replies_remaining: 10,
    addon_replies_remaining: 0,
    addon_reply_batches: [],
    billing_anchor_day: 1,
    start_date: "2026-08-01T00:00:00.000Z",
    expires_at: "2026-09-01T00:00:00.000Z",
    status: "active",
    auto_reply_enabled: true,
  };
}

test("verified Meta events are durably queued before reply processing", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-meta-queue-ingress-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  const merchantsPath = path.join(dataDirectory, "merchants.json");
  const runtimePath = path.join(dataDirectory, "fawri-runtime-db.json");
  await writeFile(
    merchantsPath,
    JSON.stringify({
      merchants: [
        {
          id: "merchant-approved",
          owner_name: "Approved owner",
          store_name: "Approved store",
          phone: "07111111111",
          password: "ApprovedPassword1!",
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
        },
      ],
      subscriptions: [subscription()],
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
    runtimePath,
    JSON.stringify({
      productsByMerchant: { "merchant-approved": [] },
      conversationsByMerchant: {},
      metaPagesByPageId: {
        "approved-page": {
          merchant_id: "merchant-approved",
          page_id: "approved-page",
          page_name: "Approved page",
          page_access_token: "not-used-by-ingress",
          connected_at: "2026-08-01T00:00:00.000Z",
          platform: "messenger",
        },
      },
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
      FAWRI_DISABLE_JOB_WORKERS: "1",
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_MERCHANT_SESSION_SECRET: "test-merchant-session-secret",
      META_APP_SECRET: appSecret,
      META_VERIFY_TOKEN: "test-meta-verify-token",
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

  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "approved-page",
        messaging: [
          {
            sender: { id: "customer-1" },
            recipient: { id: "approved-page" },
            timestamp: 1_786_024_000_000,
            message: { mid: "queue-message-1", text: "hello" },
          },
        ],
      },
    ],
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/meta/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature(body),
      },
      body,
    });
    assert.equal(response.status, 200, await response.text());
  }

  const jobs = JSON.parse(
    await readFile(path.join(dataDirectory, "background-jobs.json"), "utf8"),
  );
  assert.equal(jobs.version, 1);
  assert.equal(jobs.jobs.length, 1);
  assert.equal(jobs.jobs[0].type, "meta.webhook.reply");
  assert.equal(jobs.jobs[0].dedupe_key, "meta:approved-page:queue-message-1");
  assert.equal(jobs.jobs[0].status, "queued");
  assert.equal(jobs.jobs[0].attempts, 0);
  assert.equal(jobs.jobs[0].merchant_id, "merchant-approved");
  assert.equal(
    jobs.jobs[0].payload.external_message_id,
    "queue-message-1",
  );

  const processedEvents = JSON.parse(
    await readFile(path.join(dataDirectory, "processed-meta-events.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(processedEvents.events), [
    "meta:approved-page:queue-message-1",
  ]);

  const merchantDatabase = JSON.parse(await readFile(merchantsPath, "utf8"));
  const storedSubscription = merchantDatabase.subscriptions[0];
  assert.equal(storedSubscription.replies_used, 0);
  assert.equal(storedSubscription.replies_remaining, 10);
  await assert.rejects(
    readFile(path.join(dataDirectory, "reply-reservations.json"), "utf8"),
    (error) => error?.code === "ENOENT",
  );

  const runtimeDatabase = JSON.parse(await readFile(runtimePath, "utf8"));
  assert.deepEqual(runtimeDatabase.conversationsByMerchant, {});
});
