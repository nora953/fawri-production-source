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

  console.log('P0_OPERATIONAL_NOTIFICATION_FIELD_RUNTIME '+JSON.stringify({fieldCell:'RESIDUAL-FIELD-002',actualProducers:4,actualApp:true,actualFrontendValidator:true,merchants:2,sqlRows:20,optionalOmittedAndBlank:true,optionalFallbackCases:2,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,exactFields:true,peerPreserved:true,replay:true,providerSending:false,upstreamCallerOwnershipAccepted:false,remainingTemplatesAccepted:false,hostedAccepted:false}));
});
