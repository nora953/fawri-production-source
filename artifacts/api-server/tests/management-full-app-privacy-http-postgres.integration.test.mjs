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
  FAWRI_AUTH_SECURITY_SECRET:'synthetic-management-http-secret-over-32-characters',
  FAWRI_PASSWORD_SALT:'synthetic-management-http-salt-over-32-characters',
  FAWRI_ALLOWED_ORIGINS:'https://management.example.invalid',
});

test('full application management privacy preserves cutover ordering and current SQL authority',{timeout:120000},async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const ids=[],merchants=[],actors=[];
  const tables=['merchant_admin_notes','merchant_channel_overrides','merchant_deletion_requests','audit_events'];
  let server;
  t.after(()=>cleanupResources([
    ['HTTP',async()=>{if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}}],
    ['support runtime',async()=>{const m=await import('../src/services/postgresSupportRuntimeCutover.ts');await m.stopPostgresSupportRuntimeCutoverForTests();}],
    ...tables.map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['notifications',()=>admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[]) OR account_id=ANY($2::text[])',[merchants,ids])],
    ['directory audits',()=>admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=ANY($1::text[])',[ids])],
    ['trusted devices',()=>admin.query('DELETE FROM trusted_devices WHERE account_id=ANY($1::text[])',[ids])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['runtime',()=>runtime.dispose()],
  ]));
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const security=await import('../src/services/postgresAdminSecurityAuthority.ts');
  const {ADMIN_SESSION_COOKIE,MERCHANT_SESSION_COOKIE}=await import('../src/middleware/authSession.ts');
  async function actor(kind,role,permissions=[]){
    const id=`Full-App-HTTP-${randomUUID()}`;ids.push(id);
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
  const {default:app}=await import('../src/app.ts');
  const {stopPostgresSupportRuntimeCutoverForTests}=await import('../src/services/postgresSupportRuntimeCutover.ts');
  await stopPostgresSupportRuntimeCutoverForTests();
  server=await new Promise((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function req(path,actor,method='GET',body,headers={}){
    const response=await fetch(origin+path,{method,headers:{...(actor?{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control'),nosniff:response.headers.get('x-content-type-options')};
  }
  const canonical=`/api/auth/merchants/${a.id}/note`;
  const variant=`/API/AuTh/MeRcHaNtS/${a.id}/NoTe/?cursor=AbC`;
  await t.test('actual app preserves case-insensitive authorized routes and denies private administrative projection to other actors',async()=>{
    for(const path of [canonical,variant]){
      for(const actor of [owner,manager]){
        const result=await req(path,actor);assert.equal(result.status,200);assert.deepEqual(result.body,{ok:true,merchant_id:a.id,note:`private-note-${a.id}`});assert.equal(result.nosniff,'nosniff');
      }
      for(const [actor,status] of [[undefined,401],[a,401],[b,401],[denied,403]]){
        const result=await req(path,actor);assert.equal(result.status,status);assert.doesNotMatch(JSON.stringify(result.body),/private-note-|private-deletion-|password_hash|session_token/);
      }
    }
    const before=await snapshot();
    for(const path of ['/API/AUTH/ADMIN/CHANNELS/','/Api/Auth/Admin/Deletion-Requests/'])for(const [actor,status] of [[undefined,401],[a,401],[b,401],[denied,403]])assert.equal((await req(path,actor)).status,status);
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('app denies wrong device combined roles and forged legacy credentials without business changes',async()=>{
    const before=await snapshot();
    for(const [label,headers] of [
      ['wrong-device',{'X-Fawri-Device-Id':'wrong'}],
      ['combined-roles',{Cookie:`${owner.cookie}; ${a.cookie}`}],
      ['forged-legacy',{Cookie:'fawri_merchant_session=synthetic-invalid',Authorization:'Bearer synthetic-invalid'}],
    ]){
      const r=await req(variant,owner,'PUT',{note:'denied-change'},headers);assert.equal(r.status,401,label);
      if(label==='combined-roles')assert.equal(r.body.code,'ROLE_SESSION_CONFUSION');
      assert.deepEqual(await snapshot(),before,label);
    }
    assert.deepEqual(await snapshot(),before);
    assert.equal((await req(canonical,owner)).status,200);
  });
  await t.test('authorized mixed-case mutation uses path identity despite foreign query and body fields',async()=>{
    const peer=await management.getMerchantAdminNotePostgres(b.id);
    const result=await req(variant+`&merchant_id=${b.id}&adminId=${denied.id}`,manager,'PUT',{note:'full-app-authorized-edit',merchant_id:b.id,merchantId:b.id,adminId:denied.id});
    assert.equal(result.status,200);assert.equal(result.body.merchant_id,a.id);
    assert.equal((await req(canonical,owner)).body.note,'full-app-authorized-edit');
    assert.equal(await management.getMerchantAdminNotePostgres(b.id),peer);
    assert.equal((await admin.query('SELECT updated_by_admin_id FROM merchant_admin_notes WHERE merchant_id=$1',[a.id])).rows[0].updated_by_admin_id,manager.id);
  });
  await t.test('real app rejects retired security routes and unresolved legacy fallthrough while current route stays available',async()=>{
    const before=await snapshot();
    for(const path of ['/api/auth/admin/session/logout','/API/AuTh/AdMiN/SeSsIoN/LoGoUt/?returnTo=AbC']){
      for(const actor of [undefined,owner]){const r=await req(path,actor,'POST');assert.equal(r.status,410);assert.equal(r.body.code,'LEGACY_AUTH_ENDPOINT_DISABLED');}
      const bearer=await req(path,owner,'POST',undefined,{Authorization:'Bearer synthetic-invalid'});assert.equal(bearer.status,401);assert.equal(bearer.body.code,'LEGACY_ADMIN_BEARER_DISABLED');
    }
    for(const path of ['/api/auth/admin/unimplemented-private-probe','/API/AUTH/ADMIN/Unimplemented-Private-Probe/']){
      const r=await req(path,owner);assert.equal(r.status,410);assert.equal(r.body.code,'LEGACY_AUTH_ROUTE_RETIRED');assert.match(r.cache,/no-store/);assert.doesNotMatch(JSON.stringify(r.body),/private-note-|private-deletion-/);
    }
    assert.deepEqual(await snapshot(),before);assert.equal((await req(canonical,owner)).status,200);
  });
  await t.test('full app re-reads SQL permissions after revocation despite original assistant session claims',async()=>{
    await admin.query('DELETE FROM admin_permissions WHERE admin_id=$1',[manager.id]);const before=await snapshot();
    assert.equal((await req(variant,manager)).status,403);assert.equal((await req(variant,manager,'PUT',{note:'denied-after-permission-revoke'})).status,403);
    assert.deepEqual(await snapshot(),before);assert.equal((await req(canonical,owner)).status,200);
  });
  await t.test('full app rejects revoked SQL session and keeps independent owner positive without legacy JSON stores',async()=>{
    assert.equal(await auth.revokeSession(manager.session.token,'admin','logout'),true);const before=await snapshot();
    assert.equal((await req(variant,manager)).status,401);assert.deepEqual(await snapshot(),before);
    assert.equal((await req(`/api/auth/merchants/${b.id}/note`,owner)).body.note,`private-note-${b.id}`);
    assert.deepEqual(fs.readdirSync(process.env.FAWRI_DATA_DIR).filter(name=>name.endsWith('.json')),[]);
  });
  console.log('P0_MANAGEMENT_FULL_APP_HTTP '+JSON.stringify({actualApp:true,syntheticMerchants:2,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,caseVariants:true,pathIdentityPreserved:true,legacyFallthroughDenied:true,sqlPermissionAndSessionRevocation:true,legacyJsonCreated:false,fullEightTableMatrix:false,hostedAccepted:false}));
});
