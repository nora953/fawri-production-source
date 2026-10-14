import assert from 'node:assert/strict';
import {createHmac,createHash,randomUUID,randomInt} from 'node:crypto';
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
const queue=await import('../src/services/postgresDurableJobQueue.ts');
const {default:express}=await import('express');
const childPath=fileURLToPath(new URL('./helpers/meta-worker-restart-child.mjs',import.meta.url));

test('original encrypted Meta jobs reject tenant and event identity conflicts before domain writes',{timeout:120000},async t=>{
  const suffix=randomUUID().replaceAll('-',''),role=`meta_app_${suffix}`,merchants=[],children=[],markers=[];let graph,roleCreated=false,providerCalls=0;
  const page=`meta-restart-page-${suffix}`,mid=`meta-restart-mid-${suffix}`,event=`meta:${page}:${mid}`,token=`synthetic-restart-token-${suffix}`,secret=`synthetic-restart-secret-${suffix}`;
  t.after(async()=>cleanupResources([
    ['owned children',async()=>{for(const handle of children){if(handle.child.exitCode===null&&handle.child.signalCode===null){try{await handle.command('stop');}finally{await stopTestChild(handle.child);}}}}],
    ['owned backends',async()=>{for(const marker of markers)await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND datname=current_database() AND pid<>pg_backend_pid()',[marker]);}],
    ['owned graph',async()=>{if(graph){graph.closeAllConnections();await new Promise((r,j)=>graph.close(e=>e?j(e):r()));}}],
    ['owned ledger',()=>pool.query('DELETE FROM reply_ledger WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['owned grants',()=>roleCreated?pool.query(`DROP OWNED BY ${role}`):undefined],['owned role',()=>roleCreated?pool.query(`DROP ROLE ${role}`):undefined],['pool',()=>pool.end()],
  ]));
  await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);roleCreated=true;
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);await pool.query(`GRANT EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchants(text[]) TO ${role}`);
  for(let i=0;i<2;i++){
    const created=await accounts.upsertPendingMerchantAuthoritative({phone:`+1994${String(randomInt(0,100000000)).padStart(8,'0')}`,passwordHash:'synthetic',ownerName:'Synthetic',storeName:'Synthetic',activityType:'retail',language:'ar',requestedPlan:'silver'});const id=created.account.id;merchants.push(id);
    await accounts.markMerchantOtpVerifiedAuthoritative(id);await pool.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[id]);
    const current=await settings.getMerchantOperationalSettingsAuthoritative(id);
    await settings.updateMerchantOperationalSettingsAuthoritative({merchantId:id,expectedVersion:current.version,patch:{auto_reply_enabled:true,delivery:{enabled:true,pricing_mode:'flat',fee_iqd:5000,estimated_days_min:1,estimated_days_max:2,areas:['Baghdad']},payment:{cash_on_delivery_enabled:true,electronic_payment_enabled:false,methods:['cash_on_delivery']}}});
    await pool.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,price_iqd,billing_anchor_day,base_reply_limit,base_replies_used,base_replies_remaining,addon_replies_remaining,emergency_credit_amount,emergency_credit_activated,emergency_debt,auto_reply_enabled,starts_at,expires_at,activated_at,version,created_at,updated_at) VALUES($1,$2,'silver','active',10000,1,20,0,20,0,0,false,0,true,now()-interval '1 day',now()+interval '30 days',now(),1,now()-interval '1 minute',now()-interval '1 minute')",[`meta-restart-sub-${i}-${suffix}`,id]);
    await channels.connectMetaChannelAuthoritative({merchantId:id,platform:'messenger',pageId:i===0?page:`${page}-foreign`,pageName:'Synthetic',accessToken:i===0?token:`${token}-foreign`,webhookSubscribed:true});
  }
  const fake=express();fake.use(express.json());fake.post('/v22.0/:page/messages',(req,res)=>{
    const foreign=req.params.page===`${page}-foreign`;assert.ok(foreign||req.params.page===page);assert.equal(req.headers.authorization,`Bearer ${foreign?`${token}-foreign`:token}`);assert.match(req.body.message.text,/التوصيل|رسوم/);providerCalls++;res.json({recipient_id:req.body.recipient.id,message_id:`synthetic-identity-send-${providerCalls}`});
  });graph=await new Promise((r,j)=>{const s=fake.listen(0,'127.0.0.1',()=>r(s));s.once('error',j);});
  async function start(crash=false){
    const marker=`meta-restart-owned-${randomUUID()}`;markers.push(marker);
    const child=spawn(process.execPath,['--import','tsx',childPath],{env:{...process.env,META_APP_SECRET:secret,META_VERIFY_TOKEN:'synthetic-verify',META_GRAPH_BASE_URL:`http://127.0.0.1:${graph.address().port}`,FAWRI_META_REPLY_TRANSPORT:'live',FAWRI_TEST_META_ROLE:role,FAWRI_TEST_META_MARKER:marker,FAWRI_TEST_META_DEADLETTER_CRASH:crash?'1':'0',FAWRI_TEST_META_RESTART_EVENT:event,LOG_LEVEL:'silent'},stdio:['ignore','pipe','pipe','ipc']});
    const messages=[],pending=new Map();let readyResolve;const ready=new Promise(r=>{readyResolve=r;});
    child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});child.on('message',m=>{messages.push(m);if(m.type==='ready')readyResolve(m);else if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.failure?p.reject(Error(m.code)):p.resolve(m);}});
    const done=new Promise(r=>child.once('exit',(code,signal)=>{for(const p of pending.values())p.reject(Error('owned worker exited'));pending.clear();r({code,signal});}));
    function command(command){const id=randomUUID();let timer;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});timer=setTimeout(()=>{pending.delete(id);reject(Error('owned worker command timeout'));},20000);child.send({id,command});}).finally(()=>clearTimeout(timer));}
    const handle={child,command,messages,done};children.push(handle);let timer;
    try{handle.info=await Promise.race([ready,done.then(()=>{throw Error('owned worker startup failed');}),new Promise((_,j)=>{timer=setTimeout(()=>j(Error('owned worker startup timeout')),20000);})]);}finally{clearTimeout(timer);}
    assert.equal(handle.info.restricted,true);return handle;
  }
  const jobs=async()=>(await pool.query('SELECT type,dedupe_key,status,last_error_code,attempts,result FROM background_jobs WHERE merchant_id=$1 ORDER BY type',[merchants[0]])).rows;
  const ledger=async()=>(await pool.query(`SELECT id,direction,reason_code,metadata,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS time FROM reply_ledger WHERE merchant_id=$1 AND external_event_id=$2 ORDER BY direction,id`,[merchants[0],event])).rows;
  const balances=async()=>(await pool.query('SELECT merchant_id,base_replies_used,base_replies_remaining FROM subscriptions WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id',[merchants])).rows;
  const tables=['merchant_channels','merchant_settings','conversations','messages','channel_inbound_events','outbound_deliveries','notifications','subscriptions','reply_ledger'];
  async function domainSnapshot(){
    const state={};for(const table of tables){
      const rows=(await pool.query(`SELECT to_jsonb(t) AS data FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[merchants])).rows.map(r=>r.data);
      state[table]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
    }return state;
  }
  function bodyFor(i,label){const target=i===0?page:`${page}-foreign`,messageId=`identity-${label}-${suffix}`,sender=`identity-customer-${label}-${suffix}`;
    const webhook={object:'page',entry:[{id:target,messaging:[{sender:{id:sender},recipient:{id:target},timestamp:Date.now(),message:{mid:messageId,text:'كم سعر التوصيل؟'}}]}]};
    return {event:`meta:${target}:${messageId}`,payload:{event_id:`meta:${target}:${messageId}`,page_id:target,merchant_id:merchants[i],external_message_id:messageId,sender_id:sender,webhook_body:webhook}};
  }
  let worker,positivePassed=false;const deniedKinds=new Set();
  await t.test('signed legitimate foreign channel is connected and original worker sends/debits once',async()=>{
    worker=await start();const valid=bodyFor(1,'positive'),body=JSON.stringify(valid.payload.webhook_body);
    const response=await fetch(`http://127.0.0.1:${worker.info.port}/api/meta/webhook`,{method:'POST',headers:{'Content-Type':'application/json','Connection':'close','X-Hub-Signature-256':`sha256=${createHmac('sha256',secret).update(body).digest('hex')}`},body});assert.equal(response.status,200);
    assert.equal((await worker.command('run')).ran,true);assert.equal(providerCalls,1);
    const b=await balances();assert.equal(b.find(x=>x.merchant_id===merchants[1]).base_replies_used,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM messages WHERE merchant_id=$1 AND sender='fawri' AND status='sent'",[merchants[1]])).rows[0].n,1);positivePassed=true;
  });
  const cases=['merchant','event','missing_event','body_page_conflict','body_sender_conflict','body_message_conflict','body_page_missing','body_sender_missing','body_message_missing','body_object_conflict','body_echo','body_extra_entry','body_extra_message'];
  for(const kind of cases)await t.test(`${kind} identity conflict is rejected before all nine domain surfaces`,async()=>{
    const value=bodyFor(kind==='merchant'?1:0,kind);
    const canonical=kind==='event'?`canonical-${value.event}`:value.event;
    if(kind==='missing_event')delete value.payload.event_id;
    const entry=value.payload.webhook_body.entry[0],message=entry.messaging[0];
    if(kind==='body_page_conflict')entry.id=`${page}-foreign`;
    if(kind==='body_sender_conflict')message.sender.id=`foreign-sender-${suffix}`;
    if(kind==='body_message_conflict')message.message.mid=`foreign-message-${suffix}`;
    if(kind==='body_page_missing')delete entry.id;
    if(kind==='body_sender_missing')delete message.sender.id;
    if(kind==='body_message_missing')delete message.message.mid;
    if(kind==='body_object_conflict')value.payload.webhook_body.object='instagram';
    if(kind==='body_echo')message.message.is_echo=true;
    if(kind==='body_extra_entry')value.payload.webhook_body.entry.push(structuredClone(bodyFor(1,'extra-entry').payload.webhook_body.entry[0]));
    if(kind==='body_extra_message')entry.messaging.push(structuredClone(bodyFor(1,'extra-message').payload.webhook_body.entry[0].messaging[0]));
    const before=await domainSnapshot(),calls=providerCalls;
    const enqueued=await queue.enqueueDurableJobAuthoritative({type:'meta.webhook.reply',merchantId:merchants[0],dedupeKey:canonical,maxAttempts:1,payload:value.payload});
    // Real encrypted payload is associated with the canonical row tenant. The
    // foreign channel/body remains valid; only row/payload identity conflicts.
    assert.equal(enqueued.job.merchant_id,merchants[0]);
    assert.equal((await worker.command('run')).ran,true);
    const row=(await pool.query('SELECT status,last_error_code FROM background_jobs WHERE id=$1',[enqueued.job.id])).rows[0];
    const after=await domainSnapshot();
    console.log('META_JOB_IDENTITY_OBSERVATION '+JSON.stringify({kind,status:row.status,errorCode:row.last_error_code,changedDomainTables:tables.filter(table=>JSON.stringify(after[table])!==JSON.stringify(before[table])),providerCallsBefore:calls,providerCallsAfter:providerCalls}));
    assert.deepEqual(row,{status:'dead_letter',last_error_code:'META_JOB_PAYLOAD_INVALID'});
    assert.equal(providerCalls,calls);assert.deepEqual(after,before);deniedKinds.add(kind);
  });
  await t.test('original pooled worker retains tenant isolation after every denial',async()=>{
    const proof=await worker.command('isolation');assert.equal(proof.isolated,true);assert.equal(proof.contextReset,true);
    if(positivePassed&&deniedKinds.size===cases.length)console.log('META_JOB_IDENTITY_PROOF '+JSON.stringify({originalLiveWorker:true,restrictedRole:true,originalEncryptedQueue:true,validForeignChannelPositive:true,tenantMismatchDenied:true,eventMismatchDenied:true,missingEventDenied:true,webhookBodyConflictAndMissingDenied:true,normalizedEnvelopeDenied:true,deniedCaseCount:deniedKinds.size,domainSurfacesUnchanged:9,providerCalls,contextReset:true}));
  });
});
