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
    let completed=0;
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
      await rt.test('actual restricted-role SQL read denial returns a generic error and legitimate report recovers after restoring fixture privilege',async()=>{
        checkReport(await req('/api/reports/online',x),all);
        try{
          await admin.query('REVOKE SELECT ON order_items FROM '+runtime.role);
          assert.equal((await admin.query("SELECT has_table_privilege($1,'public.order_items','SELECT') AS allowed",[runtime.role])).rows[0].allowed,false);
          await assert.rejects(runtime.runtimePool.query('SELECT 1 FROM order_items LIMIT 0'),e=>e.code==='42501');
          const r=await req(path,x);assert.equal(r.status,500);assert.equal(r.cache,'no-store');
          assert.deepEqual(r.body,{ok:false,code:'ONLINE_REPORT_OPERATION_FAILED',error:'online report operation failed'});
          assert.doesNotMatch(JSON.stringify(r.body),/order_items|permission denied|42501|knowledge_app_|private-report-/);
          assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);
        }finally{await admin.query('GRANT SELECT ON order_items TO '+runtime.role);}
        checkReport(await req('/api/reports/online',x),all);
        assert.deepEqual(await state(),before);assert.deepEqual(await snapshot(),business);completed++;
      });
      console.log('P0_ONLINE_REPORT_FULL_APP_HTTP '+JSON.stringify({actualFullApp:true,restrictedPrimary:true,separateAuthLogin:true,passedCases:completed,allAssertionsPassed:completed===3,hosted:false}));
    }finally{
      await admin.query('DELETE FROM order_items WHERE merchant_id=ANY($1::text[])',[[x.id,y.id]]);
      await admin.query('DELETE FROM orders WHERE merchant_id=ANY($1::text[])',[[x.id,y.id]]);
      await admin.query('DELETE FROM merchant_locations WHERE merchant_id=ANY($1::text[])',[[x.id,y.id]]);
    }
  });

  console.log('P0_MANAGEMENT_FULL_APP_HTTP '+JSON.stringify({actualApp:true,syntheticMerchants:merchants.length,restrictedPrimaryLogin:true,separateAuthenticationLogin:true,caseVariants:true,pathIdentityPreserved:true,legacyFallthroughDenied:true,sqlPermissionAndSessionRevocation:true,legacyJsonCreated:false,fullEightTableMatrix:false,hostedAccepted:false}));
});
