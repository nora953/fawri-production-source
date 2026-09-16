import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early.\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become ready.\n${logs()}`);
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("support preview is consent-bound, secret-safe, and read-only", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-support-preview-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const approvedAt = new Date().toISOString();
  const sessionExpiresAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();
  const common = {
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: approvedAt,
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };

  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          ...common,
          id: "merchant-one",
          owner_name: "Merchant Owner",
          store_name: "Merchant Store",
          phone: "07111111111",
          password: "Merchant1@",
          activity_type: "retail",
        },
        {
          ...common,
          id: "assistant-admin",
          owner_name: "Support Assistant",
          store_name: "Fawri Admin",
          phone: "07333333333",
          password: "Assistant1@",
          activity_type: "admin",
          is_admin: true,
          admin_role: "assistant_admin",
          admin_enabled: true,
          permissions: ["manage_support", "inspect_merchant_sessions"],
          admin_session_version: 0,
        },
      ],
      subscriptions: [
        {
          id: "sub-one",
          merchant_id: "merchant-one",
          plan_name: "gold",
          price_iqd: 49000,
          reply_limit: 8000,
          replies_used: 10,
          replies_remaining: 7990,
          base_reply_limit: 8000,
          base_replies_used: 10,
          base_replies_remaining: 7990,
          addon_replies_remaining: 0,
          addon_reply_batches: [],
          billing_anchor_day: 5,
          start_date: approvedAt,
          expires_at: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
          status: "active",
          auto_reply_enabled: true,
          emergency_credit_used: 0,
          emergency_credit_amount: 800,
          emergency_credit_remaining: 0,
          emergency_credit_activated: false,
          emergency_debt: 0,
          pending_next_cycle_deduction: 0,
        },
      ],
      otps: [],
      admin_logs: [],
      merchant_notifications: [],
      support_tickets: [
        {
          id: "ticket-one",
          merchant_id: "merchant-one",
          merchant_name: "Merchant Store",
          merchant_phone: "07111111111",
          subject: "Products are not loading",
          category: "technical",
          status: "in_progress",
          assigned_admin_id: "assistant-admin",
          assigned_admin_name: "Support Assistant",
          created_at: approvedAt,
          updated_at: approvedAt,
          messages: [],
          inspection_requests: [
            {
              id: "inspection-one",
              ticket_id: "ticket-one",
              merchant_id: "merchant-one",
              admin_id: "assistant-admin",
              admin_name: "Support Assistant",
              mode: "independent_read_only",
              reason: "Inspect product synchronization",
              status: "approved",
              consent_decision: "approved",
              read_only: true,
              session_duration_minutes: 30,
              requested_at: approvedAt,
              request_expires_at: sessionExpiresAt,
              responded_at: approvedAt,
              approved_at: approvedAt,
              session_expires_at: sessionExpiresAt,
            },
          ],
        },
      ],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
    }),
  );

  await writeFile(
    path.join(dataDir, "fawri-runtime-db.json"),
    JSON.stringify({
      productsByMerchant: {
        "merchant-one": [
          { id: "product-one", name: "Test product", quantity: 4 },
        ],
      },
      conversationsByMerchant: {
        "merchant-one": [
          { id: "conversation-one", customer_name: "Customer", messages: [] },
        ],
      },
      ordersByMerchant: {
        "merchant-one": [
          { id: "order-one", customer_name: "Customer", total_price: 1000 },
        ],
      },
      metaPagesByPageId: {
        page1: {
          merchant_id: "merchant-one",
          page_id: "page1",
          page_name: "Merchant Page",
          page_access_token: "must-never-leak",
          platform: "messenger",
          connected_at: approvedAt,
          webhook_subscribed: true,
        },
      },
      orderDraftsByConversation: {},
      lastSyncedMerchantId: "merchant-one",
    }),
  );
  await writeFile(
    path.join(dataDir, "saved-answers.json"),
    JSON.stringify({ answers: [] }),
  );
  await writeFile(
    path.join(dataDir, "training-requests.json"),
    JSON.stringify({ requests: [] }),
  );
  await writeFile(
    path.join(dataDir, "learned-answers.json"),
    JSON.stringify({ answers: [] }),
  );

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      LOG_LEVEL: "silent",
      BOT_DEBUG: "false",
      FAWRI_DATA_DIR: dataDir,
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_MERCHANT_SESSION_SECRET: "test-merchant-session-secret",
      FAWRI_ADMIN_DEVICE_TRUST_ENFORCED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
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

  await waitForServer(baseUrl, child, () => output);

  const login = await json(
    await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "07333333333",
        password: "Assistant1@",
      }),
    }),
  );
  assert.equal(login.response.status, 200);
  assert.equal(login.body.account_type, "admin");
  const headers = {
    Authorization: `Bearer ${login.body.admin_token}`,
    "Content-Type": "application/json",
  };

  const started = await json(
    await fetch(`${baseUrl}/api/auth/admin/support-preview/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ticket_id: "ticket-one",
        request_id: "inspection-one",
      }),
    }),
  );
  assert.equal(started.response.status, 201);
  assert.equal(started.body.session.merchant_id, "merchant-one");
  const sessionId = started.body.session.id;

  const snapshot = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/support-preview/${sessionId}/snapshot`,
      { headers },
    ),
  );
  assert.equal(snapshot.response.status, 200);
  assert.equal(snapshot.body.snapshot.products[0].name, "Test product");
  assert.equal(snapshot.body.snapshot.channels[0].page_name, "Merchant Page");
  assert.equal("page_access_token" in snapshot.body.snapshot.channels[0], false);
  assert.equal("password" in snapshot.body.snapshot.merchant, false);
  assert.doesNotMatch(JSON.stringify(snapshot.body), /must-never-leak/);
  assert.doesNotMatch(JSON.stringify(snapshot.body), /Merchant1@/);

  const writeAttempt = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/support-preview/${sessionId}/snapshot`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "changed" }),
      },
    ),
  );
  assert.equal(writeAttempt.response.status, 403);
  assert.equal(writeAttempt.body.code, "SUPPORT_PREVIEW_READ_ONLY");

  const ended = await json(
    await fetch(`${baseUrl}/api/auth/admin/support-preview/${sessionId}/end`, {
      method: "POST",
      headers,
    }),
  );
  assert.equal(ended.response.status, 200);
  assert.equal(ended.body.session.status, "ended");

  const restartAttempt = await json(
    await fetch(`${baseUrl}/api/auth/admin/support-preview/start`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ticket_id: "ticket-one",
        request_id: "inspection-one",
      }),
    }),
  );
  assert.equal(restartAttempt.response.status, 409);
  assert.equal(restartAttempt.body.code, "INSPECTION_APPROVAL_REQUIRED");

  const afterEnd = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/support-preview/${sessionId}/snapshot`,
      { headers },
    ),
  );
  assert.equal(afterEnd.response.status, 410);
  assert.equal(afterEnd.body.code, "SUPPORT_PREVIEW_ENDED");

  const authDb = JSON.parse(
    await readFile(path.join(dataDir, "merchants.json"), "utf8"),
  );
  const request = authDb.support_tickets[0].inspection_requests[0];
  assert.equal(request.status, "expired");
  assert.equal(request.end_reason, "admin_terminated");
  assert.ok(request.ended_at);
  const actions = authDb.admin_logs.map((item) => item.action_type);
  assert.ok(actions.includes("support_preview_session_started"));
  assert.ok(actions.includes("support_preview_section_viewed"));
  assert.ok(actions.includes("support_preview_session_ended"));
});
