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
  const channelManager=await actor('admin','assistant_admin',['manage_channels']);
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
  await t.test('provider cost owner-only HTTP contract preserves private fields and atomic audit',async t=>{
    const dimension='p0-http-'+randomUUID(),fault='provider_http_fault_'+randomUUID().replaceAll('-','');
    const providerTables=['provider_cost_rates','provider_cost_settings','provider_cost_audit_events'];
    const settingsBefore=(await admin.query("SELECT to_jsonb(t) AS row FROM provider_cost_settings t WHERE id='global'")).rows[0]?.row;
    const costSnapshot=async()=>Object.fromEntries(await Promise.all(providerTables.map(async table=>[table,(await admin.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows])));
    const body={provider_key:'synthetic-http',rate_usd:1.25,source_type:'owner_configured',source_reference:'private-provider-reference-'+dimension,notes:'private-provider-note-'+dimension,dimension_key:'p0_http_fixture',dimension_value:dimension,actor_account_id:manager.id,owner:true};
    const endpoints=[
      ['/api/auth/admin/provider-costs','GET',undefined],
      ['/api/auth/admin/provider-costs/rates/otp_message','PUT',body],
      ['/api/auth/admin/provider-costs/settings','PATCH',{monthly_budget_usd:123.45,actor_account_id:manager.id,owner:true}],
    ];
    let faultInstalled=false;
    try{
      await t.test('unauthenticated merchants and assistants cannot read or mutate provider cost configuration',async()=>{
        const before=await costSnapshot(),business=await snapshot();
        for(const [actor,status] of [[undefined,401],[a,401],[b,401],[manager,403],[viewer,403],[denied,403]]){
          for(const [path,method,body] of endpoints){
            const r=await req(path,actor,method,body);assert.equal(r.status,status,path);
            assert.doesNotMatch(JSON.stringify(r.body),/private-provider-|current_rates|monthly_budget_usd|source_reference/);
          }
        }
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:owner.cookie+'; '+a.cookie}]){
          for(const [path,method,body] of endpoints)assert.equal((await req(path,owner,method,body,headers)).status,401);
        }
        assert.deepEqual(await costSnapshot(),before);assert.deepEqual(await snapshot(),business);
      });
      await t.test('owner can set and read configuration with server-derived rate and audit attribution',async()=>{
        const before=await snapshot();
        const write=await req(endpoints[1][0],owner,'PUT',body);assert.equal(write.status,200);
        assert.equal(write.body.rate.rate_usd,1.25);assert.equal(write.body.rate.notes,body.notes);
        const budget=await req(endpoints[2][0],owner,'PATCH',endpoints[2][2]);assert.equal(budget.status,200);
        assert.equal(budget.body.settings.monthly_budget_usd,123.45);
        const read=await req('/API/Auth/Admin/Provider-Costs/?history_limit=200&owner=true',owner);assert.equal(read.status,200);assert.equal(read.cache,'no-store');
        const rate=read.body.configuration.history.find(r=>r.dimension_value===dimension);assert.ok(rate);
        assert.equal(rate.source_reference,body.source_reference);assert.equal(rate.notes,body.notes);
        assert.equal(read.body.configuration.monthly_budget_usd,123.45);
        assert.equal((await admin.query("SELECT created_by_account_id FROM provider_cost_rates WHERE dimension_key='p0_http_fixture' AND dimension_value=$1",[dimension])).rows[0].created_by_account_id,owner.id);
        const audits=(await admin.query('SELECT actor_account_id,action FROM provider_cost_audit_events WHERE actor_account_id=$1 ORDER BY action',[owner.id])).rows;
        assert.deepEqual(audits,[{actor_account_id:owner.id,action:'budget_updated'},{actor_account_id:owner.id,action:'rate_created'}]);
        assert.deepEqual(await snapshot(),before);
        const protectedCosts=await costSnapshot();
        for(const actor of [manager,viewer,denied]){
          const denied=await req('/API/Auth/Admin/Provider-Costs/?history_limit=200&owner=true',actor);assert.equal(denied.status,403);
          assert.doesNotMatch(JSON.stringify(denied.body),new RegExp(dimension));
        }
        assert.deepEqual(await costSnapshot(),protectedCosts);
      });
      await t.test('even the owner cannot label a manual rate as trusted provider automation',async()=>{
        const before=await costSnapshot();
        const r=await req(endpoints[1][0],owner,'PUT',{...body,source_type:'provider_api',rate_usd:99});
        assert.equal(r.status,403);assert.equal(r.body.code,'PROVIDER_COST_AUTOMATION_RESERVED');
        assert.deepEqual(await costSnapshot(),before);
      });
      await t.test('rate update rolls back if its audit write fails and a later real retry succeeds once',async()=>{
        const before=await costSnapshot(),business=await snapshot();
        await admin.query("CREATE FUNCTION public."+fault+"() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''synthetic provider cost audit persistence fault''; END'");faultInstalled=true;
        await admin.query('CREATE TRIGGER '+fault+' BEFORE INSERT ON provider_cost_audit_events FOR EACH ROW EXECUTE FUNCTION public.'+fault+'()');
        try{
          const r=await req(endpoints[1][0],owner,'PUT',{...body,rate_usd:2.5});
          assert.equal(r.status,503);assert.equal(r.body.code,'PROVIDER_COST_AUTHORITY_FAILED');
          assert.doesNotMatch(JSON.stringify(r.body),/persistence fault|password|DATABASE_URL/);
          assert.deepEqual(await costSnapshot(),before);assert.deepEqual(await snapshot(),business);
        }finally{
          await admin.query('DROP FUNCTION public.'+fault+'() CASCADE');faultInstalled=false;
        }
        const retry=await req(endpoints[1][0],owner,'PUT',{...body,rate_usd:2.5});assert.equal(retry.status,200);assert.equal(retry.body.rate.rate_usd,2.5);
        const audits=(await admin.query('SELECT action FROM provider_cost_audit_events WHERE actor_account_id=$1 ORDER BY action',[owner.id])).rows;
        assert.deepEqual(audits,[{action:'budget_updated'},{action:'rate_created'},{action:'rate_updated'}]);
        assert.deepEqual(await snapshot(),business);
      });
      await t.test('current SQL role removal denies the original owner session without relying on cached role claims',async()=>{
        const before=await costSnapshot();
        await admin.query("UPDATE admin_profiles SET role='assistant_admin' WHERE id=$1",[owner.id]);
        try{for(const [path,method,body] of endpoints)assert.equal((await req(path,owner,method,body)).status,403);}
        finally{await admin.query("UPDATE admin_profiles SET role='owner_admin' WHERE id=$1",[owner.id]);}
        assert.deepEqual(await costSnapshot(),before);
        assert.equal((await req(endpoints[0][0],owner)).status,200);
      });
    }finally{
      if(faultInstalled)await admin.query('DROP FUNCTION public.'+fault+'() CASCADE');
      await admin.query('DELETE FROM provider_cost_audit_events WHERE actor_account_id=$1',[owner.id]);
      await admin.query("DELETE FROM provider_cost_rates WHERE dimension_key='p0_http_fixture' AND dimension_value=$1",[dimension]);
      await admin.query("DELETE FROM provider_cost_settings WHERE id='global'");
      if(settingsBefore)await admin.query('INSERT INTO provider_cost_settings SELECT (jsonb_populate_record(NULL::provider_cost_settings,$1::jsonb)).*',[JSON.stringify(settingsBefore)]);
    }
  });
  await t.test('background job HTTP authority separates summaries from requeue and preserves atomic state',async t=>{
    const queue=await import('../src/services/postgresDurableJobQueue.ts');
    const key={id:'synthetic-admin-job-http-key',key:Buffer.alloc(32,37)};
    queue.configurePostgresDurableJobCredentialKeyProvider({current:()=>key,resolve:id=>id===key.id?key:null});
    const ownedJobs=[],privateMarkers=[],jobTables=['background_jobs','background_job_payloads','job_dead_letters','job_attempts'];
    const jobsSnapshot=async(selected=ownedJobs)=>Object.fromEntries(await Promise.all(jobTables.map(async table=>[table,(await admin.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE '+(table==='background_jobs'?'id':'job_id')+'=ANY($1::text[]) ORDER BY to_jsonb(t)::text',[selected])).rows])));
    async function seed(merchant,policy,queued=false){
      const marker='private-job-payload-'+randomUUID();privateMarkers.push(marker);
      const created=await queue.enqueueDurableJobAuthoritative({type:'p0.admin-http.synthetic',dedupeKey:'admin-http-'+randomUUID(),merchantId:merchant.id,payload:{body:marker,customer_reference:'private-job-customer-'+marker},maxAttempts:3});
      const id=created.job.id;ownedJobs.push(id);
      if(!queued){
        const result={channel_id:'synthetic-channel-'+id,status:'disconnected',...(policy===undefined?{}:{_fawri_requeue_policy:policy?'safe':'blocked'})};
        await admin.query("UPDATE background_jobs SET status='dead_letter',attempts=1,last_error_code='SYNTHETIC_ADMIN_HTTP',dead_lettered_at=now(),result=$2::jsonb WHERE id=$1",[id,JSON.stringify(result)]);
        // Trusted fixture state, not a worker execution or proof of provider failure.
        await admin.query("INSERT INTO job_dead_letters(id,job_id,occurrence,reason_code,attempts,payload_sha256,metadata) SELECT $1,id,1,'SYNTHETIC_ADMIN_HTTP',1,payload_hash,$3::jsonb FROM background_jobs WHERE id=$2",['dlq-'+randomUUID(),id,JSON.stringify(policy===undefined?{}:{requeue_safe:policy})]);
      }
      return {id,merchantId:merchant.id};
    }
    function noPayload(r){
      assert.equal(r.body.payloads_included,false);
      for(const marker of privateMarkers)assert.equal(JSON.stringify(r.body).includes(marker),false);
      assert.equal(JSON.stringify(r.body).includes('_fawri_requeue_policy'),false);
      for(const row of r.body.jobs||[r.body.job]){
        if(!row)continue;
        for(const field of ['payload','ciphertext','key_id','payload_hash'])assert.equal(Object.hasOwn(row,field),false);
      }
    }
    const list='/api/admin/background-jobs',url=job=>list+'/'+encodeURIComponent(job.id)+'/requeue';
    try{
      const own=await seed(a,true),peer=await seed(b,true),uncertain=await seed(a,false),unknown=await seed(b,undefined),queued=await seed(a,true,true),rollback=await seed(b,true);
      // Older safe history must not override a later uncertain dead-letter occurrence.
      await admin.query("UPDATE job_dead_letters SET metadata=$2::jsonb WHERE job_id=$1",[uncertain.id,JSON.stringify({requeue_safe:true})]);
      await admin.query("INSERT INTO job_dead_letters(id,job_id,occurrence,reason_code,attempts,payload_sha256,metadata) SELECT $1,id,2,'SYNTHETIC_UNCERTAIN',1,payload_hash,$3::jsonb FROM background_jobs WHERE id=$2",['dlq-'+randomUUID(),uncertain.id,JSON.stringify({requeue_safe:false})]);
      await t.test('owner and view_logs or manage_channels readers receive summaries without raw encrypted payload',async()=>{
        const before=await jobsSnapshot(),business=await snapshot();
        for(const actor of [owner,viewer,channelManager]){
          const r=await req(list+'?status=dead_letter&limit=500',actor);assert.equal(r.status,200);assert.equal(r.cache,'no-store');noPayload(r);
          for(const job of [own,peer,uncertain,unknown,rollback]){
            const row=r.body.jobs.find(x=>x.id===job.id);assert.ok(row);assert.equal(row.merchant_id,job.merchantId);
            assert.equal(row.status,'dead_letter');assert.equal(row.has_payload,true);assert.equal(row.has_result,true);
            assert.deepEqual(row.result,{channel_id:'synthetic-channel-'+job.id,status:'disconnected'});
          }
          assert.equal(r.body.jobs.some(x=>x.id===queued.id),false);
        }
        const limited=await req('/API/Admin/Background-Jobs/?status=dead_letter&limit=1',viewer);assert.equal(limited.status,200);assert.equal(limited.body.jobs.length,1);noPayload(limited);
        assert.deepEqual(await jobsSnapshot(),before);assert.deepEqual(await snapshot(),business);
      });
      await t.test('guest merchant and unprivileged assistant cannot read summaries and log-only reader cannot requeue',async()=>{
        const before=await jobsSnapshot(),business=await snapshot();
        for(const [actor,status] of [[undefined,401],[a,401],[b,401],[denied,403]]){
          for(const [path,method] of [[list,'GET'],[url(own),'POST']]){
            const r=await req(path,actor,method,method==='POST'?{manage_channels:true,requeue_safe:true}:undefined);assert.equal(r.status,status);
            for(const id of ownedJobs)assert.equal(JSON.stringify(r.body).includes(id),false);
          }
        }
        const readOnly=await req(url(own),viewer,'POST',{manage_channels:true,owner:true,requeue_safe:true});assert.equal(readOnly.status,403);assert.equal(readOnly.body.code,'ADMIN_PERMISSION_REQUIRED');
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:owner.cookie+'; '+a.cookie}]){
          assert.equal((await req(list,owner,'GET',undefined,headers)).status,401);
          assert.equal((await req(url(own),owner,'POST',{},headers)).status,401);
        }
        assert.deepEqual(await jobsSnapshot(),before);assert.deepEqual(await snapshot(),business);
      });
      await t.test('latest uncertain or absent requeue policy remains blocked despite caller claims',async()=>{
        const before=await jobsSnapshot();
        for(const job of [uncertain,unknown])for(const actor of [owner,channelManager]){
          const r=await req(url(job),actor,'POST',{requeue_safe:true,status:'queued',owner:true});assert.equal(r.status,409);assert.equal(r.body.code,'DURABLE_JOB_REQUEUE_BLOCKED');
          assert.doesNotMatch(JSON.stringify(r.body),/private-job-payload-|ciphertext/);
        }
        assert.deepEqual(await jobsSnapshot(),before);
      });
      await t.test('owner and manage_channels-only assistant requeue the selected safe job once without changing peers',async()=>{
        const business=await snapshot();
        for(const [job,actor,other] of [[own,owner,peer],[peer,channelManager,own]]){
          const unchanged=ownedJobs.filter(id=>id!==job.id),before=await jobsSnapshot(unchanged);
          const r=await req(url(job),actor,'POST',{job_id:other.id,merchant_id:other.merchantId});assert.equal(r.status,200);assert.equal(r.body.job.id,job.id);assert.equal(r.body.job.merchant_id,job.merchantId);assert.equal(r.body.job.status,'queued');noPayload(r);
          const row=(await admin.query('SELECT status,attempts,requeue_count FROM background_jobs WHERE id=$1',[job.id])).rows[0];assert.deepEqual(row,{status:'queued',attempts:0,requeue_count:1});
          assert.ok((await admin.query('SELECT requeued_at FROM job_dead_letters WHERE job_id=$1 ORDER BY occurrence DESC LIMIT 1',[job.id])).rows[0].requeued_at);
          assert.deepEqual(await jobsSnapshot(unchanged),before);
          const after=await jobsSnapshot();const retry=await req(url(job),actor,'POST',{});assert.equal(retry.status,400);assert.equal(retry.body.code,'DURABLE_JOB_REQUEUE_FAILED');assert.deepEqual(await jobsSnapshot(),after);
        }
        assert.deepEqual(await snapshot(),business);
      });
      await t.test('a non-dead-letter job is refused without changing its queued work or siblings',async()=>{
        const before=await jobsSnapshot();const r=await req(url(queued),channelManager,'POST',{});assert.equal(r.status,400);assert.equal(r.body.code,'DURABLE_JOB_REQUEUE_FAILED');assert.deepEqual(await jobsSnapshot(),before);
      });
      await t.test('payload hydration failure rolls back both job reset and dead-letter stamp then real retry succeeds',async()=>{
        const original=(await admin.query('SELECT ciphertext FROM background_job_payloads WHERE job_id=$1',[rollback.id])).rows[0].ciphertext;
        await admin.query("UPDATE background_job_payloads SET ciphertext='not-json' WHERE job_id=$1",[rollback.id]);
        try{
          const before=await jobsSnapshot(),business=await snapshot();
          const r=await req(url(rollback),owner,'POST',{});assert.equal(r.status,400);assert.equal(r.body.code,'DURABLE_JOB_PAYLOAD_INVALID');
          assert.doesNotMatch(JSON.stringify(r.body),/not-json|private-job-payload-|ciphertext/);
          assert.deepEqual(await jobsSnapshot(),before);assert.deepEqual(await snapshot(),business);
        }finally{await admin.query('UPDATE background_job_payloads SET ciphertext=$2 WHERE job_id=$1',[rollback.id,original]);}
        const otherBefore=await jobsSnapshot(ownedJobs.filter(id=>id!==rollback.id));
        const r=await req(url(rollback),owner,'POST',{});assert.equal(r.status,200);noPayload(r);
        assert.equal((await admin.query('SELECT requeue_count FROM background_jobs WHERE id=$1',[rollback.id])).rows[0].requeue_count,1);
        assert.deepEqual(await jobsSnapshot(ownedJobs.filter(id=>id!==rollback.id)),otherBefore);
      });
      await t.test('SQL permission removal overrides the original manage_channels session on both routes',async()=>{
        const before=await jobsSnapshot();await admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='manage_channels'",[channelManager.id]);
        try{
          assert.equal((await req(list,channelManager)).status,403);assert.equal((await req(url(uncertain),channelManager,'POST',{})).status,403);
        }finally{await admin.query("INSERT INTO admin_permissions(admin_id,permission) VALUES($1,'manage_channels')",[channelManager.id]);}
        assert.deepEqual(await jobsSnapshot(),before);assert.equal((await req(list,owner)).status,200);
      });
    }finally{
      await cleanupResources([
        ...['job_attempts','job_dead_letters','background_job_payloads'].map(table=>[table,()=>admin.query('DELETE FROM '+table+' WHERE job_id=ANY($1::text[])',[ownedJobs])]),
        ['background jobs',()=>admin.query('DELETE FROM background_jobs WHERE id=ANY($1::text[])',[ownedJobs])],
        ['fixture key provider',()=>queue.configurePostgresDurableJobCredentialKeyProvider(null)],
      ]);
    }
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
