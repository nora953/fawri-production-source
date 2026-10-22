import assert from 'node:assert/strict';
import {createHash, randomInt, randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
const hash=value=>createHash('sha256').update(value).digest('hex');

test('cashier credential housekeeping uses auth LOGIN while tenant credential writes remain forbidden',{timeout:90000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime();
  const admin=fixture.admin,main=fixture.runtimePool;
  const originalQuery=main.query,originalConnect=main.connect;
  const saved={FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY,FAWRI_DEPLOYMENT_MODE:process.env.FAWRI_DEPLOYMENT_MODE};
  const authUrl=process.env.FAWRI_AUTH_DATABASE_URL;
  const merchants=[`housekeeping-a-${randomUUID()}`,`housekeeping-b-${randomUUID()}`];
  const rows=[];let tenant,primaryCalls=0,closeAuth=async()=>{};
  t.after(()=>cleanupResources([
    ['primary methods',async()=>{main.query=originalQuery;main.connect=originalConnect;}],
    ['actual tenant client',()=>tenant?.end()],
    ['auth pool',()=>closeAuth()],
    ...['cashier_operator_sessions','cashier_shifts','cashier_station_credentials','cashier_station_pairing_challenges','merchant_cashier_staff_permissions','merchant_cashier_stations','merchant_cashier_staff'].map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['owned accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['fixture resources',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  process.env.FAWRI_DEPLOYMENT_MODE='production';
  const {Client}=await import('pg');
  tenant=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});await tenant.connect();
  const {withAuthenticationTransaction,closeAuthenticationPool}=await import('../src/services/authenticationPostgresAuthority.ts');closeAuth=closeAuthenticationPool;
  const {refreshDurableCashierStationCredentialAuthoritative:refresh,reconcileCashierRuntimeExpirationsAuthoritative:reconcile}=await import('../src/services/cashierRuntimeExpiryReconciliation.ts');
  for(const id of merchants){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,`+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
  }
  for(const kind of ['matching','other-merchant','disabled','revoked','stale-version','wrong-binding','future']){
    const id=randomUUID(),merchant=kind==='other-merchant'?merchants[1]:merchants[0];
    const device=`synthetic-device-${id}`,token=`synthetic-token-${id}`;
    const station=`housekeeping-station-${id}`,staff=`housekeeping-staff-${id}`,shift=`housekeeping-shift-${id}`;
    const credential=`housekeeping-credential-${id}`,pair=`housekeeping-pair-${id}`,session=`housekeeping-session-${id}`;
    const revoked=kind==='revoked',past=['matching','other-merchant'].includes(kind);
    await admin.query(`INSERT INTO merchant_cashier_stations(id,merchant_id,name,status,paired_device_id,paired_at,credential_version,revoked_at)
      VALUES($1,$2,'Synthetic',$3,$4,now(),1,CASE WHEN $3='revoked' THEN now() ELSE NULL END)`,[station,merchant,kind==='disabled'?'disabled':revoked?'revoked':'active',kind==='wrong-binding'?`different-${device}`:device]);
    await admin.query(`INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,pin_hash) VALUES($1,$2,'Synthetic',$3)`,[staff,merchant,hash('synthetic-pin')]);
    await admin.query(`INSERT INTO cashier_shifts(id,merchant_id,station_id,staff_id,started_at) VALUES($1,$2,$3,$4,now()-interval '2 days')`,[shift,merchant,station,staff]);
    await admin.query(`INSERT INTO cashier_station_credentials(id,merchant_id,station_id,device_id,token_hash,version,status,issued_at,expires_at,revoked_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,now()-interval '200 days',now()+$8::interval,CASE WHEN $7='revoked' THEN now() ELSE NULL END)`,[credential,merchant,station,device,hash(token),kind==='stale-version'?2:1,revoked?'revoked':kind==='other-merchant'||kind==='future'?'active':'expired',kind==='future'?'1 day':'-1 day']);
    await admin.query(`INSERT INTO cashier_station_pairing_challenges(id,merchant_id,station_id,code_hash,status,created_at,expires_at,revoked_at)
      VALUES($1,$2,$3,$4,$5,now()-interval '2 days',now()+$6::interval,CASE WHEN $5='revoked' THEN now() ELSE NULL END)`,[pair,merchant,station,hash(`pair-${id}`),revoked?'revoked':'active',past?'-1 day':'1 day']);
    await admin.query(`INSERT INTO cashier_operator_sessions(id,merchant_id,station_id,staff_id,shift_id,token_hash,staff_version,status,issued_at,last_seen_at,expires_at,revoked_at)
      VALUES($1,$2,$3,$4,$5,$6,1,$7,now()-interval '2 days',now()-interval '1 day',now()+$8::interval,CASE WHEN $7='revoked' THEN now() ELSE NULL END)`,[session,merchant,station,staff,shift,hash(`operator-${id}`),revoked?'revoked':'active',past?'-1 day':'1 day']);
    rows.push({kind,merchant,station,staff,shift,credential,pair,session,device,token});
  }
  const matching=rows.find(r=>r.kind==='matching'),other=rows.find(r=>r.kind==='other-merchant');
  const snapshot=async table=>(await admin.query(`SELECT * FROM ${table} WHERE merchant_id=ANY($1::text[]) ORDER BY id`,[merchants])).rows;
  const businessBefore={stations:await snapshot('merchant_cashier_stations'),staff:await snapshot('merchant_cashier_staff'),shifts:await snapshot('cashier_shifts')};
  main.query=async()=>{primaryCalls++;throw Error('housekeeping borrowed primary query');};
  main.connect=async()=>{primaryCalls++;throw Error('housekeeping borrowed primary lease');};

  await t.test('tenant and auth are independently authenticated non-owner LOGINs',async()=>{
    assert.deepEqual((await tenant.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    const authIdentity=await withAuthenticationTransaction(async c=>(await c.query(`SELECT session_user AS login,current_user AS active,rolsuper,rolbypassrls,rolcreaterole,
      EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owner FROM pg_roles r WHERE rolname=session_user`)).rows[0]);
    assert.deepEqual(authIdentity,{login:fixture.authRole,active:fixture.authRole,rolsuper:false,rolbypassrls:false,rolcreaterole:false,owner:false});
  });
  await t.test('tenant cannot read raw pairing/station secrets or mutate credential rows even with forged GUCs',async()=>{
    await tenant.query("SELECT set_config('fawri.tenant_id',$1,false),set_config('fawri.admin_account_id',$1,false)",[merchants[0]]);
    for(const table of ['cashier_station_credentials','cashier_station_pairing_challenges']){
      const column=table==='cashier_station_credentials'?'token_hash':'code_hash';
      for(const sql of [`SELECT ${column} FROM ${table}`,`UPDATE ${table} SET status='active'`,`DELETE FROM ${table}`,`TRUNCATE ${table}`,`INSERT INTO ${table}(id) VALUES('synthetic-forged')`])
        await assert.rejects(()=>tenant.query(sql),{code:'42501'});
    }
    await assert.rejects(()=>tenant.query(`SET ROLE ${fixture.authRole}`),{code:'42501'});
    assert.equal((await tenant.query('SELECT id,station_id,issued_at,expires_at FROM cashier_station_credentials WHERE id=$1',[matching.credential])).rows[0].id,matching.credential);
  });
  await t.test('blank, wrong-token and wrong-device refreshes leave all credentials unchanged',async()=>{
    const before=await snapshot('cashier_station_credentials');
    for(const input of [{stationToken:'',deviceId:matching.device},{stationToken:matching.token,deviceId:''},{stationToken:'wrong',deviceId:matching.device},{stationToken:matching.token,deviceId:'wrong'}])await refresh(input);
    assert.deepEqual(await snapshot('cashier_station_credentials'),before);
  });
  await t.test('disabled, revoked, stale-version and mismatched station bindings cannot be restored',async()=>{
    const before=await snapshot('cashier_station_credentials');
    for(const row of rows.filter(r=>['disabled','revoked','stale-version','wrong-binding'].includes(r.kind)))await refresh({stationToken:row.token,deviceId:row.device});
    assert.deepEqual(await snapshot('cashier_station_credentials'),before);
  });
  await t.test('only a valid token/device/current station binding is durably refreshed across merchants',async()=>{
    const before=await snapshot('cashier_station_credentials');
    await refresh({stationToken:matching.token,deviceId:matching.device});
    const after=await snapshot('cashier_station_credentials');
    assert.deepEqual(after.filter(r=>r.id!==matching.credential),before.filter(r=>r.id!==matching.credential));
    const restored=after.find(r=>r.id===matching.credential);assert.equal(restored.status,'active');assert.equal(restored.revoked_at,null);
    assert.ok(restored.expires_at.getTime()>Date.now()+179*86400000);
    await refresh({stationToken:other.token,deviceId:other.device});
    assert.equal((await snapshot('cashier_station_credentials')).find(r=>r.id===other.credential).status,'active');
  });
  await t.test('global housekeeping expires only elapsed active pairs/sessions and preserves shifts/stations/staff/credentials',async()=>{
    const credentials=await snapshot('cashier_station_credentials');
    assert.deepEqual(await reconcile(),{pairing_challenges_expired:2,station_credentials_expired:0,operator_sessions_expired:2});
    assert.deepEqual(await reconcile(),{pairing_challenges_expired:0,station_credentials_expired:0,operator_sessions_expired:0});
    for(const row of rows){
      const expected=['matching','other-merchant'].includes(row.kind)?'expired':row.kind==='revoked'?'revoked':'active';
      assert.equal((await admin.query('SELECT status FROM cashier_station_pairing_challenges WHERE id=$1',[row.pair])).rows[0].status,expected);
      assert.equal((await admin.query('SELECT status FROM cashier_operator_sessions WHERE id=$1',[row.session])).rows[0].status,expected);
    }
    assert.deepEqual(await snapshot('cashier_station_credentials'),credentials);
    assert.deepEqual({stations:await snapshot('merchant_cashier_stations'),staff:await snapshot('merchant_cashier_staff'),shifts:await snapshot('cashier_shifts')},businessBefore);
  });
  await t.test('second-statement privilege failure rolls back both expiry transitions',async()=>{
    await admin.query("UPDATE cashier_station_pairing_challenges SET status='active' WHERE id=$1",[matching.pair]);
    await admin.query("UPDATE cashier_operator_sessions SET status='active' WHERE id=$1",[matching.session]);
    await admin.query(`REVOKE UPDATE ON cashier_operator_sessions FROM ${fixture.authRole}`);
    try {await assert.rejects(()=>reconcile(),{code:'42501'});}
    finally {await admin.query(`GRANT UPDATE ON cashier_operator_sessions TO ${fixture.authRole}`);}
    assert.equal((await admin.query('SELECT status FROM cashier_station_pairing_challenges WHERE id=$1',[matching.pair])).rows[0].status,'active');
    assert.equal((await admin.query('SELECT status FROM cashier_operator_sessions WHERE id=$1',[matching.session])).rows[0].status,'active');
    assert.deepEqual(await reconcile(),{pairing_challenges_expired:1,station_credentials_expired:0,operator_sessions_expired:1});
  });
  await t.test('marker revoke and missing/tenant auth URL fail closed without primary fallback',async()=>{
    const invoke=()=>refresh({stationToken:matching.token,deviceId:matching.device});
    const before=await snapshot('cashier_station_credentials');
    await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM ${fixture.authRole}`);
    try {for(const work of [invoke,reconcile])await assert.rejects(work,{code:'AUTH_DATABASE_IDENTITY_INVALID'});}
    finally {await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${fixture.authRole}`);}
    for(const url of [undefined,process.env.DATABASE_URL]){
      await closeAuth();if(url===undefined)delete process.env.FAWRI_AUTH_DATABASE_URL;else process.env.FAWRI_AUTH_DATABASE_URL=url;
      try {for(const work of [invoke,reconcile])await assert.rejects(work,{code:url===undefined?'AUTH_DATABASE_REQUIRED':'AUTH_DATABASE_IDENTITY_INVALID'});}
      finally {await closeAuth();process.env.FAWRI_AUTH_DATABASE_URL=authUrl;}
    }
    assert.deepEqual(await snapshot('cashier_station_credentials'),before);
    await assert.doesNotReject(invoke);
  });
  await t.test('disabled PostgreSQL authority remains a no-op with unchanged data',async()=>{
    const before=await snapshot('cashier_station_credentials');
    process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='disabled';
    try {await refresh({stationToken:matching.token,deviceId:matching.device});assert.deepEqual(await reconcile(),{pairing_challenges_expired:0,station_credentials_expired:0,operator_sessions_expired:0});}
    finally {process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';}
    assert.deepEqual(await snapshot('cashier_station_credentials'),before);
  });
  assert.equal(primaryCalls,0);
  console.log('P0_CASHIER_HOUSEKEEPING_PROOF '+JSON.stringify({actualRestrictedLogins:2,protectedCredentialTables:2,tenantReadMutationDenied:true,ordinaryHistoryReadPreserved:true,matchingBindingOnly:true,expiredStationRestored:true,explicitRevocationPreserved:true,globalExpiryAtomic:true,shiftStaffStationPreserved:true,markerRevokeMissingTenantUrlDenied:true,primaryPoolCalls:primaryCalls,hostedCertified:false,releaseAccepted:false}));
});
