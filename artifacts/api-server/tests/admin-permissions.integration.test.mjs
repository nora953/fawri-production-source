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
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early.\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become ready.\n${logs()}`);
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("admin permissions migrate and remain server-authoritative", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-admin-permissions-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const baseAdmin = {
    store_name: "Fawri Admin",
    activity_type: "admin",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-07-25T00:00:00.000Z",
    is_admin: true,
    admin_enabled: true,
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };

  await writeFile(path.join(dataDir, "merchants.json"), JSON.stringify({
    merchants: [
      {
        ...baseAdmin,
        id: "owner-admin",
        owner_name: "Owner",
        phone: "07111111111",
        password: "OwnerPass1@",
        admin_role: "owner_admin",
        permissions: ["manage_admins"],
      },
      {
        ...baseAdmin,
        id: "assistant-admin",
        owner_name: "Assistant",
        phone: "07222222222",
        password: "Assistant1@",
        admin_role: "assistant_admin",
        permissions: [
          "manage_admins",
          "manage_merchants",
          "manage_subscriptions",
          "inspection_sessions",
        ],
      },
      {
        id: "merchant-a",
        owner_name: "Merchant Owner",
        store_name: "Merchant Store",
        phone: "07333333333",
        password: "Merchant1@",
        activity_type: "retail",
        status: "pending_activation",
        language: "en",
        theme_preference: "auto",
        created_at: "2026-07-25T00:00:00.000Z",
        otp_verified: true,
        warning_stage: 0,
        retention_status: "protected",
      },
      {
        id: "merchant-unverified",
        owner_name: "Unverified Owner",
        store_name: "Unverified Store",
        phone: "07444444444",
        password: "Unverified1@",
        activity_type: "retail",
        status: "pending_activation",
        language: "en",
        theme_preference: "auto",
        created_at: "2026-07-25T00:00:00.000Z",
        otp_verified: false,
        warning_stage: 0,
        retention_status: "protected",
      },
    ],
    subscriptions: [],
    otps: [
      {
        phone: "07444444444",
        code: "654321",
        purpose: "signup",
        expires_at: "2099-01-01T00:00:00.000Z",
        used: false,
        created_at: "2026-07-25T00:00:00.000Z",
      },
    ],
    admin_logs: [],
    deletion_requests: [],
    channel_overrides: {},
    admin_notes: {},
  }));

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
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_ADMIN_PHONE: "07111111111",
      OTP_DELIVERY_CHANNEL: "",
      AUTH_ALLOW_DEV_OTP_BYPASS: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

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

  async function login(phone, password) {
    const result = await json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    }));
    assert.equal(result.response.status, 200);
    return result.body.admin_token;
  }

  const ownerToken = await login("07111111111", "OwnerPass1@");
  const assistantToken = await login("07222222222", "Assistant1@");
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
  const assistantHeaders = { Authorization: `Bearer ${assistantToken}` };

  const ownerMe = await json(await fetch(`${baseUrl}/api/auth/admin/me`, { headers: ownerHeaders }));
  assert.equal(ownerMe.response.status, 200);
  assert.equal(ownerMe.body.admin.admin_role, "owner_admin");
  assert.deepEqual(ownerMe.body.admin.permissions, [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "view_logs",
    "inspect_merchant_sessions",
    "manage_support",
  ]);

  const assistantMe = await json(await fetch(`${baseUrl}/api/auth/admin/me`, { headers: assistantHeaders }));
  assert.equal(assistantMe.response.status, 200);
  assert.deepEqual(assistantMe.body.admin.permissions, [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "inspect_merchant_sessions",
  ]);
  assert.equal(assistantMe.body.admin.permissions.includes("manage_admins"), false);

  const merchantList = await json(await fetch(
    `${baseUrl}/api/auth/merchants`,
    { headers: assistantHeaders },
  ));
  assert.equal(merchantList.response.status, 200);
  assert.deepEqual(
    merchantList.body.merchants.map((merchant) => merchant.id),
    ["merchant-a"],
  );
  assert.equal(merchantList.body.merchants[0].account_status, "pending_review");
  assert.equal(merchantList.body.merchants[0].onboarding_status, "pending_review");
  assert.equal(merchantList.body.merchants[0].trial_status, "eligible");
  assert.equal(merchantList.body.merchants[0].signup_source, "direct");
  assert.equal(merchantList.body.merchants[0].requested_plan, null);

  const unverifiedLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "07444444444",
      password: "Unverified1@",
    }),
  });
  assert.equal(unverifiedLogin.status, 401);

  const unverifiedApproval = await fetch(
    `${baseUrl}/api/auth/merchants/merchant-unverified/status`,
    {
      method: "PATCH",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    },
  );
  assert.equal(unverifiedApproval.status, 409);

  const failedSignup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_name: "No Delivery Owner",
      store_name: "No Delivery Store",
      phone: "07555555555",
      password: "NoDelivery1@",
      activity_type: "retail",
      language: "en",
    }),
  });
  assert.equal(failedSignup.status, 502);

  const persistedAfterFailedSignup = JSON.parse(
    await readFile(path.join(dataDir, "merchants.json"), "utf8"),
  );
  assert.equal(
    persistedAfterFailedSignup.merchants.some(
      (merchant) => merchant.phone === "07555555555",
    ),
    false,
  );

  const verifyUnverifiedMerchant = await fetch(
    `${baseUrl}/api/auth/verify-otp`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "07444444444", code: "654321" }),
    },
  );
  assert.equal(verifyUnverifiedMerchant.status, 200);

  const merchantListAfterVerification = await json(await fetch(
    `${baseUrl}/api/auth/merchants`,
    { headers: assistantHeaders },
  ));
  assert.equal(merchantListAfterVerification.response.status, 200);
  assert.deepEqual(
    merchantListAfterVerification.body.merchants.map((merchant) => merchant.id),
    ["merchant-a", "merchant-unverified"],
  );
  assert.equal(
    merchantListAfterVerification.body.merchants.find(
      (merchant) => merchant.id === "merchant-unverified",
    ).status,
    "pending_activation",
  );

  const approval = await json(await fetch(
    `${baseUrl}/api/auth/merchants/merchant-a/status`,
    {
      method: "PATCH",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    },
  ));

  assert.equal(approval.response.status, 200);
  assert.equal(approval.body.merchant.status, "approved");
  assert.equal(approval.body.merchant.account_status, "approved");
  assert.equal(approval.body.merchant.onboarding_status, "awaiting_channel");
  assert.equal(approval.body.merchant.trial_status, "not_started");

  assert.equal(
    approval.body.merchant.subscription_started_at,
    undefined,
  );
  assert.equal(
    approval.body.merchant.subscription_expires_at,
    undefined,
  );

  const activateSubscription = await json(await fetch(
    `${baseUrl}/api/auth/merchants/merchant-a/subscription`,
    {
      method: "PUT",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "activate", plan: "silver" }),
    },
  ));
  assert.equal(activateSubscription.response.status, 200);
  assert.equal(activateSubscription.body.subscription.plan_name, "silver");
  assert.equal(activateSubscription.body.subscription.reply_limit, 4000);

  const subscriptionsList = await json(await fetch(
    `${baseUrl}/api/auth/admin/subscriptions`,
    { headers: assistantHeaders },
  ));
  assert.equal(subscriptionsList.response.status, 200);
  assert.equal(subscriptionsList.body.subscriptions.length, 1);
  assert.equal(subscriptionsList.body.subscriptions[0].merchant_id, "merchant-a");

  const addReply = await json(await fetch(
    `${baseUrl}/api/auth/merchants/merchant-a/subscription`,
    {
      method: "PATCH",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_replies", amount: 1 }),
    },
  ));
  assert.equal(addReply.response.status, 200);
  assert.equal(addReply.body.subscription.reply_limit, 4001);
  assert.equal(addReply.body.subscription.replies_remaining, 4001);

  const deductReply = await json(await fetch(
    `${baseUrl}/api/auth/merchants/merchant-a/subscription`,
    {
      method: "PATCH",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deduct_replies", amount: 1 }),
    },
  ));
  assert.equal(deductReply.response.status, 200);
  assert.equal(deductReply.body.subscription.replies_used, 1);
  assert.equal(deductReply.body.subscription.replies_remaining, 4000);

  const resetReplies = await json(await fetch(
    `${baseUrl}/api/auth/merchants/merchant-a/subscription`,
    {
      method: "PATCH",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_replies" }),
    },
  ));
  assert.equal(resetReplies.response.status, 200);
  assert.equal(resetReplies.body.subscription.replies_used, 0);
  assert.equal(resetReplies.body.subscription.replies_remaining, 4001);

  const disableReplies = await json(await fetch(
    `${baseUrl}/api/auth/merchants/merchant-a/subscription`,
    {
      method: "PATCH",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_auto_reply", enabled: false }),
    },
  ));
  assert.equal(disableReplies.response.status, 200);
  assert.equal(disableReplies.body.subscription.auto_reply_enabled, false);

  const persistedSubscriptionDb = JSON.parse(
    await readFile(path.join(dataDir, "merchants.json"), "utf8"),
  );
  assert.equal(persistedSubscriptionDb.subscriptions.length, 1);
  assert.equal(persistedSubscriptionDb.subscriptions[0].plan_name, "silver");

  assert.ok(
    Number.isFinite(
      new Date(approval.body.merchant.approved_at).getTime(),
    ),
  );
  assert.ok(
    Number.isFinite(
      new Date(
        approval.body.merchant.channel_activation_deadline,
      ).getTime(),
    ),
  );

  assert.equal(
    new Date(
      approval.body.merchant.channel_activation_deadline,
    ).getTime() -
      new Date(approval.body.merchant.approved_at).getTime(),
    10 * 24 * 60 * 60 * 1000,
  );

  const statusUpdate = await fetch(`${baseUrl}/api/auth/merchants/merchant-a/status`, {
    method: "PATCH",
    headers: { ...assistantHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "suspended", reason: "test" }),
  });
  assert.equal(statusUpdate.status, 200);

  const assistantSubscriptionLog = await json(await fetch(
    `${baseUrl}/api/auth/admin/logs`,
    {
      method: "POST",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        action_type: "plan_changed",
        merchant_id: "merchant-a",
        details: "subscription audit identity test",
        meta: { plan: "silver" },
      }),
    },
  ));
  assert.equal(assistantSubscriptionLog.response.status, 201);
  assert.equal(assistantSubscriptionLog.body.log.admin_id, "assistant-admin");
  assert.equal(assistantSubscriptionLog.body.log.admin_name, "Assistant");
  assert.equal(assistantSubscriptionLog.body.log.admin_phone, "07222222222");
  assert.equal(assistantSubscriptionLog.body.log.admin_role, "assistant_admin");

  const ownerUnsuspend = await fetch(
    `${baseUrl}/api/auth/merchants/merchant-a/status`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    },
  );
  assert.equal(ownerUnsuspend.status, 200);

  const auditLogs = await json(await fetch(
    `${baseUrl}/api/auth/admin/logs`,
    { headers: ownerHeaders },
  ));
  assert.equal(auditLogs.response.status, 200);

  const ownerAuditLog = auditLogs.body.logs.find(
    (log) => log.action_type === "unsuspended",
  );
  assert.equal(ownerAuditLog.admin_id, "owner-admin");
  assert.equal(ownerAuditLog.admin_name, "Owner");
  assert.equal(ownerAuditLog.admin_phone, "07111111111");
  assert.equal(ownerAuditLog.admin_role, "owner_admin");

  const assistantAuditLog = auditLogs.body.logs.find(
    (log) => log.action_type === "suspended",
  );
  assert.equal(assistantAuditLog.admin_id, "assistant-admin");
  assert.equal(assistantAuditLog.admin_name, "Assistant");
  assert.equal(assistantAuditLog.admin_phone, "07222222222");
  assert.equal(assistantAuditLog.admin_role, "assistant_admin");

  const forbiddenAdmins = await fetch(`${baseUrl}/api/auth/admins`, { headers: assistantHeaders });
  assert.equal(forbiddenAdmins.status, 403);

  const ownerDisable = await fetch(`${baseUrl}/api/auth/admins/owner-admin/enabled`, {
    method: "PATCH",
    headers: { ...ownerHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(ownerDisable.status, 400);

  const permissionsUpdate = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/permissions`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: ["view_logs", "manage_support"] }),
    },
  ));
  assert.equal(permissionsUpdate.response.status, 200);
  assert.deepEqual(permissionsUpdate.body.admin.permissions, ["view_logs", "manage_support"]);

  const refreshedAssistant = await json(await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: assistantHeaders,
  }));
  assert.equal(refreshedAssistant.response.status, 200);
  assert.deepEqual(refreshedAssistant.body.admin.permissions, ["view_logs", "manage_support"]);

  const revokedMerchantList = await fetch(`${baseUrl}/api/auth/merchants`, {
    headers: assistantHeaders,
  });
  assert.equal(revokedMerchantList.status, 403);

  const clearPermissions = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/permissions`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: [] }),
    },
  ));
  assert.equal(clearPermissions.response.status, 200);
  assert.deepEqual(clearPermissions.body.admin.permissions, []);

  const noPermissionAssistant = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: assistantHeaders },
  ));
  assert.equal(noPermissionAssistant.response.status, 200);
  assert.deepEqual(noPermissionAssistant.body.admin.permissions, []);

  const noPermissionMerchantList = await fetch(
    `${baseUrl}/api/auth/merchants`,
    { headers: assistantHeaders },
  );
  assert.equal(noPermissionMerchantList.status, 403);
});
