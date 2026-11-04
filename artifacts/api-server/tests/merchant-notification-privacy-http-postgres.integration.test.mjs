import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env,{
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
  FAWRI_AUTH_SECURITY_SECRET:'synthetic-notification-http-secret-over-32-characters',
  FAWRI_PASSWORD_SALT:'synthetic-notification-http-salt-over-32-characters',
});

test('notification HTTP privacy isolates tenant and administrative audiences on actual SQL sessions',{timeout:120000},async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const merchants=[`notice-a-${randomUUID()}`,`notice-b-${randomUUID()}`],owner=`notice-owner-${randomUUID()}`;
  let server,stopSupport;
  t.after(()=>cleanupResources([
    ['support timer',()=>stopSupport?.()],
    ['HTTP',async()=>{if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}}],
    ['notices',()=>admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[]) OR account_id=$2',[merchants,owner])],
    ['devices',()=>admin.query('DELETE FROM trusted_devices WHERE account_id=$1',[owner])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[[...merchants,owner]])],
    ['runtime',()=>runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const {ADMIN_SESSION_COOKIE,MERCHANT_SESSION_COOKIE}=await import('../src/middleware/authSession.ts');
  const {default:router}=await import('../src/routes/auth-security.ts');
  ({stopPostgresSupportRuntimeCutoverForTests:stopSupport}=await import('../src/services/postgresSupportRuntimeCutover.ts'));
  const {default:express}=await import('express');const {default:cookieParser}=await import('cookie-parser');
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
    sessions.push({id,device,session,cookie:`${MERCHANT_SESSION_COOKIE}=${session.token}`});
    for(const suffix of ['own','expired','admin'])await admin.query("INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key,variables,expires_at) VALUES($1,$2,$3,$4,'synthetic','synthetic','synthetic',$5::jsonb,$6)",[
      `${id}-${suffix}`,suffix==='admin'?'admin':'merchant',id,suffix==='admin'?owner:null,JSON.stringify({sentinel:`private-${id}-${suffix}`}),suffix==='expired'?new Date(Date.now()-1000):null,
    ]);
  }
  const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/auth',router);
  server=await new Promise((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function req(path,actor,method='GET',headers={}){
    const response=await fetch(origin+'/api/auth'+path,{method,headers:{...(actor?{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device}:{}),...headers}});return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};
  }
  const snapshot=async()=>(await admin.query('SELECT to_jsonb(n) AS row FROM notifications n WHERE merchant_id=ANY($1::text[]) ORDER BY id',[merchants])).rows;
  const [a,b]=sessions;
  await t.test('anonymous and administrative cookies cannot read or mutate merchant notifications',async()=>{
    const before=await snapshot(),ownerActor={cookie:`${ADMIN_SESSION_COOKIE}=${ownerSession.token}`,device:ownerDevice};
    for(const actor of [undefined,ownerActor])for(const [path,method] of [['/notifications','GET'],[`/notifications/${a.id}-own/read`,'PATCH']])assert.equal((await req(path,actor,method)).status,401);
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('both merchants list only own live merchant audience despite foreign query hints',async()=>{
    for(const actor of sessions){const foreign=actor===a?b:a;const r=await req(`/notifications?merchant_id=${foreign.id}&account_id=${owner}&audience=admin`,actor);assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.deepEqual(r.body.notifications.map(x=>x.id),[`${actor.id}-own`]);assert.deepEqual(Object.keys(r.body.notifications[0]).sort(),['created_at','id','type']);assert.doesNotMatch(JSON.stringify(r.body),new RegExp(foreign.id));}
  });
  await t.test('forged tenant headers and foreign query hints cannot override authenticated merchant scope',async()=>{
    const before=await snapshot();
    for(const actor of sessions){
      const foreign=actor===a?b:a;
      const headers={'X-Fawri-Merchant-Id':foreign.id,'X-Merchant-Id':foreign.id,'X-Tenant-Id':foreign.id};
      const list=await req(`/notifications?merchant_id=${foreign.id}&account_id=${owner}&audience=admin`,actor,'GET',headers);
      assert.equal(list.status,200);
      assert.deepEqual(list.body.notifications.map(item=>item.id),[`${actor.id}-own`]);
      assert.doesNotMatch(JSON.stringify(list.body),new RegExp(foreign.id));
      const write=await req(`/notifications/${foreign.id}-own/read`,actor,'PATCH',headers);
      assert.equal(write.status,404);
      assert.equal(write.body.code,'NOTIFICATION_NOT_FOUND');
    }
    assert.deepEqual(await snapshot(),before,'forged tenant headers and query parameters must not change private SQL rows');
  });
  await t.test('foreign and administrative notification IDs return 404 with unchanged SQL',async()=>{
    const before=await snapshot();
    for(const actor of sessions){const foreign=actor===a?b:a;for(const id of [`${foreign.id}-own`,`${actor.id}-admin`,`${foreign.id}-admin`]){const r=await req(`/notifications/${id}/read`,actor,'PATCH');assert.equal(r.status,404);assert.equal(r.body.code,'NOTIFICATION_NOT_FOUND');assert.doesNotMatch(JSON.stringify(r.body),/sentinel|private-/);}}
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('own read and exact replay retain timestamp without touching peer or administrative audience',async()=>{
    const beforePeer=(await snapshot()).filter(x=>x.row.merchant_id===b.id||x.row.audience==='admin');
    const first=await req(`/notifications/${a.id}-own/read`,a,'PATCH');assert.equal(first.status,200);assert.ok(first.body.notification.read_at);assert.equal(first.cache,'no-store');
    const repeat=await req(`/notifications/${a.id}-own/read`,a,'PATCH');assert.equal(repeat.status,200);assert.equal(repeat.body.notification.read_at,first.body.notification.read_at);
    assert.deepEqual((await snapshot()).filter(x=>x.row.merchant_id===b.id||x.row.audience==='admin'),beforePeer);
    assert.deepEqual((await req('/notifications?unread=1',a)).body.notifications,[]);
    assert.deepEqual((await req('/notifications?unread=1',b)).body.notifications.map(x=>x.id),[`${b.id}-own`]);
  });
  await t.test('response field minimization preserves known shapes while hiding stored extensions and unknown types',async()=>{
    const knownId='known-projection-'+randomUUID(),unknownId='unknown-projection-'+randomUUID();
    const variables={conversation_id:'conversation-verified',action_url:'/conversations/verified',order_id:'extra-not-permitted',internal_note:'stored-only-sentinel'};
    try{
      for(const [id,type,fields] of [[knownId,'operational_customer_message',variables],[unknownId,'historical_custom',{internal_note:'stored-only-sentinel'}]]){
        await admin.query("INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key,variables) VALUES($1,'merchant',$2,$2,$3,'synthetic','synthetic',$4::jsonb)",[id,b.id,type,JSON.stringify(fields)]);
      }
      const list=await req('/notifications?limit=50',b);
      assert.equal(list.status,200);
      const known=list.body.notifications.find(item=>item.id===knownId);
      const unknown=list.body.notifications.find(item=>item.id===unknownId);
      assert.ok(known);
      assert.deepEqual(Object.keys(known).sort(),['action_url','conversation_id','created_at','id','type']);
      assert.equal(known.conversation_id,'conversation-verified');
      assert.equal(known.action_url,'/conversations/verified');
      assert.ok(unknown);
      assert.deepEqual(Object.keys(unknown).sort(),['created_at','id','type']);
      assert.doesNotMatch(JSON.stringify(list.body),/stored-only-sentinel|extra-not-permitted/);
      const foreign=await req('/notifications/'+knownId+'/read',a,'PATCH');
      assert.equal(foreign.status,404);
      const read=await req('/notifications/'+knownId+'/read',b,'PATCH');
      assert.equal(read.status,200);
      assert.ok(read.body.notification.read_at);
      assert.deepEqual(Object.keys(read.body.notification).sort(),['action_url','conversation_id','created_at','id','read_at','type']);
      const persisted=await admin.query('SELECT variables FROM notifications WHERE id=$1',[knownId]);
      assert.deepEqual(persisted.rows[0].variables,variables,'response projection must not rewrite stored notifications');
    }finally{
      await admin.query('DELETE FROM notifications WHERE id=ANY($1::text[])',[[knownId,unknownId]]);
    }
  });
  await t.test('mixed merchant and administrative cookies fail closed for notification reads and writes',async()=>{
    const before=await snapshot();
    for(const actor of sessions){
      const mixedCookie=`${actor.cookie}; ${ADMIN_SESSION_COOKIE}=${ownerSession.token}`;
      for(const [path,method] of [['/notifications','GET'],[`/notifications/${actor.id}-own/read`,'PATCH']]){
        const r=await req(path,actor,method,{Cookie:mixedCookie});
        assert.equal(r.status,401,`${method} ${path}`);
        assert.equal(r.body.code,'ROLE_SESSION_CONFUSION',`${method} ${path}`);
        assert.doesNotMatch(JSON.stringify(r.body),/private-|sentinel/);
      }
    }
    assert.deepEqual(await snapshot(),before,'mixed-role cookies must not mutate notification rows');
  });
  await t.test('wrong device and role-confused token fail before SQL mutations',async()=>{
    const before=await snapshot();
    assert.equal((await req('/notifications',a,'GET',{'X-Fawri-Device-Id':'wrong'})).status,401);
    assert.equal((await req('/notifications',a,'GET',{Cookie:`${MERCHANT_SESSION_COOKIE}=${ownerSession.token}`})).status,401);
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('revoked merchant session loses read and write access while peer still succeeds',async()=>{
    assert.equal(await auth.revokeSession(a.session.token,'merchant','logout'),true);
    const before=await snapshot();assert.equal((await req('/notifications',a)).status,401);assert.equal((await req(`/notifications/${a.id}-own/read`,a,'PATCH')).status,401);assert.deepEqual(await snapshot(),before);
    assert.equal((await req('/notifications',b)).status,200);
  });
  console.log('P0_NOTIFICATION_PRIVACY_HTTP '+JSON.stringify({syntheticMerchants:2,actualParentAuthRouter:true,actualSqlSessions:true,foreignAndAdminDenials:6,exactReadReplay:true,revokedSessionDenied:true,fullEightTableMatrix:false,hostedAccepted:false}));
});
