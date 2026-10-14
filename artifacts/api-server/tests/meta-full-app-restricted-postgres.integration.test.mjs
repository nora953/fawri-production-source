import assert from 'node:assert/strict';
import {createHmac,randomUUID,randomInt} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {cleanupResources,stopTestChild} from './helpers/cleanup-resources.mjs';
await assertDisposablePostgres();
const dataDir=mkdtempSync(path.join(os.tmpdir(),'fawri-meta-app-owned-'));
Object.assign(process.env,{FAWRI_DATA_DIR:dataDir,FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',FAWRI_META_TOKEN_KEY_ID:'synthetic-meta-app-key',FAWRI_META_TOKEN_KEY_BASE64:Buffer.alloc(32,29).toString('base64'),FAWRI_AUTH_SECURITY_SECRET:'synthetic-meta-app-security-secret-at-least-32-characters',FAWRI_PASSWORD_SALT:'synthetic-meta-app-password-salt'});
const {pool}=await import('@workspace/db');
const accounts=await import('../src/services/postgresMerchantAccountAuthority.ts');
const settings=await import('../src/services/postgresMerchantSettingsAuthority.ts');
const channels=await import('../src/services/postgresMetaChannelAuthority.ts');
const {default:express}=await import('express');

test('signed actual Meta app reaches original manual filter, tenant queue and live worker under restricted RLS',{timeout:120000},async t=>{
  const suffix=randomUUID().replaceAll('-',''),role=`meta_app_${suffix}`,marker=`meta-app-owned-${suffix}`;
  const merchants=[],pages=[],tokens=[],sends=[];let child,graph,roleCreated=false;
  t.after(async()=>cleanupResources([
    ['owned child',async()=>{if(child&&child.exitCode===null){try{await command('stop');}finally{await stopTestChild(child);}}}],
    ['owned backends',()=>pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1 AND datname=current_database() AND pid<>pg_backend_pid()',[marker])],
    ['owned graph',async()=>{if(graph){graph.closeAllConnections();await new Promise((r,j)=>graph.close(e=>e?j(e):r()));}}],
    ['owned accounts',()=>pool.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['owned grants',()=>roleCreated?pool.query(`DROP OWNED BY ${role}`):undefined],
    ['owned role',()=>roleCreated?pool.query(`DROP ROLE ${role}`):undefined],
    ['pool',()=>pool.end()],['owned directory',()=>rmSync(dataDir,{recursive:true,force:true})],
  ]));
  await pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);roleCreated=true;
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  assert.equal((await pool.query("SELECT has_function_privilege($1,'public.fawri_resolve_meta_page_merchants(text[])','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
  await pool.query(`GRANT EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchants(text[]) TO ${role}`);
  for(let i=0;i<2;i++){
    const created=await accounts.upsertPendingMerchantAuthoritative({phone:`+1999${String(randomInt(0,100000000)).padStart(8,'0')}`,passwordHash:'synthetic',ownerName:'Synthetic',storeName:'Synthetic',activityType:'retail',language:'ar',requestedPlan:'silver'});
    const id=created.account.id;merchants.push(id);pages.push(`page-meta-app-${i}-${suffix}`);tokens.push(`synthetic-meta-app-token-${i}-${suffix}`);
    await accounts.markMerchantOtpVerifiedAuthoritative(id);await pool.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[id]);
    const initial=await settings.getMerchantOperationalSettingsAuthoritative(id);
    await settings.updateMerchantOperationalSettingsAuthoritative({merchantId:id,expectedVersion:initial.version,patch:{auto_reply_enabled:true,delivery:{enabled:true,pricing_mode:'flat',fee_iqd:5000,estimated_days_min:1,estimated_days_max:2,areas:['Baghdad']},payment:{cash_on_delivery_enabled:true,electronic_payment_enabled:false,methods:['cash_on_delivery']}}});
    await pool.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,price_iqd,billing_anchor_day,base_reply_limit,base_replies_used,base_replies_remaining,addon_replies_remaining,emergency_credit_amount,emergency_credit_activated,emergency_debt,auto_reply_enabled,starts_at,expires_at,activated_at,version) VALUES($1,$2,'silver','active',10000,1,20,0,20,0,0,false,0,true,now()-interval '1 day',now()+interval '30 days',now(),1)",[`meta-app-sub-${i}-${suffix}`,id]);
    await channels.connectMetaChannelAuthoritative({merchantId:id,platform:'messenger',pageId:pages[i],pageName:'Synthetic',accessToken:tokens[i],webhookSubscribed:true});
  }
  const fake=express();fake.use(express.json());fake.post('/v22.0/:page/messages',(req,res)=>{
    const i=pages.indexOf(req.params.page);const valid=i>=0&&req.headers.authorization===`Bearer ${tokens[i]}`&&String(req.body.recipient?.id||'').startsWith('customer-meta-app-')&&/التوصيل|رسوم/.test(String(req.body.message?.text||''));
    if(!valid){res.status(400).json({error:{code:100}});return;}
    sends.push({page:i,recipient:req.body.recipient.id});res.json({recipient_id:req.body.recipient.id,message_id:`synthetic-provider-message-${sends.length}`});
  });
  graph=await new Promise((r,j)=>{const s=fake.listen(0,'127.0.0.1',()=>r(s));s.once('error',j);});
  const secret=`synthetic-meta-app-secret-${suffix}`;
  const pending=new Map();let readyResolve;const ready=new Promise(r=>{readyResolve=r;});
  child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./helpers/meta-full-app-restricted-child.mjs',import.meta.url))],{env:{...process.env,META_APP_SECRET:secret,META_VERIFY_TOKEN:'synthetic-verify',META_GRAPH_BASE_URL:`http://127.0.0.1:${graph.address().port}`,FAWRI_META_REPLY_TRANSPORT:'live',FAWRI_JOB_POLL_INTERVAL_MS:'60000',FAWRI_TEST_META_ROLE:role,FAWRI_TEST_META_MARKER:marker,LOG_LEVEL:'silent'},stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
  child.on('message',m=>{if(m.ready)readyResolve(m);else if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
  function command(command,extra={}){const id=randomUUID();let timer;return new Promise((resolve,reject)=>{pending.set(id,m=>m.failure?reject(new Error(m.code)):resolve(m));timer=setTimeout(()=>{pending.delete(id);reject(new Error('owned Meta command timeout'));},20000);child.send({id,command,...extra});}).finally(()=>clearTimeout(timer));}
  let readyTimer;const info=await Promise.race([ready,new Promise((_,j)=>{readyTimer=setTimeout(()=>j(new Error('owned actual app startup timeout')),20000);child.once('exit',()=>j(new Error('owned actual app exited before ready')));})]).finally(()=>clearTimeout(readyTimer));assert.equal(info.restricted,true);
  async function post(page,i='normal',signature='valid',sender=`customer-meta-app-${i}-${suffix}`){const mid=`mid-meta-app-${i}-${suffix}`;const body=JSON.stringify({object:'page',entry:[{id:page,messaging:[{sender:{id:sender},recipient:{id:page},timestamp:Date.now(),message:{mid,text:'كم سعر التوصيل؟'}}]}]});const signed=`sha256=${createHmac('sha256',secret).update(body).digest('hex')}`;const response=await fetch(`http://127.0.0.1:${info.port}/api/meta/webhook`,{method:'POST',headers:{'Content-Type':'application/json','Connection':'close','X-Hub-Signature-256':signature==='valid'?signed:'sha256='+'0'.repeat(64)},body});return {status:response.status,body:await response.json(),mid,event:`meta:${page}:${mid}`};}
  const jobs=async()=>(await pool.query('SELECT merchant_id,status,result,dedupe_key,attempts FROM background_jobs WHERE merchant_id=ANY($1::text[]) ORDER BY dedupe_key',[merchants])).rows;
  const debits=async()=>(await pool.query("SELECT count(*)::int AS n FROM reply_ledger WHERE merchant_id=ANY($1::text[]) AND direction='debit'",[merchants])).rows[0].n;
  async function denial(result,status){assert.equal(result.status,status);assert.ok(!merchants.some(id=>JSON.stringify(result.body).includes(id)));assert.deepEqual(await jobs(),[]);assert.equal(await debits(),0);assert.equal(sends.length,0);}
  await t.test('invalid signature stops the actual app before queue, ledger or provider',async()=>denial(await post(pages[0],'invalid','invalid'),401));
  await t.test('unknown and disconnected pages fail closed without tenant leakage',async()=>{
    await denial(await post(`unknown-${suffix}`,'unknown'),503);
    await pool.query("UPDATE merchant_channels SET status='disconnected' WHERE merchant_id=$1",[merchants[1]]);await denial(await post(pages[1],'disconnected'),503);
    await pool.query("UPDATE merchant_channels SET status='connected' WHERE merchant_id=$1",[merchants[1]]);
  });
  await t.test('revoked routing capability rejects signed HTTP before downstream writes',async()=>{
    await pool.query(`REVOKE EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchants(text[]) FROM ${role}`);
    try{await denial(await post(pages[0],'revoked'),503);}finally{await pool.query(`GRANT EXECUTE ON FUNCTION public.fawri_resolve_meta_page_merchants(text[]) TO ${role}`);}
  });
  await t.test('original subscription authority sees each owned tenant and clears pooled context before ingress',async()=>{
    const proof=await command('subscriptions',{merchants});
    assert.equal(proof.subscriptionsVisible,true);assert.equal(proof.contextReset,true);
    assert.deepEqual(await jobs(),[]);assert.equal(await debits(),0);assert.equal(sends.length,0);
  });
  await t.test('two tenant signed deliveries queue once before any reservation or transport',async()=>{
    for(let i=0;i<2;i++){assert.equal((await post(pages[i],`auto-${i}`)).status,200);assert.equal((await post(pages[i],`auto-${i}`)).status,200);}
    const queued=await jobs();assert.equal(queued.length,2);assert.ok(queued.every(j=>j.status==='queued'&&j.attempts===0));assert.deepEqual(queued.map(j=>j.merchant_id).sort(),[...merchants].sort());assert.equal(await debits(),0);assert.equal(sends.length,0);
  });
  await t.test('original live worker claims/decrypts/sends/completes and debits once per tenant',async()=>{
    assert.equal((await command('run')).ran,true);assert.equal((await command('run')).ran,true);
    const done=await jobs();assert.ok(done.every(j=>j.status==='completed'&&j.attempts===1&&j.result.delivery_status==='sent'));assert.equal(sends.length,2);assert.deepEqual(sends.map(s=>s.page).sort(),[0,1]);assert.equal(await debits(),2);
    for(let i=0;i<2;i++){assert.equal((await post(pages[i],`auto-${i}`)).status,200);const sub=(await pool.query('SELECT base_replies_used,base_replies_remaining FROM subscriptions WHERE merchant_id=$1',[merchants[i]])).rows[0];assert.deepEqual(sub,{base_replies_used:1,base_replies_remaining:19});const rows=(await pool.query("SELECT sender,status,counted_as_auto_reply FROM messages WHERE merchant_id=$1 AND (external_message_id=$2 OR external_event_id=$3) ORDER BY sender",[merchants[i],`mid-meta-app-auto-${i}-${suffix}`,`reply:meta:${pages[i]}:mid-meta-app-auto-${i}-${suffix}`])).rows;assert.equal(rows.length,2);assert.ok(rows.some(m=>m.sender==='fawri'&&m.status==='sent'&&m.counted_as_auto_reply));}
    assert.equal((await command('run')).ran,false);assert.equal(sends.length,2);assert.equal(await debits(),2);
  });
  await t.test('actual manual filter persists inbound once and prevents queue, debit and send',async()=>{
    const sender=`customer-meta-app-manual-${suffix}`,conversation=`messenger-${sender}`;
    const channel=(await pool.query('SELECT id FROM merchant_channels WHERE merchant_id=$1',[merchants[0]])).rows[0].id;
    await pool.query("INSERT INTO conversations(id,merchant_id,channel_id,external_conversation_id,customer_external_id,customer_handle,status,assigned_to_human,needs_training) VALUES($1,$2,$3,$4,$4,$4,'manual',true,false)",[conversation,merchants[0],channel,sender]);
    assert.equal((await post(pages[0],'manual','valid',sender)).status,200);assert.equal((await post(pages[0],'manual','valid',sender)).status,200);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM messages WHERE merchant_id=$1 AND conversation_id=$2 AND external_message_id=$3',[merchants[0],conversation,`mid-meta-app-manual-${suffix}`])).rows[0].n,1);
    assert.equal((await jobs()).length,2);assert.equal(await debits(),2);assert.equal(sends.length,2);
  });
  await t.test('expired subscription is suppressed by original worker without a new debit or send',async()=>{
    await pool.query("UPDATE subscriptions SET status='expired',expires_at=now()-interval '1 hour' WHERE merchant_id=$1",[merchants[1]]);
    const result=await post(pages[1],'expired');assert.equal(result.status,200);assert.equal((await command('run')).ran,true);
    const job=(await jobs()).find(j=>j.dedupe_key===result.event);assert.equal(job.status,'completed');assert.equal(job.result.delivery_status,'suppressed');assert.equal(job.result.suppression_code,'MERCHANT_SUBSCRIPTION_EXPIRED');assert.equal(await debits(),2);assert.equal(sends.length,2);
  });
  await t.test('all original downstream transactions reset pooled tenant context',async()=>{
    const proof=await command('isolation',{merchants});assert.equal(proof.isolated,true);assert.equal(proof.contextReset,true);
    assert.equal(existsSync(path.join(dataDir,'merchants.json')),false);assert.equal(existsSync(path.join(dataDir,'meta-channels.json')),false);
  });
  console.log('META_FULL_APP_RESTRICTED_PROOF '+JSON.stringify({actualApp:true,signedHttp:true,restrictedRole:true,originalManualFilter:true,originalQueue:true,originalLiveWorker:true,localGraphTransport:true,tenantCount:2,sends:2,debits:2,manualInboundOnce:true,expiredSuppressed:true,unknownDisconnectedDenied:true,revokedCapabilityDenied:true,tenantContextReset:true,noLegacyMerchantChannelAuthority:true}));
});
