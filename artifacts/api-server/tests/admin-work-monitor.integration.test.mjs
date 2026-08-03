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

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

const devices = {
  computer: "device-computer-0000000000000001",
  phone: "device-phone-000000000000000002",
  third: "device-third-000000000000000003",
};

test("owner controls trusted devices and assistant is limited to two sessions", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-admin-monitor-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });
  const baseAdmin = {
    store_name: "Fawri Admin",
    activity_type: "admin",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-03T00:00:00.000Z",
    is_admin: true,
    admin_enabled: true,
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          ...baseAdmin,
          id: "owner-admin",
          owner_name: "Owner",
          phone: "07111111111",
          password: "OwnerPass1@",
          admin_role: "owner_admin",
        },
        {
          ...baseAdmin,
          id: "assistant-admin",
          owner_name: "Assistant",
          phone: "07222222222",
          password: "Assistant1@",
          admin_role: "assistant_admin",
          permissions: ["view_merchants", "view_logs"],
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
      FAWRI_ADMIN_PHONE: "07111111111",
      FAWRI_ADMIN_DEVICE_TRUST_ENFORCED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await rm(runtimeDir, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child, () => output);

  async function login(phone, password, deviceId, deviceLabel) {
    return json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        password,
        ...(deviceId ? { device_id: deviceId, device_label: deviceLabel } : {}),
      }),
    }));
  }

  const ownerLogin = await login("07111111111", "OwnerPass1@");
  assert.equal(ownerLogin.response.status, 200);
  const ownerHeaders = {
    Authorization: `Bearer ${ownerLogin.body.admin_token}`,
    "Content-Type": "application/json",
  };

  const pendingComputer = await login(
    "07222222222",
    "Assistant1@",
    devices.computer,
    "Windows computer",
  );
  assert.equal(pendingComputer.response.status, 403);
  assert.equal(pendingComputer.body.code, "ADMIN_DEVICE_APPROVAL_REQUIRED");

  let monitor = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/work-monitor`,
    { headers: ownerHeaders },
  ));
  assert.equal(monitor.response.status, 200);
  assert.equal(monitor.body.summary.pending_device_count, 1);
  assert.equal(monitor.body.summary.open_session_count, 0);

  const trustComputer = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/devices/${devices.computer}/trust`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(trustComputer.response.status, 200);

  const computerLogin = await login(
    "07222222222",
    "Assistant1@",
    devices.computer,
    "Windows computer",
  );
  assert.equal(computerLogin.response.status, 200);
  const computerHeaders = {
    Authorization: `Bearer ${computerLogin.body.admin_token}`,
    "x-fawri-device-id": devices.computer,
    "Content-Type": "application/json",
  };

  const pendingPhone = await login(
    "07222222222",
    "Assistant1@",
    devices.phone,
    "Android phone",
  );
  assert.equal(pendingPhone.response.status, 403);
  const trustPhone = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/devices/${devices.phone}/trust`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(trustPhone.response.status, 200);
  const phoneLogin = await login(
    "07222222222",
    "Assistant1@",
    devices.phone,
    "Android phone",
  );
  assert.equal(phoneLogin.response.status, 200);
  const phoneHeaders = {
    Authorization: `Bearer ${phoneLogin.body.admin_token}`,
    "x-fawri-device-id": devices.phone,
    "Content-Type": "application/json",
  };

  const pendingThird = await login(
    "07222222222",
    "Assistant1@",
    devices.third,
    "Third device",
  );
  assert.equal(pendingThird.response.status, 403);
  const trustThird = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/devices/${devices.third}/trust`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(trustThird.response.status, 409);
  assert.equal(trustThird.body.code, "ADMIN_TRUSTED_DEVICE_LIMIT_REACHED");

  const heartbeat = await json(await fetch(
    `${baseUrl}/api/auth/admin/session/heartbeat`,
    {
      method: "POST",
      headers: computerHeaders,
      body: JSON.stringify({ activity: true }),
    },
  ));
  assert.equal(heartbeat.response.status, 200);

  const admins = await json(await fetch(`${baseUrl}/api/auth/admins`, {
    headers: ownerHeaders,
  }));
  const assistantCard = admins.body.admins.find(
    (admin) => admin.id === "assistant-admin",
  );
  assert.equal(assistantCard.open_session_count, 2);
  assert.equal(assistantCard.work_status, "active");

  monitor = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/work-monitor`,
    { headers: ownerHeaders },
  ));
  assert.equal(monitor.body.sessions.length, 2);
  assert.equal(monitor.body.summary.trusted_device_count, 2);

  const computerSession = monitor.body.sessions.find(
    (session) => session.device_id === devices.computer,
  );
  assert.ok(computerSession);
  const revokeComputerSession = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/sessions/${computerSession.id}/revoke`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(revokeComputerSession.response.status, 200);

  const revokedComputer = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: computerHeaders },
  ));
  assert.equal(revokedComputer.response.status, 401);
  assert.equal(revokedComputer.body.code, "ADMIN_TRACKED_SESSION_REVOKED");

  const activePhone = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: phoneHeaders },
  ));
  assert.equal(activePhone.response.status, 200);

  const revokePhoneTrust = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/devices/${devices.phone}/revoke`,
    {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ owner_password: "OwnerPass1@" }),
    },
  ));
  assert.equal(revokePhoneTrust.response.status, 200);

  const revokedPhone = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: phoneHeaders },
  ));
  assert.equal(revokedPhone.response.status, 401);
  assert.equal(revokedPhone.body.code, "ADMIN_TRACKED_SESSION_REVOKED");

  const logs = await json(await fetch(`${baseUrl}/api/auth/admin/logs`, {
    headers: ownerHeaders,
  }));
  assert.equal(logs.response.status, 200);
  const serializedLogs = JSON.stringify(logs.body.logs);
  assert.equal(serializedLogs.includes("OwnerPass1@"), false);
  assert.equal(serializedLogs.includes("Assistant1@"), false);
  assert.ok(logs.body.logs.some(
    (log) => log.action_type === "assistant_device_trusted",
  ));
  assert.ok(logs.body.logs.some(
    (log) => log.action_type === "assistant_session_revoked",
  ));
  assert.ok(logs.body.logs.some(
    (log) => log.action_type === "assistant_device_trust_revoked",
  ));
});
