import assert from 'node:assert/strict';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
assert.match(process.env.FAWRI_TEST_META_ROLE,/^meta_app_[a-f0-9]{32}$/);
assert.match(process.env.FAWRI_TEST_META_PASSWORD || '',/^[a-f0-9]{32}$/);
const runtimeUrl=new URL(process.env.DATABASE_URL);
runtimeUrl.username=process.env.FAWRI_TEST_META_ROLE;
runtimeUrl.password=process.env.FAWRI_TEST_META_PASSWORD;
runtimeUrl.searchParams.delete('options');
process.env.DATABASE_URL=runtimeUrl.toString();
delete process.env.FAWRI_TEST_META_PASSWORD;
const {pool}=await import('@workspace/db');
pool.options.max=1;
pool.options.application_name=process.env.FAWRI_TEST_META_MARKER;
await pool.query('RESET ROLE');
const flags=(await pool.query("SELECT current_user AS role,session_user AS login,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owns_table FROM pg_roles r WHERE rolname=current_user")).rows[0];
assert.deepEqual(flags,{role:process.env.FAWRI_TEST_META_ROLE,login:process.env.FAWRI_TEST_META_ROLE,rolsuper:false,rolbypassrls:false,owns_table:false});
const {assertProductionDatabaseRlsReady}=await import('../../src/services/postgresRuntimeRlsSecurity.ts');
await assertProductionDatabaseRlsReady({NODE_ENV:'production',FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required'},pool);
const knowledge=await import('../../src/services/ai/knowledgeDecisionEngine.ts');
knowledge.configureKnowledgeEmbeddingProvider({providerId:'synthetic-meta-app',model:'synthetic-meta-app-v1',dimensions:2,async embed(){return [1,0];}});
const {default:app}=await import('../../src/app.ts');
const {startMetaWebhookWorker}=await import('../../src/services/metaWebhookWorker.ts');
const {getCurrentSubscriptionPostgres}=await import('../../src/services/postgresSubscriptionEntitlement.ts');
const {withMerchantOperationalTransaction}=await import('../../src/services/operationalPostgresAuthority.ts');
const server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
// Deterministically drive the original worker's runOnce, including original
// claim, decrypt, live handler, reservation, transport and completion paths.
const {updateMerchantOperationalSettingsAuthoritative,getMerchantOperationalSettingsAuthoritative}=await import('../../src/services/postgresMerchantSettingsAuthority.ts');
const {refundMerchantAutoReplyAuthoritative}=await import('../../src/services/merchantReplyRefundAuthority.ts');
const {releaseMerchantAutoReplyReservationAuthoritative}=await import('../../src/services/merchantReplyReservationReleaseAuthority.ts');
let releaseEvent=null;
const worker=startMetaWebhookWorker(server.address().port,{replyHooks:{async afterReservation({job}){
  if(job.payload?.event_id!==releaseEvent)return;
  releaseEvent=null;
  const current=await getMerchantOperationalSettingsAuthoritative(job.merchant_id);
  await updateMerchantOperationalSettingsAuthoritative({merchantId:job.merchant_id,expectedVersion:current.version,patch:{auto_reply_enabled:false}});
}}});
async function send(m){if(process.connected)await new Promise(r=>process.send(m,()=>r()));}
let stopping=false;
process.on('message',async task=>{
  try{
    if(task.command==='run'){await send({id:task.id,ran:await worker.runOnce()});}
    else if(task.command==='arm-release'){releaseEvent=task.event;await send({id:task.id,armed:true});}
    else if(task.command==='restore'){
      const restore=task.kind==='refund'?refundMerchantAutoReplyAuthoritative:releaseMerchantAutoReplyReservationAuthoritative;
      const result=await restore(task.event,task.kind==='refund'?'META_REPLY_FAILED':'MERCHANT_AUTO_REPLY_DISABLED',new Date(),task.merchant);
      await send({id:task.id,result});
    }
    else if(task.command==='subscriptions'){
      for(const merchantId of task.merchants){
        const subscription=await getCurrentSubscriptionPostgres(merchantId);
        assert.equal(subscription?.merchant_id,merchantId);
        assert.equal(subscription.status,'active');
        assert.equal(subscription.base_replies_remaining,20);
        assert.equal((await pool.query("SELECT NULLIF(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM subscriptions')).rows[0].n,0);
      }
      await send({id:task.id,subscriptionsVisible:true,contextReset:true});
    }
    else if(task.command==='isolation'){
      const tables=['merchant_channels','background_jobs','background_job_payloads','messages','reply_ledger','subscriptions','subscription_reply_batches'];
      for(const table of tables)assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
      for(const merchantId of task.merchants){
        const rows=await withMerchantOperationalTransaction(merchantId,c=>c.query('SELECT merchant_id FROM merchant_channels'));
        assert.ok(rows.rows.length===1&&rows.rows.every(r=>r.merchant_id===merchantId));
      }
      assert.equal((await pool.query("SELECT NULLIF(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
      await send({id:task.id,isolated:true,contextReset:true});
    }else if(task.command==='stop'&&!stopping){
      stopping=true;worker.stop();server.closeAllConnections();
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
      await pool.end();await send({id:task.id,stopped:true});process.disconnect();
    }else throw Error('invalid owned command');
  }catch(error){await send({id:task.id,failure:true,code:/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'META_APP_TEST_FAILURE'});process.exitCode=1;}
});
await send({ready:true,port:server.address().port,restricted:true});
