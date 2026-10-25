import assert from 'node:assert/strict';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env,{
  NODE_ENV:'test',LOG_LEVEL:'silent',FAWRI_DISABLE_JOB_WORKERS:'1',
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
  FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',
  FAWRI_AUTH_SECURITY_SECRET:'synthetic-payment-notice-secret-over-32-characters',
  FAWRI_PASSWORD_SALT:'synthetic-payment-notice-salt-over-32-characters',
});
test('verified payment conflict caller reaches tenant-scoped SQL app and frontend fields',{timeout:120000},async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin,merchants=[];
  const suffix=randomUUID().replaceAll('-',''),faultFunction='notice_fault_'+suffix,faultTrigger='notice_trigger_'+suffix;
  let server,stopSupport;
  const removeFault=async()=>{await admin.query(`DROP TRIGGER IF EXISTS ${faultTrigger} ON notifications`);await admin.query(`DROP FUNCTION IF EXISTS ${faultFunction}()`);};
  t.after(()=>cleanupResources([
    ['support timer',()=>stopSupport?.()],
    ['HTTP',async()=>{if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}}],
    ['fault trigger',removeFault],
    ...['notifications','orders','conversations','merchant_channels'].map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const {MERCHANT_SESSION_COOKIE}=await import('../src/middleware/authSession.ts');
  const {recordVerifiedProviderPaymentEvidenceAuthoritative:record}=await import('../src/services/postgresOrderPaymentProviderAuthority.ts');
  const {isMerchantNotificationRecord,isSafeMerchantNotificationActionUrl}=await import('../../fawri/src/lib/merchantNotificationsAuthority.ts');
  const actors=[];
  async function seedPaidOrder(actor,tag){
    const order='Payment-Order-'+tag+'-'+randomUUID(),conversation='Payment-Conversation-'+tag+'-'+randomUUID();
    await admin.query("INSERT INTO conversations(id,merchant_id,channel_id,customer_external_id,customer_name,status,assigned_to_human) VALUES($1,$2,$3,$4,'private-customer','auto_replying',false)",[conversation,actor.id,actor.channel,'private-external-'+order]);
    // Reuse accepted merchant-confirmation domain proof. This fixture starts at
    // its paid state; no new merchant-confirmation/fulfillment claim is made.
    await admin.query("INSERT INTO orders(id,merchant_id,conversation_id,customer_name,customer_phone,status,payment_method,payment_status,subtotal_iqd,total_iqd,source_channel,payment_verified_at,payment_verified_by_account_id,payment_confirmation_source,notes) VALUES($1,$2,$3,'private-customer','private-phone','confirmed','superqi','paid',75000,75000,'messenger',now(),$2,'merchant_confirmed','private-order-note')",[order,actor.id,conversation]);
    return {order,conversation};
  }
  for(const label of ['A','B']){
    const id='Payment-Notice-'+label+'-'+randomUUID();merchants.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,'+198'+randomInt(100000000,999999999)]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
    const channel='Payment-Channel-'+randomUUID(),device='Payment-Device-'+randomUUID();
    await admin.query("INSERT INTO merchant_channels(id,merchant_id,platform,status,page_id) VALUES($1,$2,'messenger','connected',$3)",[channel,id,'private-page-'+id]);
    const session=await auth.issueSession({accountId:id,accountKind:'merchant',tenantId:id,deviceId:device});
    const actor={id,channel,device,cookie:MERCHANT_SESSION_COOKIE+'='+session.token};
    Object.assign(actor,await seedPaidOrder(actor,'standard'));actors.push(actor);
  }
  const [a,b]=actors;
  const event='same-notice-event-'+suffix;
  function evidence(actor,overrides={}){
    return {merchantId:actor.id,orderId:actor.order,provider:'superqi',providerEventId:event,providerTransactionRef:'synthetic-transaction-'+suffix,outcome:'failed',amountIqd:75000,currency:'IQD',payloadSha256:createHash('sha256').update(event).digest('hex'),authenticityVerified:true,sanitizedMetadata:{private_marker:'internal-event-only'},...overrides};
  }
  const snapshot=async(ids=merchants)=>{
    const state={};for(const table of ['orders','order_payment_provider_events','notifications','conversations'])state[table]=(await admin.query(`SELECT to_jsonb(n) AS row FROM ${table} n WHERE merchant_id=ANY($1::text[]) ORDER BY id`,[ids])).rows;
    return state;
  };
  async function noticeFor(actor){
    const rows=(await admin.query("SELECT * FROM notifications WHERE merchant_id=$1 AND type='operational_payment_conflict' AND variables->>'order_id'=$2",[actor.id,actor.order])).rows;
    assert.equal(rows.length,1);return rows[0];
  }
  function expectedVariables(actor){return {order_id:actor.order,conversation_id:actor.conversation,provider:'superqi',action_url:'/dashboard/conversations?conversation='+encodeURIComponent(actor.conversation)};}
  const {default:app}=await import('../src/app.ts');
  ({stopPostgresSupportRuntimeCutoverForTests:stopSupport}=await import('../src/services/postgresSupportRuntimeCutover.ts'));await stopSupport();
  server=await new Promise((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});
  const origin='http://127.0.0.1:'+server.address().port;
  async function req(path,actor,method='GET'){
    const r=await fetch(origin+path,{method,headers:{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device}});
    return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
  }
  async function checkList(actor,row){
    const r=await req('/api/auth/notifications?limit=50',actor);assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.body.ok,true);
    assert.ok(r.body.notifications.every(isMerchantNotificationRecord));
    const actual=r.body.notifications.find(n=>n.id===row.id);
    assert.deepEqual(actual,{id:row.id,type:'operational_payment_conflict',...expectedVariables(actor),created_at:new Date(row.created_at).toISOString(),...(row.read_at?{read_at:new Date(row.read_at).toISOString()}:{})});
    assert.equal(isSafeMerchantNotificationActionUrl(actual.action_url),true);
    const peer=actor.id===a.id?b:a;
    assert.ok(r.body.notifications.every(n=>n.order_id!==peer.order));
    return actual;
  }
  await t.test('caller rejects unverified foreign-order amount and unsafe metadata before any domain write',async()=>{
    const cases=[
      [evidence(a,{authenticityVerified:false}),'ORDER_PAYMENT_PROVIDER_AUTHENTICITY_REQUIRED'],
      [evidence(a,{orderId:b.order}),'ORDER_NOT_FOUND'],
      [evidence(a,{amountIqd:74999}),'ORDER_PAYMENT_PROVIDER_AMOUNT_MISMATCH'],
      [evidence(a,{sanitizedMetadata:{access_token:'synthetic'}}),'ORDER_PAYMENT_PROVIDER_METADATA_UNSAFE'],
    ];
    for(const [input,code] of cases){const before=await snapshot();await assert.rejects(()=>record(input),e=>e.code===code);assert.deepEqual(await snapshot(),before);}
  });
  await t.test('actual payment conflict caller writes exact own fields and preserves the peer for both merchants',async()=>{
    for(const actor of actors){
      const peer=actor===a?b:a,before=await snapshot([peer.id]);
      const result=await record(evidence(actor));assert.equal(result.action,'payment_conflict');assert.equal(result.deduplicated,false);
      assert.equal(result.order.payment_status,'paid');assert.equal(result.order.payment_confirmation_source,'merchant_confirmed');assert.equal(result.order.payment_reconciliation_status,'reconciliation_required');
      const row=await noticeFor(actor);assert.equal(row.audience,'merchant');assert.equal(row.account_id,actor.id);assert.equal(row.source_entity_id,'superqi:'+event);assert.deepEqual(row.variables,expectedVariables(actor));
      await checkList(actor,row);assert.deepEqual(await snapshot([peer.id]),before);
    }
    assert.notEqual((await noticeFor(a)).id,(await noticeFor(b)).id);
  });
  await t.test('generated notices deny foreign reads and retain exact fields and SQL on caller/read replay',async()=>{
    for(const actor of actors){
      const peer=actor===a?b:a,row=await noticeFor(actor),path='/api/auth/notifications/'+row.id+'/read';
      const before=await snapshot();const denied=await req(path,peer,'PATCH');assert.equal(denied.status,404);assert.equal(denied.body.notification,undefined);assert.deepEqual(await snapshot(),before);
      const own=await req(path,actor,'PATCH');assert.equal(own.status,200);assert.equal(own.cache,'no-store');assert.equal(isMerchantNotificationRecord(own.body.notification),true);
      const stored=await noticeFor(actor);assert.deepEqual(own.body.notification,await checkList(actor,stored));
      const stable=await snapshot(),result=await record(evidence(actor));assert.equal(result.deduplicated,true);assert.equal(result.action,'payment_conflict');assert.deepEqual(await snapshot(),stable);
      const replay=await req(path,actor,'PATCH');assert.equal(replay.status,200);assert.deepEqual(replay.body,own.body);assert.deepEqual(await snapshot(),stable);
    }
  });
  await t.test('post-commit notice failure preserves payment evidence and exact replay repairs only the notice',async()=>{
    const actor={...a,...await seedPaidOrder(a,'fault')},peer=await snapshot([b.id]),faultEvent='fault-notice-event-'+suffix;
    const input=evidence(actor,{providerEventId:faultEvent,payloadSha256:createHash('sha256').update(faultEvent).digest('hex')});
    await admin.query(`CREATE FUNCTION ${faultFunction}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.merchant_id=TG_ARGV[0] AND NEW.variables->>'order_id'=TG_ARGV[1] THEN RAISE EXCEPTION 'SYNTHETIC_NOTIFICATION_WRITE_FAILURE'; END IF; RETURN NEW; END $$`);
    await admin.query(`CREATE TRIGGER ${faultTrigger} BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION ${faultFunction}('${actor.id}','${actor.order}')`);
    await assert.rejects(()=>record(input),e=>e.message.includes('SYNTHETIC_NOTIFICATION_WRITE_FAILURE'));
    const paymentBefore=(await admin.query('SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1',[actor.order])).rows;
    assert.equal(paymentBefore[0].row.payment_status,'paid');assert.equal(paymentBefore[0].row.payment_reconciliation_status,'reconciliation_required');
    const eventsBefore=(await admin.query('SELECT to_jsonb(e) AS row FROM order_payment_provider_events e WHERE merchant_id=$1 AND provider_event_id=$2',[actor.id,faultEvent])).rows;
    assert.equal(eventsBefore.length,1);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM notifications WHERE merchant_id=$1 AND variables->>'order_id'=$2",[actor.id,actor.order])).rows[0].n,0);
    assert.deepEqual(await snapshot([b.id]),peer);await removeFault();
    const result=await record(input);assert.equal(result.deduplicated,true);assert.equal(result.action,'payment_conflict');
    const row=await noticeFor(actor);assert.deepEqual(row.variables,expectedVariables(actor));await checkList(actor,row);
    assert.deepEqual((await admin.query('SELECT to_jsonb(o) AS row FROM orders o WHERE id=$1',[actor.order])).rows,paymentBefore);
    assert.deepEqual((await admin.query('SELECT to_jsonb(e) AS row FROM order_payment_provider_events e WHERE merchant_id=$1 AND provider_event_id=$2',[actor.id,faultEvent])).rows,eventsBefore);
    const stable=await snapshot();assert.equal((await record(input)).deduplicated,true);assert.deepEqual(await snapshot(),stable);assert.deepEqual(await snapshot([b.id]),peer);
    assert.deepEqual(fs.readdirSync(process.env.FAWRI_DATA_DIR).filter(n=>n.endsWith('.json')),[]);
  });
  console.log('P0_PAYMENT_CONFLICT_NOTIFICATION_CALLER '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',actualPaymentConflictCaller:true,actualApp:true,actualFrontendValidator:true,merchants:2,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,seededPaidState:true,merchantConfirmationAcceptedHere:false,cryptographicProviderIngressAcceptedHere:false,negativeCallerCases:4,postCommitNoticeFailureReplay:true,peerPreserved:true,providerSending:false,fullFieldCellAccepted:false,hostedAccepted:false}));
});
