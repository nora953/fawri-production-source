import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';

// Characterizes a known SQL-role boundary weakness; passing is NOT release
// acceptance. Never run against a hosted DB or weaken the isolation attestation.
await assertDisposablePostgres();
const { Client } = await import('pg');

test('P0 audit records are authority-bearing capabilities under restricted direct LOGINs', { timeout: 60_000 }, async t => {
  const admin = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const suffix = randomUUID().replaceAll('-', '');
  const actor = `audit-actor-${suffix}`;
  const tenants = ['a', 'b', 'c'].map(x => `audit-${x}-${suffix}`);
  const auditId = `audit-forgery-${suffix}`;
  const roles = [];
  const clients = [];
  await admin.connect();
  t.after(() => cleanupResources([
    ['runtime sessions', async () => { for (const client of clients) await client.end(); }],
    ['owned audit records', () => admin.query('DELETE FROM database_admin_access_audits WHERE id=$1', [auditId])],
    ['owned merchant settings', () => admin.query('DELETE FROM merchant_settings WHERE merchant_id=ANY($1::text[])', [tenants])],
    ['owned merchants', () => admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])', [tenants])],
    ['owned accounts', () => admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [[actor, ...tenants]])],
    ['owned roles', async () => {
      for (const role of roles) {
        await admin.query(`DROP OWNED BY ${role}`);
        await admin.query(`DROP ROLE ${role}`);
      }
    }],
    ['admin session', () => admin.end()],
  ]));

  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'admin',$2,'synthetic','active')", [actor, `+198${randomInt(100000000, 999999999)}`]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,must_change_password) VALUES($1,$1,'admin','Synthetic audit actor','owner_admin',true,false)", [actor]);
  for (const tenant of tenants) {
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'merchant',$2,'synthetic','active')", [tenant, `+198${randomInt(100000000, 999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [tenant]);
  }
  for (const tenant of tenants.slice(0, 2)) await admin.query('INSERT INTO merchant_settings(merchant_id) VALUES($1)', [tenant]);

  async function runtime(name, auditCrud) {
    const role = `audit_${name}_${suffix}`;
    const password = randomUUID().replaceAll('-', '');
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
    roles.push(role);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.merchant_settings TO ${role}`);
    if (auditCrud) await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.database_admin_access_audits TO ${role}`);
    const url = new URL(process.env.DATABASE_URL);
    url.username = role;
    url.password = password;
    url.search = '';
    const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
    clients.push(client);
    await client.connect();
    const identity = (await client.query(`SELECT current_user AS active, session_user AS login,
      rolsuper,rolbypassrls,rolcreaterole,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS member_of_any_role,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owns_relations
      FROM pg_roles r WHERE rolname=current_user`)).rows[0];
    assert.deepEqual(identity, { active: role, login: role, rolsuper: false, rolbypassrls: false, rolcreaterole: false, member_of_any_role: false, owns_relations: false });
    return client;
  }
  const writable = await runtime('writable', true);
  const tenantOnly = await runtime('tenant', false);

  async function transaction(client, work) {
    await client.query('BEGIN');
    try { return await work(); }
    finally { await client.query('ROLLBACK'); }
  }
  const visible = async client => (await client.query('SELECT merchant_id FROM merchant_settings ORDER BY merchant_id')).rows.map(row => row.merchant_id);
  async function setAudit(client) {
    await client.query("SELECT set_config('fawri.admin_account_id',$1,true),set_config('fawri.admin_audit_id',$2,true)", [actor, auditId]);
  }
  const insertAudit = client => client.query(`INSERT INTO database_admin_access_audits
    (id,admin_account_id,reason_code,request_hash,started_at,expires_at)
    VALUES($1,$2,'SYNTHETIC_SQL_BOUNDARY',$3,now(),now()+interval '1 minute')`, [auditId, actor, 'a'.repeat(64)]);

  await t.test('without admin authority, own-tenant CRUD succeeds and cross-tenant CRUD is denied', async () => {
    for (const client of [writable, tenantOnly]) {
      assert.deepEqual(await visible(client), []);
      await transaction(client, async () => {
        await client.query("SELECT set_config('fawri.tenant_id',$1,true)", [tenants[0]]);
        assert.deepEqual(await visible(client), [tenants[0]]);
        assert.equal((await client.query('UPDATE merchant_settings SET version=version+1 WHERE merchant_id=$1', [tenants[0]])).rowCount, 1);
        assert.equal((await client.query('UPDATE merchant_settings SET version=version+1 WHERE merchant_id=$1', [tenants[1]])).rowCount, 0);
        assert.equal((await client.query('DELETE FROM merchant_settings WHERE merchant_id=$1', [tenants[1]])).rowCount, 0);
        await client.query('SAVEPOINT denied_insert');
        await assert.rejects(() => client.query('INSERT INTO merchant_settings(merchant_id) VALUES($1)', [tenants[2]]), { code: '42501' });
        await client.query('ROLLBACK TO SAVEPOINT denied_insert');
        assert.equal((await client.query('DELETE FROM merchant_settings WHERE merchant_id=$1', [tenants[0]])).rowCount, 1);
        assert.equal((await client.query('INSERT INTO merchant_settings(merchant_id) VALUES($1)', [tenants[0]])).rowCount, 1);
      });
      assert.deepEqual(await visible(client), [], 'transaction-local tenant settings must reset');
    }
  });

  await t.test('audit CRUD grants allow synthetic record forgery and cross-tenant reads/writes', async () => {
    await transaction(writable, async () => {
      await insertAudit(writable);
      await setAudit(writable);
      assert.deepEqual(await visible(writable), tenants.slice(0, 2));
      assert.equal((await writable.query('UPDATE merchant_settings SET version=version+1 WHERE merchant_id=$1', [tenants[1]])).rowCount, 1);
      assert.equal((await writable.query('UPDATE database_admin_access_audits SET expires_at=now()+interval \'2 minutes\' WHERE id=$1', [auditId])).rowCount, 1);
      assert.equal((await writable.query('DELETE FROM database_admin_access_audits WHERE id=$1', [auditId])).rowCount, 1);
      assert.deepEqual(await visible(writable), []);
    });
    assert.deepEqual(await visible(writable), [], 'transaction-local admin settings must reset');
    console.log('P0_AUDIT_FORGERY_PROOF ' + JSON.stringify({ directRestrictedLogin: true, auditCrudPrecondition: true, syntheticForeignRows: 2, foreignUpdateRows: 1, httpExploitTested: false, releaseAccepted: false }));
  });

  await t.test('without audit grants, tenant runtime cannot mint/read/modify/delete authority records', async () => {
    for (const execute of [
      () => insertAudit(tenantOnly),
      () => tenantOnly.query('SELECT id FROM database_admin_access_audits'),
      () => tenantOnly.query('UPDATE database_admin_access_audits SET reason_code=reason_code WHERE id=$1', [auditId]),
      () => tenantOnly.query('DELETE FROM database_admin_access_audits WHERE id=$1', [auditId]),
    ]) await assert.rejects(execute, { code: '42501' });
    assert.deepEqual(await visible(tenantOnly), []);
  });

  await t.test('known valid audit identifiers are reusable even without direct audit privileges', async () => {
    await insertAudit(admin);
    await transaction(tenantOnly, async () => {
      await setAudit(tenantOnly);
      assert.deepEqual(await visible(tenantOnly), tenants.slice(0, 2));
    });
    // Revoking table access alone does not bind existing authority to a session.
    await admin.query("UPDATE accounts SET state='suspended' WHERE id=$1", [actor]);
    await transaction(tenantOnly, async () => {
      await setAudit(tenantOnly);
      assert.deepEqual(await visible(tenantOnly), tenants.slice(0, 2));
    });
    await admin.query("UPDATE database_admin_access_audits SET started_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1", [auditId]);
    await transaction(tenantOnly, async () => {
      await setAudit(tenantOnly);
      assert.deepEqual(await visible(tenantOnly), [], 'expired authority must fail closed');
    });
    assert.deepEqual(await visible(tenantOnly), []);
    console.log('P0_AUDIT_BEARER_REUSE_PROOF ' + JSON.stringify({ auditTableAccess: false, knownIdentifiersRequired: true, activeWindowReuse: true, suspendedActorReuse: true, expiredDenied: true, httpExploitTested: false, releaseAccepted: false }));
  });
});
