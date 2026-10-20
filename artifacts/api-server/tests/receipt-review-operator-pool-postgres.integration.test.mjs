import assert from 'node:assert/strict';
import { randomUUID, randomInt, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { assertDisposablePostgres } from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const { Client } = await import('pg');
const capability = 'public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)';
const readSql = 'SELECT * FROM public.fawri_review_verified_payment_receipt($1,$2,$3,$4,$5,$6)';

test('receipt review uses a bounded direct LOGIN and fresh committed authorization across provider I/O', { timeout: 60000 }, async t => {
  const nonce = randomUUID().replaceAll('-', '');
  const actor = `review-actor-${nonce}`, merchants = [], fixtures = [], roles = [], clients = [], urls = [];
  const admin = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await admin.connect();
  let closePool = async () => {}, fault;
  const saved = {};
  t.after(() => cleanupResources([
    ['audit trigger', async () => { if (fault) { await admin.query(`DROP TRIGGER IF EXISTS ${fault} ON database_admin_access_audits`); await admin.query(`DROP FUNCTION IF EXISTS ${fault}()`); } }],
    ['operator pool', () => closePool()],
    ['runtime sessions', async () => { for (const c of clients) await c.end(); }],
    ['owned receipts', () => admin.query('DELETE FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[])', [fixtures.map(f => f.event)])],
    ['owned audits', () => admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=$1', [actor])],
    ['owned orders', async () => { for (const f of fixtures) await admin.query(`DELETE FROM ${f.table} WHERE id=$1`, [f.order]); }],
    ['owned merchants', () => admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])', [merchants])],
    ['owned permissions', () => admin.query('DELETE FROM admin_permissions WHERE admin_id=$1', [actor])],
    ['owned profile', () => admin.query('DELETE FROM admin_profiles WHERE account_id=$1', [actor])],
    ['owned accounts', () => admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])', [[actor, ...merchants]])],
    ['owned roles', async () => { for (const r of roles) { await admin.query(`DROP OWNED BY ${r}`); await admin.query(`DROP ROLE ${r}`); } }],
    ['environment', async () => { for (const [k,v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }],
    ['bootstrap connection', () => admin.end()],
  ]));
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength:2048 });
  const env = {
    // Test the production DATABASE gate while keeping the fake sandbox transport
    // in test mode. This does not certify a production payment provider.
    NODE_ENV:'test', FAWRI_DEPLOYMENT_MODE:'production', FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',
    FAWRI_OPERATOR_DATABASE_URL:undefined, FAWRI_SUPERQI_SANDBOX_ENABLED:'1',
    FAWRI_SUPERQI_SANDBOX_USERNAME:'synthetic-user', FAWRI_SUPERQI_SANDBOX_PASSWORD:'synthetic-password',
    FAWRI_SUPERQI_SANDBOX_TERMINAL_ID:'synthetic-terminal',
    FAWRI_SUPERQI_SANDBOX_NOTIFICATION_URL:'https://review.example.invalid/webhook',
    FAWRI_SUPERQI_SANDBOX_FINISH_URL:'https://review.example.invalid/finish',
    FAWRI_SUPERQI_SANDBOX_WEBHOOK_PUBLIC_KEY_B64:Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64'),
  };
  for (const [k,v] of Object.entries(env)) { saved[k] = process.env[k]; if(v === undefined) delete process.env[k]; else process.env[k] = v; }
  ({ closeReceiptOperatorReviewPool: closePool } = await import('../src/services/operatorReceiptReviewPostgresAuthority.ts'));
  const { reviewVerifiedReceiptReplay: review } = await import('../src/services/verifiedReceiptReplayReview.ts');
  const { superQiConfirmedProviderEventId } = await import('../src/services/superQiSandboxWebhook.ts');
  const { superQiWebhookPayloadHash } = await import('../src/services/superQiSandboxTransport.ts');
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'admin',$2,'synthetic','active')",[actor,`+198${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic','assistant_admin',true,false)",[actor]);
  const grantPermission = () => admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_subscriptions')",[actor]);
  await grantPermission();
  for (const kind of ['saas','cashier']) {
    const merchant = `review-${kind}-${nonce}`, order = `review-order-${kind}-${nonce}`;
    const payload = {paymentId:`synthetic-review-${kind}-${nonce}`,requestId:randomUUID(),status:'SUCCESS',canceled:false,amount:3900,confirmedAmount:3900,currency:'IQD',creationDate:'2026-10-14T12:00:00Z'};
    const f = {kind,table:kind === 'saas'?'saas_billing_orders':'cashier_billing_orders',order,payload,event:superQiConfirmedProviderEventId(payload),body:{authority:kind === 'saas'?'bot_subscription':'cashier_subscription',order_id:order}};
    merchants.push(merchant); fixtures.push(f);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state) VALUES($1,'merchant',$2,'synthetic','active')",[merchant,`+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
    const common = [order,merchant,payload.paymentId,JSON.stringify({provider_request_id:payload.requestId})];
    if (kind === 'saas') await admin.query(`INSERT INTO saas_billing_orders
      (id,merchant_id,operation,requested_plan,amount_iqd,catalog_version,provider,idempotency_key,provider_checkout_ref,request_expires_at,metadata)
      VALUES($1,$2,'activate','silver',3900,'synthetic','superqi_sandbox',$1,$3,now()+interval '1 day',$4::jsonb)`,common);
    else await admin.query(`INSERT INTO cashier_billing_orders
      (id,merchant_id,operation,current_seats,requested_seats,resulting_seats,unit_price_iqd,amount_iqd,billing_period_start,billing_period_end,provider,idempotency_key,provider_checkout_ref,request_expires_at,metadata)
      VALUES($1,$2,'activate',0,1,1,3900,3900,now(),now()+interval '30 days','superqi_sandbox',$1,$3,now()+interval '1 day',$4::jsonb)`,common);
    await admin.query(`INSERT INTO verified_provider_payment_receipts
      (provider,provider_event_id,payment_ref,request_ref,event_type,amount_iqd,payload_hash,first_received_at)
      VALUES('superqi_sandbox',$1,$2,$3,'payment_succeeded',3900,$4,'2026-10-14T12:00:00.123456Z')`,[f.event,payload.paymentId,payload.requestId,superQiWebhookPayloadHash(payload)]);
  }
  for (const kind of ['tenant','reviewer']) {
    const role = `review_${kind}_${nonce}`, password = randomUUID().replaceAll('-','');
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`); roles.push(role);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    if(kind === 'reviewer') await admin.query(`GRANT EXECUTE ON FUNCTION ${capability} TO ${role}`);
    const url = new URL(process.env.DATABASE_URL); url.username = role; url.password = password; url.search = ''; urls.push(url.toString());
    const c = new Client({ connectionString:url.toString(),connectionTimeoutMillis:5000 }); clients.push(c); await c.connect();
    const identity = (await c.query(`SELECT current_user AS active,session_user AS login,rolsuper,rolbypassrls,rolcreaterole,
      EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS member,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner FROM pg_roles r WHERE rolname=current_user`)).rows[0];
    assert.deepEqual(identity,{active:role,login:role,rolsuper:false,rolbypassrls:false,rolcreaterole:false,member:false,owner:false});
    for(const signature of ['public.fawri_issue_admin_directory_audit(text,text,text)','public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)','public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)'])
      assert.equal((await c.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') AS allowed",[signature])).rows[0].allowed,false);
    for(const table of ['database_admin_access_audits','verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders','accounts','admin_profiles','admin_permissions'])
      assert.equal((await c.query("SELECT has_table_privilege(current_user,$1,'SELECT,INSERT,UPDATE,DELETE') AS allowed",[`public.${table}`])).rows[0].allowed,false);
  }
  process.env.FAWRI_OPERATOR_DATABASE_URL = urls[1];
  const audits = async () => (await admin.query("SELECT count(*)::int AS n FROM database_admin_access_audits WHERE admin_account_id=$1 AND reason_code='BILLING_RECEIPT_REPLAY_REVIEW'",[actor])).rows[0].n;
  const snapshot = async () => ({
    receipts:(await admin.query('SELECT * FROM verified_provider_payment_receipts WHERE provider_event_id=ANY($1::text[]) ORDER BY provider_event_id',[fixtures.map(f=>f.event)])).rows,
    orders:await Promise.all(fixtures.map(async f=>(await admin.query(`SELECT * FROM ${f.table} WHERE id=$1`,[f.order])).rows[0])),
    entitlements:(await admin.query('SELECT (SELECT count(*) FROM saas_entitlement_applications)+(SELECT count(*) FROM cashier_entitlement_applications) AS n')).rows[0].n,
  });
  const initial = await snapshot();
  let calls = 0, providerHook;
  const fetchImpl = async (url,init) => {
    calls++; assert.equal(init.method,'GET');
    const f = fixtures.find(f=>String(url) === `https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${encodeURIComponent(f.payload.paymentId)}/status`);
    assert.ok(f,'only owned fake provider traffic');
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename=$1 AND state='idle in transaction'",[roles[1]])).rows[0].n,0,'provider I/O must not retain actor locks or an open transaction');
    if(providerHook) await providerHook();
    return Response.json(f.payload);
  };
  const invoke = (f=fixtures[0]) => review(actor,f.event,f.body,fetchImpl);
  await t.test('tenant cannot review with known active actor identifiers and forged GUCs',async()=>{
    const f=fixtures[0];
    await clients[0].query("SELECT set_config('fawri.admin_account_id',$1,false),set_config('fawri.admin_audit_id',$2,false)",[actor,randomUUID()]);
    await assert.rejects(()=>clients[0].query(readSql,[actor,f.event,f.body.authority,f.order,randomUUID(),'a'.repeat(64)]),{code:'42501'});
    await assert.rejects(()=>clients[0].query(`SET ROLE ${roles[1]}`),{code:'42501'});
    assert.equal(await audits(),0);assert.equal(calls,0);
  });
  for(const f of fixtures) await t.test(`${f.kind}: bounded review commits both audits and discloses only intent`,async()=>{
    const before=await audits(),oldCalls=calls;
    providerHook=async()=>assert.equal(await audits(),before+1,'first audit must be committed before provider I/O');
    try {
      const result=await invoke(f);
      assert.deepEqual(result,{status:'verified',applied:false,receipt_event_id:f.event,order_id:f.order,authority:f.body.authority});
      assert.equal(calls,oldCalls+1);assert.equal(await audits(),before+2);
      const output=JSON.stringify(result);for(const raw of [f.payload.paymentId,f.payload.requestId,superQiWebhookPayloadHash(f.payload)])assert.equal(output.includes(raw),false);
    } finally { providerHook=undefined; }
  });
  await t.test('permission revoked during provider I/O denies final confirmation',async()=>{
    const before=await audits();
    providerHook=()=>admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_subscriptions'",[actor]);
    try { await assert.rejects(invoke,{code:'RECEIPT_REPLAY_REVIEW_PERMISSION_REQUIRED',status:403}); }
    finally { providerHook=undefined;await grantPermission(); }
    assert.equal(await audits(),before+1);
  });
  await t.test('database capability revoked during provider I/O fails the next transaction',async()=>{
    const before=await audits();
    providerHook=()=>admin.query(`REVOKE EXECUTE ON FUNCTION ${capability} FROM ${roles[1]}`);
    try { await assert.rejects(invoke,{code:'RECEIPT_REPLAY_REVIEW_UNAVAILABLE',status:503}); }
    finally { providerHook=undefined;await admin.query(`GRANT EXECUTE ON FUNCTION ${capability} TO ${roles[1]}`); }
    assert.equal(await audits(),before+1);
  });
  await t.test('mapping changed during provider I/O fails the final audited lookup',async()=>{
    const f=fixtures[0],before=await audits();
    providerHook=()=>admin.query(`UPDATE ${f.table} SET metadata=$2::jsonb WHERE id=$1`,[f.order,JSON.stringify({provider_request_id:randomUUID()})]);
    try { await assert.rejects(invoke,{code:'RECEIPT_REPLAY_REVIEW_CONFLICT',status:409}); }
    finally { providerHook=undefined;await admin.query(`UPDATE ${f.table} SET metadata=$2::jsonb WHERE id=$1`,[f.order,JSON.stringify(initial.orders[0].metadata)]); }
    assert.equal(await audits(),before+2);
  });
  async function createFault() {
    fault=`review_fault_${nonce}`;
    await admin.query(`CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.admin_account_id='${actor}' AND NEW.reason_code='BILLING_RECEIPT_REPLAY_REVIEW' THEN RAISE EXCEPTION 'synthetic deferred audit rejection' USING ERRCODE='P0001'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE CONSTRAINT TRIGGER ${fault} AFTER INSERT ON database_admin_access_audits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${fault}()`);
  }
  async function removeFault() {
    await admin.query(`DROP TRIGGER ${fault} ON database_admin_access_audits`);await admin.query(`DROP FUNCTION ${fault}()`);fault=undefined;
  }
  await t.test('first audit COMMIT rejection prevents provider access and returns no confirmation',async()=>{
    const before=await audits(),oldCalls=calls;await createFault();
    try { await assert.rejects(invoke,{code:'RECEIPT_REPLAY_REVIEW_UNAVAILABLE',status:503}); }
    finally { await removeFault(); }
    assert.equal(calls,oldCalls);assert.equal(await audits(),before);
  });
  await t.test('second audit COMMIT rejection prevents confirmation after provider success',async()=>{
    const before=await audits(),oldCalls=calls;providerHook=createFault;
    try { await assert.rejects(invoke,{code:'RECEIPT_REPLAY_REVIEW_UNAVAILABLE',status:503}); }
    finally { providerHook=undefined;await removeFault(); }
    assert.equal(calls,oldCalls+1);assert.equal(await audits(),before+1);
  });
  await t.test('production database gate rejects missing operator URL and tenant credentials before provider I/O',async()=>{
    await closePool();const before=await audits(),oldCalls=calls;
    try {
      delete process.env.FAWRI_OPERATOR_DATABASE_URL;
      await assert.rejects(invoke,{code:'RECEIPT_REPLAY_REVIEW_UNAVAILABLE',status:503});
      process.env.FAWRI_OPERATOR_DATABASE_URL=urls[0];
      await assert.rejects(invoke,{code:'RECEIPT_REPLAY_REVIEW_UNAVAILABLE',status:503});
    } finally { await closePool();process.env.FAWRI_OPERATOR_DATABASE_URL=urls[1]; }
    assert.equal(calls,oldCalls);assert.equal(await audits(),before);
  });
  await t.test('review and failures leave receipt/order/subscription state unchanged',async()=>{
    assert.deepEqual(await snapshot(),initial);
    console.log('P0_RECEIPT_REVIEW_OPERATOR_POOL_PROOF '+JSON.stringify({directRestrictedLogins:2,reviewOnlyExecute:true,directTableCrud:false,tenantForgedActorDenied:true,providerOutsideTransaction:true,bothAuditsCommittedBeforeConfirmation:true,permissionRevocationRechecked:true,capabilityRevocationRechecked:true,mappingChangeRejected:true,firstCommitFailureBlocksProvider:true,secondCommitFailureBlocksConfirmation:true,receiptAndOrderUnchanged:true,entitlementGrants:0,productionPaymentProviderCertified:false,releaseAccepted:false}));
  });
});
