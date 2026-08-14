import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { pool } from "@workspace/db";
import {
  assertProductionOwnerAdminReady,
  getOwnerAdminReadiness,
  OwnerAdminProvisioningError,
  provisionOwnerAdminPostgres,
} from "../src/services/postgresOwnerAdminProvisioning";

function productionGateEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    FAWRI_PRODUCTION_RELEASE_GATE: "required",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
  };
}

async function unusedPhone(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0");
    const phone = `07${suffix}`;
    const result = await pool.query(
      "SELECT 1 FROM accounts WHERE phone = $1 LIMIT 1",
      [phone],
    );
    if (result.rowCount === 0) return phone;
  }
  throw new Error("unable to reserve unused test phone");
}

test("production owner readiness is inert until release gate is required", async () => {
  let queried = false;
  await assertProductionOwnerAdminReady(
    { NODE_ENV: "production" },
    {
      async query() {
        queried = true;
        throw new Error("query must not run");
      },
    },
  );
  assert.equal(queried, false);
});

test("owner administrator provisions once and gates production readiness on PostgreSQL", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");

  const originalAuthority = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
  let createdAdminId = "";

  t.after(async () => {
    if (createdAdminId) {
      await pool.query("DELETE FROM accounts WHERE id = $1", [createdAdminId]);
    }
    if (originalAuthority === undefined) {
      delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
    } else {
      process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = originalAuthority;
    }
    await pool.end();
  });

  const before = await getOwnerAdminReadiness(pool);
  if (before.ownerCount !== 0) {
    t.skip("owner provisioning proof requires an isolated database without a pre-existing owner_admin");
    return;
  }

  const phone = await unusedPhone();
  const password = "OwnerProof9!";
  const provisioned = await provisionOwnerAdminPostgres({
    displayName: "Owner Provisioning Proof",
    phone,
    password,
    language: "en",
  });
  createdAdminId = provisioned.adminId;

  assert.equal(provisioned.phone, phone);
  assert.equal(provisioned.displayName, "Owner Provisioning Proof");
  assert.equal(provisioned.language, "en");

  const stored = await pool.query<{
    id: string;
    kind: string;
    phone: string;
    password_hash: string;
    state: string;
    phone_verified: boolean;
    role: string;
    enabled: boolean;
    must_change_password: boolean;
  }>(
    `SELECT a.id, a.kind, a.phone, a.password_hash, a.state, a.phone_verified,
            p.role, p.enabled, p.must_change_password
       FROM accounts a
       JOIN admin_profiles p ON p.account_id = a.id
      WHERE a.id = $1`,
    [createdAdminId],
  );
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].kind, "admin");
  assert.equal(stored.rows[0].phone, phone);
  assert.equal(stored.rows[0].state, "active");
  assert.equal(stored.rows[0].phone_verified, true);
  assert.equal(stored.rows[0].role, "owner_admin");
  assert.equal(stored.rows[0].enabled, true);
  assert.equal(stored.rows[0].must_change_password, false);
  assert.notEqual(stored.rows[0].password_hash, password);
  assert.match(stored.rows[0].password_hash, /^sha256\$v2\$scrypt\$/);

  assert.deepEqual(await getOwnerAdminReadiness(pool), {
    ownerCount: 1,
    usableOwnerCount: 1,
  });
  await assert.doesNotReject(() =>
    assertProductionOwnerAdminReady(productionGateEnv(), pool),
  );

  await assert.rejects(
    () =>
      provisionOwnerAdminPostgres({
        displayName: "Second Owner",
        phone: "07888888888",
        password: "SecondOwner9!",
        language: "ar",
      }),
    (error: unknown) => {
      assert.ok(error instanceof OwnerAdminProvisioningError);
      assert.equal(error.code, "OWNER_ADMIN_ALREADY_PROVISIONED");
      return true;
    },
  );

  await pool.query(
    "UPDATE admin_profiles SET enabled = FALSE, updated_at = now() WHERE id = $1",
    [createdAdminId],
  );
  assert.deepEqual(await getOwnerAdminReadiness(pool), {
    ownerCount: 1,
    usableOwnerCount: 0,
  });
  await assert.rejects(
    () => assertProductionOwnerAdminReady(productionGateEnv(), pool),
    (error: unknown) => {
      assert.ok(error instanceof OwnerAdminProvisioningError);
      assert.equal(error.code, "PRODUCTION_OWNER_ADMIN_NOT_READY");
      return true;
    },
  );
});
