import assert from 'node:assert/strict';
import {assertDisposablePostgres} from '../../../../scripts/lib/disposable-postgres-test-guard.mjs';
await assertDisposablePostgres();
const {pool}=await import('@workspace/db');
assert.match(process.env.FAWRI_TEST_META_ROLE,/^meta_app_[a-f0-9]{32}$/);
pool.options.options=`-c role=${process.env.FAWRI_TEST_META_ROLE}`;pool.options.max=1;pool.options.application_name=process.env.FAWRI_TEST_META_MARKER;
async function send(m){if(process.connected)await new Promise(r=>process.send(m,()=>r()));}
let proxy;
if(process.env.FAWRI_TEST_META_DEADLETTER_CRASH==='1'){
  const {startOwnedCommitResponseProxy}=await import('./postgres-commit-response-proxy.mjs');
  proxy=await startOwnedCommitResponseProxy(1,async()=>{
    await send({type:'deadletter-wire-drop',serverCommitCompleted:true,commandCompleteDelivered:false});process.kill(process.pid,'SIGKILL');
  },{deferUntilArmed:true});
  const owned=new URL(process.env.DATABASE_URL);pool.options.connectionString=undefined;
  Object.assign(pool.options,{host:'127.0.0.1',port:proxy.port,user:decodeURIComponent(owned.username),password:decodeURIComponent(owned.password),database:'fawri_ci',ssl:false});
  // Observe only real SQL/results. Forward every statement unchanged; arm the
  // existing wire fault only for the transaction's actual owned DLQ transition.
  const connect=pool.connect;
  function observe(client){
    const query=client.query,release=client.release;let matched=false;
    client.query=function(...args){
      if(typeof args.at(-1)==='function')return query.apply(this,args);
      return (async()=>{
      const sql=typeof args[0]==='string'?args[0]:args[0]?.text||'';
      if(sql.trim()==='COMMIT'&&matched)proxy.arm();
      const result=await query.apply(this,args);
      if(/UPDATE background_jobs\s+SET status = 'dead_letter'/.test(sql)&&result.rows.some(r=>r.dedupe_key===process.env.FAWRI_TEST_META_RESTART_EVENT&&r.status==='dead_letter'&&r.last_error_code==='META_REPLY_FAILED'))matched=true;
      return result;
      })();
    };
    client.release=function(...args){client.query=query;client.release=release;return release.apply(this,args);};
    return client;
  }
  pool.connect=function(...args){
    if(typeof args[0]==='function'){
      const callback=args[0];return connect.call(this,(error,client)=>{
        if(error)return callback(error);
        observe(client);callback(null,client,client.release);
      });
    }
    return connect.apply(this,args).then(observe);
  };
}
if(process.env.FAWRI_TEST_META_PRECOMMIT_CRASH==='1'){
  // Forward real native queries unchanged. Kill only after PostgreSQL has
  // acknowledged this owned INSERT, before control returns to the transaction.
  const connect=pool.connect;
  function observe(client){
    const query=client.query,release=client.release;
    client.query=function(...args){
      if(typeof args.at(-1)==='function')return query.apply(this,args);
      return (async()=>{
        const sql=typeof args[0]==='string'?args[0]:args[0]?.text||'';
        const values=Array.isArray(args[1])?args[1]:args[0]?.values||[];
        const result=await query.apply(this,args);
        if(/INSERT INTO channel_inbound_events/.test(sql)&&values[3]===process.env.FAWRI_TEST_META_RESTART_EVENT&&result.rowCount===1){
          await send({type:'inbound-precommit-kill',insertAcknowledged:true,rowCount:result.rowCount,commitIssued:false});
          process.kill(process.pid,'SIGKILL');
        }
        return result;
      })();
    };
    client.release=function(...args){client.query=query;client.release=release;return release.apply(this,args);};
    return client;
  }
  pool.connect=function(...args){
    if(typeof args[0]==='function'){
      const callback=args[0];return connect.call(this,(error,client)=>{
        if(error)return callback(error);observe(client);callback(null,client,client.release);
      });
    }
    return connect.apply(this,args).then(observe);
  };
}
const flags=(await pool.query("SELECT current_user AS role,rolsuper,rolbypassrls,EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owns_table FROM pg_roles r WHERE rolname=current_user")).rows[0];
assert.deepEqual(flags,{role:process.env.FAWRI_TEST_META_ROLE,rolsuper:false,rolbypassrls:false,owns_table:false});
const knowledge=await import('../../src/services/ai/knowledgeDecisionEngine.ts');
knowledge.configureKnowledgeEmbeddingProvider({providerId:'synthetic-meta-restart',model:'synthetic-meta-restart-v1',dimensions:2,async embed(){return [1,0];}});
const {default:app}=await import('../../src/app.ts');
const {startMetaWebhookWorker}=await import('../../src/services/metaWebhookWorker.ts');
const server=await new Promise((r,j)=>{const s=app.listen(0,'127.0.0.1',()=>r(s));s.once('error',j);});
const worker=startMetaWebhookWorker(server.address().port);let stopping=false;
process.on('message',async task=>{
  try{
    if(task.command==='run')await send({id:task.id,ran:await worker.runOnce()});
    else if(task.command==='isolation'){
      for(const table of ['subscriptions','reply_ledger','background_jobs','background_job_payloads','messages'])assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
      assert.equal((await pool.query("SELECT NULLIF(current_setting('fawri.tenant_id',true),'') AS tenant")).rows[0].tenant,null);
      await send({id:task.id,isolated:true,contextReset:true});
    }else if(task.command==='stop'&&!stopping){
      stopping=true;worker.stop();server.closeAllConnections();await new Promise((r,j)=>server.close(e=>e?j(e):r()));await pool.end();if(proxy)await proxy.close();await send({id:task.id,stopped:true});process.disconnect();
    }else throw Error('invalid owned command');
  }catch(error){await send({id:task.id,failure:true,code:/^[A-Z0-9_]{1,80}$/.test(error?.code||'')?error.code:'META_WORKER_RESTART_TEST_FAILURE'});process.exitCode=1;}
});
await send({type:'ready',port:server.address().port,restricted:true});
