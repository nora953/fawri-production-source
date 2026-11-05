import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();

test('FIELD002 three legacy subscription notification writers remain behind PostgreSQL cutover', () => {
  const load = relative => readFileSync(new URL('../src/' + relative,import.meta.url),'utf8');
  const legacyFunctions=load('routes/authRuntimePart3.ts');
  const legacyPart1=load('routes/authRoutesPart1.ts');
  const legacyPart3=load('routes/authRoutesPart3.ts');
  const subscription=load('routes/subscription-entitlement-pg.ts');
  const secureRouter=load('routes/auth-security.ts');
  const app=load('app.ts');
  const gate=load('middleware/legacyProductionFallbackGuard.ts');

  const writers=[
    ['subscription_balance_purchase','appendMerchantBalanceNotification',legacyPart3],
    ['subscription_plan_event','appendMerchantSubscriptionPlanNotification',legacyPart3],
    ['subscription_emergency_activated','appendMerchantEmergencyActivationNotification',legacyPart1],
  ];
  for(const [type,fn,routeSource] of writers){
    assert.match(legacyFunctions,new RegExp('export function '+fn+'\\s*\\('),
      type+': the legacy AuthDb producer is not proven');
    assert.match(legacyFunctions,new RegExp('type: ["\\x27]'+type+'["\\x27]'),
      type+': the legacy event-to-writer mapping changed');
    assert.match(routeSource,new RegExp('\\b'+fn+'\\s*\\('),
      type+': the old JSON route callsite changed; inspect policy before accepting');
  }

  // In PostgreSQL-required mode the actual secure authority must own all
  // three corresponding endpoint paths before the legacy AuthDb router.
  assert.match(subscription,/router\.use\(postgresOnly\)/);
  assert.match(subscription,/!subscriptionPostgresAuthorityRequired\(\)/);
  assert.match(subscription,/router\.post\(\s*"\/subscription\/emergency"/);
  assert.match(subscription,/activateEmergencyCreditPostgres\(/);
  assert.match(subscription,/router\.put\(\s*"\/merchants\/:id\/subscription"/);
  assert.match(subscription,/applySubscriptionPlanOperationPostgres\(/);
  assert.match(subscription,/router\.patch\(\s*"\/merchants\/:id\/subscription"/);
  assert.match(subscription,/applySubscriptionActionPostgres\(/);
  const pgMount=secureRouter.indexOf('router.use(subscriptionEntitlementPgRouter');
  const publicMount=secureRouter.indexOf('router.use(publicRoutes');
  assert.ok(pgMount>=0 && pgMount<publicMount,'PostgreSQL subscription routes must precede public fallback');
  const securityMount=app.indexOf('app.use("/api/auth", authSecurityRouter)');
  const fallbackGate=app.indexOf('app.use(enforceLegacyAuthProductionCutoverGate);');
  const legacyMount=app.indexOf('app.use("/api", router);');
  assert.ok(securityMount>=0 && securityMount<fallbackGate && fallbackGate<legacyMount,
    'PG security router and last-resort legacy auth fence must precede JSON routes');
  assert.match(gate,/if \(!operationalPostgresAuthorityRequired\(\)\)/);
  assert.match(gate,/pathname\.startsWith\("\/api\/auth\/"\)/);
  assert.match(gate,/res\.status\(410\)/);
  assert.match(gate,/LEGACY_AUTH_ROUTE_RETIRED/);
});


// FIELD002 source regression: review an intentional type/field policy change
// rather than silently drifting away from the previously reviewed contract.
// This is a source/disposable test, not historical writer or policy sign-off.
test('FIELD002 twelve-type source projection allowlist matches reviewed response contract', () => {
  const {readFileSync} = requireReadFileForField002();
  const source = readFileSync(new URL('../src/services/postgresMerchantNotificationAuthority.ts',import.meta.url),'utf8');
  const matrix = JSON.parse(readFileSync(new URL('../../../docs/final-audit/evidence/P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json',import.meta.url),'utf8')).responseFieldContract;
  const match = source.match(/const NOTIFICATION_RESPONSE_VARIABLE_FIELDS:[^\n]* = \{\n([\s\S]*?)\n\};/);
  assert.ok(match,'manual source-contract review required if the projection mapping is restructured');
  const actual = JSON.parse('{' + match[1].replace(/,\s*$/,'') + '}');
  assert.equal(matrix.types.length,12);
  assert.deepEqual(Object.keys(actual).sort(),matrix.types.map(row=>row.type).sort());
  const reserved=new Set(['id','type','created_at','read_at','merchant_id','account_id']);
  for(const shape of matrix.types){
    const allowed=[...shape.required,...shape.optional,...(shape.permittedExtraKeys??[])];
    assert.equal(new Set(allowed).size,allowed.length,'duplicate response field: '+shape.type);
    assert.ok(allowed.every(field=>!reserved.has(field)),'reserved field in '+shape.type);
    assert.deepEqual(actual[shape.type],allowed,'unreviewed response field drift for '+shape.type);
  }
  assert.match(source,/Object\.hasOwn\(NOTIFICATION_RESPONSE_VARIABLE_FIELDS, notificationType\)/,
    'unknown/inherited notification type lookup must remain own-property guarded');
});

// Avoid relying on TypeScript module loading just to inspect the review matrix.
function requireReadFileForField002(){return {readFileSync};}

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
    const inheritedTypeRows=['constructor','__proto__','toString'].map(type=>({id:'historical-projection-'+randomUUID(),type}));
    const insertedIds=[knownId,unknownId,...inheritedTypeRows.map(row=>row.id)];
    const variables={conversation_id:'conversation-verified',action_url:'/conversations/verified',order_id:'extra-not-permitted',internal_note:'stored-only-sentinel'};
    try{
      for(const [id,type,fields] of [[knownId,'operational_customer_message',variables],[unknownId,'historical_custom',{internal_note:'stored-only-sentinel'}],...inheritedTypeRows.map(row=>[row.id,row.type,{internal_note:'stored-only-sentinel'}])]){
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
      for(const row of inheritedTypeRows){
        const historical=list.body.notifications.find(item=>item.id===row.id);
        assert.ok(historical,`historical notification type ${row.type} must not break the entire list`);
        assert.equal(historical.type,row.type);
        assert.deepEqual(Object.keys(historical).sort(),['created_at','id','type']);
      }
      assert.doesNotMatch(JSON.stringify(list.body),/stored-only-sentinel|extra-not-permitted/);
      const foreign=await req('/notifications/'+knownId+'/read',a,'PATCH');
      assert.equal(foreign.status,404);
      const read=await req('/notifications/'+knownId+'/read',b,'PATCH');
      assert.equal(read.status,200);
      assert.ok(read.body.notification.read_at);
      assert.deepEqual(Object.keys(read.body.notification).sort(),['action_url','conversation_id','created_at','id','read_at','type']);
      const historicalRead=await req('/notifications/'+inheritedTypeRows[0].id+'/read',b,'PATCH');
      assert.equal(historicalRead.status,200);
      assert.ok(historicalRead.body.notification.read_at);
      assert.deepEqual(Object.keys(historicalRead.body.notification).sort(),['created_at','id','read_at','type']);
      const historicalStored=await admin.query('SELECT variables FROM notifications WHERE id=$1',[inheritedTypeRows[0].id]);
      assert.deepEqual(historicalStored.rows[0].variables,{internal_note:'stored-only-sentinel'});
      const persisted=await admin.query('SELECT variables FROM notifications WHERE id=$1',[knownId]);
      assert.deepEqual(persisted.rows[0].variables,variables,'response projection must not rewrite stored notifications');
    }finally{
      await admin.query('DELETE FROM notifications WHERE id=ANY($1::text[])',[insertedIds]);
    }
  });
  await t.test('seven hosted-observed historical notification types retain canonical HTTP fields without leaking stored extensions',async()=>{
    const {isMerchantNotificationRecord}=await import('../../fawri/src/lib/merchantNotificationsAuthority.ts');
    // Historical type set was independently observed in read-only Neon staging.
    // All test rows here are synthetic and stay in disposable CI PostgreSQL.
    // Field names below are the complete key union observed in 28 historical
    // Neon staging rows, without exporting any original values or merchant IDs.
    const historical=[
      {type:'inspection_session_request',visible:{
        ticket_id:'legacy-ticket',inspection_request_id:'legacy-request',
        ticket_subject:'Synthetic inspection',admin_name:'Synthetic admin',
        mode:'independent_read_only',request_expires_at:'2026-12-01T00:00:00.000Z',
        action_url:'/support/inspection/fixture',
      }},
      {type:'subscription_balance_purchase',visible:{
        purchased_replies:12,emergency_debt_paid:2,addon_replies_added:7,
        emergency_debt_remaining:1,base_replies_remaining:9,
        emergency_replies_remaining:3,addon_replies_remaining:7,
        total_replies_available:19,addon_batch_id:'synthetic-batch',
        addon_batch_expires_at:'2026-12-01T00:00:00.000Z',
      }},
      {type:'subscription_plan_event',visible:{
        operation:'change',plan_name:'gold',start_date:'2026-10-01T00:00:00.000Z',
        expires_at:'2026-12-01T00:00:00.000Z',emergency_debt_paid:2,
        emergency_debt_remaining:1,base_replies_remaining:9,
        addon_replies_remaining:7,total_replies_available:19,
        previous_plan_name:'silver',
      }},
      {type:'subscription_emergency_activated',visible:{
        addon_batch_id:'emergency-batch',emergency_replies_added:20,
        emergency_debt:5,expires_at:'2026-12-01T00:00:00.000Z',
      }},
      {type:'subscription_expired',visible:{
        plan_name:'silver',expired_at:'2026-10-01T00:00:00.000Z',
        addon_replies_remaining:0,
      }},
      {type:'subscription_expiry_reminder',visible:{
        plan_name:'gold',expires_at:'2026-12-01T00:00:00.000Z',
        days_remaining:3,
      }},
      {type:'support_reply_reminder',visible:{
        ticket_id:'legacy-support',ticket_subject:'Synthetic support request',
        action_url:'/support/tickets/fixture',
      }},
    ];
    const records=historical.map(({type,visible})=>({
      id:'historical-seven-'+randomUUID(),type,visible,
      stored:{...visible,internal_note:'historical-only-private-sentinel',
        id:'forged-identity',type:'forged-type',created_at:'1999-01-01T00:00:00.000Z',
        read_at:'1999-01-01T00:00:00.000Z',
        ...(type==='inspection_session_request'?{request_status:'approved',
          consent_decision:'allow',ended_at:'1999-01-01T00:00:00.000Z'}:{})},
    }));
    const ids=records.map(r=>r.id);
    try{
      for(const item of records){
        await admin.query("INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key,variables) VALUES($1,'merchant',$2,$2,$3,'synthetic','synthetic',$4::jsonb)",[
          item.id,b.id,item.type,JSON.stringify(item.stored),
        ]);
      }
      const before=(await admin.query('SELECT id,type,variables,read_at FROM notifications WHERE id=ANY($1::text[]) ORDER BY id',[ids])).rows;
      assert.equal(before.length,7);
      const list=await req('/notifications?limit=50',b);
      assert.equal(list.status,200);
      for(const item of records){
        const projected=list.body.notifications.find(row=>row.id===item.id);
        assert.ok(projected,'historical type missing from merchant HTTP: '+item.type);
        assert.equal(projected.type,item.type);
        assert.deepEqual(Object.keys(projected).sort(),
          ['id','type','created_at',...Object.keys(item.visible)].sort());
        for(const [key,value] of Object.entries(item.visible))assert.equal(projected[key],value);
        if(item.type==='inspection_session_request'){
          // Source-less legacy inspection rows must not fabricate a live
          // decision. Real source-linked inspection rows have separate passing
          // HTTP+frontend lifecycle proof in operational-notification-field.
          assert.equal(isMerchantNotificationRecord(projected),false,
            'unlinked inspection cannot impersonate a live approved request');
          assert.equal(Object.hasOwn(projected,'request_status'),false);
        }else{
          assert.equal(isMerchantNotificationRecord(projected),true,
            'historic SQL->HTTP row must pass the actual frontend validator: '+item.type);
        }
        assert.equal(projected.read_at,undefined,'stored read_at must not forge canonical read state');
      }
      assert.doesNotMatch(JSON.stringify(list.body),/historical-only-private-sentinel|forged-identity|forged-type|1999-01-01/);
      const foreignList=await req('/notifications?limit=50',a);
      assert.equal(foreignList.status,200);
      for(const id of ids)assert.equal(foreignList.body.notifications.some(n=>n.id===id),false);
      for(const item of records){
        const denied=await req('/notifications/'+encodeURIComponent(item.id)+'/read',a,'PATCH');
        assert.equal(denied.status,404);
        assert.equal(denied.body.code,'NOTIFICATION_NOT_FOUND');
      }
      const afterDenials=(await admin.query('SELECT id,type,variables,read_at FROM notifications WHERE id=ANY($1::text[]) ORDER BY id',[ids])).rows;
      assert.deepEqual(afterDenials,before,'foreign read attempts must leave every historical SQL row unchanged');
      const plan=records.find(r=>r.type==='subscription_plan_event');
      const accepted=await req('/notifications/'+encodeURIComponent(plan.id)+'/read',b,'PATCH');
      assert.equal(accepted.status,200);
      assert.equal(accepted.body.notification.id,plan.id);
      assert.equal(accepted.body.notification.plan_name,'gold');
      assert.equal(isMerchantNotificationRecord(accepted.body.notification),true,
        'historical plan read must pass frontend validation');
      assert.ok(accepted.body.notification.read_at);
      assert.deepEqual(Object.keys(accepted.body.notification).sort(),
        ['id','type','created_at','read_at',...Object.keys(plan.visible)].sort());
      const afterOwn=(await admin.query('SELECT id,type,variables,read_at FROM notifications WHERE id=ANY($1::text[]) ORDER BY id',[ids])).rows;
      for(let i=0;i<before.length;i++){
        assert.deepEqual(afterOwn[i].variables,before[i].variables,'stored historical variables must remain immutable');
        assert.equal(afterOwn[i].read_at===null,before[i].id!==plan.id,
          'only the selected own notification can change read state');
      }
    }finally{
      await admin.query('DELETE FROM notifications WHERE id=ANY($1::text[])',[ids]);
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
