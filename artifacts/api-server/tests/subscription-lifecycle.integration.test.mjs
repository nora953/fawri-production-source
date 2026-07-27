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

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

function baghdadParts(value) {
  const date = new Date(value);
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

test("calendar subscriptions, early renewal, add-ons and emergency debt", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-subscription-lifecycle-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const baseAdmin = {
    store_name: "Fawri Admin", activity_type: "admin", status: "approved",
    language: "en", theme_preference: "auto", created_at: "2026-07-27T00:00:00.000Z",
    is_admin: true, admin_enabled: true, otp_verified: true, warning_stage: 0,
    retention_status: "protected",
  };
  const baseMerchant = {
    owner_name: "Merchant Owner", store_name: "Merchant Store", activity_type: "retail",
    status: "approved", account_status: "approved", language: "en", theme_preference: "auto",
    created_at: "2026-07-27T00:00:00.000Z", otp_verified: true, warning_stage: 0,
    retention_status: "protected",
  };

  await writeFile(path.join(dataDir, "merchants.json"), JSON.stringify({
    merchants: [
      { ...baseAdmin, id: "owner-admin", owner_name: "Owner", phone: "07111111111", password: "OwnerPass1@", admin_role: "owner_admin" },
      { ...baseAdmin, id: "assistant-admin", owner_name: "Assistant", phone: "07222222222", password: "Assistant1@", admin_role: "assistant_admin", permissions: ["manage_subscriptions"] },
      { ...baseMerchant, id: "merchant-a", phone: "07333333333", password: "Merchant1@" },
      { ...baseMerchant, id: "merchant-b", phone: "07444444444", password: "Merchant2@" },
    ],
    subscriptions: [], otps: [], admin_logs: [], deletion_requests: [], channel_overrides: {}, admin_notes: {},
  }));

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: {
      ...process.env, NODE_ENV: "test", PORT: String(port), LOG_LEVEL: "silent", BOT_DEBUG: "false",
      FAWRI_PASSWORD_SALT: "test-password-salt", FAWRI_ADMIN_SESSION_SECRET: "test-admin-secret",
      FAWRI_MERCHANT_SESSION_SECRET: "test-merchant-secret", FAWRI_ADMIN_PHONE: "07111111111",
      OTP_DELIVERY_CHANNEL: "", AUTH_ALLOW_DEV_OTP_BYPASS: "false",
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

  async function adminLogin() {
    const result = await json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "07222222222", password: "Assistant1@" }),
    }));
    assert.equal(result.response.status, 200);
    return { Authorization: `Bearer ${result.body.admin_token}` };
  }

  async function merchantCookie(phone, password) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie);
    return cookie.split(";")[0];
  }

  const adminHeaders = await adminLogin();
  const merchantACookie = await merchantCookie("07333333333", "Merchant1@");
  const merchantBCookie = await merchantCookie("07444444444", "Merchant2@");

  async function planOperation(merchantId, operation, plan) {
    return json(await fetch(`${baseUrl}/api/auth/merchants/${merchantId}/subscription`, {
      method: "PUT", headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ operation, plan }),
    }));
  }

  async function subscriptionAction(merchantId, action, amount) {
    return json(await fetch(`${baseUrl}/api/auth/merchants/${merchantId}/subscription`, {
      method: "PATCH", headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(amount === undefined ? {} : { amount }) }),
    }));
  }

  const activated = await planOperation("merchant-a", "activate", "silver");
  assert.equal(activated.response.status, 200);
  const start = baghdadParts(activated.body.subscription.start_date);
  const expiry = baghdadParts(activated.body.subscription.expires_at);
  assert.equal(expiry.day, start.day);
  assert.equal(expiry.hour, start.hour);
  assert.equal(expiry.minute, start.minute);
  assert.equal((expiry.month - start.month + 12) % 12, 1);
  assert.equal(activated.body.subscription.base_reply_limit, 4000);

  const forbiddenChange = await planOperation("merchant-a", "change", "gold");
  assert.equal(forbiddenChange.response.status, 409);

  const exhaustedA = await subscriptionAction("merchant-a", "deduct_replies", 4000);
  assert.equal(exhaustedA.response.status, 200);
  assert.equal(exhaustedA.body.subscription.replies_remaining, 0);

  const emergencyA = await json(await fetch(`${baseUrl}/api/auth/subscription/emergency`, {
    method: "POST", headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
  }));
  assert.equal(emergencyA.response.status, 200);
  assert.equal(emergencyA.body.subscription.emergency_debt, 400);
  assert.equal(emergencyA.body.subscription.replies_remaining, 400);

  const secondEmergency = await fetch(`${baseUrl}/api/auth/subscription/emergency`, {
    method: "POST", headers: { Cookie: merchantACookie, "Content-Type": "application/json" },
  });
  assert.equal(secondEmergency.status, 409);

  const partialDebtPayment = await subscriptionAction("merchant-a", "add_replies", 100);
  assert.equal(partialDebtPayment.response.status, 200);
  assert.equal(partialDebtPayment.body.subscription.emergency_debt, 300);
  assert.equal(partialDebtPayment.body.subscription.addon_replies_remaining, 0);

  const debtAndAddon = await subscriptionAction("merchant-a", "add_replies", 500);
  assert.equal(debtAndAddon.response.status, 200);
  assert.equal(debtAndAddon.body.subscription.emergency_debt, 0);
  assert.equal(debtAndAddon.body.subscription.addon_replies_remaining, 200);
  assert.equal(debtAndAddon.body.subscription.addon_reply_batches.length, 1);
  const purchase = baghdadParts(debtAndAddon.body.subscription.addon_reply_batches[0].purchased_at);
  const addonExpiry = baghdadParts(debtAndAddon.body.subscription.addon_reply_batches[0].expires_at);
  assert.equal((addonExpiry.month - purchase.month + 12) % 12, 3);

  const oldExpiry = new Date(debtAndAddon.body.subscription.expires_at);
  const earlyRenewal = await planOperation("merchant-a", "renew", "silver");
  assert.equal(earlyRenewal.response.status, 200);
  assert.equal(earlyRenewal.body.subscription.base_replies_remaining, 4000);
  assert.equal(earlyRenewal.body.subscription.addon_replies_remaining, 200);
  assert.ok(new Date(earlyRenewal.body.subscription.expires_at) > oldExpiry);
  const oldExpiryParts = baghdadParts(oldExpiry);
  const renewedExpiryParts = baghdadParts(earlyRenewal.body.subscription.expires_at);
  assert.equal(renewedExpiryParts.day, oldExpiryParts.day);
  assert.equal((renewedExpiryParts.month - oldExpiryParts.month + 12) % 12, 1);

  const activatedB = await planOperation("merchant-b", "activate", "silver");
  assert.equal(activatedB.response.status, 200);
  await subscriptionAction("merchant-b", "deduct_replies", 4000);
  const emergencyB = await json(await fetch(`${baseUrl}/api/auth/subscription/emergency`, {
    method: "POST", headers: { Cookie: merchantBCookie, "Content-Type": "application/json" },
  }));
  assert.equal(emergencyB.response.status, 200);
  const renewedWithDebt = await planOperation("merchant-b", "renew", "silver");
  assert.equal(renewedWithDebt.response.status, 200);
  assert.equal(renewedWithDebt.body.subscription.emergency_debt, 0);
  assert.equal(renewedWithDebt.body.subscription.base_replies_used, 400);
  assert.equal(renewedWithDebt.body.subscription.base_replies_remaining, 3600);
  assert.equal(renewedWithDebt.body.subscription.emergency_credit_activated, false);
});
