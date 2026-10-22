import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';

await assertDisposablePostgres();
// Immutable6fe2d4a4 baseline retained; this regression requires authority denial.
test('enforce discount settings authority while preserving authorized management invariants',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,main=fixture.runtimePool;
  const merchants=[`kind-a-${randomUUID()}`,`kind-b-${randomUUID()}`],rows=[];
  const grantRole=`settings_acl_${randomUUID().replaceAll('-','')}`;let roleCreated=false,denialCases=0,grantCases=0,authClient;
  const saved={FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY,FAWRI_DEPLOYMENT_MODE:process.env.FAWRI_DEPLOYMENT_MODE};
  t.after(()=>cleanupResources([
    ['auth probe',()=>authClient?.end()],
    ['approvals',()=>admin.query('DELETE FROM merchant_cashier_discount_override_approvals WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['stations',()=>admin.query('DELETE FROM merchant_cashier_stations WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['staff',()=>admin.query('DELETE FROM merchant_cashier_staff WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['grant role privileges',()=>roleCreated?admin.query(`DROP OWNED BY ${grantRole}`):undefined],
    ['grant role',()=>roleCreated?admin.query(`DROP ROLE ${grantRole}`):undefined],
    ['runtime',()=>fixture.dispose()],
    ['environment',async()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';process.env.FAWRI_DEPLOYMENT_MODE='production';
  const {assertCashierOperatorManualDiscountAuthority:validate}=await import('../src/services/cashierOperatorDiscountAuthority.ts');
  const {withMerchantOperationalTransaction:primary}=await import('../src/services/operationalPostgresAuthority.ts');
  const {withMerchantAuthenticationTransaction:auth}=await import('../src/services/authenticationPostgresAuthority.ts');
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const {hashPassword}=await import('../src/services/authPasswordService.ts');
  const {issueCashierDiscountOverrideApprovalAuthoritative:issue,consumeCashierDiscountOverrideApproval:consume}=await import('../src/services/cashierDiscountOverrideAuthority.ts');
  const {loadMerchantCashierDiscountSetting:loadSetting,updateMerchantCashierDiscountSetting:updateSetting}=await import('../src/services/cashierMerchantDiscountSettingsAuthority.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  for(const merchant of merchants){
    const row={merchant,station:`station-${merchant}`,cashier:`cashier-${merchant}`,manager:`manager-${merchant}`};
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[merchant,`+196${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[merchant]);
    await admin.query("INSERT INTO merchant_cashier_stations(id,merchant_id,name) VALUES($1,$2,'Synthetic')",[row.station,merchant]);
    await admin.query("INSERT INTO merchant_cashier_discount_settings(merchant_id,discount_kind) VALUES($1,'amount')",[merchant]);
    for(const[id,role]of [[row.cashier,'cashier'],[row.manager,'manager']]){
      await admin.query("INSERT INTO merchant_cashier_staff(id,merchant_id,display_name,role,pin_hash) VALUES($1,$2,'Synthetic',$3,$4)",[id,merchant,role,hashPassword('1357')]);
      await admin.query('INSERT INTO merchant_cashier_staff_permissions(merchant_id,staff_id,permission) VALUES($1,$2,$3)',[merchant,id,role==='manager'?'sale.discount_override':'sale.discount']);
      await admin.query('INSERT INTO merchant_cashier_staff_discount_policies(merchant_id,staff_id,enabled,max_percentage_bps,max_amount_minor,can_approve_override) VALUES($1,$2,true,10000,$3,$4)',[merchant,id,role==='manager'?500:100,role==='manager']);
    }
    row.input={context:{merchant_id:merchant,station_id:row.station,staff_id:row.cashier,permissions:['sale.discount']},body:{envelopes:[{entity_type:'sale',operation:'append',operation_id:`policy-op-${randomUUID()}`,occurred_at:new Date().toISOString(),payload:{lines:[{line_total_minor:1000}],manual_discount_minor:250,manual_discount_kind:'amount',manual_discount_reason:'synthetic authority probe'}}]}};
    rows.push(row);
  }
  const snapshot=async merchant=>{
    const result={};
    for(const table of ['merchant_cashier_staff','merchant_cashier_staff_permissions','merchant_cashier_staff_discount_policies','merchant_cashier_discount_settings','merchant_cashier_discount_override_approvals','cashier_operator_sessions']){
      result[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=$1 ORDER BY to_jsonb(t)::text`,[merchant])).rows;
    }
    return result;
  };
  const [a,b]=rows,observations={};
  const envelope=a.input.body.envelopes[0];
  const request={context:a.input.context,approverStaffId:a.manager,pin:'1357',operationId:envelope.operation_id,manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'amount',reason:envelope.payload.manual_discount_reason};
  const approval=await issue(request);
  const beforeA=await snapshot(a.merchant),beforeB=await snapshot(b.merchant);
  const original=(await admin.query('SELECT discount_kind,version,created_at::text,updated_at::text FROM merchant_cashier_discount_settings WHERE merchant_id=$1',[a.merchant])).rows[0];
  const approvalRow=(await admin.query('SELECT to_jsonb(t) AS row FROM merchant_cashier_discount_override_approvals t WHERE id=$1',[approval.approval_id])).rows[0].row;
  const percentageInput=JSON.parse(JSON.stringify(a.input));percentageInput.body.envelopes[0].payload.manual_discount_kind='percentage';
  const consumeInput={merchantId:a.merchant,stationId:a.station,operatorStaffId:a.cashier,operationId:request.operationId,approvalId:approval.approval_id,saleOccurredAt:new Date().toISOString(),manualDiscountMinor:250,discountBaseMinor:1000,discountKind:'percentage',reason:request.reason};
  const restore=()=>auth(a.merchant,async c=>{
    await c.query('UPDATE merchant_cashier_discount_settings SET discount_kind=$2,version=$3,created_at=$4,updated_at=$5 WHERE merchant_id=$1',[a.merchant,original.discount_kind,original.version,original.created_at,original.updated_at]);
    await c.query('DELETE FROM merchant_cashier_discount_override_approvals WHERE merchant_id=$1 AND id=$2',[a.merchant,approval.approval_id]);
    await c.query('INSERT INTO merchant_cashier_discount_override_approvals SELECT * FROM jsonb_populate_record(NULL::public.merchant_cashier_discount_override_approvals,$1::jsonb)',[JSON.stringify(approvalRow)]);
  });
  await t.test('actual role and original settings enforce ordinary approval and tenant boundaries',async()=>{
    assert.deepEqual((await main.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.role,active:fixture.role});
    for(const row of rows)await assert.rejects(()=>validate(row.input),{code:'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED'});
    await assert.rejects(()=>validate(percentageInput),{code:'CASHIER_DISCOUNT_KIND_MISMATCH'});
    await assert.rejects(()=>primary(a.merchant,c=>c.query('UPDATE merchant_cashier_discount_settings SET version=version WHERE merchant_id=$1',[b.merchant])),{code:'42501'});
    for(const row of rows)await primary(row.merchant,async c=>assert.deepEqual((await c.query('SELECT merchant_id FROM merchant_cashier_discount_settings WHERE merchant_id=ANY($1::text[])',[merchants])).rows,[{merchant_id:row.merchant}]));
    await ready(env,main);assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('measure configuration mutation admission and unchanged business validation then restore exactly',async()=>{
    try{
      try{await primary(a.merchant,async c=>assert.equal((await c.query("UPDATE merchant_cashier_discount_settings SET discount_kind='percentage',version=version+1,updated_at=now() WHERE merchant_id=$1 RETURNING merchant_id",[a.merchant])).rows.length,1));observations.primaryMutation='ACCEPTED';}
      catch(e){if(e.code!=='42501')throw e;observations.primaryMutation='DENIED_42501';}
      try{await ready(env,main);observations.readiness='ACCEPTED';}catch(e){observations.readiness='REJECTED';observations.readinessCode=e.code;}
      assert.equal(observations.primaryMutation,'DENIED_42501');
      assert.equal(observations.readiness,'ACCEPTED');
      await assert.rejects(()=>validate(percentageInput),{code:'CASHIER_DISCOUNT_KIND_MISMATCH'});
      if(observations.primaryMutation==='ACCEPTED'){
        try{await validate(percentageInput);observations.actualValidator='ACCEPTED';}catch(e){observations.actualValidator='REJECTED';observations.validatorCode=e.code;}
        const pending=(await admin.query('SELECT consumed_at FROM merchant_cashier_discount_override_approvals WHERE id=$1',[approval.approval_id])).rows;
        observations.pendingEvidenceRetained=pending.length===1&&pending[0].consumed_at===null;
        if(observations.pendingEvidenceRetained){try{await primary(a.merchant,c=>consume(c,consumeInput));observations.actualConsumer='ACCEPTED';}catch(e){observations.actualConsumer='REJECTED';observations.consumerCode=e.code;}}
      }
      const during=await snapshot(a.merchant);
      for(const table of Object.keys(beforeA).filter(x=>!['merchant_cashier_discount_settings','merchant_cashier_discount_override_approvals'].includes(x)))assert.deepEqual(during[table],beforeA[table]);
      assert.deepEqual(await snapshot(b.merchant),beforeB);
    }finally{await restore();}
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
    await assert.rejects(()=>validate(a.input),{code:'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED'});
    await ready(env,main);
  });
  await t.test('authorized management retains version checks and atomic pending-only invalidation',async()=>{
    try{
      const updated=await auth(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:Number(original.version),discountKind:'percentage'}));
      assert.equal(updated.discount_kind,'percentage');assert.equal(updated.version,Number(original.version)+1);
      assert.equal((await admin.query('SELECT id FROM merchant_cashier_discount_override_approvals WHERE id=$1',[approval.approval_id])).rows.length,0);
      await assert.rejects(()=>primary(a.merchant,c=>consume(c,consumeInput)),{code:'CASHIER_DISCOUNT_OVERRIDE_INVALID'});
      await assert.rejects(()=>auth(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:Number(original.version),discountKind:'amount'})),{code:'CASHIER_DISCOUNT_KIND_VERSION_CONFLICT'});
      observations.authorizedManagement=true;
    }finally{await restore();}
    await assert.rejects(()=>auth(a.merchant,async c=>{await updateSetting(c,{merchantId:a.merchant,expectedVersion:Number(original.version),discountKind:'percentage'});throw Error('settings rollback');}),{message:'settings rollback'});
    await assert.rejects(()=>primary(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:Number(original.version),discountKind:'percentage'})),{code:'42501'});
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  const settingFunction='public.fawri_lock_cashier_discount_setting(text)';
  await t.test('scoped locking and trusted authentication retain identity and cold-start behavior',async()=>{
    const {Client}=await import('pg');authClient=new Client({connectionString:process.env.FAWRI_AUTH_DATABASE_URL,connectionTimeoutMillis:5000});await authClient.connect();
    assert.deepEqual((await authClient.query('SELECT session_user AS login,current_user AS active')).rows[0],{login:fixture.authRole,active:fixture.authRole});
    await assert.rejects(()=>main.query('SELECT * FROM public.fawri_lock_cashier_discount_setting($1)',[a.merchant]),{code:'42501'});
    const bare=await main.connect();try{await bare.query('BEGIN');await bare.query("SELECT set_config('fawri.tenant_id',$1,true)",[a.merchant]);await assert.rejects(()=>bare.query('SELECT * FROM public.fawri_lock_cashier_discount_setting($1)',[a.merchant]),{code:'42501'});}finally{await bare.query('ROLLBACK');bare.release();}
    await assert.rejects(()=>primary(a.merchant,c=>loadSetting(c,b.merchant,true)),{code:'42501'});
    await auth(a.merchant,async c=>assert.deepEqual(await loadSetting(c,a.merchant,true),{discount_kind:'amount',version:Number(original.version)}));
    await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM ${fixture.authRole}`);
    try{await assert.rejects(()=>authClient.query('SELECT * FROM public.fawri_lock_cashier_discount_setting($1)',[a.merchant]),{code:'42501'});}
    finally{await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_authentication_runtime() TO ${fixture.authRole}`);}
    try{
      await auth(a.merchant,c=>c.query('DELETE FROM merchant_cashier_discount_settings WHERE merchant_id=$1',[a.merchant]));
      await primary(a.merchant,async c=>assert.deepEqual(await loadSetting(c,a.merchant,true),{discount_kind:'amount',version:0}));
      const created=await auth(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:0,discountKind:'percentage'}));assert.deepEqual(created,{discount_kind:'percentage',version:1});
      await assert.rejects(()=>auth(a.merchant,c=>updateSetting(c,{merchantId:a.merchant,expectedVersion:0,discountKind:'amount'})),{code:'CASHIER_DISCOUNT_KIND_VERSION_CONFLICT'});
    }finally{await restore();}
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('the settings row remains locked for the caller commerce transaction',async()=>{
    const {issueMerchantTransactionScope:scope}=await import('../src/services/tenantTransactionScope.ts');
    for(const completion of ['COMMIT','ROLLBACK']){
      const c=await main.connect();try{
        await c.query('BEGIN');await scope(c,a.merchant);await loadSetting(c,a.merchant,true);
        await authClient.query('BEGIN');await authClient.query("SET LOCAL lock_timeout='150ms'");
        await assert.rejects(()=>authClient.query('UPDATE merchant_cashier_discount_settings SET version=version WHERE merchant_id=$1',[a.merchant]),{code:'55P03'});await authClient.query('ROLLBACK');
        await c.query(completion);
        assert.equal((await authClient.query('UPDATE merchant_cashier_discount_settings SET version=version WHERE merchant_id=$1 RETURNING merchant_id',[a.merchant])).rows.length,1);
      }finally{await c.query('ROLLBACK');await authClient.query('ROLLBACK');c.release();}
    }
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('direct mutation and reachable grant matrices protect every settings column',async()=>{
    const table='merchant_cashier_discount_settings';const columns=(await admin.query("SELECT attname FROM pg_attribute WHERE attrelid='public.merchant_cashier_discount_settings'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows.map(x=>x.attname);
    for(const column of columns){await assert.rejects(()=>primary(a.merchant,c=>c.query(`UPDATE ${table} SET ${column}=${column} WHERE merchant_id=$1`,[a.merchant])),{code:'42501'});denialCases++;}
    for(const sql of [`INSERT INTO ${table} SELECT * FROM ${table} WHERE FALSE`,`DELETE FROM ${table} WHERE merchant_id=$1`,`TRUNCATE TABLE ${table}`]){await assert.rejects(()=>primary(a.merchant,c=>c.query(sql,sql.includes('$1')?[a.merchant]:[])),{code:'42501'});denialCases++;}
    await admin.query(`CREATE ROLE ${grantRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOINHERIT`);roleCreated=true;
    const privileges=['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES',...columns.flatMap(column=>[`UPDATE(${column})`,`INSERT(${column})`,`REFERENCES(${column})`])];
    const c=await main.connect();try{for(const privilege of privileges)for(const mode of ['direct','public','inherit-only','set-reachable','unreachable']){
      const grantee=mode==='direct'?fixture.role:mode==='public'?'PUBLIC':grantRole;
      try{
        await admin.query(`GRANT ${privilege} ON public.${table} TO ${grantee}`);
        if(!['direct','public'].includes(mode))await admin.query(`GRANT ${grantRole} TO ${fixture.role} WITH INHERIT ${mode==='inherit-only'?'TRUE':'FALSE'}, SET ${mode==='set-reachable'?'TRUE':'FALSE'}`);
        if(mode==='unreachable'){await ready(env,c);await assert.rejects(()=>c.query(`SET ROLE ${grantRole}`),{code:'42501'});}
        else{await assert.rejects(()=>ready(env,c),{code:'PRODUCTION_AUTH_MUTATION_AUTHORITY_REACHABLE'});if(mode==='direct')await admin.query(`GRANT ${grantRole} TO ${fixture.role} WITH INHERIT FALSE, SET TRUE`);if(['direct','set-reachable'].includes(mode)){await c.query(`SET ROLE ${grantRole}`);await assert.rejects(()=>ready(env,c),{code:'PRODUCTION_AUTH_MUTATION_AUTHORITY_REACHABLE'});}}
        grantCases++;
      }finally{await c.query('RESET ROLE');if(mode!=='public')await admin.query(`REVOKE ${grantRole} FROM ${fixture.role}`);await admin.query(`REVOKE ${privilege} ON public.${table} FROM ${grantee}`);}
      await ready(env,c);
    }}finally{await c.query('RESET ROLE');c.release();}
    assert.deepEqual(await snapshot(a.merchant),beforeA);assert.deepEqual(await snapshot(b.merchant),beforeB);
  });
  await t.test('readiness requires a safe callable strict settings capability and unreachable owner',async()=>{
    for(const[change,restoreFn]of [['SECURITY INVOKER','SECURITY DEFINER'],['STABLE','VOLATILE'],['CALLED ON NULL INPUT','RETURNS NULL ON NULL INPUT'],['SET search_path=public','SET search_path=pg_catalog']]){
      await admin.query(`ALTER FUNCTION ${settingFunction} ${change}`);try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_CASHIER_APPROVAL_AUTHORITY_REQUIRED'});}finally{await admin.query(`ALTER FUNCTION ${settingFunction} ${restoreFn}`);}await ready(env,main);
    }
    await admin.query(`REVOKE EXECUTE ON FUNCTION ${settingFunction} FROM PUBLIC`);try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_CASHIER_APPROVAL_AUTHORITY_REQUIRED'});}finally{await admin.query(`GRANT EXECUTE ON FUNCTION ${settingFunction} TO PUBLIC`);}
    await admin.query(`ALTER FUNCTION ${settingFunction} RENAME TO fawri_lock_cashier_discount_setting_missing_probe`);try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_CASHIER_APPROVAL_AUTHORITY_REQUIRED'});}finally{await admin.query('ALTER FUNCTION public.fawri_lock_cashier_discount_setting_missing_probe(text) RENAME TO fawri_lock_cashier_discount_setting');}
    const owner=(await admin.query("SELECT pg_get_userbyid(proowner) AS name FROM pg_proc WHERE oid='public.fawri_lock_cashier_discount_setting(text)'::regprocedure")).rows[0].name;
    await admin.query(`ALTER FUNCTION ${settingFunction} OWNER TO ${grantRole}`);await admin.query(`GRANT ${grantRole} TO ${fixture.role} WITH INHERIT FALSE, SET TRUE`);
    try{await assert.rejects(()=>ready(env,main),{code:'PRODUCTION_CASHIER_APPROVAL_AUTHORITY_REQUIRED'});}
    finally{await admin.query(`REVOKE ${grantRole} FROM ${fixture.role}`);await admin.query(`ALTER FUNCTION ${settingFunction} OWNER TO "${owner.replaceAll('"','""')}"`);}
    await ready(env,main);
  });
  console.log('P0_CASHIER_DISCOUNT_SETTINGS_AUTHORITY_REMEDIATION '+JSON.stringify({diagnosticOnly:false,denialCases,grantCases,actualLogins:2,merchants:2,observations,authorizedManagementVersionInvalidationRollback:true,crossTenantDenied:true,exactSnapshotRestoration:true,httpSaleExecuted:false,hostedCertified:false,releaseAccepted:false}));
});
