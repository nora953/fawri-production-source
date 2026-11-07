import assert from 'node:assert/strict';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
const send=message=>process.connected?new Promise(resolve=>process.send(message,resolve)):Promise.resolve();
let handled=false;
process.on('message',async task=>{
  if(handled)return;handled=true;
  let pool,proxy;
  try{
    Object.assign(process.env,task.providerEnv);
    const bootstrap=new URL(process.env.DATABASE_URL),runtime=new URL(process.env.FAWRI_TEST_BILLING_DATABASE_URL);
    assert.equal(runtime.host,bootstrap.host);assert.equal(runtime.pathname,bootstrap.pathname);assert.match(decodeURIComponent(runtime.username),/^knowledge_app_[a-f0-9]{32}$/);
    process.env.DATABASE_URL=runtime.toString();delete process.env.FAWRI_TEST_BILLING_DATABASE_URL;
    ({pool}=await import('@workspace/db'));pool.options.max=1;pool.on('error',()=>{});
    if(task.drop){
      const {startOwnedAutocommitResponseProxy}=await import('./postgres-autocommit-response-proxy.mjs');
      proxy=await startOwnedAutocommitResponseProxy(()=>send({type:'admission-wire-loss',idleReadyObserved:true,responseDelivered:false}));
      const ownedUrl=new URL(process.env.DATABASE_URL);
      pool.options.connectionString=undefined;
      Object.assign(pool.options,{host:'127.0.0.1',port:proxy.port,user:decodeURIComponent(ownedUrl.username),password:decodeURIComponent(ownedUrl.password),database:'fawri_ci',ssl:false});

    }
    const identity=(await pool.query('SELECT current_user::text AS active,session_user::text AS login')).rows[0];
    assert.deepEqual(identity,{active:decodeURIComponent(runtime.username),login:decodeURIComponent(runtime.username)});
    const {assertProductionDatabaseRlsReady}=await import('../../src/services/postgresRuntimeRlsSecurity.ts');
    await assertProductionDatabaseRlsReady({NODE_ENV:'production',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_DATABASE_URL:process.env.FAWRI_AUTH_DATABASE_URL,FAWRI_OPERATOR_DATABASE_URL:'postgresql://operator@127.0.0.1/fawri_ci'},pool);
    proxy?.arm();
    const {handleSuperQiSandboxWebhook}=await import('../../src/services/superQiSandboxWebhook.ts');
    const result=await handleSuperQiSandboxWebhook({payload:task.payload,signature:task.signature,receivedAt:new Date(task.receivedAt),fetchImpl:async(url,init)=>{assert.equal(init.method,'GET');assert.equal(url,`https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${task.payload.paymentId}/status`);return {ok:true,status:200,json:async()=>task.payload};}});
    await send({type:'result',status:result.outcome.status});
  }catch(error){await send({type:'failure',code:/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'APPLICATION_FAILURE'});process.exitCode=1;}
  finally{await (await import('../../src/services/authenticationPostgresAuthority.ts')).closeAuthenticationPool();if(pool)await pool.end().catch(()=>{});if(proxy)await proxy.close();if(process.connected)process.disconnect();}
});
await send({type:'ready'});
