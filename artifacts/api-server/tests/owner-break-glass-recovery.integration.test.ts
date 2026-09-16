import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "");
assert.ok(DATABASE_URL, "DATABASE_URL is required");
const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" || parsedDatabaseUrl.hostname === "localhost",
  "owner recovery PostgreSQL proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "owner recovery PostgreSQL proof only permits the fawri_ci database",
);

const PASSWORD_SALT = "owner-break-glass-proof-password-salt";
const AUTH_SECRET = "owner-break-glass-proof-security-secret-at-least-32-characters";
const ownerId = "admin-owner-break-glass-proof-000000000001";
const phone0 = "07977777001";
const phone1 = "07977777002";
const phone2 = "07977777003";
const phone3 = "07977777004";
const password0 = "OwnerProof9!";
const password2 = "OwnerRecovered9!";

process.env.FAWRI_PASSWORD_SALT = PASSWORD_SALT;
const { pool } = await import("@workspace/db");
const { hashPassword } = await import("../src/services/authPasswordService.js");

async function json(response: Response) {
  return {
    response,
    body: await response.json().catch(() => null) as any,
  };
}

function cookieFrom(response: Response, name: string): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  const prefix = `${name}=`;
  const match = values.find((entry) => entry.split(";", 1)[0].startsWith(prefix));
  assert.ok(match, `${name} cookie is required`);
  return match.split(";", 1)[0];
}

function adminHeaders(cookie: string, deviceId: string): Record<string, string> {
  return {
    Cookie: cookie,
    "x-fawri-device-id": deviceId,
  };
}

async function clearProofAuthState(): Promise<void> {
  await pool.query(
    "DELETE FROM login_attempts WHERE account_id = $1",
    [ownerId],
  );
  await pool.query(
    "DELETE FROM auth_otp_challenges WHERE account_id = $1 OR purpose = 'admin_recovery'",
    [ownerId],
  );
}

async function seedOwner(): Promise<void> {
  await clearProofAuthState();
  await pool.query(
    "DELETE FROM accounts WHERE id = $1 OR phone = ANY($2::text[])",
    [ownerId, [phone0, phone1, phone2, phone3]],
  );
  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at, created_at, updated_at
     ) VALUES (
       $1, 'admin', $2, $3, 'active', 'en',
       TRUE, now(), now(), now()
     )`,
    [ownerId, phone0, hashPassword(password0)],
  );
  await pool.query(
    `INSERT INTO admin_profiles (
       id, account_id, profile_kind, display_name, role,
       enabled, must_change_password, created_at, updated_at
     ) VALUES (
       $1, $1, 'admin', 'Break Glass Owner Proof', 'owner_admin',
       TRUE, FALSE, now(), now()
     )`,
    [ownerId],
  );
}

test("owner break-glass recovery is PostgreSQL authoritative, one-time, and capped at two sessions", async (t) => {
  await seedOwner();
  const runtimeDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fawri-owner-break-glass-proof-"),
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
    AUTH_OTP_RESEND_MS: "1",
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

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query(
      "DELETE FROM accounts WHERE id = $1 OR phone = ANY($2::text[])",
      [ownerId, [phone0, phone1, phone2, phone3]],
    );
    await clearProofAuthState();
    await pool.end();
    await rm(runtimeDirectory, { recursive: true, force: true });
  });

  async function loginOwner(phone: string, password: string, deviceId: string) {
    const login = await json(await fetch(`${baseUrl}/api/auth/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fawri-device-id": deviceId,
      },
      body: JSON.stringify({ phone, password, device_label: deviceId }),
    }));
    if (login.response.status === 200) {
      return cookieFrom(login.response, "fawri_admin_session_v2");
    }
    assert.equal(login.response.status, 403);
    assert.equal(login.body?.code, "OWNER_DEVICE_OTP_REQUIRED");
    assert.match(String(login.body?.devCode || ""), /^\d{6}$/);
    const verified = await json(await fetch(`${baseUrl}/api/auth/admin/device-otp/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fawri-device-id": deviceId,
      },
      body: JSON.stringify({
        phone,
        device_record_id: login.body.device_record_id,
        challenge_id: login.body.challenge_id,
        code: login.body.devCode,
      }),
    }));
    assert.equal(verified.response.status, 200);
    return cookieFrom(verified.response, "fawri_admin_session_v2");
  }

  async function generateBundle(
    adminCookie: string,
    deviceId: string,
    password: string,
  ) {
    const generated = await json(await fetch(`${baseUrl}/api/auth/admin/owner-recovery/generate`, {
      method: "POST",
      headers: {
        ...adminHeaders(adminCookie, deviceId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ owner_password: password }),
    }));
    assert.equal(generated.response.status, 201);
    assert.match(String(generated.body?.recovery_path || ""), /^\/owner-recovery\/[0-9a-f]{48}$/);
    assert.match(String(generated.body?.key_1 || ""), /^[0-9a-f]{64}$/);
    assert.match(String(generated.body?.key_2 || ""), /^[0-9a-f]{64}$/);
    assert.equal(generated.body?.display_once, true);
    return generated.body;
  }

  async function recover(input: {
    bundle: any;
    oldPhone: string;
    newPhone: string;
    currentPassword?: string;
    forgotPassword?: boolean;
    newPassword?: string;
  }) {
    const recoveryId = String(input.bundle.recovery_path).split("/").pop();
    assert.ok(recoveryId);
    const start = await json(await fetch(`${baseUrl}/api/auth/owner-recovery/${recoveryId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_1: input.bundle.key_1 }),
    }));
    assert.equal(start.response.status, 200);
    let recoveryCookie = cookieFrom(start.response, "fawri_owner_recovery");

    const otpRequest = await json(await fetch(
      `${baseUrl}/api/auth/owner-recovery/${recoveryId}/otp/request`,
      {
        method: "POST",
        headers: { Cookie: recoveryCookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          old_phone: input.oldPhone,
          new_phone: input.newPhone,
          confirm_new_phone: input.newPhone,
        }),
      },
    ));
    assert.equal(otpRequest.response.status, 202);
    assert.match(String(otpRequest.body?.devCode || ""), /^\d{6}$/);
    recoveryCookie = cookieFrom(otpRequest.response, "fawri_owner_recovery");

    const otpRows = await pool.query(
      `SELECT account_id, purpose::text AS purpose, used_at
         FROM auth_otp_challenges
        WHERE id = $1`,
      [otpRequest.body.challenge_id],
    );
    assert.equal(otpRows.rowCount, 1);
    assert.equal(otpRows.rows[0].account_id, null);
    assert.equal(otpRows.rows[0].purpose, "admin_recovery");
    assert.equal(otpRows.rows[0].used_at, null);

    const otpVerify = await json(await fetch(
      `${baseUrl}/api/auth/owner-recovery/${recoveryId}/otp/verify`,
      {
        method: "POST",
        headers: { Cookie: recoveryCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpRequest.body.devCode }),
      },
    ));
    assert.equal(otpVerify.response.status, 200);
    recoveryCookie = cookieFrom(otpVerify.response, "fawri_owner_recovery");

    const complete = await json(await fetch(
      `${baseUrl}/api/auth/owner-recovery/${recoveryId}/complete`,
      {
        method: "POST",
        headers: { Cookie: recoveryCookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          key_2: input.bundle.key_2,
          forgot_password: input.forgotPassword === true,
          current_password: input.currentPassword || "",
          new_password: input.newPassword || "",
          confirm_new_password: input.newPassword || "",
        }),
      },
    ));
    assert.equal(complete.response.status, 200);
    assert.equal(complete.body?.all_sessions_revoked, true);
    assert.equal(complete.body?.all_devices_revoked, true);
    assert.equal(complete.body?.recovery_keys_consumed, true);
    return { recoveryId, complete };
  }

  const device0 = "owner-break-glass-device-0";
  const cookie0 = await loginOwner(phone0, password0, device0);

  const noPasswordGenerate = await json(await fetch(
    `${baseUrl}/api/auth/admin/owner-recovery/generate`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(cookie0, device0),
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  ));
  assert.equal(noPasswordGenerate.response.status, 401);
  assert.equal(noPasswordGenerate.body?.code, "OWNER_PASSWORD_INCORRECT");

  const bundle0 = await generateBundle(cookie0, device0, password0);
  const metadata0 = await pool.query(
    `SELECT metadata -> 'owner_recovery' AS recovery
       FROM accounts WHERE id = $1`,
    [ownerId],
  );
  const stored0 = metadata0.rows[0]?.recovery || {};
  assert.equal(stored0.enabled, true);
  assert.equal(typeof stored0.key_1_hash, "string");
  assert.equal(typeof stored0.key_2_hash, "string");
  assert.notEqual(stored0.key_1_hash, bundle0.key_1);
  assert.notEqual(stored0.key_2_hash, bundle0.key_2);
  assert.equal(JSON.stringify(stored0).includes(bundle0.key_1), false);
  assert.equal(JSON.stringify(stored0).includes(bundle0.key_2), false);

  const wrongKeyStart = await json(await fetch(
    `${baseUrl}${bundle0.recovery_path}/start`.replace("/owner-recovery/", "/api/auth/owner-recovery/"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_1: "0".repeat(64) }),
    },
  ));
  assert.equal(wrongKeyStart.response.status, 401);

  const first = await recover({
    bundle: bundle0,
    oldPhone: phone0,
    newPhone: phone1,
    currentPassword: password0,
  });
  assert.equal(first.complete.body?.password_reset, false);

  const afterFirst = await pool.query(
    `SELECT phone, metadata -> 'owner_recovery' AS recovery
       FROM accounts WHERE id = $1`,
    [ownerId],
  );
  assert.equal(afterFirst.rows[0].phone, phone1);
  assert.equal(afterFirst.rows[0].recovery.enabled, false);
  assert.equal(afterFirst.rows[0].recovery.key_1_hash, undefined);
  assert.equal(afterFirst.rows[0].recovery.key_2_hash, undefined);
  const liveAfterFirst = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM account_sessions WHERE account_id = $1 AND kind = 'admin' AND status = 'active') AS sessions,
       (SELECT count(*)::int FROM trusted_devices WHERE account_id = $1 AND kind = 'admin' AND status = 'trusted') AS devices`,
    [ownerId],
  );
  assert.equal(liveAfterFirst.rows[0].sessions, 0);
  assert.equal(liveAfterFirst.rows[0].devices, 0);

  const replay = await json(await fetch(
    `${baseUrl}/api/auth/owner-recovery/${first.recoveryId}/start`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_1: bundle0.key_1 }),
    },
  ));
  assert.equal(replay.response.status, 401);

  const device1 = "owner-break-glass-device-1";
  const cookie1 = await loginOwner(phone1, password0, device1);
  const bundle1 = await generateBundle(cookie1, device1, password0);
  const second = await recover({
    bundle: bundle1,
    oldPhone: phone1,
    newPhone: phone2,
    forgotPassword: true,
    newPassword: password2,
  });
  assert.equal(second.complete.body?.password_reset, true);

  const oldPasswordLogin = await json(await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fawri-device-id": "old-password-probe",
    },
    body: JSON.stringify({ phone: phone2, password: password0 }),
  }));
  assert.equal(oldPasswordLogin.response.status, 401);
  assert.equal(oldPasswordLogin.body?.code, "INVALID_CREDENTIALS");

  const sessionDevice1 = "owner-session-cap-device-1";
  await loginOwner(phone2, password2, sessionDevice1);
  await loginOwner(phone2, password2, sessionDevice1);

  const device1Two = await pool.query(
    `SELECT count(*)::int AS count,
            count(DISTINCT device_fingerprint_hash)::int AS devices
       FROM account_sessions
      WHERE account_id = $1 AND kind = 'admin' AND status = 'active'
        AND idle_expires_at > now() AND absolute_expires_at > now()`,
    [ownerId],
  );
  assert.equal(device1Two.rows[0].count, 2);
  assert.equal(device1Two.rows[0].devices, 1);

  const thirdSameDevice = await json(await fetch(`${baseUrl}/api/auth/admin/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fawri-device-id": sessionDevice1,
    },
    body: JSON.stringify({ phone: phone2, password: password2 }),
  }));
  assert.equal(thirdSameDevice.response.status, 409);
  assert.equal(thirdSameDevice.body?.code, "OWNER_SESSION_LIMIT_REACHED");

  const sessionDevice2 = "owner-session-cap-device-2";
  await loginOwner(phone2, password2, sessionDevice2);
  await loginOwner(phone2, password2, sessionDevice2);

  const liveFour = await pool.query(
    `SELECT count(*)::int AS count,
            count(DISTINCT device_fingerprint_hash)::int AS devices
       FROM account_sessions
      WHERE account_id = $1 AND kind = 'admin' AND status = 'active'
        AND idle_expires_at > now() AND absolute_expires_at > now()`,
    [ownerId],
  );
  assert.equal(liveFour.rows[0].count, 4);
  assert.equal(liveFour.rows[0].devices, 2);
});
