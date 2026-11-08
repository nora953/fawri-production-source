/**
 * FT-01: prove three independent actual PostgreSQL LOGINs in an owned PG18
 * GitHub Actions service. This is NOT production role provisioning.
 * No Neon endpoints, company secrets or permanent credentials.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const names = Object.freeze({
  tenant: "fawri_ft01_tenant_disposable",
  auth: "fawri_ft01_auth_disposable",
  operator: "fawri_ft01_operator_disposable",
});
const roleNames = Object.values(names);
const privilegeFunctions = Object.freeze({
  tenant: "fawri_security.allows_merchant(text)",
  auth: "public.fawri_authentication_runtime()",
  scope: "fawri_security.issue_scope(name,integer,bigint,text)",
  operator: "public.fawri_issue_admin_directory_audit(text,text,text)",
});

function guardTarget() {
  assert.equal(process.argv.length, 2, "FT01_NO_ARGS");
  assert.equal(process.env.GITHUB_ACTIONS, "true", "FT01_CI_ONLY");
  assert.equal(process.env.GITHUB_REPOSITORY,
    "nora953/fawri-production-source", "FT01_REPO_MISMATCH");
  assert.equal(process.env.FAWRI_ALLOW_FT01_DISPOSABLE_THREE_LOGIN_REHEARSAL,
    "1", "FT01_EXPLICIT_LOCAL_FLAG_REQUIRED");
  const parsed = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(parsed.protocol, "postgresql:", "FT01_POSTGRES_ONLY");
  assert.equal(parsed.hostname, "127.0.0.1", "FT01_LOOPBACK_ONLY");
  assert.equal(parsed.port, "5432", "FT01_PORT_MISMATCH");
  assert.equal(parsed.pathname, "/fawri_ci", "FT01_TEST_DB_ONLY");
  assert.equal(decodeURIComponent(parsed.username), "fawri_ci",
    "FT01_TEST_OWNER_ONLY");
  assert.equal(parsed.search, "", "FT01_NO_CONNECTION_OPTIONS");
  assert.equal(parsed.hash, "", "FT01_NO_CONNECTION_FRAGMENT");
  return parsed;
}

async function makeRoleAdmin(client) {
  const state = (await client.query(`SELECT
    current_database() AS database_name,
    session_user AS login,
    current_setting('server_version_num')::int / 10000 AS pg_major,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    (SELECT count(*)::int FROM public.notifications) AS notifications,
    (SELECT count(*)::int FROM pg_roles WHERE rolname=ANY($1::text[])) AS preexisting_roles
  `, [roleNames])).rows[0];
  assert.deepEqual(state, {
    database_name: "fawri_ci", login: "fawri_ci", pg_major: 18,
    migrations: 53, notifications: 0, preexisting_roles: 0,
  }, "FT01_CANONICAL_EMPTY_LOCAL_PRECONDITIONS");
}

function roleAttributes(role) {
  assert.ok(roleNames.includes(role), "FT01_UNREVIEWED_ROLE");
  return `CREATE ROLE "${role}" LOGIN NOINHERIT NOSUPERUSER
    NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    CONNECTION LIMIT 2 PASSWORD`;
}

async function setup(client, passwords) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    for (const name of roleNames) {
      // Random generated ephemeral hex, *never* committed or logged.
      assert.match(passwords[name], /^[a-f0-9]{64}$/);
      await client.query(`${roleAttributes(name)} '${passwords[name]}'`);
    }
    await client.query(`GRANT CONNECT ON DATABASE fawri_ci TO
      "${names.tenant}", "${names.auth}", "${names.operator}"`);
    await client.query(`GRANT USAGE ON SCHEMA public TO
      "${names.tenant}", "${names.auth}", "${names.operator}"`);
    await client.query(`GRANT USAGE ON SCHEMA fawri_security TO
      "${names.tenant}", "${names.auth}"`);

    // Only a bounded previously reviewed capability sample, not an
    // exhaustive production privilege or business-operation grant set.
    await client.query(`GRANT EXECUTE ON FUNCTION
      fawri_security.allows_merchant(text) TO "${names.tenant}"`);
    await client.query(`GRANT SELECT ON public.notifications TO "${names.tenant}"`);

    await client.query(`GRANT EXECUTE ON FUNCTION
      public.fawri_authentication_runtime(),
      fawri_security.issue_scope(name,integer,bigint,text)
      TO "${names.auth}"`);
    await client.query(`GRANT SELECT ON public.account_sessions TO "${names.auth}"`);

    await client.query(`GRANT EXECUTE ON FUNCTION
      public.fawri_issue_admin_directory_audit(text,text,text)
      TO "${names.operator}"`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function verifyActualLogins(parsed, passwords) {
  const capabilities = {};
  for (const [kind, name] of Object.entries(names)) {
    const c = new Client({
      host: parsed.hostname,
      port: Number(parsed.port),
      database: "fawri_ci",
      user: name,
      password: passwords[name],
      ssl: false,
      connectionTimeoutMillis: 3000,
    });
    await c.connect();
    try {
      const row = (await c.query(`
        SELECT session_user AS session_login, current_user AS active_login,
               current_database() AS database_name, r.rolcanlogin AS can_login,
               r.rolinherit AS can_inherit, r.rolsuper AS superuser,
               r.rolbypassrls AS bypass_rls, r.rolcreatedb AS create_db,
               r.rolcreaterole AS create_role, r.rolreplication AS replication,
               has_schema_privilege(session_user,'public','CREATE') AS schema_create,
               has_function_privilege(session_user,
                 'public.fawri_authentication_runtime()', 'EXECUTE') AS auth_marker,
               has_function_privilege(session_user,
                 'public.fawri_issue_admin_directory_audit(text,text,text)',
                 'EXECUTE') AS operator_issuer
          FROM pg_roles r WHERE r.rolname=session_user
      `)).rows[0];
      assert.deepEqual(row, {
        session_login: name, active_login: name, database_name: "fawri_ci",
        can_login: true, can_inherit: false, superuser: false,
        bypass_rls: false, create_db: false, create_role: false,
        replication: false, schema_create: false,
        auth_marker: kind === "auth",
        operator_issuer: kind === "operator",
      }, `FT01_${kind.toUpperCase()}_LOGIN_OR_CAPABILITY_MISMATCH`);
      if (kind === "tenant") {
        const q = await c.query("SELECT count(*)::int AS n FROM public.notifications");
        assert.equal(q.rows[0]?.n, 0, "FT01_TENANT_NO_UNSCOPED_ROWS");
      }
      capabilities[kind] = true;
    } finally {
      await c.end();
    }
  }
  return capabilities;
}

async function verifyAdminMatrix(client) {
  for (const [kind, name] of Object.entries(names)) {
    const result = await client.query(`SELECT
      has_function_privilege($1::text, $2::text, 'EXECUTE') AS tenant_cap,
      has_function_privilege($1::text, $3::text, 'EXECUTE') AS auth_cap,
      has_function_privilege($1::text, $4::text, 'EXECUTE') AS issuer_cap,
      has_function_privilege($1::text, $5::text, 'EXECUTE') AS operator_cap,
      has_table_privilege($1::text, 'public.notifications',
        'SELECT,INSERT,UPDATE,DELETE') AS data_cap,
      EXISTS(SELECT 1 FROM pg_auth_members m
        WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS any_membership
      `, [
        name, privilegeFunctions.tenant, privilegeFunctions.auth,
        privilegeFunctions.scope, privilegeFunctions.operator,
      ]);
    assert.deepEqual(result.rows[0], {
      tenant_cap: kind === "tenant",
      auth_cap: kind === "auth",
      issuer_cap: kind === "auth",
      operator_cap: kind === "operator",
      data_cap: false, any_membership: false,
    }, `FT01_${kind.toUpperCase()}_PERMISSION_SEPARATION`);
  }
}

async function cleanup(client) {
  for (const role of [...roleNames].reverse()) {
    await client.query(`DROP OWNED BY "${role}"`);
    await client.query(`DROP ROLE "${role}"`);
  }
  const q = await client.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname=ANY($1::text[])",[roleNames]);
  assert.equal(q.rows[0]?.n,0,"FT01_ROLE_CLEANUP_REQUIRED");
}

async function main() {
  const target = guardTarget();
  const passwordByRole = Object.fromEntries(roleNames.map(r => [r,randomBytes(32).toString("hex")]));
  const client = new Client({ connectionString: process.env.DATABASE_URL,ssl:false,connectionTimeoutMillis:3000 });
  await client.connect();
  let configured = false;
  try {
    await makeRoleAdmin(client);
    await setup(client,passwordByRole);
    configured = true;
    await verifyAdminMatrix(client);
    const proven = await verifyActualLogins(target,passwordByRole);
    assert.deepEqual(proven,{tenant:true,auth:true,operator:true});
    console.log("FT01_PG18_THREE_INDEPENDENT_AUTHENTICATED_NONPRIVILEGED_LOGINS_PASS");
  } finally {
    if (configured) await cleanup(client);
    await client.end();
    // Neither values nor credential-bearing URLs are emitted.
  }
}

await main();
