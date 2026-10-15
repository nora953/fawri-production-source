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
const merchantSecret = "retention-boundary-test-secret";
const BAGHDAD_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

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
    if (child.exitCode !== null) {
      throw new Error(`API exited early.\n${logs()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`API did not become ready.\n${logs()}`);
}

function getBaghdadDateParts(date) {
  const shifted = new Date(date.getTime() + BAGHDAD_UTC_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

function addBaghdadCalendarMonths(date, months) {
  const parts = getBaghdadDateParts(date);
  const targetMonthStart = new Date(
    Date.UTC(
      parts.year,
      parts.month + months,
      1,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const targetDay = Math.min(parts.day, lastDay);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - BAGHDAD_UTC_OFFSET_MS,
  );
}

function addBaghdadCalendarDays(date, days) {
  const parts = getBaghdadDateParts(date);
  return new Date(
    Date.UTC(
      parts.year,
      parts.month,
      parts.day + days,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - BAGHDAD_UTC_OFFSET_MS,
  );
}

function shiftMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function expiryAroundMonthBoundary(reference, monthsAgo, minutesFromBoundary) {
  return shiftMinutes(
    addBaghdadCalendarMonths(reference, -monthsAgo),
    minutesFromBoundary,
  ).toISOString();
}

function expiryAroundSuspensionBoundary(reference, minutesFromBoundary) {
  const sixMonthsAgo = addBaghdadCalendarMonths(reference, -6);
  const tenDaysBefore = addBaghdadCalendarDays(sixMonthsAgo, -10);
  return shiftMinutes(tenDaysBefore, minutesFromBoundary).toISOString();
}

function merchant(id, phone, expiry) {
  return {
    id,
    owner_name: `Owner ${id}`,
    store_name: `Store ${id}`,
    phone,
    password: "Merchant1@",
    activity_type: "retail",
    status: "approved",
    account_status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-01-01T00:00:00.000Z",
    otp_verified: true,
    subscription_started_at: addBaghdadCalendarMonths(new Date(expiry), -1).toISOString(),
    subscription_expires_at: expiry,
    last_subscription_ended_at: expiry,
    warning_stage: 0,
    retention_status: "protected",
  };
}

function subscription(merchantId, expiry) {
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
    billing_anchor_day: getBaghdadDateParts(new Date(expiry)).day,
    start_date: addBaghdadCalendarMonths(new Date(expiry), -1).toISOString(),
    expires_at: expiry,
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
  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", merchantSecret)
    .update(`session.${encodedPayload}`)
    .digest("base64url");
  return `fawri_merchant_session=${encodedPayload}.${signature}`;
}

async function json(response) {
  return {
    response,
    body: await response.json().catch(() => null),
  };
}

test("retention calendar boundaries change at 2, 3, 4, 6 months and 6 months plus 10 days", async (t) => {
  const runtimeDir = await mkdtemp(
    path.join(os.tmpdir(), "fawri-retention-boundaries-"),
  );
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const reference = new Date();
  const cases = [
    {
      id: "before-two-months",
      phone: "07100000001",
      expiry: expiryAroundMonthBoundary(reference, 2, 5),
      status: "protected",
      stage: 0,
    },
    {
      id: "after-two-months",
      phone: "07100000002",
      expiry: expiryAroundMonthBoundary(reference, 2, -5),
      status: "warning_1",
      stage: 1,
    },
    {
      id: "after-three-months",
      phone: "07100000003",
      expiry: expiryAroundMonthBoundary(reference, 3, -5),
      status: "warning_2",
      stage: 2,
    },
    {
      id: "after-four-months",
      phone: "07100000004",
      expiry: expiryAroundMonthBoundary(reference, 4, -5),
      status: "warning_3",
      stage: 3,
    },
    {
      id: "after-six-months",
      phone: "07100000005",
      expiry: expiryAroundMonthBoundary(reference, 6, -5),
      status: "final_warning",
      stage: 4,
    },
    {
      id: "before-suspension",
      phone: "07100000006",
      expiry: expiryAroundSuspensionBoundary(reference, 5),
      status: "final_warning",
      stage: 4,
    },
    {
      id: "after-suspension",
      phone: "07100000007",
      expiry: expiryAroundSuspensionBoundary(reference, -5),
      status: "eligible_for_deletion",
      stage: 4,
    },
  ];

  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          id: "owner-admin",
          owner_name: "Owner Admin",
          store_name: "Fawri Admin",
          phone: "07999999999",
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
        ...cases.map((item) => merchant(item.id, item.phone, item.expiry)),
      ],
      subscriptions: cases.map((item) => subscription(item.id, item.expiry)),
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
      productsByMerchant: Object.fromEntries(
        cases.map((item) => [
          item.id,
          [{ id: `product-${item.id}`, merchant_id: item.id, name: "Existing Product" }],
        ]),
      ),
      conversationsByMerchant: {},
      metaPagesByPageId: {},
      ordersByMerchant: {},
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
    }),
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
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-secret",
      FAWRI_MERCHANT_SESSION_SECRET: merchantSecret,
      FAWRI_ADMIN_PHONE: "07999999999",
      OTP_DELIVERY_CHANNEL: "",
      AUTH_ALLOW_DEV_OTP_BYPASS: "false",
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

  for (const item of cases.filter((entry) => entry.id !== "after-suspension")) {
    const result = await json(
      await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: merchantCookie(item.id) },
      }),
    );

    assert.equal(result.response.status, 200, item.id);
    assert.equal(result.body.merchant.retention_status, item.status, item.id);
    assert.equal(result.body.merchant.warning_stage, item.stage, item.id);
  }

  const beforeReadOnlyWrite = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: merchantCookie("after-two-months"),
    },
    body: JSON.stringify({ name: "Allowed before three months" }),
  });
  assert.notEqual(beforeReadOnlyWrite.status, 423);

  const readOnlyWrite = await json(
    await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: merchantCookie("after-three-months"),
      },
      body: JSON.stringify({ name: "Blocked after three months" }),
    }),
  );
  assert.equal(readOnlyWrite.response.status, 423);
  assert.equal(readOnlyWrite.body.code, "PRODUCTS_READ_ONLY");

  const suspendedSession = await json(
    await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: merchantCookie("after-suspension") },
    }),
  );
  assert.equal(suspendedSession.response.status, 403);
  assert.equal(suspendedSession.body.code, "RETENTION_ACCOUNT_SUSPENDED");
});
