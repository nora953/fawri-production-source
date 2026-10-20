import assert from 'node:assert/strict';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
const send=message=>process.connected?new Promise(resolve=>process.send(message,resolve)):Promise.resolve();
let handled=false;
process.on('message',async task=>{
  if(handled)return;handled=true;let pool;
  try{
    assert.match(task.role,/^billing_discovery_[a-f0-9]+$/);
    Object.assign(process.env,task.providerEnv);
    assert.match(task.runtimePassword || '',/^[a-f0-9]{32}$/);
    const runtimeUrl=new URL(process.env.DATABASE_URL);
    runtimeUrl.username=task.role;runtimeUrl.password=task.runtimePassword;
    runtimeUrl.searchParams.delete('options');
    process.env.DATABASE_URL=runtimeUrl.toString();
    delete task.runtimePassword;
    ({pool}=await import('@workspace/db'));pool.options.max=1;
    await pool.query('RESET ROLE');
    const flags=(await pool.query("SELECT current_user AS role,session_user AS login,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owns_table FROM pg_roles r WHERE rolname=current_user")).rows[0];
    assert.deepEqual(flags,{role:task.role,login:task.role,rolsuper:false,rolbypassrls:false,owns_table:false});
    const {assertProductionDatabaseRlsReady}=await import('../../src/services/postgresRuntimeRlsSecurity.ts');
    await assertProductionDatabaseRlsReady({NODE_ENV:'production',FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_OPERATOR_DATABASE_URL:'postgresql://operator@127.0.0.1/fawri_ci'},pool);
    const context=async()=>(await pool.query("SELECT coalesce(current_setting('fawri.tenant_id',true),'') AS tenant,coalesce(current_setting('fawri.admin_audit_id',true),'') AS audit,coalesce(current_setting('fawri.admin_account_id',true),'') AS admin")).rows[0];
    const naked=async()=>(await pool.query('SELECT (SELECT count(*)::int FROM saas_billing_orders) saas,(SELECT count(*)::int FROM cashier_billing_orders) cashier,(SELECT count(*)::int FROM verified_provider_payment_receipts) receipts')).rows[0];
    assert.deepEqual(await context(),{tenant:'',audit:'',admin:''});assert.deepEqual(await naked(),{saas:0,cashier:0,receipts:0});
    let outcome,errorCode,gatewayCalls=0;
    try{
      const {handleSuperQiSandboxWebhook}=await import('../../src/services/superQiSandboxWebhook.ts');
      outcome=await handleSuperQiSandboxWebhook({payload:task.payload,signature:task.signature,receivedAt:new Date(task.receivedAt),fetchImpl:async(url,init)=>{gatewayCalls++;assert.equal(init.method,'GET');assert.equal(url,`https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${task.payload.paymentId}/status`);return {ok:true,status:200,json:async()=>task.payload};}});
    }catch(error){errorCode=/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'APPLICATION_FAILURE';}
    const afterContext=await context(),afterNaked=await naked();
    await send({type:'observation',flags,status:outcome?.outcome?.status,errorCode,gatewayCalls,afterContext,afterNaked});
  }catch(error){await send({type:'failure',code:/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'TEST_ASSERTION_FAILURE'});process.exitCode=1;}
  finally{if(pool)await pool.end().catch(()=>{});if(process.connected)process.disconnect();}
});
await send({type:'ready'});
