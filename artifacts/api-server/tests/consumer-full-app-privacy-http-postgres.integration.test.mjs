import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import fs from 'node:fs';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env,{
  NODE_ENV:'test',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',FAWRI_DISABLE_JOB_WORKERS:'1',LOG_LEVEL:'silent',
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
  FAWRI_AUTH_SECURITY_SECRET:'synthetic-notification-http-secret-over-32-characters',
  FAWRI_PASSWORD_SALT:'synthetic-notification-http-salt-over-32-characters',
});

test('actual app isolates notification and conversation consumers across aliases and SQL sessions',{timeout:120000},async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const merchants=[`Consumer-A-${randomUUID()}`,`Consumer-B-${randomUUID()}`],owner=`Consumer-Owner-${randomUUID()}`;
  let server,stopSupport;
  t.after(()=>cleanupResources([
    ['support timer',()=>stopSupport?.()],
    ['HTTP',async()=>{if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}}],
    ...['manual_reply_requests','messages','conversations','merchant_channels'].map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['notices',()=>admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[]) OR account_id=$2',[merchants,owner])],
    ['devices',()=>admin.query('DELETE FROM trusted_devices WHERE account_id=$1',[owner])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[[...merchants,owner]])],
    ['runtime',()=>runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const {ADMIN_SESSION_COOKIE,MERCHANT_SESSION_COOKIE}=await import('../src/middleware/authSession.ts');
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'admin',$2,'synthetic','active',true)",[owner,`+198${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic','owner_admin',true,false)",[owner]);
  const security=await import('../src/services/postgresAdminSecurityAuthority.ts');
  const ownerDevice=`device-${randomUUID()}`;
  const device=await security.registerAdminDeviceAuthoritative({accountId:owner,accountKind:'admin',deviceId:ownerDevice,deviceLabel:'Synthetic'});
  await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner});
  const ownerSession=await auth.issueSession({accountId:owner,accountKind:'admin',tenantId:'fawri-admin',adminRole:'owner_admin',deviceId:ownerDevice,permissions:[]});
  const sessions=[];
  for(const id of merchants){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,`+198${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
    const device=`device-${randomUUID()}`,session=await auth.issueSession({accountId:id,accountKind:'merchant',tenantId:id,deviceId:device});
    const channel=`Channel-${randomUUID()}`,conversation=`Conversation-${randomUUID()}`,message=`Message-${randomUUID()}`;
    await admin.query("INSERT INTO merchant_channels(id,merchant_id,platform,status,page_id) VALUES($1,$2,'messenger','connected',$3)",[channel,id,`private-page-${id}`]);
    await admin.query("INSERT INTO conversations(id,merchant_id,channel_id,customer_external_id,customer_name) VALUES($1,$2,$3,$4,$4)",[conversation,id,channel,`private-customer-${id}`]);
    const metadata={source_stage:'synthetic-owned',image_url:`https://example.invalid/owned/${id}.jpg`};
    await admin.query("INSERT INTO messages(id,merchant_id,conversation_id,sender,status,text,metadata) VALUES($1,$2,$3,'customer','received',$4,$5::jsonb)",[message,id,conversation,`private-message-${id}`,JSON.stringify(metadata)]);
    await admin.query("INSERT INTO manual_reply_requests(id,merchant_id,conversation_id,idempotency_key,text_sha256,status,error_code) VALUES($1,$2,$3,$1,$4,$5,$6)",[`private-request-${id}`,id,conversation,'a'.repeat(64),id===merchants[0]?'failed':'pending',id===merchants[0]?'SYNTHETIC_CONFIRMED_FAILURE':null]);
    sessions.push({id,device,session,channel,conversation,message,metadata,cookie:`${MERCHANT_SESSION_COOKIE}=${session.token}`});
    for(const suffix of ['own','expired','admin'])await admin.query("INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key,variables,expires_at) VALUES($1,$2,$3,$4,'synthetic','synthetic','synthetic',$5::jsonb,$6)",[
      `${id}-${suffix}`,suffix==='admin'?'admin':'merchant',id,suffix==='admin'?owner:null,JSON.stringify({sentinel:`private-${id}-${suffix}`}),suffix==='expired'?new Date(Date.now()-1000):null,
    ]);
  }
  const {default:app}=await import('../src/app.ts');
  ({stopPostgresSupportRuntimeCutoverForTests:stopSupport}=await import('../src/services/postgresSupportRuntimeCutover.ts'));
  await stopSupport();
  server=await new Promise((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function req(path,actor,method='GET',body,headers={}){
    const response=await fetch(origin+path,{method,headers:{...(actor?{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
  }
  async function snapshot(ids=merchants){const result={};for(const table of ['notifications','conversations','messages','manual_reply_requests'])result[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY id`,[ids])).rows;return result;}
  const [a,b]=sessions;
  const ownerActor={cookie:`${ADMIN_SESSION_COOKIE}=${ownerSession.token}`,device:ownerDevice};
  function noRequestInternals(body){assert.doesNotMatch(JSON.stringify(body),/text_sha256|idempotency_key|page_access_token|pageAccessToken|private-request-/);}
  await t.test('actual app notification variants keep own live audience and exact read replay with peer preserved',async()=>{
    for(const actor of sessions){
      const peer=actor===a?b:a;
      for(const path of ['/api/auth/notifications','/API/AuTh/NoTiFiCaTiOnS/']){
        const r=await req(`${path}?merchant_id=${peer.id}&audience=admin&account_id=${owner}`,actor);assert.equal(r.status,200);assert.equal(r.cache,'no-store');
        assert.deepEqual(r.body.notifications.map(n=>n.id),[`${actor.id}-own`]);assert.equal(r.body.notifications[0].sentinel,`private-${actor.id}-own`);assert.doesNotMatch(JSON.stringify(r.body),new RegExp(peer.id));
      }
    }
    const peer=await snapshot([b.id]);
    const path=`/API/Auth/Notifications/${a.id}-own/ReAd/`;
    const first=await req(path,a,'PATCH',{merchant_id:b.id});assert.equal(first.status,200);assert.ok(first.body.notification.read_at);
    const again=await req(path,a,'PATCH');assert.equal(again.status,200);assert.equal(again.body.notification.read_at,first.body.notification.read_at);assert.deepEqual(await snapshot([b.id]),peer);
  });
  await t.test('actual app conversation aliases retain exact mixed-case identities and metadata without foreign or request fields',async()=>{
    for(const actor of sessions){
      const peer=actor===a?b:a;
      for(const path of ['/api/conversations','/API/CoNvErSaTiOnS/',`/API/Conversations/${actor.id}/`]){
        const r=await req(`${path}?merchant_id=${peer.id}`,actor);assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.body.merchant_id,actor.id);assert.deepEqual(r.body.conversations.map(c=>c.id),[actor.conversation]);noRequestInternals(r.body);assert.doesNotMatch(JSON.stringify(r.body),new RegExp(peer.id));
      }
      const r=await req(`/API/CoNvErSaTiOn/${actor.conversation}/`,actor);assert.equal(r.status,200);assert.equal(r.body.conversation.id,actor.conversation);assert.equal(r.body.conversation.customer_name,`private-customer-${actor.id}`);assert.deepEqual(r.body.conversation.messages.find(m=>m.id===actor.message).metadata,actor.metadata);noRequestInternals(r.body);
    }
  });
  await t.test('both consumer families deny anonymous admin wrong-device and combined-role requests without SQL changes',async()=>{
    const before=await snapshot();
    for(const [label,actor,headers] of [['anonymous',undefined,{}],['admin',ownerActor,{}],['wrong-device',a,{'X-Fawri-Device-Id':'wrong'}],['combined',a,{Cookie:`${a.cookie}; ${ownerActor.cookie}`} ]]){
      for(const [path,method] of [['/API/AUTH/Notifications/','GET'],[`/API/AUTH/Notifications/${a.id}-own/Read/`,'PATCH'],['/API/Conversations/','GET'],[`/API/Conversations/${a.conversation}/Takeover/`,'POST']]){
        const r=await req(path,actor,method,undefined,headers);assert.equal(r.status,401,label+' '+path);assert.doesNotMatch(JSON.stringify(r.body),/private-customer-|private-message-|sentinel/);assert.deepEqual(await snapshot(),before,label);
      }
    }
    assert.equal((await req('/api/auth/notifications',b)).status,200);assert.equal((await req('/api/conversations',b)).status,200);
  });
  await t.test('foreign consumer IDs and administrative audience deny across actual app without business changes',async()=>{
    const before=await snapshot();
    for(const [path,method,status] of [[`/API/Auth/Notifications/${b.id}-own/Read/`,'PATCH',404],[`/api/auth/notifications/${a.id}-admin/read`,'PATCH',404],[`/API/Conversations/${b.id}/`,'GET',403],[`/API/Conversation/${b.conversation}/`,'GET',404],[`/API/Conversations/${b.conversation}/Takeover/`,'POST',404],[`/API/Conversations/${b.conversation}/Return-To-Fawri/`,'POST',404]]){
      const r=await req(path,a,method);assert.equal(r.status,status,path);noRequestInternals(r.body);assert.doesNotMatch(JSON.stringify(r.body),/private-customer-|private-message-|sentinel/);assert.deepEqual(await snapshot(),before);
    }
  });
  await t.test('actual app takeover and return bind own path despite foreign hints and retain peer pending request',async()=>{
    const peer=await snapshot([b.id]);
    const base=`/API/Conversations/${a.conversation}`;
    for(const [suffix,status,human] of [['Takeover','manual',true],['Return-To-Fawri','auto_replying',false]]){
      const r=await req(`${base}/${suffix}/?merchant_id=${b.id}&conversation_id=${b.conversation}`,a,'POST',{merchant_id:b.id,conversation_id:b.conversation});assert.equal(r.status,200);assert.equal(r.body.conversation.id,a.conversation);assert.equal(r.body.conversation.status,status);assert.equal(r.body.conversation.assigned_to_human,human);noRequestInternals(r.body);assert.deepEqual(await snapshot([b.id]),peer);
    }
  });
  await t.test('retired bot debug aliases never expose draft page catalog or filesystem fields through actual app',async()=>{
    const before=await snapshot();
    for(const actor of sessions){
      const peer=actor===a?b:a;
      for(const path of ['/api/bot/debug','/API/BoT/DeBuG/']){
        const r=await req(`${path}?merchant_id=${peer.id}&text=synthetic-private-probe`,actor);
        assert.equal(r.status,410,JSON.stringify(r));
        if(r.status===410)assert.equal(r.body.code,'LEGACY_BOT_DEBUG_DISABLED');
        assert.doesNotMatch(JSON.stringify(r.body),/db_path|drafts_for_merchant|drafts_count|meta_pages_for_merchant|product_names|private-page-/);
        assert.equal(JSON.stringify(r.body).includes(peer.id),false);
      }
    }
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual(fs.readdirSync(process.env.FAWRI_DATA_DIR).filter(n=>n.endsWith('.json')),[]);
    assert.equal((await req('/api/auth/notifications',b)).status,200);
  });
  await t.test('retired bot debug rejects non-merchant and invalid session actors without SQL changes',async()=>{
    const before=await snapshot();
    for(const path of ['/api/bot/debug','/API/BoT/DeBuG/'])for(const [actor,headers] of [[undefined,{}],[ownerActor,{}],[a,{'X-Fawri-Device-Id':'wrong'}],[a,{Cookie:`${a.cookie}; ${ownerActor.cookie}`} ]]){
      const r=await req(path,actor,'GET',undefined,headers);
      assert.ok([401,410].includes(r.status),'only authenticated denial or unconditional retirement is allowed');
      if(r.status===410)assert.deepEqual(r.body,{ok:false,code:'LEGACY_BOT_DEBUG_DISABLED',error:'legacy bot debug route is disabled'});
      assert.doesNotMatch(JSON.stringify(r.body),/db_path|drafts_for_merchant|meta_pages_for_merchant|private-page-/);
    }
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('revoked merchant loses both actual-app consumers while peer succeeds and root JSON stores stay absent',async()=>{
    assert.equal(await auth.revokeSession(a.session.token,'merchant','logout'),true);const before=await snapshot();
    for(const [path,method] of [['/API/AUTH/Notifications/','GET'],[`/api/auth/notifications/${a.id}-own/read`,'PATCH'],['/API/Conversations/','GET'],[`/api/conversations/${a.conversation}/takeover`,'POST']])assert.equal((await req(path,a,method)).status,401);
    assert.deepEqual(await snapshot(),before);for(const path of ['/api/auth/notifications','/api/conversations'])assert.equal((await req(path,b)).status,200);
    assert.deepEqual(fs.readdirSync(process.env.FAWRI_DATA_DIR).filter(n=>n.endsWith('.json')),[]);
  });
  console.log('P0_CONSUMER_FULL_APP_HTTP '+JSON.stringify({actualApp:true,syntheticMerchants:2,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,notificationsAndConversationAliases:true,mixedCaseIdentities:true,foreignFieldsDenied:true,requestInternalsAbsent:true,ownerAndSessionConfusionDenied:true,ownMutationsPeerPreserved:true,legacyRootJson:false,providerSending:false,fullEightTableMatrix:false,hostedAccepted:false}));
});
