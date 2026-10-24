import assert from 'node:assert/strict';
import {randomInt, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env, {
  NODE_ENV:'test', LOG_LEVEL:'silent', FAWRI_DISABLE_JOB_WORKERS:'1',
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required', FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
  FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',
  FAWRI_AUTH_SECURITY_SECRET:'synthetic-bulk-notification-secret-over-32-characters',
  FAWRI_PASSWORD_SALT:'synthetic-bulk-notification-salt-over-32-characters',
});

test('operational SQL producers round trip through actual app and frontend validator', {timeout:120000}, async t => {
  const runtime=await createDisposableKnowledgeRuntime(), admin=runtime.admin;
  const actors=[], ids=[], merchants=[], admins=[];
  let server, stopSupport;
  t.after(()=>cleanupResources([
    ['support lifecycle',()=>stopSupport?.()],
    ['HTTP',async()=>{if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}}],
    ['notifications',()=>admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[]) OR account_id=ANY($2::text[])',[merchants,admins])],
    ['directory audits',()=>admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])',[admins])],
    ['devices',()=>admin.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])',[admins])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['runtime',()=>runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const security=await import('../src/services/postgresAdminSecurityAuthority.ts');
  const {ADMIN_SESSION_COOKIE,MERCHANT_SESSION_COOKIE}=await import('../src/middleware/authSession.ts');
  async function actor(kind,role,permissions=[]){
    const id=`Bulk-${kind}-${randomUUID()}`;ids.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,'synthetic','active',true)",[id,kind,`+198${randomInt(100000000,999999999)}`]);
    if(kind==='admin'){
      admins.push(id);await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic',$2,true,false)",[id,role]);
      for(const permission of permissions)await admin.query('INSERT INTO admin_permissions(admin_id,permission) VALUES($1,$2)',[id,permission]);
    }else{
      merchants.push(id);await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
    }
    const value={id,kind,role,permissions,device:`bulk-device-${randomUUID()}`};actors.push(value);return value;
  }
  const owner=await actor('admin','owner_admin');
  const assistant=await actor('admin','assistant_admin',['manage_support']);
  const a=await actor('merchant'),b=await actor('merchant');
  for(const actor of actors){
    if(actor.kind==='admin'){
      const device=await security.registerAdminDeviceAuthoritative({accountId:actor.id,accountKind:'admin',deviceId:actor.device,deviceLabel:'Synthetic'});
      await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
    }
    actor.session=await auth.issueSession({accountId:actor.id,accountKind:actor.kind,tenantId:actor.kind==='admin'?'fawri-admin':actor.id,adminRole:actor.role,permissions:actor.permissions,deviceId:actor.device});
    actor.cookie=`${actor.kind==='admin'?ADMIN_SESSION_COOKIE:MERCHANT_SESSION_COOKIE}=${actor.session.token}`;
  }

  const producer=await import('../src/services/postgresOperationalNotificationAuthority.ts');
  // Type-only frontend imports are erased by tsx; execute the actual validator.
  const {isMerchantNotificationRecord,isSafeMerchantNotificationActionUrl}=await import('../../fawri/src/lib/merchantNotificationsAuthority.ts');
  const createdAt='2026-10-25T00:00:00.000Z';
  const order='Order /?&=#\\\\ mixed',conversation='Conversation /?&=#\\\\ mixed',training='Training /?&=#\\\\ mixed';
  const cases=[
    {type:'operational_new_order',fn:producer.notifyMerchantNewOrderPostgres,input:{orderId:order,conversationId:conversation},variables:{order_id:order,conversation_id:conversation,action_url:'/dashboard/orders?order='+encodeURIComponent(order)}},
    {type:'operational_payment_conflict',fn:producer.notifyMerchantPaymentConflictPostgres,input:{orderId:order,conversationId:conversation,provider:'synthetic-provider',sourceEventId:'same-event'},variables:{order_id:order,conversation_id:conversation,provider:'synthetic-provider',action_url:'/dashboard/conversations?conversation='+encodeURIComponent(conversation)}},
    {type:'operational_knowledge_gap',fn:producer.notifyMerchantKnowledgeGapPostgres,input:{trainingRequestId:training,conversationId:conversation},variables:{training_request_id:training,conversation_id:conversation,action_url:'/dashboard/conversations?conversation='+encodeURIComponent(conversation)}},
    {type:'operational_customer_message',fn:producer.notifyMerchantNewCustomerMessagePostgres,input:{conversationId:conversation,sourceEventId:'same-event'},variables:{conversation_id:conversation,action_url:'/dashboard/conversations?conversation='+encodeURIComponent(conversation)}},
  ];
  const produced=new Map();
  const snapshot=async(actorIds=merchants)=>(await admin.query('SELECT to_jsonb(n) AS row FROM notifications n WHERE merchant_id=ANY($1::text[]) ORDER BY id',[actorIds])).rows;
  await t.test('four real SQL producers write exact literal fields and tenant-derived identities',async()=>{
    for(const actor of [a,b]){
      const values=[];
      for(const entry of cases){
        const result=await entry.fn({...entry.input,merchantId:actor.id,createdAt});
        assert.equal(result.deduplicated,false);
        const row=(await admin.query('SELECT * FROM notifications WHERE id=$1',[result.notification_id])).rows[0];
        assert.equal(row.audience,'merchant');assert.equal(row.merchant_id,actor.id);assert.equal(row.account_id,actor.id);
        assert.equal(row.type,entry.type);assert.deepEqual(row.variables,entry.variables);
        assert.equal(new Date(row.created_at).toISOString(),createdAt);assert.equal(row.read_at,null);
        values.push({entry,id:row.id});
      }
      produced.set(actor.id,values);
    }
    assert.equal((await snapshot()).length,8);
    assert.equal(new Set([...produced.values()].flat().map(n=>n.id)).size,8);
  });
  const {default:app}=await import('../src/app.ts');
  ({stopPostgresSupportRuntimeCutoverForTests:stopSupport}=await import('../src/services/postgresSupportRuntimeCutover.ts'));await stopSupport();
  server=await new Promise((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function req(path,actor,method='GET',headers={}){
    const r=await fetch(origin+path,{method,headers:{...(actor?{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device}:{}),...headers}});
    return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
  }
  function assertRecord(record,expected,read=false){
    assert.equal(isMerchantNotificationRecord(record),true);
    assert.equal(isSafeMerchantNotificationActionUrl(record.action_url),true);
    assert.deepEqual(record,{id:expected.id,type:expected.entry.type,...expected.entry.variables,created_at:createdAt,...(read?{read_at:record.read_at}:{})});
    if(read)assert.ok(Number.isFinite(Date.parse(record.read_at)));
  }
  await t.test('actual app lists only own produced rows with exact frontend-valid fields and encoded URLs',async()=>{
    const before=await snapshot();
    for(const actor of [a,b]){
      const peer=actor===a?b:a;
      const r=await req('/api/auth/notifications?limit=50&merchant_id='+peer.id,actor);
      assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.body.ok,true);assert.equal(r.body.notifications.length,4);
      const expected=produced.get(actor.id);
      assert.deepEqual(r.body.notifications.map(n=>n.id).sort(),expected.map(n=>n.id).sort());
      for(const n of r.body.notifications)assertRecord(n,expected.find(e=>e.id===n.id));
    }
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('foreign produced IDs and invalid sessions cannot read-mutate any row',async()=>{
    const before=await snapshot();
    for(const expected of produced.get(b.id)){
      const r=await req('/api/auth/notifications/'+expected.id+'/read',a,'PATCH');
      assert.equal(r.status,404);assert.equal(r.body.notification,undefined);assert.deepEqual(await snapshot(),before);
    }
    for(const [actor,headers] of [[undefined,{}],[owner,{}],[a,{'X-Fawri-Device-Id':'wrong'}]]){
      for(const [path,method] of [['/api/auth/notifications','GET'],['/api/auth/notifications/'+produced.get(a.id)[0].id+'/read','PATCH']]){
        const r=await req(path,actor,method,headers);assert.equal(r.status,401);
        assert.equal(r.body.notifications,undefined);assert.equal(r.body.notification,undefined);assert.deepEqual(await snapshot(),before);
      }
    }
  });
  await t.test('single read and replay retain real producer fields and preserve peer SQL exactly',async()=>{
    const peer=await snapshot([b.id]);
    for(const expected of produced.get(a.id)){
      const path='/api/auth/notifications/'+expected.id+'/read';
      const first=await req(path,a,'PATCH');assert.equal(first.status,200);assert.equal(first.cache,'no-store');assertRecord(first.body.notification,expected,true);
      const before=await snapshot();const again=await req(path,a,'PATCH');assert.equal(again.status,200);assert.deepEqual(again.body,first.body);assert.deepEqual(await snapshot(),before);
      assert.deepEqual(await snapshot([b.id]),peer);
    }
    const own=await req('/api/auth/notifications?unread=1',a);assert.equal(own.status,200);assert.deepEqual(own.body.notifications,[]);
    assert.equal((await req('/api/auth/notifications?unread=1',b)).body.notifications.length,4);
  });
  await t.test('producer replay deduplicates across tenants without rewriting read times or original variables',async()=>{
    const before=await snapshot();
    for(const actor of [a,b])for(const expected of produced.get(actor.id)){
      const result=await expected.entry.fn({...expected.entry.input,merchantId:actor.id,createdAt:'2026-10-26T00:00:00Z'});
      assert.deepEqual(result,{notification_id:expected.id,deduplicated:true});
    }
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual(fs.readdirSync(process.env.FAWRI_DATA_DIR).filter(n=>n.endsWith('.json')),[]);
  });
  console.log('P0_OPERATIONAL_NOTIFICATION_FIELD_RUNTIME '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',actualProducers:4,actualApp:true,actualFrontendValidator:true,merchants:2,sqlRows:8,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,exactFields:true,peerPreserved:true,replay:true,providerSending:false,upstreamCallerOwnershipAccepted:false,remainingTemplatesAccepted:false,hostedAccepted:false}));
});
