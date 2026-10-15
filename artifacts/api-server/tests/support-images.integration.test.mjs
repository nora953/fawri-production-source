import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  access,
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
const serverEntry = path.join(apiRoot, "dist", "index.mjs");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

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
  const values =
    typeof response.headers.getSetCookie === "function"
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

function merchant(id, phone, password) {
  return {
    id,
    owner_name: `Owner ${id}`,
    store_name: `Store ${id}`,
    phone,
    password,
    activity_type: "retail",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: new Date().toISOString(),
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
}

test("support images are private, validated, and tenant-bound", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-support-images-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });
  const createdAt = new Date().toISOString();

  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        merchant("merchant-a", "07111111111", "MerchantA1@"),
        merchant("merchant-b", "07222222222", "MerchantB1@"),
        {
          ...merchant("assistant-admin", "07333333333", "Assistant1@"),
          owner_name: "Support Assistant",
          store_name: "Fawri Admin",
          activity_type: "admin",
          is_admin: true,
          admin_role: "assistant_admin",
          admin_enabled: true,
          permissions: ["manage_support"],
          admin_session_version: 0,
        },
      ],
      subscriptions: [],
      otps: [],
      admin_logs: [],
      merchant_notifications: [],
      support_tickets: [
        {
          id: "ticket-a",
          merchant_id: "merchant-a",
          merchant_name: "Store merchant-a",
          merchant_phone: "07111111111",
          subject: "Screenshot test",
          category: "technical",
          status: "in_progress",
          assigned_admin_id: "assistant-admin",
          assigned_admin_name: "Support Assistant",
          created_at: createdAt,
          updated_at: createdAt,
          waiting_on: "merchant",
          waiting_since: createdAt,
          messages: [],
          inspection_requests: [],
        },
      ],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
    }),
  );
  await writeFile(path.join(dataDir, "fawri-runtime-db.json"), "{}");
  await writeFile(path.join(dataDir, "saved-answers.json"), JSON.stringify({ answers: [] }));
  await writeFile(path.join(dataDir, "training-requests.json"), JSON.stringify({ requests: [] }));
  await writeFile(path.join(dataDir, "learned-answers.json"), JSON.stringify({ answers: [] }));

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

  async function merchantLogin(phone, password) {
    const result = await json(
      await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      }),
    );
    assert.equal(result.response.status, 200);
    return cookiePair(getSetCookie(result.response));
  }

  const cookieA = await merchantLogin("07111111111", "MerchantA1@");
  const cookieB = await merchantLogin("07222222222", "MerchantB1@");
  const adminLogin = await json(
    await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "07333333333", password: "Assistant1@" }),
    }),
  );
  assert.equal(adminLogin.response.status, 200);
  assert.equal(adminLogin.body.account_type, "admin");
  const adminHeaders = {
    Authorization: `Bearer ${adminLogin.body.admin_token}`,
  };

  const merchantUpload = await json(
    await fetch(`${baseUrl}/api/auth/support-images/merchant/tickets/ticket-a/messages`, {
      method: "POST",
      headers: {
        Cookie: cookieA,
        "Content-Type": "image/png",
        "X-File-Name": "problem.png",
      },
      body: png,
    }),
  );
  assert.equal(merchantUpload.response.status, 201);
  assert.equal(merchantUpload.body.message.sender_type, "merchant");
  assert.equal(merchantUpload.body.message.attachments.length, 1);
  assert.equal(merchantUpload.body.message.attachments[0].mime_type, "image/png");
  assert.equal(merchantUpload.body.message.attachments[0].size_bytes, png.length);
  const merchantAttachment = merchantUpload.body.message.attachments[0];

  const noSession = await fetch(`${baseUrl}${merchantAttachment.url}`);
  assert.equal(noSession.status, 401);

  const crossTenant = await fetch(`${baseUrl}${merchantAttachment.url}`, {
    headers: { Cookie: cookieB },
  });
  assert.equal(crossTenant.status, 404);

  const merchantRead = await fetch(`${baseUrl}${merchantAttachment.url}`, {
    headers: { Cookie: cookieA },
  });
  assert.equal(merchantRead.status, 200);
  assert.equal(merchantRead.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await merchantRead.arrayBuffer()), png);

  const adminRead = await fetch(`${baseUrl}${merchantAttachment.url}`, {
    headers: adminHeaders,
  });
  assert.equal(adminRead.status, 200);
  assert.deepEqual(Buffer.from(await adminRead.arrayBuffer()), png);

  const invalidUpload = await json(
    await fetch(`${baseUrl}/api/auth/support-images/merchant/tickets/ticket-a/messages`, {
      method: "POST",
      headers: {
        Cookie: cookieA,
        "Content-Type": "image/png",
        "X-File-Name": "fake.png",
      },
      body: Buffer.from("not an image"),
    }),
  );
  assert.equal(invalidUpload.response.status, 415);
  assert.equal(invalidUpload.body.code, "SUPPORT_IMAGE_TYPE_MISMATCH");

  const adminUpload = await json(
    await fetch(`${baseUrl}/api/auth/support-images/admin/tickets/ticket-a/messages`, {
      method: "POST",
      headers: {
        ...adminHeaders,
        "Content-Type": "image/png",
        "X-File-Name": "answer.png",
      },
      body: png,
    }),
  );
  assert.equal(adminUpload.response.status, 201);
  assert.equal(adminUpload.body.message.sender_type, "admin");
  const adminAttachment = adminUpload.body.message.attachments[0];

  const merchantReadsAdminImage = await fetch(`${baseUrl}${adminAttachment.url}`, {
    headers: { Cookie: cookieA },
  });
  assert.equal(merchantReadsAdminImage.status, 200);
  assert.deepEqual(Buffer.from(await merchantReadsAdminImage.arrayBuffer()), png);

  const db = JSON.parse(await readFile(path.join(dataDir, "merchants.json"), "utf8"));
  const ticket = db.support_tickets[0];
  assert.equal(ticket.messages.length, 2);
  assert.equal(ticket.waiting_on, "merchant");
  assert.doesNotMatch(JSON.stringify(db), new RegExp(png.toString("base64")));
  const storedAttachment = ticket.messages[0].attachments[0];
  await access(
    path.join(dataDir, "support-images", "ticket-a", storedAttachment.storage_name),
  );
  assert.ok(
    db.admin_logs.some((item) => item.action_type === "support_ticket_image_sent"),
  );
});
