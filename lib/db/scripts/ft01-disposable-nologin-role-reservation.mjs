/**
 * Local-only contract test for an explicitly HELD, never-executed-on-Neon
 * transactional four NOLOGIN role-reservation SQL proposal.
 * Creates a disposable PG18 database literally named "fawri" to exercise the
 * *positive* branch of exact target guards, and always cleans it up.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const names = [
  "fawri_restricted_runtime", "fawri_auth_issuer", "fawri_operator_issuer", "fawri_cashier_retirement_writer",
];
const sql = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-FOUR-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql",
  ),
  "utf8",
);

function requireDisposablePg18() {
  assert.equal(process.argv.length, 2, "FT01_NO_ARGUMENTS");
  assert.equal(process.env.GITHUB_ACTIONS, "true", "FT01_GITHUB_ONLY");
  assert.equal(process.env.GITHUB_REPOSITORY, "nora953/fawri-production-source");
  assert.equal(process.env.FAWRI_ALLOW_FT01_DISPOSABLE_NOLOGIN_ADMISSION, "1");
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "5432");
  assert.equal(url.pathname, "/fawri_ci");
  assert.equal(decodeURIComponent(url.username), "fawri_ci");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  return url;
}

async function main() {
  const target = requireDisposablePg18();
  const admin = new Client({
    connectionString: target.toString(), ssl: false, connectionTimeoutMillis: 3000,
  });
  const password = randomBytes(32).toString("hex");
  const fawriUrl = new URL(target.toString());
  fawriUrl.username = "fawri_owner";
  fawriUrl.password = password;
  fawriUrl.pathname = "/fawri";
  const owner = new Client({
    connectionString: fawriUrl.toString(), ssl: false, connectionTimeoutMillis: 3000,
  });
  let ownerRoleCreated = false;
  let databaseCreated = false;
  let rolesCreated = false;
  let extraMemberCreated = false;
  let ownerConnected = false;
  await admin.connect();
  try {
    const pg18 = await admin.query(`SELECT
      current_setting('server_version_num')::int / 10000 AS major,
      current_database() AS database_name,
      (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
      (SELECT count(*)::int FROM pg_roles WHERE rolname=ANY($1::text[])) AS roles_exist,
      (SELECT count(*)::int FROM pg_roles WHERE rolname='fawri_owner') AS owner_exists,
      (SELECT count(*)::int FROM pg_database WHERE datname='fawri') AS target_exists`,
      [names]);
    assert.deepEqual(pg18.rows[0], {
      major: 18, database_name: "fawri_ci", migrations: 53,
      roles_exist: 0, owner_exists: 0, target_exists: 0,
    }, "FT01_POSITIVE_DISPOSABLE_PREIMAGE");

    // This simulates new Neon owner's *observed attributes*, NOT a Neon
    // provider identity or a permission to run SQL on the hosted project.
    await admin.query(`CREATE ROLE fawri_owner LOGIN NOSUPERUSER CREATEROLE
      BYPASSRLS CREATEDB REPLICATION PASSWORD '${password}'`);
    ownerRoleCreated = true;
    await admin.query("CREATE DATABASE fawri OWNER fawri_owner");
    databaseCreated = true;
    await owner.connect();
    ownerConnected = true;

    await owner.query(sql);
    rolesCreated = true;
    const confirmed = (await owner.query(`SELECT rolname, rolcanlogin,
      rolinherit, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
      rolreplication FROM pg_catalog.pg_roles
      WHERE rolname=ANY($1::text[]) ORDER BY rolname`, [names])).rows;
    assert.equal(confirmed.length, 4, "FT01_CREATED_FOUR_NOLOGIN");
    assert.deepEqual(confirmed.map(r => r.rolname), [...names].sort());
    assert.ok(confirmed.every(r => Object.entries(r).every(([k,v]) =>
      k === "rolname" || v === false)), "FT01_ROLE_ATTRIBUTES_PRIVILEGED");
    // PG18 automatically creates an ADMIN-only membership for the CREATEROLE
    // account on EACH new role. An outbound-only membership check is incomplete.
    // Exactly these 4 fawri_owner ADMIN edges are allowed; no SET, INHERIT,
    // other grantees, or outbound memberships are permitted.
    const memberships = await owner.query(`SELECT
      r.rolname AS granted_role, u.rolname AS member_role,
      m.admin_option, m.inherit_option, m.set_option
      FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
      JOIN pg_catalog.pg_roles u ON u.oid=m.member
      WHERE r.rolname=ANY($1::text[]) OR u.rolname=ANY($1::text[])
      ORDER BY r.rolname, u.rolname`,[names]);
    assert.deepEqual(memberships.rows,names.sort().map(name=>({
      granted_role:name, member_role:"fawri_owner",
      admin_option:true, inherit_option:false, set_option:false,
    })),"FT01_EXACT_CREATOR_ADMIN_ONLY_MEMBERSHIPS");

    // Adversarial negative: the same committed postimage MUST detect an extra
    // recipient with SET authority. All roles and grants exist only on CI's
    // disposable PostgreSQL18 server, never on Neon.
    await admin.query("CREATE ROLE fawri_ft01_unapproved_member NOLOGIN NOINHERIT");
    extraMemberCreated = true;
    await owner.query(`GRANT fawri_restricted_runtime TO fawri_ft01_unapproved_member
      WITH SET TRUE, INHERIT FALSE`);
    const postimage = sql.match(/DO \$ft01_postimage\$[\s\S]*?\$ft01_postimage\$;/)?.[0];
    assert.ok(postimage,"FT01_POSTIMAGE_NOT_FOUND");
    await assert.rejects(
      () => owner.query(postimage),
      e => String(e.message).includes("FT01_FOUR_NOLOGIN_ROLE_POSTIMAGE_UNSAFE"),
      "FT01_UNAPPROVED_MEMBERSHIP_MUST_FAIL",
    );
    await owner.query("REVOKE fawri_restricted_runtime FROM fawri_ft01_unapproved_member");
    await owner.query(postimage);
    console.log("FT01_FOUR_NOLOGIN_EXTRA_SET_MEMBERSHIP_DENIAL_PASS");

    await assert.rejects(
      () => owner.query(sql),
      e => String(e.message).includes("FT01_NEW_TARGET_PREIMAGE_CHANGED"),
      "FT01_SECOND_RUN_MUST_REFUSE",
    );
    await owner.query("ROLLBACK");
    await assert.rejects(
      () => admin.query(sql),
      e => String(e.message).includes("FT01_WRONG_NEW_TARGET_OR_ROLE"),
      "FT01_WRONG_DB_MUST_REFUSE",
    );
    await admin.query("ROLLBACK");
    console.log("FT01_FOUR_NOLOGIN_HELD_NEW_TARGET_SQL_LOCAL_POSITIVE_NEGATIVE_PASS");
  } finally {
    if(ownerConnected) await owner.end();
    if (rolesCreated) await admin.query(
      `DROP ROLE fawri_restricted_runtime, fawri_auth_issuer, fawri_operator_issuer, fawri_cashier_retirement_writer`);
    if (extraMemberCreated) await admin.query("DROP ROLE fawri_ft01_unapproved_member");
    if (databaseCreated) await admin.query("DROP DATABASE fawri WITH (FORCE)");
    if (ownerRoleCreated) await admin.query("DROP ROLE fawri_owner");
    await admin.end();
  }
}
await main();
