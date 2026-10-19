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
      await client.query("RESET SESSION AUTHORIZATION");
      await client.query(`DROP OWNED BY ${probeRole}`);
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

  await client.query(
    `SELECT set_config('fawri.tenant_id', 'merchant-rls-probe', false)`,
  );
  const predicateProbe = await client.query<{
    own_tenant: boolean;
    other_tenant: boolean;
  }>(
    `SELECT
       public.fawri_tenant_or_audited_admin('merchant-rls-probe') AS own_tenant,
       public.fawri_tenant_or_audited_admin('merchant-other') AS other_tenant`,
  );
  assert.equal(predicateProbe.rows[0]?.own_tenant, true);
  assert.equal(predicateProbe.rows[0]?.other_tenant, false);
  await client.query(`SELECT set_config('fawri.tenant_id', '', false)`);

  await t.test("privileged authenticated login is rejected despite a restricted current role", async () => {
    const identity = (await client.query("SELECT session_user AS login, current_user AS active, (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) AS privileged")).rows[0];
    assert.equal(identity.active, probeRole);
    assert.notEqual(identity.login, probeRole);
    assert.equal(identity.privileged, true, "owned disposable cluster must use its bootstrap role");
    await assert.rejects(() => assertProductionDatabaseRlsReady(productionEnv(), client),
      {code: "PRODUCTION_DATABASE_SESSION_SUPERUSER_FORBIDDEN"});
  });
  await client.query("RESET SESSION AUTHORIZATION");
  await client.query(`SET SESSION AUTHORIZATION ${probeRole}`);

  const readiness = await getProductionDatabaseRlsReadiness(client);

  assert.equal(readiness.roleName, probeRole);
  assert.equal(readiness.superuser, false);
  assert.equal(readiness.bypassRls, false);
  assert.equal(readiness.sessionRoleName, probeRole);
  assert.equal(readiness.sessionSuperuser, false);
  assert.equal(readiness.sessionBypassRls, false);
  assert.deepEqual(readiness.sessionOwnedTables, []);
  assert.deepEqual(readiness.ownedTenantTables, []);
  assert.deepEqual(
    readiness.missingOrUnprotectedTenantTables,
    [],
    "every production tenant table must exist with RLS enabled after the full migration history",
  );

  await assert.doesNotReject(() =>
    assertProductionDatabaseRlsReady(productionEnv(), client),
  );

  // Each change is transactional and rolled back: no customer rows are needed.
  // The runtime must reject schema drift in every licensing/billing table,
  // including domains introduced after the original readiness allowlist and
  // the global capability-only receipt inbox.
  for (const table of [
    "verified_provider_payment_receipts",
    "merchant_cashier_subscriptions",
    "cashier_station_seat_assignments",
    "cashier_billing_orders",
    "cashier_billing_events",
    "cashier_entitlement_applications",
    "cashier_entitlement_audit_events",
    "cashier_device_operation_timeline",
  ]) {
    for (const drift of ["disabled RLS", "runtime ownership"]) {
      await t.test(`${table}: rejects ${drift}`, async () => {
        await client.query("RESET SESSION AUTHORIZATION");
        await client.query("BEGIN");
        try {
          await client.query(drift === "disabled RLS"
            ? `ALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY`
            : `ALTER TABLE public.${table} OWNER TO ${probeRole}`);
          await client.query(`SET SESSION AUTHORIZATION ${probeRole}`);
          const actual = await client.query<{ active: boolean }>(
            "SELECT row_security_active($1::regclass) AS active", [`public.${table}`],
          );
          assert.equal(actual.rows[0]?.active, false);
          const state = await getProductionDatabaseRlsReadiness(client);
          assert.deepEqual(drift === "disabled RLS"
            ? state.missingOrUnprotectedTenantTables : state.ownedTenantTables, [table]);
          await assert.rejects(
            () => assertProductionDatabaseRlsReady(productionEnv(), client),
            { code: drift === "disabled RLS"
              ? "PRODUCTION_DATABASE_TENANT_RLS_REQUIRED"
              : "PRODUCTION_DATABASE_RUNTIME_TABLE_OWNER_FORBIDDEN" },
          );
        } finally {
          await client.query("RESET SESSION AUTHORIZATION");
          await client.query("ROLLBACK");
        }
        await client.query(`SET SESSION AUTHORIZATION ${probeRole}`);
        await assert.doesNotReject(() => assertProductionDatabaseRlsReady(productionEnv(), client));
      });
    }
  }

  const ownerRole = "fawri_rls_owner_probe";
  const middleRole = "fawri_rls_middle_probe";
  for (const scenario of [
    { name: "direct owner", role: ownerRole, grants: [], unsafe: true, rlsActive: false },
    {
      name: "inherited owner without SET ROLE",
      role: probeRole,
      grants: [`GRANT ${ownerRole} TO ${probeRole} WITH INHERIT TRUE, SET FALSE`],
      unsafe: true, rlsActive: false,
    },
    {
      name: "indirect inherited owner",
      role: probeRole,
      grants: [
        `GRANT ${ownerRole} TO ${middleRole} WITH INHERIT TRUE, SET FALSE`,
        `GRANT ${middleRole} TO ${probeRole} WITH INHERIT TRUE, SET FALSE`,
      ],
      unsafe: true, rlsActive: false,
    },
    {
      name: "owner reachable only through SET ROLE",
      role: probeRole,
      grants: [`GRANT ${ownerRole} TO ${probeRole} WITH INHERIT FALSE, SET TRUE`],
      unsafe: true, rlsActive: true,
    },
    {
      name: "membership without inheritance or SET ROLE remains restricted",
      role: probeRole,
      grants: [`GRANT ${ownerRole} TO ${probeRole} WITH INHERIT FALSE, SET FALSE`],
      unsafe: false, rlsActive: true,
    },
  ]) {
    await t.test(scenario.name, async () => {
      await client.query("RESET SESSION AUTHORIZATION");
      await client.query("BEGIN");
      try {
        await client.query(`CREATE ROLE ${ownerRole} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
        await client.query(`CREATE ROLE ${middleRole} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
        await client.query(`GRANT USAGE ON SCHEMA public TO ${ownerRole}`);
        await client.query(`ALTER TABLE public.merchant_channels OWNER TO ${ownerRole}`);
        for (const grant of scenario.grants) await client.query(grant);
        await client.query(`SET SESSION AUTHORIZATION ${scenario.role}`);
        const actualRls = await client.query<{ active: boolean }>(
          "SELECT row_security_active('public.merchant_channels') AS active",
        );
        assert.equal(actualRls.rows[0]?.active, scenario.rlsActive);
        const ownership = await getProductionDatabaseRlsReadiness(client);
        assert.deepEqual(ownership.ownedTenantTables, scenario.unsafe ? ["merchant_channels"] : []);
        if (scenario.unsafe) {
          await assert.rejects(
            () => assertProductionDatabaseRlsReady(productionEnv(), client),
            { code: "PRODUCTION_DATABASE_RUNTIME_TABLE_OWNER_FORBIDDEN" },
          );
        } else {
          await assert.doesNotReject(() => assertProductionDatabaseRlsReady(productionEnv(), client));
        }
      } finally {
        // Roll back ownership and grants together, even when a regression fails.
        await client.query("RESET SESSION AUTHORIZATION");
        await client.query("ROLLBACK");
      }
    });
  }
  for (const kind of ["bypass", "owner"]) {
    await t.test(`authenticated ${kind} role remains unsafe after SET ROLE`, async () => {
      const login = "fawri_session_authority_probe";
      await client.query("RESET SESSION AUTHORIZATION");
      await client.query("BEGIN");
      try {
        await client.query(`CREATE ROLE ${login} NOLOGIN NOSUPERUSER ${kind === "bypass" ? "BYPASSRLS" : "NOBYPASSRLS"}`);
        await client.query(`GRANT ${probeRole} TO ${login} WITH INHERIT FALSE, SET TRUE`);
        if (kind === "owner") await client.query(`ALTER TABLE public.verified_provider_payment_receipts OWNER TO ${login}`);
        await client.query(`SET SESSION AUTHORIZATION ${login}`);
        await client.query(`SET ROLE ${probeRole}`);
        const state = await getProductionDatabaseRlsReadiness(client);
        assert.equal(state.roleName, probeRole);
        assert.equal(state.superuser, false);
        assert.equal(state.bypassRls, false);
        assert.deepEqual(state.ownedTenantTables, []);
        assert.equal(state.sessionRoleName, login);
        assert.equal(state.sessionBypassRls, kind === "bypass");
        assert.deepEqual(state.sessionOwnedTables, kind === "owner" ? ["verified_provider_payment_receipts"] : []);
        await assert.rejects(() => assertProductionDatabaseRlsReady(productionEnv(), client),
          {code: kind === "bypass" ? "PRODUCTION_DATABASE_SESSION_BYPASSRLS_FORBIDDEN" : "PRODUCTION_DATABASE_SESSION_TABLE_OWNER_FORBIDDEN"});
        assert.equal((await client.query("SELECT row_security_active('public.verified_provider_payment_receipts') AS active")).rows[0].active, true);
        await client.query("RESET ROLE");
        assert.equal((await client.query("SELECT row_security_active('public.verified_provider_payment_receipts') AS active")).rows[0].active, false);
      } finally {
        await client.query("RESET SESSION AUTHORIZATION");
        await client.query("ROLLBACK");
      }
      await client.query(`SET SESSION AUTHORIZATION ${probeRole}`);
      await assert.doesNotReject(() => assertProductionDatabaseRlsReady(productionEnv(), client));
    });
  }

  for (const mode of ["direct", "indirect", "inherit-only"]) {
    await t.test(`privileged membership ${mode} readiness`, async () => {
      const privileged = "fawri_reachable_privileged_probe";
      const middle = "fawri_reachable_middle_probe";
      await client.query("RESET SESSION AUTHORIZATION");
      await client.query("BEGIN");
      try {
        await client.query(`CREATE ROLE ${privileged} NOLOGIN NOSUPERUSER BYPASSRLS`);
        await client.query(`CREATE ROLE ${middle} NOLOGIN NOSUPERUSER NOBYPASSRLS`);
        if (mode === "indirect") {
          await client.query(`GRANT ${privileged} TO ${middle} WITH INHERIT FALSE, SET TRUE`);
          await client.query(`GRANT ${middle} TO ${probeRole} WITH INHERIT FALSE, SET TRUE`);
        } else {
          await client.query(`GRANT ${privileged} TO ${probeRole} WITH INHERIT TRUE, SET ${mode === "direct" ? "TRUE" : "FALSE"}`);
        }
        await client.query(`SET SESSION AUTHORIZATION ${probeRole}`);
        const state = await getProductionDatabaseRlsReadiness(client);
        assert.equal(state.sessionBypassRls, false);
        assert.equal(state.bypassRls, false);
        assert.deepEqual(state.sessionOwnedTables, []);
        assert.deepEqual(state.ownedTenantTables, []);
        assert.equal((await client.query("SELECT row_security_active('public.verified_provider_payment_receipts') AS active")).rows[0].active, true);
        assert.deepEqual(state.sessionReachablePrivilegedRoles, mode === "inherit-only" ? [] : [privileged]);
        if (mode === "inherit-only") {
          await assert.doesNotReject(() => assertProductionDatabaseRlsReady(productionEnv(), client));
        } else {
          await assert.rejects(() => assertProductionDatabaseRlsReady(productionEnv(), client),
            {code: "PRODUCTION_DATABASE_PRIVILEGED_ROLE_REACHABLE"});
          await client.query(`SET ROLE ${privileged}`);
          assert.equal((await client.query("SELECT row_security_active('public.verified_provider_payment_receipts') AS active")).rows[0].active, false);
        }
      } finally {
        await client.query("RESET SESSION AUTHORIZATION");
        await client.query("ROLLBACK");
      }
      await client.query(`SET SESSION AUTHORIZATION ${probeRole}`);
      await assert.doesNotReject(() => assertProductionDatabaseRlsReady(productionEnv(), client));
    });
  }


  await t.test("tenant context cannot leak between sequential transactions on the same pooled connection", async () => {
    // The same physical client is reused for both merchants. This is stronger
    // than a source-only assertion about set_config(..., true).
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('fawri.tenant_id', $1, true)", ["merchant-a-isolation-probe"]);
      const tenantA = await client.query<{ own: boolean; foreign: boolean }>(
        "SELECT public.fawri_tenant_or_audited_admin('merchant-a-isolation-probe') AS own, public.fawri_tenant_or_audited_admin('merchant-b-isolation-probe') AS foreign",
      );
      assert.equal(tenantA.rows[0]?.own, true);
      assert.equal(tenantA.rows[0]?.foreign, false);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const afterCommit = await client.query<{ context: string }>(
      "SELECT current_setting('fawri.tenant_id', true) AS context",
    );
    assert.equal(afterCommit.rows[0]?.context || "", "", "merchant A context must not survive commit");
    const unscopedA = await client.query<{ a: boolean; b: boolean }>(
      "SELECT COALESCE(public.fawri_tenant_or_audited_admin('merchant-a-isolation-probe'), false) AS a, COALESCE(public.fawri_tenant_or_audited_admin('merchant-b-isolation-probe'), false) AS b",
    );
    assert.equal(unscopedA.rows[0]?.a, false, "merchant A must not remain authorized after commit");
    assert.equal(unscopedA.rows[0]?.b, false, "merchant B must not be authorized without context");

    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('fawri.tenant_id', $1, true)", ["merchant-b-isolation-probe"]);
      const tenantB = await client.query<{ own: boolean; foreign: boolean }>(
        "SELECT public.fawri_tenant_or_audited_admin('merchant-b-isolation-probe') AS own, public.fawri_tenant_or_audited_admin('merchant-a-isolation-probe') AS foreign",
      );
      assert.equal(tenantB.rows[0]?.own, true);
      assert.equal(tenantB.rows[0]?.foreign, false);
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const afterRollback = await client.query<{ context: string }>(
      "SELECT current_setting('fawri.tenant_id', true) AS context",
    );
    assert.equal(afterRollback.rows[0]?.context || "", "", "merchant B context must not survive rollback");
    const unscopedB = await client.query<{ a: boolean; b: boolean }>(
      "SELECT COALESCE(public.fawri_tenant_or_audited_admin('merchant-a-isolation-probe'), false) AS a, COALESCE(public.fawri_tenant_or_audited_admin('merchant-b-isolation-probe'), false) AS b",
    );
    assert.equal(unscopedB.rows[0]?.a, false, "merchant A must not be authorized after rollback");
    assert.equal(unscopedB.rows[0]?.b, false, "merchant B must not remain authorized after rollback");

    // A fresh transaction on the reused connection starts without either
    // tenant's authority, even before a new tenant context is installed.
    await client.query("BEGIN");
    try {
      const fresh = await client.query<{ a: boolean; b: boolean }>(
        "SELECT COALESCE(public.fawri_tenant_or_audited_admin('merchant-a-isolation-probe'), false) AS a, COALESCE(public.fawri_tenant_or_audited_admin('merchant-b-isolation-probe'), false) AS b",
      );
      assert.equal(fresh.rows[0]?.a, false);
      assert.equal(fresh.rows[0]?.b, false);
    } finally {
      await client.query("ROLLBACK");
    }

  });

});
