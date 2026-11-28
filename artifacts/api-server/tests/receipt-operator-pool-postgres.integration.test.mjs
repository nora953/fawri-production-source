import assert from 'node:assert/strict';
import { randomUUID, randomInt } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const { Client } = await import('pg');
const capability = 'public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)';
const issuer = 'public.fawri_issue_admin_directory_audit(text,text,text)';
const readSql = 'SELECT * FROM public.fawri_read_verified_payment_receipts($1,$2,$3,$4,$5,$6)';

test('receipt service uses a bounded directly authenticated operator, never the tenant pool', { timeout: 60000 }, async t => {
  const nonce = randomUUID().replaceAll('-', '');
  const actor = `receipt-pool-${nonce}`, event = `receipt-pool-event-${nonce}`;
  const admin = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const roles = [], clients = [], urls = [];
  const saved = Object.fromEntries(['FAWRI_OPERATOR_DATABASE_URL','FAWRI_OPERATIONAL_POSTGRES_AUTHORITY','FAWRI_DEPLOYMENT_MODE'].map(k => [k, process.env[k]]));
  await admin.connect();
  const { closeReceiptOperatorReadPool } = await import('../src/services/operatorReceiptReadPostgresAuthority.ts');
  const { readVerifiedReceiptsForOperator: read } = await import('../src/services/verifiedReceiptOperatorRead.ts');
  t.after(() => cleanupResources([
    ['operator pool', () => closeReceiptOperatorReadPool()],
    ['runtime sessions', async () => { for (const c of clients) await c.end(); }],
    ['owned receipts', () => admin.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=$1', [event])],
    ['owned audits', () => admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=$1', [actor])],
    ['owned profile', () => admin.query('DELETE FROM admin_profiles WHERE account_id=$1', [actor])],
    ['owned account', () => admin.query('DELETE FROM accounts WHERE id=$1', [actor])],
    ['owned roles', async () => { for (const role of roles) { await admin.query(`DROP OWNED BY ${role}`); await admin.query(`DROP ROLE ${role}`); } }],
    ['environment', async () => { for (const [k,v] of Object.entries(saved)) { if(v === undefined) delete process.env[k]; else process.env[k] = v; } }],
    ['bootstrap connection', () => admin.end()],
  ]));
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'admin',$2,'synthetic','active')", [actor, `+198${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic','owner_admin',true,false)", [actor]);
  await admin.query(`INSERT INTO verified_provider_payment_receipts
    (provider,provider_event_id,payment_ref,request_ref,event_type,amount_iqd,payload_hash,first_received_at)
    VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',3900,$4,now())`, [event, `payment-${nonce}`, `request-${nonce}`, 'a'.repeat(64)]);
  for (const kind of ['tenant','reader']) {
    const role = `receipt_${kind}_${nonce}`, password = randomUUID().replaceAll('-', '');
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`);
    roles.push(role);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    if(kind === 'reader') await admin.query(`GRANT EXECUTE ON FUNCTION ${capability} TO ${role}`);
    const url = new URL(process.env.DATABASE_URL); url.username = role; url.password = password; url.search = '';
    urls.push(url.toString());
    const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 }); clients.push(client); await client.connect();
    const identity = (await client.query(`SELECT current_user AS active,session_user AS login,
      rolsuper,rolbypassrls,rolcreaterole,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS member,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner
      FROM pg_roles r WHERE rolname=current_user`)).rows[0];
    assert.deepEqual(identity, { active:role, login:role, rolsuper:false, rolbypassrls:false, rolcreaterole:false, member:false, owner:false });
    assert.equal((await client.query('SELECT has_function_privilege(current_user,$1,\'EXECUTE\') AS allowed',[issuer])).rows[0].allowed,false);
    for(const table of ['database_admin_access_audits','verified_provider_payment_receipts'])
      assert.equal((await client.query('SELECT has_table_privilege(current_user,$1,\'SELECT,INSERT,UPDATE,DELETE\') AS allowed',[`public.${table}`])).rows[0].allowed,false);
  }
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY = 'required';
  process.env.FAWRI_DEPLOYMENT_MODE = 'production';
  const args = () => [actor, 20, null, null, `reader-audit-${randomUUID()}`, 'a'.repeat(64)];
  await t.test('tenant cannot call the reader with forged actor and audit GUCs', async () => {
    await clients[0].query("SELECT set_config('fawri.admin_account_id',$1,false),set_config('fawri.admin_audit_id',$2,false)",[actor,randomUUID()]);
    await assert.rejects(() => clients[0].query(readSql,args()), { code:'42501' });
    await assert.rejects(() => clients[0].query(`SET ROLE ${roles[1]}`), { code:'42501' });
  });
  await t.test('bounded service returns redacted receipts only after committing its audit', async () => {
    process.env.FAWRI_OPERATOR_DATABASE_URL = urls[1];
    const result = await read(actor,{limit:'50'});
    const receipt = result.receipts.find(r => r.provider_event_id === event);
    assert.ok(receipt);
    assert.equal(receipt.payment_ref_suffix,nonce.slice(-8));
    assert.equal('payment_ref' in receipt,false);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM database_admin_access_audits WHERE admin_account_id=$1 AND reason_code='BILLING_VERIFIED_RECEIPTS_READ'",[actor])).rows[0].n,1);
    assert.equal((await admin.query('SELECT payment_ref FROM verified_provider_payment_receipts WHERE provider_event_id=$1',[event])).rows[0].payment_ref,`payment-${nonce}`);
  });
  await t.test('live account and profile restrictions deny reads without creating audits', async () => {
    for(const [disable,restore] of [
      ["UPDATE accounts SET state='suspended' WHERE id=$1","UPDATE accounts SET state='active' WHERE id=$1"],
      ['UPDATE admin_profiles SET enabled=false WHERE account_id=$1','UPDATE admin_profiles SET enabled=true WHERE account_id=$1'],
      ['UPDATE admin_profiles SET must_change_password=true WHERE account_id=$1','UPDATE admin_profiles SET must_change_password=false WHERE account_id=$1'],
    ]) {
      await admin.query(disable,[actor]);
      try { await assert.rejects(() => read(actor,{}), { code:'RECEIPT_OPERATOR_PERMISSION_REQUIRED',status:403 }); }
      finally { await admin.query(restore,[actor]); }
    }
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM database_admin_access_audits WHERE admin_account_id=$1',[actor])).rows[0].n,1);
  });
  await t.test('missing operator configuration and tenant credentials fail closed in production', async () => {
    await closeReceiptOperatorReadPool();
    delete process.env.FAWRI_OPERATOR_DATABASE_URL;
    await assert.rejects(() => read(actor,{}), { code:'RECEIPT_OPERATOR_READ_UNAVAILABLE',status:503 });
    process.env.FAWRI_OPERATOR_DATABASE_URL = urls[0];
    await assert.rejects(() => read(actor,{}), { code:'RECEIPT_OPERATOR_READ_UNAVAILABLE',status:503 });
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM database_admin_access_audits WHERE admin_account_id=$1',[actor])).rows[0].n,1);
  });
});
