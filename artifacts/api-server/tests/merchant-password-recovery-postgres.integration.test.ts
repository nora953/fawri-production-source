import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const DATABASE_URL = String(process.env.DATABASE_URL || "");
assert.ok(DATABASE_URL, "DATABASE_URL is required");
const parsedDatabaseUrl = new URL(DATABASE_URL);
assert.ok(
  parsedDatabaseUrl.hostname === "127.0.0.1" ||
    parsedDatabaseUrl.hostname === "localhost",
  "merchant password recovery proof only permits a local database",
);
assert.equal(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
  "fawri_ci",
  "merchant password recovery proof only permits the fawri_ci database",
);

const PASSWORD_SALT = "merchant-password-recovery-proof-salt";
const AUTH_SECRET =
  "merchant-password-recovery-proof-security-secret-at-least-32-characters";
const merchantId = "merchant-password-recovery-proof-000000000001";
const phone = "+9647977777111";
const oldPassword = "MerchantOld9!";
const password1 = "MerchantNew9!";
const password2 = "MerchantNext9!";

Object.assign(process.env, {
  NODE_ENV: "test",
  FAWRI_PASSWORD_SALT: PASSWORD_SALT,
  FAWRI_AUTH_SECURITY_SECRET: AUTH_SECRET,
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
  FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY: "required",
  AUTH_ALLOW_DEV_OTP_BYPASS: "true",
  AUTH_INCLUDE_DEV_CODE: "true",
  AUTH_OTP_RESEND_MS: "1",
});

const { pool } = await import("@workspace/db");
const { hashPassword, verifyPassword } =
  await import("../src/services/authPasswordService.js");
const { authPostgresSessionAuthority } =
  await import("../src/services/authPostgresSessionAuthority.js");

async function json(response: Response) {
  return {
    response,
    body: (await response.json().catch(() => null)) as any,
  };
}

function cookieFrom(response: Response, name: string): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
  const prefix = `${name}=`;
  const match = values.find((entry) =>
    entry.split(";", 1)[0].startsWith(prefix),
  );
  assert.ok(match, `${name} cookie is required`);
  return match.split(";", 1)[0];
}

async function cleanup(): Promise<void> {
  await pool.query(
    "DELETE FROM login_attempts WHERE account_id = $1",
    [merchantId],
  );
  await pool.query(
    "DELETE FROM auth_otp_challenges WHERE account_id = $1",
    [merchantId],
  );
  await pool.query("DELETE FROM accounts WHERE id = $1 OR phone = $2", [
    merchantId,
    phone,
  ]);
}

async function seedMerchant(): Promise<void> {
  await cleanup();

  await pool.query(
    `INSERT INTO accounts (
       id, kind, phone, password_hash, state, language,
       phone_verified, phone_verified_at,
       password_version, security_version, session_version,
       created_at, updated_at
     ) VALUES (
       $1, 'merchant', $2, $3, 'active', 'en',
       TRUE, now(), 1, 1, 1, now(), now()
     )`,
    [merchantId, phone, hashPassword(oldPassword)],
  );

  await pool.query(
    `INSERT INTO merchants (
       id, account_id, profile_kind, owner_name, store_name, activity_type,
       status, account_status, onboarding_status, trial_status, signup_source,
       warning_stage, products_read_only, metadata, created_at, updated_at
     ) VALUES (
       $1, $1, 'merchant', 'Recovery Proof Owner',
       'Recovery Proof Store', 'retail',
       'approved', 'approved', 'channel_connected', 'eligible', 'direct',
       0, FALSE, '{}'::jsonb, now(), now()
     )`,
    [merchantId],
  );
}

test(
  "merchant password recovery proof rejects tampering/replay and serializes concurrent resets",
  async (t) => {
    await seedMerchant();

    const runtimeDirectory = await mkdtemp(
      path.join(os.tmpdir(), "fawri-merchant-password-recovery-"),
    );
    const dataDirectory = path.join(runtimeDirectory, "data");
    await mkdir(dataDirectory, { recursive: true });
    process.env.FAWRI_DATA_DIR = dataDirectory;

    const [
      { default: express },
      { default: cookieParser },
      { default: authSecurityRouter },
    ] = await Promise.all([
      import("express"),
      import("cookie-parser"),
      import("../src/routes/auth-security.js"),
    ]);

    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use("/api/auth", authSecurityRouter);

    const server = await new Promise<ReturnType<typeof app.listen>>(
      (resolve, reject) => {
        const listening = app.listen(0, "127.0.0.1", () =>
          resolve(listening),
        );
        listening.once("error", reject);
      },
    );

    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    t.after(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await cleanup();
      await pool.end();
      await rm(runtimeDirectory, { recursive: true, force: true });
    });

    async function recoveryProof(): Promise<string> {
      const requested = await json(
        await fetch(`${baseUrl}/api/auth/password-reset/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        }),
      );

      assert.equal(requested.response.status, 202);
      assert.match(String(requested.body?.challenge_id || ""), /.+/);
      assert.match(String(requested.body?.devCode || ""), /^\d{6}$/);

      const verified = await json(
        await fetch(`${baseUrl}/api/auth/password-reset/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            challenge_id: requested.body.challenge_id,
            code: requested.body.devCode,
          }),
        }),
      );

      assert.equal(verified.response.status, 200);
      assert.equal(verified.body?.ok, true);

      return cookieFrom(
        verified.response,
        "fawri_merchant_password_recovery",
      );
    }

    async function confirm(
      cookie: string,
      password: string,
    ): Promise<{ response: Response; body: any }> {
      return json(
        await fetch(`${baseUrl}/api/auth/password-reset/confirm`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            new_password: password,
            confirm_password: password,
          }),
        }),
      );
    }

    const activeSession =
      await authPostgresSessionAuthority.issueSession({
        accountId: merchantId,
        accountKind: "merchant",
        tenantId: merchantId,
        deviceLabel: "Recovery proof pre-reset session",
      });

    assert.ok(activeSession.token);

    const tamperProof = await recoveryProof();
    const [cookieName, cookieValue] = tamperProof.split("=", 2);
    assert.ok(cookieName);
    assert.ok(cookieValue);

    const last = cookieValue.at(-1) || "A";
    const tampered =
      `${cookieName}=` +
      cookieValue.slice(0, -1) +
      (last === "A" ? "B" : "A");

    const tamperedResult = await confirm(tampered, password1);
    assert.equal(tamperedResult.response.status, 401);
    assert.equal(
      tamperedResult.body?.code,
      "RECOVERY_CONFIRMATION_INVALID",
    );

    let account = await pool.query(
      `SELECT password_hash, password_version, session_version,
              security_version
         FROM accounts
        WHERE id = $1`,
      [merchantId],
    );

    assert.equal(account.rows[0].password_version, 1);
    assert.equal(account.rows[0].session_version, 1);
    assert.equal(account.rows[0].security_version, 1);
    assert.equal(
      verifyPassword(oldPassword, account.rows[0].password_hash),
      true,
    );

    const validProof = await recoveryProof();
    const first = await confirm(validProof, password1);

    assert.equal(first.response.status, 200);
    assert.equal(first.body?.ok, true);
    assert.equal(first.body?.reauthentication_required, true);

    account = await pool.query(
      `SELECT password_hash, password_version, session_version,
              security_version
         FROM accounts
        WHERE id = $1`,
      [merchantId],
    );

    assert.equal(account.rows[0].password_version, 2);
    assert.equal(account.rows[0].session_version, 2);
    assert.equal(account.rows[0].security_version, 2);
    assert.equal(
      verifyPassword(oldPassword, account.rows[0].password_hash),
      false,
    );
    assert.equal(
      verifyPassword(password1, account.rows[0].password_hash),
      true,
    );

    const revoked = await pool.query(
      `SELECT status, revoke_reason, revoked_at
         FROM account_sessions
        WHERE account_id = $1`,
      [merchantId],
    );

    assert.ok(revoked.rowCount && revoked.rowCount >= 1);
    assert.ok(
      revoked.rows.every(
        (row) =>
          row.status === "revoked" &&
          row.revoke_reason === "password_reset" &&
          row.revoked_at,
      ),
    );

    const replay = await confirm(validProof, password2);
    assert.equal(replay.response.status, 400);
    assert.equal(replay.body?.code, "RECOVERY_CONFIRMATION_INVALID");

    const concurrentProof = await recoveryProof();

    const [left, right] = await Promise.all([
      confirm(concurrentProof, password2),
      confirm(concurrentProof, password2),
    ]);

    const statuses = [left.response.status, right.response.status].sort();
    assert.deepEqual(statuses, [200, 400]);

    const successful = left.response.status === 200 ? left : right;
    const rejected = left.response.status === 400 ? left : right;

    assert.equal(successful.body?.ok, true);
    assert.equal(successful.body?.reauthentication_required, true);
    assert.equal(rejected.body?.code, "RECOVERY_CONFIRMATION_INVALID");

    account = await pool.query(
      `SELECT password_hash, password_version, session_version,
              security_version
         FROM accounts
        WHERE id = $1`,
      [merchantId],
    );

    assert.equal(account.rows[0].password_version, 3);
    assert.equal(account.rows[0].session_version, 3);
    assert.equal(account.rows[0].security_version, 3);
    assert.equal(
      verifyPassword(password1, account.rows[0].password_hash),
      false,
    );
    assert.equal(
      verifyPassword(password2, account.rows[0].password_hash),
      true,
    );
  },
);
