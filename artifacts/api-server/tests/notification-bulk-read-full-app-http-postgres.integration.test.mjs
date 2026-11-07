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

test('actual app bulk notification read preserves tenant audience and replay boundaries', {timeout:120000}, async t => {
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
  for(const actor of [a,b])for(const suffix of ['live','expired','already-read','admin']){
    await admin.query("INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key,variables,read_at,expires_at) VALUES($1,$2,$3,$4,'synthetic_bulk','synthetic','synthetic',$5::jsonb,$6,$7)",[
      `${actor.id}-${suffix}`,suffix==='admin'?'admin':'merchant',actor.id,suffix==='admin'?owner.id:actor.id,
      JSON.stringify({sentinel:`private-bulk-${actor.id}-${suffix}`}),suffix==='already-read'?new Date(Date.now()-60000):null,suffix==='expired'?new Date(Date.now()-1000):null,
    ]);
  }
  const {default:app}=await import('../src/app.ts');
  ({stopPostgresSupportRuntimeCutoverForTests:stopSupport}=await import('../src/services/postgresSupportRuntimeCutover.ts'));await stopSupport();
  server=await new Promise((ok,no)=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));s.once('error',no);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const canonical='/api/auth/notifications/read-all',variant='/API/AuTh/NoTiFiCaTiOnS/ReAd-AlL/';
  async function req(path,actor,method='POST',body,headers={}){
    const r=await fetch(origin+path,{method,headers:{...(actor?{Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
  }
  const snapshot=async()=>(await admin.query('SELECT to_jsonb(n) AS row FROM notifications n WHERE merchant_id=ANY($1::text[]) ORDER BY id',[merchants])).rows;
  let deniedRequests=0;
  async function denied(path,actor,body,headers={}){
    const before=await snapshot(),r=await req(path,actor,'POST',body,headers);assert.equal(r.status,401);assert.doesNotMatch(JSON.stringify(r.body),/private-bulk-|sentinel/);assert.deepEqual(await snapshot(),before);deniedRequests++;return r;
  }
  function onlyExpectedRowsChanged(before,after,actor){
    assert.equal(after.length,before.length);
    const expected=new Set([`${actor.id}-live`,`${actor.id}-expired`]);
    for(let i=0;i<before.length;i++){
      const previous=before[i].row,current=after[i].row;
      if(expected.has(previous.id)){
        assert.equal(previous.read_at,null);assert.ok(current.read_at);
        assert.deepEqual({...current,read_at:null},previous);
      }else assert.deepEqual(current,previous);
    }
  }
  await t.test('valid owner and support assistant remain administrative actors and cannot bulk-read merchant audience',async()=>{
    for(const actor of [owner,assistant])assert.equal((await req('/api/auth/admin/me',actor,'GET')).status,200);
    assert.equal((await snapshot()).length,8);
    for(const path of [canonical,variant])for(const actor of [undefined,owner,assistant])await denied(path,actor,{merchant_id:a.id,account_id:owner.id,audience:'merchant'});
  });
  await t.test('wrong-device combined-role and forged-legacy requests cannot mutate any notification',async()=>{
    await denied(variant,a,undefined,{'X-Fawri-Device-Id':'wrong'});
    assert.equal((await denied(variant,a,undefined,{Cookie:`${a.cookie}; ${owner.cookie}`})).body.code,'ROLE_SESSION_CONFUSION');
    await denied(canonical,undefined,undefined,{Cookie:'fawri_merchant_session=synthetic-invalid',Authorization:'Bearer synthetic-invalid'});
  });
  await t.test('own bulk read ignores foreign hints and changes only own unread merchant rows including expired',async()=>{
    const before=await snapshot();
    const r=await req(`${canonical}?merchant_id=${b.id}&audience=admin&account_id=${owner.id}`,a,'POST',{merchantId:b.id,merchant_id:b.id,account_id:owner.id,audience:'admin'});
    assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,updated:2});assert.equal(r.cache,'no-store');
    onlyExpectedRowsChanged(before,await snapshot(),a);
    assert.deepEqual((await req('/api/auth/notifications?unread=1',a,'GET')).body.notifications,[]);
  });
  await t.test('mixed-case exact replay returns zero and preserves all existing read timestamps byte for byte',async()=>{
    const before=await snapshot();const r=await req(variant,a,'POST',{merchant_id:b.id});assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,updated:0});assert.deepEqual(await snapshot(),before);
  });
  await t.test('revoked merchant loses bulk access while peer can bulk-read its own rows and admin audience remains intact',async()=>{
    assert.equal(await auth.revokeSession(a.session.token,'merchant','logout'),true);
    for(const path of [canonical,variant])await denied(path,a);
    const before=await snapshot();const peer=await req(variant,b);assert.equal(peer.status,200);assert.deepEqual(peer.body,{ok:true,updated:2});onlyExpectedRowsChanged(before,await snapshot(),b);
    const after=await snapshot();assert.deepEqual((await req(canonical,b)).body,{ok:true,updated:0});assert.deepEqual(await snapshot(),after);
    assert.deepEqual(fs.readdirSync(process.env.FAWRI_DATA_DIR).filter(n=>n.endsWith('.json')),[]);
  });
  console.log('P0_NOTIFICATION_BULK_HTTP '+JSON.stringify({actualApp:true,actualSupportRoute:true,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,syntheticMerchants:2,syntheticAdminActors:2,syntheticNotifications:8,deniedRequests,expiredOwnUnreadIncluded:true,alreadyReadTimestampPreserved:true,peerAndAdminAudiencePreserved:true,replayUpdatedZero:true,revokedSessionDenied:true,rootLegacyJson:false,fieldCell:'RESIDUAL-FIELD-001',fullEightTableMatrix:false,hostedAccepted:false}));
});
