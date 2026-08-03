import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const sourceDist = path.join(apiRoot, "dist");

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
  for (let attempt = 0; attempt < 100; attempt += 1) {
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

async function login(baseUrl, phone, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  return { response, body: await response.json().catch(() => null) };
}

test("API data path is independent from process cwd", async (t) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "fawri-data-path-"));
  const isolatedApiRoot = path.join(runtimeRoot, "api-server");
  const canonicalDataDir = path.join(isolatedApiRoot, "data");
  const wrongCwd = path.join(runtimeRoot, "wrong-cwd");
  const shadowDataDir = path.join(wrongCwd, "data");

  await mkdir(canonicalDataDir, { recursive: true });
  await mkdir(shadowDataDir, { recursive: true });
  await cp(sourceDist, path.join(isolatedApiRoot, "dist"), { recursive: true });
  await writeFile(
    path.join(isolatedApiRoot, "package.json"),
    JSON.stringify({ name: "@workspace/api-server", type: "module" }),
  );

  const baseAccount = {
    activity_type: "test",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-03T00:00:00.000Z",
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
  const canonicalDb = {
    merchants: [
      {
        ...baseAccount,
        id: "owner-admin",
        owner_name: "Owner",
        store_name: "Fawri Admin",
        phone: "07111111111",
        password: "OwnerPass1@",
        is_admin: true,
        admin_role: "owner_admin",
        admin_enabled: true,
      },
      {
        ...baseAccount,
        id: "merchant-one",
        owner_name: "Merchant",
        store_name: "Merchant Store",
        phone: "07222222222",
        password: "Merchant1@",
        account_status: "approved",
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
  };
  const shadowDb = {
    merchants: [],
    subscriptions: [],
    otps: [],
    admin_logs: [],
    merchant_notifications: [],
    support_tickets: [],
    deletion_requests: [],
    channel_overrides: {},
    admin_notes: {},
  };

  await writeFile(
    path.join(canonicalDataDir, "merchants.json"),
    JSON.stringify(canonicalDb, null, 2),
  );
  await writeFile(
    path.join(shadowDataDir, "merchants.json"),
    JSON.stringify(shadowDb, null, 2),
  );

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(
    process.execPath,
    [path.join(isolatedApiRoot, "dist/index.mjs")],
    {
      cwd: wrongCwd,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(port),
        LOG_LEVEL: "silent",
        BOT_DEBUG: "false",
        FAWRI_PASSWORD_SALT: "data-path-test-salt",
        FAWRI_ADMIN_SESSION_SECRET: "data-path-test-secret",
        FAWRI_ADMIN_PHONE: "07111111111",
        FAWRI_ADMIN_DEVICE_TRUST_ENFORCED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await rm(runtimeRoot, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => output);

  const ownerLogin = await login(baseUrl, "07111111111", "OwnerPass1@");
  assert.equal(ownerLogin.response.status, 200);
  assert.equal(ownerLogin.body.merchant.id, "owner-admin");

  const merchantLogin = await login(baseUrl, "07222222222", "Merchant1@");
  assert.equal(merchantLogin.response.status, 200);
  assert.equal(merchantLogin.body.merchant.id, "merchant-one");

  const untouchedShadow = JSON.parse(
    await readFile(path.join(shadowDataDir, "merchants.json"), "utf8"),
  );
  assert.equal(untouchedShadow.merchants.length, 0);

  const canonicalAfterLogin = JSON.parse(
    await readFile(path.join(canonicalDataDir, "merchants.json"), "utf8"),
  );
  assert.equal(canonicalAfterLogin.merchants.length, 2);
});
