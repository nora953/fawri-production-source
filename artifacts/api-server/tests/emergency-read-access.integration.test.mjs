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

async function loginAdmin(baseUrl, phone, password) {
  const result = await json(
    await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    }),
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.body.account_type, "admin");
  assert.ok(result.body.admin_token);
  return {
    Authorization: `Bearer ${result.body.admin_token}`,
    "Content-Type": "application/json",
  };
}

test("emergency read access is owner-controlled, secret-safe, read-only, and audited", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-emergency-read-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const createdAt = new Date().toISOString();
  const common = {
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: createdAt,
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
          id: "owner-admin",
          owner_name: "Platform Owner",
          store_name: "Fawri Admin",
          phone: "07222222222",
          password: "Owner123@",
          activity_type: "admin",
          is_admin: true,
          admin_role: "owner_admin",
          admin_enabled: true,
          permissions: [],
          admin_session_version: 0,
        },
        {
          ...common,
          id: "trusted-admin",
          owner_name: "Trusted Responder",
          store_name: "Fawri Admin",
          phone: "07333333333",
          password: "Assistant1@",
          activity_type: "admin",
          is_admin: true,
          admin_role: "assistant_admin",
          admin_enabled: true,
          permissions: [],
          admin_session_version: 0,
        },
        {
          ...common,
          id: "untrusted-admin",
          owner_name: "Untrusted Assistant",
          store_name: "Fawri Admin",
          phone: "07444444444",
          password: "Untrusted1@",
          activity_type: "admin",
          is_admin: true,
          admin_role: "assistant_admin",
          admin_enabled: true,
          permissions: [],
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
          start_date: createdAt,
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
      support_tickets: [],
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
          { id: "product-one", name: "Emergency product", quantity: 3 },
        ],
      },
      conversationsByMerchant: {
        "merchant-one": [
          { id: "conversation-one", customer_name: "Customer", messages: [] },
        ],
      },
      ordersByMerchant: {
        "merchant-one": [
          { id: "order-one", customer_name: "Customer", total_price: 1500 },
        ],
      },
      metaPagesByPageId: {
        page1: {
          merchant_id: "merchant-one",
          page_id: "page1",
          page_name: "Merchant Page",
          page_access_token: "emergency-secret-token",
          platform: "messenger",
          connected_at: createdAt,
          webhook_subscribed: true,
        },
      },
      orderDraftsByConversation: {},
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

  const ownerHeaders = await loginAdmin(
    baseUrl,
    "07222222222",
    "Owner123@",
  );
  const trustedHeaders = await loginAdmin(
    baseUrl,
    "07333333333",
    "Assistant1@",
  );
  const untrustedHeaders = await loginAdmin(
    baseUrl,
    "07444444444",
    "Untrusted1@",
  );

  const untrustedAttempt = await json(
    await fetch(`${baseUrl}/api/auth/admin/emergency-read-access/requests`, {
      method: "POST",
      headers: untrustedHeaders,
      body: JSON.stringify({
        merchant_id: "merchant-one",
        incident_reference: "INC-UNTRUSTED-1",
        severity: "high",
        reason: "Investigate a reported production incident safely.",
        duration_minutes: 15,
        critical_self_activate: false,
      }),
    }),
  );
  assert.equal(untrustedAttempt.response.status, 403);
  assert.equal(untrustedAttempt.body.code, "EMERGENCY_AUTHORIZATION_REQUIRED");

  const authorization = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/authorizations/trusted-admin`,
      {
        method: "PUT",
        headers: ownerHeaders,
        body: JSON.stringify({
          can_request: true,
          can_critical_self_activate: true,
        }),
      },
    ),
  );
  assert.equal(authorization.response.status, 200);
  assert.equal(authorization.body.authorization.can_request, true);
  assert.equal(
    authorization.body.authorization.can_critical_self_activate,
    true,
  );

  const requested = await json(
    await fetch(`${baseUrl}/api/auth/admin/emergency-read-access/requests`, {
      method: "POST",
      headers: trustedHeaders,
      body: JSON.stringify({
        merchant_id: "merchant-one",
        incident_reference: "INC-HIGH-1001",
        severity: "high",
        reason: "Investigate a production synchronization failure safely.",
        duration_minutes: 15,
        critical_self_activate: false,
      }),
    }),
  );
  assert.equal(requested.response.status, 201);
  assert.equal(requested.body.request.status, "pending");
  assert.equal(requested.body.request.read_only, true);
  const approvedRequestId = requested.body.request.id;

  const beforeApproval = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/requests/${approvedRequestId}/snapshot`,
      { headers: trustedHeaders },
    ),
  );
  assert.equal(beforeApproval.response.status, 410);
  assert.equal(beforeApproval.body.code, "EMERGENCY_ACCESS_INACTIVE");

  const ownerOverview = await json(
    await fetch(`${baseUrl}/api/auth/admin/emergency-read-access/overview`, {
      headers: ownerHeaders,
    }),
  );
  assert.equal(ownerOverview.response.status, 200);
  assert.equal(ownerOverview.body.is_owner, true);
  assert.ok(
    ownerOverview.body.owner_alerts.some(
      (alert) =>
        alert.request_id === approvedRequestId &&
        alert.type === "approval_required",
    ),
  );

  const approved = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/requests/${approvedRequestId}/decision`,
      {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({ decision: "approve" }),
      },
    ),
  );
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.request.status, "active");
  assert.equal(approved.body.request.activation_mode, "owner_approval");
  assert.ok(approved.body.request.expires_at);

  const snapshot = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/requests/${approvedRequestId}/snapshot`,
      { headers: trustedHeaders },
    ),
  );
  assert.equal(snapshot.response.status, 200);
  assert.equal(snapshot.body.snapshot.products[0].name, "Emergency product");
  assert.equal(snapshot.body.snapshot.channels[0].page_name, "Merchant Page");
  assert.equal("page_access_token" in snapshot.body.snapshot.channels[0], false);
  assert.equal("password" in snapshot.body.snapshot.merchant, false);
  assert.equal(
    snapshot.body.snapshot.emergency_access.incident_reference,
    "INC-HIGH-1001",
  );
  assert.doesNotMatch(JSON.stringify(snapshot.body), /emergency-secret-token/);
  assert.doesNotMatch(JSON.stringify(snapshot.body), /Merchant1@/);

  const writeAttempt = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/requests/${approvedRequestId}/snapshot`,
      {
        method: "POST",
        headers: trustedHeaders,
        body: JSON.stringify({ name: "changed" }),
      },
    ),
  );
  assert.equal(writeAttempt.response.status, 403);
  assert.equal(writeAttempt.body.code, "EMERGENCY_ACCESS_READ_ONLY");

  const endedApproved = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/requests/${approvedRequestId}/end`,
      { method: "POST", headers: trustedHeaders },
    ),
  );
  assert.equal(endedApproved.response.status, 200);
  assert.equal(endedApproved.body.request.status, "ended");
  assert.equal(endedApproved.body.request.end_reason, "admin_ended");

  const afterEnd = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/requests/${approvedRequestId}/snapshot`,
      { headers: trustedHeaders },
    ),
  );
  assert.equal(afterEnd.response.status, 410);
  assert.equal(afterEnd.body.code, "EMERGENCY_ACCESS_INACTIVE");

  const critical = await json(
    await fetch(`${baseUrl}/api/auth/admin/emergency-read-access/requests`, {
      method: "POST",
      headers: trustedHeaders,
      body: JSON.stringify({
        merchant_id: "merchant-one",
        incident_reference: "INC-CRITICAL-2001",
        severity: "critical",
        reason: "Contain an active production incident requiring immediate inspection.",
        duration_minutes: 30,
        critical_self_activate: true,
      }),
    }),
  );
  assert.equal(critical.response.status, 201);
  assert.equal(critical.body.request.status, "active");
  assert.equal(
    critical.body.request.activation_mode,
    "critical_self_activation",
  );
  const criticalRequestId = critical.body.request.id;

  const overviewAfterCritical = await json(
    await fetch(`${baseUrl}/api/auth/admin/emergency-read-access/overview`, {
      headers: ownerHeaders,
    }),
  );
  assert.equal(overviewAfterCritical.response.status, 200);
  assert.ok(
    overviewAfterCritical.body.owner_alerts.some(
      (alert) =>
        alert.request_id === criticalRequestId &&
        alert.type === "critical_self_activation",
    ),
  );

  const criticalSnapshot = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/requests/${criticalRequestId}/snapshot`,
      { headers: trustedHeaders },
    ),
  );
  assert.equal(criticalSnapshot.response.status, 200);
  assert.equal(
    criticalSnapshot.body.snapshot.emergency_access.severity,
    "critical",
  );

  const ownerEndedCritical = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/requests/${criticalRequestId}/end`,
      { method: "POST", headers: ownerHeaders },
    ),
  );
  assert.equal(ownerEndedCritical.response.status, 200);
  assert.equal(ownerEndedCritical.body.request.status, "ended");
  assert.equal(ownerEndedCritical.body.request.end_reason, "owner_ended");

  const auditResult = await json(
    await fetch(`${baseUrl}/api/auth/admin/emergency-read-access/audit`, {
      headers: ownerHeaders,
    }),
  );
  assert.equal(auditResult.response.status, 200);
  assert.equal(auditResult.body.verification.valid, true);
  assert.ok(auditResult.body.events.length >= 8);
  assert.ok(
    auditResult.body.events.some(
      (event) => event.event_type === "emergency_snapshot_viewed",
    ),
  );

  const emergencyDbPath = path.join(dataDir, "emergency-read-access.json");
  const emergencyDb = JSON.parse(await readFile(emergencyDbPath, "utf8"));
  assert.ok(
    emergencyDb.merchant_notices.some(
      (notice) => notice.request_id === approvedRequestId,
    ),
  );
  assert.ok(
    emergencyDb.merchant_notices.some(
      (notice) => notice.request_id === criticalRequestId,
    ),
  );
  assert.equal(emergencyDb.audit_events[0].previous_hash, "GENESIS");
  assert.ok(
    emergencyDb.audit_events.every(
      (event, index) =>
        index === 0 ||
        event.previous_hash === emergencyDb.audit_events[index - 1].hash,
    ),
  );

  const authDb = JSON.parse(
    await readFile(path.join(dataDir, "merchants.json"), "utf8"),
  );
  const actions = authDb.admin_logs.map((item) => item.action_type);
  assert.ok(actions.includes("emergency_read_access_authorized"));
  assert.ok(actions.includes("emergency_read_access_requested"));
  assert.ok(actions.includes("emergency_read_access_approved"));
  assert.ok(actions.includes("emergency_read_snapshot_viewed"));
  assert.ok(actions.includes("emergency_read_access_ended"));

  const revoked = await json(
    await fetch(
      `${baseUrl}/api/auth/admin/emergency-read-access/authorizations/trusted-admin`,
      {
        method: "PUT",
        headers: ownerHeaders,
        body: JSON.stringify({
          can_request: false,
          can_critical_self_activate: false,
        }),
      },
    ),
  );
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.body.authorization.can_request, false);

  const afterRevocation = await json(
    await fetch(`${baseUrl}/api/auth/admin/emergency-read-access/requests`, {
      method: "POST",
      headers: trustedHeaders,
      body: JSON.stringify({
        merchant_id: "merchant-one",
        incident_reference: "INC-REVOKED-3001",
        severity: "high",
        reason: "This request must be rejected after authorization revocation.",
        duration_minutes: 15,
        critical_self_activate: false,
      }),
    }),
  );
  assert.equal(afterRevocation.response.status, 403);
  assert.equal(afterRevocation.body.code, "EMERGENCY_AUTHORIZATION_REQUIRED");
});
