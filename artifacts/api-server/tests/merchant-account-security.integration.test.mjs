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
    created_at: "2026-08-09T00:00:00.000Z",
    otp_verified: true,
    account_status: "approved",
    onboarding_status: "awaiting_channel",
    requested_plan: "gold",
    warning_stage: 0,
    retention_status: "protected",
  };
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForServer(baseUrl, child, getLogs) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API server exited early.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready.\n${getLogs()}`);
}

function getSetCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];
  return values[0] || response.headers.get("set-cookie") || "";
}

function cookiePair(setCookie) {
  assert.match(setCookie, /^fawri_merchant_session_v2=/);
  return setCookie.split(";", 1)[0];
}

function cookieSecret(cookie) {
  return cookie.slice(cookie.indexOf("=") + 1);
}

async function parseJson(response) {
  const body = await response.json().catch(() => null);
  return { response, body };
}

function authHeaders(cookie, deviceId, extra = {}) {
  return {
    Cookie: cookie,
    "X-Fawri-Device-Id": deviceId,
    ...extra,
  };
}

test("merchant account security endpoints preserve ownership and invalidation semantics", async (t) => {
  const runtimeDir = await mkdtemp(
    path.join(os.tmpdir(), "fawri-merchant-account-security-"),
  );
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        merchant("merchant-a", "07111111111", "MerchantA1@"),
        merchant("merchant-b", "07222222222", "MerchantB1@"),
      ],
      subscriptions: [],
      otps: [],
      admin_logs: [],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
      merchant_notifications: [],
      support_tickets: [],
    }),
  );

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverOutput = "";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      LOG_LEVEL: "silent",
      FAWRI_PASSWORD_SALT: "merchant-account-security-test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "merchant-account-security-test-admin-secret",
      FAWRI_MERCHANT_SESSION_SECRET: "merchant-account-security-test-merchant-secret",
      FAWRI_AUTH_SECURITY_SECRET: "merchant-account-security-test-auth-secret-0123456789",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    serverOutput += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    serverOutput += String(chunk);
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

  await waitForServer(baseUrl, child, () => serverOutput);

  const apiFetch = (url, options = {}) => fetch(`${baseUrl}${url}`, options);

  async function login(phone, password, deviceId, deviceLabel) {
    const response = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fawri-Device-Id": deviceId,
      },
      body: JSON.stringify({ phone, password, device_label: deviceLabel }),
    });
    const body = await response.json().catch(() => null);
    return {
      response,
      body,
      setCookie: getSetCookie(response),
    };
  }

  const deviceA1 = "device-merchant-a-browser-one";
  const deviceA2 = "device-merchant-a-browser-two";
  const deviceB1 = "device-merchant-b-browser-one";

  const loginA1 = await login(
    "07111111111",
    "MerchantA1@",
    deviceA1,
    "Merchant A laptop",
  );
  assert.equal(loginA1.response.status, 200);
  const cookieA1 = cookiePair(loginA1.setCookie);

  const loginA2 = await login(
    "07111111111",
    "MerchantA1@",
    deviceA2,
    "Merchant A phone",
  );
  assert.equal(loginA2.response.status, 200);
  const cookieA2 = cookiePair(loginA2.setCookie);

  const loginB1 = await login(
    "07222222222",
    "MerchantB1@",
    deviceB1,
    "Merchant B laptop",
  );
  assert.equal(loginB1.response.status, 200);
  const cookieB1 = cookiePair(loginB1.setCookie);

  await t.test("lists only own merchant sessions, identifies current session, and leaks no token material", async () => {
    const sessionsA1 = await parseJson(await apiFetch("/api/auth/sessions", {
      headers: authHeaders(cookieA1, deviceA1),
    }));
    assert.equal(sessionsA1.response.status, 200);
    assert.equal(sessionsA1.body.ok, true);
    assert.equal(typeof sessionsA1.body.current_session_id, "string");
    assert.ok(sessionsA1.body.current_session_id.length > 0);
    assert.ok(Array.isArray(sessionsA1.body.sessions));
    assert.ok(sessionsA1.body.sessions.length >= 2);
    assert.ok(
      sessionsA1.body.sessions.every(
        (session) =>
          session.account_id === "merchant-a" &&
          session.account_kind === "merchant" &&
          session.tenant_id === "merchant-a",
      ),
    );
    assert.ok(
      sessionsA1.body.sessions.some(
        (session) => session.id === sessionsA1.body.current_session_id,
      ),
    );

    const serialized = JSON.stringify(sessionsA1.body);
    assert.equal(serialized.includes("token_hash"), false);
    assert.equal(serialized.includes(cookieSecret(cookieA1)), false);
    assert.equal(serialized.includes(cookieSecret(cookieA2)), false);

    const sessionsB = await parseJson(await apiFetch("/api/auth/sessions", {
      headers: authHeaders(cookieB1, deviceB1),
    }));
    assert.equal(sessionsB.response.status, 200);
    assert.ok(
      sessionsB.body.sessions.every(
        (session) =>
          session.account_id === "merchant-b" &&
          session.tenant_id === "merchant-b",
      ),
    );
    assert.equal(
      sessionsA1.body.sessions.some(
        (session) => session.id === sessionsB.body.current_session_id,
      ),
      false,
    );
  });

  await t.test("cannot revoke another merchant session", async () => {
    const sessionsB = await parseJson(await apiFetch("/api/auth/sessions", {
      headers: authHeaders(cookieB1, deviceB1),
    }));
    const bSessionId = sessionsB.body.current_session_id;
    assert.ok(bSessionId);

    const crossMerchantRevoke = await parseJson(await apiFetch(
      `/api/auth/sessions/${encodeURIComponent(bSessionId)}`,
      {
        method: "DELETE",
        headers: authHeaders(cookieA1, deviceA1),
      },
    ));
    assert.equal(crossMerchantRevoke.response.status, 404);
    assert.equal(crossMerchantRevoke.body.ok, false);

    const merchantBStillValid = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieB1, deviceB1),
    });
    assert.equal(merchantBStillValid.status, 200);
  });

  await t.test("revokes an owned selected session without invalidating the current session", async () => {
    const sessionsA2 = await parseJson(await apiFetch("/api/auth/sessions", {
      headers: authHeaders(cookieA2, deviceA2),
    }));
    const selectedSessionId = sessionsA2.body.current_session_id;
    assert.ok(selectedSessionId);

    const revoke = await parseJson(await apiFetch(
      `/api/auth/sessions/${encodeURIComponent(selectedSessionId)}`,
      {
        method: "DELETE",
        headers: authHeaders(cookieA1, deviceA1),
      },
    ));
    assert.equal(revoke.response.status, 200);
    assert.equal(revoke.body.ok, true);

    const revokedSession = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieA2, deviceA2),
    });
    assert.equal(revokedSession.status, 401);

    const currentSession = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieA1, deviceA1),
    });
    assert.equal(currentSession.status, 200);
  });

  await t.test("logout-all invalidates every own session and leaves another merchant untouched", async () => {
    const deviceA3 = "device-merchant-a-browser-three";
    const loginA3 = await login(
      "07111111111",
      "MerchantA1@",
      deviceA3,
      "Merchant A tablet",
    );
    assert.equal(loginA3.response.status, 200);
    const cookieA3 = cookiePair(loginA3.setCookie);

    const logoutAll = await parseJson(await apiFetch("/api/auth/logout-all", {
      method: "POST",
      headers: authHeaders(cookieA1, deviceA1),
    }));
    assert.equal(logoutAll.response.status, 200);
    assert.equal(logoutAll.body.ok, true);
    assert.match(getSetCookie(logoutAll.response), /^fawri_merchant_session_v2=/);

    const oldCurrent = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieA1, deviceA1),
    });
    assert.equal(oldCurrent.status, 401);

    const otherOwnSession = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieA3, deviceA3),
    });
    assert.equal(otherOwnSession.status, 401);

    const merchantBStillValid = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieB1, deviceB1),
    });
    assert.equal(merchantBStillValid.status, 200);
  });

  await t.test("password change fails closed on bad current password and revokes all sessions on success", async () => {
    const deviceA4 = "device-merchant-a-browser-four";
    const deviceA5 = "device-merchant-a-browser-five";
    const loginA4 = await login(
      "07111111111",
      "MerchantA1@",
      deviceA4,
      "Merchant A desktop",
    );
    assert.equal(loginA4.response.status, 200);
    const cookieA4 = cookiePair(loginA4.setCookie);

    const loginA5 = await login(
      "07111111111",
      "MerchantA1@",
      deviceA5,
      "Merchant A spare browser",
    );
    assert.equal(loginA5.response.status, 200);
    const cookieA5 = cookiePair(loginA5.setCookie);

    const failedChange = await parseJson(await apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: authHeaders(cookieA4, deviceA4, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        current_password: "WrongPassword1@",
        new_password: "MerchantA2@",
        confirm_password: "MerchantA2@",
      }),
    }));
    assert.equal(failedChange.response.status, 401);
    assert.equal(failedChange.body.ok, false);
    assert.equal(failedChange.body.code, "CURRENT_PASSWORD_INVALID");

    const sessionAfterFailure = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieA4, deviceA4),
    });
    assert.equal(sessionAfterFailure.status, 200);

    const successfulChange = await parseJson(await apiFetch("/api/auth/change-password", {
      method: "POST",
      headers: authHeaders(cookieA4, deviceA4, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        current_password: "MerchantA1@",
        new_password: "MerchantA2@",
        confirm_password: "MerchantA2@",
      }),
    }));
    assert.equal(successfulChange.response.status, 200);
    assert.equal(successfulChange.body.ok, true);
    assert.equal(successfulChange.body.reauthentication_required, true);
    assert.match(getSetCookie(successfulChange.response), /^fawri_merchant_session_v2=/);

    const changedCurrentSession = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieA4, deviceA4),
    });
    assert.equal(changedCurrentSession.status, 401);

    const changedOtherSession = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieA5, deviceA5),
    });
    assert.equal(changedOtherSession.status, 401);

    const oldPassword = await login(
      "07111111111",
      "MerchantA1@",
      "device-merchant-a-old-password",
      "Old password attempt",
    );
    assert.equal(oldPassword.response.status, 401);

    const newPassword = await login(
      "07111111111",
      "MerchantA2@",
      "device-merchant-a-new-password",
      "New password login",
    );
    assert.equal(newPassword.response.status, 200);

    const merchantBStillValid = await apiFetch("/api/auth/me", {
      headers: authHeaders(cookieB1, deviceB1),
    });
    assert.equal(merchantBStillValid.status, 200);
  });
});
