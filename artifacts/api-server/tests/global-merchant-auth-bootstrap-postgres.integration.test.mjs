import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

function suffix() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to reserve API test port")));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, child, getLogs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The unified API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready.\n${getLogs()}`);
}

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function cookieByName(response, name) {
  const prefix = `${name}=`;
  for (const header of responseCookies(response)) {
    for (const candidate of String(header).split(/,(?=[^;,]+=)/)) {
      const cookie = candidate.trim().split(";", 1)[0];
      if (cookie.startsWith(prefix)) return cookie;
    }
  }
  return "";
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

test(
  "merchant signup, OTP verification and login keep credentials PostgreSQL-backed and hashed",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const { pool } = await import("@workspace/db");
    const id = suffix();
    const phone = `078${String(crypto.randomInt(0, 100_000_000)).padStart(8, "0")}`;
    const password = "GoldenAuth1!";
    const deviceId = `golden-auth-device-${id}`;
    const dataDirectory = path.join(os.tmpdir(), `fawri-golden-auth-${id}`);
    const runtimeDirectory = path.join(dataDirectory, "runtime");
    let merchantId = "";

    await mkdir(runtimeDirectory, { recursive: true });
    const collision = await pool.query(
      "SELECT id FROM accounts WHERE phone = $1 LIMIT 1",
      [phone],
    );
    assert.equal(
      collision.rows.length,
      0,
      "generated auth-bootstrap phone must not collide with an existing account",
    );

    const port = await reservePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let serverOutput = "";
    const child = spawn(process.execPath, [serverEntry], {
      cwd: runtimeDirectory,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        LOG_LEVEL: "silent",
        BOT_DEBUG: "false",
        FAWRI_DATA_DIR: dataDirectory,
        FAWRI_PASSWORD_SALT: "global-golden-auth-password-salt-over-thirty-two-characters",
        FAWRI_AUTH_SECURITY_SECRET:
          "global-golden-auth-session-secret-over-thirty-two-characters",
        FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
        FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
        FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY: "required",
        AUTH_ALLOW_DEV_OTP_BYPASS: "true",
        AUTH_INCLUDE_DEV_CODE: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });

    t.after(async () => {
      if (child.exitCode === null) child.kill("SIGTERM");
      await rm(dataDirectory, { recursive: true, force: true });
      if (merchantId) {
        await pool.query("DELETE FROM accounts WHERE id = $1", [merchantId]).catch(() => {});
      }
      await pool.end();
    });

    await waitForServer(baseUrl, child, () => serverOutput);

    const signup = await jsonRequest(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": deviceId,
      },
      body: JSON.stringify({
        phone,
        password,
        owner_name: "Golden Auth Owner",
        store_name: "Golden Auth Store",
        activity_type: "retail",
        language: "en",
      }),
    });
    assert.equal(signup.response.status, 201, JSON.stringify(signup.body));
    assert.equal(signup.body?.ok, true);
    assert.ok(signup.body?.challenge_id);
    assert.match(String(signup.body?.devCode || ""), /^\d{6}$/);
    merchantId = String(signup.body?.merchant?.id || signup.body?.account?.id || "");
    assert.ok(merchantId, "signup must return the PostgreSQL merchant identity");

    const credential = await pool.query(
      "SELECT password_hash, phone_verified FROM accounts WHERE id = $1 AND kind = 'merchant'",
      [merchantId],
    );
    assert.equal(credential.rows.length, 1);
    assert.notEqual(credential.rows[0].password_hash, password);
    assert.match(
      String(credential.rows[0].password_hash || ""),
      /^sha256\$v2\$scrypt\$/,
      "signup must persist the current scrypt password format",
    );
    assert.equal(credential.rows[0].phone_verified, false);

    const verified = await jsonRequest(`${baseUrl}/api/auth/verify-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": deviceId,
      },
      body: JSON.stringify({
        phone,
        challenge_id: signup.body.challenge_id,
        code: signup.body.devCode,
      }),
    });
    assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body?.ok, true);
    assert.equal(verified.body?.merchant?.id, merchantId);
    assert.ok(
      cookieByName(verified.response, "fawri_merchant_session_v2"),
      "OTP verification must issue a secure v2 merchant session",
    );

    const verifiedRow = await pool.query(
      "SELECT phone_verified FROM accounts WHERE id = $1 AND kind = 'merchant'",
      [merchantId],
    );
    assert.equal(verifiedRow.rows[0]?.phone_verified, true);

    const login = await jsonRequest(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": deviceId,
      },
      body: JSON.stringify({
        phone,
        password,
        device_label: "Golden auth bootstrap device",
      }),
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.body));
    assert.equal(login.body?.merchant?.id, merchantId);
    assert.ok(
      cookieByName(login.response, "fawri_merchant_session_v2"),
      "hashed-password login must issue the secure v2 merchant session cookie",
    );
  },
);
