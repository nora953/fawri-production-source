import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
const { pool } = await import('@workspace/db');
const phase = process.env.FAWRI_AUDIT_RESTORE_PHASE;
assert.ok(['seed', 'verify'].includes(phase), 'restore phase is explicitly required');
const role = 'fawri_audit_restore_runtime';
const ids = ['audit-restore-merchant-a', 'audit-restore-merchant-b'];

test(`full committed schema restore ${phase}: data, policies, ACLs and restricted tenant reads`, async t => {
  t.after(() => pool.end());
  if (phase === 'seed') {
    await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await pool.query(`GRANT SELECT ON merchant_channels TO ${role}`);
    for (const [index, id] of ids.entries()) {
      await pool.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [id, `+19990000000${index + 1}`]);
      await pool.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [id]);
      await pool.query("INSERT INTO merchant_channels(id,merchant_id,platform,status,page_id) VALUES($1,$2,'messenger','connected',$3)", [`channel-${id}`, id, `page-${id}`]);
    }
  }
  const tables = (await pool.query("SELECT relname, relrowsecurity, relforcerowsecurity, coalesce(relacl,acldefault('r',relowner))::text AS acl FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relkind IN ('r','p') ORDER BY relname")).rows;
  const policies = (await pool.query("SELECT c.relname, polname, polcmd, polpermissive, pg_get_expr(polqual,polrelid) AS predicate, pg_get_expr(polwithcheck,polrelid) AS check_predicate FROM pg_policy JOIN pg_class c ON c.oid=polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,polname")).rows;
  const functions = (await pool.query("SELECT proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS definition, coalesce(proacl,acldefault('f',proowner))::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='public' AND prokind='f' ORDER BY proname,args")).rows;
  const constraints = (await pool.query("SELECT c.relname, conname, contype, convalidated, condeferrable, condeferred, pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,conname")).rows;
  // pg_dump reparses CHECK DDL and PostgreSQL flattens associative leading AND
  // groups. Round-trip both sides through the same native parser; never strip
  // arbitrary parentheses or discard constraint expressions from comparison.
  const normalizer = await pool.connect();
  const quote = value => '"' + String(value).replaceAll('"', '""') + '"';
  let checkCount = 0;
  async function canonicalCheck(table, definition) {
    const name = `audit_restore_check_${checkCount++}`;
    await normalizer.query(`CREATE TEMP TABLE ${quote(name)} (LIKE public.${quote(table)})`);
    try {
      await normalizer.query(`ALTER TABLE ${quote(name)} ADD CONSTRAINT audit_check ${definition}`);
      return (await normalizer.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=$1::regclass AND conname='audit_check'", [`pg_temp.${name}`])).rows[0].definition;
    } finally { await normalizer.query(`DROP TABLE ${quote(name)}`); }
  }
  try {
    for (const row of constraints) if (row.contype === 'c') row.definition = await canonicalCheck(row.relname, row.definition);
    // pg_dump can omit a redundant explicit owner-only ACL and restore NULL
    // (default owner privileges). Preserve effective grants, not storage form.
    await normalizer.query('CREATE TEMP TABLE audit_restore_acl_probe(id integer)');
    const probeAcl = async () => (await normalizer.query("SELECT coalesce(relacl,acldefault('r',relowner))::text AS acl FROM pg_class WHERE oid='pg_temp.audit_restore_acl_probe'::regclass")).rows[0].acl;
    try {
      const defaultAcl = await probeAcl();
      await normalizer.query('REVOKE ALL ON audit_restore_acl_probe FROM PUBLIC');
      assert.equal(await probeAcl(),defaultAcl,'redundant PUBLIC revocation retains default effective owner ACL');
      await normalizer.query(`GRANT SELECT ON audit_restore_acl_probe TO ${role}`);
      assert.notEqual(await probeAcl(),defaultAcl,'added grant must remain detectable');
      await normalizer.query(`REVOKE SELECT ON audit_restore_acl_probe FROM ${role}`);
      assert.equal(await probeAcl(),defaultAcl,'revoked extra grant restores exact effective ACL');
      console.log('AUDIT_ACL_CANONICALIZATION_PASS '+JSON.stringify({defaultAndExplicitOwnerEquivalent:true,addedGrantDetected:true}));
    } finally { await normalizer.query('DROP TABLE audit_restore_acl_probe'); }
    const grouped = await canonicalCheck('merchant_channels', 'CHECK (((char_length(merchant_id) >= 1) AND (char_length(merchant_id) <= 200)) AND (char_length(page_id) >= 1))');
    const flat = await canonicalCheck('merchant_channels', 'CHECK ((char_length(merchant_id) >= 1) AND (char_length(merchant_id) <= 200) AND (char_length(page_id) >= 1))');
    const changed = await canonicalCheck('merchant_channels', 'CHECK ((char_length(merchant_id) >= 2) AND (char_length(merchant_id) <= 200) AND (char_length(page_id) >= 1))');
    assert.equal(grouped, flat, 'native parser must canonicalize equivalent associative grouping');
    assert.notEqual(grouped, changed, 'a changed predicate must remain detectable');
    console.log('AUDIT_CONSTRAINT_CANONICALIZATION_PASS ' + JSON.stringify({ checkCount: checkCount - 3, equivalentGrouping: true, changedPredicateDetected: true }));
  } finally { normalizer.release(); }
  const indexes = (await pool.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
  const migrations = (await pool.query('SELECT hash,created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  const channels = (await pool.query('SELECT id,merchant_id,page_id,status::text AS status FROM merchant_channels ORDER BY id')).rows;
  assert.equal(migrations.length, JSON.parse(fs.readFileSync('lib/db/drizzle/meta/_journal.json', 'utf8')).entries.length);
  assert.equal(channels.length, 2);
  assert.ok(tables.length > 30 && policies.length > 0 && functions.length > 0, 'full schema, not tiny restore table');
  assert.equal(tables.find(x => x.relname === 'merchant_channels').relrowsecurity, true);
  assert.equal((await pool.query("SELECT has_function_privilege($1,'public.fawri_admit_verified_payment_receipt(text,text,text,text,integer,text,timestamptz)','EXECUTE') AS allowed",[role])).rows[0].allowed,false,'restored non-PUBLIC receipt capability must remain inaccessible to tenant runtime');

  const components = { tables, policies, functions, constraints, indexes, migrations, channels };
  const fingerprint = createHash('sha256').update(JSON.stringify(components)).digest('hex');
  let before;
  if (phase === 'seed') fs.writeFileSync('/restore-proof/before.json', JSON.stringify({ fingerprint, components }), { mode: 0o600 });
  else {
    before = JSON.parse(fs.readFileSync('/restore-proof/before.json', 'utf8'));
    for (const [component, rows] of Object.entries(components)) {
      const original = before.components[component];
      const changed = rows.flatMap((row, index) => JSON.stringify(row) === JSON.stringify(original[index]) ? [] : [{ key: row.relname || row.proname || row.tablename || row.id || index, fields: Object.keys(row).filter(key => JSON.stringify(row[key]) !== JSON.stringify(original[index]?.[key])) }]);
      if (changed.length || rows.length !== original.length) console.log('AUDIT_FULL_SCHEMA_RESTORE_DIFFERENCE ' + JSON.stringify({ component, originalCount: original.length, restoredCount: rows.length, changed: changed.slice(0, 8) }));
      if (component === 'constraints' && changed.length) {
        const index = rows.findIndex((row, i) => row.definition !== original[i]?.definition);
        // Constraint DDL is public schema metadata, not row values or secrets.
        console.log('AUDIT_RESTORE_CONSTRAINT_SAMPLE ' + JSON.stringify({ table: rows[index].relname, constraint: rows[index].conname, original: original[index].definition, restored: rows[index].definition }));
      }
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    const flags = (await client.query('SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];
    assert.deepEqual(flags, { role, rolsuper: false, rolbypassrls: false });
    assert.equal((await client.query('SELECT count(*)::int AS count FROM merchant_channels')).rows[0].count, 0);
    for (const id of ids) {
      await client.query("SELECT set_config('fawri.tenant_id',$1,true)", [id]);
      assert.deepEqual((await client.query('SELECT merchant_id,page_id FROM merchant_channels')).rows, [{ merchant_id: id, page_id: `page-${id}` }]);
    }
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  console.log('AUDIT_FULL_SCHEMA_RESTORE_RESULT ' + JSON.stringify({ phase, migrationCount: migrations.length, tableCount: tables.length, policyCount: policies.length, functionCount: functions.length, fixtureChannels: channels.length, restrictedTenantReads: true, fingerprint }));
  if (phase === 'verify') assert.equal(fingerprint, before.fingerprint, 'restored schema/data/policy/ACL fingerprint must match');
  // Fixture rows intentionally persist between seed and restore verification.
  // The launcher destroys the entire owned cluster and anonymous volume.
});
