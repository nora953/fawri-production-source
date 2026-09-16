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
const appSecret = "test-meta-app-secret";

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

async function jsonResponse(response) {
  return {
    response,
    body: await response.json().catch(() => null),
  };
}

test("Meta webhook verifies signatures and filters duplicate events", async (t) => {
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-meta-webhook-security-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  const runtimeDatabasePath = path.join(
    dataDirectory,
    "fawri-runtime-db.json",
  );
  const processedEventsPath = path.join(
    dataDirectory,
    "processed-meta-events.json",
  );

  await writeFile(
    path.join(dataDirectory, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          id: "merchant-suspended",
          owner_name: "Suspended owner",
          store_name: "Suspended store",
          phone: "07111111111",
          password: "SuspendedPassword1!",
          activity_type: "retail",
          status: "suspended",
          account_status: "suspended",
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
      productsByMerchant: {},
      conversationsByMerchant: {},
      metaPagesByPageId: {
        "suspended-page": {
          merchant_id: "merchant-suspended",
          page_id: "suspended-page",
          page_name: "Suspended page",
          page_access_token: "must-not-be-used",
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

  const eventBody = {
    object: "page",
    entry: [
      {
        id: "suspended-page",
        messaging: [
          {
            sender: { id: "customer-1" },
            recipient: { id: "suspended-page" },
            timestamp: 1_786_024_000_000,
            message: { mid: "meta-message-1", text: "hello" },
          },
        ],
      },
    ],
  };
  const payload = JSON.stringify(eventBody);

  const missingSignature = await jsonResponse(
    await fetch(`${baseUrl}/api/meta/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }),
  );
  assert.equal(missingSignature.response.status, 401);
  assert.equal(missingSignature.body.code, "META_WEBHOOK_SIGNATURE_REQUIRED");

  const invalidSignature = await jsonResponse(
    await fetch(`${baseUrl}/api/meta/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": `sha256=${"0".repeat(64)}`,
      },
      body: payload,
    }),
  );
  assert.equal(invalidSignature.response.status, 401);
  assert.equal(invalidSignature.body.code, "META_WEBHOOK_SIGNATURE_INVALID");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const valid = await fetch(`${baseUrl}/api/meta/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature(payload),
      },
      body: payload,
    });
    assert.equal(valid.status, 200);
  }

  const processedEvents = JSON.parse(
    await readFile(processedEventsPath, "utf8"),
  );
  assert.deepEqual(Object.keys(processedEvents.events), [
    "meta:suspended-page:meta-message-1",
  ]);

  const runtimeDatabase = JSON.parse(
    await readFile(runtimeDatabasePath, "utf8"),
  );
  assert.deepEqual(
    runtimeDatabase.conversationsByMerchant["merchant-suspended"] || [],
    [],
    "suspended merchant webhook produced a conversation",
  );

  const verification = await fetch(
    `${baseUrl}/api/meta/webhook?hub.mode=subscribe&hub.verify_token=test-meta-verify-token&hub.challenge=verified`,
  );
  assert.equal(verification.status, 200);
  assert.equal(await verification.text(), "verified");
});
