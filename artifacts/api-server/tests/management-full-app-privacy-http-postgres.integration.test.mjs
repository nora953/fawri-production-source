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
  const bootstrapUrl=process.env.DATABASE_URL;
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const ids=[],merchants=[],actors=[],settingsJobIds=[];
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
    ['owned settings jobs',()=>admin.query('DELETE FROM background_jobs WHERE id=ANY($1::text[])',[settingsJobIds])],
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

  await t.test('current admin self-session HTTP scope excludes peers and preserves other accounts',async sessionTest=>{
    // Own-security endpoints require a secure admin session, no business
    // permission. Existing unprivileged assistant remains the least-privilege
    // positive; existing viewer/owner/merchants supply independent peers.
    const self=denied,peer=viewer;
    const securitySnapshot=async()=>(
      await admin.query(`SELECT id,account_id,kind,tenant_id,status,token_hash,
        device_fingerprint_hash,session_version,security_version,role_snapshot,
        permission_snapshot,created_at,revoked_at,revoke_reason,replaced_by_session_id
        FROM account_sessions WHERE account_id=ANY($1::text[]) ORDER BY id`,[ids])
    ).rows;
    const peerSecurity=rows=>rows.filter(row=>row.account_id!==self.id);
    const selfRows=rows=>rows.filter(row=>row.account_id===self.id);
    const secondDevice='synthetic-admin-session-'+randomUUID();
    const record=await security.registerAdminDeviceAuthoritative({
      accountId:self.id,accountKind:'admin',deviceId:secondDevice,deviceLabel:'Synthetic second session',
    });
    await security.setAdminDeviceTrustAuthoritative({deviceRecordId:record.id,trusted:true,actorAccountId:owner.id});
    async function issue(device){
      const issued=await auth.issueSession({accountId:self.id,accountKind:'admin',tenantId:'fawri-admin',
        adminRole:'assistant_admin',deviceId:device,permissions:[]});
      return {...self,device,session:issued,cookie:ADMIN_SESSION_COOKIE+'='+issued.token};
    }
    let sibling=await issue(secondDevice);
    const businessBefore=await snapshot();
    await sessionTest.test('unprivileged admin lists only own active sessions without bearer material',async()=>{
      const before=await securitySnapshot();
      for(const [actor,status,headers] of [
        [undefined,401,{}],[a,401,{}],[b,401,{}],
        [self,401,{'X-Fawri-Device-Id':'synthetic-wrong-device'}],
        [self,401,{Cookie:self.cookie+'; '+a.cookie}],
        [self,401,{Cookie:ADMIN_SESSION_COOKIE+'=synthetic-invalid'}],
      ]){
        const r=await req('/api/auth/admin/sessions',actor,'GET',undefined,headers);
        assert.equal(r.status,status);assert.equal(r.body.sessions,undefined);
        assert.deepEqual(await securitySnapshot(),before);
      }
      for(const [actor,expected] of [[self,[self.session.session.id,sibling.session.session.id]],[peer,[peer.session.session.id]]]){
        const r=await req('/API/Auth/Admin/Sessions/?account_id='+owner.id+'&kind=merchant',actor);
        assert.equal(r.status,200);assert.deepEqual(new Set(r.body.sessions.map(x=>x.id)),new Set(expected));
        assert.ok(r.body.sessions.every(x=>x.account_id===actor.id&&x.account_kind==='admin'&&x.tenant_id==='fawri-admin'));
        assert.equal(JSON.stringify(r.body).includes('token_hash'),false);
        for(const token of [self.session.token,sibling.session.token,peer.session.token,owner.session.token,a.session.token,b.session.token]){
          assert.equal(JSON.stringify(r.body).includes(token),false);
        }
      }
      assert.deepEqual(await securitySnapshot(),before);
      assert.deepEqual(await snapshot(),businessBefore);
    });
    await sessionTest.test('foreign session deletion and denied own deletion preserve security state; selected own revoke applies once',async()=>{
      const before=await securitySnapshot();
      const foreign=await req('/api/auth/admin/sessions/'+peer.session.session.id,self,'DELETE',
        {account_id:peer.id,actorAccountId:owner.id,kind:'admin'});
      assert.equal(foreign.status,404);assert.equal(foreign.body.ok,false);
      assert.deepEqual(await securitySnapshot(),before);
      for(const [status,headers] of [
        [401,{'X-Fawri-Device-Id':'synthetic-wrong-device'}],
        [403,{Origin:'https://foreign.example.invalid'}],
      ]){
        const r=await req('/api/auth/admin/sessions/'+sibling.session.session.id,self,'DELETE',{},headers);
        assert.equal(r.status,status);
        if(status===403)assert.equal(r.body.code,'AUTH_ORIGIN_FORBIDDEN');
        assert.deepEqual(await securitySnapshot(),before);
      }
      const own=await req('/API/Auth/Admin/Sessions/'+sibling.session.session.id+'/?account_id='+peer.id,self,'DELETE',
        {account_id:peer.id,session_id:peer.session.session.id,actorAccountId:owner.id});
      assert.equal(own.status,200);assert.equal(own.body.ok,true);
      const after=await securitySnapshot();
      assert.deepEqual(peerSecurity(after),peerSecurity(before));
      const target=after.find(x=>x.id===sibling.session.session.id);
      assert.equal(target.status,'revoked');assert.equal(target.revoke_reason,'manual_revocation');
      assert.ok(target.revoked_at);
      assert.equal(after.find(x=>x.id===self.session.session.id).status,'active');
      const repeated=await req('/api/auth/admin/sessions/'+sibling.session.session.id,self,'DELETE');
      assert.equal(repeated.status,404);assert.equal(repeated.body.ok,false);
      assert.deepEqual(await securitySnapshot(),after);
      assert.equal((await req('/api/auth/admin/sessions',sibling)).status,401);
      assert.equal((await req('/api/auth/admin/sessions',self)).status,200);
      assert.equal((await req('/api/auth/admin/sessions',peer)).status,200);
      assert.deepEqual(await snapshot(),businessBefore);
    });
    await sessionTest.test('single admin logout revokes its cookie only and remains idempotent without clearing sibling or peers',async()=>{
      sibling=await issue(secondDevice);
      const before=await securitySnapshot();
      const logout=await req('/api/auth/admin/logout',self,'POST',
        {account_id:peer.id,token:peer.session.token},{Origin:'https://management.example.invalid'});
      assert.equal(logout.status,200);assert.equal(logout.body.ok,true);assert.match(logout.cache,/no-store/);
      const after=await securitySnapshot();assert.deepEqual(peerSecurity(after),peerSecurity(before));
      assert.equal(after.find(x=>x.id===self.session.session.id).status,'revoked');
      assert.equal(after.find(x=>x.id===self.session.session.id).revoke_reason,'logout');
      assert.equal(after.find(x=>x.id===sibling.session.session.id).status,'active');
      const repeat=await req('/api/auth/admin/logout',self,'POST');
      assert.equal(repeat.status,200);assert.equal(repeat.body.ok,true);
      assert.deepEqual(await securitySnapshot(),after);
      assert.equal((await req('/api/auth/admin/sessions',self)).status,401);
      assert.equal((await req('/api/auth/admin/sessions',sibling)).status,200);
      assert.equal((await req('/api/auth/admin/sessions',peer)).status,200);
      assert.deepEqual(await snapshot(),businessBefore);
    });
    await sessionTest.test('own logout-all requires current device and origin then revokes only the current admin account',async()=>{
      const restored=await issue(self.device);
      const before=await securitySnapshot();assert.equal(selfRows(before).filter(x=>x.status==='active').length,2);
      for(const [status,headers] of [
        [401,{'X-Fawri-Device-Id':'synthetic-wrong-device'}],
        [401,{Cookie:sibling.cookie+'; '+a.cookie}],
        [403,{Origin:'https://foreign.example.invalid'}],
      ]){
        const r=await req('/api/auth/admin/logout-all',sibling,'POST',{account_id:peer.id},headers);
        assert.equal(r.status,status);
        if(status===403)assert.equal(r.body.code,'AUTH_ORIGIN_FORBIDDEN');
        assert.deepEqual(await securitySnapshot(),before);
      }
      const logout=await req('/API/Auth/Admin/Logout-All/',sibling,'POST',
        {account_id:peer.id,session_id:peer.session.session.id,kind:'merchant'},{Origin:'https://management.example.invalid'});
      assert.equal(logout.status,200);assert.equal(logout.body.ok,true);assert.match(logout.cache,/no-store/);
      const after=await securitySnapshot();assert.deepEqual(peerSecurity(after),peerSecurity(before));
      assert.ok(selfRows(after).every(x=>x.status==='revoked'));
      const justRevoked=selfRows(after).filter(x=>[sibling.session.session.id,restored.session.session.id].includes(x.id));
      assert.equal(justRevoked.length,2);assert.ok(justRevoked.every(x=>x.revoke_reason==='logout_all'&&x.revoked_at));
      assert.equal((await req('/api/auth/admin/sessions',sibling)).status,401);
      assert.equal((await req('/api/auth/admin/sessions',restored)).status,401);
      assert.equal((await req('/api/auth/admin/sessions',peer)).status,200);
      assert.equal((await req('/api/auth/admin/me',owner)).status,200);
      assert.deepEqual(await securitySnapshot(),after);
      assert.deepEqual(await snapshot(),businessBefore);
    });
    console.log('P0_ADMIN_SELF_SESSION_HTTP '+JSON.stringify({
      actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,unprivilegedAssistantOwnSecurityAllowed:true,
      ownListing:true,rawTokenAndTokenHashExcluded:true,foreignRevokeDenied:true,selectedOwnRevokeOnce:true,
      singleLogoutPreservesSibling:true,logoutAllOnlyOwnAccount:true,deviceOriginAndMixedRoleDenials:true,
      selectedSessionSecurityColumnsPreserved:true,sessionHeartbeatAndIdleExpiryExcluded:true,businessAndPeersPreserved:true,
      loginOtpOrDelegatedOwnerDeviceWorkflowAccepted:false,hosted:false
    }));
  });

  await t.test('owner delegated session and global admin device HTTP boundaries use current SQL scope',async ownerTest=>{
    // This fills current full-app/restricted-role integration gaps. Historical
    // aggregate Authv2 lifecycle and JSON work-monitor proofs remain separate.
    const target=await actor('admin','assistant_admin',[]);
    const peer=await actor('admin','assistant_admin',[]);
    const {hashPassword}=await import('../src/services/authPasswordService.ts');
    const ownerPassword='SyntheticOwnerSession9@';
    await admin.query('UPDATE accounts SET password_hash=$2 WHERE id=$1',[owner.id,hashPassword(ownerPassword)]);
    async function register(account,device){
      return security.registerAdminDeviceAuthoritative({accountId:account.id,accountKind:'admin',deviceId:device,deviceLabel:'Synthetic delegated '+device});
    }
    const firstDevice=await register(target,target.device);
    const secondId='synthetic-delegated-second-'+randomUUID();
    const secondDevice=await register(target,secondId);
    const peerDevice=await register(peer,peer.device);
    for(const device of [firstDevice,secondDevice,peerDevice]){
      await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
    }
    const pending=await register(target,'synthetic-delegated-third-'+randomUUID());
    async function issue(account,device){
      const issued=await auth.issueSession({accountId:account.id,accountKind:'admin',tenantId:'fawri-admin',
        adminRole:'assistant_admin',deviceId:device,permissions:[]});
      return {...account,device,session:issued,cookie:ADMIN_SESSION_COOKIE+'='+issued.token};
    }
    let first=await issue(target,target.device),second=await issue(target,secondId);
    const other=await issue(peer,peer.device);
    const state=async()=>({
      sessions:(await admin.query('SELECT id,account_id,kind,tenant_id,status,token_hash,device_fingerprint_hash,session_version,security_version,role_snapshot,permission_snapshot,created_at,revoked_at,revoke_reason,replaced_by_session_id FROM account_sessions WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows,
      devices:(await admin.query('SELECT to_jsonb(d) AS row FROM trusted_devices d WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows,
    });
    const base='/api/auth/admins/'+target.id;
    const deviceBase='/api/auth/admin/devices';
    const business=await snapshot();
    function assertRevoke(before,after,selected,reason,{deviceMutation=false}={}){
      if(!deviceMutation)assert.deepEqual(after.devices,before.devices);
      assert.deepEqual(after.sessions.filter(x=>!selected.includes(x.id)),before.sessions.filter(x=>!selected.includes(x.id)));
      for(const id of selected){
        const old=before.sessions.find(x=>x.id===id),now=after.sessions.find(x=>x.id===id);
        assert.equal(old.status,'active');assert.equal(now.status,'revoked');
        assert.equal(now.revoke_reason,reason);assert.ok(now.revoked_at);
        assert.deepEqual({...now,status:old.status,revoked_at:old.revoked_at,revoke_reason:old.revoke_reason},old);
      }
    }
    async function assertAudit(type){
      const rows=(await admin.query('SELECT actor_account_id,actor_kind,subject_hash FROM auth_audit_events WHERE actor_account_id=$1 AND event_type=$2',[owner.id,type])).rows;
      assert.ok(rows.length>0);assert.ok(rows.every(x=>x.actor_account_id===owner.id&&x.actor_kind==='admin'));
      assert.ok(rows.every(x=>x.subject_hash&&x.subject_hash!==target.id));
    }
    await ownerTest.test('only current owner may access delegated session and global device routes',async()=>{
      const before=await state();
      const routes=[
        [base+'/sessions/'+first.session.session.id+'/revoke','POST'],
        [base+'/sessions/revoke-all','POST'],[base+'/logout-all','POST'],
        [deviceBase,'GET'],[deviceBase+'/'+pending.id+'/trust','POST'],
        [deviceBase+'/'+firstDevice.id+'/revoke','POST'],
      ];
      for(const [path,method] of routes){
        for(const [actor,status] of [[undefined,401],[a,401],[b,401],[other,403],[viewer,403]]){
          const r=await req(path,actor,method,method==='POST'?{owner:true,owner_password:ownerPassword,actor_account_id:owner.id}:undefined);
          assert.equal(r.status,status,path);assert.equal(r.body.devices,undefined);assert.equal(r.body.revoked_count,undefined);
        }
        for(const headers of [{'X-Fawri-Device-Id':'synthetic-wrong-device'},{Cookie:owner.cookie+'; '+a.cookie}]){
          assert.equal((await req(path,owner,method,method==='POST'?{owner_password:ownerPassword}:undefined,headers)).status,401);
        }
        if(method==='POST'){
          const r=await req(path,owner,method,{owner_password:ownerPassword},{Origin:'https://foreign.example.invalid'});
          assert.equal(r.status,403);assert.equal(r.body.code,'AUTH_ORIGIN_FORBIDDEN');
        }
      }
      for(const suffix of ['/sessions/'+first.session.session.id+'/revoke','/sessions/revoke-all','/logout-all']){
        const r=await req('/api/auth/admins/'+owner.id+suffix,owner,'POST',{owner_password:ownerPassword});
        assert.equal(r.status,404);assert.equal(r.body.code,'ASSISTANT_ADMIN_NOT_FOUND');
      }
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
    });
    await ownerTest.test('delegated selected revoke requires owner password and path account membership',async()=>{
      const before=await state(),path=base+'/sessions/'+first.session.session.id+'/revoke';
      for(const body of [{},{owner_password:'synthetic-wrong-password'}]){
        const r=await req(path,owner,'POST',body);assert.equal(r.status,401);assert.equal(r.body.code,'OWNER_PASSWORD_INCORRECT');
        assert.deepEqual(await state(),before);
      }
      const foreign=await req(base+'/sessions/'+other.session.session.id+'/revoke',owner,'POST',{owner_password:ownerPassword});
      assert.equal(foreign.status,404);assert.equal(foreign.body.code,'SESSION_NOT_FOUND');assert.deepEqual(await state(),before);
      const r=await req('/API/Auth/Admins/'+target.id+'/Sessions/'+first.session.session.id+'/Revoke/?account_id='+peer.id,owner,'POST',
        {owner_password:ownerPassword,account_id:peer.id,session_id:other.session.session.id,actor_account_id:peer.id});
      assert.equal(r.status,200);assert.equal(r.body.ok,true);
      const after=await state();assertRevoke(before,after,[first.session.session.id],'manual_revocation');
      assert.equal((await req(path,owner,'POST',{owner_password:ownerPassword})).status,404);
      assert.deepEqual(await state(),after);
      assert.equal((await req('/api/auth/admin/me',first)).status,401);
      for(const live of [second,other,owner])assert.equal((await req('/api/auth/admin/me',live)).status,200);
      await assertAudit('assistant_session_revoked');assert.deepEqual(await snapshot(),business);
    });
    await ownerTest.test('delegated revoke-all requires password and affects only the selected assistant once',async()=>{
      first=await issue(target,target.device);
      const before=await state(),path=base+'/sessions/revoke-all';
      for(const body of [{},{owner_password:'synthetic-wrong-password'}]){
        const r=await req(path,owner,'POST',body);assert.equal(r.status,401);assert.equal(r.body.code,'OWNER_PASSWORD_INCORRECT');
        assert.deepEqual(await state(),before);
      }
      const r=await req(path+'?account_id='+peer.id,owner,'POST',
        {owner_password:ownerPassword,account_id:peer.id,actor_account_id:peer.id});
      assert.equal(r.status,200);assert.equal(r.body.revoked_count,2);
      const after=await state();assertRevoke(before,after,[first.session.session.id,second.session.session.id],'manual_revocation');
      const repeat=await req(path,owner,'POST',{owner_password:ownerPassword});assert.equal(repeat.status,200);assert.equal(repeat.body.revoked_count,0);
      assert.deepEqual(await state(),after);
      for(const dead of [first,second])assert.equal((await req('/api/auth/admin/me',dead)).status,401);
      for(const live of [other,owner])assert.equal((await req('/api/auth/admin/me',live)).status,200);
      await assertAudit('assistant_sessions_revoked');assert.deepEqual(await snapshot(),business);
    });
    await ownerTest.test('delegated logout-all preserves its existing owner-session policy and selected assistant scope',async()=>{
      first=await issue(target,target.device);second=await issue(target,secondId);
      const before=await state();
      // This existing route requires the secure owner session, unlike the
      // separate password-confirmed work-monitor revoke-all action.
      const r=await req('/API/Auth/Admins/'+target.id+'/Logout-All/?account_id='+peer.id,owner,'POST',
        {account_id:peer.id,session_id:other.session.session.id,actor_account_id:peer.id});
      assert.equal(r.status,200);assert.equal(r.body.revoked_count,2);
      const after=await state();assertRevoke(before,after,[first.session.session.id,second.session.session.id],'manual_revocation');
      for(const dead of [first,second])assert.equal((await req('/api/auth/admin/me',dead)).status,401);
      for(const live of [other,owner])assert.equal((await req('/api/auth/admin/me',live)).status,200);
      await assertAudit('assistant_admin_sessions_revoked');assert.deepEqual(await snapshot(),business);
    });
    await ownerTest.test('owner global device list exposes current summaries without fingerprint or bearer material',async()=>{
      const before=await state();
      const r=await req('/API/Auth/Admin/Devices/?account_id='+peer.id,owner);assert.equal(r.status,200);
      const owned=r.body.devices.filter(x=>ids.includes(x.account_id));
      assert.deepEqual(new Set(owned.map(x=>x.id)),new Set(before.devices.map(x=>x.row.id)));
      assert.ok(owned.every(x=>x.account_kind==='admin'));
      for(const row of owned){
        assert.deepEqual(Object.keys(row).sort(),['id','account_id','account_kind','label','status','created_at','last_seen_at',
          ...(row.trusted_at?['trusted_at']:[]),...(row.trusted_by?['trusted_by']:[]),...(row.revoked_at?['revoked_at']:[])].sort());
      }
      const serialized=JSON.stringify(r.body);
      assert.doesNotMatch(serialized,/device_hash|device_fingerprint_hash|token_hash|password_hash/);
      for(const session of [first,second,other,owner])assert.equal(serialized.includes(session.session.token),false);
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
    });
    await ownerTest.test('global trust limit failure preserves state and existing device trust uses server actor',async()=>{
      const before=await state();
      const r=await req(deviceBase+'/'+pending.id+'/trust',owner,'POST',{account_id:peer.id,actor_account_id:peer.id});
      assert.equal(r.status,409);assert.equal(r.body.code,'TRUSTED_DEVICE_LIMIT_REACHED');assert.deepEqual(await state(),before);
      const missing=await req(deviceBase+'/'+randomUUID()+'/trust',owner,'POST');assert.equal(missing.status,404);
      assert.deepEqual(await state(),before);
      const same=await req(deviceBase+'/'+secondDevice.id+'/trust',owner,'POST',{actor_account_id:peer.id});
      assert.equal(same.status,200);
      const after=await state();assert.deepEqual(after.sessions,before.sessions);
      assert.deepEqual(after.devices.filter(x=>x.row.id!==secondDevice.id),before.devices.filter(x=>x.row.id!==secondDevice.id));
      const row=after.devices.find(x=>x.row.id===secondDevice.id).row;
      assert.equal(row.status,'trusted');assert.equal(row.trusted_by_account_id,owner.id);
      assert.equal(after.devices.filter(x=>x.row.account_id===target.id&&x.row.status==='trusted').length,2);
      assert.deepEqual(await snapshot(),business);
    });
    await ownerTest.test('global device revoke invalidates only that device and freed trust slot accepts pending device',async()=>{
      first=await issue(target,target.device);second=await issue(target,secondId);
      const before=await state();
      const r=await req('/API/Auth/Admin/Devices/'+firstDevice.id+'/Revoke/?account_id='+peer.id,owner,'POST',
        {deviceRecordId:peerDevice.id,account_id:peer.id,actor_account_id:peer.id});
      assert.equal(r.status,200);assert.equal(r.body.ok,true);
      const after=await state();
      assertRevoke(before,after,[first.session.session.id],'device_revoked',{deviceMutation:true});
      assert.deepEqual(after.devices.filter(x=>x.row.id!==firstDevice.id),before.devices.filter(x=>x.row.id!==firstDevice.id));
      const revoked=after.devices.find(x=>x.row.id===firstDevice.id).row;
      assert.equal(revoked.status,'revoked');assert.equal(revoked.trust_slot,null);
      assert.equal(revoked.trusted_by_account_id,null);assert.equal(revoked.revoked_by_account_id,owner.id);assert.ok(revoked.revoked_at);
      assert.equal((await req('/api/auth/admin/me',first)).status,401);
      for(const live of [second,other,owner])assert.equal((await req('/api/auth/admin/me',live)).status,200);
      const trusted=await req(deviceBase+'/'+pending.id+'/trust',owner,'POST',{actor_account_id:peer.id});
      assert.equal(trusted.status,200);const final=await state();
      assert.deepEqual(final.sessions,after.sessions);
      assert.deepEqual(final.devices.filter(x=>x.row.id!==pending.id),after.devices.filter(x=>x.row.id!==pending.id));
      const pendingNow=final.devices.find(x=>x.row.id===pending.id).row;
      assert.equal(pendingNow.status,'trusted');assert.equal(pendingNow.trusted_by_account_id,owner.id);
      assert.equal(final.devices.filter(x=>x.row.account_id===target.id&&x.row.status==='trusted').length,2);
      assert.deepEqual(await snapshot(),business);
    });
    console.log('P0_OWNER_ADMIN_SECURITY_HTTP '+JSON.stringify({
      actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,ownerOnlySixRoutes:true,
      delegatedSelectedAccountMembership:true,passwordConfirmedRevokeActions:true,existingLogoutAllPolicyPreserved:true,
      ownerTargetDenied:true,serverActorAudit:true,globalDeviceSummaryFields:true,deviceFingerprintExcluded:true,
      trustedDeviceLimitRollback:true,selectedDeviceRevokeKeepsSibling:true,peerSecurityAndBusinessPreserved:true,
      sessionHeartbeatAndIdleExpiryExcluded:true,loginOtpAndCrossTransactionFaultAtomicityAccepted:false,hosted:false
    }));
  });

  await t.test('admin account projections and owner password reset preserve current SQL privacy boundaries',async accountTest=>{
    const target=await actor('admin','assistant_admin',['view_merchants']);
    const peer=await actor('admin','assistant_admin',[]);
    const {hashPassword,verifyPassword}=await import('../src/services/authPasswordService.ts');
    const ownerPassword='SyntheticProjectionOwner9@',oldPassword='SyntheticTargetBefore9@',temporary='SyntheticTargetReset9@';
    await admin.query('UPDATE accounts SET password_hash=$2 WHERE id=$1',[owner.id,hashPassword(ownerPassword)]);
    await admin.query('UPDATE accounts SET password_hash=$2 WHERE id=$1',[target.id,hashPassword(oldPassword)]);
    async function trusted(account,deviceId){
      const device=await security.registerAdminDeviceAuthoritative({accountId:account.id,accountKind:'admin',deviceId,deviceLabel:'Synthetic projection '+deviceId});
      await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
      return device;
    }
    const secondId='synthetic-projection-second-'+randomUUID();
    const firstDevice=await trusted(target,target.device),secondDevice=await trusted(target,secondId);
    await trusted(peer,peer.device);
    async function issue(account,device){
      const session=await auth.issueSession({accountId:account.id,accountKind:'admin',tenantId:'fawri-admin',
        adminRole:'assistant_admin',permissions:account.permissions,deviceId:device});
      return {...account,device,session,cookie:ADMIN_SESSION_COOKIE+'='+session.token};
    }
    const first=await issue(target,target.device),second=await issue(target,secondId),other=await issue(peer,peer.device);
    const state=async()=>({
      accounts:(await admin.query('SELECT id,kind,phone,password_hash,state,password_version,security_version,session_version,password_changed_at FROM accounts WHERE id=ANY($1::text[]) ORDER BY id',[ids])).rows,
      profiles:(await admin.query('SELECT id,account_id,display_name,role,enabled,must_change_password FROM admin_profiles WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows,
      permissions:(await admin.query('SELECT admin_id,permission,granted_by_admin_id FROM admin_permissions WHERE admin_id=ANY($1::text[]) ORDER BY admin_id,permission',[ids])).rows,
      sessions:(await admin.query('SELECT id,account_id,kind,tenant_id,status,token_hash,device_fingerprint_hash,session_version,security_version,role_snapshot,permission_snapshot,created_at,revoked_at,revoke_reason,replaced_by_session_id FROM account_sessions WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows,
      devices:(await admin.query('SELECT to_jsonb(d) AS row FROM trusted_devices d WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows,
    });
    const base='/api/auth/admins/'+target.id,business=await snapshot();
    const resetBody={owner_password:ownerPassword,temporary_password:temporary,confirm_temporary_password:temporary};
    await accountTest.test('account lifecycle and projection routes deny non-owner actors and invalid owner credentials without selected state changes',async()=>{
      const before=await state();
      const routes=[
        ['/api/auth/admins','GET',undefined],
        [base+'/work-monitor','GET',undefined],
        ['/api/auth/admins','POST',{owner_name:'Synthetic rejected',phone:'+198'+randomInt(100000000,999999999),password:temporary,confirm_password:temporary,language:'en'}],
        [base+'/enabled','PATCH',{enabled:false}],
        [base+'/permissions','PATCH',{permissions:['manage_channels']}],
        [base+'/password','PATCH',resetBody],
      ];
      for(const [path,method,body] of routes){
        for(const [actor,status] of [[undefined,401],[a,401],[b,401],[first,403],[other,403]]){
          const r=await req(path,actor,method,body);assert.equal(r.status,status,path);
          assert.equal(r.body.admins,undefined);assert.equal(r.body.sessions,undefined);assert.equal(r.body.admin,undefined);
        }
        for(const headers of [{'X-Fawri-Device-Id':'synthetic-wrong-device'},{Cookie:owner.cookie+'; '+a.cookie}]){
          assert.equal((await req(path,owner,method,body,headers)).status,401);
        }
        if(method!=='GET'){
          const r=await req(path,owner,method,body,{Origin:'https://foreign.example.invalid'});
          assert.equal(r.status,403);assert.equal(r.body.code,'AUTH_ORIGIN_FORBIDDEN');
        }
      }
      for(const [suffix,body] of [['/enabled',{enabled:false}],['/permissions',{permissions:[]}],['/password',resetBody]]){
        const r=await req('/api/auth/admins/'+owner.id+suffix,owner,'PATCH',body);
        assert.equal(r.status,404);assert.equal(r.body.code,'ASSISTANT_ADMIN_NOT_FOUND');
      }
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
    });
    await accountTest.test('owner directory and work monitor expose only current declared summaries and target session device log projections',async()=>{
      const ownEvent='synthetic_projection_target_'+randomUUID(),foreignEvent='synthetic_projection_peer_'+randomUUID();
      await security.auditAdminSecurityEventAuthoritative({event_type:ownEvent,actor_account_id:owner.id,actor_kind:'admin',subject_hash:target.id});
      await security.auditAdminSecurityEventAuthoritative({event_type:foreignEvent,actor_account_id:owner.id,actor_kind:'admin',subject_hash:peer.id});
      const before=await state();
      const directory=await req('/API/Auth/Admins/?account_id='+peer.id,owner);assert.equal(directory.status,200);
      assert.deepEqual(Object.keys(directory.body).sort(),['admins','ok']);
      const owned=directory.body.admins.filter(x=>ids.includes(x.account.id));
      assert.deepEqual(new Set(owned.map(x=>x.account.id)),new Set(before.profiles.map(x=>x.account_id)));
      const compatibility=['id','owner_name','store_name','phone','activity_type','status','language','created_at','is_admin','admin_role','permissions','admin_enabled','otp_verified','must_change_password'];
      for(const row of owned){
        assert.deepEqual(Object.keys(row).sort(),[...compatibility,'account','account_type','admin_profile','admin','work_status','open_session_count','last_activity_at','pending_device_count'].sort());
        assert.deepEqual(Object.keys(row.account).sort(),['id','phone','kind','enabled','otp_verified'].sort());
        assert.deepEqual(Object.keys(row.admin_profile).sort(),['adminId','role','permissions','displayName','language','createdAt','mustChangePassword'].sort());
        assert.deepEqual(Object.keys(row.admin).sort(),compatibility.sort());
        assert.equal(row.account.id,row.id);assert.equal(row.admin_profile.adminId,row.id);assert.equal(row.admin.id,row.id);
      }
      const row=owned.find(x=>x.id===target.id);assert.ok(row);
      assert.equal(row.admin_role,'assistant_admin');assert.deepEqual(row.permissions,['view_merchants']);
      assert.equal(row.open_session_count,2);assert.equal(row.pending_device_count,0);assert.equal(row.must_change_password,false);
      const monitor=await req('/API/Auth/Admins/'+target.id+'/Work-Monitor/?account_id='+peer.id+'&adminId='+peer.id,owner);
      assert.equal(monitor.status,200);
      const value=monitor.body;
      assert.deepEqual(Object.keys(value).sort(),['ok','admin','summary','sessions','devices','failed_logins','recent_logs'].sort());
      assert.deepEqual(Object.keys(value.admin).sort(),['id','owner_name','phone','admin_enabled'].sort());assert.equal(value.admin.id,target.id);
      assert.deepEqual(Object.keys(value.summary).sort(),['work_status','open_session_count','last_activity_at','pending_device_count','session_limit','trusted_device_limit','trusted_device_count','failed_login_count_24h'].sort());
      assert.equal(value.summary.open_session_count,2);assert.equal(value.summary.trusted_device_count,2);assert.equal(value.summary.pending_device_count,0);
      assert.deepEqual(new Set(value.sessions.map(x=>x.id)),new Set([first.session.session.id,second.session.session.id]));
      for(const session of value.sessions){
        assert.deepEqual(Object.keys(session).sort(),['id','device_id','device_label','user_agent','created_at','last_seen_at','last_activity_at','expires_at'].sort());
        assert.equal(session.device_id,session.id);
      }
      assert.deepEqual(new Set(value.devices.map(x=>x.id)),new Set([firstDevice.id,secondDevice.id]));
      for(const device of value.devices)assert.deepEqual(Object.keys(device).sort(),['id','device_id','device_label','user_agent','status','first_seen_at','last_seen_at','trusted_at'].sort());
      assert.ok(value.recent_logs.some(x=>x.action_type===ownEvent));assert.ok(!value.recent_logs.some(x=>x.action_type===foreignEvent));
      for(const log of value.recent_logs){assert.deepEqual(Object.keys(log).sort(),['id','action_type','details','created_at'].sort());assert.equal(log.details,log.action_type);}
      assert.deepEqual(value.failed_logins,[]); // Existing stub contract, not accuracy acceptance.
      for(const body of [directory.body,value]){
        const encoded=JSON.stringify(body);assert.doesNotMatch(encoded,/password_hash|passwordHash|token_hash|device_hash|device_fingerprint_hash|subject_hash/);
        for(const session of [first,second,other,owner])assert.equal(encoded.includes(session.session.token),false);
        assert.equal(encoded.includes(ownEvent)&&body===directory.body,false);
      }
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
    });
    await accountTest.test('owner password reset validation preserves hash versions flags sessions devices and peer state',async()=>{
      const before=await state();
      for(const [body,status,code] of [
        [{...resetBody,owner_password:'synthetic-wrong-password'},401,'OWNER_PASSWORD_INCORRECT'],
        [{...resetBody,confirm_temporary_password:'SyntheticMismatch9@'},400,'PASSWORD_CONFIRMATION_INVALID'],
        [{...resetBody,temporary_password:'Aa1',confirm_temporary_password:'Aa1'},400,'PASSWORD_TOO_SHORT'],
      ]){
        const r=await req(base+'/password',owner,'PATCH',body);assert.equal(r.status,status);assert.equal(r.body.code,code);
        assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
      }
    });
    await accountTest.test('valid owner reset binds path assistant increments versions and invalidates both target cookies only',async()=>{
      const before=await state();
      const r=await req('/API/Auth/Admins/'+target.id+'/Password/?account_id='+peer.id,owner,'PATCH',
        {...resetBody,account_id:peer.id,adminId:peer.id,actor_account_id:peer.id,mustChangePassword:false,permissions:['manage_channels']});
      assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,reauthentication_required:true});
      const after=await state(),old=before.accounts.find(x=>x.id===target.id),changed=after.accounts.find(x=>x.id===target.id);
      assert.ok(verifyPassword(temporary,changed.password_hash));assert.equal(verifyPassword(oldPassword,changed.password_hash),false);
      for(const key of ['password_version','security_version','session_version'])assert.equal(changed[key],old[key]+1);
      assert.ok(changed.password_changed_at);
      assert.deepEqual({...changed,password_hash:old.password_hash,password_version:old.password_version,security_version:old.security_version,session_version:old.session_version,password_changed_at:old.password_changed_at},old);
      assert.deepEqual(after.accounts.filter(x=>x.id!==target.id),before.accounts.filter(x=>x.id!==target.id));
      const profile=after.profiles.find(x=>x.account_id===target.id),oldProfile=before.profiles.find(x=>x.account_id===target.id);
      assert.equal(profile.must_change_password,true);assert.deepEqual({...profile,must_change_password:oldProfile.must_change_password},oldProfile);
      assert.deepEqual(after.profiles.filter(x=>x.account_id!==target.id),before.profiles.filter(x=>x.account_id!==target.id));
      assert.deepEqual(after.permissions,before.permissions);assert.deepEqual(after.devices,before.devices);
      const selected=[first.session.session.id,second.session.session.id];
      assert.deepEqual(after.sessions.filter(x=>!selected.includes(x.id)),before.sessions.filter(x=>!selected.includes(x.id)));
      for(const id of selected){
        const prior=before.sessions.find(x=>x.id===id),next=after.sessions.find(x=>x.id===id);
        assert.equal(next.status,'revoked');assert.equal(next.revoke_reason,'password_reset');assert.ok(next.revoked_at);
        assert.deepEqual({...next,status:prior.status,revoke_reason:prior.revoke_reason,revoked_at:prior.revoked_at},prior);
      }
      for(const session of [first,second])assert.equal((await req('/api/auth/admin/me',session)).status,401);
      for(const session of [other,owner])assert.equal((await req('/api/auth/admin/me',session)).status,200);
      const audit=(await admin.query("SELECT actor_account_id,actor_kind,reason_code FROM auth_audit_events WHERE actor_account_id=$1 AND event_type='assistant_admin_password_reset'",[owner.id])).rows;
      assert.ok(audit.some(x=>x.actor_account_id===owner.id&&x.actor_kind==='admin'&&x.reason_code==='sessions_revoked'));
      assert.deepEqual(await state(),after);assert.deepEqual(await snapshot(),business);
    });
    console.log('P0_ADMIN_ACCOUNT_PROJECTION_RESET_HTTP '+JSON.stringify({
      actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,nonOwnerSixRoutesDenied:true,
      directorySummaryKeys:true,workMonitorTargetSessionsDevicesLogs:true,secretFieldsExcluded:true,
      passwordResetValidationPreservesSelectedState:true,passwordResetPathScopeAndVersions:true,
      bothTargetCookiesInvalidated:true,forcedChangeFlagSet:true,peerAccountsTrustPermissionsAndBusinessPreserved:true,
      successfulCreatePermissionsEnabledAndSelfPasswordJourneyReused:true,sessionHeartbeatAndIdleExpiryExcluded:true,
      failedLoginMetricsAccuracyAndCrossTransactionFaultAtomicityAccepted:false,hosted:false
    }));
  });

  await t.test('owner permission changes invalidate active assistant cookies and use current SQL grants',async permissionTest=>{
    const {createDisposableMerchantDirectoryOperator}=await import('./helpers/disposable-subscription-directory-operator.mjs');
    const directoryFixture=await createDisposableMerchantDirectoryOperator(admin,bootstrapUrl);
    permissionTest.after(()=>directoryFixture.dispose());
    const target=await actor('admin','assistant_admin',['view_merchants']);
    const peer=await actor('admin','assistant_admin',['view_merchants']);
    async function trusted(account,deviceId){
      const device=await security.registerAdminDeviceAuthoritative({accountId:account.id,accountKind:'admin',deviceId,deviceLabel:'Synthetic permission '+deviceId});
      await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
    }
    const secondId='synthetic-permission-second-'+randomUUID();
    await trusted(target,target.device);await trusted(target,secondId);await trusted(peer,peer.device);
    async function issue(account,device,permissions){
      const session=await auth.issueSession({accountId:account.id,accountKind:'admin',tenantId:'fawri-admin',adminRole:'assistant_admin',deviceId:device,permissions});
      return {...account,device,session,cookie:ADMIN_SESSION_COOKIE+'='+session.token};
    }
    const first=await issue(target,target.device,['view_merchants']),second=await issue(target,secondId,['view_merchants']);
    const other=await issue(peer,peer.device,['view_merchants']);
    let updated;
    const path='/api/auth/admins/'+target.id+'/permissions';
    const state=async()=>({
      accounts:(await admin.query('SELECT id,kind,phone,password_hash,state,password_version,security_version,session_version,password_changed_at FROM accounts WHERE id=ANY($1::text[]) ORDER BY id',[ids])).rows,
      profiles:(await admin.query('SELECT id,account_id,display_name,role,enabled,must_change_password FROM admin_profiles WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows,
      permissions:(await admin.query('SELECT admin_id,permission,granted_by_admin_id FROM admin_permissions WHERE admin_id=ANY($1::text[]) ORDER BY admin_id,permission',[ids])).rows,
      sessions:(await admin.query('SELECT id,account_id,kind,tenant_id,status,token_hash,device_fingerprint_hash,session_version,security_version,role_snapshot,permission_snapshot,created_at,revoked_at,revoke_reason,replaced_by_session_id FROM account_sessions WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows,
      devices:(await admin.query('SELECT to_jsonb(d) AS row FROM trusted_devices d WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows,
    });
    function assertChanged(before,after,selected,permissions){
      const prior=before.accounts.find(x=>x.id===target.id),next=after.accounts.find(x=>x.id===target.id);
      assert.equal(next.session_version,prior.session_version+1);assert.equal(next.security_version,prior.security_version+1);
      assert.deepEqual({...next,session_version:prior.session_version,security_version:prior.security_version},prior);
      assert.deepEqual(after.accounts.filter(x=>x.id!==target.id),before.accounts.filter(x=>x.id!==target.id));
      assert.deepEqual(after.profiles,before.profiles);assert.deepEqual(after.devices,before.devices);
      assert.deepEqual(after.permissions.filter(x=>x.admin_id!==target.id),before.permissions.filter(x=>x.admin_id!==target.id));
      assert.deepEqual(after.permissions.filter(x=>x.admin_id===target.id),permissions.map(permission=>({admin_id:target.id,permission,granted_by_admin_id:owner.id})));
      assert.deepEqual(after.sessions.filter(x=>!selected.includes(x.id)),before.sessions.filter(x=>!selected.includes(x.id)));
      for(const id of selected){
        const old=before.sessions.find(x=>x.id===id),row=after.sessions.find(x=>x.id===id);
        assert.equal(old.status,'active');assert.equal(row.status,'revoked');assert.equal(row.revoke_reason,'role_changed');assert.ok(row.revoked_at);
        assert.deepEqual({...row,status:old.status,revoke_reason:old.revoke_reason,revoked_at:old.revoked_at},old);
      }
    }
    async function run(name,fn){
      let passed=false;
      await permissionTest.test(name,async()=>{await fn();passed=true;});
      if(!passed)throw Error('Dependent permission cases blocked after '+name);
    }
    const business=await snapshot();
    await run('invalid permission payloads preserve active sessions and current grants',async()=>{
      assert.equal((await req('/api/auth/merchants',first)).status,200);assert.equal((await req('/api/auth/admin/logs',first)).status,403);
      const before=await state();
      for(const [body,code] of [[{permissions:'view_logs'},'INVALID_PERMISSIONS_VALUE'],[{permissions:['synthetic_unknown_permission']},'INVALID_ADMIN_PERMISSION']]){
        const r=await req(path,owner,'PATCH',body);assert.equal(r.status,400);assert.equal(r.body.code,code);
        assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
      }
      for(const session of [first,second,other])assert.equal((await req('/api/auth/merchants',session)).status,200);
      assert.deepEqual(await state(),before);
    });
    await run('SQL insertion fault after grant deletion rolls back without invalidating active cookies',async()=>{
      const fault='p0_admin_perm_'+randomUUID().replaceAll('-',''),before=await state();
      await admin.query('CREATE FUNCTION '+fault+"() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='synthetic permission write fault'; END $fault$");
      let installed=false;
      try{
        await admin.query('CREATE TRIGGER '+fault+" BEFORE INSERT ON admin_permissions FOR EACH ROW WHEN (NEW.admin_id = '"+target.id+"') EXECUTE FUNCTION "+fault+'()');installed=true;
        // Test-mode error marker identifies the injected SQL fault; no
        // production error-envelope privacy contract is accepted here.
        const r=await fetch(origin+path,{method:'PATCH',headers:{Cookie:owner.cookie,'X-Fawri-Device-Id':owner.device,'Content-Type':'application/json'},body:JSON.stringify({permissions:['view_logs']})});
        assert.equal(r.status,500);assert.match(await r.text(),/synthetic permission write fault/);
        assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
      }finally{
        if(installed)await admin.query('DROP TRIGGER '+fault+' ON admin_permissions');
        await admin.query('DROP FUNCTION '+fault+'()');
      }
      for(const session of [first,second,other])assert.equal((await req('/api/auth/merchants',session)).status,200);
      assert.equal((await req('/api/auth/admin/logs',first)).status,403);assert.equal((await req('/api/auth/admin/me',owner)).status,200);
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
    });
    await run('owner replaces grants revokes both old devices and fresh session receives only current rights',async()=>{
      const before=await state();
      const r=await req('/API/Auth/Admins/'+target.id+'/Permissions/?account_id='+peer.id,owner,'PATCH',{permissions:['view_logs'],adminId:peer.id,account_id:peer.id,actor_account_id:peer.id,role:'owner_admin'});
      assert.equal(r.status,200);assert.equal(r.body.account.id,target.id);
      assert.equal(r.body.admin_profile.role,'assistant_admin');assert.deepEqual(r.body.admin_profile.permissions,['view_logs']);
      const after=await state();assertChanged(before,after,[first.session.session.id,second.session.session.id],['view_logs']);
      for(const session of [first,second])for(const endpoint of ['/api/auth/admin/me','/api/auth/merchants','/api/auth/admin/logs'])assert.equal((await req(endpoint,session)).status,401);
      assert.equal((await req('/api/auth/merchants',other)).status,200);assert.equal((await req('/api/auth/admin/me',owner)).status,200);
      assert.deepEqual(await state(),after);assert.deepEqual(await snapshot(),business);
      updated=await issue(target,target.device,['view_logs']);
      const current=await req('/api/auth/admin/me',updated);assert.equal(current.status,200);assert.deepEqual(current.body.admin_profile.permissions,['view_logs']);
      assert.equal((await req('/api/auth/merchants',updated)).status,403);assert.equal((await req('/api/auth/admin/logs',updated)).status,200);
      assert.deepEqual(await snapshot(),business);
    });
    await run('empty grant list revokes the active cookie and preserves authenticated own identity without business rights',async()=>{
      const before=await state(),r=await req(path,owner,'PATCH',{permissions:[],adminId:peer.id,account_id:peer.id});
      assert.equal(r.status,200);assert.deepEqual(r.body.admin_profile.permissions,[]);
      const after=await state();assertChanged(before,after,[updated.session.session.id],[]);
      for(const session of [first,second,updated])assert.equal((await req('/api/auth/admin/me',session)).status,401);
      assert.equal((await req('/api/auth/merchants',other)).status,200);assert.equal((await req('/api/auth/admin/me',owner)).status,200);
      assert.deepEqual(await state(),after);
      const empty=await issue(target,target.device,[]),current=await req('/api/auth/admin/me',empty);
      assert.equal(current.status,200);assert.deepEqual(current.body.admin_profile.permissions,[]);
      for(const endpoint of ['/api/auth/merchants','/api/auth/admin/logs'])assert.equal((await req(endpoint,empty)).status,403);
      const audits=(await admin.query("SELECT actor_account_id,actor_kind,subject_hash FROM auth_audit_events WHERE actor_account_id=$1 AND event_type='assistant_admin_permissions_changed'",[owner.id])).rows;
      assert.ok(audits.filter(x=>x.actor_account_id===owner.id&&x.actor_kind==='admin').length>=2);
      assert.ok(audits.every(x=>x.subject_hash&&x.subject_hash!==target.id));assert.deepEqual(await snapshot(),business);
    });
    console.log('P0_ADMIN_ACTIVE_PERMISSION_HTTP '+JSON.stringify({
      actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,invalidInputPreservesState:true,
      actualSqlInsertFaultAfterDeleteRollsBack:true,oldTwoDeviceCookiesInvalidated:true,currentGrantOnlyAfterFreshIssue:true,
      emptyGrantsKeepIdentityButDenyBusiness:true,serverActorAndTargetBinding:true,
      versionsIncrementAndCredentialsTrustPeersPreserved:true,selectedBusinessTablesPreserved:true,
      sessionHeartbeatAndIdleExpiryExcluded:true,interactiveReloginRaceAndCrossTransactionAuditFaultAccepted:false,hosted:false
    }));
  });


  await t.test('current merchant settings full-app fields tenant writes origin and rollback boundary',async st=>{
    const x=await actor('merchant'),y=await actor('merchant');
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const settings=await import('../src/services/postgresMerchantSettingsAuthority.ts');
    for(const [m,label] of [[x,'target'],[y,'peer']])await settings.updateMerchantOperationalSettingsAuthoritative({
      merchantId:m.id,expectedVersion:1,patch:{reply_language:'ar',delivery:{pricing_mode:'per_area',area_rates:[
        {area_name:'Synthetic area A',fee_iqd:1200,enabled:true},
        {area_name:'Synthetic area B',fee_iqd:1800,enabled:false},
      ],notes:'private-settings-'+label},payment:{instructions:'private-payment-'+label}},
    });
    for(const [m,status] of [[x,'queued'],[x,'retry'],[y,'queued']]){
      const id='settings-job-'+randomUUID();settingsJobIds.push(id);
      await admin.query("INSERT INTO background_jobs(id,type,dedupe_key,merchant_id,status) VALUES($1,'meta.webhook.reply',$1,$2,$3)",[id,m.id,status]);
    }
    const state=async(tenantIds=[x.id,y.id])=>{
      const result={};
      for(const table of ['merchant_settings','merchant_delivery_area_rates','background_jobs']){
        result[table]=(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[tenantIds])).rows;
      }
      return result;
    };
    const version=async()=>(await admin.query('SELECT version FROM merchant_settings WHERE merchant_id=$1',[x.id])).rows[0].version;
    const path='/API/SeTtInGs/?merchant_id='+y.id;
    const allowed={Origin:'https://management.example.invalid'};
    const business=await snapshot();let completed=0;
    await st.test('full app keeps merchant-only fields and denies wrong actors devices combined roles and forged legacy cookies',async()=>{
      const before=await state();
      for(const actor of [undefined,owner,manager,denied])for(const method of ['GET','PATCH']){
        const r=await req(path,actor,method,method==='PATCH'?{expected_version:2,settings:{reply_language:'en'}}:undefined,allowed);
        assert.equal(r.status,401);assert.doesNotMatch(JSON.stringify(r.body),/private-settings-|private-payment-|password_hash|session_token/);
      }
      for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}]){
        for(const method of ['GET','PATCH'])assert.equal((await req(path,x,method,method==='PATCH'?{expected_version:2,settings:{reply_language:'en'}}:undefined,{...allowed,...headers})).status,401);
      }
      for(const route of ['/api/settings',path]){
        const r=await req(route,x);assert.equal(r.status,200);assert.match(r.cache,/no-store/);
        assert.deepEqual(Object.keys(r.body).sort(),['ok','settings']);
        assert.deepEqual(Object.keys(r.body.settings).sort(),['auto_reply_enabled','created_at','delivery','inventory','merchant_id','payment','reply_language','updated_at','version']);
        assert.equal(r.body.settings.merchant_id,x.id);assert.equal(r.body.settings.delivery.notes,'private-settings-target');
        assert.equal(r.body.settings.payment.instructions,'private-payment-target');
        assert.doesNotMatch(JSON.stringify(r.body),/private-settings-peer|private-payment-peer|password_hash|token_hash/);
      }
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);completed++;
    });
    await st.test('current write uses server tenant and preserves peer while stale and undeclared nested fields cannot change state',async()=>{
      const peer=await state([y.id]),v=await version();
      const r=await req(path,x,'PATCH',{merchant_id:y.id,merchantId:y.id,account_id:y.id,expected_version:v,settings:{reply_language:'en',auto_reply_enabled:false,delivery:{notes:'private-settings-target-updated'}}},allowed);
      assert.equal(r.status,200);assert.equal(r.body.settings.merchant_id,x.id);assert.equal(r.body.settings.version,v+1);
      assert.deepEqual(r.body.effects,{queued_auto_reply_jobs_suppressed:2,processing_auto_reply_jobs_observed:0,credit_consumed:false});
      assert.deepEqual(await state([y.id]),peer);
      const jobs=(await admin.query('SELECT status,result FROM background_jobs WHERE merchant_id=$1 AND id=ANY($2::text[]) ORDER BY id',[x.id,settingsJobIds])).rows;
      assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.status==='completed'&&j.result.suppression_code==='MERCHANT_AUTO_REPLY_DISABLED'&&j.result.credit_consumed===false));
      const after=await state();
      const stale=await req('/api/settings',x,'PATCH',{expected_version:v,settings:{reply_language:'ku'}},allowed);
      assert.equal(stale.status,409);assert.equal(stale.body.code,'MERCHANT_SETTINGS_VERSION_CONFLICT');assert.equal(stale.body.current_settings.merchant_id,x.id);
      for(const patch of [{merchant_id:y.id},{delivery:{merchant_id:y.id}},{payment:{merchant_id:y.id}},{inventory:{merchant_id:y.id}}]){
        assert.equal((await req(path,x,'PATCH',{expected_version:v+1,settings:patch},allowed)).status,400);
        assert.deepEqual(await state(),after);
      }
      assert.deepEqual(await snapshot(),business);completed++;
    });
    await st.test('rate INSERT failure after settings UPDATE and rate DELETE rolls the complete selected write back',async()=>{
      const name='settings_fault_'+randomUUID().replaceAll('-',''),before=await state(),v=await version();
      try{
        await admin.query(`CREATE SEQUENCE ${name}`);
        await admin.query(`GRANT USAGE ON SEQUENCE ${name} TO ${runtime.role}`);
        await admin.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $settings_fault$
          BEGIN IF NEW.merchant_id=TG_ARGV[0] THEN
            IF NOT EXISTS(SELECT 1 FROM merchant_settings WHERE merchant_id=NEW.merchant_id AND version=TG_ARGV[1]::integer)
              OR EXISTS(SELECT 1 FROM merchant_delivery_area_rates WHERE merchant_id=NEW.merchant_id)
            THEN RAISE EXCEPTION 'settings fixture did not reach post-update post-delete boundary'; END IF;
            PERFORM nextval(TG_ARGV[2]::regclass);
            RAISE EXCEPTION 'synthetic private settings area fault' USING ERRCODE='23514';
          END IF; RETURN NEW; END $settings_fault$`);
        await admin.query(`CREATE TRIGGER ${name} BEFORE INSERT ON merchant_delivery_area_rates FOR EACH ROW EXECUTE FUNCTION ${name}('${x.id}','${v+1}','public.${name}')`);
        const r=await req(path,x,'PATCH',{expected_version:v,settings:{auto_reply_enabled:true,delivery:{area_rates:[{area_name:'Synthetic replacement',fee_iqd:2500,enabled:true}]}}},allowed);
        assert.equal(r.status,500);assert.equal(r.body.code,'MERCHANT_SETTINGS_OPERATION_FAILED');assert.doesNotMatch(JSON.stringify(r.body),/synthetic private|settings_fault|23514/);
        assert.deepEqual((await admin.query(`SELECT last_value::int AS value,is_called FROM ${name}`)).rows,[{value:1,is_called:true}],'nontransactional owned sequence proves the injected fault reached after the real UPDATE and DELETE');
      }finally{
        await admin.query(`DROP TRIGGER IF EXISTS ${name} ON merchant_delivery_area_rates`);
        await admin.query(`DROP FUNCTION IF EXISTS ${name}()`);
        await admin.query(`DROP SEQUENCE IF EXISTS ${name}`);
      }
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);completed++;
    });
    await st.test('foreign Origin is rejected before a cookie-authenticated settings mutation',async()=>{
      const before=await state(),v=await version();
      const r=await req(path,x,'PATCH',{expected_version:v,settings:{reply_language:'ku'}},{Origin:'https://foreign-origin.example.invalid'});
      const after=await state();
      console.log('P0_SETTINGS_ORIGIN_OBSERVATION '+JSON.stringify({status:r.status,code:r.body.code||null,selectedStateChanged:JSON.stringify(after)!==JSON.stringify(before)}));
      assert.equal(r.status,403);assert.equal(r.body.code,'AUTH_ORIGIN_FORBIDDEN');
      assert.deepEqual(after,before);assert.deepEqual(await snapshot(),business);completed++;
    });
    console.log('P0_SETTINGS_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:completed,allAssertionsPassed:completed===4,foreignOriginDenied:completed===4,hosted:false}));
  });


  await t.test('current online report full-app actor tenant projection range and read failure boundary',async rt=>{
    const x=await actor('merchant'),y=await actor('merchant');
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=MERCHANT_SESSION_COOKIE+'='+m.session.token;
      m.location='report-location-'+randomUUID();
      await admin.query('INSERT INTO merchant_locations(id,merchant_id,name) VALUES($1,$2,$3)',[m.location,m.id,m===x?'Own report location':'Peer private report location']);
    }
    let completed=0,orderCasePassed=false;
    async function order(m,label,{channel='online',status='delivered',created='2025-01-01',delivered='2025-01-10',cancelled=null,subtotal=10000,fee=1000,paid=false,units=1}={}){
      const id='report-'+label+'-'+randomUUID();
      await admin.query(`INSERT INTO orders(id,merchant_id,customer_name,customer_phone,customer_address,customer_external_id,
        source_channel,status,created_at,delivered_at,cancelled_at,subtotal_iqd,delivery_fee_iqd,total_iqd,
        fulfillment_location_id,payment_method,payment_status,payment_verified_at,notes,metadata)
        VALUES($1,$2,$3,'private-report-phone','private-report-address','private-report-external',$4,$5,$6,$7,$8,$9,$10,$9::integer+$10::integer,$11,$12,$13,$14,'private-report-notes','{"private":"private-report-metadata"}'::jsonb)`,
        [id,m.id,'private-report-customer-'+label,channel,status,created,delivered,cancelled,subtotal,fee,m.location,
          paid?'superqi':'cash_on_delivery',paid?'paid':'cash_on_delivery',paid?'2025-01-13':null]);
      await admin.query(`INSERT INTO order_items(id,merchant_id,order_id,product_name_snapshot,quantity,unit_price_iqd,line_total_iqd)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,['report-item-'+randomUUID(),m.id,id,'Report product '+label,units,subtotal/units,subtotal]);
    }
    await order(x,'own-first',{paid:true,units:2});
    await order(x,'own-second',{channel:'instagram',created:'2025-01-15',delivered:'2025-01-20',subtotal:20000,fee:2000});
    await order(x,'own-active',{status:'confirmed',created:'2025-01-11',delivered:null,subtotal:3000,fee:0});
    await order(x,'own-cancelled',{status:'cancelled',created:'2025-01-02',delivered:null,cancelled:'2025-01-12',subtotal:4000,fee:0});
    await order(x,'cashier-excluded',{channel:'CaShIeR',subtotal:900000,fee:0});
    await order(y,'peer-private',{created:'2025-01-10',delivered:'2025-01-11',subtotal:777000,fee:0});

    await admin.query(`UPDATE orders SET payment_provider='synthetic-owned-provider',
      payment_provider_transaction_ref='owned-order-provider-ref',payment_provider_last_event_id='owned-order-provider-event',
      payment_confirmation_source='provider_verified',
      metadata=metadata||'{"payment_screenshot":"owned-order-screenshot","private_extension":"unprojected-order-extension"}'::jsonb
      WHERE merchant_id=$1 AND payment_status='paid'`,[x.id]);
    const state=async()=>Object.fromEntries(await Promise.all(['orders','order_items','merchant_locations'].map(async table=>[table,
      (await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text`,[[x.id,y.id]])).rows])));
    const before=await state(),business=await snapshot(),path='/API/RePoRtS/OnLiNe/?merchant_id='+y.id+'&merchantId='+y.id;
    const noPrivate=body=>assert.doesNotMatch(JSON.stringify(body),/private-report-|peer-private|Peer private|cashier-excluded|password_hash|token_hash|customer_phone|customer_address|metadata/);
    function checkReport(r,expected){
      assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.deepEqual(Object.keys(r.body).sort(),['ok','report']);assert.equal(r.body.ok,true);
      const report=r.body.report;
      assert.deepEqual(Object.keys(report).sort(),[...Object.keys(expected),'generated_at'].sort());
      assert.ok(Number.isFinite(Date.parse(report.generated_at)));assert.deepEqual({...report,generated_at:undefined},{...expected,generated_at:undefined});noPrivate(r.body);
    }
    const all={
      received_order_count:4,active_order_count:1,delivered_order_count:2,cancelled_order_count:1,
      delivered_sales_iqd:30000,delivered_delivery_fees_iqd:3000,delivered_order_value_iqd:33000,average_delivered_order_iqd:16500,paid_electronic_count:1,
      by_channel:[
        {source_channel:'instagram',order_count:1,active_order_count:0,delivered_order_count:1,delivered_sales_iqd:20000,delivered_order_value_iqd:22000},
        {source_channel:'online',order_count:3,active_order_count:1,delivered_order_count:1,delivered_sales_iqd:10000,delivered_order_value_iqd:11000},
      ],
      by_location:[{location_id:x.location,location_name:'Own report location',delivered_order_count:2,delivered_sales_iqd:30000,delivered_order_value_iqd:33000}],
      top_products:[{product_name:'Report product own-second',units:1,revenue_iqd:20000},{product_name:'Report product own-first',units:2,revenue_iqd:10000}],
    };
    try{
      await rt.test('current secure merchant only projection ignores foreign tenant query and never exposes customer or peer fields',async()=>{
        for(const actor of [undefined,owner,manager,denied]){const r=await req(path,actor);assert.equal(r.status,401);noPrivate(r.body);}
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:x.cookie+'; '+owner.cookie},{Cookie:'fawri_merchant_session=synthetic-invalid'}]){
          const r=await req(path,x,'GET',undefined,headers);assert.equal(r.status,401);noPrivate(r.body);
        }
        for(const route of ['/api/reports/online',path])checkReport(await req(route,x),all);
        const peer=await req('/api/reports/online?merchant_id='+x.id,y);
        assert.equal(peer.status,200);assert.equal(peer.body.report.delivered_sales_iqd,777000);
        assert.deepEqual(peer.body.report.top_products,[{product_name:'Report product peer-private',units:1,revenue_iqd:777000}]);
        assert.equal(peer.body.report.by_location[0].location_id,y.location);
        assert.doesNotMatch(JSON.stringify(peer.body),/own-first|own-second|Own report location|private-report-/);
        assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);completed++;
      });
      await rt.test('received delivered cancelled and payment measures use their own half-open event ranges and invalid range fails closed',async()=>{
        checkReport(await req(path+'&from=2025-01-10T00%3A00%3A00Z&to=2025-01-20T00%3A00%3A00Z',x),{
          from:'2025-01-10T00:00:00.000Z',to:'2025-01-20T00:00:00.000Z',
          received_order_count:2,active_order_count:1,delivered_order_count:1,cancelled_order_count:1,
          delivered_sales_iqd:10000,delivered_delivery_fees_iqd:1000,delivered_order_value_iqd:11000,average_delivered_order_iqd:11000,paid_electronic_count:1,
          by_channel:[
            {source_channel:'instagram',order_count:1,active_order_count:0,delivered_order_count:0,delivered_sales_iqd:0,delivered_order_value_iqd:0},
            {source_channel:'online',order_count:1,active_order_count:1,delivered_order_count:1,delivered_sales_iqd:10000,delivered_order_value_iqd:11000},
          ],
          by_location:[{location_id:x.location,location_name:'Own report location',delivered_order_count:1,delivered_sales_iqd:10000,delivered_order_value_iqd:11000}],
          top_products:[{product_name:'Report product own-first',units:2,revenue_iqd:10000}],
        });
        for(const query of ['from=not-a-date','from=2025-01-20&to=2025-01-10','from=2025-01-10&to=2025-01-10']){
          const r=await req('/api/reports/online?'+query,x);assert.equal(r.status,400);assert.equal(r.body.code,'ONLINE_REPORT_RANGE_INVALID');assert.equal(r.cache,'no-store');noPrivate(r.body);
        }
        assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);completed++;
      });

      await rt.test('current merchant order list preserves own customer and payment projection under restricted SQL and denies foreign actors',async()=>{
        const route='/API/OrDeRs/?merchant_id='+y.id+'&merchantId='+y.id;
        for(const actor of [undefined,owner,manager,denied]){
          const r=await req('/api/orders',actor);assert.equal(r.status,401);
          assert.doesNotMatch(JSON.stringify(r.body),/private-report-|owned-order-|payment_provider|customer_name/);
        }
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:x.cookie+'; '+owner.cookie},{Cookie:'fawri_merchant_session=synthetic-invalid'}]){
          const r=await req(route,x,'GET',undefined,headers);assert.equal(r.status,401);
          assert.doesNotMatch(JSON.stringify(r.body),/private-report-|owned-order-|customer_name/);
        }
        const fields=['id','merchant_id','customer_id','customer_name','phone','address','items','payment_method','payment_status','status','notes',
          'payment_reconciliation_status','source_channel','total_price','created_at','updated_at','version'];
        for(const endpoint of ['/api/orders',route]){
          const r=await req(endpoint,x);assert.equal(r.status,200);assert.equal(r.cache,'no-store');
          assert.deepEqual(Object.keys(r.body).sort(),['count','merchant_id','ok','orders']);assert.equal(r.body.ok,true);assert.equal(r.body.merchant_id,x.id);
          assert.equal(r.body.count,4);assert.equal(r.body.orders.length,4);
          assert.deepEqual(r.body.orders.map(o=>o.customer_name).sort(),['own-first','own-second','own-active','own-cancelled'].map(s=>'private-report-customer-'+s).sort());
          assert.ok(r.body.orders.every(o=>o.merchant_id===x.id&&o.source_channel.toLowerCase()!=='cashier'));
          assert.doesNotMatch(JSON.stringify(r.body),/peer-private|cashier-excluded|unprojected-order-extension|password_hash|token_hash/);
          for(const o of r.body.orders){
            const paid=o.customer_name==='private-report-customer-own-first';
            assert.deepEqual(Object.keys(o).sort(),[...fields,...(paid?['payment_screenshot','payment_verified_at','payment_confirmation_source',
              'payment_provider','payment_provider_transaction_ref','payment_provider_last_event_id']:[])].sort());
            assert.equal(o.customer_id,'private-report-external');assert.equal(o.phone,'private-report-phone');
            assert.equal(o.address,'private-report-address');assert.equal(o.notes,'private-report-notes');
            assert.equal(o.version,1);assert.equal(o.payment_reconciliation_status,'clear');
            assert.ok(Number.isFinite(Date.parse(o.created_at)));assert.ok(Number.isFinite(Date.parse(o.updated_at)));
            assert.ok(o.items.every(i=>Object.keys(i).sort().join(',')==='price,product_id,product_name,quantity'));
          }
          const first=r.body.orders.find(o=>o.customer_name==='private-report-customer-own-first');
          assert.equal(first.payment_method,'superqi');assert.equal(first.payment_status,'paid');assert.equal(first.status,'delivered');
          assert.equal(first.total_price,11000);assert.equal(first.payment_verified_at,'2025-01-13T00:00:00.000Z');
          assert.equal(first.payment_confirmation_source,'provider_verified');assert.equal(first.payment_provider,'synthetic-owned-provider');
          assert.equal(first.payment_provider_transaction_ref,'owned-order-provider-ref');assert.equal(first.payment_provider_last_event_id,'owned-order-provider-event');
          assert.equal(first.payment_screenshot,'owned-order-screenshot');
          assert.deepEqual(first.items,[{product_id:'',product_name:'Report product own-first',quantity:2,price:5000}]);
        }
        const peer=await req('/api/orders?merchant_id='+x.id,y);assert.equal(peer.status,200);assert.equal(peer.body.count,1);
        assert.equal(peer.body.merchant_id,y.id);assert.ok(peer.body.orders.every(o=>o.merchant_id===y.id));
        assert.equal(peer.body.orders[0].customer_name,'private-report-customer-peer-private');assert.equal(peer.body.orders[0].total_price,777000);
        assert.doesNotMatch(JSON.stringify(peer.body),/own-first|owned-order-provider|owned-order-screenshot/);
        assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);orderCasePassed=true;
      });
      await rt.test('actual restricted-role SQL read denial returns a generic error and legitimate report recovers after restoring fixture privilege',async()=>{
        checkReport(await req('/api/reports/online',x),all);
        try{
          await admin.query('REVOKE SELECT ON order_items FROM '+runtime.role);
          assert.equal((await admin.query("SELECT has_table_privilege($1,'public.order_items','SELECT') AS allowed",[runtime.role])).rows[0].allowed,false);
          await assert.rejects(runtime.runtimePool.query('SELECT 1 FROM order_items LIMIT 0'),e=>e.code==='42501');
          const r=await req(path,x);assert.equal(r.status,500);assert.equal(r.cache,'no-store');
          assert.deepEqual(r.body,{ok:false,code:'ONLINE_REPORT_OPERATION_FAILED',error:'online report operation failed'});
          assert.doesNotMatch(JSON.stringify(r.body),/order_items|permission denied|42501|knowledge_app_|private-report-/);
          const ordersFailure=await req('/api/orders',x);assert.equal(ordersFailure.status,500);assert.equal(ordersFailure.cache,'no-store');
          assert.deepEqual(ordersFailure.body,{ok:false,code:'ORDER_OPERATION_FAILED',error:'order operation failed'});

          assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
        }finally{await admin.query('GRANT SELECT ON order_items TO '+runtime.role);}
        checkReport(await req('/api/reports/online',x),all);

        const ordersRecovery=await req('/api/orders',x);assert.equal(ordersRecovery.status,200);assert.equal(ordersRecovery.body.count,4);
        assert.ok(ordersRecovery.body.orders.every(o=>o.merchant_id===x.id));
        assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);completed++;
      });
      console.log('P0_ONLINE_REPORT_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:completed,allAssertionsPassed:completed===3,hosted:false}));


      let optionalPassed=false,optionalFaultPassed=false;
      await rt.test('optional merchant decision rejection and reconciliation fields keep linked tenant authority and sanitize lookup failure',async()=>{
        const rows=(await admin.query('SELECT id,merchant_id,customer_name FROM orders WHERE merchant_id=ANY($1::text[])',[[x.id,y.id]])).rows;
        const byName=name=>{const row=rows.find(o=>o.customer_name==='private-report-customer-'+name);assert.ok(row);return row;};
        const first=byName('own-first'),rejected=byName('own-active'),adminOrder=byName('own-second'),legacy=byName('own-cancelled'),peer=byName('peer-private');
        const decisions=[];let revoked=false;
        const stable=async()=>Object.fromEntries(await Promise.all(['orders','order_items','merchant_locations','order_payment_decisions','order_terminal_decision_links'].map(async table=>[table,
          (await admin.query(`SELECT to_jsonb(o) AS row FROM ${table} o WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(o)::text`,[[x.id,y.id]])).rows])));
        async function decision(order,tag,{kind='merchant',operation='confirm',outcome='paid',account=order.merchant_id,link=true,expectedVersion=1}={}){
          const id='optional-decision-'+randomUUID();decisions.push(id);
          const confirmation=outcome==='paid'?'merchant_confirmed':null,reason='owned-optional-reason-'+tag,request='owned-optional-request-'+tag;
          await admin.query(`INSERT INTO order_payment_decisions(id,merchant_id,order_id,operation,payment_channel,outcome,confirmation_source,
            previous_order_status,resulting_order_status,previous_payment_status,resulting_payment_status,actor_type,actor_account_id,
            actor_session_fingerprint,request_id,reason,expected_version,resulting_version,source_file,source_sha256,migration_batch_id,decided_at)
            VALUES($1,$2,$3,$4,'electronic',$5::text::payment_decision_outcome,$6,'pending_confirmation',$7,'electronic_pending',$5::text::payment_status,$8,$9,$10,$11,$12,$13::integer,$13::integer+1,$14,$15,$16,'2025-01-21T00:00:00Z')`,
            [id,order.merchant_id,order.id,operation,outcome,confirmation,outcome==='paid'?'confirmed':'cancelled',kind,account,
              'a'.repeat(64),request,reason,expectedVersion,operation==='legacy_import'?'owned-legacy-source-file':null,
              operation==='legacy_import'?'b'.repeat(64):null,operation==='legacy_import'?'owned-legacy-batch':null]);
          if(link)await admin.query('INSERT INTO order_terminal_decision_links(merchant_id,order_id,decision_id) VALUES($1,$2,$3)',[order.merchant_id,order.id,id]);
          return {id,merchant_id:order.merchant_id,order_id:order.id,operation,payment_channel:'electronic',outcome,
            ...(confirmation?{confirmation_source:confirmation}:{}),previous_payment_status:'electronic_pending',resulting_payment_status:outcome,
            previous_order_status:'pending_confirmation',resulting_order_status:outcome==='paid'?'confirmed':'cancelled',
            actor_type:'merchant',actor_id:account,request_id:request,reason,expected_version:expectedVersion,resulting_version:expectedVersion+1,
            decided_at:'2025-01-21T00:00:00.000Z'};
        }
        async function own(order){const r=await req('/api/order/'+encodeURIComponent(order.id),x);assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.deepEqual(Object.keys(r.body).sort(),['ok','order']);return r.body.order;}
        async function list(){const r=await req('/api/orders?merchant_id='+y.id,x);assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.body.count,4);return r.body.orders;}
        try{
          // Read projection only: these owned SQL fixtures do not claim new
          // confirmation/rejection/provider-ingress or fulfillment execution.
          await admin.query(`UPDATE orders SET version=2,payment_verified_by_account_id=$2,payment_confirmation_source='merchant_confirmed',
            payment_reconciliation_status='reconciliation_required',payment_conflict_code='MERCHANT_PAID_PROVIDER_FAILED',
            payment_conflict_at='2025-01-22T00:00:00Z' WHERE id=$1`,[first.id,x.id]);
          for(const order of [rejected,legacy])await admin.query(`UPDATE orders SET version=2,status='cancelled',cancelled_at='2025-01-21T00:00:00Z',
            payment_method='superqi',payment_status='failed',payment_rejection_reason=$2 WHERE id=$1`,[order.id,'owned-rejection-'+order.id]);
          for(const order of [adminOrder,peer])await admin.query(`UPDATE orders SET version=2,payment_method='superqi',payment_status='paid',
            payment_verified_at='2025-01-21T00:00:00Z',payment_verified_by_account_id=$2,payment_confirmation_source='merchant_confirmed' WHERE id=$1`,[order.id,order.merchant_id]);
          const confirmedDecision=await decision(first,'confirm'),rejectedDecision=await decision(rejected,'reject',{operation:'reject',outcome:'failed'});
          await decision(adminOrder,'admin',{kind:'admin',account:owner.id});
          await decision(legacy,'legacy',{kind:'system',operation:'legacy_import',outcome:'failed',account:null});
          const peerDecision=await decision(peer,'peer');
          const unlinked=await decision(first,'unlinked',{operation:'reject',outcome:'failed',link:false,expectedVersion:2});
          let before=await stable();
          const firstRead=await own(first),rejectRead=await own(rejected),adminRead=await own(adminOrder),legacyRead=await own(legacy);
          assert.deepEqual(firstRead.last_payment_decision,confirmedDecision);
          assert.deepEqual(rejectRead.last_payment_decision,rejectedDecision);
          assert.notEqual(firstRead.last_payment_decision.id,unlinked.id);
          assert.equal(firstRead.payment_verified_by,x.id);assert.equal(firstRead.payment_reconciliation_status,'reconciliation_required');
          assert.equal(firstRead.payment_conflict_code,'MERCHANT_PAID_PROVIDER_FAILED');assert.equal(firstRead.payment_conflict_at,'2025-01-22T00:00:00.000Z');
          assert.equal(firstRead.payment_conflict_resolved_at,undefined);assert.equal(firstRead.payment_rejection_reason,undefined);
          assert.equal(rejectRead.payment_rejection_reason,'owned-rejection-'+rejected.id);assert.equal(rejectRead.payment_verified_at,undefined);assert.equal(rejectRead.payment_verified_by,undefined);
          assert.equal(adminRead.last_payment_decision,undefined);assert.equal(legacyRead.last_payment_decision,undefined);
          const all=await list();
          for(const order of [firstRead,rejectRead,adminRead,legacyRead])assert.deepEqual(all.find(o=>o.id===order.id),order);
          assert.doesNotMatch(JSON.stringify(all),/actor_session_fingerprint|source_file|source_sha256|migration_batch_id|owned-legacy-source-file|owned-legacy-batch|owned-optional-reason-unlinked|unprojected-order-extension/);
          const other=await req('/api/orders?merchant_id='+x.id,y);assert.equal(other.status,200);assert.equal(other.body.count,1);
          assert.deepEqual(other.body.orders[0].last_payment_decision,peerDecision);
          assert.doesNotMatch(JSON.stringify(other.body),/owned-optional-reason-confirm|owned-optional-reason-reject|MERCHANT_PAID_PROVIDER_FAILED/);
          const denied=await req('/api/order/'+encodeURIComponent(first.id),y);assert.equal(denied.status,404);assert.equal(denied.body.code,'ORDER_NOT_FOUND');
          assert.deepEqual(await stable(),before);
          await admin.query(`UPDATE orders SET payment_reconciliation_status='resolved',payment_conflict_resolved_at='2025-01-23T00:00:00Z',
            payment_conflict_resolved_by_account_id=$2,payment_conflict_resolution_note='owned-reconciliation-resolution' WHERE id=$1`,[first.id,x.id]);
          before=await stable();
          const resolved=await own(first);assert.equal(resolved.payment_reconciliation_status,'resolved');
          assert.equal(resolved.payment_conflict_resolved_at,'2025-01-23T00:00:00.000Z');assert.equal(resolved.payment_conflict_resolved_by,x.id);
          assert.equal(resolved.payment_conflict_resolution_note,'owned-reconciliation-resolution');assert.equal(resolved.payment_conflict_code,'MERCHANT_PAID_PROVIDER_FAILED');
          assert.deepEqual(resolved.last_payment_decision,confirmedDecision);assert.deepEqual((await list()).find(o=>o.id===first.id),resolved);
          assert.deepEqual(await stable(),before);
          await admin.query('REVOKE SELECT ON order_payment_decisions FROM '+runtime.role);revoked=true;
          assert.equal((await admin.query("SELECT has_table_privilege($1,'public.order_payment_decisions','SELECT') AS allowed",[runtime.role])).rows[0].allowed,false);
          await assert.rejects(runtime.runtimePool.query('SELECT 1 FROM order_payment_decisions LIMIT 0'),e=>e.code==='42501');
          for(const path of ['/api/orders','/api/order/'+encodeURIComponent(first.id)]){
            const failed=await req(path,x);assert.equal(failed.status,500);assert.equal(failed.cache,'no-store');
            assert.deepEqual(failed.body,{ok:false,code:'ORDER_OPERATION_FAILED',error:'order operation failed'});
          }
          assert.deepEqual(await stable(),before);
          await admin.query('GRANT SELECT ON order_payment_decisions TO '+runtime.role);revoked=false;
          assert.deepEqual(await own(first),resolved);assert.deepEqual((await list()).find(o=>o.id===first.id),resolved);
          assert.deepEqual(await stable(),before);optionalFaultPassed=true;optionalPassed=true;
        }finally{
          if(revoked)await admin.query('GRANT SELECT ON order_payment_decisions TO '+runtime.role);
          await admin.query('DELETE FROM order_terminal_decision_links WHERE decision_id=ANY($1::text[])',[decisions]);
          await admin.query('DELETE FROM order_payment_decisions WHERE id=ANY($1::text[])',[decisions]);
        }
      });
      console.log('P0_ORDER_OPTIONAL_PAYMENT_FIELDS_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,
        passedCases:optionalPassed?1:0,allAssertionsPassed:optionalPassed,decisionSqlReadFaultAndRecovery:optionalFaultPassed,
        linkedMerchantDecision:optionalPassed,adminAndLegacyDecisionExcluded:optionalPassed,hosted:false}));
      console.log('P0_ORDERS_LIST_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,
        passedCases:orderCasePassed?1:0,allAssertionsPassed:orderCasePassed,sqlReadFaultAndRecoveryAccepted:completed===3,hosted:false}));
    }finally{
      await admin.query('DELETE FROM order_items WHERE merchant_id=ANY($1::text[])',[[x.id,y.id]]);
      await admin.query('DELETE FROM orders WHERE merchant_id=ANY($1::text[])',[[x.id,y.id]]);
      await admin.query('DELETE FROM merchant_locations WHERE merchant_id=ANY($1::text[])',[[x.id,y.id]]);
    }
  });

  await t.test('current channel list full-app tenant actor credential projection and auth SQL failure boundary',async()=>{
    const x=await actor('merchant'),y=await actor('merchant');
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const channels=await import('../src/services/postgresMetaChannelAuthority.ts');
    const {authenticationDatabasePool}=await import('../src/services/authenticationPostgresAuthority.ts');
    const authPool=await authenticationDatabasePool();
    assert.equal((await authPool.query('SELECT current_user::text AS role')).rows[0].role,runtime.authRole);
    const key={id:'synthetic-full-app-channel-key',key:Buffer.alloc(32,41)};
    const keyProvider={current:()=>key,resolve:id=>id===key.id?key:null};
    const pageX='owned-channel-'+randomUUID(),pageY='peer-channel-'+randomUUID();
    const first=await channels.connectMetaChannelAuthoritative({merchantId:x.id,platform:'instagram',pageId:pageX,pageName:'Owned page',
      instagramAccountId:'owned-instagram-account',instagramUsername:'owned-instagram-user',accessToken:'synthetic-channel-secret-target',webhookSubscribed:true,keyProvider});
    const peer=await channels.connectMetaChannelAuthoritative({merchantId:y.id,platform:'messenger',pageId:pageY,pageName:'Peer page',
      accessToken:'synthetic-channel-secret-peer',webhookSubscribed:false,keyProvider});
    const stamp='2025-02-03T04:05:06.000Z';
    await admin.query(`UPDATE merchant_channels SET created_at=$2,updated_at=$2,connected_at=$2,
      webhook_subscribed_at=$2,disconnected_at=$2,metadata=$3::jsonb WHERE id=$1`,
      [first.id,stamp,JSON.stringify({disconnect_requested_at:stamp,operation:'unprojected-operation',private_extension:'unprojected-channel-metadata'})]);
    await admin.query("UPDATE merchant_channels SET status='error',created_at=$2,updated_at=$2,connected_at=$2,last_error_code='SYNTHETIC_CHANNEL_ERROR' WHERE id=$1",[peer.id,stamp]);
    const expectedX={id:first.id,merchant_id:x.id,platform:'instagram',page_id:pageX,page_name:'Owned page',
      instagram_account_id:'owned-instagram-account',instagram_username:'owned-instagram-user',status:'active',webhook_subscribed:true,
      connection_version:1,connected_at:stamp,disconnect_requested_at:stamp,disconnected_at:stamp,created_at:stamp,updated_at:stamp,credential_configured:true};
    const expectedY={id:peer.id,merchant_id:y.id,platform:'messenger',page_id:pageY,page_name:'Peer page',status:'error',webhook_subscribed:false,
      connection_version:1,connected_at:stamp,last_error_code:'SYNTHETIC_CHANNEL_ERROR',created_at:stamp,updated_at:stamp,credential_configured:true};
    const stable=async()=>({business:await snapshot(),channels:(await admin.query('SELECT to_jsonb(c) AS row FROM merchant_channels c WHERE merchant_id=ANY($1::text[]) ORDER BY id',[[x.id,y.id]])).rows});
    const before=await stable();
    let passed=false,faultPassed=false,revoked=false;
    try{
      for(const path of ['/api/channels','/API/ChAnNeLs/?merchant_id='+y.id]){
        for(const who of [undefined,owner,viewer,channelManager]){
          const r=await req(path,who);assert.equal(r.status,401);assert.doesNotMatch(JSON.stringify(r.body),/owned-channel-|peer-channel-|synthetic-channel-secret|credential_ciphertext/);
        }
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}]){
          assert.equal((await req(path,x,'GET',undefined,headers)).status,401);
        }
        const r=await req(path,x);assert.equal(r.status,200);assert.equal(r.cache,'no-store');
        assert.deepEqual(r.body,{ok:true,channels:[expectedX]});
        assert.doesNotMatch(JSON.stringify(r.body),/synthetic-channel-secret|credential_ciphertext|credential_nonce|credential_auth_tag|credential_key_id|credential_algorithm|unprojected-channel-metadata|unprojected-operation/);
      }
      const other=await req('/api/channels?merchant_id='+x.id,y);assert.equal(other.status,200);assert.deepEqual(other.body,{ok:true,channels:[expectedY]});
      assert.deepEqual(await stable(),before);
      await admin.query('REVOKE SELECT ON merchant_channels FROM '+runtime.authRole);revoked=true;
      assert.equal((await admin.query("SELECT has_table_privilege($1,'public.merchant_channels','SELECT') AS allowed",[runtime.authRole])).rows[0].allowed,false);
      await assert.rejects(authPool.query('SELECT credential_ciphertext FROM merchant_channels LIMIT 0'),e=>e.code==='42501');
      const failed=await fetch(origin+'/api/channels',{headers:{Cookie:x.cookie,'X-Fawri-Device-Id':x.device}});
      const failureText=await failed.text();
      assert.equal(failed.status,503,'channel read authority failure must use the bounded JSON unavailable response');
      assert.equal(failed.headers.get('cache-control'),'no-store');
      assert.deepEqual(JSON.parse(failureText),{ok:false,code:'META_CHANNEL_LIST_UNAVAILABLE',error:'Meta channel list is unavailable'});
      assert.doesNotMatch(failureText,/merchant_channels|42501|permission denied|credential_ciphertext|at .*\.ts/);
      assert.deepEqual(await stable(),before);
      await admin.query('GRANT SELECT ON merchant_channels TO '+runtime.authRole);revoked=false;
      assert.deepEqual((await req('/api/channels',x)).body,{ok:true,channels:[expectedX]});
      assert.deepEqual((await req('/api/channels',y)).body,{ok:true,channels:[expectedY]});
      assert.deepEqual(await stable(),before);faultPassed=true;
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      assert.equal((await req('/api/channels',x)).status,401);
      assert.deepEqual((await req('/api/channels',y)).body,{ok:true,channels:[expectedY]});
      assert.deepEqual(await stable(),before);passed=true;
    }finally{
      if(revoked)await admin.query('GRANT SELECT ON merchant_channels TO '+runtime.authRole);
    }
    console.log('P0_CHANNELS_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,
      passedCases:passed?1:0,allAssertionsPassed:passed,authSqlReadFaultAndRecovery:faultPassed,exactCredentialFreeProjection:passed,hosted:false}));
  });

  await t.test('current regional full-app actor tenant currency origin and SQL rollback boundary',async()=>{
    const x=await actor('merchant'),y=await actor('merchant');
    for(const [m,country,zone,currency] of [[x,'IQ','Asia/Baghdad','IQD'],[y,'AE','Asia/Dubai','AED']]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',country_code=$2,timezone=$3,currency_code=$4 WHERE id=$1",[m.id,country,zone,currency]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const path='/API/MeRcHaNt/ReGiOnAl/?merchant_id='+y.id;
    const allowed={Origin:'https://management.example.invalid'};
    const contextX={country_code:'IQ',timezone:'Asia/Baghdad',currency_code:'IQD',currency_fraction_digits:0};
    const contextY={country_code:'AE',timezone:'Asia/Dubai',currency_code:'AED',currency_fraction_digits:2};
    // Retention middleware refreshes updated_at on each authenticated request.
    // Compare every merchant column except that known housekeeping watermark.
    const state=async()=>({business:await snapshot(),merchants:(await admin.query("SELECT to_jsonb(m)-'updated_at' AS row FROM merchants m WHERE id=ANY($1::text[]) ORDER BY id",[[x.id,y.id]])).rows});
    // Establish the existing retention refresh through legitimate reads before
    // freezing the complete merchant row baseline; do not mask fields.
    for(const m of [x,y])assert.equal((await req('/api/merchant/regional',m)).status,200);
    const original=await state();
    let passed=false,readFault=false,rollback=false,revoked=false,triggerCreated=false,functionCreated=false,sequenceCreated=false;
    const fault='regional_fault_'+randomUUID().replaceAll('-',''),product='regional-product-'+randomUUID();
    try{
      for(const who of [undefined,owner,viewer,channelManager])for(const method of ['GET','PATCH']){
        const r=await req(path,who,method,method==='PATCH'?{currency_code:'USD'}:undefined,allowed);assert.equal(r.status,401);
        assert.doesNotMatch(JSON.stringify(r.body),/Asia\/Baghdad|Asia\/Dubai|currency_fraction_digits|password_hash/);
      }
      for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}]){
        for(const method of ['GET','PATCH'])assert.equal((await req(path,x,method,method==='PATCH'?{currency_code:'USD'}:undefined,{...allowed,...headers})).status,401);
      }
      for(const route of ['/api/merchant/regional',path]){
        const r=await req(route,x);assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.deepEqual(r.body,{ok:true,context:contextX});
      }
      assert.deepEqual((await req('/api/merchant/regional?merchant_id='+x.id,y)).body,{ok:true,context:contextY});
      assert.deepEqual(await state(),original);
      const foreign=await req(path,x,'PATCH',{currency_code:'USD'},{Origin:'https://foreign.example.invalid'});
      const afterForeign=await state();
      console.log('P0_REGIONAL_ORIGIN_OBSERVED '+JSON.stringify({status:foreign.status,currencyChanged:afterForeign.merchants.find(m=>m.row.id===x.id).row.currency_code!=='IQD'}));
      assert.equal(foreign.status,403);assert.equal(foreign.body.code,'AUTH_ORIGIN_FORBIDDEN');assert.deepEqual(afterForeign,original);
      const changed=await req(path,x,'PATCH',{merchant_id:y.id,country_code:'US',timezone:'America/New_York',currency_code:'USD'},allowed);
      assert.equal(changed.status,200);assert.equal(changed.cache,'no-store');
      const usd={...contextX,currency_code:'USD',currency_fraction_digits:2};
      assert.deepEqual(changed.body,{ok:true,context:usd,changed:true});
      const changedState=await state();assert.deepEqual(changedState.business,original.business);
      const oldRow=original.merchants.find(m=>m.row.id===x.id).row,newRow=changedState.merchants.find(m=>m.row.id===x.id).row;
      assert.deepEqual({...newRow,currency_code:oldRow.currency_code},oldRow);
      assert.deepEqual(changedState.merchants.find(m=>m.row.id===y.id),original.merchants.find(m=>m.row.id===y.id));
      const replay=await req(path,x,'PATCH',{currency_code:'USD'});assert.equal(replay.status,200);assert.deepEqual(replay.body,{ok:true,context:usd,changed:false});
      assert.deepEqual(await state(),changedState);
      const invalid=await req(path,x,'PATCH',{currency_code:'not-a-currency'},allowed);assert.equal(invalid.status,400);assert.deepEqual(await state(),changedState);
      await admin.query("INSERT INTO products(id,merchant_id,name,current_price_iqd,original_price_iqd) VALUES($1,$2,'Synthetic regional guard',100,100)",[product,x.id]);
      const money=(await admin.query('SELECT to_jsonb(p) AS row FROM products p WHERE id=$1',[product])).rows;
      const blocked=await req(path,x,'PATCH',{currency_code:'EUR'},allowed);assert.equal(blocked.status,409);
      assert.deepEqual(blocked.body,{ok:false,code:'MERCHANT_CURRENCY_CHANGE_BLOCKED',error:'currency cannot be changed after monetary operational data exists; no automatic FX conversion is performed',current_currency_code:'USD',requested_currency_code:'EUR',blockers:['catalog']});
      assert.deepEqual(await state(),changedState);assert.deepEqual((await admin.query('SELECT to_jsonb(p) AS row FROM products p WHERE id=$1',[product])).rows,money);
      await admin.query('DELETE FROM products WHERE id=$1',[product]);
      await admin.query('REVOKE SELECT ON products FROM '+runtime.role);revoked=true;
      assert.equal((await admin.query("SELECT has_table_privilege($1,'public.products','SELECT') AS allowed",[runtime.role])).rows[0].allowed,false);
      await assert.rejects(runtime.runtimePool.query('SELECT 1 FROM products LIMIT 0'),e=>e.code==='42501');
      const unavailable=await req(path,x,'PATCH',{currency_code:'EUR'},allowed);assert.equal(unavailable.status,500);assert.equal(unavailable.cache,'no-store');
      assert.deepEqual(unavailable.body,{ok:false,code:'MERCHANT_REGIONAL_OPERATION_FAILED',error:'merchant regional operation failed'});
      assert.deepEqual(await state(),changedState);readFault=true;
      await admin.query('GRANT SELECT ON products TO '+runtime.role);revoked=false;
      await admin.query(`CREATE SEQUENCE ${fault}`);sequenceCreated=true;
      await admin.query(`GRANT USAGE ON SEQUENCE ${fault} TO ${runtime.role}`);
      await admin.query(`CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $regional_fault$
        BEGIN IF NEW.id=TG_ARGV[0] THEN PERFORM nextval(TG_ARGV[1]::regclass); RAISE EXCEPTION 'synthetic regional post-update rollback fault'; END IF; RETURN NEW; END $regional_fault$`);functionCreated=true;
      await admin.query(`CREATE TRIGGER ${fault} AFTER UPDATE OF currency_code ON merchants FOR EACH ROW EXECUTE FUNCTION ${fault}('${x.id}','${fault}')`);triggerCreated=true;
      const failed=await req(path,x,'PATCH',{currency_code:'EUR'},allowed);assert.equal(failed.status,500);
      assert.deepEqual(failed.body,{ok:false,code:'MERCHANT_REGIONAL_OPERATION_FAILED',error:'merchant regional operation failed'});
      const reached=(await admin.query(`SELECT last_value::int AS value,is_called FROM ${fault}`)).rows[0];assert.deepEqual(reached,{value:1,is_called:true});
      assert.deepEqual(await state(),changedState);rollback=true;
      await admin.query(`DROP TRIGGER ${fault} ON merchants`);triggerCreated=false;
      const recovered=await req(path,x,'PATCH',{currency_code:'EUR'},allowed);assert.equal(recovered.status,200);
      assert.deepEqual(recovered.body,{ok:true,context:{...contextX,currency_code:'EUR',currency_fraction_digits:2},changed:true});
      assert.deepEqual((await req('/api/merchant/regional',y)).body,{ok:true,context:contextY});
      const recoveredState=await state();
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      for(const method of ['GET','PATCH'])assert.equal((await req(path,x,method,method==='PATCH'?{currency_code:'JPY'}:undefined,allowed)).status,401);
      assert.deepEqual(await state(),recoveredState);passed=true;
    }finally{
      if(revoked)await admin.query('GRANT SELECT ON products TO '+runtime.role);
      if(triggerCreated)await admin.query(`DROP TRIGGER ${fault} ON merchants`);
      if(functionCreated)await admin.query(`DROP FUNCTION ${fault}()`);
      if(sequenceCreated)await admin.query(`DROP SEQUENCE ${fault}`);
      await admin.query('DELETE FROM products WHERE id=$1',[product]);
    }
    console.log('P0_REGIONAL_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,
      allAssertionsPassed:passed,sqlGuardReadFault:readFault,postUpdateRollback:rollback,hosted:false}));
  });

  await t.test('current catalog full-app private nested fields tenant actors and archive SQL read failure boundary',async()=>{
    const x=await actor('merchant'),y=await actor('merchant');
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const catalog=await import('../src/services/postgresCatalogAuthority.ts');
    const core=await import('../src/services/postgresCatalogAuthorityCore.ts');
    const firstId='catalog-http-'+randomUUID(),peerId='catalog-http-'+randomUUID();
    const variantId='catalog-variant-'+randomUUID(),archivedId='catalog-variant-'+randomUUID(),peerVariantId='catalog-variant-'+randomUUID();
    const tenantIds=[x.id,y.id],catalogTables=['catalog_image_references','catalog_variant_options','product_variants','catalog_idempotency_keys','products'];
    const coreColumns='id,product_id,merchant_id,name,sku,barcode,quantity,price_override_iqd,weight_g,length_mm,width_mm,height_mm,created_at,updated_at';
    let grantsChanged=false,passed=false,faultPassed=false;
    async function restoreGrants(){
      await admin.query('GRANT SELECT ON product_variants TO '+runtime.role);
      await admin.query('REVOKE SELECT('+coreColumns+') ON product_variants FROM '+runtime.role);
      grantsChanged=false;
    }
    try{
      const first=(await catalog.createCatalogProductAuthoritative({merchantId:x.id,idempotencyKey:'catalog-http-create-'+firstId,input:{
        id:firstId,name:'Owned private catalog product',price_iqd:1000,cost_iqd:88,low_stock_threshold:1,status:'available',allow_fawri_reply:true,track_inventory:true,
        image_refs:[{url:'https://images.example.invalid/owned-root',storage_key:'synthetic/owned-root',alt:'Owned image'}],
        variants:[{id:variantId,name:'Blue',price_iqd:1100,cost_iqd:77,stock_quantity:3,options:{Color:'Blue'},
          image_refs:[{url:'https://images.example.invalid/owned-blue',storage_key:'synthetic/owned-blue',alt:'Owned blue image'}]},
          {id:archivedId,name:'Archived red',cost_iqd:66,stock_quantity:4,options:{Color:'Red'}}],
      }})).product;
      const peer=(await catalog.createCatalogProductAuthoritative({merchantId:y.id,idempotencyKey:'catalog-http-create-'+peerId,input:{
        id:peerId,name:'Peer private catalog product',price_iqd:2000,cost_iqd:55,low_stock_threshold:1,status:'available',allow_fawri_reply:true,track_inventory:true,
        variants:[{id:peerVariantId,name:'Green',cost_iqd:44,stock_quantity:2,options:{Color:'Green'}}],
      }})).product;
      await admin.query("UPDATE products SET metadata=metadata||'{\"private_extension\":\"unprojected-catalog-metadata\"}'::jsonb WHERE id=$1",[firstId]);
      await admin.query("UPDATE product_variants SET metadata=COALESCE(metadata,'{}'::jsonb)||'{\"catalog_archived\":true}'::jsonb WHERE id=$1",[archivedId]);
      const ownVariant=first.variants.find(v=>v.id===variantId),otherVariant=peer.variants.find(v=>v.id===peerVariantId);
      const expected={id:firstId,merchant_id:x.id,name:'Owned private catalog product',price_iqd:1000,stock_quantity:7,low_stock_threshold:1,
        status:'available',allow_fawri_reply:true,created_at:first.created_at,updated_at:first.updated_at,version:1,item_type:'product',track_inventory:true,cost_iqd:88,
        image_refs:[{id:first.image_refs[0].id,url:'https://images.example.invalid/owned-root',storage_key:'synthetic/owned-root',alt:'Owned image'}],
        variants:[{id:variantId,name:'Blue',price_iqd:1100,cost_iqd:77,stock_quantity:3,options:{Color:'Blue'},created_at:ownVariant.created_at,updated_at:ownVariant.updated_at,
          image_refs:[{id:ownVariant.image_refs[0].id,url:'https://images.example.invalid/owned-blue',storage_key:'synthetic/owned-blue',alt:'Owned blue image'}]}]};
      const expectedPeer={id:peerId,merchant_id:y.id,name:'Peer private catalog product',price_iqd:2000,stock_quantity:2,low_stock_threshold:1,
        status:'available',allow_fawri_reply:true,created_at:peer.created_at,updated_at:peer.updated_at,version:1,item_type:'product',track_inventory:true,cost_iqd:55,image_refs:[],
        variants:[{id:peerVariantId,name:'Green',cost_iqd:44,stock_quantity:2,options:{Color:'Green'},created_at:otherVariant.created_at,updated_at:otherVariant.updated_at,image_refs:[]}]};
      const stable=async()=>({business:await snapshot(),catalog:Object.fromEntries(await Promise.all(catalogTables.map(async table=>[table,
        (await admin.query(`SELECT to_jsonb(c) AS row FROM ${table} c WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(c)::text`,[tenantIds])).rows])))});
      const before=await stable(),listPath='/api/catalog/products',detailPath=listPath+'/'+encodeURIComponent(firstId);
      for(const path of [listPath,detailPath,'/API/CaTaLoG/PrOdUcTs/?merchant_id='+y.id,'/API/CaTaLoG/PrOdUcTs/'+encodeURIComponent(firstId)+'/?merchant_id='+y.id]){
        for(const who of [undefined,owner,viewer,channelManager]){
          const r=await req(path,who);assert.equal(r.status,401);assert.doesNotMatch(JSON.stringify(r.body),/private catalog product|synthetic\/owned|unprojected-catalog-metadata|cost_iqd/);
        }
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}])assert.equal((await req(path,x,'GET',undefined,headers)).status,401);
        const r=await req(path,x);assert.equal(r.status,200);assert.equal(r.cache,'no-store');
        assert.deepEqual(r.body,path.toLowerCase().includes(firstId.toLowerCase())?{ok:true,product:expected}:{ok:true,merchant_id:x.id,count:1,products:[expected]});
        assert.doesNotMatch(JSON.stringify(r.body),/unprojected-catalog-metadata|private_extension|fawri_catalog_v2|variant_costs_iqd|Archived red/);
      }
      assert.deepEqual((await req(listPath+'?merchant_id='+x.id,y)).body,{ok:true,merchant_id:y.id,count:1,products:[expectedPeer]});
      const foreign=await req(detailPath,y);assert.equal(foreign.status,404);assert.equal(foreign.body.code,'CATALOG_PRODUCT_NOT_FOUND');
      assert.deepEqual(await stable(),before);
      assert.equal((await admin.query("SELECT has_table_privilege($1,'public.product_variants','SELECT') AS allowed",[runtime.role])).rows[0].allowed,true);
      await admin.query('REVOKE SELECT ON product_variants FROM '+runtime.role);grantsChanged=true;
      await admin.query('GRANT SELECT('+coreColumns+') ON product_variants TO '+runtime.role);
      assert.equal((await admin.query("SELECT has_column_privilege($1,'public.product_variants','metadata','SELECT') AS allowed",[runtime.role])).rows[0].allowed,false);
      await assert.rejects(runtime.runtimePool.query('SELECT metadata FROM product_variants LIMIT 0'),e=>e.code==='42501');
      // The original core graph SELECTs still complete. Only the wrapper's
      // later archive-metadata query is unavailable under these owned grants.
      assert.equal((await core.getCatalogProductAuthoritative(x.id,firstId)).variants.length,2);
      assert.equal((await core.listCatalogProductsAuthoritative(y.id)).length,1);
      await assert.rejects(catalog.getCatalogProductAuthoritative(x.id,firstId),e=>e.code==='42501');
      for(const path of [listPath,detailPath]){
        const failed=await req(path,x);assert.equal(failed.status,500);assert.equal(failed.cache,'no-store');
        assert.deepEqual(failed.body,{ok:false,code:'CATALOG_OPERATION_FAILED',error:'catalog operation failed'});
      }
      assert.deepEqual(await stable(),before);
      await restoreGrants();
      assert.deepEqual((await req(detailPath,x)).body,{ok:true,product:expected});
      assert.deepEqual((await req(listPath,y)).body,{ok:true,merchant_id:y.id,count:1,products:[expectedPeer]});
      assert.deepEqual(await stable(),before);faultPassed=true;
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      for(const path of [listPath,detailPath])assert.equal((await req(path,x)).status,401);
      assert.deepEqual((await req(listPath,y)).body,{ok:true,merchant_id:y.id,count:1,products:[expectedPeer]});
      assert.deepEqual(await stable(),before);passed=true;
    }finally{
      if(grantsChanged)await restoreGrants();
      for(const table of catalogTables)await admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[tenantIds]);
    }
    console.log('P0_CATALOG_READ_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,
      allAssertionsPassed:passed,archiveSqlReadFaultAfterCoreSuccess:faultPassed,hosted:false}));
  });

  await t.test('current catalog context and promotion list full-app actor tenant field and SQL failure boundary',async()=>{
    const x=await actor('merchant'),y=await actor('merchant');
    for(const [m,country,zone,currency] of [[x,'IQ','Asia/Baghdad','IQD'],[y,'AE','Asia/Dubai','AED']]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected',country_code=$2,timezone=$3,currency_code=$4 WHERE id=$1",[m.id,country,zone,currency]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const promotion=await import('../src/services/postgresCommercePromotionAuthority.ts');
    const tenantIds=[x.id,y.id],contexts=[{country_code:'IQ',timezone:'Asia/Baghdad',currency_code:'IQD',currency_fraction_digits:0},
      {country_code:'AE',timezone:'Asia/Dubai',currency_code:'AED',currency_fraction_digits:2}];
    const expected=[];let revoked=false,passed=false,faultPassed=false;
    try{
      for(const [m,index] of [[x,0],[y,1]]){
        const name=index===0?'Owned private delivery promotion':'Peer private delivery promotion';
        const created=await promotion.createCommercePromotionAuthoritative({merchantId:m.id,idempotencyKey:'promotion-http-'+randomUUID(),input:{
          name,scope:'delivery',effect:'free_delivery',minimum_subtotal_minor:index===0?10000:2500,
          starts_local:'2030-01-01T09:00',ends_local:'2030-01-02T09:00',priority:10,enabled:false,
        }});
        expected.push({id:created.promotion.id,merchant_id:m.id,name,scope:'delivery',effect:'free_delivery',currency_code:contexts[index].currency_code,
          minimum_subtotal_minor:index===0?10000:2500,starts_at:index===0?'2030-01-01T06:00:00.000Z':'2030-01-01T05:00:00.000Z',
          ends_at:index===0?'2030-01-02T06:00:00.000Z':'2030-01-02T05:00:00.000Z',schedule_timezone:contexts[index].timezone,
          priority:10,enabled:false,version:1,lifecycle:'disabled',starts_local:'2030-01-01T09:00:00',ends_local:'2030-01-02T09:00:00'});
      }
      await admin.query("UPDATE commerce_promotions SET metadata=metadata||'{\"private_extension\":\"unprojected-promotion-metadata\"}'::jsonb WHERE merchant_id=ANY($1::text[])",[tenantIds]);
      const stable=async()=>({business:await snapshot(),promotions:(await admin.query('SELECT to_jsonb(p) AS row FROM commerce_promotions p WHERE merchant_id=ANY($1::text[]) ORDER BY id',[tenantIds])).rows});
      const before=await stable(),contextPath='/api/catalog/context',listPath='/api/catalog/promotions';
      for(const path of [contextPath,listPath,'/API/CaTaLoG/CoNtExT/?merchant_id='+y.id,'/API/CaTaLoG/PrOmOtIoNs/?merchant_id='+y.id]){
        for(const who of [undefined,owner,viewer,channelManager]){
          const r=await req(path,who);assert.equal(r.status,401);assert.doesNotMatch(JSON.stringify(r.body),/private delivery promotion|minimum_subtotal_minor|Asia\/Baghdad|unprojected-promotion-metadata/);
        }
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}])assert.equal((await req(path,x,'GET',undefined,headers)).status,401);
        const r=await req(path,x);assert.equal(r.status,200);assert.equal(r.cache,'no-store');
        assert.deepEqual(r.body,path.toLowerCase().includes('/context')?{ok:true,context:contexts[0]}:{ok:true,merchant_id:x.id,count:1,promotions:[expected[0]]});
        assert.doesNotMatch(JSON.stringify(r.body),/private_extension|unprojected-promotion-metadata|create_request_hash|created_at|updated_at/);
      }
      assert.deepEqual((await req(contextPath+'?merchant_id='+x.id,y)).body,{ok:true,context:contexts[1]});
      assert.deepEqual((await req(listPath+'?merchant_id='+x.id,y)).body,{ok:true,merchant_id:y.id,count:1,promotions:[expected[1]]});
      assert.deepEqual(await stable(),before);
      await admin.query('REVOKE SELECT ON commerce_promotions FROM '+runtime.role);revoked=true;
      assert.equal((await admin.query("SELECT has_table_privilege($1,'public.commerce_promotions','SELECT') AS allowed",[runtime.role])).rows[0].allowed,false);
      await assert.rejects(runtime.runtimePool.query('SELECT 1 FROM commerce_promotions LIMIT 0'),e=>e.code==='42501');
      for(const path of [listPath,'/API/CaTaLoG/PrOmOtIoNs/?merchant_id='+y.id]){
        const failed=await req(path,x);assert.equal(failed.status,500);assert.equal(failed.cache,'no-store');
        assert.deepEqual(failed.body,{ok:false,code:'CATALOG_OPERATION_FAILED',error:'catalog operation failed'});
      }
      assert.deepEqual((await req(contextPath,x)).body,{ok:true,context:contexts[0]});
      assert.deepEqual(await stable(),before);
      await admin.query('GRANT SELECT ON commerce_promotions TO '+runtime.role);revoked=false;
      for(const [m,index] of [[x,0],[y,1]])assert.deepEqual((await req(listPath,m)).body,{ok:true,merchant_id:m.id,count:1,promotions:[expected[index]]});
      assert.deepEqual(await stable(),before);faultPassed=true;
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      for(const path of [contextPath,listPath])assert.equal((await req(path,x)).status,401);
      assert.deepEqual((await req(listPath,y)).body,{ok:true,merchant_id:y.id,count:1,promotions:[expected[1]]});
      assert.deepEqual(await stable(),before);passed=true;
    }finally{
      if(revoked)await admin.query('GRANT SELECT ON commerce_promotions TO '+runtime.role);
      await admin.query('DELETE FROM commerce_promotions WHERE merchant_id=ANY($1::text[])',[tenantIds]);
    }
    console.log('P0_CATALOG_CONTEXT_PROMOTIONS_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,
      allAssertionsPassed:passed,promotionSqlReadFaultAndRecovery:faultPassed,hosted:false}));
  });

  await t.test('current catalog image full-app tenant actor bytes headers and physical read failure boundary',async()=>{
    const x=await actor('merchant'),y=await actor('merchant');
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const media=await import('../src/services/catalogMediaStorage.ts');
    const {getFawriDataDir}=await import('../src/lib/dataPaths.ts');
    const path=await import('node:path'),{createHash}=await import('node:crypto');
    const previousProvider=process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER;
    process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER='filesystem';
    const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    const ownBytes=Buffer.concat([png,Buffer.from('synthetic-owned-media-bytes')]),peerBytes=Buffer.concat([png,Buffer.from('synthetic-peer-media-bytes')]);
    let ownFile,backup,passed=false,faultPassed=false;
    async function raw(url,who,headers={}){
      const r=await fetch(origin+url,{headers:{...(who?{Cookie:who.cookie,'X-Fawri-Device-Id':who.device}:{}),...headers}});
      return {status:r.status,headers:r.headers,body:Buffer.from(await r.arrayBuffer())};
    }
    async function image(url,who,expected){
      const r=await raw(url,who);assert.equal(r.status,200);assert.deepEqual(r.body,expected);
      assert.equal(r.headers.get('content-type'),'image/png');assert.equal(r.headers.get('cache-control'),'private, max-age=300');
      assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('etag'),'"'+createHash('sha256').update(expected).digest('hex')+'"');
    }
    async function error(url,who,status,code){
      const r=await raw(url,who);assert.equal(r.status,status);
      if(status!==401)assert.equal(r.headers.get('cache-control'),'no-store');
      const body=JSON.parse(r.body.toString());assert.equal(body.ok,false);if(code)assert.equal(body.code,code);
      assert.doesNotMatch(r.body.toString(),/synthetic-owned-media-bytes|synthetic-peer-media-bytes|catalog-media\/|EISDIR|ENOENT|at .*\.ts/);
      return body;
    }
    try{
      // Existing storage ownership permits preview before any product or SQL
      // image-reference attachment; do not invent a new attachment requirement.
      const own=await media.storeCatalogImage({merchantId:x.id,buffer:ownBytes,suppliedMime:'image/png'});
      const peer=await media.storeCatalogImage({merchantId:y.id,buffer:peerBytes,suppliedMime:'image/png'});
      ownFile=path.join(getFawriDataDir(),'catalog-media',own.storage_key);backup=ownFile+'.owned-test-backup';
      const before=await snapshot();
      const variant='/API/CaTaLoG/MeDiA/ImAgEs/?storage_key='+encodeURIComponent(own.storage_key)+'&merchant_id='+y.id;
      for(const url of [own.preview_url,variant]){
        for(const who of [undefined,owner,viewer,channelManager])await error(url,who,401);
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}]){
          const r=await raw(url,x,headers);assert.equal(r.status,401);assert.ok(!r.body.equals(ownBytes));
        }
        await image(url,x,ownBytes);
      }
      await image(peer.preview_url+'&merchant_id='+x.id,y,peerBytes);
      await error(own.preview_url,y,403,'CATALOG_MEDIA_ACCESS_FORBIDDEN');
      await error(peer.preview_url,x,403,'CATALOG_MEDIA_ACCESS_FORBIDDEN');
      for(const key of ['',own.storage_key+'../x.png'])await error('/api/catalog/media/images?storage_key='+encodeURIComponent(key),x,403,'CATALOG_MEDIA_ACCESS_FORBIDDEN');
      const missing=own.storage_key.replace(/[^/]+$/,'owned-missing.png');
      await error('/api/catalog/media/images?storage_key='+encodeURIComponent(missing),x,404,'CATALOG_IMAGE_NOT_FOUND');
      assert.deepEqual(fs.readFileSync(ownFile),ownBytes);assert.deepEqual(await snapshot(),before);
      fs.writeFileSync(ownFile,Buffer.from('synthetic-invalid-image-content'));
      await error(own.preview_url,x,503,'CATALOG_IMAGE_CORRUPT');
      fs.writeFileSync(ownFile,ownBytes);await image(own.preview_url,x,ownBytes);
      // Reach a real filesystem read error, rather than only mocking the
      // service: the owned key temporarily names an owned directory.
      fs.renameSync(ownFile,backup);fs.mkdirSync(ownFile);
      const failed=await error(own.preview_url,x,500,'CATALOG_OPERATION_FAILED');
      assert.deepEqual(failed,{ok:false,code:'CATALOG_OPERATION_FAILED',error:'catalog operation failed'});
      await image(peer.preview_url,y,peerBytes);assert.deepEqual(await snapshot(),before);
      fs.rmdirSync(ownFile);fs.renameSync(backup,ownFile);
      await image(own.preview_url,x,ownBytes);faultPassed=true;
      process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER='synthetic-unavailable';
      await error(own.preview_url,x,503,'CATALOG_MEDIA_STORAGE_PROVIDER_UNAVAILABLE');
      process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER='filesystem';
      await image(own.preview_url,x,ownBytes);await image(peer.preview_url,y,peerBytes);
      assert.deepEqual(await snapshot(),before);
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      const revoked=await raw(own.preview_url,x);assert.equal(revoked.status,401);assert.ok(!revoked.body.equals(ownBytes));
      await image(peer.preview_url,y,peerBytes);assert.deepEqual(await snapshot(),before);passed=true;
    }finally{
      await cleanupResources([
        ...[x,y].map(m=>['owned catalog media prefix',()=>media.removeCatalogMerchantMedia({storageProvider:'filesystem',merchantId:m.id})]),
        ['catalog media provider env',()=>{if(previousProvider===undefined)delete process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER;
          else process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER=previousProvider;}],
      ]);
    }
    console.log('P0_CATALOG_MEDIA_READ_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,
      allAssertionsPassed:passed,physicalReadFaultAndRecovery:faultPassed,filesystemOnly:true,hosted:false}));
  });

  await t.test('current catalog upload full-app actor origin binary parser and physical write failure boundary',async()=>{
    const x=await actor('merchant'),y=await actor('merchant');
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const media=await import('../src/services/catalogMediaStorage.ts'),{getFawriDataDir}=await import('../src/lib/dataPaths.ts');
    const path=await import('node:path'),{createHash}=await import('node:crypto');
    const oldProvider=process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER;process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER='filesystem';
    const prefix=m=>'merchant/'+createHash('sha256').update(m.id).digest('hex').slice(0,32)+'/';
    const root=path.join(getFawriDataDir(),'catalog-media'),ownRoot=path.resolve(root,prefix(x)),backup=ownRoot+'.owned-upload-backup';
    const bytes=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.from('synthetic-upload-bytes')]);
    const url='/API/CaTaLoG/MeDiA/ImAgEs/?merchant_id='+y.id,allowed={Origin:'https://management.example.invalid'};
    async function upload(who,body=bytes,headers={}){
      const r=await fetch(origin+url,{method:'POST',headers:{'Content-Type':'image/png',...(who?{Cookie:who.cookie,'X-Fawri-Device-Id':who.device}:{}),...headers},body});
      return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};
    }
    const files=()=>Object.fromEntries([x,y].map(m=>{const dir=path.join(root,prefix(m));return [m.id,fs.existsSync(dir)?fs.readdirSync(dir).sort().map(name=>({name,sha:createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')})):[]];}));
    const restore=()=>{if(fs.existsSync(backup)){fs.rmSync(ownRoot,{recursive:true,force:true});fs.renameSync(backup,ownRoot);}};
    async function success(who,headers){
      const r=await upload(who,bytes,headers);assert.equal(r.status,201);assert.equal(r.cache,'no-store');assert.deepEqual(Object.keys(r.body).sort(),['asset','ok']);assert.equal(r.body.ok,true);
      const a=r.body.asset;assert.deepEqual(Object.keys(a).sort(),['mime_type','preview_url','sha256','size_bytes','storage_key']);
      assert.ok(a.storage_key.startsWith(prefix(who)));assert.match(a.storage_key,/\/[0-9a-f-]{36}\.png$/);
      assert.equal(a.preview_url,'/api/catalog/media/images?storage_key='+encodeURIComponent(a.storage_key));assert.equal(a.mime_type,'image/png');
      assert.equal(a.size_bytes,bytes.length);assert.equal(a.sha256,createHash('sha256').update(bytes).digest('hex'));
      assert.deepEqual(fs.readFileSync(path.join(root,a.storage_key)),bytes);
      const preview=await fetch(origin+a.preview_url,{headers:{Cookie:who.cookie,'X-Fawri-Device-Id':who.device}});assert.equal(preview.status,200);assert.deepEqual(Buffer.from(await preview.arrayBuffer()),bytes);
      return a;
    }
    let passed=false,writeFault=false;
    try{
      const business=await snapshot(),empty=files();
      for(const who of [undefined,owner,viewer,channelManager])assert.equal((await upload(who)).status,401);
      for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}])assert.equal((await upload(x,bytes,{...allowed,...headers})).status,401);
      assert.deepEqual(files(),empty);assert.deepEqual(await snapshot(),business);
      const foreign=await upload(x,bytes,{Origin:'https://foreign.example.invalid'}),afterForeign=files();
      console.log('P0_CATALOG_UPLOAD_ORIGIN_OBSERVED '+JSON.stringify({status:foreign.status,filesCreated:afterForeign[x.id].length-empty[x.id].length}));
      assert.equal(foreign.status,403);assert.equal(foreign.body.code,'AUTH_ORIGIN_FORBIDDEN');assert.deepEqual(afterForeign,empty);
      const first=await success(x,allowed),peer=await success(y,{}),stored=files();
      assert.equal(stored[x.id].length,1);assert.equal(stored[y.id].length,1);
      for(const [body,type,status,code] of [[bytes,'image/jpeg',415,'CATALOG_IMAGE_TYPE_MISMATCH'],[Buffer.from('invalid magic'),'image/png',415,'CATALOG_IMAGE_TYPE_MISMATCH'],[Buffer.alloc(0),'image/png',400,'CATALOG_IMAGE_REQUIRED'],[Buffer.from('{}'),'application/json',400,'CATALOG_IMAGE_REQUIRED']]){
        const rejected=await upload(x,body,{...allowed,'Content-Type':type});assert.equal(rejected.status,status);assert.equal(rejected.body.code,code);assert.equal(rejected.cache,'no-store');assert.deepEqual(files(),stored);
      }
      const large=Buffer.alloc(media.CATALOG_IMAGE_MAX_BYTES+1);bytes.copy(large);
      const oversized=await upload(x,large,allowed);assert.equal(oversized.status,413);assert.equal(oversized.body.code,'CATALOG_IMAGE_TOO_LARGE');assert.equal(oversized.body.max_bytes,media.CATALOG_IMAGE_MAX_BYTES);assert.deepEqual(files(),stored);
      process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER='synthetic-unavailable';
      const unavailable=await upload(x,bytes,allowed);assert.equal(unavailable.status,503);assert.equal(unavailable.body.code,'CATALOG_MEDIA_STORAGE_PROVIDER_UNAVAILABLE');assert.deepEqual(files(),stored);
      process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER='filesystem';
      fs.renameSync(ownRoot,backup);fs.writeFileSync(ownRoot,'synthetic-owned-write-blocker');
      const failed=await upload(x,bytes,allowed);assert.equal(failed.status,500);assert.equal(failed.cache,'no-store');
      assert.deepEqual(failed.body,{ok:false,code:'CATALOG_OPERATION_FAILED',error:'catalog operation failed'});
      assert.deepEqual(fs.readFileSync(path.join(root,peer.storage_key)),bytes);assert.deepEqual(await snapshot(),business);
      restore();assert.deepEqual(files(),stored);assert.deepEqual(fs.readFileSync(path.join(root,first.storage_key)),bytes);
      await success(x,allowed);assert.equal(files()[x.id].length,2);assert.deepEqual(files()[y.id],stored[y.id]);writeFault=true;
      const beforeRevoke=files();assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      assert.equal((await upload(x,bytes,allowed)).status,401);assert.deepEqual(files(),beforeRevoke);assert.deepEqual(await snapshot(),business);passed=true;
    }finally{
      await cleanupResources([
        ['owned upload backup',restore],
        ...[x,y].map(m=>['owned catalog upload prefix',()=>media.removeCatalogMerchantMedia({storageProvider:'filesystem',merchantId:m.id})]),
        ['catalog upload provider env',()=>{if(oldProvider===undefined)delete process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER;else process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER=oldProvider;}],
      ]);
    }
    console.log('P0_CATALOG_UPLOAD_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,
      allAssertionsPassed:passed,physicalWriteFaultAndRecovery:writeFault,filesystemOnly:true,hosted:false}));
  });

  await t.test('current catalog promotion writes full-app origin actor tenant version and SQL rollback boundary',async()=>{
    const x=await actor('merchant'),y=await actor('merchant'),tenantIds=[x.id,y.id];
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected',country_code='IQ',timezone='Asia/Baghdad',currency_code='IQD' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});
      m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const promotions=await import('../src/services/postgresCommercePromotionAuthority.ts');
    const catalog=await import('../src/services/postgresCatalogAuthority.ts');
    const base='/api/catalog/promotions',allowed={Origin:'https://management.example.invalid'},foreign={Origin:'https://foreign.example.invalid'};
    const draft={name:'Owned HTTP promotion',scope:'delivery',effect:'free_delivery',starts_local:'2030-01-01T09:00',ends_local:'2030-01-02T09:00',enabled:false,priority:7};
    const key='promotion-write-'+randomUUID(),fault='promo_write_fault_'+randomUUID().replaceAll('-','');
    let trigger=false,fn=false,sequence=false,passed=false,rollback=false;
    const stable=async()=>({business:await snapshot(),promotions:(await admin.query('SELECT to_jsonb(p) AS row FROM commerce_promotions p WHERE merchant_id=ANY($1::text[]) ORDER BY id',[tenantIds])).rows,
      products:(await admin.query('SELECT to_jsonb(p) AS row FROM products p WHERE merchant_id=ANY($1::text[]) ORDER BY id',[tenantIds])).rows,
      variants:(await admin.query('SELECT to_jsonb(p) AS row FROM product_variants p WHERE merchant_id=ANY($1::text[]) ORDER BY id',[tenantIds])).rows});
    async function unchanged(path,who,method,body,headers,status,code){
      const before=await stable(),r=await req(path,who,method,body,headers);assert.equal(r.status,status,path+' '+method);if(code)assert.equal(r.body.code,code);assert.deepEqual(await stable(),before);return r;
    }
    try{
      const seeds=[];
      for(const m of [x,x,y])seeds.push((await promotions.createCommercePromotionAuthoritative({merchantId:m.id,idempotencyKey:randomUUID(),input:draft})).promotion);
      // Observe every verb before asserting, so one source run establishes the whole family.
      const beforeOrigin=await stable(),observed=[];
      observed.push((await req(base,x,'POST',{promotion:draft},{...foreign,'Idempotency-Key':'foreign-'+key})).status);
      observed.push((await req(base+'/'+seeds[0].id,x,'PATCH',{expected_version:1,promotion:{name:'Foreign Origin patch'}},foreign)).status);
      observed.push((await req(base+'/'+seeds[1].id,x,'DELETE',{expected_version:1},foreign)).status);
      const afterOrigin=await stable();
      console.log('P0_PROMOTION_WRITE_ORIGIN_OBSERVED '+JSON.stringify({statuses:observed,rowsUnchanged:JSON.stringify(afterOrigin)===JSON.stringify(beforeOrigin)}));
      assert.deepEqual(observed,[403,403,403]);assert.deepEqual(afterOrigin,beforeOrigin);
      const endpoints=[[base,'POST',{promotion:draft}], [base+'/'+seeds[0].id,'PATCH',{expected_version:1,promotion:{name:'Denied patch'}}], [base+'/'+seeds[1].id,'DELETE',{expected_version:1}]];
      for(const [path,method,body] of endpoints){
        for(const who of [undefined,owner,viewer,channelManager])await unchanged(path,who,method,body,{...allowed,'Idempotency-Key':key},401);
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}])await unchanged(path,x,method,body,{...allowed,'Idempotency-Key':key,...headers},401);
        await unchanged(path,x,method,{...body,merchant_id:y.id},{...allowed,'Idempotency-Key':key},403,'MERCHANT_ACCESS_FORBIDDEN');
      }
      const created=await req(base+'?merchant_id='+y.id,x,'POST',{promotion:draft},{...allowed,'Idempotency-Key':key});
      assert.equal(created.status,201);assert.equal(created.cache,'no-store');assert.equal(created.body.replayed,false);
      const own=created.body.promotion;assert.equal(own.merchant_id,x.id);assert.equal(own.version,1);assert.equal(own.currency_code,'IQD');assert.equal(own.schedule_timezone,'Asia/Baghdad');assert.equal(own.starts_at,'2030-01-01T06:00:00.000Z');
      assert.doesNotMatch(JSON.stringify(created.body),/create_request_hash|metadata|created_at|updated_at/);
      const replayBefore=await stable();
      const replay=await fetch(origin+base,{method:'POST',headers:{Cookie:x.cookie,'X-Fawri-Device-Id':x.device,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({promotion:draft})});
      assert.equal(replay.status,200);assert.equal(replay.headers.get('Idempotent-Replay'),'true');assert.deepEqual(await replay.json(),{ok:true,replayed:true,promotion:own});assert.deepEqual(await stable(),replayBefore);
      await unchanged(base,x,'POST',{promotion:{...draft,name:'Changed retry'}},{...allowed,'Idempotency-Key':key},409,'COMMERCE_PROMOTION_IDEMPOTENCY_CONFLICT');
      const peer=await req(base,y,'POST',{promotion:draft},{'Idempotency-Key':key});assert.equal(peer.status,201);assert.equal(peer.body.promotion.merchant_id,y.id);assert.notEqual(peer.body.promotion.id,own.id);
      const peerRows=(await admin.query('SELECT to_jsonb(p) AS row FROM commerce_promotions p WHERE merchant_id=$1 ORDER BY id',[y.id])).rows;
      for(const method of ['PATCH','DELETE'])await unchanged(base+'/'+peer.body.promotion.id,x,method,method==='PATCH'?{expected_version:1,promotion:{name:'Foreign id'}}:{expected_version:1},allowed,404,'COMMERCE_PROMOTION_NOT_FOUND');
      for(const field of ['merchant_id','currency_code','schedule_timezone','starts_at','ends_at'])await unchanged(base,x,'POST',{promotion:{...draft,[field]:field==='merchant_id'?x.id:'synthetic-authority-override'}},{...allowed,'Idempotency-Key':randomUUID()},400,'COMMERCE_PROMOTION_AUTHORITY_OVERRIDE_FORBIDDEN');
      await unchanged(base,x,'POST',{promotion:draft},allowed,400,'COMMERCE_PROMOTION_IDEMPOTENCY_KEY_REQUIRED');
      const ownPath=base+'/'+own.id;
      await unchanged(ownPath,x,'PATCH',{promotion:{name:'Missing version'}},allowed,400);
      const edited=await req('/API/CaTaLoG/PrOmOtIoNs/'+own.id+'/?merchant_id='+y.id,x,'PATCH',{expected_version:1,promotion:{name:'Legitimate changed name'}},allowed);
      assert.equal(edited.status,200);assert.equal(edited.body.promotion.name,'Legitimate changed name');assert.equal(edited.body.promotion.version,2);assert.equal(edited.body.promotion.merchant_id,x.id);
      await unchanged(ownPath,x,'PATCH',{expected_version:1,promotion:{name:'Stale patch'}},allowed,409,'COMMERCE_PROMOTION_VERSION_CONFLICT');
      await unchanged(ownPath+'?expected_version=1',x,'DELETE',undefined,allowed,409,'COMMERCE_PROMOTION_VERSION_CONFLICT');
      const products=[];
      for(const m of [x,y]){
        const id='promo-target-'+randomUUID(),variant='promo-variant-'+randomUUID();
        const result=await catalog.createCatalogProductAuthoritative({merchantId:m.id,idempotencyKey:randomUUID(),input:{id,name:'Synthetic promotion target',price_iqd:1000,variants:[{id:variant,name:'Variant',stock_quantity:3,options:{Size:'M'}}]}});
        products.push(result.product);
      }
      const targetDraft={...draft,scope:'catalog_item',effect:'percentage_off',percentage_bps:1000,product_id:products[0].id,variant_id:products[0].variants[0].id};
      for(const promotion of [{...targetDraft,product_id:products[1].id,variant_id:products[1].variants[0].id},{...targetDraft,variant_id:products[1].variants[0].id}])await unchanged(base,x,'POST',{promotion},{...allowed,'Idempotency-Key':randomUUID()},404,'COMMERCE_PROMOTION_TARGET_NOT_FOUND');
      await unchanged(base,x,'POST',{promotion:{...targetDraft,percentage_bps:10001}},{...allowed,'Idempotency-Key':randomUUID()},400,'COMMERCE_PROMOTION_FIELD_INVALID');
      const targeted=await req(base,x,'POST',{promotion:targetDraft},{...allowed,'Idempotency-Key':randomUUID()});assert.equal(targeted.status,201);assert.equal(targeted.body.promotion.variant_id,products[0].variants[0].id);
      // Actual AFTER-row failures prove INSERT/UPDATE/DELETE were reached and rolled back.
      await admin.query(`CREATE SEQUENCE ${fault}`);sequence=true;await admin.query(`GRANT USAGE ON SEQUENCE ${fault} TO ${runtime.role}`);
      await admin.query(`CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $promo_fault$ BEGIN IF (CASE WHEN TG_OP='DELETE' THEN OLD.merchant_id ELSE NEW.merchant_id END)=TG_ARGV[0] THEN PERFORM nextval(TG_ARGV[1]::regclass); RAISE EXCEPTION 'synthetic promotion post-write fault'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $promo_fault$`);fn=true;
      await admin.query(`CREATE TRIGGER ${fault} AFTER INSERT OR UPDATE OR DELETE ON commerce_promotions FOR EACH ROW EXECUTE FUNCTION ${fault}('${x.id}','${fault}')`);trigger=true;
      const faultKey='fault-'+key;
      for(const [path,method,body,headers] of [[base,'POST',{promotion:draft},{...allowed,'Idempotency-Key':faultKey}],[ownPath,'PATCH',{expected_version:2,promotion:{name:'Rolled back patch'}},allowed],[ownPath+'?expected_version=2','DELETE',undefined,allowed]]){
        const failed=await unchanged(path,x,method,body,headers,500);assert.equal(failed.cache,'no-store');assert.deepEqual(failed.body,{ok:false,code:'CATALOG_OPERATION_FAILED',error:'catalog operation failed'});
      }
      assert.deepEqual((await admin.query(`SELECT last_value::int AS value,is_called FROM ${fault}`)).rows[0],{value:3,is_called:true});rollback=true;
      await admin.query(`DROP TRIGGER ${fault} ON commerce_promotions`);trigger=false;
      const recovered=await req(base,x,'POST',{promotion:draft},{...allowed,'Idempotency-Key':faultKey});assert.equal(recovered.status,201);assert.equal(recovered.body.replayed,false);
      const updated=await req(ownPath,x,'PATCH',{expected_version:2,promotion:{name:'Recovered patch'}});assert.equal(updated.status,200);assert.equal(updated.body.promotion.version,3);
      const deleted=await req(ownPath+'?expected_version=3',x,'DELETE');assert.equal(deleted.status,200);assert.deepEqual(deleted.body,{ok:true,deleted_promotion_id:own.id,deleted_version:3});
      await unchanged(ownPath+'?expected_version=3',x,'DELETE',undefined,allowed,404,'COMMERCE_PROMOTION_NOT_FOUND');
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      for(const [path,method,body] of endpoints)await unchanged(path,x,method,body,{...allowed,'Idempotency-Key':key},401);
      assert.equal((await req(base,y)).body.promotions.some(p=>p.id===peer.body.promotion.id),true);
      assert.deepEqual((await admin.query('SELECT to_jsonb(p) AS row FROM commerce_promotions p WHERE merchant_id=$1 ORDER BY id',[y.id])).rows,peerRows);passed=true;
    }finally{
      await cleanupResources([
        ['promotion fault trigger',()=>trigger?admin.query(`DROP TRIGGER ${fault} ON commerce_promotions`):undefined],
        ['promotion fault function',()=>fn?admin.query(`DROP FUNCTION ${fault}()`):undefined],
        ['promotion fault sequence',()=>sequence?admin.query(`DROP SEQUENCE ${fault}`):undefined],
        ['owned promotion rows',()=>admin.query('DELETE FROM commerce_promotions WHERE merchant_id=ANY($1::text[])',[tenantIds])],
        ...['catalog_image_references','catalog_variant_options','product_variants','catalog_idempotency_keys','products'].map(table=>['owned promotion targets '+table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[tenantIds])]),
      ]);
    }
    console.log('P0_PROMOTION_WRITE_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,allAssertionsPassed:passed,postWriteRollbackAllThreeVerbs:rollback,hosted:false}));
  });

  await t.test('current catalog product and inventory writes full-app origin isolation replay and SQL rollback boundary',async()=>{
    const x=await actor('merchant'),y=await actor('merchant'),tenantIds=[x.id,y.id];
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const catalog=await import('../src/services/postgresCatalogAuthority.ts');
    const base='/api/catalog/products',allowed={Origin:'https://management.example.invalid'},foreign={Origin:'https://foreign.example.invalid'};
    const key='catalog-write-'+randomUUID(),fault='catalog_write_fault_'+randomUUID().replaceAll('-','');
    const graphTables=['inventory_mutations','catalog_identifiers','catalog_image_references','catalog_variant_options','product_variants','catalog_idempotency_keys','products'];
    const input=(name)=>({id:'catalog-write-'+randomUUID(),name,sku:'SKU-'+randomUUID(),price_iqd:1000,stock_quantity:5,low_stock_threshold:1,track_inventory:true,status:'available',allow_fawri_reply:true});
    const stable=async()=>({business:await snapshot(),graph:Object.fromEntries(await Promise.all(graphTables.map(async table=>[table,(await admin.query(`SELECT to_jsonb(p) AS row FROM ${table} p WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(p)::text`,[tenantIds])).rows])))});
    const peerState=async()=>Object.fromEntries(await Promise.all(graphTables.map(async table=>[table,(await admin.query(`SELECT to_jsonb(p) AS row FROM ${table} p WHERE merchant_id=$1 ORDER BY to_jsonb(p)::text`,[y.id])).rows])));
    async function unchanged(path,who,method,body,headers,status,code){const before=await stable(),r=await req(path,who,method,body,headers);assert.equal(r.status,status,method+' '+path);if(code)assert.equal(r.body.code,code);assert.deepEqual(await stable(),before);return r;}
    const stockPath=(id,op)=>'/api/inventory/products/'+id+'/'+op;
    let productTrigger=false,mutationTrigger=false,fn=false,sequence=false,passed=false,rollback=false;
    try{
      const seeds=[];for(const m of [x,x,x,x,y])seeds.push((await catalog.createCatalogProductAuthoritative({merchantId:m.id,idempotencyKey:randomUUID(),input:input('Synthetic catalog seed')})).product);
      const endpoints=[
        [base,'POST',{product:input('Foreign Origin create')}],
        [base+'/import','POST',{products:[input('Foreign Origin import')]}],
        [base+'/'+seeds[0].id,'PATCH',{expected_version:1,product:{name:'Foreign Origin patch'}}],
        [base+'/'+seeds[1].id,'DELETE',{expected_version:1}],
        [stockPath(seeds[2].id,'set'),'POST',{expected_version:1,quantity:8}],
        [stockPath(seeds[3].id,'adjust'),'POST',{expected_version:1,delta:2,reason:'Synthetic foreign-origin adjustment'}],
      ];
      const original=await stable(),statuses=[];
      for(const [path,method,body] of endpoints)statuses.push((await req(path,x,method,body,{...foreign,'Idempotency-Key':randomUUID()})).status);
      const afterOrigin=await stable();console.log('P0_PRODUCT_WRITE_ORIGIN_OBSERVED '+JSON.stringify({statuses,rowsUnchanged:JSON.stringify(original)===JSON.stringify(afterOrigin)}));
      assert.deepEqual(statuses,[403,403,403,403,403,403]);assert.deepEqual(afterOrigin,original);
      for(const [path,method,body] of endpoints){
        for(const who of [undefined,owner,viewer,channelManager])await unchanged(path,who,method,body,{...allowed,'Idempotency-Key':key},401);
        for(const headers of [{'X-Fawri-Device-Id':'wrong'},{Cookie:`${x.cookie}; ${owner.cookie}`},{Cookie:'fawri_merchant_session=synthetic-invalid'}])await unchanged(path,x,method,body,{...allowed,'Idempotency-Key':key,...headers},401);
        await unchanged(path,x,method,{...body,merchant_id:y.id},{...allowed,'Idempotency-Key':key},403,'MERCHANT_ACCESS_FORBIDDEN');
      }
      const createInput=input('Legitimate created product');
      const created=await req(base+'?merchant_id='+y.id,x,'POST',{product:createInput},{...allowed,'Idempotency-Key':key});assert.equal(created.status,201);assert.equal(created.cache,'no-store');assert.equal(created.body.replayed,false);
      const own=created.body.product;assert.equal(own.id,createInput.id);assert.equal(own.merchant_id,x.id);assert.equal(own.stock_quantity,5);assert.equal(own.version,1);
      const beforeReplay=await stable();const replay=await fetch(origin+base,{method:'POST',headers:{Cookie:x.cookie,'X-Fawri-Device-Id':x.device,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({product:createInput})});
      assert.equal(replay.status,200);assert.equal(replay.headers.get('Idempotent-Replay'),'true');assert.deepEqual(await replay.json(),{ok:true,replayed:true,product:own});assert.deepEqual(await stable(),beforeReplay);
      await unchanged(base,x,'POST',{product:{...createInput,name:'Changed retry'}},{...allowed,'Idempotency-Key':key},409,'CATALOG_IDEMPOTENCY_CONFLICT');
      const peerInput=input('Peer legitimate product');const peer=await req(base,y,'POST',peerInput,{'Idempotency-Key':key});assert.equal(peer.status,201);assert.equal(peer.body.product.merchant_id,y.id);const peerBefore=await peerState();
      const imports=[input('Imported first'),input('Imported second')],importKey='import-'+key;
      const imported=await req(base+'/import',x,'POST',{products:imports},{...allowed,'Idempotency-Key':importKey});assert.equal(imported.status,201);assert.equal(imported.body.created_count,2);assert.equal(imported.body.replayed,false);assert.deepEqual(imported.body.products.map(p=>p.id),imports.map(p=>p.id));
      const beforeImportReplay=await stable();const importedAgain=await req(base+'/import',x,'POST',{products:imports},{'Idempotency-Key':importKey});assert.equal(importedAgain.status,200);assert.equal(importedAgain.body.replayed,true);assert.equal(importedAgain.body.created_count,2);assert.deepEqual(await stable(),beforeImportReplay);
      await unchanged(base+'/import',x,'POST',{products:[]},{...allowed,'Idempotency-Key':randomUUID()},400,'CATALOG_IMPORT_EMPTY');
      for(const [path,method,body] of [[base+'/'+seeds[4].id,'PATCH',{expected_version:1,product:{name:'Wrong tenant'}}],[base+'/'+seeds[4].id,'DELETE',{expected_version:1}],[stockPath(seeds[4].id,'set'),'POST',{expected_version:1,quantity:8}],[stockPath(seeds[4].id,'adjust'),'POST',{expected_version:1,delta:1}]])await unchanged(path,x,method,body,{...allowed,'Idempotency-Key':randomUUID()},404,'CATALOG_PRODUCT_NOT_FOUND');
      const edited=await req('/API/CaTaLoG/PrOdUcTs/'+own.id+'/?merchant_id='+y.id,x,'PATCH',{expected_version:1,product:{name:'Legitimate edited product'}},allowed);assert.equal(edited.status,200);assert.equal(edited.body.product.version,2);assert.equal(edited.body.product.name,'Legitimate edited product');assert.equal(edited.body.product.merchant_id,x.id);
      await unchanged(base+'/'+own.id,x,'PATCH',{expected_version:1,product:{name:'Stale edit'}},allowed,409,'CATALOG_VERSION_CONFLICT');
      const inventoryId=seeds[2].id;
      const set=await req(stockPath(inventoryId,'set'),x,'POST',{expected_version:1,quantity:8},allowed);assert.equal(set.status,200);assert.equal(set.body.product.version,2);assert.equal(set.body.product.stock_quantity,8);
      const adjustBody={expected_version:2,delta:-3,reason:'Synthetic authorized adjustment'},adjustKey='adjust-'+key;
      const adjusted=await req(stockPath(inventoryId,'adjust'),x,'POST',adjustBody,{'Idempotency-Key':adjustKey});assert.equal(adjusted.status,200);assert.equal(adjusted.body.replayed,false);assert.equal(adjusted.body.product.stock_quantity,5);assert.equal(adjusted.body.product.version,3);
      const beforeAdjustReplay=await stable();const adjustedAgain=await req(stockPath(inventoryId,'adjust'),x,'POST',adjustBody,{'Idempotency-Key':adjustKey});assert.equal(adjustedAgain.status,200);assert.equal(adjustedAgain.body.replayed,true);assert.deepEqual(await stable(),beforeAdjustReplay);
      await unchanged(stockPath(inventoryId,'adjust'),x,'POST',{...adjustBody,delta:-2},{...allowed,'Idempotency-Key':adjustKey},409,'CATALOG_IDEMPOTENCY_CONFLICT');
      await unchanged(stockPath(inventoryId,'set'),x,'POST',{expected_version:1,quantity:9},allowed,409,'CATALOG_VERSION_CONFLICT');
      await unchanged(stockPath(inventoryId,'adjust'),x,'POST',{expected_version:3,delta:-99},{...allowed,'Idempotency-Key':randomUUID()},409,'CATALOG_NEGATIVE_STOCK');
      const moves=(await admin.query('SELECT mutation_type,before_quantity,after_quantity,expected_version,resulting_version,actor_type,actor_account_id FROM inventory_mutations WHERE merchant_id=$1 AND product_id=$2 ORDER BY resulting_version',[x.id,inventoryId])).rows;
      assert.deepEqual(moves,[{mutation_type:'set',before_quantity:5,after_quantity:8,expected_version:1,resulting_version:2,actor_type:'merchant',actor_account_id:x.id},{mutation_type:'adjust',before_quantity:8,after_quantity:5,expected_version:2,resulting_version:3,actor_type:'merchant',actor_account_id:x.id}]);
      const faultItems=[input('Rollback import first'),input('Rollback import second')],faultImportKey='fault-import-'+key;
      await admin.query(`CREATE SEQUENCE ${fault}`);sequence=true;await admin.query(`GRANT USAGE ON SEQUENCE ${fault} TO ${runtime.role}`);
      await admin.query(`CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $catalog_fault$ BEGIN IF NEW.merchant_id=TG_ARGV[0] THEN PERFORM nextval(TG_ARGV[1]::regclass); IF TG_TABLE_NAME='inventory_mutations' OR NEW.id=TG_ARGV[2] THEN RAISE EXCEPTION 'synthetic catalog post-write fault'; END IF; END IF; RETURN NEW; END $catalog_fault$`);fn=true;
      await admin.query(`CREATE TRIGGER ${fault} AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION ${fault}('${x.id}','${fault}','${faultItems[1].id}')`);productTrigger=true;
      await admin.query(`CREATE TRIGGER ${fault} AFTER INSERT ON inventory_mutations FOR EACH ROW EXECUTE FUNCTION ${fault}('${x.id}','${fault}','${faultItems[1].id}')`);mutationTrigger=true;
      for(const [path,body,headers] of [[base+'/import',{products:faultItems},{...allowed,'Idempotency-Key':faultImportKey}],[stockPath(inventoryId,'set'),{expected_version:3,quantity:10},allowed],[stockPath(inventoryId,'adjust'),{expected_version:3,delta:1},{...allowed,'Idempotency-Key':'fault-adjust-'+key}]]){
        const failed=await unchanged(path,x,'POST',body,headers,500);assert.equal(failed.cache,'no-store');assert.deepEqual(failed.body,{ok:false,code:'CATALOG_OPERATION_FAILED',error:'catalog operation failed'});
      }
      assert.deepEqual((await admin.query(`SELECT last_value::int AS value,is_called FROM ${fault}`)).rows[0],{value:4,is_called:true});rollback=true;
      await admin.query(`DROP TRIGGER ${fault} ON products`);productTrigger=false;await admin.query(`DROP TRIGGER ${fault} ON inventory_mutations`);mutationTrigger=false;
      const importRecovered=await req(base+'/import',x,'POST',{products:faultItems},{...allowed,'Idempotency-Key':faultImportKey});assert.equal(importRecovered.status,201);assert.equal(importRecovered.body.replayed,false);assert.equal(importRecovered.body.created_count,2);
      const setRecovered=await req(stockPath(inventoryId,'set'),x,'POST',{expected_version:3,quantity:10},allowed);assert.equal(setRecovered.status,200);assert.equal(setRecovered.body.product.version,4);assert.equal(setRecovered.body.product.stock_quantity,10);
      const adjustRecovered=await req(stockPath(inventoryId,'adjust'),x,'POST',{expected_version:4,delta:1},{...allowed,'Idempotency-Key':'fault-adjust-'+key});assert.equal(adjustRecovered.status,200);assert.equal(adjustRecovered.body.product.version,5);assert.equal(adjustRecovered.body.product.stock_quantity,11);
      await unchanged(base+'/'+own.id+'?expected_version=1',x,'DELETE',undefined,allowed,409,'CATALOG_VERSION_CONFLICT');
      const deleted=await req(base+'/'+own.id+'?expected_version=2',x,'DELETE');assert.equal(deleted.status,200);assert.deepEqual(deleted.body,{ok:true,deleted_product_id:own.id,deleted_version:2});
      const deletedRow=(await admin.query('SELECT deleted_at,version FROM products WHERE merchant_id=$1 AND id=$2',[x.id,own.id])).rows[0];assert.ok(deletedRow.deleted_at);assert.equal(deletedRow.version,3);
      await unchanged(base+'/'+own.id,x,'DELETE',{expected_version:2},allowed,404,'CATALOG_PRODUCT_NOT_FOUND');
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);for(const [path,method,body] of endpoints)await unchanged(path,x,method,body,{...allowed,'Idempotency-Key':key},401);
      assert.deepEqual(await peerState(),peerBefore);assert.deepEqual(await snapshot(),original.business);passed=true;
    }finally{
      await cleanupResources([
        ['catalog product fault trigger',()=>productTrigger?admin.query(`DROP TRIGGER ${fault} ON products`):undefined],
        ['catalog mutation fault trigger',()=>mutationTrigger?admin.query(`DROP TRIGGER ${fault} ON inventory_mutations`):undefined],
        ['catalog fault function',()=>fn?admin.query(`DROP FUNCTION ${fault}()`):undefined],['catalog fault sequence',()=>sequence?admin.query(`DROP SEQUENCE ${fault}`):undefined],
        ...graphTables.map(table=>['owned catalog write rows '+table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[tenantIds])]),
      ]);
    }
    console.log('P0_PRODUCT_WRITE_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,allAssertionsPassed:passed,importAndInventoryPostWriteRollback:rollback,hosted:false}));
  });

  await t.test('MATRIX-C01 full-app legacy knowledge retirement is case-consistent and current authority survives',async()=>{
    const x=await actor('merchant'),y=await actor('merchant'),tenantIds=[x.id,y.id];
    for(const m of [x,y]){
      await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[m.id]);
      m.session=await auth.issueSession({accountId:m.id,accountKind:'merchant',tenantId:m.id,deviceId:m.device});m.cookie=`${MERCHANT_SESSION_COOKIE}=${m.session.token}`;
    }
    const paths=await import('../src/lib/dataPaths.ts'),names=['saved-answers.json','training-requests.json','learned-answers.json'];
    const files=names.map(name=>paths.getFawriDataFilePath(name)),ownedFiles=[];
    const tables=['knowledge_embeddings','knowledge_audit_events','learned_answers','saved_answers','training_requests'];
    const state=async()=>({business:await snapshot(),knowledge:Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await admin.query(`SELECT to_jsonb(k) AS row FROM ${table} k WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(k)::text`,[tenantIds])).rows])))});
    const fileState=()=>files.map(file=>fs.existsSync(file)?fs.readFileSync(file,'utf8'):null);
    const savedId='Legacy-Saved-'+randomUUID(),trainingId='Legacy-Training-'+randomUUID(),stamp='2030-01-01T00:00:00.000Z';
    let passed=false;
    try{
      for(const file of files)assert.equal(fs.existsSync(file),false,'requires absent owned legacy fixture file');
      const fixtures=[{answers:[x,y].map((m,i)=>({id:i===0?savedId:'Peer-'+savedId,merchant_id:m.id,category:'custom',question_pattern:'Synthetic legacy question',answer_text:'Private legacy answer '+i,language:'en',approved:true,active:true,created_at:stamp}))},
        {requests:[x,y].map((m,i)=>({id:i===0?trainingId:'Peer-'+trainingId,merchantId:m.id,customerId:'Synthetic-Customer-'+i,customerMessage:'Private legacy training '+i,normalizedMessage:'legacy training',detectedIntent:'custom',detectedLanguage:'en',reason:'synthetic',status:'pending_merchant_reply',createdAt:stamp,updatedAt:stamp}))},{answers:[]}];
      files.forEach((file,i)=>{fs.writeFileSync(file,JSON.stringify(fixtures[i]));ownedFiles.push(file);});
      const current='/api/knowledge/saved-answers',allowed={Origin:'https://management.example.invalid'},created=[];
      for(const [m,i] of [[x,0],[y,1]]){
        const r=await req(current,m,'POST',{questionPattern:'Current authority question '+i,answerText:'Current SQL answer '+i,language:'en',category:'custom',active:false},allowed);
        assert.equal(r.status,201);assert.equal(r.body.answer.merchantId,m.id);created.push(r.body.answer);
      }
      const before=await state(),beforeFiles=fileState();
      const payload={question_pattern:'Synthetic retired write',answer_text:'Retired write must not persist',language:'en',idealReply:'Synthetic retired approval',merchantId:y.id,merchant_id:y.id};
      const routes=[['GET','/api/saved-answers'],['POST','/api/saved-answers'],['PUT','/api/saved-answers/'+savedId],['DELETE','/api/saved-answers/'+savedId],
        ['GET','/api/bot-training/requests'],['POST','/api/bot-training/requests/'+trainingId+'/approve'],['PUT','/api/bot-training/requests/'+trainingId+'/reply'],['PATCH','/api/bot-training/requests/'+trainingId+'/reply'],['POST','/api/bot-training/requests/'+trainingId+'/reject']];
      const observations=[];
      for(const [method,path] of routes)for(const variant of [path,path.replace('/api/saved-answers','/API/SaVeD-AnSwErS').replace('/api/bot-training','/API/BoT-TrAiNiNg')+'/?merchant_id='+y.id]){
        const r=await req(variant,x,method,method==='GET'?undefined:payload,allowed);observations.push({status:r.status,code:r.body.code,cache:r.cache,privateBody:/Private legacy/.test(JSON.stringify(r.body))});
      }
      const afterFiles=fileState();
      console.log('P0_KNOWLEDGE_RETIREMENT_OBSERVED '+JSON.stringify({statuses:observations.map(r=>r.status),legacyFilesUnchanged:JSON.stringify(afterFiles)===JSON.stringify(beforeFiles),legacyContentReturned:observations.some(r=>r.privateBody)}));
      assert.deepEqual(observations.map(r=>r.status),Array(18).fill(410));
      for(const r of observations){assert.equal(r.code,'LEGACY_KNOWLEDGE_AUTHORITY_DISABLED');assert.equal(r.cache,'no-store');assert.equal(r.privateBody,false);}
      assert.deepEqual(afterFiles,beforeFiles);assert.deepEqual(await state(),before);
      for(const m of [x,y])for(const [method,path] of routes){
        const foreignPath=path.toUpperCase()+'/?merchant_id='+x.id;
        const r=await req(foreignPath,m,method,method==='GET'?undefined:payload,allowed);assert.equal(r.status,410);assert.equal(r.body.code,'LEGACY_KNOWLEDGE_AUTHORITY_DISABLED');
      }
      for(const who of [undefined,owner,viewer])assert.equal((await req('/api/knowledge/runtime',who)).status,401);
      for(const [m,i] of [[x,0],[y,1]]){
        const runtime=await req('/API/KnOwLeDgE/RuNtImE/',m);assert.equal(runtime.status,200);assert.equal(runtime.body.engine.legacyFallbackEnabled,false);
        const read=await req(current+'?merchant_id='+tenantIds[1-i],m);assert.equal(read.status,200);assert.deepEqual(read.body.answers,[created[i]]);assert.doesNotMatch(JSON.stringify(read.body),/Private legacy/);
        assert.deepEqual((await admin.query('SELECT answer_text FROM saved_answers WHERE merchant_id=$1',[m.id])).rows,[{answer_text:'Current SQL answer '+i}]);
      }
      assert.deepEqual(fileState(),beforeFiles);assert.deepEqual(await state(),before);
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);assert.equal((await req(current,x)).status,401);assert.equal((await req(current,y)).status,200);
      assert.deepEqual(fileState(),beforeFiles);assert.deepEqual(await state(),before);passed=true;
    }finally{
      await cleanupResources([
        ...ownedFiles.map(file=>['owned synthetic legacy knowledge file',()=>fs.rmSync(file)]),
        ...tables.map(table=>['owned current knowledge rows '+table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[tenantIds])]),
      ]);
    }
    console.log('P0_KNOWLEDGE_RETIREMENT_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,allAssertionsPassed:passed,legacyMethods:9,initialPathVariants:18,currentAuthorityPositive:true,hosted:false}));
  });

  await t.test('MATRIX-C02 incomplete admin authority refuses case variants before current or legacy handlers',async()=>{
    const opName='FAWRI_OPERATIONAL_POSTGRES_AUTHORITY',sessionName='FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY';
    const originalOp=process.env[opName],originalSession=process.env[sessionName];
    const mode=await import('../src/services/adminAuthPostgresCutover.ts');
    const paths=await import('../src/lib/dataPaths.ts');
    const legacyNames=['auth-accounts.json','auth-security.json','merchants.json'];
    const files=()=>legacyNames.map(name=>{const file=paths.getFawriDataFilePath(name);return fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;});
    const before=await snapshot(),beforeFiles=files(),observed=[];
    const restore=()=>{if(originalOp===undefined)delete process.env[opName];else process.env[opName]=originalOp;if(originalSession===undefined)delete process.env[sessionName];else process.env[sessionName]=originalSession;};
    const endpoints=[['GET','/api/auth/admins'],['POST','/api/auth/admin/login'],['POST','/api/auth/admin/device-otp/resend'],['GET','/api/auth/admin/owner-recovery/status']];
    let passed=false;
    try{
      for(const [operational,session] of [['required','off'],['off','required']]){
        process.env[opName]=operational;process.env[sessionName]=session;assert.equal(mode.adminAuthPostgresCutoverMode(),'incomplete');
        for(const [method,path] of endpoints)for(const variant of [path,path.replace('/api/auth/admin','/API/AuTh/AdMiN')+'/?cursor=AbC']){
          const r=await req(variant,undefined,method,method==='POST'?{}:undefined,{Origin:'https://management.example.invalid'});
          observed.push({operational,session,status:r.status,code:r.body.code});
        }
      }
      console.log('P0_ADMIN_INCOMPLETE_CUTOVER_OBSERVED '+JSON.stringify({statuses:observed.map(r=>r.status),codes:observed.map(r=>r.code),legacyFilesUnchanged:JSON.stringify(files())===JSON.stringify(beforeFiles)}));
      assert.deepEqual(observed.map(r=>r.status),Array(16).fill(503));
      for(const r of observed)assert.equal(r.code,'AUTH_POSTGRES_CUTOVER_INCOMPLETE');
      assert.deepEqual(files(),beforeFiles);assert.deepEqual(await snapshot(),before);
      restore();assert.equal(mode.adminAuthPostgresCutoverMode(),'postgres');
      assert.equal((await req('/api/auth/admins',owner)).status,200);assert.equal((await req('/API/AuTh/AdMiNs/',owner)).status,200);
      assert.equal((await req('/api/auth/admins')).status,401);assert.equal((await req('/API/AuTh/AdMiNs/')).status,401);
      assert.deepEqual(files(),beforeFiles);assert.deepEqual(await snapshot(),before);passed=true;
    }finally{restore();}
    console.log('P0_ADMIN_INCOMPLETE_CUTOVER_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,allAssertionsPassed:passed,halfConfiguredProfiles:2,requests:16,noOtpDelivery:true,hosted:false}));
  });


  await t.test('MATRIX-C02 owner recovery status is owner-only and projects no recovery secrets',async()=>{
    const path='/api/auth/admin/owner-recovery/status';
    const paths=[path,'/API/AuTh/AdMiN/OwNeR-ReCoVeRy/StAtUs/?account_id='+manager.id+'&merchant_id='+a.id];
    const original=(await admin.query('SELECT metadata FROM accounts WHERE id=$1',[owner.id])).rows[0].metadata;
    const businessBefore=await snapshot();
    const statusAssistants=[];
    for(const permissions of [['manage_merchant_status','view_logs'],[],['view_logs']]){
      const assistant=await actor('admin','assistant_admin',permissions);
      const device=await security.registerAdminDeviceAuthoritative({accountId:assistant.id,accountKind:'admin',deviceId:assistant.device,deviceLabel:'Owner status proof assistant'});
      await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
      assistant.session=await auth.issueSession({accountId:assistant.id,accountKind:'admin',tenantId:'fawri-admin',adminRole:assistant.role,deviceId:assistant.device,permissions:assistant.permissions});
      assistant.cookie=ADMIN_SESSION_COOKIE+'='+assistant.session.token;
      const me=await req('/api/auth/admin/me',assistant);
      assert.equal(me.status,200,'fresh assistant authentication precondition: '+JSON.stringify(me.body));
      statusAssistants.push(assistant);
    }
    const extra=await auth.issueSession({accountId:owner.id,accountKind:'admin',tenantId:owner.id,adminRole:'owner_admin',deviceId:owner.device,permissions:[]});
    await auth.revokeSession(extra.token,'admin','logout');
    const revoked={...owner,cookie:ADMIN_SESSION_COOKIE+'='+extra.token};
    const authority=async()=>{
      const accounts=(await admin.query('SELECT id,metadata,password_version,session_version,security_version,state FROM accounts WHERE id=ANY($1::text[]) ORDER BY id',[ids])).rows;
      const sessions=(await admin.query('SELECT id,account_id,status,revoke_reason FROM account_sessions WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows;
      const devices=(await admin.query('SELECT id,account_id,status,trust_slot,revoked_at FROM trusted_devices WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows;
      const challenges=(await admin.query('SELECT to_jsonb(o) AS row FROM auth_otp_challenges o WHERE account_id=ANY($1::text[]) ORDER BY id',[ids])).rows;
      return {accounts,sessions,devices,challenges};
    };
    const stamp='2026-10-01T00:00:00.000Z',used='2026-10-02T00:00:00.000Z';
    const secret='Synthetic-Owner-Recovery-Private-'+randomUUID();
    const enabled={version:1,generation:secret+'-generation',recovery_id_hash:secret+'-id',key_1_hash:secret+'-key1',key_2_hash:secret+'-key2',enabled:true,created_at:stamp,used_at:null};
    const states=[
      {name:'disabled',metadata:{private_status_probe:secret},expected:{ok:true,enabled:false,created_at:null,used_at:null}},
      {name:'enabled',metadata:{private_status_probe:secret,owner_recovery:enabled},expected:{ok:true,enabled:true,created_at:stamp,used_at:null}},
      {name:'used',metadata:{private_status_probe:secret,owner_recovery:{...enabled,enabled:false,used_at:used}},expected:{ok:true,enabled:false,created_at:stamp,used_at:used}},
    ];
    let deniedCount=0,positiveCount=0,passed=false;
    try{
      await admin.query("UPDATE accounts SET metadata=$2::jsonb WHERE id=$1",[owner.id,JSON.stringify(states[1].metadata)]);
      const before=await authority();
      for(const variant of paths){
        for(const [who,status,headers] of [
          [undefined,401,{}],[a,401,{}],[b,401,{}],[statusAssistants[0],403,{}],[statusAssistants[1],403,{}],[statusAssistants[2],403,{}],
          [owner,401,{'X-Fawri-Device-Id':'wrong-owner-status-device'}],
          [owner,401,{Cookie:owner.cookie+'; '+a.cookie}],[revoked,401,{}],
        ]){
          const r=await req(variant,who,'GET',undefined,headers);
          assert.equal(r.status,status,JSON.stringify({role:who?.role,expected:status,body:r.body}));assert.equal(JSON.stringify(r.body).includes(secret),false);
          for(const field of ['enabled','created_at','used_at','owner_recovery','key_1_hash','key_2_hash'])assert.equal(Object.hasOwn(r.body,field),false);
          assert.deepEqual(await authority(),before);deniedCount++;
        }
      }
      for(const state of states){
        await admin.query("UPDATE accounts SET metadata=$2::jsonb WHERE id=$1",[owner.id,JSON.stringify(state.metadata)]);
        const stateBefore=await authority();
        for(const variant of paths){
          const r=await req(variant,owner);assert.equal(r.status,200);
          assert.deepEqual(r.body,state.expected,state.name);assert.match(r.cache,/no-store/);
          assert.equal(JSON.stringify(r.body).includes(secret),false);
          assert.deepEqual(await authority(),stateBefore);positiveCount++;
        }
      }
      assert.deepEqual(await snapshot(),businessBefore);passed=true;
    }finally{
      await admin.query('UPDATE accounts SET metadata=$2::jsonb WHERE id=$1',[owner.id,JSON.stringify(original)]);
    }
    assert.deepEqual((await admin.query('SELECT metadata FROM accounts WHERE id=$1',[owner.id])).rows[0].metadata,original);
    assert.equal((await req(path,owner)).status,200);
    console.log('P0_OWNER_RECOVERY_STATUS_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,deniedRequests:deniedCount,ownerReads:positiveCount,metadataStates:3,pathVariants:2,exactResponseKeys:4,authorityUnchangedByReads:true,ownedMetadataRestored:true,noOtpDelivery:true,hosted:false}));
  });


  await t.test('MATRIX-C03 support reads isolate merchants and project exact nested ticket DTOs for authorized actors',async()=>{
    const x=await actor('merchant'),y=await actor('merchant');
    const helper=await actor('admin','assistant_admin',['manage_support']);
    const unpermitted=await actor('admin','assistant_admin',[]);
    for(const who of [x,y,helper,unpermitted]){
      if(who.kind==='merchant')await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[who.id]);
      else{
        const device=await security.registerAdminDeviceAuthoritative({accountId:who.id,accountKind:'admin',deviceId:who.device,deviceLabel:'Support DTO proof'});
        await security.setAdminDeviceTrustAuthoritative({deviceRecordId:device.id,trusted:true,actorAccountId:owner.id});
      }
      who.session=await auth.issueSession({accountId:who.id,accountKind:who.kind,tenantId:who.kind==='admin'?'fawri-admin':who.id,adminRole:who.role,deviceId:who.device,permissions:who.permissions});
      who.cookie=(who.kind==='admin'?ADMIN_SESSION_COOKIE:MERCHANT_SESSION_COOKIE)+'='+who.session.token;
      const me=await req(who.kind==='admin'?'/api/auth/admin/me':'/api/auth/me',who);
      assert.equal(me.status,200,'fresh support actor authentication: '+JSON.stringify(me.body));
    }
    const stamp='2026-10-01T00:00:00.000Z',ended='2026-10-01T00:10:00.000Z',expires='2026-10-01T00:30:00.000Z';
    const ownedTickets=[],expected=[],privateMarkers=[];
    const supportTables=['support_tickets','support_messages','support_attachments','support_inspection_requests','support_preview_sessions'];
    const supportState=async()=>Object.fromEntries(await Promise.all(supportTables.map(async table=>[table,(await admin.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE '+(table==='support_tickets'?'id':'ticket_id')+'=ANY($1::text[]) ORDER BY to_jsonb(t)::text',[ownedTickets])).rows])));
    const list='/api/auth/support/tickets',adminList='/api/auth/admin/support/tickets';
    let positive=0,negative=0,passed=false;
    try{
      for(const merchant of [x,y]){
        const ticket='Support-DTO-'+randomUUID(),message='Message-'+randomUUID(),system='System-'+randomUUID(),attachment='Attachment /?&=#-'+randomUUID(),deleted='Deleted-'+randomUUID(),inspection='Inspection-'+randomUUID();
        const secret='Private-Support-'+randomUUID();privateMarkers.push(secret);ownedTickets.push(ticket);
        const phone=(await admin.query('SELECT phone FROM accounts WHERE id=$1',[merchant.id])).rows[0].phone;
        // Trusted SQL fixtures exercise read projection, not another create/consent/upload lifecycle.
        // Closed tickets and ended approvals cannot become due during HTTP read assertions.
        await admin.query("INSERT INTO support_tickets(id,merchant_id,subject,category,status,assigned_admin_account_id,closed_at,merchant_reminder_sent_at,assistant_reminder_sent_at,owner_escalated_at,metadata,created_at,updated_at) VALUES($1,$2,$3,'technical','closed',$4,$5,$5,$5,$5,$6::jsonb,$5,$5)",[ticket,merchant.id,'Subject '+ticket,helper.id,stamp,JSON.stringify({auto_closed_at:stamp,auto_closed_reason:'merchant_inactivity',private_storage:secret})]);
        await admin.query("INSERT INTO support_messages(id,ticket_id,merchant_id,sender_type,sender_account_id,sender_name_snapshot,body,created_at) VALUES($1,$2,$3,'merchant',$3,'Synthetic',$4,$5),($6,$2,$3,'system',NULL,'System',$7,$8)",[message,ticket,merchant.id,'Body '+ticket,stamp,system,'System '+ticket,ended]);
        for(const [id,isDeleted] of [[attachment,false],[deleted,true]])await admin.query("INSERT INTO support_attachments(id,message_id,ticket_id,merchant_id,original_file_name,mime_type,size_bytes,sha256,storage_provider,storage_key,deleted_at,created_at) VALUES($1,$2,$3,$4,'synthetic.png','image/png',19,$5,'filesystem',$6,$7,$8)",[id,message,ticket,merchant.id,'a'.repeat(64),secret+'/'+id,isDeleted?ended:null,stamp]);
        await admin.query("INSERT INTO support_inspection_requests(id,ticket_id,merchant_id,admin_account_id,mode,reason,status,consent_decision,read_only,session_duration_minutes,requested_at,request_expires_at,responded_at,approved_at,ended_at,end_reason,metadata) VALUES($1,$2,$3,$4,'independent_read_only',$5,'approved','approved',true,30,$6,$7,$6,$6,$8,'merchant_terminated',$9::jsonb)",[inspection,ticket,merchant.id,helper.id,'Reason '+ticket,stamp,expires,ended,JSON.stringify({private_inspection:secret})]);
        expected.push({
          id:ticket,merchant_id:merchant.id,merchant_name:'Synthetic',merchant_phone:phone,subject:'Subject '+ticket,category:'technical',status:'closed',assigned_admin_id:helper.id,assigned_admin_name:'Synthetic',created_at:stamp,updated_at:stamp,closed_at:stamp,merchant_reminder_sent_at:stamp,auto_closed_at:stamp,auto_closed_reason:'merchant_inactivity',
          messages:[
            {id:message,sender_type:'merchant',sender_id:merchant.id,sender_name:'Synthetic',body:'Body '+ticket,created_at:stamp,attachments:[{id:attachment,kind:'image',original_name:'synthetic.png',mime_type:'image/png',size_bytes:19,url:'/api/auth/support-images/attachments/'+encodeURIComponent(attachment),created_at:stamp}]},
            {id:system,sender_type:'system',sender_id:'system',sender_name:'System',body:'System '+ticket,created_at:ended,attachments:[]},
          ],
          inspection_requests:[{id:inspection,ticket_id:ticket,merchant_id:merchant.id,admin_id:helper.id,admin_name:'Synthetic',mode:'independent_read_only',reason:'Reason '+ticket,status:'approved',consent_decision:'approved',end_reason:'merchant_terminated',ended_at:ended,read_only:true,session_duration_minutes:30,requested_at:stamp,request_expires_at:expires,responded_at:stamp,approved_at:stamp,session_expires_at:expires}],
        });
      }
      // Execute the real global lifecycle refresh before capturing owned-state invariants.
      assert.equal((await req(adminList,owner)).status,200);
      const before=await supportState(),business=await snapshot();
      const noPrivate=result=>{
        const wire=JSON.stringify(result.body);
        for(const secret of privateMarkers)assert.equal(wire.includes(secret),false);
        for(const field of ['storage_key','storage_provider','sha256','private_inspection','private_storage','metadata'])assert.equal(wire.includes('"'+field+'"'),false);
      };
      for(const [merchant,index] of [[x,0],[y,1]]){
        const foreign=[x,y][1-index];
        for(const suffix of ['', '?merchant_id='+foreign.id+'&account_id='+foreign.id]){
          for(const path of [list+suffix,list+'/'+ownedTickets[index]+suffix]){
            const r=await req(path,merchant);assert.equal(r.status,200);noPrivate(r);
            assert.deepEqual(r.body,path.startsWith(list+'/')?{ok:true,ticket:expected[index]}:{ok:true,tickets:[expected[index]]});
            assert.deepEqual(await supportState(),before);positive++;
          }
          const deniedRead=await req(list+'/'+ownedTickets[1-index]+suffix,merchant);
          assert.equal(deniedRead.status,404);assert.equal(deniedRead.body.code,'SUPPORT_TICKET_NOT_FOUND');noPrivate(deniedRead);
          assert.equal(JSON.stringify(deniedRead.body).includes('Body '+ownedTickets[1-index]),false);
          assert.deepEqual(await supportState(),before);negative++;
        }
      }
      for(const who of [owner,helper])for(const suffix of ['', '?merchant_id='+x.id+'&admin_id='+unpermitted.id]){
        const r=await req(adminList+suffix,who);assert.equal(r.status,200);noPrivate(r);assert.equal(r.body.ok,true);
        const rows=r.body.tickets.filter(row=>ownedTickets.includes(row.id)).sort((a,b)=>a.id.localeCompare(b.id));
        const want=expected.map(row=>({...row,assistant_reminder_sent_at:stamp,owner_escalated_at:stamp})).sort((a,b)=>a.id.localeCompare(b.id));
        assert.deepEqual(rows,want);assert.deepEqual(await supportState(),before);positive++;
      }
      for(const [path,who,status,headers] of [
        [adminList,undefined,401,{}],[adminList,x,401,{}],[adminList,y,401,{}],[adminList,unpermitted,403,{}],
        [list,undefined,401,{}],[list,owner,401,{}],[list,helper,401,{}],
        [list+'/'+ownedTickets[0],undefined,401,{}],[list+'/'+ownedTickets[0],owner,401,{}],
        [list,x,401,{'X-Fawri-Device-Id':'wrong-support-device'}],
        [adminList,owner,401,{Cookie:owner.cookie+'; '+x.cookie}],
      ]){
        const r=await req(path,who,'GET',undefined,headers);assert.equal(r.status,status,JSON.stringify({path,status,body:r.body}));noPrivate(r);
        for(const row of expected){assert.equal(JSON.stringify(r.body).includes(row.subject),false);assert.equal(JSON.stringify(r.body).includes(row.messages[0].body),false);}
        assert.deepEqual(await supportState(),before);negative++;
      }
      assert.deepEqual(await snapshot(),business);
      assert.equal((await req(adminList,helper)).status,200);passed=true;
    }finally{
      // Ticket FKs cascade only these owned messages, attachments, requests and previews.
      await admin.query('DELETE FROM support_tickets WHERE id=ANY($1::text[])',[ownedTickets]);
      for(const table of supportTables)assert.equal((await admin.query('SELECT count(*)::int AS n FROM '+table+' WHERE '+(table==='support_tickets'?'id':'ticket_id')+'=ANY($1::text[])',[ownedTickets])).rows[0].n,0);
    }
    console.log('P0_SUPPORT_NESTED_READ_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,positiveReads:positive,deniedReads:negative,merchants:2,freshActorPrechecks:4,exactNestedDto:true,softDeletedAttachmentOmitted:true,lifecycleWarmedBeforeSnapshot:true,ownedFiveTableStateUnchanged:true,ownedFixturesCleaned:true,physicalImageWritten:false,hosted:false}));
  });


  await t.test('MATRIX-C03 image aliases and private bytes use full-app current authority before retired legacy paths',async()=>{
    const x=await actor('merchant'),y=await actor('merchant'),helper=await actor('admin','assistant_admin',['manage_support']),unpermitted=await actor('admin','assistant_admin',[]);
    for(const who of [x,y,helper,unpermitted]){
      if(who.kind==='merchant')await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[who.id]);
      else{
        const d=await security.registerAdminDeviceAuthoritative({accountId:who.id,accountKind:'admin',deviceId:who.device,deviceLabel:'Support image app proof'});
        await security.setAdminDeviceTrustAuthoritative({deviceRecordId:d.id,trusted:true,actorAccountId:owner.id});
      }
      who.session=await auth.issueSession({accountId:who.id,accountKind:who.kind,tenantId:who.kind==='admin'?'fawri-admin':who.id,adminRole:who.role,deviceId:who.device,permissions:who.permissions});
      who.cookie=(who.kind==='admin'?ADMIN_SESSION_COOKIE:MERCHANT_SESSION_COOKIE)+'='+who.session.token;
      assert.equal((await req(who.kind==='admin'?'/api/auth/admin/me':'/api/auth/me',who)).status,200);
    }
    const {SUPPORT_IMAGE_DIR}=await import('../src/services/postgresSupportImageAuthority.ts');
    const {getFawriDataFilePath}=await import('../src/lib/dataPaths.ts');
    const legacyFiles=['merchants.json','auth-accounts.json','auth-security.json'];
    const legacyState=()=>legacyFiles.map(name=>{const p=getFawriDataFilePath(name);return {name,body:fs.existsSync(p)?fs.readFileSync(p,'base64'):null};});
    const legacyBefore=legacyState();
    const ticket='Image-App-'+randomUUID(),peerTicket='Image-App-Peer-'+randomUUID(),ownedTickets=[ticket,peerTicket];
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');
    const merchantUpload='/api/auth/support-images/merchant/tickets/'+ticket+'/messages',adminUpload='/api/auth/support-images/admin/tickets/'+ticket+'/messages',genericUpload='/api/auth/support-images/tickets/'+ticket+'/messages';
    const tables=['support_tickets','support_messages','support_attachments','support_inspection_requests','support_preview_sessions'];
    const state=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await admin.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE '+(table==='support_tickets'?'id':'ticket_id')+'=ANY($1::text[]) ORDER BY to_jsonb(t)::text',[ownedTickets])).rows])));
    const files=()=>ownedTickets.map(id=>{const dir=SUPPORT_IMAGE_DIR+'/'+id;return {id,files:fs.existsSync(dir)?fs.readdirSync(dir).sort().map(name=>({name,bytes:fs.readFileSync(dir+'/'+name,'base64')})):[]};});
    async function imageReq(path,who,method='GET',headers={}){
      const r=await fetch(origin+path,{method,headers:{...(who?{Cookie:who.cookie,'X-Fawri-Device-Id':who.device}:{}),...(method==='POST'?{Origin:'https://management.example.invalid','Content-Type':'image/png','X-File-Name':'full-app.png'}:{}),...headers},...(method==='POST'?{body:png}:{})});
      const bytes=Buffer.from(await r.arrayBuffer()),type=r.headers.get('content-type')||'';
      return {status:r.status,cache:r.headers.get('cache-control'),type,bytes,body:type.includes('application/json')?JSON.parse(bytes.toString()):undefined};
    }
    let uploads=0,reads=0,denials=0,retired=0,passed=false;
    try{
      for(const [id,m] of [[ticket,x],[peerTicket,y]])await admin.query("INSERT INTO support_tickets(id,merchant_id,subject,category,status,assigned_admin_account_id,waiting_on,waiting_since) VALUES($1,$2,'Full app image proof','technical','in_progress',$3,'admin',now())",[id,m.id,helper.id]);
      const beforePeer=(await admin.query('SELECT to_jsonb(t) AS row FROM support_tickets t WHERE id=$1',[peerTicket])).rows;
      const attachments=[];
      for(const [path,who,senderType] of [[merchantUpload,x,'merchant'],[adminUpload,helper,'admin'],[genericUpload,x,'merchant']]){
        const r=await imageReq(path,who,'POST');assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.ok,true);
        const message=r.body.ticket.messages.at(-1),attachment=message.attachments[0];assert.equal(message.sender_type,senderType);assert.equal(message.sender_id,who.id);
        assert.deepEqual(Object.keys(attachment).sort(),['id','kind','original_name','mime_type','size_bytes','url','created_at'].sort());
        assert.equal(attachment.original_name,'full-app.png');assert.equal(attachment.url,'/api/auth/support-images/attachments/'+encodeURIComponent(attachment.id));
        const stored=(await admin.query('SELECT storage_key FROM support_attachments WHERE id=$1 AND ticket_id=$2',[attachment.id,ticket])).rows[0];assert.ok(stored);assert.deepEqual(fs.readFileSync(SUPPORT_IMAGE_DIR+'/'+stored.storage_key),png);
        attachments.push({...attachment,messageId:message.id});uploads++;
      }
      const before=await state(),beforeFiles=files(),business=await snapshot();
      for(const attachment of attachments)for(const who of [x,owner,helper]){
        const r=await imageReq(attachment.url,who);assert.equal(r.status,200);assert.match(r.type,/^image\/png/);assert.equal(r.cache,'private, no-store');assert.deepEqual(r.bytes,png);reads++;
        assert.deepEqual(await state(),before);assert.deepEqual(files(),beforeFiles);
      }
      const readPath=attachments[0].url;
      for(const [path,who,method,status,headers] of [
        [readPath,undefined,'GET',401,{}],[readPath,y,'GET',404,{}],[readPath,unpermitted,'GET',403,{}],
        [readPath,x,'GET',401,{'X-Fawri-Device-Id':'wrong-image-device'}],
        [readPath,owner,'GET',401,{Cookie:owner.cookie+'; '+x.cookie}],
        [merchantUpload,y,'POST',404,{}],[merchantUpload,undefined,'POST',401,{}],[merchantUpload,owner,'POST',401,{}],
        [adminUpload,owner,'POST',403,{}],[adminUpload,unpermitted,'POST',403,{}],[adminUpload,x,'POST',401,{}],
        [genericUpload,owner,'POST',403,{}],[genericUpload,unpermitted,'POST',403,{}],
        [merchantUpload,x,'POST',403,{Origin:'https://foreign.example.invalid'}],
      ]){
        const r=await imageReq(path,who,method,headers);assert.equal(r.status,status,JSON.stringify({path,status,body:r.body}));assert.ok(r.body);assert.equal(r.bytes.equals(png),false);
        assert.deepEqual(await state(),before);assert.deepEqual(files(),beforeFiles);denials++;
      }
      // The internal service result's nested URL is not the HTTP mapper URL.
      // Unhandled legacy image paths must stop before JSON-backed routers.
      const nested='/api/auth/support-images/tickets/'+ticket+'/messages/'+attachments[0].messageId+'/attachments/'+attachments[0].id;
      for(const path of [nested,nested.replace('/api/auth/support-images','/API/AuTh/SuPpOrT-ImAgEs')])for(const who of [x,owner]){
        const r=await imageReq(path,who);assert.equal(r.status,410);assert.equal(r.body.code,'LEGACY_AUTH_ROUTE_RETIRED');assert.equal(r.cache,'no-store');
        assert.deepEqual(await state(),before);assert.deepEqual(files(),beforeFiles);retired++;
      }
      assert.deepEqual(legacyState(),legacyBefore);assert.deepEqual(await snapshot(),business);
      assert.deepEqual((await admin.query('SELECT to_jsonb(t) AS row FROM support_tickets t WHERE id=$1',[peerTicket])).rows,beforePeer);
      assert.equal((await imageReq(readPath,x)).status,200);passed=true;
    }finally{
      await admin.query('DELETE FROM support_tickets WHERE id=ANY($1::text[])',[ownedTickets]);
      for(const id of ownedTickets)fs.rmSync(SUPPORT_IMAGE_DIR+'/'+id,{recursive:true,force:true});
      for(const table of tables)assert.equal((await admin.query('SELECT count(*)::int AS n FROM '+table+' WHERE '+(table==='support_tickets'?'id':'ticket_id')+'=ANY($1::text[])',[ownedTickets])).rows[0].n,0);
      assert.ok(files().every(row=>row.files.length===0));
    }
    console.log('P0_SUPPORT_IMAGE_ALIAS_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,uploads,exactByteReads:reads,denials,retiredLegacyRequests:retired,freshActorPrechecks:4,currentMapperUrl:true,ownedFiveTableStateAndFilesStableOnDenial:true,legacyJsonUnchanged:true,peerPreserved:true,ownedCleanup:true,hosted:false}));
  });


  await t.test('MATRIX-C05 merchant SSE isolates tenant counts and bounds session revalidation through actual app',async()=>{
    const envName='FAWRI_AUTH_SSE_REVALIDATE_MS',saved=process.env[envName];
    process.env[envName]='5000';
    const x=await actor('merchant'),y=await actor('merchant'),tenantIds=[x.id,y.id],streams=[];
    const secret='Private-SSE-'+randomUUID();
    const restore=()=>{if(saved===undefined)delete process.env[envName];else process.env[envName]=saved;};
    const path='/api/auth/events';
    const notificationState=async()=>(await admin.query('SELECT to_jsonb(n) AS row FROM notifications n WHERE merchant_id=ANY($1::text[]) ORDER BY id',[tenantIds])).rows;
    async function openStream(url,who){
      const controller=new AbortController(),started=Date.now();
      const entry={controller,reader:null};streams.push(entry);
      const response=await fetch(origin+url,{headers:{Cookie:who.cookie,'X-Fawri-Device-Id':who.device,Accept:'text/event-stream'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/event-stream/);
      assert.equal(response.headers.get('cache-control'),'no-cache, no-transform');assert.equal(response.headers.get('x-accel-buffering'),'no');
      const reader=response.body.getReader();entry.reader=reader;
      let resolveFirst,rejectFirst;
      const first=new Promise((ok,no)=>{resolveFirst=ok;rejectFirst=no;});
      const frames=[],decoder=new TextDecoder();let buffer='';
      const closed=(async()=>{
        try{
          while(true){
            const {done,value}=await reader.read();if(done)break;
            buffer+=decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');
            let boundary;
            while((boundary=buffer.indexOf('\n\n'))>=0){
              const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
              const event=block.split('\n').find(line=>line.startsWith('event:'))?.slice(6).trim();
              const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
              if(event&&data){const frame={event,payload:JSON.parse(data)};frames.push(frame);resolveFirst(frame);}
            }
          }
          if(!frames.length)throw new Error('SSE closed without snapshot');
          return {frames,elapsed:Date.now()-started};
        }catch(error){rejectFirst(error);throw error;}
      })();
      closed.catch(()=>{});first.catch(()=>{});
      return {first,closed,entry};
    }
    let denials=0,passed=false;
    try{
      for(const who of [x,y]){
        await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[who.id]);
        who.session=await auth.issueSession({accountId:who.id,accountKind:'merchant',tenantId:who.id,deviceId:who.device});
        who.cookie=MERCHANT_SESSION_COOKIE+'='+who.session.token;
        assert.equal((await req('/api/auth/me',who)).status,200);
        const count=who===x?53:2;
        for(let i=0;i<count;i++)await admin.query("INSERT INTO notifications(id,audience,merchant_id,type,title_key,body_key,variables) VALUES($1,'merchant',$2,'synthetic','synthetic','synthetic',$3::jsonb)",['SSE-'+randomUUID(),who.id,JSON.stringify({private_probe:secret})]);
        for(const audience of ['merchant','admin'])await admin.query("INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key,variables,expires_at) VALUES($1,$2,$3,$4,'synthetic','synthetic','synthetic',$5::jsonb,$6)",['SSE-excluded-'+randomUUID(),audience,who.id,audience==='admin'?owner.id:null,JSON.stringify({private_probe:secret}),audience==='merchant'?new Date(Date.now()-60000):null]);
      }
      const before=await notificationState(),business=await snapshot();
      for(const [who,headers] of [[undefined,{}],[owner,{}],[x,{'X-Fawri-Device-Id':'wrong-sse-device'}],[x,{Cookie:x.cookie+'; '+owner.cookie}],[x,{Cookie:MERCHANT_SESSION_COOKIE+'=synthetic-invalid'}]]){
        const r=await fetch(origin+path,{headers:{...(who?{Cookie:who.cookie,'X-Fawri-Device-Id':who.device}:{}),...headers},signal:AbortSignal.timeout(3000)});
        assert.equal(r.status,401);const body=await r.json();assert.equal(JSON.stringify(body).includes(secret),false);denials++;
      }
      const streamX=await openStream(path+'?merchant_id='+y.id+'&account_id='+owner.id,x);
      const streamY=await openStream('/API/AuTh/EVeNtS/?merchant_id='+x.id,y);
      const frames=await Promise.all([streamX.first,streamY.first]);
      for(const [frame,count] of [[frames[0],53],[frames[1],2]]){
        assert.equal(frame.event,'snapshot');assert.deepEqual(Object.keys(frame.payload).sort(),['subscription','unread_notification_count','emitted_at'].sort());
        assert.equal(frame.payload.subscription,null);assert.equal(frame.payload.unread_notification_count,count);assert.ok(Number.isFinite(Date.parse(frame.payload.emitted_at)));
        assert.equal(JSON.stringify(frame).includes(secret),false);
        for(const id of tenantIds)assert.equal(JSON.stringify(frame).includes(id),false);
      }
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      // Current contract closes a bounded connection and authenticates reconnect.
      // It does not promise instantaneous revocation of an already-open stream.
      const completed=await Promise.all([streamX.closed,streamY.closed]);
      for(const result of completed){assert.ok(result.elapsed<12000,'bounded SSE did not end in its configured window');assert.equal(result.frames.length,1);}
      const rejected=await req(path,x);assert.equal(rejected.status,401);denials++;
      const peer=await openStream(path,y),peerFirst=await peer.first;assert.equal(peerFirst.payload.unread_notification_count,2);
      peer.entry.controller.abort();await peer.closed.catch(error=>assert.equal(error.name,'AbortError'));
      assert.deepEqual(await notificationState(),before);assert.deepEqual(await snapshot(),business);passed=true;
    }finally{
      for(const entry of streams){entry.controller.abort();if(entry.reader)await entry.reader.cancel().catch(()=>{});}
      restore();await admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[])',[tenantIds]);
    }
    console.log('P0_MERCHANT_SSE_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,merchantSnapshots:2,peerReconnect:true,denials,liveUnreadCounts:[53,2],exactPayloadKeys:3,privateVariablesAbsent:true,foreignIdentityHintsIgnored:true,boundedServerClose:true,reconnectRevalidatesRevokedSession:true,instantRevocationClaimed:false,ownedNotificationsStable:true,hosted:false}));
  });


  await t.test('MATRIX-C05 Knowledge read projections retain intended fields and isolate authenticated tenants in actual app',async()=>{
    const x=await actor('merchant'),y=await actor('merchant'),tenantIds=[x.id,y.id];
    const knowledgeTables=['knowledge_embeddings','knowledge_audit_events','learned_answers','training_requests','saved_answers'];
    const state=async()=>Object.fromEntries(await Promise.all(knowledgeTables.map(async table=>[table,(await admin.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text',[tenantIds])).rows])));
    const stamp='2026-10-30T10:00:00.000Z',expected=new Map();
    let positives=0,denials=0,passed=false;
    try{
      for(const [who,digest] of [[x,'a'.repeat(64)],[y,'b'.repeat(64)]]){
        await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[who.id]);
        who.session=await auth.issueSession({accountId:who.id,accountKind:'merchant',tenantId:who.id,deviceId:who.device});
        who.cookie=MERCHANT_SESSION_COOKIE+'='+who.session.token;
        assert.equal((await req('/api/auth/me',who)).status,200);
        const training='Read-training-'+randomUUID(),learned='Read-learned-'+randomUUID(),audit='Read-audit-'+randomUUID();
        const preview='Own preview '+who.id,answer='Own answer '+who.id;
        await admin.query("INSERT INTO training_requests(id,merchant_id,customer_text_preview,customer_text_hash,customer_text_length,detected_intent,detected_language,reason,suggested_reply,suggested_reply_source,status,rejection_reason,version,created_at,updated_at) VALUES($1,$2,$3,$4,200,'availability','en','read_fixture',$5,'merchant_draft','pending_review',NULL,3,$6,$6)",[training,who.id,preview,digest,answer,stamp]);
        await admin.query("INSERT INTO learned_answers(id,merchant_id,training_request_id,intent,language,examples,keywords,answer_text,source,approval_status,confidence,safe_to_auto_reply,version,created_at,updated_at) VALUES($1,$2,$3,'availability','en',$4::jsonb,'[\"stock\"]'::jsonb,$5,'merchant_approved','approved',0.75,true,4,$6,$6)",[learned,who.id,training,JSON.stringify([preview]),answer,stamp]);
        await admin.query("INSERT INTO knowledge_audit_events(id,merchant_id,action,entity_type,entity_id,actor_account_id,customer_text_hash,customer_text_length,signal_codes,decision_code,outcome_code,created_at) VALUES($1,$2,'training_reply_proposed','training_request',$3,$2,$4,12,'[\"synthetic_signal\"]'::jsonb,'read_fixture_decision','success',$5)",[audit,who.id,training,digest,stamp]);
        expected.set(who.id,{
          'training-requests':{ok:true,requests:[{id:training,merchantId:who.id,customerTextPreview:preview,customerTextHash:digest,detectedIntent:'availability',detectedLanguage:'en',reason:'read_fixture',suggestedReply:answer,suggestedReplySource:'merchant_draft',status:'pending_review',rejectionReason:null,version:3,createdAt:stamp,updatedAt:stamp}],nextCursor:null},
          'learned-answers':{ok:true,answers:[{id:learned,merchantId:who.id,intent:'availability',language:'en',examples:[preview],keywords:['stock'],answerText:answer,source:'merchant_approved',approvalStatus:'approved',confidence:0.75,safeToAutoReply:true,trainingRequestId:training,version:4,createdAt:stamp,updatedAt:stamp}],nextCursor:null},
          audit:{ok:true,events:[{id:audit,merchantId:who.id,action:'training_reply_proposed',entityType:'training_request',entityId:training,actor:'merchant',outcome:'success',customerTextHash:digest,customerTextLength:12,injectionSignals:['synthetic_signal'],metadata:{decisionCode:'read_fixture_decision'},createdAt:stamp}],nextCursor:null},
        });
      }
      const before=await state(),business=await snapshot();
      for(const family of ['training-requests','learned-answers','audit']){
        const path='/api/knowledge/'+family;
        for(const [who,peer] of [[x,y],[y,x]])for(const url of [path,'/API/KnOwLeDgE/'+family+'/?merchant_id='+peer.id+'&merchantId='+peer.id+'&account_id='+owner.id]){
          const r=await req(url,who);assert.equal(r.status,200,JSON.stringify(r.body));assert.deepEqual(r.body,expected.get(who.id)[family]);positives++;
          assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
        }
        for(const [who,headers] of [[undefined,{}],[owner,{}],[denied,{}],[x,{'X-Fawri-Device-Id':'wrong-knowledge-device'}],[x,{Cookie:x.cookie+'; '+owner.cookie}],[x,{Cookie:MERCHANT_SESSION_COOKIE+'=synthetic-invalid'}]]){
          const r=await req(path,who,'GET',undefined,headers);assert.equal(r.status,401,JSON.stringify(r.body));denials++;
          for(const id of tenantIds)assert.equal(JSON.stringify(r.body).includes(id),false);
          assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
        }
      }
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      for(const family of ['training-requests','learned-answers','audit']){
        assert.equal((await req('/api/knowledge/'+family,x)).status,401);denials++;
        const peer=await req('/api/knowledge/'+family,y);assert.equal(peer.status,200);assert.deepEqual(peer.body,expected.get(y.id)[family]);positives++;
      }
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);passed=true;
    }finally{
      for(const table of knowledgeTables)await admin.query('DELETE FROM '+table+' WHERE merchant_id=ANY($1::text[])',[tenantIds]);
      for(const rows of Object.values(await state()))assert.deepEqual(rows,[]);
    }
    console.log('P0_KNOWLEDGE_READ_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,merchants:2,freshActorPrechecks:2,positiveReads:positives,deniedReads:denials,exactNonemptyDto:true,intendedPreviewHashVersionRetained:true,normalizedAuditDecisionCodeRetained:true,foreignIdentityHintsIgnored:true,ownedFiveTableStateStable:true,peerPreservedAfterRevocation:true,ownedCleanup:true,hosted:false}));
  });


  await t.test('MATRIX-C06 inactive Meta callback gate matches Express case slash and HEAD semantics',async()=>{
    const keys=['FAWRI_META_CUTOVER_READY','META_REDIRECT_URI','META_APP_ID','META_APP_SECRET','META_CONFIG_ID','META_VERIFY_TOKEN'];
    const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]])),nativeFetch=globalThis.fetch;
    const paths=['/api/meta/callback','/api/meta/callback/','/API/MeTa/CaLlBaCk','/API/MeTa/CaLlBaCk/'];
    let denied=0,configured=0,remoteAttempts=0;
    const before=await snapshot();
    try{
      Object.assign(process.env,{FAWRI_META_CUTOVER_READY:'0',META_REDIRECT_URI:'https://management.example.invalid/api/meta/callback',META_APP_ID:'synthetic-gate-app',META_APP_SECRET:'synthetic-gate-secret',META_CONFIG_ID:'synthetic-gate-config',META_VERIFY_TOKEN:'synthetic-gate-verify'});
      globalThis.fetch=async(url,init)=>{if(!String(url).startsWith(origin+'/')){remoteAttempts++;throw new Error('external transport forbidden in activation gate proof');}return nativeFetch(url,init);};
      for(const path of paths)for(const method of ['GET','HEAD']){
        const r=await fetch(origin+path,{method});assert.equal(r.status,503,path+' '+method);assert.equal(r.headers.get('cache-control'),'no-store');
        const body=await r.text();if(method==='HEAD')assert.equal(body,'');else assert.deepEqual(JSON.parse(body),{ok:false,code:'META_CHANNEL_CONNECTION_CUTOVER_PENDING',error:'Meta channel connection is disabled until production-safe OAuth configuration is complete'});
        denied++;
      }
      // Complete synthetic configuration reaches the existing callback validation
      // without any OAuth code, state, token exchange or provider connection.
      process.env.FAWRI_META_CUTOVER_READY='1';
      for(const path of paths){const r=await fetch(origin+path);assert.equal(r.status,400);assert.equal(await r.text(),'Missing code from Meta');configured++;}
      assert.equal(remoteAttempts,0);assert.deepEqual(await snapshot(),before);
    }finally{
      globalThis.fetch=nativeFetch;
      for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
    }
    console.log('P0_META_ACTIVATION_GATE_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:1,inactiveDenials:denied,configuredValidationResponses:configured,remoteAttempts,headBodyEmpty:true,caseAndTrailingSlash:true,ownedStateStable:true,providerActivated:false,hosted:false}));
  });


  await t.test('MATRIX-C05 Knowledge writes and response style preserve request version and tenant authority through actual app',async()=>{
    const x=await actor('merchant'),y=await actor('merchant'),tenantIds=[x.id,y.id];
    const kt=['knowledge_embeddings','knowledge_audit_events','learned_answers','training_requests','saved_answers'];
    const state=async()=>Object.fromEntries(await Promise.all(kt.map(async table=>[table,(await admin.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE merchant_id=ANY($1::text[]) ORDER BY to_jsonb(t)::text',[tenantIds])).rows])));
    const metadata=async()=>(await admin.query('SELECT id,metadata FROM merchants WHERE id=ANY($1::text[]) ORDER BY id',[tenantIds])).rows;
    const send=(path,who,method,body,headers={})=>req(path,who,method,body,{Origin:'https://management.example.invalid',...headers});
    const saved='/api/knowledge/saved-answers',training='/api/knowledge/training-requests',style='/api/knowledge/response-style';
    let writes=0,denials=0,passed=false;
    try{
      for(const who of [x,y]){
        await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected',metadata=$2::jsonb WHERE id=$1",[who.id,JSON.stringify({unrelated:{owner:who.id,keep:true}})]);
        who.session=await auth.issueSession({accountId:who.id,accountKind:'merchant',tenantId:who.id,deviceId:who.device});who.cookie=MERCHANT_SESSION_COOKIE+'='+who.session.token;
        assert.equal((await req('/api/auth/me',who)).status,200);
      }
      const createBody={category:'custom',questionPattern:'Synthetic authority '+randomUUID(),answerText:'Own saved answer',language:'en',merchantId:y.id,merchant_id:y.id};
      const records=[];
      for(const who of [x,y]){const r=await send(saved,who,'POST',createBody);assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.answer.merchantId,who.id);assert.equal(r.body.answer.version,1);records.push(r.body.answer);writes++;}
      const [sx,sy]=records,peerBefore=(await admin.query('SELECT to_jsonb(t) AS row FROM saved_answers t WHERE merchant_id=$1',[y.id])).rows;
      let before=await state(),metaBefore=await metadata();
      for(const [path,method,body] of [[saved,'POST',createBody],[training,'POST',{customerText:'Training authority question',detectedLanguage:'en'}],[style,'PATCH',{expectedVersion:1,style:{tone:'warm'}}]]){
        for(const [who,headers] of [[undefined,{}],[owner,{}],[x,{'X-Fawri-Device-Id':'wrong-write-device'}],[x,{Cookie:x.cookie+'; '+owner.cookie}]]){
          const r=await send(path,who,method,body,headers);assert.equal(r.status,401,JSON.stringify(r.body));denials++;
          assert.deepEqual(await state(),before);assert.deepEqual(await metadata(),metaBefore);
        }
      }
      const foreign=await send(saved+'/'+sy.id,x,'PATCH',{expectedVersion:1,answerText:'foreign edit'});assert.equal(foreign.status,404);denials++;assert.deepEqual(await state(),before);
      const missing=await send(saved+'/'+sx.id,x,'PATCH',{answerText:'missing version'});assert.equal(missing.status,428);denials++;assert.deepEqual(await state(),before);
      const updated=await send('/API/KnOwLeDgE/SaVeD-AnSwErS/'+sx.id+'/?merchant_id='+y.id,x,'PATCH',{answerText:'Updated own answer',merchantId:y.id},{'If-Match':'"1"'});
      assert.equal(updated.status,200,JSON.stringify(updated.body));assert.equal(updated.body.answer.merchantId,x.id);assert.equal(updated.body.answer.version,2);assert.equal(updated.body.answer.answerText,'Updated own answer');writes++;
      before=await state();const stale=await send(saved+'/'+sx.id,x,'PATCH',{expectedVersion:1,answerText:'stale edit'});assert.equal(stale.status,409);assert.equal(stale.body.code,'VERSION_CONFLICT');denials++;assert.deepEqual(await state(),before);
      const tr=await send(training+'?merchant_id='+y.id,x,'POST',{customerText:'Synthetic training question',detectedIntent:'availability',detectedLanguage:'en',reason:'actual_app_authority',merchantId:y.id});
      assert.equal(tr.status,201,JSON.stringify(tr.body));assert.equal(tr.body.request.merchantId,x.id);assert.equal(tr.body.request.version,1);const tid=tr.body.request.id;writes++;
      before=await state();const foreignApproval=await send(training+'/'+tid+'/approve',y,'POST',{expectedVersion:1,approvedAnswer:'foreign approved'});assert.equal(foreignApproval.status,404);denials++;assert.deepEqual(await state(),before);
      const proposal=await send(training+'/'+tid+'/propose',x,'POST',{suggestedReply:'Approved synthetic reply',merchantId:y.id},{'If-Match':'W/"1"'});
      assert.equal(proposal.status,200,JSON.stringify(proposal.body));assert.equal(proposal.body.request.version,2);assert.equal(proposal.body.request.suggestedReplySource,'merchant_draft');writes++;
      const approval=await send(training+'/'+tid+'/approve',x,'POST',{expectedVersion:2,merchantId:y.id});
      assert.equal(approval.status,200,JSON.stringify(approval.body));assert.equal(approval.body.request.version,3);assert.equal(approval.body.request.status,'approved');assert.equal(approval.body.learnedAnswer.merchantId,x.id);assert.equal(approval.body.learnedAnswer.safeToAutoReply,true);writes++;
      const revoke=await send(training+'/'+tid+'/revoke',x,'POST',{expectedVersion:3});assert.equal(revoke.status,200,JSON.stringify(revoke.body));assert.equal(revoke.body.request.version,4);assert.equal(revoke.body.request.status,'rejected');writes++;
      const learned=(await admin.query('SELECT merchant_id,approval_status::text AS approval_status,safe_to_auto_reply FROM learned_answers WHERE training_request_id=$1',[tid])).rows;assert.deepEqual(learned,[{merchant_id:x.id,approval_status:'rejected',safe_to_auto_reply:false}]);
      const initial=await req(style,x);assert.equal(initial.status,200);assert.equal(initial.cache,'no-store');assert.equal(initial.body.style.version,1);
      const styled=await send(style+'?merchantId='+y.id,x,'PATCH',{expectedVersion:1,style:{tone:'warm',brevity:'concise',emojiStyle:'none',customInstructions:'Synthetic presentation only'},merchantId:y.id});
      assert.equal(styled.status,200,JSON.stringify(styled.body));assert.equal(styled.cache,'no-store');assert.equal(styled.body.style.version,2);assert.equal(styled.body.style.tone,'warm');writes++;
      const stored=await metadata();assert.deepEqual(stored.find(r=>r.id===x.id).metadata.unrelated,{owner:x.id,keep:true});assert.deepEqual(stored.find(r=>r.id===y.id).metadata,{unrelated:{owner:y.id,keep:true}});
      before=await state();metaBefore=await metadata();
      const styleStale=await send(style,x,'PATCH',{expectedVersion:1,style:{tone:'direct'}});assert.equal(styleStale.status,409);denials++;assert.deepEqual(await metadata(),metaBefore);
      const deleted=await send(saved+'/'+sx.id,x,'DELETE',{}, {'If-Match':'"2"'});assert.equal(deleted.status,200,JSON.stringify(deleted.body));assert.equal(deleted.body.deletedId,sx.id);writes++;
      assert.deepEqual((await admin.query('SELECT to_jsonb(t) AS row FROM saved_answers t WHERE merchant_id=$1',[y.id])).rows,peerBefore);
      before=await state();metaBefore=await metadata();assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      for(const [path,method,body] of [[saved,'POST',createBody],[training,'POST',{customerText:'revoked training'}],[style,'PATCH',{expectedVersion:2,style:{tone:'direct'}}]]){
        assert.equal((await send(path,x,method,body)).status,401);denials++;assert.deepEqual(await state(),before);assert.deepEqual(await metadata(),metaBefore);
      }
      assert.equal((await req(style,y)).status,200);passed=true;
    }finally{
      for(const table of kt)await admin.query('DELETE FROM '+table+' WHERE merchant_id=ANY($1::text[])',[tenantIds]);
      for(const rows of Object.values(await state()))assert.deepEqual(rows,[]);
    }
    console.log('P0_KNOWLEDGE_WRITE_STYLE_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,writes,denials,freshMerchantPrechecks:2,bodyAndIfMatchVersion:true,trainingApprovalRevocation:true,peerAndUnrelatedMetadataPreserved:true,ownedCleanup:true,realAiOrProvider:false,hosted:false}));
  });

  await t.test('MATRIX-C05 legitimate own order changes and delivered cash confirmation persist exact merchant attribution',async()=>{
    const x=await actor('merchant'),y=await actor('merchant'),tenantIds=[x.id,y.id];
    const pending='Own-pending-'+randomUUID(),cash='Own-cash-'+randomUUID(),peer='Peer-cash-'+randomUUID(),orderIds=[pending,cash,peer];
    const tables=['orders','order_payment_decisions','order_terminal_decision_links'];
    const state=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await admin.query('SELECT to_jsonb(t) AS row FROM '+table+' t WHERE '+(table==='orders'?'id':'order_id')+'=ANY($1::text[]) ORDER BY to_jsonb(t)::text',[orderIds])).rows])));
    const send=(path,method,body,headers={})=>req(path,x,method,body,{Origin:'https://management.example.invalid',...headers});
    let positive=0,denials=0,passed=false;
    try{
      for(const who of [x,y]){
        await admin.query("UPDATE merchants SET status='approved',account_status='approved',onboarding_status='channel_connected' WHERE id=$1",[who.id]);
        who.session=await auth.issueSession({accountId:who.id,accountKind:'merchant',tenantId:who.id,deviceId:who.device});who.cookie=MERCHANT_SESSION_COOKIE+'='+who.session.token;
        assert.equal((await req('/api/auth/me',who)).status,200);
      }
      for(const [id,who,status] of [[pending,x,'pending_confirmation'],[cash,x,'delivered'],[peer,y,'delivered']])await admin.query("INSERT INTO orders(id,merchant_id,customer_name,status,payment_method,payment_status,subtotal_iqd,delivery_fee_iqd,total_iqd,source_channel,version,metadata) VALUES($1,$2,'Owned synthetic order',$3,'cash_on_delivery','cash_on_delivery',12000,0,12000,'online',1,'{}'::jsonb)",[id,who.id,status]);
      const peerBefore=(await admin.query('SELECT to_jsonb(t) AS row FROM orders t WHERE id=$1',[peer])).rows;
      const path='/api/orders/'+pending+'/status';
      let before=await state();
      const absent=await send(path,'PATCH',{status:'waiting_customer_approval'});assert.equal(absent.status,400);assert.equal(absent.body.code,'ORDER_VERSION_REQUIRED');denials++;assert.deepEqual(await state(),before);
      const status=await send('/API/OrDeRs/'+pending+'/StAtUs/?merchant_id='+y.id,'PATCH',{expected_version:1,status:'waiting_customer_approval',merchant_id:y.id});
      assert.equal(status.status,200,JSON.stringify(status.body));assert.equal(status.body.order.merchant_id,x.id);assert.equal(status.body.order.version,2);assert.equal(status.body.order.status,'waiting_customer_approval');positive++;
      before=await state();
      const stale=await send(path,'PATCH',{expected_version:1,status:'pending_confirmation'});assert.equal(stale.status,409);denials++;assert.deepEqual(await state(),before);
      const noop=await send(path,'PATCH',{expected_version:2,status:'waiting_customer_approval'});assert.equal(noop.status,200);assert.equal(noop.body.order.version,2);positive++;assert.deepEqual(await state(),before);
      const requestId='Own-payment-'+randomUUID(),confirm='/api/orders/'+cash+'/payment/confirm';
      const paid=await send(confirm+'?merchant_id='+y.id,'POST',{expected_version:1,actor_id:y.id,merchant_id:y.id},{'X-Request-Id':requestId});
      assert.equal(paid.status,200,JSON.stringify(paid.body));assert.equal(paid.body.order.merchant_id,x.id);assert.equal(paid.body.order.status,'delivered');assert.equal(paid.body.order.payment_status,'paid');assert.equal(paid.body.order.version,2);assert.equal(paid.body.order.payment_verified_by,x.id);positive++;
      const decisions=(await admin.query('SELECT merchant_id,order_id,actor_type::text AS actor_type,actor_account_id,request_id,expected_version,resulting_version,operation::text AS operation FROM order_payment_decisions WHERE order_id=$1',[cash])).rows;
      assert.deepEqual(decisions,[{merchant_id:x.id,order_id:cash,actor_type:'merchant',actor_account_id:x.id,request_id:requestId,expected_version:1,resulting_version:2,operation:'confirm'}]);
      before=await state();
      const replay=await send(confirm,'POST',{expected_version:1},{'X-Request-Id':requestId});assert.equal(replay.status,200);assert.equal(replay.body.order.version,2);positive++;assert.deepEqual(await state(),before);
      const conflict=await send(confirm,'POST',{expected_version:1},{'X-Request-Id':'Different-'+randomUUID()});assert.equal(conflict.status,409);denials++;assert.deepEqual(await state(),before);
      assert.deepEqual((await admin.query('SELECT to_jsonb(t) AS row FROM orders t WHERE id=$1',[peer])).rows,peerBefore);
      assert.equal(await auth.revokeSession(x.session.token,'merchant','logout'),true);
      assert.equal((await send(path,'PATCH',{expected_version:2,status:'pending_confirmation'})).status,401);denials++;assert.deepEqual(await state(),before);
      assert.equal((await req('/api/order/'+peer,y)).status,200);passed=true;
    }finally{
      await admin.query('DELETE FROM order_terminal_decision_links WHERE order_id=ANY($1::text[])',[orderIds]);
      await admin.query('DELETE FROM order_payment_decisions WHERE order_id=ANY($1::text[])',[orderIds]);
      await admin.query('DELETE FROM orders WHERE id=ANY($1::text[])',[orderIds]);
      for(const rows of Object.values(await state()))assert.deepEqual(rows,[]);
    }
    console.log('P0_OWN_ORDER_MUTATION_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,positiveResponses:positive,denials,freshMerchantPrechecks:2,deliveredCashConfirmation:true,oneAttributedDecision:true,exactReplayNoMutation:true,staleVersionNoMutation:true,peerPreserved:true,ownedCleanup:true,providerConfirmation:false,hosted:false}));
  });


  await t.test('FIELD003 generic audit merchant incidents require current merchant visibility as well as log access',async()=>{
    const both=await actor('admin','assistant_admin',['view_logs','view_merchants']),logsOnly=await actor('admin','assistant_admin',['view_logs']),merchantsOnly=await actor('admin','assistant_admin',['view_merchants']);
    const x=await actor('merchant'),y=await actor('merchant'),auditIds=[],incidentIds=[],ordinary='Field003-ordinary-'+randomUUID(),secret='Field003-private-'+randomUUID();
    auditIds.push(ordinary);
    for(const who of [both,logsOnly,merchantsOnly]){
      const d=await security.registerAdminDeviceAuthoritative({accountId:who.id,accountKind:'admin',deviceId:who.device,deviceLabel:'FIELD003 proof'});
      await security.setAdminDeviceTrustAuthoritative({deviceRecordId:d.id,trusted:true,actorAccountId:owner.id});
      who.session=await auth.issueSession({accountId:who.id,accountKind:'admin',tenantId:'fawri-admin',adminRole:who.role,deviceId:who.device,permissions:who.permissions});
      who.cookie=ADMIN_SESSION_COOKIE+'='+who.session.token;
      assert.equal((await req('/api/auth/admin/me',who)).status,200);
    }
    const state=async()=>(await admin.query('SELECT to_jsonb(t) AS row FROM audit_events t WHERE id=ANY($1::text[]) ORDER BY id',[auditIds])).rows;
    let reads=0,denials=0,passed=false;
    try{
      for(const who of [x,y]){
        const id='Field003-incident-'+randomUUID();auditIds.push(id);incidentIds.push(id);
        await admin.query("INSERT INTO audit_events(id,actor_kind,merchant_id,action_type,entity_type,entity_id,details,metadata) VALUES($1,'system',$2,'early_warning_incident_opened','early_warning_incident',$1,'Synthetic merchant health',$3::jsonb)",[id,who.id,JSON.stringify({scope:'merchant',merchant_id:who.id,value:27,runbook:secret})]);
      }
      await admin.query("INSERT INTO audit_events(id,actor_kind,merchant_id,action_type,entity_type,entity_id,details,metadata) VALUES($1,'system',$2,'synthetic_ordinary','merchant',$2,'Ordinary audit remains visible','{}'::jsonb)",[ordinary,x.id]);
      const before=await state(),business=await snapshot();
      for(const who of [owner,both]){
        const result=await req('/api/auth/admin/logs',who);assert.equal(result.status,200);
        for(const id of incidentIds){const row=result.body.logs.find(row=>row.id===id);assert.ok(row);assert.equal(row.meta.runbook,secret);assert.equal(row.meta.value,27);}
        assert.ok(result.body.logs.some(row=>row.id===ordinary));reads++;
      }
      for(const path of ['/api/auth/admin/logs','/API/AuTh/AdMiN/LoGs/?view_merchants=true&includeMerchantIncidentAudit=true&owner=true']){
        const result=await req(path,logsOnly);assert.equal(result.status,200);assert.ok(result.body.logs.some(row=>row.id===ordinary));
        for(const id of incidentIds)assert.equal(result.body.logs.some(row=>row.id===id),false);
        assert.equal(JSON.stringify(result.body).includes(secret),false);reads++;
      }
      const deniedResult=await req('/api/auth/admin/logs',merchantsOnly);assert.equal(deniedResult.status,403);denials++;
      await admin.query("DELETE FROM admin_permissions WHERE admin_id=$1 AND permission='view_merchants'",[both.id]);
      const reduced=await req('/api/auth/admin/logs?view_merchants=true',both);assert.equal(reduced.status,200);assert.ok(reduced.body.logs.some(row=>row.id===ordinary));assert.equal(JSON.stringify(reduced.body).includes(secret),false);
      for(const id of incidentIds)assert.equal(reduced.body.logs.some(row=>row.id===id),false);reads++;
      assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);passed=true;
    }finally{
      await admin.query('DELETE FROM audit_events WHERE id=ANY($1::text[])',[auditIds]);
      assert.deepEqual(await state(),[]);
    }
    console.log('P0_FIELD003_GENERIC_INCIDENT_AUDIT_FULL_APP_OBSERVED '+JSON.stringify({actualApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:passed?1:0,reads,denials,currentSqlPermissionRemoval:true,requestHintsIgnored:true,ownerAndBothPermissionsAllowed:true,ordinaryAuditPreserved:true,ownedAuditStateUnchanged:true,ownedCleanup:true,hosted:false}));
  });

  console.log('P0_MANAGEMENT_FULL_APP_HTTP '+JSON.stringify({actualApp:true,syntheticMerchants:merchants.length,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,caseVariants:true,pathIdentityPreserved:true,legacyFallthroughDenied:true,sqlPermissionAndSessionRevocation:true,legacyJsonCreated:false,fullEightTableMatrix:false,hostedAccepted:false}));
});
