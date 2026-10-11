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
  const tables = (await pool.query("SELECT relname, relrowsecurity, relforcerowsecurity, relacl::text AS acl FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relkind IN ('r','p') ORDER BY relname")).rows;
  const policies = (await pool.query("SELECT c.relname, polname, polcmd, polpermissive, pg_get_expr(polqual,polrelid) AS predicate, pg_get_expr(polwithcheck,polrelid) AS check_predicate FROM pg_policy JOIN pg_class c ON c.oid=polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,polname")).rows;
  const functions = (await pool.query("SELECT proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='public' AND prokind='f' ORDER BY proname,args")).rows;
  const constraints = (await pool.query("SELECT c.relname, conname, convalidated, condeferrable, condeferred, pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,conname")).rows;
  const indexes = (await pool.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
  const migrations = (await pool.query('SELECT hash,created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id')).rows;
  const channels = (await pool.query('SELECT id,merchant_id,page_id,status::text AS status FROM merchant_channels ORDER BY id')).rows;
  assert.equal(migrations.length, JSON.parse(fs.readFileSync('lib/db/drizzle/meta/_journal.json', 'utf8')).entries.length);
  assert.equal(channels.length, 2);
  assert.ok(tables.length > 30 && policies.length > 0 && functions.length > 0, 'full schema, not tiny restore table');
  assert.equal(tables.find(x => x.relname === 'merchant_channels').relrowsecurity, true);
  const fingerprint = createHash('sha256').update(JSON.stringify({ tables, policies, functions, constraints, indexes, migrations, channels })).digest('hex');
  if (phase === 'seed') fs.writeFileSync('/restore-proof/before.json', JSON.stringify({ fingerprint }), { mode: 0o600 });
  else assert.equal(fingerprint, JSON.parse(fs.readFileSync('/restore-proof/before.json', 'utf8')).fingerprint, 'restored schema/data/policy/ACL fingerprint must match');
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
  // Fixture rows intentionally persist between seed and restore verification.
  // The launcher destroys the entire owned cluster and anonymous volume.
});
