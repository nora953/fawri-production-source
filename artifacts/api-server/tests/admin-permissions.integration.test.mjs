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
    ],
    otps: [],
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

  const merchantList = await fetch(`${baseUrl}/api/auth/merchants`, { headers: assistantHeaders });
  assert.equal(merchantList.status, 200);

  const statusUpdate = await fetch(`${baseUrl}/api/auth/merchants/merchant-a/status`, {
    method: "PATCH",
    headers: { ...assistantHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "suspended", reason: "test" }),
  });
  assert.equal(statusUpdate.status, 200);

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
});
