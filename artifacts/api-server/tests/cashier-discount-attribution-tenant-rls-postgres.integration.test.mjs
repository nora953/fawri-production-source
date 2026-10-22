import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
test('cashier discounts approvals and attribution preserve business transactions under tenant RLS',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const tables=['merchant_cashier_discount_settings','merchant_cashier_staff_discount_policies','merchant_cashier_discount_override_approvals','cashier_operation_attribution'];
  const merchants=[`discount-a-${randomUUID()}`,`discount-b-${randomUUID()}`],rows=[];
  const saved={FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY,FAWRI_DEPLOYMENT_MODE:process.env.FAWRI_DEPLOYMENT_MODE};
  let authClient;
  t.after(()=>cleanupResources([
    ['auth SQL probe',()=>authClient?.end()],
    ...['merchant_cashier_discount_override_approvals','cashier_operation_attribution','cashier_shifts','merchant_cashier_stations','merchant_cashier_staff'].map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';process.env.FAWRI_DEPLOYMENT_MODE='production';
  const {issueMerchantTransactionScope:scope}=await import('../src/services/tenantTransactionScope.ts');
  const {withAuthenticationTransaction:auth}=await import('../src/services/authenticationPostgresAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const {hashPassword}=await import('../src/services/authPasswordService.ts');
  const {issueCashierDiscountOverrideApprovalAuthoritative:issue,consumeCashierDiscountOverrideApproval:consume}=await import('../src/services/cashierDiscountOverrideAuthority.ts');
  const {updateMerchantCashierDiscountSetting:updateSetting,lockMerchantCashierDiscountKindMutation:kindLock}=await import('../src/services/cashierMerchantDiscountSettingsAuthority.ts');
  const {upsertCashierDiscountPolicy:upsertPolicy}=await import('../src/services/cashierDiscountPolicyAuthority.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  const tx=async(merchant,work,commit=false)=>{const c=await main.connect();try{await c.query('BEGIN');await scope(c,merchant);const result=await work(c);await c.query(commit?'COMMIT':'ROLLBACK');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
  const request=row=>({context:{merchant_id:row.merchant,station_id:row.station,staff_id:row.cashier,permissions:['sale.discount']},approverStaffId:row.manager,pin:'1357',operationId:`operation-${randomUUID()}`,manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:'synthetic discount'});
  const use=(row,req,approval)=>({merchantId:row.merchant,stationId:row.station,operatorStaffId:row.cashier,operationId:req.operationId,approvalId:approval.approval_id,saleOccurredAt:new Date().toISOString(),manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:'synthetic discount'});
  for(const merchant of merchants){
    const row={merchant,station:`station-${merchant}`,cashier:`cashier-${merchant}`,manager:`manager-${merchant}`,shift:`shift-${merchant}`,attribution:`attribution-${merchant}`};
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchant,`+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
    await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[row.station,merchant]);
    await admin.query("INSERT INTO merchant_cashier_discount_settings(merchant_id,discount_kind) VALUES($1,'amount')",[merchant]);
    for(const[id,role,pin]of [[row.cashier,'cashier','2468'],[row.manager,'manager','1357']]){
      await admin.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,role,pin_hash) VALUES($1,$2,'Synthetic',$3,$4)",[id,merchant,role,hashPassword(pin)]);
      await admin.query('INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,$3)',[merchant,id,role==='manager'?'sale.discount_override':'sale.discount']);
      await admin.query('INSERT INTO merchant_cashier_staff_discount_policies(merchant_id,staff_id,enabled,max_percentage_bps,max_amount_minor,can_approve_override) VALUES($1,$2,true,10000,$3,$4)',[merchant,id,role==='manager'?500:100,role==='manager']);
    }
    await admin.query('INSERT INTO cashier_shifts(id,merchant_id,station_id,staff_id) VALUES($1,$2,$3,$4)',[row.shift,merchant,row.station,row.cashier]);
    await admin.query("INSERT INTO cashier_operation_attribution(id,merchant_id,operation_id,sale_id,operation_kind,station_id,staff_id,shift_id,device_id,station_credential_id,operator_session_id,occurred_at) VALUES($1,$2,$3,$4,'sale',$5,$6,$7,'synthetic-device','synthetic-credential','synthetic-session',now())",[row.attribution,merchant,`attribution-op-${merchant}`,`sale-${merchant}`,row.station,row.cashier,row.shift]);
    const req=request(row),approved=await issue(req);await tx(merchant,c=>consume(c,use(row,req,approved)),true);
    row.pendingRequest=request(row);row.pendingApproval=await issue(row.pendingRequest);rows.push(row);
  }
  const {Client}=await import('pg');authClient=new Client({connectionString:process.env.FAWRI_AUTH_DATABASE_URL,connectionTimeoutMillis:5000});await authClient.connect();
  const read=(c,table)=>c.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id`,[merchants]).then(x=>x.rows);
  const snapshot=async merchant=>{const value={};for(const table of tables)value[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=$1 ORDER BY to_jsonb(t)::text`,[merchant])).rows;return value;};
  const counts={merchant_cashier_discount_settings:1,merchant_cashier_staff_discount_policies:2,merchant_cashier_discount_override_approvals:2,cashier_operation_attribution:1};
  await t.test('catalog RLS and both merchant scopes protect all four tables without GUC trust',async()=>{
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    const catalog=(await main.query("SELECT c.relname,c.relrowsecurity,row_security_active(c.oid) AS active,p.polname,pg_get_expr(p.polqual,p.polrelid) AS using,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_policy p ON p.polrelid=c.oid WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[tables])).rows;
    assert.equal(catalog.length,4);for(const row of catalog){assert.equal(row.relrowsecurity,true);assert.equal(row.active,true);assert.equal(row.polname,row.relname+'_tenant_boundary');assert.match(row.using,/fawri_tenant_or_audited_admin\(merchant_id\)/);assert.equal(row.using,row.check);}
    for(const table of tables)assert.deepEqual(await read(main,table),[]);
    const c=await main.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('fawri.tenant_id',$1,true),set_config('fawri.admin_account_id','forged',true),set_config('fawri.admin_audit_id','forged',true)",[merchants[0]]);for(const table of tables)assert.deepEqual(await read(c,table),[]);}finally{await c.query('ROLLBACK');c.release();}
    for(const merchant of merchants)await tx(merchant,async c=>{await c.query("SELECT set_config('fawri.tenant_id',$1,true)",[merchants.find(x=>x!==merchant)]);for(const table of tables)assert.deepEqual(await read(c,table),Array.from({length:counts[table]},()=>({merchant_id:merchant})));});
    for(const table of tables)assert.deepEqual(await read(main,table),[]);await ready(env,main);
  });
  await t.test('cross-merchant writes disappear or reject WITH CHECK while own business writes roll back',async()=>{
    const a=rows[0],b=rows[1],beforeA=await snapshot(a.merchant),beforeB=await snapshot(b.merchant);
    await tx(a.merchant,async c=>{for(const table of tables){assert.equal((await c.query(`UPDATE ${table} SET merchant_id=$1 WHERE merchant_id=$1 RETURNING merchant_id`,[b.merchant])).rows.length,0);assert.equal((await c.query(`DELETE FROM ${table} WHERE merchant_id=$1 RETURNING merchant_id`,[b.merchant])).rows.length,0);}});
    for(const table of tables)await assert.rejects(()=>tx(a.merchant,c=>c.query(`UPDATE ${table} SET merchant_id=$1 WHERE merchant_id=$2`,[b.merchant,a.merchant])),{code:'42501'});
    const foreignInserts=[
      c=>c.query("INSERT INTO merchant_cashier_discount_settings(merchant_id) VALUES($1)",[b.merchant]),
      c=>c.query("INSERT INTO merchant_cashier_staff_discount_policies(merchant_id,staff_id) VALUES($1,$2)",[b.merchant,b.cashier]),
      c=>c.query("INSERT INTO merchant_cashier_discount_override_approvals(id,merchant_id,station_id,operator_staff_id,approver_staff_id,operation_id,manual_discount_minor,manual_discount_reason,expires_at) VALUES($1,$2,$3,$4,$5,$6,250,'foreign',now()+interval '1 minute')",[`foreign-approval-${randomUUID()}`,b.merchant,b.station,b.cashier,b.manager,`foreign-op-${randomUUID()}`]),
      c=>c.query("INSERT INTO cashier_operation_attribution(id,merchant_id,operation_id,sale_id,operation_kind,station_id,staff_id,shift_id,device_id,station_credential_id,operator_session_id,occurred_at) VALUES($1,$2,$3,'foreign-sale','sale',$4,$5,$6,'device','credential','session',now())",[`foreign-attribution-${randomUUID()}`,b.merchant,`foreign-op-${randomUUID()}`,b.station,b.cashier,b.shift]),
    ];for(const execute of foreignInserts)await assert.rejects(()=>tx(a.merchant,execute),{code:'42501'});
    await tx(a.merchant,async c=>{await upsertPolicy(c,{merchantId:a.merchant,staffId:a.cashier,policy:{enabled:true,max_percentage_bps:10000,max_amount_minor:125,can_approve_override:false}});assert.equal((await c.query("UPDATE cashier_operation_attribution SET device_id='own-change' WHERE id=$1 RETURNING id",[a.attribution])).rows.length,1);});
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('trusted auth remains global without tenant GUC and marker revocation hides every table',async()=>{
    await auth(async c=>{assert.deepEqual((await c.query("SELECT session_user AS login,current_user AS active,nullif(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0],{login:fixture.authRole,active:fixture.authRole,tenant:null});for(const table of tables)assert.equal((await read(c,table)).length,counts[table]*2);});
    await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM ${fixture.authRole}`);
    try{for(const table of tables)assert.deepEqual(await read(authClient,table),[]);await assert.rejects(()=>auth(c=>read(c,tables[0])),{code:'AUTH_DATABASE_IDENTITY_INVALID'});}
    finally{await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${fixture.authRole}`);}
  });
  await t.test('actual approval consumption preserves binding rollback replay and concurrent single mutation',async()=>{
    const a=rows[0],b=rows[1],beforeB=await snapshot(b.merchant),input=use(a,a.pendingRequest,a.pendingApproval);
    await assert.rejects(()=>tx(a.merchant,c=>consume(c,{...input,approvalId:b.pendingApproval.approval_id,operationId:b.pendingRequest.operationId}),true),{code:'CASHIER_DISCOUNT_OVERRIDE_INVALID'});
    await assert.rejects(()=>tx(a.merchant,async c=>{await consume(c,input);throw Error('synthetic consume rollback');},true),{message:'synthetic consume rollback'});
    assert.equal((await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[input.approvalId])).rows[0].consumed_at,null);
    let updates=0;await Promise.all([1,2].map(()=>tx(a.merchant,c=>consume({query:async(sql,values)=>{if(sql.includes('SET consumed_at = now()'))updates++;return c.query(sql,values);}},input),true)));assert.equal(updates,1);
    const consumed=(await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[input.approvalId])).rows[0].consumed_at;assert.ok(consumed);
    await tx(a.merchant,c=>consume(c,input),true);assert.deepEqual((await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[input.approvalId])).rows[0].consumed_at,consumed);
    await assert.rejects(()=>tx(a.merchant,c=>consume(c,{...input,reason:'changed-reason'}),true),{code:'CASHIER_DISCOUNT_OVERRIDE_INVALID'});
    await assert.rejects(()=>tx(a.merchant,c=>consume(c,{...input,saleOccurredAt:new Date(Date.now()+3600000).toISOString()}),true),{code:'CASHIER_DISCOUNT_OVERRIDE_EXPIRED'});assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('kind change atomically invalidates only own pending approvals and preserves version checks',async()=>{
    const a=rows[0],b=rows[1],fresh=await issue(request(a)),beforeA=await snapshot(a.merchant),beforeB=await snapshot(b.merchant);
    await assert.rejects(()=>tx(a.merchant,async c=>{await updateSetting(c,{merchantId:a.merchant,expectedVersion:1,discountKind:'percentage'});throw Error('synthetic kind rollback');},true),{message:'synthetic kind rollback'});assert.deepEqual(await snapshot(a.merchant),beforeA);
    const updated=await tx(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:1,discountKind:'percentage'}),true);assert.deepEqual(updated,{discount_kind:'percentage',version:2});
    assert.equal((await admin.query('SELECT id FROM merchant_cashier_discount_override_approvals WHERE id=$1',[fresh.approval_id])).rows.length,0);
    const status=(await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE merchant_id=$1',[a.merchant])).rows;assert.equal(status.length,2);assert.ok(status.every(x=>x.consumed_at!==null));
    await assert.rejects(()=>tx(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:1,discountKind:'amount'}),true),{code:'CASHIER_DISCOUNT_KIND_VERSION_CONFLICT'});
    await assert.rejects(()=>issue(request(a)),{code:'CASHIER_DISCOUNT_KIND_MISMATCH'});assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('primary kind mutation and auth issuance retain their shared advisory transaction lock',async()=>{
    const c=await main.connect();try{await c.query('BEGIN');await scope(c,merchants[0]);await kindLock(c,merchants[0]);await authClient.query('BEGIN');await authClient.query("SET LOCAL lock_timeout='150ms'");await assert.rejects(()=>kindLock(authClient,merchants[0]),{code:'55P03'});await authClient.query('ROLLBACK');await c.query('COMMIT');await authClient.query('BEGIN');await kindLock(authClient,merchants[0]);await authClient.query('ROLLBACK');}finally{await c.query('ROLLBACK');await authClient.query('ROLLBACK');c.release();}
  });
  await t.test('production rejects disabled RLS on each new business table and accepts restoration',async()=>{
    for(const table of tables){await admin.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_DATABASE_TENANT_RLS_REQUIRED'});}finally{await admin.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);}await ready(env,main);}
  });
  console.log('P0_CASHIER_DISCOUNT_ATTRIBUTION_RLS_PROOF '+JSON.stringify({actualRestrictedLogins:2,protectedTables:4,catalogAndPrivateScopeIsolation:true,unscopedForgedGucHidden:true,crossMerchantUpdateDeleteHidden:true,crossMerchantInsertRebindDenied:true,ownPolicyAttributionRollback:true,authGlobalAndMarkerRevocation:true,realAuthApprovalIssueBothMerchants:true,realPrimaryConsumeBindingRollbackReplayConcurrency:true,consumptionUpdatesOnce:true,kindChangePendingOnlyOwnAndAtomicRollback:true,versionAndKindMismatchPreserved:true,sharedAdvisoryLockPreserved:true,disabledRlsAdmissionCases:4,attributionFullHttpCoverage:'existing isolated suites',sameTenantCredentialIntegrityNotCertified:true,hostedCertified:false,releaseAccepted:false}));
});
