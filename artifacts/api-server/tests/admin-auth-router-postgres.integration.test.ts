import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "");
assert.ok(DATABASE_URL, "DATABASE_URL is required");
const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" || parsedDatabaseUrl.hostname === "localhost",
  "admin auth PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "admin auth PostgreSQL proof only permits the fawri_ci database",
);

const PASSWORD_SALT = "admin-auth-postgres-proof-password-salt";
const AUTH_SECRET = "admin-auth-postgres-proof-security-secret-at-least-32-characters";
const ownerId = "admin-pg-owner-proof";
const ownerPhone = "07987654321";
const ownerPassword = "OwnerProof9!";
const ownerDeviceId = "owner-device-postgres-proof";
const assistantPhone = "07987654322";
const assistantPassword = "AssistantProof9!";
const assistantNextPassword = "AssistantNext9!";
const assistantDeviceId = "assistant-device-postgres-proof";

process.env.FAWRI_PASSWORD_SALT = PASSWORD_SALT;
const { pool } = await import("@workspace/db");
const { hashPassword } = await import("../src/services/authPasswordService.js");

async function json(response: Response) {
  return {
    response,
    body: await response.json().catch(() => null) as any,
  };
}

function firstSetCookie(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  return values[0] || response.headers.get("set-cookie") || "";
}

function adminCookie(response: Response): string {
  const setCookie = firstSetCookie(response);
  assert.match(setCookie, /^fawri_admin_session_v2=/);
  return setCookie.split(";", 1)[0];
}

function adminHeaders(cookie: string, deviceId: string): Record<string, string> {
  return {
    Cookie: cookie,
    "x-fawri-device-id": deviceId,
  };
}

async function seedOwner(): Promise<void> {
  await pool.query(
    "DELETE FROM accounts WHERE id = $1 OR phone = ANY($2::text[])",
    [ownerId, [ownerPhone, assistantPhone]],
  );
  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at, created_at, updated_at
     ) VALUES (
       $1, 'admin', $2, $3, 'active', 'en',
       TRUE, now(), now(), now()
     )`,
    [ownerId, ownerPhone, hashPassword(ownerPassword)],
  );
  await pool.query(
    `INSERT INTO admin_profiles (
       id, account_id, profile_kind, display_name, role,
       enabled, must_change_password, created_at, updated_at
     ) VALUES (
       $1, $1, 'admin', 'PostgreSQL Owner Proof', 'owner_admin',
       TRUE, FALSE, now(), now()
     )`,
    [ownerId],
  );
}

function assertNoLegacyAuthFiles(dataDirectory: string): void {
  assert.equal(
    fs.existsSync(path.join(dataDirectory, "merchants.json")),
    false,
    "PostgreSQL admin auth router must not create merchants.json",
  );
  assert.equal(
    fs.existsSync(path.join(dataDirectory, "auth-security.json")),
    false,
    "PostgreSQL admin auth router must not create auth-security.json",
  );
}

test("admin auth router is end-to-end PostgreSQL authoritative", async (t) => {
  await seedOwner();
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-admin-auth-router-pg-proof-"),
  );
  const dataDirectory = path.join(runtimeDirectory, "data");
  await mkdir(dataDirectory, { recursive: true });

  Object.assign(process.env, {
    NODE_ENV: "test",
    FAWRI_DATA_DIR: dataDirectory,
    FAWRI_PASSWORD_SALT: PASSWORD_SALT,
    FAWRI_AUTH_SECURITY_SECRET: AUTH_SECRET,
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
    FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
    AUTH_ALLOW_DEV_OTP_BYPASS: "true",
    AUTH_INCLUDE_DEV_CODE: "true",
  });

  const [{ default: express }, { default: cookieParser }, { default: authSecurityRouter }] =
    await Promise.all([
      import("express"),
      import("cookie-parser"),
      import("../src/routes/auth-security.js"),
    ]);

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/auth", authSecurityRouter);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let assistantId = "";
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query(
      "DELETE FROM accounts WHERE id = $1 OR id = $2 OR phone = ANY($3::text[])",
      [ownerId, assistantId || "missing-assistant", [ownerPhone, assistantPhone]],
    );
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  assertNoLegacyAuthFiles(dataDirectory);

  const ownerLogin = await json(await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fawri-device-id": ownerDeviceId,
    },
    body: JSON.stringify({
      phone: ownerPhone,
      password: ownerPassword,
      device_label: "Owner PostgreSQL Proof Device",
    }),
  }));
  assert.equal(ownerLogin.response.status, 403);
  assert.equal(ownerLogin.body?.code, "OWNER_DEVICE_OTP_REQUIRED");
  assert.match(String(ownerLogin.body?.device_record_id || ""), /^[0-9a-f-]{36}$/i);
  assert.match(String(ownerLogin.body?.challenge_id || ""), /^[0-9a-f-]{36}$/i);
  assert.match(String(ownerLogin.body?.devCode || ""), /^\d{6}$/);

  const ownerOtpRows = await pool.query(
    `SELECT account_id, purpose::text AS purpose, used_at
       FROM auth_otp_challenges
      WHERE id = $1`,
    [ownerLogin.body.challenge_id],
  );
  assert.equal(ownerOtpRows.rowCount, 1);
  assert.equal(ownerOtpRows.rows[0].account_id, ownerId);
  assert.equal(ownerOtpRows.rows[0].purpose, "admin_device_verification");
  assert.equal(ownerOtpRows.rows[0].used_at, null);
  assertNoLegacyAuthFiles(dataDirectory);

  const ownerVerify = await json(await fetch(
    `${baseUrl}/api/auth/admin/device-otp/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fawri-device-id": ownerDeviceId,
      },
      body: JSON.stringify({
        phone: ownerPhone,
        device_record_id: ownerLogin.body.device_record_id,
        challenge_id: ownerLogin.body.challenge_id,
        code: ownerLogin.body.devCode,
      }),
    },
  ));
  assert.equal(ownerVerify.response.status, 200);
  assert.equal(ownerVerify.body?.admin_profile?.role, "owner_admin");
  const ownerCookie = adminCookie(ownerVerify.response);

  const ownerMe = await json(await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: adminHeaders(ownerCookie, ownerDeviceId),
  }));
  assert.equal(ownerMe.response.status, 200);
  assert.equal(ownerMe.body?.admin?.id, ownerId);
  assert.equal(ownerMe.body?.admin_profile?.role, "owner_admin");

  const createdAssistant = await json(await fetch(`${baseUrl}/api/auth/admins`, {
    method: "POST",
    headers: {
      ...adminHeaders(ownerCookie, ownerDeviceId),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      owner_name: "PostgreSQL Assistant Proof",
      phone: assistantPhone,
      password: assistantPassword,
      confirm_password: assistantPassword,
      language: "en",
    }),
  }));
  assert.equal(createdAssistant.response.status, 201);
  assistantId = String(createdAssistant.body?.admin_profile?.adminId || "");
  assert.match(assistantId, /^admin-/);
  assert.equal(createdAssistant.body?.admin_profile?.mustChangePassword, true);

  const permissions = ["view_merchants", "manage_support"];
  const permissionsResult = await json(await fetch(
    `${baseUrl}/api/auth/admins/${encodeURIComponent(assistantId)}/permissions`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(ownerCookie, ownerDeviceId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ permissions }),
    },
  ));
  assert.equal(permissionsResult.response.status, 200);
  assert.deepEqual(permissionsResult.body?.admin_profile?.permissions, permissions);

  const assistantFirstLogin = await json(await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fawri-device-id": assistantDeviceId,
    },
    body: JSON.stringify({
      phone: assistantPhone,
      password: assistantPassword,
      device_label: "Assistant PostgreSQL Proof Device",
    }),
  }));
  assert.equal(assistantFirstLogin.response.status, 403);
  assert.equal(assistantFirstLogin.body?.code, "ADMIN_DEVICE_APPROVAL_REQUIRED");
  const assistantDeviceRecordId = String(
    assistantFirstLogin.body?.device_record_id || "",
  );
  assert.match(assistantDeviceRecordId, /^[0-9a-f-]{36}$/i);

  const trustAssistantDevice = await json(await fetch(
    `${baseUrl}/api/auth/admins/${encodeURIComponent(assistantId)}/devices/${encodeURIComponent(assistantDeviceRecordId)}/trust`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(ownerCookie, ownerDeviceId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ owner_password: ownerPassword }),
    },
  ));
  assert.equal(trustAssistantDevice.response.status, 200);

  const assistantLogin = await json(await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fawri-device-id": assistantDeviceId,
    },
    body: JSON.stringify({
      phone: assistantPhone,
      password: assistantPassword,
      device_label: "Assistant PostgreSQL Proof Device",
    }),
  }));
  assert.equal(assistantLogin.response.status, 200);
  const assistantCookie = adminCookie(assistantLogin.response);

  const assistantMeBeforeChange = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: adminHeaders(assistantCookie, assistantDeviceId) },
  ));
  assert.equal(assistantMeBeforeChange.response.status, 200);
  assert.equal(assistantMeBeforeChange.body?.admin_profile?.mustChangePassword, true);
  assert.deepEqual(
    assistantMeBeforeChange.body?.admin_profile?.permissions,
    permissions,
  );

  const assistantSessionsBlocked = await json(await fetch(
    `${baseUrl}/api/auth/admin/sessions`,
    { headers: adminHeaders(assistantCookie, assistantDeviceId) },
  ));
  assert.equal(assistantSessionsBlocked.response.status, 403);
  assert.equal(assistantSessionsBlocked.body?.code, "ADMIN_PASSWORD_CHANGE_REQUIRED");

  const forcedPasswordChange = await json(await fetch(
    `${baseUrl}/api/auth/admin/change-password`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(assistantCookie, assistantDeviceId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        new_password: assistantNextPassword,
        confirm_password: assistantNextPassword,
      }),
    },
  ));
  assert.equal(forcedPasswordChange.response.status, 200);
  assert.equal(forcedPasswordChange.body?.reauthentication_required, true);

  const revokedAssistantCookie = await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: adminHeaders(assistantCookie, assistantDeviceId),
  });
  assert.equal(revokedAssistantCookie.status, 401);

  const oldPasswordLogin = await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fawri-device-id": assistantDeviceId,
    },
    body: JSON.stringify({ phone: assistantPhone, password: assistantPassword }),
  });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await json(await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fawri-device-id": assistantDeviceId,
    },
    body: JSON.stringify({
      phone: assistantPhone,
      password: assistantNextPassword,
      device_label: "Assistant PostgreSQL Proof Device",
    }),
  }));
  assert.equal(newPasswordLogin.response.status, 200);
  const assistantNextCookie = adminCookie(newPasswordLogin.response);

  const assistantMeAfterChange = await json(await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: adminHeaders(assistantNextCookie, assistantDeviceId) },
  ));
  assert.equal(assistantMeAfterChange.response.status, 200);
  assert.equal(assistantMeAfterChange.body?.admin_profile?.mustChangePassword, false);

  const allowedMerchantList = await json(await fetch(
    `${baseUrl}/api/auth/merchants`,
    { headers: adminHeaders(assistantNextCookie, assistantDeviceId) },
  ));
  assert.equal(allowedMerchantList.response.status, 200);
  assert.ok(Array.isArray(allowedMerchantList.body?.merchants));

  const deniedAdminLogs = await json(await fetch(
    `${baseUrl}/api/auth/admin/logs`,
    { headers: adminHeaders(assistantNextCookie, assistantDeviceId) },
  ));
  assert.equal(deniedAdminLogs.response.status, 403);
  assert.equal(deniedAdminLogs.body?.code, "ADMIN_PERMISSION_REQUIRED");

  const workMonitor = await json(await fetch(
    `${baseUrl}/api/auth/admins/${encodeURIComponent(assistantId)}/work-monitor`,
    { headers: adminHeaders(ownerCookie, ownerDeviceId) },
  ));
  assert.equal(workMonitor.response.status, 200);
  assert.equal(workMonitor.body?.admin?.id, assistantId);
  assert.ok(Number(workMonitor.body?.summary?.trusted_device_count) >= 1);

  const disableAssistant = await json(await fetch(
    `${baseUrl}/api/auth/admins/${encodeURIComponent(assistantId)}/enabled`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(ownerCookie, ownerDeviceId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: false }),
    },
  ));
  assert.equal(disableAssistant.response.status, 200);

  const sessionAfterDisable = await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: adminHeaders(assistantNextCookie, assistantDeviceId),
  });
  assert.equal(sessionAfterDisable.status, 401);

  const ownerAfterAssistantDisable = await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: adminHeaders(ownerCookie, ownerDeviceId),
  });
  assert.equal(ownerAfterAssistantDisable.status, 200);

  const reenableAssistant = await json(await fetch(
    `${baseUrl}/api/auth/admins/${encodeURIComponent(assistantId)}/enabled`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(ownerCookie, ownerDeviceId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled: true }),
    },
  ));
  assert.equal(reenableAssistant.response.status, 200);

  const assistantRelogin = await json(await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fawri-device-id": assistantDeviceId,
    },
    body: JSON.stringify({
      phone: assistantPhone,
      password: assistantNextPassword,
      device_label: "Assistant PostgreSQL Proof Device",
    }),
  }));
  assert.equal(assistantRelogin.response.status, 200);
  const assistantReenabledCookie = adminCookie(assistantRelogin.response);

  const revokeAssistantDevice = await json(await fetch(
    `${baseUrl}/api/auth/admins/${encodeURIComponent(assistantId)}/devices/${encodeURIComponent(assistantDeviceRecordId)}/revoke`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(ownerCookie, ownerDeviceId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ owner_password: ownerPassword }),
    },
  ));
  assert.equal(revokeAssistantDevice.response.status, 200);

  const sessionAfterDeviceRevoke = await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: adminHeaders(assistantReenabledCookie, assistantDeviceId),
  });
  assert.equal(sessionAfterDeviceRevoke.status, 401);

  const securityRows = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM account_sessions WHERE account_id = $1 AND kind = 'admin') AS sessions,
       (SELECT COUNT(*)::int FROM trusted_devices WHERE account_id = $1 AND kind = 'admin') AS devices,
       (SELECT COUNT(*)::int FROM login_attempts WHERE account_id = $1 AND kind = 'admin') AS login_attempts,
       (SELECT COUNT(*)::int FROM auth_audit_events WHERE actor_account_id = $2 OR actor_account_id = $1) AS audit_events`,
    [assistantId, ownerId],
  );
  assert.ok(Number(securityRows.rows[0].sessions) >= 1);
  assert.ok(Number(securityRows.rows[0].devices) >= 1);
  assert.ok(Number(securityRows.rows[0].login_attempts) >= 1);
  assert.ok(Number(securityRows.rows[0].audit_events) >= 1);

  assertNoLegacyAuthFiles(dataDirectory);
});
