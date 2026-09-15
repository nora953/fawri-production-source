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

function getSetCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];
  return values[0] || response.headers.get("set-cookie") || "";
}

function cookiePair(setCookie) {
  assert.match(setCookie, /^fawri_merchant_session=/);
  return setCookie.split(";", 1)[0];
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("merchant, assistant, and owner sessions stay role-isolated", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-role-isolation-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const baseAccount = {
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-04T00:00:00.000Z",
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };

  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          ...baseAccount,
          id: "merchant-one",
          owner_name: "Merchant Owner",
          store_name: "Merchant Store",
          phone: "07111111111",
          password: "Merchant1@",
          activity_type: "retail",
        },
        {
          ...baseAccount,
          id: "owner-admin",
          owner_name: "System Owner",
          store_name: "Fawri Admin",
          phone: "07222222222",
          password: "OwnerPass1@",
          activity_type: "admin",
          is_admin: true,
          admin_role: "owner_admin",
          admin_enabled: true,
        },
        {
          ...baseAccount,
          id: "assistant-admin",
          owner_name: "Assistant",
          store_name: "Fawri Admin",
          phone: "07333333333",
          password: "Assistant1@",
          activity_type: "admin",
          is_admin: true,
          admin_role: "assistant_admin",
          admin_enabled: true,
          permissions: ["view_merchants"],
        },
      ],
      subscriptions: [],
      otps: [],
      admin_logs: [],
      merchant_notifications: [],
      support_tickets: [],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
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
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_MERCHANT_SESSION_SECRET: "test-merchant-session-secret",
      FAWRI_ADMIN_PHONE: "07222222222",
      FAWRI_ADMIN_DEVICE_TRUST_ENFORCED: "false",
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

  async function login(phone, password, headers = {}) {
    return json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ phone, password }),
    }));
  }

  const merchantLogin = await login("07111111111", "Merchant1@");
  assert.equal(merchantLogin.response.status, 200);
  assert.equal(merchantLogin.body.account_type, "merchant");
  assert.equal(merchantLogin.body.merchant.id, "merchant-one");
  assert.equal("admin_token" in merchantLogin.body, false);
  const merchantCookie = cookiePair(getSetCookie(merchantLogin.response));

  const merchantBeforeAdmin = await json(await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: merchantCookie },
  }));
  assert.equal(merchantBeforeAdmin.response.status, 200);
  assert.equal(merchantBeforeAdmin.body.merchant.id, "merchant-one");
  assert.equal(merchantBeforeAdmin.body.merchant.is_admin, undefined);

  const ownerLogin = await login(
    "07222222222",
    "OwnerPass1@",
    { Cookie: merchantCookie },
  );
  assert.equal(ownerLogin.response.status, 200);
  assert.equal(ownerLogin.body.account_type, "admin");
  assert.equal(ownerLogin.body.merchant.admin_role, "owner_admin");
  assert.equal(typeof ownerLogin.body.admin_token, "string");
  assert.equal(getSetCookie(ownerLogin.response), "");

  const merchantAfterAdmin = await json(await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: merchantCookie },
  }));
  assert.equal(merchantAfterAdmin.response.status, 200);
  assert.equal(merchantAfterAdmin.body.merchant.id, "merchant-one");

  const ownerMe = await json(await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: { Authorization: `Bearer ${ownerLogin.body.admin_token}` },
  }));
  assert.equal(ownerMe.response.status, 200);
  assert.equal(ownerMe.body.admin.id, "owner-admin");
  assert.equal(ownerMe.body.admin.admin_role, "owner_admin");

  const merchantCredentialOnAdminRoute = await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: { Cookie: merchantCookie } },
  );
  assert.equal(merchantCredentialOnAdminRoute.status, 401);

  const adminCredentialOnMerchantRoute = await fetch(
    `${baseUrl}/api/auth/me`,
    { headers: { Authorization: `Bearer ${ownerLogin.body.admin_token}` } },
  );
  assert.equal(adminCredentialOnMerchantRoute.status, 401);

  const assistantLogin = await login("07333333333", "Assistant1@");
  assert.equal(assistantLogin.response.status, 200);
  assert.equal(assistantLogin.body.account_type, "admin");
  assert.equal(assistantLogin.body.merchant.admin_role, "assistant_admin");
  assert.equal(getSetCookie(assistantLogin.response), "");

  const ownerOnlyMonitor = await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/work-monitor`,
    {
      headers: {
        Authorization: `Bearer ${assistantLogin.body.admin_token}`,
      },
    },
  );
  assert.equal(ownerOnlyMonitor.status, 403);
});
