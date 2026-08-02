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
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become ready.\n${logs()}`);
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("owner resets assistant password, revokes sessions, and forces first-login change", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-admin-password-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const baseAdmin = {
    store_name: "Fawri Admin",
    activity_type: "admin",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-02T00:00:00.000Z",
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
    return json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    }));
  }

  const ownerLogin = await login("07111111111", "OwnerPass1@");
  assert.equal(ownerLogin.response.status, 200);
  const ownerToken = ownerLogin.body.admin_token;
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };

  const assistantLogin = await login("07222222222", "Assistant1@");
  assert.equal(assistantLogin.response.status, 200);
  const oldAssistantToken = assistantLogin.body.admin_token;
  const oldAssistantHeaders = { Authorization: `Bearer ${oldAssistantToken}` };

  const wrongOwnerPassword = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/password`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_password: "WrongOwner1@",
        temporary_password: "Temporary2@",
        confirm_temporary_password: "Temporary2@",
      }),
    },
  ));
  assert.equal(wrongOwnerPassword.response.status, 401);
  assert.equal(wrongOwnerPassword.body.code, "OWNER_PASSWORD_INCORRECT");

  const reset = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/password`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_password: "OwnerPass1@",
        temporary_password: "Temporary2@",
        confirm_temporary_password: "Temporary2@",
      }),
    },
  ));
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.admin.must_change_password, true);

  const revokedOldSession = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: oldAssistantHeaders },
  ));
  assert.equal(revokedOldSession.response.status, 401);
  assert.equal(revokedOldSession.body.code, "ADMIN_SESSION_REVOKED");

  const oldPasswordLogin = await login("07222222222", "Assistant1@");
  assert.equal(oldPasswordLogin.response.status, 401);

  const temporaryLogin = await login("07222222222", "Temporary2@");
  assert.equal(temporaryLogin.response.status, 200);
  assert.equal(temporaryLogin.body.merchant.must_change_password, true);
  const temporaryToken = temporaryLogin.body.admin_token;
  const temporaryHeaders = { Authorization: `Bearer ${temporaryToken}` };

  const temporaryMe = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: temporaryHeaders },
  ));
  assert.equal(temporaryMe.response.status, 200);
  assert.equal(temporaryMe.body.admin.must_change_password, true);

  const blockedAdminAccess = await json(await fetch(
    `${baseUrl}/api/auth/merchants`,
    { headers: temporaryHeaders },
  ));
  assert.equal(blockedAdminAccess.response.status, 403);
  assert.equal(blockedAdminAccess.body.code, "ADMIN_PASSWORD_CHANGE_REQUIRED");

  const mismatchChange = await json(await fetch(
    `${baseUrl}/api/auth/admin/password/change-required`,
    {
      method: "PATCH",
      headers: { ...temporaryHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        new_password: "Permanent3@",
        confirm_password: "Different4@",
      }),
    },
  ));
  assert.equal(mismatchChange.response.status, 400);
  assert.equal(mismatchChange.body.code, "PASSWORD_CONFIRMATION_MISMATCH");

  const changed = await json(await fetch(
    `${baseUrl}/api/auth/admin/password/change-required`,
    {
      method: "PATCH",
      headers: { ...temporaryHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        new_password: "Permanent3@",
        confirm_password: "Permanent3@",
      }),
    },
  ));
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.admin.must_change_password, false);
  assert.equal(typeof changed.body.admin_token, "string");

  const revokedTemporarySession = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: temporaryHeaders },
  ));
  assert.equal(revokedTemporarySession.response.status, 401);
  assert.equal(revokedTemporarySession.body.code, "ADMIN_SESSION_REVOKED");

  const finalHeaders = { Authorization: `Bearer ${changed.body.admin_token}` };
  const finalMe = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: finalHeaders },
  ));
  assert.equal(finalMe.response.status, 200);
  assert.equal(finalMe.body.admin.must_change_password, false);

  const temporaryPasswordLogin = await login("07222222222", "Temporary2@");
  assert.equal(temporaryPasswordLogin.response.status, 401);
  const permanentPasswordLogin = await login("07222222222", "Permanent3@");
  assert.equal(permanentPasswordLogin.response.status, 200);

  const ownerLogs = await json(await fetch(
    `${baseUrl}/api/auth/admin/logs`,
    { headers: ownerHeaders },
  ));
  assert.equal(ownerLogs.response.status, 200);
  const resetLog = ownerLogs.body.logs.find(
    (log) => log.action_type === "assistant_admin_password_reset",
  );
  assert.ok(resetLog);
  assert.equal(resetLog.admin_id, "owner-admin");
  assert.equal(resetLog.merchant_id, "assistant-admin");
  assert.equal(JSON.stringify(resetLog).includes("Temporary2@"), false);
  assert.equal(JSON.stringify(resetLog).includes("OwnerPass1@"), false);

  const persisted = JSON.parse(
    await readFile(path.join(dataDir, "merchants.json"), "utf8"),
  );
  const persistedAssistant = persisted.merchants.find(
    (merchant) => merchant.id === "assistant-admin",
  );
  assert.equal(persistedAssistant.must_change_password, false);
  assert.equal(persistedAssistant.admin_session_version, 2);
  assert.match(persistedAssistant.password, /^sha256\$/);
  assert.equal(persistedAssistant.password.includes("Permanent3@"), false);
});
