import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";

process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
process.env.FAWRI_AUTH_SECURITY_SECRET =
  "otp-concurrency-proof-secret-with-more-than-thirty-two-characters";
process.env.AUTH_OTP_RESEND_MS = "60000";

const authSecurity = await import(
  "../src/services/postgresMerchantAuthSecurityAuthority.js"
);

test("concurrent OTP issuance leaves exactly one live challenge and preserves single-use verification", async (t) => {
  const connectionString = String(process.env.DATABASE_URL || "");
  assert.ok(connectionString, "DATABASE_URL is required");
  const parsed = new URL(connectionString);
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "OTP concurrency proof only permits local PostgreSQL",
  );
  assert.equal(
    parsed.pathname.slice(1),
    "fawri_ci",
    "OTP concurrency proof only permits the fawri_ci database",
  );

  const startedAt = new Date();
  const triggerName = "fawri_test_delay_otp_insert";
  const functionName = "fawri_test_delay_otp_insert_fn";
  const target = `+964799${Date.now().toString().slice(-8)}`;
  const ip = "198.51.100.77";

  await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON auth_otp_challenges`);
  await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
  await pool.query(`
    CREATE FUNCTION ${functionName}()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM pg_sleep(0.35);
      RETURN NEW;
    END;
    $$
  `);
  await pool.query(`
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON auth_otp_challenges
    FOR EACH ROW EXECUTE FUNCTION ${functionName}()
  `);

  t.after(async () => {
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON auth_otp_challenges`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    await pool.query(
      `DELETE FROM auth_otp_challenges
        WHERE purpose = 'password_reset'
          AND created_at >= $1`,
      [startedAt],
    );
  });

  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      authSecurity.issueMerchantOtpChallengeAuthoritative({
        target,
        purpose: "password_reset",
        ip,
      }),
    ),
  );

  const fulfilled = attempts.filter(
    (item): item is PromiseFulfilledResult<Awaited<
      ReturnType<typeof authSecurity.issueMerchantOtpChallengeAuthoritative>
    >> => item.status === "fulfilled",
  );
  const rejected = attempts.filter(
    (item): item is PromiseRejectedResult => item.status === "rejected",
  );

  assert.equal(
    fulfilled.length,
    1,
    "only one concurrent issuance may create a live OTP challenge",
  );
  assert.equal(rejected.length, 7);
  for (const item of rejected) {
    assert.equal(
      (item.reason as { code?: string }).code,
      "OTP_RESEND_COOLDOWN",
      "racing issuers must observe the committed cooldown instead of creating another challenge",
    );
  }

  const rows = await pool.query<{ id: string; used_at: Date | null; revoked_at: Date | null }>(
    `SELECT id, used_at, revoked_at
       FROM auth_otp_challenges
      WHERE purpose = 'password_reset'
        AND created_at >= $1
      ORDER BY created_at, id`,
    [startedAt],
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0].id, fulfilled[0].value.challengeId);
  assert.equal(rows.rows[0].used_at, null);
  assert.equal(rows.rows[0].revoked_at, null);

  const firstVerification =
    await authSecurity.verifyMerchantOtpChallengeAuthoritative({
      challengeId: fulfilled[0].value.challengeId,
      target,
      purpose: "password_reset",
      code: fulfilled[0].value.code,
      ip,
    });
  assert.equal(firstVerification, "verified");

  const replayVerification =
    await authSecurity.verifyMerchantOtpChallengeAuthoritative({
      challengeId: fulfilled[0].value.challengeId,
      target,
      purpose: "password_reset",
      code: fulfilled[0].value.code,
      ip,
    });
  assert.equal(replayVerification, "used");
});
