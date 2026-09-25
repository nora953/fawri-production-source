import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "@workspace/db";
import {
  assertProductionDatabaseRlsReady,
  getProductionDatabaseRlsReadiness,
} from "../src/services/postgresRuntimeRlsSecurity";

function productionEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    FAWRI_DEPLOYMENT_MODE: "production",
    FAWRI_OPERATIONAL_POSTGRES_AUTHORITY: "required",
  };
}

test("disposable PostgreSQL proves tenant RLS under a restricted non-owner runtime role", async (t) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const client = await pool.connect();
  const probeRole = "fawri_runtime_rls_probe";

  t.after(async () => {
    try {
      await client.query("RESET ROLE");
      await client.query(`DROP ROLE IF EXISTS ${probeRole}`);
    } finally {
      client.release();
      await pool.end();
    }
  });

  await client.query(`DROP ROLE IF EXISTS ${probeRole}`);
  await client.query(
    `CREATE ROLE ${probeRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
  );

  await client.query(`GRANT USAGE ON SCHEMA public TO ${probeRole}`);
  await client.query(`GRANT SELECT ON TABLE public.merchant_channels TO ${probeRole}`);

  await client.query(`SET ROLE ${probeRole}`);

  const auditPrivilege = await client.query<{ allowed: boolean }>(
    `SELECT has_table_privilege(current_user, 'public.database_admin_access_audits', 'SELECT') AS allowed`,
  );
  assert.equal(
    auditPrivilege.rows[0]?.allowed,
    false,
    "runtime role must not need direct SELECT on admin audit records",
  );

  const rlsProbe = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM public.merchant_channels`,
  );
  assert.equal(
    Number(rlsProbe.rows[0]?.count || 0),
    0,
    "tenant RLS predicate must evaluate safely without audit-table SELECT privilege",
  );

  const readiness = await getProductionDatabaseRlsReadiness(client);

  assert.equal(readiness.roleName, probeRole);
  assert.equal(readiness.superuser, false);
  assert.equal(readiness.bypassRls, false);
  assert.deepEqual(readiness.ownedTenantTables, []);
  assert.deepEqual(
    readiness.missingOrUnprotectedTenantTables,
    [],
    "every production tenant table must exist with RLS enabled after the full migration history",
  );

  await assert.doesNotReject(() =>
    assertProductionDatabaseRlsReady(productionEnv(), client),
  );
});
