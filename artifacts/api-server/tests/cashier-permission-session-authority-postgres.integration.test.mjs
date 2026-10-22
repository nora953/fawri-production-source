import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
test('cashier permissions and operator sessions require the authentication LOGIN',{timeout:90000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const originalQuery=main.query,originalConnect=main.connect,saved={};
  let server,primaryCalls=0;
  const nonce=randomUUID(),merchants=[`permission-a-${nonce}`,`permission-b-${nonce}`];
  const manager=`permission-manager-${nonce}`,cashier=`permission-cashier-${nonce}`;
  const other=`permission-other-${nonce}`,members=[[manager,merchants[0],'manager'],[cashier,merchants[0],'cashier'],[other,merchants[1],'cashier']];
  t.after(()=>cleanupResources([
    ['main methods',async()=>{main.query=originalQuery;main.connect=originalConnect;}],
    ['HTTP server',()=>server?new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())):undefined],
    ['operator sessions',()=>admin.query('DELETE FROM cashier_operator_sessions WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['shifts',()=>admin.query('DELETE FROM cashier_shifts WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['stations',()=>admin.query('DELETE FROM merchant_cashier_stations WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['staff',()=>admin.query('DELETE FROM merchant_cashier_staff WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  for(const[k,v]of Object.entries({FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',FAWRI_AUTH_SECURITY_SECRET:'synthetic-cashier-permission-test-secret-at-least-32-characters',FAWRI_PASSWORD_SALT:'synthetic-permission-salt'})){saved[k]=process.env[k];process.env[k]=v;}
  const {enforceCashierDiscountOverrideRoleInvariant:harden}=await import('../src/services/cashierStaffDiscountRoleHardening.ts');
  const {closeAuthenticationPool:closeAuth}=await import('../src/services/authenticationPostgresAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const readinessEnv={...process.env,NODE_ENV:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused_operator@127.0.0.1/fawri_ci'};
  for(const id of merchants){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,`+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
    await admin.query("INSERT INTO merchant_cashier_subscriptions(id,merchant_id,status,licensed_seats,billing_period_start,billing_period_end) VALUES($1,$2,'active',3,now()-interval '1 day',now()+interval '30 days')",[`subscription-${id}`,id]);
  }
  for(const[id,merchant,role]of members){
    await admin.query('INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,role,pin_hash) VALUES($1,$2,$1,$3,$4)',[id,merchant,role,'synthetic-pin-hash-for-disposable-test-only']);
    await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[`station-${id}`,merchant]);
    await admin.query('INSERT INTO cashier_shifts(id,merchant_id,station_id,staff_id) VALUES($1,$2,$3,$4)',[`shift-${id}`,merchant,`station-${id}`,id]);
    await admin.query("INSERT INTO cashier_operator_sessions(id,merchant_id,station_id,staff_id,shift_id,token_hash,staff_version,permission_snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,1,$7::jsonb,now()+interval '1 day')",[`session-${id}`,merchant,`station-${id}`,id,`shift-${id}`,String(members.findIndex(m=>m[0]===id)+1).repeat(64),JSON.stringify(['sale.create','sale.discount','sale.discount_override'])]);
  }
  const seed=async id=>{
    const merchant=members.find(x=>x[0]===id)[1];
    await admin.query('DELETE FROM merchant_cashier_staff_permissions WHERE staff_id=$1',[id]);
    for(const permission of ['sale.create','sale.discount','sale.discount_override'])await admin.query('INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,$3)',[merchant,id,permission]);
    await admin.query('INSERT INTO merchant_cashier_staff_discount_policies(merchant_id,staff_id,enabled,max_percentage_bps,max_amount_minor,can_approve_override) VALUES($1,$2,true,5000,1000,true) ON CONFLICT(merchant_id,staff_id) DO UPDATE SET can_approve_override=true',[merchant,id]);
    await admin.query('UPDATE cashier_operator_sessions SET permission_snapshot=$2::jsonb WHERE staff_id=$1',[id,JSON.stringify(['sale.create','sale.discount','sale.discount_override'])]);
  };
  const state=async id=>({
    staff:(await admin.query('SELECT role,version FROM merchant_cashier_staff WHERE id=$1',[id])).rows[0],
    permissions:(await admin.query('SELECT permission FROM merchant_cashier_staff_permissions WHERE staff_id=$1 ORDER BY permission',[id])).rows.map(x=>x.permission),
    policy:(await admin.query('SELECT enabled,can_approve_override,version,max_amount_minor FROM merchant_cashier_staff_discount_policies WHERE staff_id=$1',[id])).rows[0],
    snapshot:(await admin.query('SELECT permission_snapshot FROM cashier_operator_sessions WHERE staff_id=$1',[id])).rows[0].permission_snapshot,
  });
  for(const[id]of members)await seed(id);
  await t.test('actual tenant LOGIN cannot mutate permissions/sessions or read session tokens',async()=>{
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    for(const table of ['merchant_cashier_staff_permissions','cashier_operator_sessions']){
      for(const sql of [`INSERT INTO ${table}(merchant_id) VALUES($1)`,`UPDATE ${table} SET merchant_id=$1 WHERE false`,`DELETE FROM ${table} WHERE merchant_id=$1`,`TRUNCATE ${table}`])await assert.rejects(()=>main.query(sql,sql.startsWith('TRUNCATE')?[]:[merchants[0]]),{code:'42501'});
    }
    await assert.rejects(()=>main.query('SELECT token_hash FROM cashier_operator_sessions'),{code:'42501'});
    assert.equal((await main.query('SELECT staff_id,permission_snapshot FROM cashier_operator_sessions WHERE staff_id=$1',[manager])).rows.length,1);
    await ready(readinessEnv,main);
  });
  await t.test('readiness rejects newly reachable mutation grants and accepts their revocation',async()=>{
    for(const table of ['merchant_cashier_staff_permissions','cashier_operator_sessions'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
      await admin.query(`GRANT ${privilege} ON ${table} TO ${fixture.role}`);
      try{await assert.rejects(()=>ready(readinessEnv,main),{code:'PRODUCTION_AUTH_MUTATION_AUTHORITY_REACHABLE'});}
      finally{await admin.query(`REVOKE ${privilege} ON ${table} FROM ${fixture.role}`);}
      await ready(readinessEnv,main);
    }
  });
  const forbidPrimary=()=>{main.query=async()=>{primaryCalls++;throw Error('permission hardening borrowed primary query');};main.connect=async()=>{primaryCalls++;throw Error('permission hardening borrowed primary lease');};};
  const restorePrimary=()=>{main.query=originalQuery;main.connect=originalConnect;};
  await t.test('non-manager cleanup is atomic, scoped, idempotent and uses only auth LOGIN',async()=>{
    const managerBefore=await state(manager),otherBefore=await state(other);forbidPrimary();
    try{
      assert.equal(await harden({merchantId:merchants[0],staffId:cashier}),true);
      assert.equal(await harden({merchantId:merchants[0],staffId:cashier}),false);
      assert.equal(await harden({merchantId:merchants[0],staffId:manager}),false);
      assert.equal(await harden({merchantId:merchants[0],staffId:other}),false);
      assert.equal(await harden({merchantId:merchants[0],staffId:'missing'}),false);
    }finally{restorePrimary();}
    const actual=await state(cashier);assert.deepEqual(actual.permissions,['sale.create','sale.discount']);assert.deepEqual(actual.snapshot,['sale.create','sale.discount']);assert.equal(actual.policy.can_approve_override,false);
    assert.deepEqual(await state(manager),managerBefore);assert.deepEqual(await state(other),otherBefore);assert.equal(primaryCalls,0);
  });
  await t.test('hardening SQL failure rolls back permission deletion and policy changes',async()=>{
    await seed(cashier);const before=await state(cashier);
    await admin.query(`REVOKE UPDATE ON cashier_operator_sessions FROM ${fixture.authRole}`);
    forbidPrimary();
    try{await assert.rejects(()=>harden({merchantId:merchants[0],staffId:cashier}),{code:'42501'});}
    finally{restorePrimary();await admin.query(`GRANT UPDATE ON cashier_operator_sessions TO ${fixture.authRole}`);}
    assert.deepEqual(await state(cashier),before);
  });
  const [{default:express},{default:cookieParser},{default:router},{authPostgresSessionAuthority:sessions}]=await Promise.all([import('express'),import('cookie-parser'),import('../src/routes/cashier-discount-policy-operations.ts'),import('../src/services/authPostgresSessionAuthority.ts')]);
  const app=express();app.use(cookieParser());app.use(express.json());app.use('/api',router);
  server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  const session=await sessions.issueSession({accountId:merchants[0],accountKind:'merchant',tenantId:merchants[0],deviceId:'synthetic-policy-device',deviceLabel:'Synthetic'});
  const request=async(id,version,patch={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/cashier/management/staff/${id}/discount-policy`,{method:'PUT',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Cookie:`fawri_merchant_session_v2=${session.token}`,'X-Fawri-Device-Id':'synthetic-policy-device'},body:JSON.stringify({expected_version:version,discount_policy:{enabled:true,max_percentage_bps:5000,max_amount_minor:700,can_approve_override:true},...patch})});
    return{status:response.status,body:await response.json()};
  };
  await t.test('real merchant HTTP policy update preserves role restrictions and refreshes active snapshots',async()=>{
    const otherBefore=await state(other);
    for(const id of [manager,cashier]){
      const before=await state(id),result=await request(id,Number(before.staff.version));assert.equal(result.status,200,JSON.stringify(result.body));
      const after=await state(id);assert.equal(after.staff.version,Number(before.staff.version)+1);assert.equal(after.policy.can_approve_override,id===manager);assert.equal(Number(after.policy.max_amount_minor),700);assert.deepEqual(after.snapshot,after.permissions);assert.ok(after.permissions.includes('sale.create'));assert.equal(after.permissions.includes('sale.discount_override'),id===manager);
    }
    const missing=await request(other,1);assert.equal(missing.status,404);assert.equal(missing.body.code,'CASHIER_STAFF_NOT_FOUND');assert.deepEqual(await state(other),otherBefore);
    const before=await state(manager),stale=await request(manager,1);assert.equal(stale.status,409);assert.equal(stale.body.code,'CASHIER_STAFF_VERSION_CONFLICT');assert.deepEqual(await state(manager),before);
  });
  await t.test('late HTTP snapshot failure rolls back policy, permissions and staff version',async()=>{
    const before=await state(manager);await admin.query(`REVOKE UPDATE ON cashier_operator_sessions FROM ${fixture.authRole}`);
    try{const result=await request(manager,Number(before.staff.version),{discount_policy:{enabled:false,max_percentage_bps:0,max_amount_minor:null,can_approve_override:false}});assert.equal(result.status,500);assert.equal(result.body.code,'CASHIER_DISCOUNT_POLICY_OPERATION_FAILED');}
    finally{await admin.query(`GRANT UPDATE ON cashier_operator_sessions TO ${fixture.authRole}`);}
    assert.deepEqual(await state(manager),before);
  });
  await t.test('marker revocation and missing/tenant auth URL fail without primary fallback',async()=>{
    const before=await state(cashier),url=process.env.FAWRI_AUTH_DATABASE_URL;forbidPrimary();
    await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM ${fixture.authRole}`);
    try{await assert.rejects(()=>harden({merchantId:merchants[0],staffId:cashier}),{code:'AUTH_DATABASE_IDENTITY_INVALID'});}
    finally{await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${fixture.authRole}`);}
    try{for(const candidate of [undefined,process.env.DATABASE_URL]){
      await closeAuth();if(candidate===undefined)delete process.env.FAWRI_AUTH_DATABASE_URL;else process.env.FAWRI_AUTH_DATABASE_URL=candidate;
      try{await assert.rejects(()=>harden({merchantId:merchants[0],staffId:cashier}),{code:candidate===undefined?'AUTH_DATABASE_REQUIRED':'AUTH_DATABASE_IDENTITY_INVALID'});}
      finally{await closeAuth();process.env.FAWRI_AUTH_DATABASE_URL=url;}
    }}finally{restorePrimary();}
    assert.deepEqual(await state(cashier),before);assert.equal(primaryCalls,0);
  });
  console.log('P0_CASHIER_PERMISSION_SESSION_PROOF '+JSON.stringify({actualRestrictedLogins:2,tenantMutationsDenied:true,tenantTokenReadDenied:true,ordinarySessionReadPreserved:true,readinessMutationGrantRevokeCases:12,nonManagerCleanupAtomicScopedIdempotent:true,managerPreserved:true,hardeningRollback:true,merchantHttpPolicyUpdate:true,staffVersionAndRoleRestrictionPreserved:true,activeSnapshotRefresh:true,crossMerchantAndStaleDenied:true,lateHttpFailureRollback:true,authMarkerMissingTenantUrlDenied:true,hardeningPrimaryPoolCalls:primaryCalls,staffMutationBoundaryOpen:true,hostedCertified:false,releaseAccepted:false}));
});
