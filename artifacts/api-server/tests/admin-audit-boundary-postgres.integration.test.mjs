import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableAuthenticationRole} from './helpers/disposable-authentication-role.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';

// Exercises the public RLS boundary after private tenant authority cutover.
// Never run against a hosted DB or weaken the isolation attestation.
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
  const runtimeUrls = new Map();
  const ownedApplicationAudits = [];
  await admin.connect();
  const authFixture=await createDisposableAuthenticationRole(admin,process.env.DATABASE_URL);
  const issuer=new Client({connectionString:authFixture.url,connectionTimeoutMillis:5000});
  await issuer.connect();
  t.after(() => cleanupResources([
    ['runtime sessions', async () => { for (const client of clients) await client.end(); }],
    ['owned audit records', async () => {
      await admin.query('DELETE FROM database_admin_access_audits WHERE id=ANY($1::text[])', [[auditId, ...ownedApplicationAudits]]);
      // The nonce actor belongs solely to this fixture, including random IDs
      // produced by application issuance before an assertion may have failed.
      await admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=$1', [actor]);
    }],
    ['owned merchant settings', () => admin.query('DELETE FROM merchant_settings WHERE merchant_id=ANY($1::text[])', [tenants])],
    ['owned merchants', () => admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])', [tenants])],
    ['owned admin profile', () => admin.query('DELETE FROM admin_profiles WHERE id=$1', [actor])],
    ['owned accounts', () => admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [[actor, ...tenants]])],
    ['scope issuer',async()=>{await issuer.end();await authFixture.dispose();}],
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
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)", [tenant, `+198${randomInt(100000000, 999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')", [tenant]);
  }
  for (const tenant of tenants.slice(0, 2)) await admin.query('INSERT INTO merchant_settings(merchant_id) VALUES($1)', [tenant]);

  async function runtime(name, auditCrud, issuer = false) {
    const role = `audit_${name}_${suffix}`;
    const password = randomUUID().replaceAll('-', '');
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
    roles.push(role);
    if (issuer) await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO ${role}`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.merchant_settings TO ${role}`);
    if (auditCrud) await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public.database_admin_access_audits TO ${role}`);
    const url = new URL(process.env.DATABASE_URL);
    url.username = role;
    url.password = password;
    url.search = '';
    runtimeUrls.set(role, url.toString());
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
  const otherSession = await runtime('other', false);
  const operator = await runtime('operator', true, true);
  const boundedOperator = await runtime('bounded', false, true);

  async function transaction(client, work) {
    await client.query('BEGIN');
    try { return await work(); }
    finally { await client.query('ROLLBACK'); }
  }
  async function issue(client,merchant){
    const target=(await client.query('SELECT session_user::text AS login,pg_backend_pid() AS pid,txid_current()::text AS xid')).rows[0];
    await issuer.query('SELECT fawri_security.issue_scope($1::name,$2::integer,$3::bigint,$4::text)',[target.login,target.pid,target.xid,merchant]);
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
        assert.deepEqual(await visible(client), [], 'raw setting alone grants no authority');
        await issue(client,tenants[0]);
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

  await t.test('shared SQL login cannot forge tenant authority through a GUC', async () => {
    // The public predicate must ignore caller-controlled tenant settings.
    await transaction(tenantOnly, async () => {
      await tenantOnly.query("SELECT set_config('fawri.tenant_id',$1,true)", [tenants[1]]);
      assert.deepEqual(await visible(tenantOnly), []);
      assert.equal((await tenantOnly.query('UPDATE merchant_settings SET version=version+1 WHERE merchant_id=$1', [tenants[1]])).rowCount, 0);
    });
    assert.deepEqual(await visible(tenantOnly), []);
    console.log('P0_TENANT_GUC_FORGERY_DENIED ' + JSON.stringify({ auditTableAccess: false, arbitrarySqlRequired: true, foreignTenantIdentifierRequired: true, tenantGucForgery: false, httpExploitTested: false, releaseAccepted: false }));
  });

  await t.test('audit CRUD grants and forged actor GUCs cannot confer operator authority', async () => {
    await transaction(writable, async () => {
      await insertAudit(writable);
      await setAudit(writable);
      assert.deepEqual(await visible(writable), [], 'audit writer is not an authenticated operator');
      assert.equal((await writable.query('UPDATE merchant_settings SET version=version+1 WHERE merchant_id=$1', [tenants[1]])).rowCount, 0);
      await writable.query("UPDATE database_admin_access_audits SET expires_at=now()+interval '2 minutes',authority_transaction_id=txid_current() WHERE id=$1", [auditId]);
      assert.deepEqual(await visible(writable), [], 'current transaction ID is not an operator credential');
      await writable.query('DELETE FROM database_admin_access_audits WHERE id=$1', [auditId]);
    });
    await assert.rejects(() => writable.query('SELECT public.fawri_issue_admin_directory_audit($1,$2,$3)', [actor, auditId, 'a'.repeat(64)]), { code: '42501' });
    await assert.rejects(() => writable.query(`SET ROLE ${roles.find(r => r.startsWith('audit_bounded_'))}`), { code: '42501' });
    assert.deepEqual(await visible(writable), []);
    console.log('P0_AUDIT_FORGERY_DENIED ' + JSON.stringify({ directRestrictedLogin: true, auditCrudPrecondition: true, forgedTransactionIdDenied: true, crossTenantReadRows: 0, crossTenantUpdateRows: 0, forgedActorIssuerCallDenied: true, httpExploitTested: false, releaseAccepted: false }));
  });

  await t.test('bounded operator issuer works without direct audit CRUD and rejects unavailable actors', async () => {
    const privilege = (await boundedOperator.query("SELECT has_table_privilege(current_user,'public.database_admin_access_audits','SELECT,INSERT,UPDATE,DELETE') AS allowed")).rows[0];
    assert.equal(privilege.allowed, false);
    const issue = () => boundedOperator.query('SELECT public.fawri_issue_admin_directory_audit($1,$2,$3)', [actor, auditId, 'a'.repeat(64)]);
    await transaction(boundedOperator, async () => { await issue(); assert.deepEqual(await visible(boundedOperator), tenants.slice(0, 2)); });
    assert.deepEqual(await visible(boundedOperator), []);
    for (const [disable, enable] of [
      ["UPDATE accounts SET state='suspended' WHERE id=$1", "UPDATE accounts SET state='active' WHERE id=$1"],
      ['UPDATE admin_profiles SET enabled=false WHERE id=$1', 'UPDATE admin_profiles SET enabled=true WHERE id=$1'],
      ['UPDATE admin_profiles SET must_change_password=true WHERE id=$1', 'UPDATE admin_profiles SET must_change_password=false WHERE id=$1'],
    ]) {
      await admin.query(disable, [actor]);
      try { await assert.rejects(issue, { code: '42501' }); }
      finally { await admin.query(enable, [actor]); }
    }
    await assert.rejects(() => boundedOperator.query('SELECT public.fawri_issue_admin_directory_audit($1,$2,$3)', [tenants[0], auditId, 'a'.repeat(64)]), { code: '42501' });
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

  await t.test('application directory uses a dedicated directly authenticated bounded operator pool', async () => {
    const role = roles.find(name => name.startsWith('audit_bounded_'));
    await admin.query(`GRANT SELECT ON public.accounts, public.admin_profiles, public.merchants, public.subscriptions TO ${role}`);
    const previousUrl = process.env.FAWRI_OPERATOR_DATABASE_URL;
    const previousAuthority = process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
    const { closeOperatorDirectoryPool } = await import('../src/services/operatorDirectoryPostgresAuthority.ts');
    try {
      process.env.FAWRI_OPERATOR_DATABASE_URL = runtimeUrls.get(role);
      process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = "required";
      const management = await import('../src/services/postgresMerchantManagementAuthority.ts');
      const rows = await management.listManagedMerchantsPostgres(actor);
      for (const tenant of tenants) assert.ok(rows.some(row => row.id === tenant), 'legitimate directory row must survive role separation');
      assert.deepEqual(await visible(boundedOperator), [], 'operator authority must not leak to another session');
      const logs = (await admin.query("SELECT id,reason_code FROM database_admin_access_audits WHERE admin_account_id=$1 AND reason_code='MERCHANT_DIRECTORY_READ'", [actor])).rows;
      ownedApplicationAudits.push(...logs.map(row => row.id));
      assert.equal(logs.length, 1);
      // The application creates its own random audit ID, so register it for
      // deterministic teardown rather than deleting unrelated history.
      await admin.query('DELETE FROM database_admin_access_audits WHERE id=$1', [logs[0].id]);
    } finally {
      await closeOperatorDirectoryPool();
      if (previousUrl === undefined) delete process.env.FAWRI_OPERATOR_DATABASE_URL;
      else process.env.FAWRI_OPERATOR_DATABASE_URL = previousUrl;
      if (previousAuthority === undefined) delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
      else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = previousAuthority;
    }
  });

  await t.test('issuing-transaction authority checks live actor and profile state', async () => {
    await transaction(operator, async () => {
      await insertAudit(operator);
      await setAudit(operator);
      assert.deepEqual(await visible(operator), tenants.slice(0, 2), 'active issuer keeps legitimate authority');
      for (const [disable, enable, label] of [
        ["UPDATE accounts SET state='suspended' WHERE id=$1", "UPDATE accounts SET state='active' WHERE id=$1", 'suspended account'],
        ['UPDATE admin_profiles SET enabled=false WHERE id=$1', 'UPDATE admin_profiles SET enabled=true WHERE id=$1', 'disabled profile'],
        ['UPDATE admin_profiles SET must_change_password=true WHERE id=$1', 'UPDATE admin_profiles SET must_change_password=false WHERE id=$1', 'password change required'],
      ]) {
        await admin.query(disable, [actor]);
        try { assert.deepEqual(await visible(operator), [], label + ' loses authority in the live transaction'); }
        finally { await admin.query(enable, [actor]); }
        assert.deepEqual(await visible(operator), tenants.slice(0, 2), 'restored active administrator works');
      }
      await operator.query("UPDATE database_admin_access_audits SET started_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1", [auditId]);
      assert.deepEqual(await visible(operator), [], 'expired authority denied even in issuing transaction');
    });
    assert.deepEqual(await visible(operator), [], 'rollback removes all local authority settings');
    assert.equal((await admin.query('SELECT count(*)::int AS count FROM database_admin_access_audits WHERE id=$1', [auditId])).rows[0].count, 0, 'rollback removes the authority record');
  });

  await t.test('committed audit identifiers cannot authorize another transaction or concurrent session', async () => {
    // A real restricted issuer succeeds before COMMIT. Its retained record must
    // never authorize even that same connection in a subsequent transaction.
    await operator.query('BEGIN');
    try {
      await insertAudit(operator);
      await setAudit(operator);
      assert.deepEqual(await visible(operator), tenants.slice(0, 2));
      await operator.query('COMMIT');
    } catch (error) { await operator.query('ROLLBACK'); throw error; }
    assert.equal((await admin.query('SELECT expires_at > now() AS live FROM database_admin_access_audits WHERE id=$1', [auditId])).rows[0]?.live, true);
    // All replay attempts know the valid IDs and can set arbitrary GUCs.
    await Promise.all([operator, writable, tenantOnly, otherSession].map(client => transaction(client, async () => {
      await setAudit(client);
      assert.deepEqual(await visible(client), [], 'live committed IDs must not authorize a fresh transaction');
      assert.equal((await client.query('UPDATE merchant_settings SET version=version+1 WHERE merchant_id=$1', [tenants[1]])).rowCount, 0);
      await client.query("SELECT set_config('fawri.tenant_id',$1,true)", [tenants[0]]);
      assert.deepEqual(await visible(client), [], 'forged tenant setting cannot rescue rejected admin replay');
      await issue(client,tenants[0]);
      assert.deepEqual(await visible(client), [tenants[0]], 'issued own tenant remains usable during rejected admin replay');
    })));
    for (const client of [operator, writable, tenantOnly, otherSession]) assert.deepEqual(await visible(client), []);
    await admin.query("UPDATE accounts SET state='suspended' WHERE id=$1", [actor]);
    try {
      await transaction(tenantOnly, async () => { await setAudit(tenantOnly); assert.deepEqual(await visible(tenantOnly), []); });
    } finally { await admin.query("UPDATE accounts SET state='active' WHERE id=$1", [actor]); }
    console.log('P0_AUDIT_TRANSACTION_BINDING_PROOF ' + JSON.stringify({ directRestrictedLogin: true, knownIdentifiersRequired: true, activeWindowReuse: false, sameConnectionLaterTransactionReuse: false, concurrentSessions: 4, suspendedActorReuse: false, auditForgeryStillUnresolved: false, httpExploitTested: false, releaseAccepted: false }));
  });
});
