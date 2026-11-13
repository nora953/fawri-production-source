import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {createDisposableAuthenticationRole,restrictTenantAuthenticationPrivileges} from './helpers/disposable-authentication-role.mjs';
import assert from 'node:assert/strict';
import {createHmac,createHash,randomUUID,randomInt} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources,stopTestChild} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
Object.assign(process.env,{FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',FAWRI_DISABLE_JOB_WORKERS:'1',FAWRI_JOB_POLL_INTERVAL_MS:'60000',FAWRI_META_TOKEN_KEY_ID:'synthetic-meta-restart-key',FAWRI_META_TOKEN_KEY_BASE64:Buffer.alloc(32,31).toString('base64'),FAWRI_AUTH_SECURITY_SECRET:'synthetic-meta-restart-security-secret-at-least-32-characters',FAWRI_PASSWORD_SALT:'synthetic-meta-restart-password-salt'});
const bootstrapUrl=process.env.DATABASE_URL;
const parentRuntime=await createDisposableKnowledgeRuntime();
const pool=parentRuntime.admin;
const accounts=await import('../src/services/postgresMerchantAccountAuthority.ts');
const settings=await import('../src/services/postgresMerchantSettingsAuthority.ts');
const channels=await import('../src/services/postgresMetaChannelAuthority.ts');
const queue=await import('../src/services/postgresDurableJobQueue.ts');
const {default:express}=await import('express');
const childPath=fileURLToPath(new URL('./helpers/meta-worker-restart-child.mjs',import.meta.url));

test('original encrypted Meta jobs reject tenant and event identity conflicts before domain writes',{timeout:120000},async t=>{
  const suffix=randomUUID().replaceAll('-',''),role=`meta_app_${suffix}`,runtimePassword=randomUUID().replaceAll('-',''),merchants=[],children=[],markers=[];let graph,roleCreated=false,providerCalls=0,authFixture;
  const page=`meta-restart-page-${suffix}`,mid=`meta-restart-mid-${suffix}`,event=`meta:${page}:${mid}`,token=`synthetic-restart-token-${suffix}`,secret=`synthetic-restart-secret-${suffix}`;
  t.after(async()=>cleanupResources([
    ['owned children',async()=>{for(const handle of children){if(handle.child.exitCode===null&&handle.child.signalCode===null){try{await handle.command('stop');}finally{await stopTestChild(handle.child);}}}}],
    ['owned backends',async()=>{for(const marker of markers)await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND datname=current_database() AND pid<>pg_backend_pid()',[marker]);}],
    ['owned graph',async()=>{if(graph){graph.closeAllConnections();await new Promise((r,j)=>graph.close(e=>e?j(e):r()));}}],
    ['owned ledger',()=>pool.query('DELETE FROM reply_ledger WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['owned authentication role',()=>authFixture?.dispose()],
    ['owned grants',()=>roleCreated?pool.query(`DROP OWNED BY ${role}`):undefined],['owned role',()=>roleCreated?pool.query(`DROP ROLE ${role}`):undefined],['parent runtime',()=>parentRuntime.dispose()],
  ]));
  await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);roleCreated=true;
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);await pool.query(`GRANT EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchants(text[]) TO ${role}`);
  await restrictTenantAuthenticationPrivileges(pool,role,bootstrapUrl);
  authFixture=await createDisposableAuthenticationRole(pool,bootstrapUrl);
  for(let i=0;i<2;i++){
    const created=await accounts.upsertPendingMerchantAuthoritative({phone:`+1994${String(randomInt(0,100000000)).padStart(8,'0')}`,passwordHash:'synthetic',ownerName:'Synthetic',storeName:'Synthetic',activityType:'retail',language:'ar',requestedPlan:'silver'});const id=created.account.id;merchants.push(id);
    await accounts.markMerchantOtpVerifiedAuthoritative(id);await pool.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[id]);
    const current=await settings.getMerchantOperationalSettingsAuthoritative(id);
    await settings.updateMerchantOperationalSettingsAuthoritative({merchantId:id,expectedVersion:current.version,patch:{auto_reply_enabled:true,delivery:{enabled:true,pricing_mode:'flat',fee_iqd:5000,estimated_days_min:1,estimated_days_max:2,areas:['Baghdad']},payment:{cash_on_delivery_enabled:true,electronic_payment_enabled:false,methods:['cash_on_delivery']}}});
    await pool.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,price_iqd,billing_anchor_day,base_reply_limit,base_replies_used,base_replies_remaining,addon_replies_remaining,emergency_credit_amount,emergency_credit_activated,emergency_debt,auto_reply_enabled,starts_at,expires_at,activated_at,version,created_at,updated_at) VALUES($1,$2,'silver','active',10000,1,20,0,20,0,0,false,0,true,now()-interval '1 day',now()+interval '30 days',now(),1,now()-interval '1 minute',now()-interval '1 minute')",[`meta-restart-sub-${i}-${suffix}`,id]);
    await channels.connectMetaChannelAuthoritative({merchantId:id,platform:'messenger',pageId:i===0?page:`${page}-foreign`,pageName:'Synthetic',accessToken:i===0?token:`${token}-foreign`,webhookSubscribed:true});
  }
  const gapSenders=new Set();
  const fake=express();fake.use(express.json());fake.post('/v22.0/:page/messages',(req,res)=>{
    const foreign=req.params.page===`${page}-foreign`;assert.ok(foreign||req.params.page===page);assert.equal(req.headers.authorization,`Bearer ${foreign?`${token}-foreign`:token}`);if(gapSenders.has(req.body.recipient.id))assert.equal(req.body.message.text,'I need to hand this question to a team member so you receive an accurate answer.');else assert.match(req.body.message.text,/التوصيل|رسوم/);providerCalls++;res.json({recipient_id:req.body.recipient.id,message_id:`synthetic-identity-send-${providerCalls}`});
  });graph=await new Promise((r,j)=>{const s=fake.listen(0,'127.0.0.1',()=>r(s));s.once('error',j);});
  async function start(crash=false){
    const marker=`meta-restart-owned-${randomUUID()}`;markers.push(marker);
    const child=spawn(process.execPath,['--import','tsx',childPath],{env:{...process.env,DATABASE_URL:bootstrapUrl,FAWRI_AUTH_DATABASE_URL:authFixture.url,META_APP_SECRET:secret,META_VERIFY_TOKEN:'synthetic-verify',META_GRAPH_BASE_URL:`http://127.0.0.1:${graph.address().port}`,FAWRI_META_REPLY_TRANSPORT:'live',FAWRI_TEST_META_ROLE:role,FAWRI_TEST_META_PASSWORD:runtimePassword,FAWRI_TEST_META_MARKER:marker,FAWRI_TEST_META_DEADLETTER_CRASH:crash?'1':'0',FAWRI_TEST_META_RESTART_EVENT:event,LOG_LEVEL:'silent'},stdio:['ignore','pipe','pipe','ipc']});
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
  const notificationInputs=[],notificationActors=[];
  let worker,positivePassed=false,omittedRecipientPassed=false;const deniedKinds=new Set();
  await t.test('signed legitimate foreign channel is connected and original worker sends/debits once',async()=>{
    worker=await start();const valid=bodyFor(1,'positive'),body=JSON.stringify(valid.payload.webhook_body);
    const response=await fetch(`http://127.0.0.1:${worker.info.port}/api/meta/webhook`,{method:'POST',headers:{'Content-Type':'application/json','Connection':'close','X-Hub-Signature-256':`sha256=${createHmac('sha256',secret).update(body).digest('hex')}`},body});assert.equal(response.status,200);
    assert.equal((await worker.command('run')).ran,true);assert.equal(providerCalls,1);
    const b=await balances();assert.equal(b.find(x=>x.merchant_id===merchants[1]).base_replies_used,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM messages WHERE merchant_id=$1 AND sender='fawri' AND status='sent'",[merchants[1]])).rows[0].n,1);positivePassed=true;notificationInputs.push({index:1,valid});
  });
  await t.test('omitted optional recipient remains compatible with original worker',async()=>{
    const valid=bodyFor(0,'recipient-omitted');delete valid.payload.webhook_body.entry[0].messaging[0].recipient;
    const enqueued=await queue.enqueueDurableJobAuthoritative({type:'meta.webhook.reply',merchantId:merchants[0],dedupeKey:valid.event,maxAttempts:1,payload:valid.payload});
    assert.equal((await worker.command('run')).ran,true);
    assert.equal((await pool.query('SELECT status FROM background_jobs WHERE id=$1',[enqueued.job.id])).rows[0].status,'completed');
    assert.equal(providerCalls,2);assert.equal((await balances()).find(x=>x.merchant_id===merchants[0]).base_replies_used,1);omittedRecipientPassed=true;notificationInputs.push({index:0,valid});
  });
  const cases=['merchant','event','missing_event','body_page_conflict','body_sender_conflict','body_message_conflict','body_page_missing','body_sender_missing','body_message_missing','body_object_conflict','body_echo','body_extra_entry','body_extra_message','body_recipient_conflict','body_recipient_empty','body_recipient_malformed'];
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
    if(kind==='body_recipient_conflict')message.recipient.id=`${page}-foreign`;
    if(kind==='body_recipient_empty')message.recipient.id='';
    if(kind==='body_recipient_malformed')message.recipient=null;
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
    if(positivePassed&&omittedRecipientPassed&&deniedKinds.size===cases.length)console.log('META_JOB_IDENTITY_PROOF '+JSON.stringify({originalLiveWorker:true,restrictedRole:true,originalEncryptedQueue:true,validForeignChannelPositive:true,tenantMismatchDenied:true,eventMismatchDenied:true,missingEventDenied:true,webhookBodyConflictAndMissingDenied:true,normalizedEnvelopeDenied:true,presentRecipientValidated:true,omittedRecipientCompatible:true,deniedCaseCount:deniedKinds.size,domainSurfacesUnchanged:9,providerCalls,contextReset:true}));
  });
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const {MERCHANT_SESSION_COOKIE}=await import('../src/middleware/authSession.ts');
  const {isMerchantNotificationRecord,isSafeMerchantNotificationActionUrl}=await import('../../fawri/src/lib/merchantNotificationsAuthority.ts');
  async function notificationRequest(actor,path,method='GET'){
    const response=await fetch('http://127.0.0.1:'+worker.info.port+path,{method,headers:{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device}});
    return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
  }
  async function notificationRows(id){
    return (await pool.query("SELECT * FROM notifications WHERE merchant_id=$1 AND type='operational_customer_message' ORDER BY id",[id])).rows;
  }
  function notificationRecord(actor,row){
    const common={id:row.id,type:'operational_customer_message',conversation_id:actor.conversation,action_url:'/dashboard/conversations?conversation='+encodeURIComponent(actor.conversation),created_at:new Date(row.created_at).toISOString()};
    return {...common,...(row.read_at?{read_at:new Date(row.read_at).toISOString()}:{})};
  }
  await t.test('actual Meta caller emits exact customer-message SQL fields and authenticated app frontend-valid records',async()=>{
    assert.equal(notificationInputs.length,2);
    for(const {index,valid} of notificationInputs){
      const merchantId=merchants[index],sender=valid.payload.sender_id,conversation='messenger-'+sender;
      const device='notice-device-'+randomUUID(),session=await auth.issueSession({accountId:merchantId,accountKind:'merchant',tenantId:merchantId,deviceId:device});
      const actor={id:merchantId,index,valid,device,conversation,cookie:MERCHANT_SESSION_COOKIE+'='+session.token};notificationActors.push(actor);
      const messages=(await pool.query("SELECT conversation_id,external_event_id FROM messages WHERE merchant_id=$1 AND sender='customer' AND external_event_id=$2",[merchantId,valid.event])).rows;
      assert.deepEqual(messages,[{conversation_id:conversation,external_event_id:valid.event}]);
      const rows=await notificationRows(merchantId);assert.equal(rows.length,1);const row=rows[0];
      actor.noticeId=row.id;
      assert.equal(row.audience,'merchant');assert.equal(row.account_id,merchantId);assert.equal(row.source_entity_type,'conversation_event');assert.equal(row.source_entity_id,valid.event);
      assert.deepEqual(row.variables,{conversation_id:conversation,action_url:'/dashboard/conversations?conversation='+encodeURIComponent(conversation)});
      assert.equal(new Date(row.created_at).toISOString(),new Date(valid.payload.webhook_body.entry[0].messaging[0].timestamp).toISOString());
      const before=await domainSnapshot(),result=await notificationRequest(actor,'/api/auth/notifications?limit=50');
      assert.equal(result.status,200);assert.equal(result.cache,'no-store');assert.deepEqual(result.body,{ok:true,notifications:[notificationRecord(actor,row)]});
      assert.equal(isMerchantNotificationRecord(result.body.notifications[0]),true);assert.equal(isSafeMerchantNotificationActionUrl(result.body.notifications[0].action_url),true);
      assert.deepEqual(await domainSnapshot(),before);
    }
    assert.notEqual(notificationActors[0].noticeId,notificationActors[1].noticeId);
  });
  await t.test('Meta-produced notices deny peer mutation and own read replay preserves exact fields and peer state',async()=>{
    assert.equal(notificationActors.length,2);
    for(const actor of notificationActors){
      const peer=notificationActors.find(value=>value.id!==actor.id),path='/api/auth/notifications/'+actor.noticeId+'/read';
      const before=await domainSnapshot(),denied=await notificationRequest(peer,path,'PATCH');
      assert.equal(denied.status,404);assert.equal(denied.body.notification,undefined);assert.deepEqual(await domainSnapshot(),before);
      const peerBefore=(await pool.query('SELECT to_jsonb(n) AS row FROM notifications n WHERE merchant_id=$1 ORDER BY id',[peer.id])).rows;
      const read=await notificationRequest(actor,path,'PATCH');assert.equal(read.status,200);assert.equal(read.cache,'no-store');
      const row=(await notificationRows(actor.id))[0];assert.ok(row.read_at);assert.deepEqual(read.body,{ok:true,notification:notificationRecord(actor,row)});assert.equal(isMerchantNotificationRecord(read.body.notification),true);
      assert.deepEqual((await pool.query('SELECT to_jsonb(n) AS row FROM notifications n WHERE merchant_id=$1 ORDER BY id',[peer.id])).rows,peerBefore);
      const stable=await domainSnapshot(),again=await notificationRequest(actor,path,'PATCH');assert.equal(again.status,200);assert.deepEqual(again.body,read.body);assert.deepEqual(await domainSnapshot(),stable);
    }
  });
  await t.test('signed redelivery and original durable-job replay preserve notices reply debit and provider call count',async()=>{
    const before=await domainSnapshot(),calls=providerCalls;
    const jobsBefore=(await pool.query('SELECT to_jsonb(j) AS row FROM background_jobs j WHERE merchant_id=ANY($1::text[]) ORDER BY id',[merchants])).rows;
    const signed=notificationInputs.find(value=>value.index===1).valid,body=JSON.stringify(signed.payload.webhook_body);
    const response=await fetch('http://127.0.0.1:'+worker.info.port+'/api/meta/webhook',{method:'POST',headers:{'Content-Type':'application/json','Connection':'close','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(body).digest('hex')},body});assert.equal(response.status,200);
    for(const {index,valid} of notificationInputs){
      const replay=await queue.enqueueDurableJobAuthoritative({type:'meta.webhook.reply',merchantId:merchants[index],dedupeKey:valid.event,maxAttempts:1,payload:valid.payload});
      assert.equal(replay.deduplicated,true);
    }
    assert.equal((await worker.command('run')).ran,false);
    assert.equal(providerCalls,calls);assert.deepEqual(await domainSnapshot(),before);
    assert.deepEqual((await pool.query('SELECT to_jsonb(j) AS row FROM background_jobs j WHERE merchant_id=ANY($1::text[]) ORDER BY id',[merchants])).rows,jobsBefore);
    console.log('P0_META_CUSTOMER_NOTIFICATION_CALLER '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',actualRestrictedWorker:true,actualEncryptedJobs:true,actualApp:true,actualFrontendValidator:true,merchants:2,exactSqlFields:true,authenticatedMerchantLists:true,peerReadDenied:true,ownReadReplay:true,signedRedeliveryAndQueueDedup:true,providerCallsUnchanged:true,replyDebitUnchanged:true,existingIdentityDenialsReused:cases.length,externalProvider:false,browserRendering:false,hostedAccepted:false,wholeFieldCellAccepted:false}));
  });


  const gapActors=[];
  async function gapState(){
    const state=await domainSnapshot();
    for(const table of ['training_requests','knowledge_audit_events','learned_answers']){
      state[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY id`,[merchants])).rows;
    }
    return state;
  }
  function gapRecord(row){return {id:row.id,type:row.type,...row.variables,created_at:new Date(row.created_at).toISOString(),...(row.read_at?{read_at:new Date(row.read_at).toISOString()}:{})};}
  await t.test('actual restricted Meta handoff creates owned training requests and exact knowledge-gap notification fields',async()=>{
    for(const actor of notificationActors){
      const valid=bodyFor(actor.index,'knowledge-gap-'+actor.index),question='Do you offer gift wrapping?';
      valid.payload.webhook_body.entry[0].messaging[0].message.text=question;
      gapSenders.add(valid.payload.sender_id);
      const conversation='messenger-'+valid.payload.sender_id,calls=providerCalls;
      const enqueued=await queue.enqueueDurableJobAuthoritative({type:'meta.webhook.reply',merchantId:actor.id,dedupeKey:valid.event,maxAttempts:1,payload:valid.payload});
      assert.equal((await worker.command('run')).ran,true);
      const job=(await pool.query('SELECT status,last_error_code FROM background_jobs WHERE id=$1',[enqueued.job.id])).rows[0];
      assert.deepEqual(job,{status:'completed',last_error_code:null});assert.equal(providerCalls,calls+1);
      const current=(await pool.query('SELECT status,assigned_to_human,needs_training FROM conversations WHERE merchant_id=$1 AND id=$2',[actor.id,conversation])).rows[0];
      assert.deepEqual(current,{status:'manual',assigned_to_human:true,needs_training:true});
      const messages=(await pool.query('SELECT sender,text,status,metadata FROM messages WHERE merchant_id=$1 AND conversation_id=$2 ORDER BY sender',[actor.id,conversation])).rows;
      assert.equal(messages.length,2);assert.equal(messages[0].sender,'customer');assert.equal(messages[0].text,question);
      const reply=messages.find(row=>row.sender==='fawri');assert.equal(reply.status,'sent');assert.equal(reply.metadata.reason_code,'NO_TRUSTED_ANSWER');assert.equal(reply.metadata.handoff_after_reply,true);
      const trainingId=reply.metadata.training_request_id;assert.ok(trainingId);
      const training=(await pool.query('SELECT merchant_id,detected_intent,reason,status FROM training_requests WHERE id=$1',[trainingId])).rows;
      assert.deepEqual(training,[{merchant_id:actor.id,detected_intent:'knowledge_gap',reason:'no_trusted_answer',status:'pending_merchant_reply'}]);
      const rows=(await pool.query("SELECT * FROM notifications WHERE merchant_id=$1 AND type='operational_knowledge_gap'",[actor.id])).rows;assert.equal(rows.length,1);
      const row=rows[0];assert.equal(row.account_id,actor.id);assert.equal(row.audience,'merchant');assert.equal(row.source_entity_type,'training_request');assert.equal(row.source_entity_id,trainingId);
      assert.deepEqual(row.variables,{training_request_id:trainingId,conversation_id:conversation,action_url:'/dashboard/conversations?conversation='+encodeURIComponent(conversation)});
      assert.ok(new Date(row.created_at)>=new Date(valid.payload.webhook_body.entry[0].messaging[0].timestamp));
      gapActors.push({...actor,valid,conversation,trainingId,noticeId:row.id});
    }
    assert.equal(gapActors.length,2);assert.notEqual(gapActors[0].trainingId,gapActors[1].trainingId);
  });
  await t.test('actual app exposes only owned gap fields and denies peer notice read without changing training or domain state',async()=>{
    assert.equal(gapActors.length,2);
    for(const actor of gapActors){
      const before=await gapState(),list=await notificationRequest(actor,'/api/auth/notifications?limit=50');
      assert.equal(list.status,200);assert.equal(list.cache,'no-store');
      const notice=list.body.notifications.find(row=>row.id===actor.noticeId),row=(await pool.query('SELECT * FROM notifications WHERE id=$1',[actor.noticeId])).rows[0];
      assert.deepEqual(notice,gapRecord(row));assert.equal(isMerchantNotificationRecord(notice),true);assert.equal(isSafeMerchantNotificationActionUrl(notice.action_url),true);
      const peer=gapActors.find(value=>value.id!==actor.id);assert.equal(list.body.notifications.some(row=>row.id===peer.noticeId),false);assert.deepEqual(await gapState(),before);
      const path='/api/auth/notifications/'+actor.noticeId+'/read',denied=await notificationRequest(peer,path,'PATCH');assert.equal(denied.status,404);assert.deepEqual(await gapState(),before);
      const read=await notificationRequest(actor,path,'PATCH');assert.equal(read.status,200);assert.equal(isMerchantNotificationRecord(read.body.notification),true);
      const stored=(await pool.query('SELECT * FROM notifications WHERE id=$1',[actor.noticeId])).rows[0];assert.ok(stored.read_at);assert.deepEqual(read.body,{ok:true,notification:gapRecord(stored)});
      const after=await gapState();assert.deepEqual(after.training_requests,before.training_requests);assert.deepEqual(after.knowledge_audit_events,before.knowledge_audit_events);
      const replay=await notificationRequest(actor,path,'PATCH');assert.deepEqual(replay.body,read.body);assert.deepEqual(await gapState(),after);
    }
  });
  await t.test('knowledge-gap event redelivery retains handoff training notices debit and send count without repeating work',async()=>{
    assert.equal(gapActors.length,2);const before=await gapState(),calls=providerCalls;
    const jobsBefore=(await pool.query('SELECT to_jsonb(j) AS row FROM background_jobs j WHERE merchant_id=ANY($1::text[]) ORDER BY id',[merchants])).rows;
    for(const actor of gapActors){
      const body=JSON.stringify(actor.valid.payload.webhook_body),response=await fetch('http://127.0.0.1:'+worker.info.port+'/api/meta/webhook',{method:'POST',headers:{'Content-Type':'application/json','Connection':'close','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(body).digest('hex')},body});assert.equal(response.status,200);
      const replay=await queue.enqueueDurableJobAuthoritative({type:'meta.webhook.reply',merchantId:actor.id,dedupeKey:actor.valid.event,maxAttempts:1,payload:actor.valid.payload});assert.equal(replay.deduplicated,true);
    }
    assert.equal((await worker.command('run')).ran,false);assert.equal(providerCalls,calls);assert.deepEqual(await gapState(),before);
    assert.deepEqual((await pool.query('SELECT to_jsonb(j) AS row FROM background_jobs j WHERE merchant_id=ANY($1::text[]) ORDER BY id',[merchants])).rows,jobsBefore);
    console.log('P0_META_KNOWLEDGE_GAP_CALLER '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',actualRestrictedWorker:true,actualKnowledgeEngine:true,actualHandoff:true,ownedTrainingRequests:2,exactSqlFields:true,actualApp:true,actualFrontendValidator:true,peerNoticeReadDenied:true,readReplay:true,signedRedeliveryAndQueueDedup:true,externalProvider:false,browserRendering:false,crashRecovery:false,wholeFieldCellAccepted:false}));
  });

  await t.test('legacy migrated event history cannot be admitted as a fresh Meta job',async t=>{
    const {buildTransitionalMigrationReadiness}=await import('../../../scripts/lib/transitional-migration-readiness.mjs');
    const {prepareInsert}=await import('../../../lib/db/scripts/lib/migration-write.mjs');
    const {loadLatestSnapshot}=await import('../../../scripts/lib/postgresql-migration-plan.mjs');
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fawri-legacy-meta-identity-'));
    const valid=bodyFor(0,'legacy-completed'),receivedAt='2026-08-06T12:00:00.000Z';
    const write=(name,value)=>fs.writeFileSync(path.join(directory,name),JSON.stringify(value)+'\n');
    let row;
    try{
      write('merchants.json',{merchants:[{id:merchants[0]}],subscriptions:[]});
      write('fawri-runtime-db.json',{metaPagesByPageId:{[page]:{page_id:page,merchant_id:merchants[0],platform:'messenger',status:'connected'}}});
      write('processed-meta-events.json',{events:{[valid.event]:receivedAt}});
      write('reply-reservations.json',{reservations:{}});write('background-jobs.json',{version:1,jobs:[]});
      const before=Object.fromEntries(fs.readdirSync(directory).map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')]));
      const {report}=buildTransitionalMigrationReadiness({dataDirectory:directory});assert.equal(report.ok,true);assert.equal(report.target_rows.processed_channel_events.length,1);
      const mapped=report.target_rows.processed_channel_events[0];
      const channel=(await pool.query("SELECT id FROM merchant_channels WHERE merchant_id=$1 AND platform='messenger' AND page_id=$2",[merchants[0],page])).rows;
      assert.equal(channel.length,1);
      // Bootstrap only: reconcile the mapper's legacy channel anchor to this
      // fixture's connected channel for the same merchant/page. This is not a
      // full migration commit or proof of production channel reconciliation.
      row={...mapped,channel_id:channel[0].id};
      assert.equal(row.processing_status,'completed');
      assert.equal(row.payload_hash,createHash('sha256').update(JSON.stringify({event_id:valid.event,received_at:receivedAt})).digest('hex'));
      const insert=prepareInsert('processed_channel_events',row,loadLatestSnapshot().value);await pool.query(insert.sql,insert.values);
      const after=Object.fromEntries(fs.readdirSync(directory).map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(directory,name))).digest('hex')]));assert.deepEqual(after,before);
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
    const eventState=async()=>({
      legacy:(await pool.query('SELECT to_jsonb(e) AS row FROM processed_channel_events e WHERE id=$1',[row.id])).rows,
      jobs:(await pool.query('SELECT to_jsonb(j) AS row FROM background_jobs j WHERE merchant_id=$1 AND dedupe_key=$2',[merchants[0],valid.event])).rows,
      inbound:(await pool.query('SELECT to_jsonb(e) AS row FROM channel_inbound_events e WHERE merchant_id=$1 AND external_event_id=$2',[merchants[0],valid.event])).rows,
    });
    const signed=async()=>{const body=JSON.stringify(valid.payload.webhook_body);const r=await fetch('http://127.0.0.1:'+worker.info.port+'/api/meta/webhook',{method:'POST',headers:{'Content-Type':'application/json','Connection':'close','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(body).digest('hex')},body});return {status:r.status,body:await r.json()};};
    const cleanupJob=()=>pool.query('DELETE FROM background_jobs WHERE merchant_id=$1 AND dedupe_key=$2',[merchants[0],valid.event]);
    try{
      await t.test('signed completed legacy redelivery holds before enqueue and preserves legacy and domain state',async()=>{
        const before=await eventState(),domain=await domainSnapshot(),calls=providerCalls;assert.equal(before.jobs.length,0);assert.equal(before.inbound.length,0);assert.equal(before.legacy.length,1);
        try{
          const response=await signed(),after=await eventState();
          console.log('P0_LEGACY_META_ADMISSION_OBSERVATION '+JSON.stringify({status:response.status,legacyRows:after.legacy.length,currentJobs:after.jobs.length,currentInboundRows:after.inbound.length,providerCallsBefore:calls,providerCallsAfter:providerCalls,workerInvoked:false}));
          assert.equal(response.status,503,'legacy-only history must not become a fresh job');assert.equal(response.body.code,'META_WEBHOOK_QUEUE_UNAVAILABLE');
          assert.deepEqual(await eventState(),before);assert.deepEqual(await domainSnapshot(),domain);assert.equal(providerCalls,calls);
          const again=await signed();assert.equal(again.status,503);assert.deepEqual(await eventState(),before);assert.equal(providerCalls,calls);
          await assert.rejects(queue.enqueueDurableJobAuthoritative({type:'meta.webhook.reply',merchantId:merchants[0],dedupeKey:valid.event,maxAttempts:1,payload:valid.payload}),{code:'META_LEGACY_EVENT_HISTORY_UNRECONCILED'});
          assert.deepEqual(await eventState(),before);assert.deepEqual(await domainSnapshot(),domain);
        }finally{await cleanupJob();}
      });
      await t.test('pre-existing queued legacy event holds in the original worker before domain writes and cannot be requeued',async()=>{
        await pool.query('DELETE FROM processed_channel_events WHERE id=$1',[row.id]);
        let enqueued;
        try{enqueued=await queue.enqueueDurableJobAuthoritative({type:'meta.webhook.reply',merchantId:merchants[0],dedupeKey:valid.event,maxAttempts:1,payload:valid.payload});}
        finally{const insert=prepareInsert('processed_channel_events',row,loadLatestSnapshot().value);await pool.query(insert.sql,insert.values);}
        const before=await domainSnapshot(),legacy=(await eventState()).legacy,calls=providerCalls;
        try{
          assert.equal((await worker.command('run')).ran,true);
          const state=(await pool.query('SELECT status,last_error_code,result FROM background_jobs WHERE id=$1',[enqueued.job.id])).rows[0];
          assert.equal(state.status,'dead_letter');assert.equal(state.last_error_code,'META_LEGACY_EVENT_HISTORY_UNRECONCILED');assert.equal(state.result._fawri_requeue_policy,'blocked');
          await assert.rejects(queue.requeueDeadLetterJobAuthoritative(enqueued.job.id),{code:'DURABLE_JOB_REQUEUE_BLOCKED'});
          assert.deepEqual(await domainSnapshot(),before);assert.deepEqual((await eventState()).legacy,legacy);assert.equal(providerCalls,calls);
        }finally{await cleanupJob();}
      });
      await t.test('foreign legacy history does not suppress current merchant enqueue and preserves peer history',async()=>{
        await pool.query('DELETE FROM processed_channel_events WHERE id=$1',[row.id]);
        const peerChannel=(await pool.query("SELECT id FROM merchant_channels WHERE merchant_id=$1 AND platform='messenger' AND page_id=$2",[merchants[1],page+'-foreign'])).rows[0];
        const peerRow={...row,merchant_id:merchants[1],channel_id:peerChannel.id};
        const insert=prepareInsert('processed_channel_events',peerRow,loadLatestSnapshot().value);await pool.query(insert.sql,insert.values);
        const legacy=(await eventState()).legacy,before=await domainSnapshot(),calls=providerCalls;
        try{
          const response=await signed();assert.equal(response.status,200);assert.equal(response.body.enqueued,1);
          const state=await eventState();assert.equal(state.jobs.length,1);assert.equal(state.jobs[0].row.merchant_id,merchants[0]);assert.equal(state.jobs[0].row.status,'queued');assert.equal(state.inbound.length,0);
          assert.deepEqual(state.legacy,legacy);assert.deepEqual(await domainSnapshot(),before);assert.equal(providerCalls,calls);
        }finally{await cleanupJob();await pool.query('DELETE FROM processed_channel_events WHERE id=$1',[row.id]);const restore=prepareInsert('processed_channel_events',row,loadLatestSnapshot().value);await pool.query(restore.sql,restore.values);}
      });
      await t.test('legacy history lookup SQL denial fails closed without queue payload or business writes',async()=>{
        await pool.query('DELETE FROM processed_channel_events WHERE id=$1',[row.id]);
        const before=await eventState(),domain=await domainSnapshot(),calls=providerCalls;
        await pool.query(`REVOKE SELECT ON processed_channel_events FROM ${role}`);
        try{
          assert.equal((await pool.query("SELECT has_table_privilege($1, 'processed_channel_events', 'SELECT') AS allowed",[role])).rows[0].allowed,false);
          const response=await signed();assert.equal(response.status,503);assert.equal(response.body.code,'META_WEBHOOK_QUEUE_UNAVAILABLE');
          assert.deepEqual(await eventState(),before);assert.deepEqual(await domainSnapshot(),domain);assert.equal(providerCalls,calls);
        }finally{await pool.query(`GRANT SELECT ON processed_channel_events TO ${role}`);await cleanupJob();const restore=prepareInsert('processed_channel_events',row,loadLatestSnapshot().value);await pool.query(restore.sql,restore.values);}
      });
    }finally{await cleanupJob();await pool.query('DELETE FROM processed_channel_events WHERE id=$1',[row.id]);}
  });
});

