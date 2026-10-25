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
    ['support tickets',()=>admin.query('DELETE FROM support_tickets WHERE merchant_id=ANY($1::text[])',[merchants])],
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
  const inspector=await actor('admin','assistant_admin',['manage_support','inspect_merchant_sessions']);
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

  for(const mode of ['omitted','blank']){
    await t.test(mode+' optional fields keep fallback URLs and sequential tenant replay intact',async()=>{
      const suffix=mode+' /?&=# mixed',orderId='Fallback-Order-'+suffix,trainingRequestId='Fallback-Training-'+suffix;
      const optional=mode==='blank'?{conversationId:'   ',provider:'   ',sourceEventId:'   '}:{};
      const variants=[
        {type:'operational_new_order',fn:producer.notifyMerchantNewOrderPostgres,input:{orderId,...optional},variables:{order_id:orderId,action_url:'/dashboard/orders?order='+encodeURIComponent(orderId)}},
        // sourceEventId is required by the TypeScript contract: empty exercises
        // the producer's existing order-id fallback; it is not an HTTP input.
        {type:'operational_payment_conflict',fn:producer.notifyMerchantPaymentConflictPostgres,input:{orderId,sourceEventId:'',...optional},variables:{order_id:orderId,action_url:'/dashboard/orders?order='+encodeURIComponent(orderId)}},
        {type:'operational_knowledge_gap',fn:producer.notifyMerchantKnowledgeGapPostgres,input:{trainingRequestId,...optional},variables:{training_request_id:trainingRequestId,action_url:'/dashboard/conversations'}},
      ];
      const tenantIds=[];
      for(const actor of [a,b]){
        const peer=actor===a?b:a,peerBefore=await snapshot([peer.id]);
        for(const entry of variants){
          const started=Date.now();
          // createdAt is omitted too: retain the actual service clock.
          const first=await entry.fn({...entry.input,merchantId:actor.id});
          assert.equal(first.deduplicated,false);tenantIds.push(first.notification_id);
          const row=(await admin.query('SELECT * FROM notifications WHERE id=$1',[first.notification_id])).rows[0];
          assert.equal(row.merchant_id,actor.id);assert.equal(row.account_id,actor.id);assert.equal(row.audience,'merchant');assert.equal(row.type,entry.type);
          assert.deepEqual(row.variables,entry.variables);assert.equal(row.source_entity_id,entry.type==='operational_knowledge_gap'?trainingRequestId:orderId);assert.equal(row.read_at,null);
          const actualTime=new Date(row.created_at).toISOString();
          assert.ok(Date.parse(actualTime)>=started&&Date.parse(actualTime)<=Date.now());
          const listing=await req('/api/auth/notifications?limit=50',actor);
          assert.equal(listing.status,200);assert.equal(listing.cache,'no-store');
          assert.ok(listing.body.notifications.every(isMerchantNotificationRecord));
          const notice=listing.body.notifications.find(n=>n.id===row.id);
          const expected={id:row.id,type:entry.type,...entry.variables,created_at:actualTime};
          assert.deepEqual(notice,expected);assert.equal(isSafeMerchantNotificationActionUrl(notice.action_url),true);
          assert.equal(Object.hasOwn(notice,'conversation_id'),false);assert.equal(Object.hasOwn(notice,'provider'),false);
          const deniedBefore=await snapshot();
          const denied=await req('/api/auth/notifications/'+row.id+'/read',peer,'PATCH');
          assert.equal(denied.status,404);assert.equal(denied.body.notification,undefined);assert.deepEqual(await snapshot(),deniedBefore);
          const path='/api/auth/notifications/'+row.id+'/read';
          const read=await req(path,actor,'PATCH');assert.equal(read.status,200);assert.equal(isMerchantNotificationRecord(read.body.notification),true);
          assert.deepEqual(read.body.notification,{...expected,read_at:read.body.notification.read_at});assert.ok(Number.isFinite(Date.parse(read.body.notification.read_at)));
          const stable=await snapshot();
          assert.deepEqual(await entry.fn({...entry.input,merchantId:actor.id,createdAt:'2026-10-26T00:00:00Z'}),{notification_id:row.id,deduplicated:true});
          const reread=await req(path,actor,'PATCH');assert.equal(reread.status,200);assert.deepEqual(reread.body,read.body);assert.deepEqual(await snapshot(),stable);
          assert.deepEqual(await snapshot([peer.id]),peerBefore);
        }
      }
      assert.equal(new Set(tenantIds).size,6);
    });
  }


  // These templates are produced by the authenticated list's real refresher,
  // not by calling the notification insert helper or seeding notification rows.
  const subscriptionTypes=new Set(['subscription_expiry_reminder','subscription_expired','addon_expiry_reminder']);
  const subscriptionClock=Date.now(),day=86400000,expiry=new Date(subscriptionClock+3*day).toISOString(),batchExpiry=new Date(subscriptionClock+5*day).toISOString();
  const subscriptionRows=async(actorIds=merchants)=>{
    const value={};for(const table of ['subscriptions','subscription_reply_batches','notifications'])value[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY id`,[actorIds])).rows;
    return value;
  };
  const subscriptionNotices=async actor=>(await admin.query('SELECT * FROM notifications WHERE merchant_id=$1 AND type=ANY($2::text[]) ORDER BY id',[actor.id,[...subscriptionTypes]])).rows;
  const mappedSubscription=row=>({id:row.id,type:row.type,...row.variables,created_at:new Date(row.created_at).toISOString(),...(row.read_at?{read_at:new Date(row.read_at).toISOString()}:{})});
  for(const actor of [a,b]){
    actor.subscriptionId='notice-sub-'+actor.id;actor.batchId='notice-batch-'+actor.id;
    await admin.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,billing_anchor_day,starts_at,expires_at,addon_replies_remaining) VALUES($1,$2,'silver','active',1,$3,$4,7)",[actor.subscriptionId,actor.id,new Date(subscriptionClock-30*day).toISOString(),expiry]);
    for(const [label,remaining,expiresAt] of [['eligible',7,batchExpiry],['empty',0,batchExpiry],['expired',7,new Date(subscriptionClock-day).toISOString()],['distant',7,new Date(subscriptionClock+20*day).toISOString()]]){
      await admin.query("INSERT INTO subscription_reply_batches(id,subscription_id,merchant_id,source,amount,remaining,purchased_at,expires_at) VALUES($1,$2,$3,'purchase',7,$4,$5,$6)",[label==='eligible'?actor.batchId:actor.batchId+'-'+label,actor.subscriptionId,actor.id,remaining,new Date(subscriptionClock-30*day).toISOString(),expiresAt]);
    }
  }
  await t.test('subscription refresher list fault rolls back notice and sent markers then real HTTP retry recovers',async()=>{
    const fn='notice_fault_'+randomUUID().replaceAll('-','');
    // Owned disposable trigger scoped to one tenant/type; no product SQL changes.
    await admin.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.merchant_id=TG_ARGV[0] AND NEW.type='addon_expiry_reminder' THEN RAISE EXCEPTION 'synthetic subscription notice fault'; END IF; RETURN NEW; END $$`);
    try{
      await admin.query(`CREATE TRIGGER ${fn} BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION ${fn}('${a.id}')`);
      const before=await subscriptionRows(),failed=await req('/api/auth/notifications?limit=50',a);
      assert.equal(failed.status,503);assert.equal(failed.body.code,'MERCHANT_NOTIFICATION_AUTHORITY_UNAVAILABLE');assert.equal(failed.body.notifications,undefined);
      assert.deepEqual(await subscriptionRows(),before);
    }finally{await admin.query(`DROP TRIGGER IF EXISTS ${fn} ON notifications`);await admin.query(`DROP FUNCTION ${fn}()`);}
    const peer=await subscriptionRows([b.id]),started=Date.now(),result=await req('/api/auth/notifications?limit=50',a);assert.equal(result.status,200);assert.equal(result.cache,'no-store');
    const rows=await subscriptionNotices(a);assert.equal(rows.length,2);
    for(const row of rows){assert.ok(new Date(row.created_at).getTime()>=started&&new Date(row.created_at).getTime()<=Date.now());assert.deepEqual(result.body.notifications.find(n=>n.id===row.id),mappedSubscription(row));assert.equal(isMerchantNotificationRecord(mappedSubscription(row)),true);}
    assert.deepEqual(await subscriptionRows([b.id]),peer);
  });
  await t.test('actual list refresher emits exact expiry and eligible-addon fields for two isolated merchants',async()=>{
    for(const actor of [a,b]){
      const peer=actor===a?b:a,peerBefore=await subscriptionRows([peer.id]);
      const result=await req('/api/auth/notifications?limit=50&merchant_id='+peer.id,actor);assert.equal(result.status,200);assert.equal(result.cache,'no-store');
      const rows=await subscriptionNotices(actor);assert.equal(rows.length,2);
      const expected={subscription_expiry_reminder:{plan_name:'silver',expires_at:expiry,days_remaining:3},addon_expiry_reminder:{addon_batch_id:actor.batchId,source:'purchase',remaining_replies:7,expires_at:batchExpiry,days_remaining:5}};
      for(const row of rows){
        assert.equal(row.merchant_id,actor.id);assert.equal(row.account_id,actor.id);assert.equal(row.audience,'merchant');assert.equal(row.read_at,null);
        assert.deepEqual(row.variables,expected[row.type]);assert.equal(row.source_entity_type,row.type==='addon_expiry_reminder'?'subscription_reply_batch':'subscription');assert.equal(row.source_entity_id,row.type==='addon_expiry_reminder'?actor.batchId:actor.subscriptionId);
        const notice=result.body.notifications.find(n=>n.id===row.id);assert.deepEqual(notice,mappedSubscription(row));assert.equal(isMerchantNotificationRecord(notice),true);
        assert.equal(result.body.notifications.some(n=>(n.addon_batch_id||'').startsWith(peer.batchId)),false);
      }
      const sub=(await admin.query('SELECT expiry_reminder_sent_at,expired_notification_sent_at FROM subscriptions WHERE id=$1',[actor.subscriptionId])).rows[0];assert.ok(sub.expiry_reminder_sent_at);assert.equal(sub.expired_notification_sent_at,null);
      const batches=(await admin.query('SELECT id,expiry_reminder_sent_at FROM subscription_reply_batches WHERE merchant_id=$1',[actor.id])).rows;
      for(const batch of batches)assert.equal(Boolean(batch.expiry_reminder_sent_at),batch.id===actor.batchId);
      const before=await subscriptionRows();assert.equal((await req('/api/auth/notifications?limit=50',actor)).status,200);assert.deepEqual(await subscriptionRows(),before);assert.deepEqual(await subscriptionRows([peer.id]),peerBefore);
    }
  });
  await t.test('actual expired-subscription list preserves balance fields and peer data with stable repeated refresh',async()=>{
    const expiredAt=new Date(subscriptionClock-day).toISOString();
    for(const actor of [a,b]){
      await admin.query('UPDATE subscriptions SET expires_at=$2 WHERE id=$1',[actor.subscriptionId,expiredAt]);
      const peer=actor===a?b:a,peerBefore=await subscriptionRows([peer.id]),started=Date.now();
      const result=await req('/api/auth/notifications?limit=50',actor);assert.equal(result.status,200);
      const rows=await subscriptionNotices(actor);assert.equal(rows.length,3);const row=rows.find(n=>n.type==='subscription_expired');assert.ok(row);
      assert.deepEqual(row.variables,{plan_name:'silver',expired_at:expiredAt,addon_replies_remaining:7});assert.equal(row.source_entity_type,'subscription');assert.equal(row.source_entity_id,actor.subscriptionId);assert.equal(row.account_id,actor.id);assert.equal(row.merchant_id,actor.id);assert.equal(row.audience,'merchant');
      assert.ok(new Date(row.created_at).getTime()>=started&&new Date(row.created_at).getTime()<=Date.now());const notice=result.body.notifications.find(n=>n.id===row.id);assert.deepEqual(notice,mappedSubscription(row));assert.equal(isMerchantNotificationRecord(notice),true);
      assert.ok((await admin.query('SELECT expired_notification_sent_at FROM subscriptions WHERE id=$1',[actor.subscriptionId])).rows[0].expired_notification_sent_at);
      const stable=await subscriptionRows();assert.equal((await req('/api/auth/notifications?limit=50',actor)).status,200);assert.deepEqual(await subscriptionRows(),stable);assert.deepEqual(await subscriptionRows([peer.id]),peerBefore);
    }
  });
  await t.test('subscription-produced notices deny peer reads and retain exact own fields on read replay',async()=>{
    for(const actor of [a,b])for(const row of await subscriptionNotices(actor)){
      const peer=actor===a?b:a,before=await subscriptionRows(),path='/api/auth/notifications/'+row.id+'/read';
      const denied=await req(path,peer,'PATCH');assert.equal(denied.status,404);assert.deepEqual(await subscriptionRows(),before);
      const peerBefore=await subscriptionRows([peer.id]),read=await req(path,actor,'PATCH');assert.equal(read.status,200);assert.equal(read.cache,'no-store');
      const stored=(await admin.query('SELECT * FROM notifications WHERE id=$1',[row.id])).rows[0];assert.ok(stored.read_at);assert.deepEqual(read.body,{ok:true,notification:mappedSubscription(stored)});assert.equal(isMerchantNotificationRecord(read.body.notification),true);
      const stable=await subscriptionRows(),replay=await req(path,actor,'PATCH');assert.deepEqual(replay.body,read.body);assert.deepEqual(await subscriptionRows(),stable);assert.deepEqual(await subscriptionRows([peer.id]),peerBefore);
    }
    console.log('P0_SUBSCRIPTION_NOTIFICATION_CALLER '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',actualListRefresher:true,sqlTemplates:3,newFunctionalCases:4,merchants:2,exactFields:true,excludedBatches:true,faultRollbackAndRetry:true,peerPreserved:true,readReplay:true,actualFrontendValidator:true,externalProvider:false,browserRendering:false,hostedAccepted:false,wholeFieldCellAccepted:false}));
  });


  async function supportReq(path,actor,method='GET',body){
    const r=await fetch(origin+path,{method,headers:{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};
  }
  const supportTypes=['inspection_session_request','support_reply_reminder'];
  async function supportState(actorIds=merchants){const result={};for(const table of ['support_tickets','support_messages','support_inspection_requests','notifications'])result[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY id`,[actorIds])).rows;return result;}
  const supportNotices=async actor=>(await admin.query('SELECT * FROM notifications WHERE merchant_id=$1 AND type=ANY($2::text[]) ORDER BY id',[actor.id,supportTypes])).rows;
  async function noticeFault(actor,type,run){
    const name='support_notice_fault_'+randomUUID().replaceAll('-','');
    await admin.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.merchant_id=TG_ARGV[0] AND NEW.type=TG_ARGV[1] THEN RAISE EXCEPTION 'synthetic support notice fault'; END IF; RETURN NEW; END $$`);
    try{await admin.query(`CREATE TRIGGER ${name} BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION ${name}('${actor.id}','${type}')`);await run();}
    finally{await admin.query(`DROP TRIGGER IF EXISTS ${name} ON notifications`);await admin.query(`DROP FUNCTION ${name}()`);}
  }
  for(const actor of [a,b]){
    actor.supportSubject='Synthetic subject /?&=# " private-value '+actor.id;
    const created=await supportReq('/api/auth/support/tickets',actor,'POST',{subject:actor.supportSubject,category:'technical',message:'Synthetic merchant request'});assert.equal(created.status,201);actor.ticketId=created.body.ticket.id;
    assert.equal((await supportReq('/api/auth/admin/support/tickets/'+actor.ticketId+'/claim',inspector,'POST',{})).status,200);
  }
  await t.test('actual inspection HTTP caller denies improper admins and rolls back request plus notice on injected failure',async()=>{
    const path='/api/auth/admin/support/tickets/'+a.ticketId+'/inspection-requests',body={reason:'Synthetic private inspection reason',mode:'independent_read_only'},before=await supportState();
    for(const actor of [owner,assistant]){const denied=await supportReq(path,actor,'POST',body);assert.equal(denied.status,403);assert.deepEqual(await supportState(),before);}
    await noticeFault(a,'inspection_session_request',async()=>{const failed=await supportReq(path,inspector,'POST',body);assert.equal(failed.status,500);assert.equal(failed.body.code,'SUPPORT_POSTGRES_FAILURE');assert.deepEqual(await supportState(),before);});
    for(const actor of [a,b]){
      const peer=actor===a?b:a,peerBefore=await supportState([peer.id]),path='/api/auth/admin/support/tickets/'+actor.ticketId+'/inspection-requests';
      const result=await supportReq(path,inspector,'POST',body);assert.equal(result.status,201);
      const requests=(await admin.query('SELECT * FROM support_inspection_requests WHERE merchant_id=$1',[actor.id])).rows;assert.equal(requests.length,1);actor.inspection=requests[0];
      const rows=await supportNotices(actor);assert.equal(rows.length,1);const row=rows[0];actor.inspectionNotice=row.id;
      assert.equal(row.account_id,actor.id);assert.equal(row.audience,'merchant');assert.equal(row.source_entity_type,'support_inspection_request');assert.equal(row.source_entity_id,actor.inspection.id);
      assert.deepEqual(row.variables,{ticket_id:actor.ticketId,inspection_request_id:actor.inspection.id,ticket_subject:actor.supportSubject,admin_name:'Synthetic',mode:'independent_read_only',request_expires_at:new Date(actor.inspection.request_expires_at).toISOString(),action_url:'/dashboard/support?ticket='+encodeURIComponent(actor.ticketId)});
      assert.equal(new Date(row.created_at).toISOString(),new Date(actor.inspection.requested_at).toISOString());
      assert.deepEqual(await supportState([peer.id]),peerBefore);const stable=await supportState();assert.equal((await supportReq(path,inspector,'POST',body)).status,409);assert.deepEqual(await supportState(),stable);
    }
  });
  function mappedSupport(row,request){return {id:row.id,type:row.type,...row.variables,...(request?{request_status:request.status,...(request.consent_decision?{consent_decision:request.consent_decision}:{}),...(request.responded_at?{responded_at:new Date(request.responded_at).toISOString()}:{}),...(request.approved_at?{session_expires_at:new Date(new Date(request.approved_at).getTime()+request.session_duration_minutes*60000).toISOString()}:{}),...(request.ended_at?{ended_at:new Date(request.ended_at).toISOString()}:{}),...(request.end_reason?{end_reason:request.end_reason}:{})}:{}),created_at:new Date(row.created_at).toISOString(),...(row.read_at?{read_at:new Date(row.read_at).toISOString()}:{})};}
  await t.test('actual app lists frontend-valid pending inspection records from canonical request state only',async()=>{
    for(const actor of [a,b]){
      const before=await supportState(),result=await req('/api/auth/notifications?limit=50',actor);assert.equal(result.status,200);assert.equal(result.cache,'no-store');
      const row=(await supportNotices(actor)).find(n=>n.id===actor.inspectionNotice),notice=result.body.notifications.find(n=>n.id===row.id);
      assert.deepEqual(notice,mappedSupport(row,actor.inspection));assert.equal(isMerchantNotificationRecord(notice),true);assert.equal(isSafeMerchantNotificationActionUrl(notice.action_url),true);assert.doesNotMatch(JSON.stringify(notice),/Synthetic private inspection reason/);assert.deepEqual(await supportState(),before);
    }
  });
  await t.test('actual admin lifecycle list emits exact reminder fields and atomically rolls back marker on notice failure',async()=>{
    for(const actor of [a,b])assert.equal((await supportReq('/api/auth/admin/support/tickets/'+actor.ticketId+'/messages',inspector,'POST',{message:'Synthetic reply for merchant'})).status,201);
    await admin.query("UPDATE support_tickets SET waiting_since=now()-interval '25 hours' WHERE id=$1",[a.ticketId]);
    const before=await supportState();
    await noticeFault(a,'support_reply_reminder',async()=>{const failed=await supportReq('/api/auth/admin/support/tickets',owner);assert.equal(failed.status,500);assert.deepEqual(await supportState(),before);});
    for(const actor of [a,b]){
      if(actor===b)await admin.query("UPDATE support_tickets SET waiting_since=now()-interval '25 hours' WHERE id=$1",[b.ticketId]);
      const peer=actor===a?b:a,peerBefore=await supportState([peer.id]),result=await supportReq('/api/auth/admin/support/tickets',owner);assert.equal(result.status,200);
      const rows=await supportNotices(actor);assert.equal(rows.length,2);const row=rows.find(n=>n.type==='support_reply_reminder');actor.reminderNotice=row.id;
      assert.equal(row.merchant_id,actor.id);assert.equal(row.account_id,actor.id);assert.equal(row.source_entity_type,'support_ticket');assert.equal(row.source_entity_id,actor.ticketId);
      assert.deepEqual(row.variables,{ticket_id:actor.ticketId,ticket_subject:actor.supportSubject,action_url:'/dashboard/support?ticket='+encodeURIComponent(actor.ticketId)});
      const marker=(await admin.query('SELECT merchant_reminder_sent_at FROM support_tickets WHERE id=$1',[actor.ticketId])).rows[0].merchant_reminder_sent_at;assert.equal(new Date(row.created_at).toISOString(),new Date(marker).toISOString());
      const listing=await req('/api/auth/notifications?limit=50',actor);const notice=listing.body.notifications.find(n=>n.id===row.id);assert.deepEqual(notice,mappedSupport(row));assert.equal(isMerchantNotificationRecord(notice),true);assert.deepEqual(await supportState([peer.id]),peerBefore);
      const stable=await supportState();assert.equal((await supportReq('/api/auth/admin/support/tickets',owner)).status,200);assert.deepEqual(await supportState(),stable);
    }
  });
  await t.test('both Support notice types deny foreign read and preserve peer and exact own replay',async()=>{
    for(const actor of [a,b])for(const row of await supportNotices(actor)){
      const peer=actor===a?b:a,path='/api/auth/notifications/'+row.id+'/read',before=await supportState();
      assert.equal((await req(path,peer,'PATCH')).status,404);assert.deepEqual(await supportState(),before);
      const peerBefore=await supportState([peer.id]),result=await req(path,actor,'PATCH');assert.equal(result.status,200);
      const stored=(await admin.query('SELECT * FROM notifications WHERE id=$1',[row.id])).rows[0];assert.ok(stored.read_at);assert.deepEqual(result.body,{ok:true,notification:mappedSupport(stored,row.type==='inspection_session_request'?actor.inspection:undefined)});assert.equal(isMerchantNotificationRecord(result.body.notification),true);
      const stable=await supportState(),again=await req(path,actor,'PATCH');assert.deepEqual(again.body,result.body);assert.deepEqual(await supportState(),stable);assert.deepEqual(await supportState([peer.id]),peerBefore);
    }
  });
  await t.test('inspection list and read reflect actual merchant approval or rejection without stale pending status',async()=>{
    for(const [actor,decision] of [[a,'approve'],[b,'reject']]){
      const peer=actor===a?b:a,peerBefore=await supportState([peer.id]),path='/api/auth/support/tickets/'+actor.ticketId+'/inspection-requests/'+actor.inspection.id+'/decision';
      const before=await supportState();assert.equal((await supportReq(path,peer,'POST',{decision})).status,404);assert.deepEqual(await supportState(),before);
      assert.equal((await supportReq(path,actor,'POST',{decision})).status,200);const request=(await admin.query('SELECT * FROM support_inspection_requests WHERE id=$1',[actor.inspection.id])).rows[0];assert.equal(request.status,decision==='approve'?'approved':'rejected');
      const row=(await supportNotices(actor)).find(n=>n.id===actor.inspectionNotice),expected=mappedSupport(row,request),list=await req('/api/auth/notifications?limit=50',actor);assert.deepEqual(list.body.notifications.find(n=>n.id===row.id),expected);assert.equal(isMerchantNotificationRecord(expected),true);
      const read=await req('/api/auth/notifications/'+row.id+'/read',actor,'PATCH');assert.equal(read.status,200);assert.deepEqual(read.body.notification,expected);assert.deepEqual(await supportState([peer.id]),peerBefore);
    }
    console.log('P0_SUPPORT_NOTIFICATION_CALLER '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',newFunctionalCases:5,actualApp:true,actualFrontendValidator:true,canonicalInspectionHttp:true,canonicalLifecycleHttp:true,merchants:2,exactFields:true,peerPreserved:true,faultRollbackRetry:true,currentDecisionProjection:true,externalProvider:false,hostedAccepted:false,wholeCellAccepted:false}));
  });


  await t.test('inspection projection never borrows peer request state or trusts stored lifecycle keys',async()=>{
    const original=(await admin.query('SELECT * FROM notifications WHERE id=$1',[a.inspectionNotice])).rows[0];
    try{
      for(const mismatch of ['foreign-request','wrong-ticket']){
        const variables={...original.variables,request_status:'pending',consent_decision:'rejected',ended_at:'2020-01-01T00:00:00.000Z',...(mismatch==='foreign-request'?{inspection_request_id:b.inspection.id}:{ticket_id:b.ticketId})};
        await admin.query('UPDATE notifications SET variables=$2::jsonb,source_entity_id=$3 WHERE id=$1',[original.id,JSON.stringify(variables),mismatch==='foreign-request'?b.inspection.id:a.inspection.id]);
        const before=await supportState(),result=await req('/api/auth/notifications?limit=50',a);assert.equal(result.status,200);const notice=result.body.notifications.find(n=>n.id===original.id);
        for(const key of ['request_status','consent_decision','responded_at','session_expires_at','ended_at','end_reason'])assert.equal(Object.hasOwn(notice,key),false);
        assert.equal(isMerchantNotificationRecord(notice),false);assert.deepEqual(await supportState(),before);
      }
      await admin.query('UPDATE notifications SET variables=$2::jsonb,source_entity_id=$3 WHERE id=$1',[original.id,JSON.stringify({...original.variables,request_status:'pending',consent_decision:'rejected'}),original.source_entity_id]);
      const result=await req('/api/auth/notifications?limit=50',a),request=(await admin.query('SELECT * FROM support_inspection_requests WHERE id=$1',[a.inspection.id])).rows[0];
      const notice=result.body.notifications.find(n=>n.id===original.id);assert.equal(notice.request_status,'approved');assert.equal(notice.consent_decision,'approved');assert.equal(isMerchantNotificationRecord(notice),true);
      assert.equal(notice.session_expires_at,mappedSupport(original,request).session_expires_at);
    }finally{await admin.query('UPDATE notifications SET variables=$2::jsonb,source_entity_id=$3 WHERE id=$1',[original.id,JSON.stringify(original.variables),original.source_entity_id]);}
  });


  async function inspectionState(){return {...await supportState(),previews:(await admin.query('SELECT to_jsonb(p) AS row FROM support_preview_sessions p WHERE merchant_id=ANY($1::text[]) ORDER BY id',[merchants])).rows};}
  async function ownInspectionState(actor){return {...await supportState([actor.id]),previews:(await admin.query('SELECT to_jsonb(p) AS row FROM support_preview_sessions p WHERE merchant_id=$1 ORDER BY id',[actor.id])).rows};}
  async function assertCurrentInspection(actor,requestId){
    const request=(await admin.query('SELECT * FROM support_inspection_requests WHERE id=$1',[requestId])).rows[0],row=(await supportNotices(actor)).find(n=>n.source_entity_id===requestId);assert.ok(row);
    const before=await inspectionState(),list=await req('/api/auth/notifications?limit=50',actor);assert.equal(list.status,200);const expected=mappedSupport(row,request),notice=list.body.notifications.find(n=>n.id===row.id);assert.deepEqual(notice,expected);assert.equal(isMerchantNotificationRecord(notice),true);assert.deepEqual(await inspectionState(),before);
    const peer=actor===a?b:a;assert.equal((await req('/api/auth/notifications/'+row.id+'/read',peer,'PATCH')).status,404);assert.deepEqual(await inspectionState(),before);
    const read=await req('/api/auth/notifications/'+row.id+'/read',actor,'PATCH');assert.equal(read.status,200);const stored=(await admin.query('SELECT * FROM notifications WHERE id=$1',[row.id])).rows[0];assert.deepEqual(read.body,{ok:true,notification:mappedSupport(stored,request)});assert.equal(isMerchantNotificationRecord(read.body.notification),true);
    const stable=await inspectionState(),again=await req('/api/auth/notifications/'+row.id+'/read',actor,'PATCH');assert.deepEqual(again.body,read.body);assert.deepEqual(await inspectionState(),stable);
    return request;
  }
  async function createNextInspection(actor){
    const created=await supportReq('/api/auth/admin/support/tickets/'+actor.ticketId+'/inspection-requests',inspector,'POST',{reason:'Synthetic next lifecycle request',mode:'independent_read_only'});assert.equal(created.status,201);
    const rows=(await admin.query("SELECT * FROM support_inspection_requests WHERE merchant_id=$1 AND status='pending' ORDER BY requested_at DESC",[actor.id])).rows;assert.equal(rows.length,1);return rows[0];
  }
  await t.test('merchant termination ends actual preview and projects ended notice while preserving peer and refusing repeat',async()=>{
    const peerBefore=await ownInspectionState(b),started=await supportReq('/api/auth/admin/support-preview/start',inspector,'POST',{ticket_id:a.ticketId,request_id:a.inspection.id});assert.equal(started.status,201);const previewId=started.body.session.id;
    const path='/api/auth/support/tickets/'+a.ticketId+'/inspection-requests/'+a.inspection.id+'/terminate',before=await inspectionState();assert.equal((await supportReq(path,b,'POST',{})).status,404);assert.deepEqual(await inspectionState(),before);
    assert.equal((await supportReq(path,a,'POST',{})).status,200);const request=await assertCurrentInspection(a,a.inspection.id);assert.equal(request.status,'approved');assert.equal(request.consent_decision,'approved');assert.equal(request.end_reason,'merchant_terminated');assert.ok(request.ended_at);
    const preview=(await admin.query('SELECT * FROM support_preview_sessions WHERE id=$1',[previewId])).rows[0];assert.equal(preview.status,'ended');assert.equal(preview.end_reason,'merchant_terminated');assert.ok(preview.ended_at);
    const stable=await inspectionState();assert.equal((await supportReq(path,a,'POST',{})).status,409);assert.equal((await supportReq('/api/auth/admin/support-preview/'+previewId+'/snapshot',inspector)).status,409);assert.deepEqual(await inspectionState(),stable);assert.deepEqual(await ownInspectionState(b),peerBefore);
  });
  await t.test('actual admin lifecycle expires pending request and exposes current expired notice with stable replay',async()=>{
    const peerBefore=await ownInspectionState(a),request=await createNextInspection(b);
    // Age only owned fixture rows. The real lifecycle and HTTP clock run normally.
    await admin.query("UPDATE support_inspection_requests SET requested_at=now()-interval '11 minutes',request_expires_at=now()-interval '1 minute' WHERE id=$1",[request.id]);
    assert.equal((await supportReq('/api/auth/admin/support/tickets',owner)).status,200);const expired=await assertCurrentInspection(b,request.id);assert.equal(expired.status,'expired');assert.equal(expired.consent_decision,null);assert.equal(expired.end_reason,'request_timeout');assert.ok(expired.expired_at);assert.ok(expired.ended_at);
    const stable=await inspectionState();assert.equal((await supportReq('/api/auth/support/tickets/'+b.ticketId+'/inspection-requests/'+request.id+'/decision',b,'POST',{decision:'approve'})).status,409);assert.equal((await supportReq('/api/auth/admin/support/tickets',owner)).status,200);assert.deepEqual(await inspectionState(),stable);assert.deepEqual(await ownInspectionState(a),peerBefore);
  });
  await t.test('actual lifecycle closes approved window and preview while retaining authoritative approved consent fields',async()=>{
    const peerBefore=await ownInspectionState(a),request=await createNextInspection(b);
    assert.equal((await supportReq('/api/auth/support/tickets/'+b.ticketId+'/inspection-requests/'+request.id+'/decision',b,'POST',{decision:'approve'})).status,200);
    const started=await supportReq('/api/auth/admin/support-preview/start',inspector,'POST',{ticket_id:b.ticketId,request_id:request.id});assert.equal(started.status,201);const previewId=started.body.session.id;
    await admin.query("UPDATE support_inspection_requests SET approved_at=now()-interval '31 minutes',responded_at=now()-interval '31 minutes' WHERE id=$1",[request.id]);
    await admin.query("UPDATE support_preview_sessions SET started_at=now()-interval '31 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[previewId]);
    assert.equal((await supportReq('/api/auth/admin/support/tickets',owner)).status,200);const ended=await assertCurrentInspection(b,request.id);assert.equal(ended.status,'approved');assert.equal(ended.consent_decision,'approved');assert.equal(ended.end_reason,'approval_window_expired');assert.ok(ended.ended_at);
    const preview=(await admin.query('SELECT * FROM support_preview_sessions WHERE id=$1',[previewId])).rows[0];assert.equal(preview.status,'ended');assert.equal(preview.end_reason,'approval_window_expired');assert.ok(preview.ended_at);
    const stable=await inspectionState();assert.equal((await supportReq('/api/auth/admin/support-preview/'+previewId+'/snapshot',inspector)).status,409);assert.equal((await supportReq('/api/auth/admin/support/tickets',owner)).status,200);assert.deepEqual(await inspectionState(),stable);assert.deepEqual(await ownInspectionState(a),peerBefore);
    console.log('P0_SUPPORT_NOTIFICATION_ENDING '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',newFunctionalCases:3,merchantTermination:true,pendingExpiry:true,approvedWindowExpiry:true,actualPreviewCreation:true,endedPreviewDenied:true,actualHttpLifecycle:true,actualFrontendValidator:true,peerPreserved:true,readReplay:true,fixtureTimestampAging:true,timerCadenceAccepted:false,browserAccepted:false,hostedAccepted:false,wholeCellAccepted:false}));
  });


  async function concurrentList(actor){
    const r=await fetch(origin+'/api/auth/notifications?limit=50',{headers:{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device},signal:AbortSignal.timeout(10000)});
    return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};
  }
  async function waitForRefreshLocks(minimum){
    const deadline=Date.now()+5000;let observed=0;
    while(Date.now()<deadline){
      const result=await admin.query("SELECT count(DISTINCT pid)::int AS n FROM pg_stat_activity WHERE usename=$1 AND state='active' AND wait_event_type='Lock' AND query LIKE '%FROM subscriptions%' AND query LIKE '%FOR UPDATE%'",[runtime.role]);
      observed=result.rows[0].n;if(observed>=minimum)return observed;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.fail('expected overlapping restricted refresher SQL sessions; observed '+observed+' of '+minimum);
  }
  async function withRefreshGate(actorIds,launch,minimum,whileBlocked){
    const gate=await admin.connect();let tasks=[],results,observed;
    try{
      await gate.query('BEGIN');await gate.query('SELECT id FROM subscriptions WHERE merchant_id=ANY($1::text[]) ORDER BY id FOR UPDATE',[actorIds]);
      // HTTP handlers and service SQL run unchanged. Only bootstrap holds the
      // owned rows until distinct restricted SQL backends prove real overlap.
      tasks=launch().map(promise=>promise.then(value=>({value}),error=>({error:String(error.message)})));
      observed=await waitForRefreshLocks(minimum);if(whileBlocked)await whileBlocked();
    }finally{
      try{await gate.query('ROLLBACK');}finally{gate.release();results=await Promise.all(tasks);}
    }
    for(const result of results)assert.equal(result.error,undefined);
    return {observed,responses:results.map(result=>result.value)};
  }
  const concurrencyExpiry=new Date(Date.now()+4*day).toISOString(),concurrencyBatchExpiry=new Date(Date.now()+6*day).toISOString();
  for(const actor of [a,b]){
    await admin.query('UPDATE subscriptions SET expires_at=$2,expiry_reminder_sent_at=NULL,expired_notification_sent_at=NULL WHERE id=$1',[actor.subscriptionId,concurrencyExpiry]);
    await admin.query('UPDATE subscription_reply_batches SET expires_at=$2,expiry_reminder_sent_at=NULL WHERE id=$1',[actor.batchId,concurrencyBatchExpiry]);
  }
  function assertConcurrentResponse(result,actor,rows){
    assert.equal(result.status,200);assert.equal(result.cache,'no-store');assert.ok(result.body.notifications.every(isMerchantNotificationRecord));
    for(const row of rows)assert.deepEqual(result.body.notifications.find(n=>n.id===row.id),mappedSubscription(row));
    const peer=actor===a?b:a;assert.equal(result.body.notifications.some(n=>(n.addon_batch_id||'')===peer.batchId),false);
  }
  function subscriptionBusinessState(snapshot){
    return {subscriptions:snapshot.subscriptions.map(({row})=>{const copy={...row};delete copy.expiry_reminder_sent_at;delete copy.expired_notification_sent_at;delete copy.updated_at;return copy;}),batches:snapshot.subscription_reply_batches.map(({row})=>{const copy={...row};delete copy.expiry_reminder_sent_at;return copy;})};
  }
  const matchingConcurrentReminders=async actor=>(await subscriptionNotices(actor)).filter(row=>(row.type==='subscription_expiry_reminder'&&row.variables.expires_at===concurrencyExpiry)||(row.type==='addon_expiry_reminder'&&row.variables.expires_at===concurrencyBatchExpiry));
  await t.test('overlapping authenticated list refreshes deduplicate subscription and addon while peer progresses independently',async()=>{
    runtime.runtimePool.options.max=8;
    const before=await subscriptionRows(),ownBefore=await subscriptionRows([a.id]);let peerResult;
    const cohort=await withRefreshGate([a.id],()=>Array.from({length:3},()=>concurrentList(a)),2,async()=>{
      peerResult=await concurrentList(b);assert.equal(peerResult.status,200);assert.deepEqual(await subscriptionRows([a.id]),ownBefore);
      assert.equal((await matchingConcurrentReminders(a)).length,0);assert.equal((await matchingConcurrentReminders(b)).length,2);
    });
    assert.ok(cohort.observed>=2);
    const allNew=[];
    for(const actor of [a,b]){
      const rows=await matchingConcurrentReminders(actor);assert.equal(rows.length,2);allNew.push(...rows);
      for(const row of rows){assert.equal(row.merchant_id,actor.id);assert.equal(row.account_id,actor.id);assert.equal(row.audience,'merchant');assert.equal(row.read_at,null);}
      assert.deepEqual(rows.find(row=>row.type==='subscription_expiry_reminder').variables,{plan_name:'silver',expires_at:concurrencyExpiry,days_remaining:4});
      assert.deepEqual(rows.find(row=>row.type==='addon_expiry_reminder').variables,{addon_batch_id:actor.batchId,source:'purchase',remaining_replies:7,expires_at:concurrencyBatchExpiry,days_remaining:6});
      const subscription=(await admin.query('SELECT * FROM subscriptions WHERE id=$1',[actor.subscriptionId])).rows[0],batch=(await admin.query('SELECT * FROM subscription_reply_batches WHERE id=$1',[actor.batchId])).rows[0];
      assert.equal(new Date(subscription.expiry_reminder_sent_at).toISOString(),new Date(rows.find(r=>r.type==='subscription_expiry_reminder').created_at).toISOString());assert.equal(new Date(batch.expiry_reminder_sent_at).toISOString(),new Date(rows.find(r=>r.type==='addon_expiry_reminder').created_at).toISOString());
      for(const response of actor===a?cohort.responses:[peerResult])assertConcurrentResponse(response,actor,rows);
    }
    assert.equal(new Set(allNew.map(row=>row.id)).size,4);const newIds=new Set(allNew.map(row=>row.id)),after=await subscriptionRows();assert.deepEqual(after.notifications.filter(row=>!newIds.has(row.row.id)),before.notifications);assert.deepEqual(subscriptionBusinessState(after),subscriptionBusinessState(before));
    const stable=await subscriptionRows();const replay=await withRefreshGate([a.id],()=>[concurrentList(a),concurrentList(a)],2,async()=>{assert.equal((await concurrentList(b)).status,200);});
    for(const result of replay.responses)assertConcurrentResponse(result,a,await matchingConcurrentReminders(a));assert.deepEqual(await subscriptionRows(),stable);
    console.log('P0_SUBSCRIPTION_REMINDER_OVERLAP '+JSON.stringify({restrictedSqlWaiters:cohort.observed,replayWaiters:replay.observed,peerCompletedWhileOwnLocked:true,newNotices:4,stableReplay:true}));
  });
  await t.test('six blocked real list requests across two tenants create one expired notice each with stable markers and replay',async()=>{
    const expiredAt=new Date(Date.now()-day).toISOString();
    for(const actor of [a,b])await admin.query('UPDATE subscriptions SET expires_at=$2,expired_notification_sent_at=NULL WHERE id=$1',[actor.subscriptionId,expiredAt]);
    const before=await subscriptionRows(),ordered=[a,a,a,b,b,b];
    const cohort=await withRefreshGate(merchants,()=>ordered.map(concurrentList),6);assert.equal(cohort.observed,6);const newIds=new Set();
    for(const actor of [a,b]){
      const rows=(await subscriptionNotices(actor)).filter(row=>row.type==='subscription_expired'&&row.variables.expired_at===expiredAt);assert.equal(rows.length,1);const row=rows[0];newIds.add(row.id);
      assert.equal(row.merchant_id,actor.id);assert.equal(row.account_id,actor.id);assert.equal(row.source_entity_id,actor.subscriptionId);assert.deepEqual(row.variables,{plan_name:'silver',expired_at:expiredAt,addon_replies_remaining:7});
      const marker=(await admin.query('SELECT expired_notification_sent_at FROM subscriptions WHERE id=$1',[actor.subscriptionId])).rows[0].expired_notification_sent_at;assert.equal(new Date(marker).toISOString(),new Date(row.created_at).toISOString());
      for(const [i,result] of cohort.responses.entries())if(ordered[i]===actor)assertConcurrentResponse(result,actor,rows);
    }
    assert.equal(newIds.size,2);const after=await subscriptionRows();assert.deepEqual(after.notifications.filter(row=>!newIds.has(row.row.id)),before.notifications);assert.deepEqual(subscriptionBusinessState(after),subscriptionBusinessState(before));
    const stable=await subscriptionRows(),replay=await Promise.all(ordered.map(concurrentList));for(const result of replay)assert.equal(result.status,200);assert.deepEqual(await subscriptionRows(),stable);
    console.log('P0_SUBSCRIPTION_EXPIRED_OVERLAP '+JSON.stringify({restrictedSqlWaiters:cohort.observed,merchants:2,httpRequests:6,newNotices:2,stableSentMarkers:true,stableReplay:true,actualApp:true,actualFrontendValidator:true,hostedAccepted:false,loadCapacityAccepted:false,wholeCellAccepted:false}));
  });


  await t.test('two assigned tickets cannot concurrently create multiple active inspection requests for one merchant',async()=>{
    const tickets=[];
    for(const label of ['one','two']){
      const created=await supportReq('/api/auth/support/tickets',a,'POST',{subject:'Synthetic concurrent inspection '+label,category:'technical',message:'Synthetic concurrent request'});assert.equal(created.status,201);tickets.push(created.body.ticket.id);
      assert.equal((await supportReq('/api/auth/admin/support/tickets/'+created.body.ticket.id+'/claim',inspector,'POST',{})).status,200);
    }
    const name='inspection_overlap_'+randomUUID().replaceAll('-',''),key=randomInt(1,2147483647),gate=await admin.connect();let tasks=[],responses=[],observed=[],peerResult,peerAfter;
    const create=async ticket=>{
      const response=await fetch(origin+'/api/auth/admin/support/tickets/'+ticket+'/inspection-requests',{method:'POST',headers:{Cookie:inspector.cookie,'X-Fawri-Device-Id':inspector.device,'Content-Type':'application/json'},body:JSON.stringify({reason:'Synthetic concurrent inspection',mode:'independent_read_only'}),signal:AbortSignal.timeout(10000)});
      return {ticket,status:response.status,body:await response.json()};
    };
    await admin.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.merchant_id=TG_ARGV[0] THEN PERFORM pg_advisory_xact_lock(TG_ARGV[1]::bigint); END IF; RETURN NEW; END $$`);
    try{
      await admin.query(`CREATE TRIGGER ${name} BEFORE INSERT ON support_inspection_requests FOR EACH ROW EXECUTE FUNCTION ${name}('${a.id}','${key}')`);
      await gate.query('SELECT pg_advisory_lock($1::bigint)',[key]);
      tasks=tickets.map(ticket=>create(ticket).then(value=>({value}),error=>({error:String(error.message)})));
      const deadline=Date.now()+5000;
      while(Date.now()<deadline){
        observed=(await admin.query("SELECT pid,CASE WHEN query LIKE '%INSERT INTO support_inspection_requests%' THEN 'insert_gate' ELSE 'merchant_serialization' END AS stage FROM pg_stat_activity WHERE usename=$1 AND state='active' AND wait_event_type='Lock' AND (query LIKE '%INSERT INTO support_inspection_requests%' OR (query LIKE '%FROM merchants%' AND query LIKE '%FOR UPDATE%'))",[runtime.authRole])).rows;
        if(observed.length>=2)break;await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.equal(observed.length,2,'both actual authenticated transactions must overlap in SQL');
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM support_inspection_requests WHERE ticket_id=ANY($1::text[])',[tickets])).rows[0].n,0);
      peerResult=await create(b.ticketId);assert.equal(peerResult.status,201);peerAfter=await ownInspectionState(b);
    }finally{
      try{await gate.query('SELECT pg_advisory_unlock($1::bigint)',[key]);}finally{gate.release();responses=await Promise.all(tasks);await admin.query(`DROP TRIGGER IF EXISTS ${name} ON support_inspection_requests`);await admin.query(`DROP FUNCTION ${name}()`);}
    }
    for(const response of responses)assert.equal(response.error,undefined);const actual=responses.map(result=>result.value);
    const requests=(await admin.query('SELECT * FROM support_inspection_requests WHERE ticket_id=ANY($1::text[]) ORDER BY id',[tickets])).rows;
    const notices=(await admin.query("SELECT * FROM notifications WHERE merchant_id=$1 AND type='inspection_session_request' AND variables->>'ticket_id'=ANY($2::text[]) ORDER BY id",[a.id,tickets])).rows;
    console.log('P0_INSPECTION_CREATE_OVERLAP '+JSON.stringify({stages:observed.map(row=>row.stage),statuses:actual.map(row=>row.status),ownedRequests:requests.length,ownedNotices:notices.length,peerCompletedWhileOwnGated:peerResult?.status===201}));
    assert.deepEqual(actual.map(row=>row.status).sort(),[201,409]);assert.equal(requests.length,1);assert.equal(notices.length,1);
    const winner=actual.find(row=>row.status===201),loser=actual.find(row=>row.status===409);assert.equal(loser.body.code,'SUPPORT_INSPECTION_ALREADY_ACTIVE');assert.equal(requests[0].ticket_id,winner.ticket);assert.equal(requests[0].status,'pending');assert.equal(notices[0].source_entity_id,requests[0].id);
    await assertCurrentInspection(a,requests[0].id);assert.deepEqual(await ownInspectionState(b),peerAfter);
    const before=await inspectionState();assert.equal((await create(loser.ticket)).status,409);assert.deepEqual(await inspectionState(),before);
    assert.equal((await supportReq('/api/auth/support/tickets/'+winner.ticket+'/inspection-requests/'+requests[0].id+'/decision',a,'POST',{decision:'reject'})).status,200);
    const retryBefore=await inspectionState();
    await noticeFault(a,'inspection_session_request',async()=>{const failed=await create(loser.ticket);assert.equal(failed.status,500);assert.deepEqual(await inspectionState(),retryBefore);});
    assert.equal((await create(loser.ticket)).status,201);
    const current=(await admin.query("SELECT * FROM support_inspection_requests WHERE merchant_id=$1 AND status='pending' AND request_expires_at>now()",[a.id])).rows;assert.equal(current.length,1);assert.equal(current[0].ticket_id,loser.ticket);await assertCurrentInspection(a,current[0].id);assert.deepEqual(await ownInspectionState(b),peerAfter);
    console.log('P0_INSPECTION_CREATE_ACCEPTANCE '+JSON.stringify({actualApp:true,overlappingSqlTransactions:2,ownedTickets:2,oneActiveRequest:true,loser409:true,peerPreserved:true,releasedAfterRejection:true,noticeFaultRollbackRetry:true,actualFrontendValidator:true,hostedAccepted:false,wholeCellAccepted:false}));
  });

  console.log('P0_OPERATIONAL_NOTIFICATION_FIELD_RUNTIME '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',actualProducers:4,actualApp:true,actualFrontendValidator:true,merchants:2,sqlRows:20,optionalOmittedAndBlank:true,optionalFallbackCases:2,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,exactFields:true,peerPreserved:true,replay:true,providerSending:false,upstreamCallerOwnershipAccepted:false,remainingTemplatesAccepted:false,hostedAccepted:false}));
});
