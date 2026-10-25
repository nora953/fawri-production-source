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
  const tables=['merchant_admin_notes','merchant_channel_overrides','merchant_deletion_requests','audit_events','emergency_access_requests','merchant_channels'];
  let server,ownedIncidentLedger=false;
  t.after(()=>cleanupResources([
    ['HTTP',async()=>{if(server){server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e?no(e):ok()));}}],
    ['support runtime',async()=>{const m=await import('../src/services/postgresSupportRuntimeCutover.ts');await m.stopPostgresSupportRuntimeCutoverForTests();}],
    ['owned isolated incident ledger',()=>ownedIncidentLedger?admin.query("DELETE FROM audit_events WHERE entity_type='early_warning_incident'"):undefined],
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
  const viewer=await actor('admin','assistant_admin',['view_logs']);
  const healthViewer=await actor('admin','assistant_admin',['view_logs','view_merchants']);
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
  const incidentKeys=[...merchants.flatMap(id=>[`merchant-no-connected-channel:${id}`,`merchant-channel-errors:${id}`]),'channel-recent-errors'];
  const incidentSnapshot=async()=>(await admin.query("SELECT to_jsonb(t) AS row FROM audit_events t WHERE entity_type='early_warning_incident' AND entity_id=ANY($1::text[]) ORDER BY id",[incidentKeys])).rows;
  const historyKeys=['severity','area','code','value','runbook','scope','merchant_id','merchant_name','episode_id','incident_key','status','started_at','last_seen_at','resolved_at','duration_seconds'].sort();
  let fullEarlySnapshot;
  await t.test('actual early-warning owner path creates canonical scoped history and normalizes metadata with authorized merchant view',async()=>{
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_type='early_warning_incident'")).rows[0].n,0,'exclusive disposable history precondition');ownedIncidentLedger=true;
    const telemetry=await import('../src/observability/aiUsageTelemetry.ts');telemetry.resetAiUsageTelemetryForTests();t.after(()=>telemetry.resetAiUsageTelemetryForTests());
    for(const [i,merchant] of [a,b].entries()){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',store_name=$2 WHERE id=$1",[merchant.id,`private-early-store-${merchant.id}`]);
      await admin.query("INSERT INTO merchant_channels(id,merchant_id,platform,status,last_error_at,last_error_code) VALUES($1,$2,'messenger','pending',now(),'SYNTHETIC_FIELD_BOUNDARY')",[`early-channel-${randomUUID()}`,merchant.id]);
      telemetry.recordAiUsageTelemetry({merchantId:merchant.id,providerId:'synthetic-provider',model:'synthetic-model',latencyMs:10+i,usage:{inputTokens:10+i,outputTokens:3,totalTokens:13+i}});
    }
    const first=await req('/api/auth/admin/early-warning?window=1h',owner);assert.equal(first.status,200);assert.equal(first.cache,'no-store');
    const initial=first.body.snapshot;assert.equal(initial.incident_history_status,'available');assert.equal(initial.merchant_health_visible,true);
    for(const merchant of [a,b]){
      assert.ok(initial.merchants.some(row=>row.merchant_id===merchant.id));
      assert.ok(initial.incidents.some(row=>row.scope==='merchant'&&row.merchant_id===merchant.id));
      const history=initial.incident_history.filter(row=>row.scope==='merchant'&&row.merchant_id===merchant.id);assert.equal(history.length,2);
      for(const row of history){assert.deepEqual(Object.keys(row).sort(),historyKeys);assert.equal(row.status,'active');assert.equal(row.merchant_name,`private-early-store-${merchant.id}`);}
      assert.ok(initial.ai_runtime.merchants.some(row=>row.merchant_id===merchant.id&&row.calls===1));
    }
    assert.ok(initial.incident_history.some(row=>row.scope==='system'&&row.incident_key==='channel-recent-errors'));
    assert.equal(initial.ai_runtime.calls,2);assert.equal(initial.ai_runtime.total_tokens,27);
    await admin.query("UPDATE audit_events SET metadata=metadata||$2::jsonb WHERE entity_type='early_warning_incident' AND entity_id=ANY($1::text[])",[incidentKeys,JSON.stringify({synthetic_private:'bootstrap-only-extra',episode_id:'forged',status:'forged'})]);
    const before=await incidentSnapshot(),peer=await snapshot();
    const again=await req('/API/Auth/Admin/Early-Warning/?window=1h',healthViewer);assert.equal(again.status,200);fullEarlySnapshot=again.body.snapshot;
    assert.equal(fullEarlySnapshot.merchant_health_visible,true);
    for(const row of fullEarlySnapshot.incident_history.filter(row=>incidentKeys.includes(row.incident_key))){assert.deepEqual(Object.keys(row).sort(),historyKeys);assert.equal(row.status,'active');assert.notEqual(row.episode_id,'forged');}
    assert.doesNotMatch(JSON.stringify(fullEarlySnapshot),/bootstrap-only-extra/);
    assert.deepEqual(await incidentSnapshot(),before);assert.deepEqual(await snapshot(),peer);
  });
  await t.test('view_logs-only early-warning response omits merchant identity in every nested projection while retaining system history and aggregates',async()=>{
    const before=await incidentSnapshot(),peer=await snapshot();
    for(const path of ['/api/auth/admin/early-warning?window=1h','/API/Auth/Admin/Early-Warning/?window=1h&view_merchants=true&owner=true']){
      const r=await req(path,viewer);assert.equal(r.status,200);const value=r.body.snapshot;
      assert.equal(value.merchant_health_visible,false);assert.deepEqual(value.merchants,[]);
      assert.equal(value.incident_history_status,'available');assert.ok(value.incident_history.some(row=>row.scope==='system'&&row.incident_key==='channel-recent-errors'));
      assert.ok(value.incidents.every(row=>row.scope!=='merchant'));assert.ok(value.incident_history.every(row=>row.scope!=='merchant'));
      assert.equal(value.merchant_usage,null);if(value.cost_report)assert.deepEqual(value.cost_report.merchants,[]);
      console.log('P0_EARLY_WARNING_FIELD_OBSERVATION '+JSON.stringify({merchantHealthVisible:value.merchant_health_visible,merchantHistoryRows:value.incident_history.filter(row=>row.scope==='merchant').length,aiRuntimeMerchantRows:value.ai_runtime.merchants.length}));
      assert.deepEqual(value.ai_runtime.merchants,[],'view_merchants must protect nested per-merchant AI telemetry too');
      for(const merchant of [a,b])assert.equal(JSON.stringify(r.body).includes(merchant.id),false);
      const withoutRows=({merchants,...rest})=>rest;assert.deepEqual(withoutRows(value.ai_runtime),withoutRows(fullEarlySnapshot.ai_runtime));
    }
    assert.deepEqual(await incidentSnapshot(),before);assert.deepEqual(await snapshot(),peer);
  });
  await t.test('current SQL permissions override cached early-warning data and denied actors cannot mutate incident history',async()=>{
    await admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='view_merchants'",[healthViewer.id]);
    const before=await incidentSnapshot(),peer=await snapshot();
    const reduced=await req('/api/auth/admin/early-warning?window=1h',healthViewer);assert.equal(reduced.status,200);assert.equal(reduced.body.snapshot.merchant_health_visible,false);assert.deepEqual(reduced.body.snapshot.ai_runtime.merchants,[]);
    assert.ok(reduced.body.snapshot.incident_history.every(row=>row.scope!=='merchant'));
    await admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='view_logs'",[healthViewer.id]);
    for(const [actor,status,headers] of [[healthViewer,403,{}],[denied,403,{}],[undefined,401,{}],[a,401,{}],[b,401,{}],[owner,401,{'X-Fawri-Device-Id':'wrong'}],[owner,401,{Cookie:`${owner.cookie}; ${a.cookie}`}]]){
      const r=await req('/API/Auth/Admin/Early-Warning/?window=1h',actor,'GET',undefined,headers);assert.equal(r.status,status);assert.equal(JSON.stringify(r.body).includes(a.id),false);
    }
    assert.deepEqual(await incidentSnapshot(),before);assert.deepEqual(await snapshot(),peer);
    const own=await req('/api/auth/admin/early-warning?window=1h',owner);assert.equal(own.status,200);assert.equal(own.body.snapshot.ai_runtime.merchants.length,2);
  });
  const incidentReference=`synthetic-owner-only-${randomUUID()}`;
  let emergencyAuditRows=[],ordinaryLog;
  await t.test('owner-only emergency audit remains accessible to owner and denied to log-viewing assistants',async()=>{
    for(const merchant of [a,b]){
      const r=await req('/api/auth/admin/emergency-read-access/requests',owner,'POST',{merchant_id:merchant.id,incident_reference:incidentReference,reason:'Owned defensive fixture only',severity:'high',duration_minutes:15});
      assert.equal(r.status,201);assert.equal(r.body.request.merchant_id,merchant.id);
    }
    emergencyAuditRows=(await admin.query("SELECT * FROM audit_events WHERE merchant_id=ANY($1::text[]) AND entity_type='emergency_read_access' ORDER BY id",[merchants])).rows;
    assert.equal(emergencyAuditRows.length,4);assert.ok(emergencyAuditRows.every(row=>row.metadata.chain_payload && row.metadata.event_metadata));
    const before=await snapshot();
    const own=await req('/api/auth/admin/emergency-read-access/audit',owner);assert.equal(own.status,200);assert.equal(own.body.verification.valid,true);
    for(const row of emergencyAuditRows)assert.ok(own.body.events.some(event=>event.id===row.id));
    for(const actor of [viewer,manager,denied]){
      const r=await req('/API/Auth/Admin/Emergency-Read-Access/Audit/',actor);assert.equal(r.status,403);assert.equal(r.body.code,'OWNER_ADMIN_REQUIRED');
    }
    assert.deepEqual(await snapshot(),before);
    ordinaryLog=await req('/api/auth/admin/logs',manager,'POST',{merchant_id:a.id,action_type:'replies_added',details:'synthetic-ordinary-audit',reason:'synthetic-reason',meta:{numeric:7,label:'synthetic-business',nested:{must:'be-filtered'},flag:true}});
    assert.equal(ordinaryLog.status,201);assert.deepEqual(ordinaryLog.body.log.meta,{numeric:7,label:'synthetic-business'});
  });
  await t.test('general log endpoint cannot bypass owner-only emergency audit through alternate projection',async()=>{
    assert.equal(emergencyAuditRows.length,4);
    const before=await snapshot(),ids=new Set(emergencyAuditRows.map(row=>row.id));
    for(const path of ['/api/auth/admin/logs','/API/AuTh/AdMiN/LoGs/?includeEmergencyAudit=true&owner=true']){
      for(const actor of [viewer,manager]){
        const r=await req(path,actor);assert.equal(r.status,200);
        const exposed=r.body.logs.filter(row=>ids.has(row.id));
        console.log('P0_AUDIT_EMERGENCY_PROJECTION_OBSERVATION '+JSON.stringify({role:actor===viewer?'view_logs_only':'manager',dedicatedAuditDenied:true,emergencyRowsInGeneralLog:exposed.length,chainPayloadInResponse:JSON.stringify(exposed).includes('chain_payload')}));
        assert.equal(exposed.length,0,'general log assistant response must preserve owner-only emergency audit boundary');
        assert.doesNotMatch(JSON.stringify(r.body),new RegExp(incidentReference));
        assert.ok(r.body.logs.some(row=>row.id===ordinaryLog.body.log.id));
      }
      const own=await req(path,owner);assert.equal(own.status,200);
      for(const id of ids)assert.ok(own.body.logs.some(row=>row.id===id),'owner keeps existing authorized general log history');
    }
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('ordinary log metadata actor identity and current SQL permission checks survive emergency filtering',async()=>{
    const before=await snapshot();
    const r=await req('/api/auth/admin/logs',viewer);assert.equal(r.status,200);
    const row=r.body.logs.find(row=>row.id===ordinaryLog.body.log.id);assert.ok(row);
    assert.equal(row.admin_id,manager.id);assert.equal(row.admin_role,'assistant_admin');assert.equal(row.merchant_id,a.id);
    assert.equal(row.details,'synthetic-ordinary-audit');assert.equal(row.reason,'synthetic-reason');assert.deepEqual(row.meta,{numeric:7,label:'synthetic-business'});
    assert.equal(Object.hasOwn(row,'ip_address'),false);assert.equal(Object.hasOwn(row,'user_agent'),false);assert.equal(Object.hasOwn(row,'request_id'),false);
    for(const [actor,status] of [[undefined,401],[a,401],[b,401],[denied,403]])assert.equal((await req('/api/auth/admin/logs',actor)).status,status);
    assert.deepEqual(await snapshot(),before);
    await admin.query('DELETE FROM admin_permissions WHERE admin_id=$1',[viewer.id]);
    assert.equal((await req('/api/auth/admin/logs',viewer)).status,403);
    assert.equal((await req('/api/auth/admin/emergency-read-access/audit',viewer)).status,403);
    assert.deepEqual(await snapshot(),before);
    assert.equal((await req('/api/auth/admin/logs',owner)).status,200);
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
