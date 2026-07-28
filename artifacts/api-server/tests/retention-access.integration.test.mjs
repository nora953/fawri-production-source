import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
const merchantSecret = "test-merchant-session-secret";

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
    server.close((error) => error ? reject(error) : resolve()),
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

function calendarMonthsAgo(months, extraDays = 0) {
  const date = new Date();
  const sourceDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(sourceDay, lastDay));
  date.setUTCDate(date.getUTCDate() - extraDays);
  return date.toISOString();
}

function calendarMonthFromNow() {
  const date = new Date();
  const sourceDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(sourceDay, lastDay));
  return date.toISOString();
}

function merchant(id, phone, password, expiresAt) {
  return {
    id,
    owner_name: `Owner ${id}`,
    store_name: `Store ${id}`,
    phone,
    password,
    activity_type: "retail",
    status: "approved",
    account_status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-01-01T00:00:00.000Z",
    otp_verified: true,
    subscription_started_at: calendarMonthsAgo(8),
    subscription_expires_at: expiresAt,
    warning_stage: 0,
    retention_status: "protected",
  };
}

function subscription(merchantId, expiresAt) {
  return {
    id: `subscription-${merchantId}`,
    merchant_id: merchantId,
    plan_name: "silver",
    price_iqd: 25000,
    reply_limit: 4000,
    replies_used: 0,
    replies_remaining: 4000,
    base_reply_limit: 4000,
    base_replies_used: 0,
    base_replies_remaining: 4000,
    addon_replies_remaining: 0,
    addon_reply_batches: [],
    billing_anchor_day: new Date().getUTCDate(),
    start_date: calendarMonthsAgo(8),
    expires_at: expiresAt,
    status: "expired",
    auto_reply_enabled: false,
    emergency_credit_used: 0,
    emergency_credit_amount: 400,
    emergency_credit_remaining: 0,
    emergency_credit_activated: false,
    emergency_debt: 0,
    pending_next_cycle_deduction: 0,
  };
}

function merchantCookie(merchantId) {
  const payload = {
    kind: "merchant_session",
    merchantId,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", merchantSecret)
    .update(`session.${encodedPayload}`)
    .digest("base64url");
  return `fawri_merchant_session=${encodedPayload}.${signature}`;
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("retention access blocks product writes and suspended sessions, then restores after renewal", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-retention-access-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const readOnlyExpiry = calendarMonthsAgo(3, 1);
  const suspendedExpiry = calendarMonthsAgo(6, 11);

  await writeFile(path.join(dataDir, "merchants.json"), JSON.stringify({
    merchants: [
      {
        id: "owner-admin",
        owner_name: "Owner Admin",
        store_name: "Fawri Admin",
        phone: "07111111111",
        password: "OwnerPass1@",
        activity_type: "admin",
        status: "approved",
        language: "en",
        theme_preference: "auto",
        created_at: "2026-01-01T00:00:00.000Z",
        is_admin: true,
        admin_role: "owner_admin",
        admin_enabled: true,
        otp_verified: true,
        warning_stage: 0,
        retention_status: "protected",
      },
      merchant("merchant-readonly", "07222222222", "Merchant1@", readOnlyExpiry),
      merchant("merchant-suspended", "07333333333", "Merchant2@", suspendedExpiry),
    ],
    subscriptions: [
      subscription("merchant-readonly", readOnlyExpiry),
      subscription("merchant-suspended", suspendedExpiry),
    ],
    otps: [], admin_logs: [], deletion_requests: [], channel_overrides: {}, admin_notes: {},
  }));

  await writeFile(path.join(dataDir, "fawri-runtime-db.json"), JSON.stringify({
    productsByMerchant: {
      "merchant-readonly": [{ id: "p1", merchant_id: "merchant-readonly", name: "Existing Product" }],
      "merchant-suspended": [{ id: "p2", merchant_id: "merchant-suspended", name: "Protected Product" }],
    },
    conversationsByMerchant: {}, metaPagesByPageId: {}, ordersByMerchant: {},
    orderDraftsByConversation: {}, lastSyncedMerchantId: null,
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
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-secret",
      FAWRI_MERCHANT_SESSION_SECRET: merchantSecret,
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

  const readOnlyWrite = await json(await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: merchantCookie("merchant-readonly"),
    },
    body: JSON.stringify({ name: "Blocked Product" }),
  }));
  assert.equal(readOnlyWrite.response.status, 423);
  assert.equal(readOnlyWrite.body.code, "PRODUCTS_READ_ONLY");

  const suspendedLogin = await json(await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "07333333333", password: "Merchant2@" }),
  }));
  assert.equal(suspendedLogin.response.status, 403);
  assert.equal(suspendedLogin.body.code, "RETENTION_ACCOUNT_SUSPENDED");

  const suspendedSession = await json(await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: merchantCookie("merchant-suspended") },
  }));
  assert.equal(suspendedSession.response.status, 403);
  assert.equal(suspendedSession.body.code, "RETENTION_ACCOUNT_SUSPENDED");

  const adminLogin = await json(await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "07111111111", password: "OwnerPass1@" }),
  }));
  assert.equal(adminLogin.response.status, 200);
  const adminHeaders = {
    Authorization: `Bearer ${adminLogin.body.admin_token}`,
    "Content-Type": "application/json",
  };

  const renewed = await json(await fetch(
    `${baseUrl}/api/auth/merchants/merchant-suspended/subscription`,
    {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ operation: "renew", plan: "silver" }),
    },
  ));
  assert.equal(renewed.response.status, 200);
  assert.ok(new Date(renewed.body.subscription.expires_at) > new Date());

  const restoredLogin = await json(await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "07333333333", password: "Merchant2@" }),
  }));
  assert.equal(restoredLogin.response.status, 200);
  assert.equal(restoredLogin.body.merchant.status, "approved");

  assert.ok(new Date(calendarMonthFromNow()) > new Date());
});
