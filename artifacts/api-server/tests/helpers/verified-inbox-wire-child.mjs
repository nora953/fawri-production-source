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
    ({pool}=await import('@workspace/db'));pool.options.max=1;pool.on('error',()=>{});
    if(task.drop){
      const {startOwnedAutocommitResponseProxy}=await import('./postgres-autocommit-response-proxy.mjs');
      proxy=await startOwnedAutocommitResponseProxy(()=>send({type:'admission-wire-loss',idleReadyObserved:true,responseDelivered:false}));
      const ownedUrl=new URL(process.env.DATABASE_URL);
      pool.options.connectionString=undefined;
      Object.assign(pool.options,{host:'127.0.0.1',port:proxy.port,user:decodeURIComponent(ownedUrl.username),password:decodeURIComponent(ownedUrl.password),database:'fawri_ci',ssl:false});
      const client=await pool.connect();client.release();proxy.arm();
    }
    const {handleSuperQiSandboxWebhook}=await import('../../src/services/superQiSandboxWebhook.ts');
    const result=await handleSuperQiSandboxWebhook({payload:task.payload,signature:task.signature,receivedAt:new Date(task.receivedAt),fetchImpl:async(url,init)=>{assert.equal(init.method,'GET');assert.equal(url,`https://uat-sandbox-3ds-api.qi.iq/api/v1/payment/${task.payload.paymentId}/status`);return {ok:true,status:200,json:async()=>task.payload};}});
    await send({type:'result',status:result.outcome.status});
  }catch(error){await send({type:'failure',code:/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'APPLICATION_FAILURE'});process.exitCode=1;}
  finally{if(pool)await pool.end().catch(()=>{});if(proxy)await proxy.close();if(process.connected)process.disconnect();}
});
await send({type:'ready'});
