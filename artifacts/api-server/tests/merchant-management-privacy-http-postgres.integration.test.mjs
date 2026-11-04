import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env,{
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
  FAWRI_AUTH_SECURITY_SECRET:'synthetic-management-http-secret-over-32-characters',
  FAWRI_PASSWORD_SALT:'synthetic-management-http-salt-over-32-characters',
  FAWRI_ALLOWED_ORIGINS:'https://management.example.invalid',
});

test('management HTTP privacy uses current SQL roles, permissions and session authority',{timeout:120000},async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const ids=[],merchants=[],actors=[];
  const tables=['merchant_admin_notes','merchant_channel_overrides','merchant_deletion_requests','audit_events'];
  let server;
  t.after(()=>cleanupResources([
    ['HTTP',async()=>{if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}}],
    ...tables.map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['notifications',()=>admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[]) OR account_id=ANY($2::text[])',[merchants,ids])],
    ['directory audits',()=>admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])',[ids])],
    ['trusted devices',()=>admin.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])',[ids])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['runtime',()=>runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const security=await import('../src/services/postgresAdminSecurityAuthority.ts');
  const {ADMIN_SESSION_COOKIE,MERCHANT_SESSION_COOKIE,enforceAuthOrigin}=await import('../src/middleware/authSession.ts');
  const {default:router}=await import('../src/routes/auth-merchant-management-postgres-routes.ts');
  const {default:express}=await import('express');
  const {default:cookieParser}=await import('cookie-parser');
  async function actor(kind,role,permissions=[]){
    const id=`management-http-${randomUUID()}`;ids.push(id);
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,$2,$3,'synthetic','active',true)",[id,kind,`+198${randomInt(100000000,999999999)}`]);
    const a={id,kind,role,permissions,device:`synthetic-${randomUUID()}`};actors.push(a);
    if(kind==='admin'){
      await admin.query("INSERT INTO admin_profiles(id,account_id,display_name,role,enabled,must_change_password) VALUES($1,$1,'Synthetic',$2,true,false)",[id,role]);
      for(const permission of permissions)await admin.query('INSERT INTO admin_permissions(admin_id,permission) VALUES($1,$2)',[id,permission]);
    }else{
      merchants.push(id);
      await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','suspended','suspended')",[id]);
    }
    return a;
  }
  const owner=await actor('admin','owner_admin');
  const manager=await actor('admin','assistant_admin',['manage_merchant_status','manage_channels','view_logs','manage_subscriptions']);
  const channelOnly=await actor('admin','assistant_admin',['manage_channels']);
  const denied=await actor('admin','assistant_admin',[]);
  const a=await actor('merchant'),b=await actor('merchant');
  for(const actor of actors){
    if(actor.kind==='admin'){
      const device=await security.registerAdminDeviceAuthoritative({accountId:actor.id,accountKind:'admin',deviceId:actor.device,deviceLabel:'Synthetic'});
      await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
    }
    actor.session=await auth.issueSession({accountId:actor.id,accountKind:actor.kind,tenantId:actor.kind==='admin'?'fawri-admin':actor.id,adminRole:actor.role,deviceId:actor.device,permissions:actor.permissions});
    actor.cookie=`${actor.kind==='admin'?ADMIN_SESSION_COOKIE:MERCHANT_SESSION_COOKIE}=${actor.session.token}`;
  }
  const management=await import('../src/services/postgresMerchantManagementAuthority.ts');
  for(const merchant of merchants){
    await management.setMerchantAdminNotePostgres({merchantId:merchant,note:`private-note-${merchant}`,actorAdminId:owner.id});
    await management.setMerchantChannelOverridePostgres({merchantId:merchant,platform:'messenger',status:'connected',actorAdminId:owner.id});
  }
  const requestA=await management.createDeletionRequestPostgres({merchantId:a.id,actorAdminId:manager.id,reason:'policy_violation',details:'private-deletion-A'});
  const requestB=await management.createDeletionRequestPostgres({merchantId:b.id,actorAdminId:manager.id,reason:'policy_violation',details:'private-deletion-B'});
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[merchants])).rows])));
  const app=express();app.use(cookieParser());app.use(express.json());app.use('/api/auth',enforceAuthOrigin,router);
  server=await new Promise((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function req(path,actor,method='GET',body,headers={}){
    const response=await fetch(origin+'/api/auth'+path,{method,headers:{...(actor?{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  }
  const routes=[
    {path:`/merchants/${a.id}/note`,method:'GET'},
    {path:`/merchants/${a.id}/note`,method:'PUT',body:{note:'denied-change'}},
    {path:'/admin/channels',method:'GET'},
    {path:`/merchants/${a.id}/channels/messenger`,method:'PATCH',body:{status:'disconnected'}},
    {path:'/admin/deletion-requests',method:'GET'},
    {path:`/merchants/${b.id}/deletion-requests`,method:'POST',body:{reason:'policy_violation',details:'denied-change'}},
    {path:`/admin/deletion-requests/${requestA.id}/reject`,method:'POST'},
    {path:'/admin/logs',method:'GET'},
    {path:'/admin/logs',method:'POST',body:{merchant_id:a.id,action_type:'plan_activated',details:'denied-change'}},
    {path:'/admin/local-data-migration',method:'POST',body:{notes:{[a.id]:'denied-import'}}},
  ];
  let deniedRequests=0;
  async function expectDenied(actor,status){
    const before=await snapshot();
    for(const r of routes){const result=await req(r.path,actor,r.method,r.body);assert.equal(result.status,status,`${r.method} ${r.path}`);assert.equal(result.body.ok,false);assert.doesNotMatch(JSON.stringify(result.body),/private-note-|private-deletion-/);deniedRequests++;}
    assert.deepEqual(await snapshot(),before,'denied requests must not mutate private rows or audit history');
  }
  await t.test('unauthenticated caller denied across ten mounted actions',()=>expectDenied(undefined,401));
  await t.test('both merchant cookies deny administrative reads and mutations for own and foreign records',async()=>{await expectDenied(a,401);await expectDenied(b,401);});
  await t.test('assistant without current permissions cannot use administrative actions',()=>expectDenied(denied,403));
  await t.test('channel-only assistant can inspect channel overrides but not private merchant administration',async()=>{
    const before=await snapshot();
    const channels=await req('/admin/channels',channelOnly);
    assert.equal(channels.status,200);
    for(const merchant of merchants)assert.equal(channels.body.channel_overrides[merchant].messenger,'connected');
    for(const path of [`/merchants/${a.id}/note`,'/admin/deletion-requests','/admin/logs']){
      const deniedRead=await req(path,channelOnly);
      assert.equal(deniedRead.status,403,path);
      assert.equal(deniedRead.body.code,'ADMIN_PERMISSION_REQUIRED');
      assert.doesNotMatch(JSON.stringify(deniedRead.body),/private-note-|private-deletion-/);
    }
    for(const route of [
      {path:`/merchants/${a.id}/note`,method:'PUT',body:{note:'forbidden-channel-only-edit'}},
      {path:`/merchants/${b.id}/deletion-requests`,method:'POST',body:{reason:'policy_violation',details:'forbidden-channel-only-deletion'}},
      {path:'/admin/logs',method:'POST',body:{merchant_id:a.id,action_type:'plan_activated',details:'forbidden-channel-only-audit'}},
    ]){
      const deniedWrite=await req(route.path,channelOnly,route.method,route.body);
      assert.equal(deniedWrite.status,403,`${route.method} ${route.path}`);
      assert.equal(deniedWrite.body.code,'ADMIN_PERMISSION_REQUIRED');
    }
    assert.deepEqual(await snapshot(),before,'channel-only inspection and denied private reads/writes must not mutate SQL state');
  });
  await t.test('channel-only assistant loses directory access after SQL permission revocation',async()=>{
    const before=await snapshot();
    // The successful directory read requires the separate operator database
    // credential; this restricted-SQL suite verifies the HTTP denial only.
    await admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_channels'",[channelOnly.id]);
    try{
      const revoked=await req('/merchants',channelOnly);
      assert.equal(revoked.status,403);
      assert.equal(revoked.body.code,'ADMIN_PERMISSION_REQUIRED');
      assert.doesNotMatch(JSON.stringify(revoked.body),/private-note-|private-deletion-/);
    }finally{
      await admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_channels')",[channelOnly.id]);
    }
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('owner and authorized assistant can read both intended private notes and channel records',async()=>{
    for(const actor of [owner,manager]){
      for(const merchant of merchants){const r=await req(`/merchants/${merchant}/note`,actor);assert.equal(r.status,200);assert.equal(r.body.note,`private-note-${merchant}`);}
      const channels=await req('/admin/channels',actor);assert.equal(channels.status,200);for(const merchant of merchants)assert.equal(channels.body.channel_overrides[merchant].messenger,'connected');
      const reviews=await req('/admin/deletion-requests',actor);assert.equal(reviews.status,200);for(const id of [requestA.id,requestB.id])assert.ok(reviews.body.deletion_requests.some(x=>x.id===id));
    }
  });
  await t.test('authorized assistant edits one merchant without touching peer; SQL records current actor',async()=>{
    const peer=await management.getMerchantAdminNotePostgres(b.id);
    assert.equal((await req(`/merchants/${a.id}/note`,manager,'PUT',{note:'authorized-edit'})).status,200);
    assert.equal((await req(`/merchants/${a.id}/channels/messenger`,manager,'PATCH',{status:'disconnected'})).status,200);
    assert.equal((await req(`/merchants/${a.id}/note`,owner)).body.note,'authorized-edit');
    assert.equal(await management.getMerchantAdminNotePostgres(b.id),peer);
    assert.equal((await admin.query('SELECT updated_by_admin_id FROM merchant_admin_notes WHERE merchant_id=$1',[a.id])).rows[0].updated_by_admin_id,manager.id);
    assert.equal((await admin.query('SELECT status FROM merchant_channel_overrides WHERE merchant_id=$1',[b.id])).rows[0].status,'connected');
  });
  await t.test('assistant cannot review or import; owner review changes only intended request',async()=>{
    const before=await snapshot();
    assert.equal((await req(`/admin/deletion-requests/${requestA.id}/reject`,manager,'POST')).status,403);
    assert.equal((await req('/admin/local-data-migration',manager,'POST',{notes:{[a.id]:'denied-import'}})).status,403);
    assert.deepEqual(await snapshot(),before);
    const r=await req(`/admin/deletion-requests/${requestA.id}/reject`,owner,'POST');assert.equal(r.status,200);assert.equal(r.body.deletion_request.status,'rejected');
    assert.equal((await admin.query('SELECT status FROM merchant_deletion_requests WHERE id=$1',[requestB.id])).rows[0].status,'pending');
  });
  await t.test('authorized audit append and read persist without tenant primary SQL visibility',async()=>{
    const r=await req('/admin/logs',manager,'POST',{merchant_id:a.id,action_type:'plan_activated',details:'authorized-audit'});assert.equal(r.status,201);
    const logs=await req('/admin/logs',manager);assert.equal(logs.status,200);assert.ok(logs.body.logs.some(x=>x.id===r.body.log.id));
    assert.equal((await runtime.runtimePool.query('SELECT id FROM audit_events WHERE id=$1',[r.body.log.id])).rowCount,0);
  });
  await t.test('view_logs alone does not expose merchant incident records',async()=>{
    const incidentId='audit-'+randomUUID();
    await admin.query("INSERT INTO audit_events(id,actor_kind,merchant_id,action_type,entity_type,entity_id,details,metadata,created_at) VALUES($1,'system',$2,'early_warning_incident','early_warning_incident',$2,'private incident','{}'::jsonb,now())",[incidentId,a.id]);
    const managerLogs=await req('/admin/logs',manager);
    assert.equal(managerLogs.status,200);
    assert.ok(!managerLogs.body.logs.some(log=>log.id===incidentId));
    const ownerLogs=await req('/admin/logs',owner);
    assert.equal(ownerLogs.status,200);
    assert.ok(ownerLogs.body.logs.some(log=>log.id===incidentId));
  });
  await t.test('mixed merchant and admin cookies cannot reach private management actions',async()=>{
    const before=await snapshot();
    for(const actor of [owner,manager]){
      const mixedCookie=`${actor.cookie}; ${a.cookie}`;
      for(const route of routes){
        const result=await req(route.path,actor,route.method,route.body,{Cookie:mixedCookie});
        assert.equal(result.status,401,`${route.method} ${route.path}`);
        assert.doesNotMatch(JSON.stringify(result.body),/private-note-|private-deletion-/);
      }
    }
    assert.deepEqual(await snapshot(),before,'mixed-role cookies must not mutate private SQL rows');
  });
  await t.test('forged owner role and permission headers cannot elevate an assistant or merchant',async()=>{
    const before=await snapshot();
    const forged={'X-Fawri-Admin-Role':'owner_admin','X-Admin-Role':'owner_admin','X-Fawri-Permissions':'manage_merchant_status,view_logs,manage_subscriptions','X-Merchant-Id':a.id};
    for(const actor of [denied,channelOnly,a]){
      for(const route of [
        {path:`/merchants/${a.id}/note`,method:'GET'},
        {path:`/merchants/${a.id}/note`,method:'PUT',body:{note:'forged-owner-write'}},
        {path:'/admin/logs',method:'GET'},
        {path:'/admin/local-data-migration',method:'POST',body:{notes:{[a.id]:'forged-owner-import'}}},
        {path:`/admin/deletion-requests/${requestB.id}/reject`,method:'POST'},
      ]){
        const response=await req(route.path,actor,route.method,route.body,forged);
        assert.equal(response.status,actor.kind==='merchant'?401:403,`${actor.kind} ${route.method} ${route.path}`);
        assert.equal(response.body.ok,false);
        assert.doesNotMatch(JSON.stringify(response.body),/private-note-|private-deletion-/);
      }
    }
    assert.deepEqual(await snapshot(),before,'forged identity and permission headers must not mutate merchant management rows');
    assert.equal((await req(`/merchants/${a.id}/note`,owner)).status,200,'legitimate owner access remains available');
  });
  await t.test('wrong device and forbidden origin deny without mutations',async()=>{
    const before=await snapshot();
    assert.equal((await req(`/merchants/${a.id}/note`,owner,'GET',undefined,{'X-Fawri-Device-Id':'wrong'})).status,401);
    assert.equal((await req(`/merchants/${a.id}/note`,owner,'PUT',{note:'forbidden'},{Origin:'https://forbidden.example.invalid'})).status,403);
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('removing SQL permissions invalidates authority despite original session claims',async()=>{
    await admin.query('DELETE FROM admin_permissions WHERE admin_id=$1',[manager.id]);
    const before=await snapshot();
    for(const r of routes.slice(0,6)){assert.equal((await req(r.path,manager,r.method,r.body)).status,403);}
    assert.deepEqual(await snapshot(),before);
    assert.equal((await req(`/merchants/${a.id}/note`,owner)).status,200);
  });
  await t.test('revoked SQL session cannot reuse private routes while independent owner remains active',async()=>{
    assert.equal(await auth.revokeSession(manager.session.token,'admin','logout'),true);
    await expectDenied(manager,401);
    assert.equal((await req(`/merchants/${b.id}/note`,owner)).status,200);
  });
  console.log('P0_MANAGEMENT_PRIVACY_HTTP '+JSON.stringify({tables,syntheticMerchants:2,restrictedPrimaryLogin:runtime.role,deniedRequests,actualHttp:true,actualSqlSessions:true,permissionRevocation:true,peerPreservation:true,fullEightTableMatrix:false,hostedAccepted:false}));
});
