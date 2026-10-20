import {createDisposableAuthenticationRole,restrictTenantAuthenticationPrivileges} from './helpers/disposable-authentication-role.mjs';
import assert from 'node:assert/strict';
import {createHmac,randomUUID,randomInt} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources,stopTestChild} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
Object.assign(process.env,{FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',FAWRI_DISABLE_JOB_WORKERS:'1',FAWRI_JOB_POLL_INTERVAL_MS:'60000',FAWRI_META_TOKEN_KEY_ID:'synthetic-meta-restart-key',FAWRI_META_TOKEN_KEY_BASE64:Buffer.alloc(32,31).toString('base64'),FAWRI_AUTH_SECURITY_SECRET:'synthetic-meta-restart-security-secret-at-least-32-characters',FAWRI_PASSWORD_SALT:'synthetic-meta-restart-password-salt'});
const {pool}=await import('@workspace/db');
const accounts=await import('../src/services/postgresMerchantAccountAuthority.ts');
const settings=await import('../src/services/postgresMerchantSettingsAuthority.ts');
const channels=await import('../src/services/postgresMetaChannelAuthority.ts');
const {default:express}=await import('express');
const childPath=fileURLToPath(new URL('./helpers/meta-worker-restart-child.mjs',import.meta.url));

test('actual signed Meta worker restart discovers refund after committed DLQ gap under restricted RLS',{timeout:120000},async t=>{
  const suffix=randomUUID().replaceAll('-',''),role=`meta_app_${suffix}`,runtimePassword=randomUUID().replaceAll('-',''),merchants=[],children=[],markers=[];let graph,roleCreated=false,providerCalls=0,authFixture;
  const page=`meta-restart-page-${suffix}`,mid=`meta-restart-mid-${suffix}`,event=`meta:${page}:${mid}`,token=`synthetic-restart-token-${suffix}`,secret=`synthetic-restart-secret-${suffix}`;
  t.after(async()=>cleanupResources([
    ['owned children',async()=>{for(const handle of children){if(handle.child.exitCode===null&&handle.child.signalCode===null){try{await handle.command('stop');}finally{await stopTestChild(handle.child);}}}}],
    ['owned backends',async()=>{for(const marker of markers)await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND datname=current_database() AND pid<>pg_backend_pid()',[marker]);}],
    ['owned graph',async()=>{if(graph){graph.closeAllConnections();await new Promise((r,j)=>graph.close(e=>e?j(e):r()));}}],
    ['owned ledger',()=>pool.query('DELETE FROM reply_ledger WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['owned authentication role',()=>authFixture?.dispose()],
    ['owned grants',()=>roleCreated?pool.query(`DROP OWNED BY ${role}`):undefined],['owned role',()=>roleCreated?pool.query(`DROP ROLE ${role}`):undefined],['pool',()=>pool.end()],
  ]));
  await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);roleCreated=true;
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);await pool.query(`GRANT EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchants(text[]) TO ${role}`);
  await restrictTenantAuthenticationPrivileges(pool,role);
  authFixture=await createDisposableAuthenticationRole(pool,process.env.DATABASE_URL);
  for(let i=0;i<2;i++){
    const created=await accounts.upsertPendingMerchantAuthoritative({phone:`+1994${String(randomInt(0,100000000)).padStart(8,'0')}`,passwordHash:'synthetic',ownerName:'Synthetic',storeName:'Synthetic',activityType:'retail',language:'ar',requestedPlan:'silver'});const id=created.account.id;merchants.push(id);
    await accounts.markMerchantOtpVerifiedAuthoritative(id);await pool.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[id]);
    const current=await settings.getMerchantOperationalSettingsAuthoritative(id);
    await settings.updateMerchantOperationalSettingsAuthoritative({merchantId:id,expectedVersion:current.version,patch:{auto_reply_enabled:true,delivery:{enabled:true,pricing_mode:'flat',fee_iqd:5000,estimated_days_min:1,estimated_days_max:2,areas:['Baghdad']},payment:{cash_on_delivery_enabled:true,electronic_payment_enabled:false,methods:['cash_on_delivery']}}});
    await pool.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,price_iqd,billing_anchor_day,base_reply_limit,base_replies_used,base_replies_remaining,addon_replies_remaining,emergency_credit_amount,emergency_credit_activated,emergency_debt,auto_reply_enabled,starts_at,expires_at,activated_at,version,created_at,updated_at) VALUES($1,$2,'silver','active',10000,1,20,0,20,0,0,false,0,true,now()-interval '1 day',now()+interval '30 days',now(),1,now()-interval '1 minute',now()-interval '1 minute')",[`meta-restart-sub-${i}-${suffix}`,id]);
    if(i===0)await channels.connectMetaChannelAuthoritative({merchantId:id,platform:'messenger',pageId:page,pageName:'Synthetic',accessToken:token,webhookSubscribed:true});
  }
  const fake=express();fake.use(express.json());fake.post('/v22.0/:page/messages',(req,res)=>{
    assert.equal(req.params.page,page);assert.equal(req.headers.authorization,`Bearer ${token}`);assert.match(req.body.message.text,/التوصيل|رسوم/);providerCalls++;res.status(400).json({error:{code:100}});
  });graph=await new Promise((r,j)=>{const s=fake.listen(0,'127.0.0.1',()=>r(s));s.once('error',j);});
  async function start(crash=false){
    const marker=`meta-restart-owned-${randomUUID()}`;markers.push(marker);
    const child=spawn(process.execPath,['--import','tsx',childPath],{env:{...process.env,FAWRI_AUTH_DATABASE_URL:authFixture.url,META_APP_SECRET:secret,META_VERIFY_TOKEN:'synthetic-verify',META_GRAPH_BASE_URL:`http://127.0.0.1:${graph.address().port}`,FAWRI_META_REPLY_TRANSPORT:'live',FAWRI_TEST_META_ROLE:role,FAWRI_TEST_META_PASSWORD:runtimePassword,FAWRI_TEST_META_MARKER:marker,FAWRI_TEST_META_DEADLETTER_CRASH:crash?'1':'0',FAWRI_TEST_META_RESTART_EVENT:event,LOG_LEVEL:'silent'},stdio:['ignore','pipe','pipe','ipc']});
    const messages=[],pending=new Map();let readyResolve;const ready=new Promise(r=>{readyResolve=r;});
    child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});child.on('message',m=>{messages.push(m);if(m.type==='ready')readyResolve(m);else if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.failure?p.reject(Error(m.code)):p.resolve(m);}});
    const done=new Promise(r=>child.once('exit',(code,signal)=>{for(const p of pending.values())p.reject(Error('owned worker exited'));pending.clear();r({code,signal});}));
    function command(command){const id=randomUUID();let timer;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});timer=setTimeout(()=>{pending.delete(id);reject(Error('owned worker command timeout'));},20000);child.send({id,command});}).finally(()=>clearTimeout(timer));}
    const handle={child,command,messages,done};children.push(handle);let timer;
    try{handle.info=await Promise.race([ready,done.then(()=>{throw Error('owned worker startup failed');}),new Promise((_,j)=>{timer=setTimeout(()=>j(Error('owned worker startup timeout')),20000);})]);}finally{clearTimeout(timer);}
    assert.equal(handle.info.restricted,true);assert.equal(handle.info.authenticatedAuthority,true);return handle;
  }
  const jobs=async()=>(await pool.query('SELECT type,dedupe_key,status,last_error_code,attempts,result FROM background_jobs WHERE merchant_id=$1 ORDER BY type',[merchants[0]])).rows;
  const ledger=async()=>(await pool.query(`SELECT id,direction,reason_code,metadata,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time FROM reply_ledger WHERE merchant_id=$1 AND external_event_id=$2 ORDER BY direction,id`,[merchants[0],event])).rows;
  const balances=async()=>(await pool.query('SELECT merchant_id,base_replies_used,base_replies_remaining FROM subscriptions WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id',[merchants])).rows;
  let crashed,committedLedger;
  await t.test('signed original app fails Graph and commits DLQ but crashes before refund enqueue',async()=>{
    crashed=await start(true);
    const body=JSON.stringify({object:'page',entry:[{id:page,messaging:[{sender:{id:`meta-restart-customer-${suffix}`},recipient:{id:page},timestamp:Date.now(),message:{mid,text:'كم سعر التوصيل؟'}}]}]});
    const response=await fetch(`http://127.0.0.1:${crashed.info.port}/api/meta/webhook`,{method:'POST',headers:{'Content-Type':'application/json','Connection':'close','X-Hub-Signature-256':`sha256=${createHmac('sha256',secret).update(body).digest('hex')}`},body});assert.equal(response.status,200);
    await pool.query('UPDATE background_jobs SET max_attempts=1 WHERE merchant_id=$1 AND dedupe_key=$2',[merchants[0],event]);
    await assert.rejects(crashed.command('run'),/owned worker exited/);assert.equal((await crashed.done).signal,'SIGKILL');
    assert.ok(crashed.messages.some(m=>m.type==='deadletter-wire-drop'&&m.serverCommitCompleted&&m.commandCompleteDelivered===false));
    const rows=await jobs();assert.equal(rows.length,1);assert.equal(rows[0].status,'dead_letter');assert.equal(rows[0].last_error_code,'META_REPLY_FAILED');assert.equal(rows[0].attempts,1);assert.equal(rows[0].result._fawri_requeue_policy,'safe');
    assert.equal(providerCalls,1);const rowsLedger=await ledger();assert.equal(rowsLedger.length,1);assert.equal(rowsLedger[0].direction,'debit');
    const b=await balances();assert.equal(b.find(x=>x.merchant_id===merchants[0]).base_replies_remaining,19);assert.equal(b.find(x=>x.merchant_id===merchants[1]).base_replies_remaining,20);
  });
  await t.test('fresh original worker discovers committed failure and restores exactly one credit',async()=>{
    const fresh=await start();
    // IPC readiness means the original worker was constructed, not that its
    // asynchronous startup refund scan has finished. Observe its real enqueue.
    let discovered;const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      discovered=(await jobs()).find(j=>j.type==='meta.reply.refund'&&j.dedupe_key===`meta-refund:${event}`);
      if(discovered)break;
      await new Promise(r=>setTimeout(r,25));
    }
    assert.ok(discovered,'original startup must create owed refund within owned deadline');assert.equal(discovered.status,'queued');
    assert.equal((await ledger()).filter(x=>x.direction==='credit').length,0);
    assert.equal((await fresh.command('run')).ran,true);
    const rows=await jobs();assert.equal(rows.length,2);const refund=rows.find(j=>j.type==='meta.reply.refund');assert.equal(refund.status,'completed');assert.equal(refund.attempts,1);assert.equal(refund.result.refund_status,'refunded');
    assert.equal(rows.find(j=>j.type==='meta.webhook.reply').result._fawri_requeue_policy,'blocked');
    committedLedger=await ledger();assert.equal(committedLedger.length,2);assert.equal(committedLedger.filter(x=>x.direction==='credit').length,1);
    assert.ok((await balances()).every(x=>x.base_replies_used===0&&x.base_replies_remaining===20));assert.equal(providerCalls,1);
    assert.equal((await fresh.command('isolation')).contextReset,true);assert.equal((await fresh.command('run')).ran,false);
    assert.equal((await fresh.command('stop')).stopped,true);await fresh.done;
  });
  await t.test('two concurrent fresh worker restarts do not duplicate refund or provider call',async()=>{
    const fresh=await Promise.all([start(),start()]);const results=await Promise.all(fresh.map(h=>h.command('run')));assert.ok(results.every(x=>x.ran===false));
    assert.deepEqual(await ledger(),committedLedger);assert.equal((await jobs()).filter(j=>j.type==='meta.reply.refund').length,1);assert.equal(providerCalls,1);
    assert.ok((await balances()).every(x=>x.base_replies_used===0&&x.base_replies_remaining===20));for(const h of fresh)assert.equal((await h.command('isolation')).contextReset,true);
    console.log('META_DEADLETTER_RESTART_PROOF '+JSON.stringify({signedActualApp:true,originalLiveWorker:true,restrictedRole:true,deadletterCommitCompleted:true,commandCompleteDelivered:false,killedBeforeRefundEnqueue:true,freshWorkerDiscovery:true,concurrentFreshRestarts:true,providerCalls:1,refundJobs:1,credits:1,otherTenantUnchanged:true,ledgerUnchanged:true,contextReset:true}));
  });
});
