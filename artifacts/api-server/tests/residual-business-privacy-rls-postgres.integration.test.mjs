import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
const tables=['audit_events','manual_reply_requests','merchant_admin_notes','merchant_channel_overrides','merchant_deletion_requests','notifications','order_drafts','processed_channel_events'];
// Strict regression: existing broad fixture grants remain unchanged; RLS enforces scope.
test('scope residual business data while preserving merchant and trusted global operations',{timeout:120000},async t=>{
  const fixture=await createDisposableKnowledgeRuntime(),admin=fixture.admin,primary=fixture.runtimePool;
  const rows=[0,1].map(()=>{const id=randomUUID();return {merchant:`residual-${id}`,channel:`residual-channel-${id}`,conversation:`residual-conversation-${id}`,row:`residual-row-${id}`};});
  const merchants=rows.map(r=>r.merchant),saved=process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;
  const owner=`residual-owner-${randomUUID()}`,incidentId=`residual-incident-${randomUUID()}`,adminNotice=`residual-admin-notice-${randomUUID()}`;
  t.after(()=>cleanupResources([
    ['system incident',()=>admin.query('DELETE FROM audit_events WHERE entity_id=$1',[incidentId])],
    ...tables.map(table=>[table,()=>admin.query(`DELETE FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])]),
    ['conversations',()=>admin.query('DELETE FROM conversations WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['channels',()=>admin.query('DELETE FROM merchant_channels WHERE merchant_id=ANY($1::text[])',[merchants])],
    ['directory audits',()=>admin.query('DELETE FROM database_admin_access_audits WHERE admin_account_id=$1',[owner])],
    ['owner notifications',()=>admin.query('DELETE FROM notifications WHERE account_id=$1',[owner])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[[...merchants,owner]])],
    ['runtime',()=>fixture.dispose()],
    ['environment',()=>{if(saved===undefined)delete process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY;else process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=saved;}],
  ]));
  process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
  const {withMerchantOperationalTransaction:scoped}=await import('../src/services/operationalPostgresAuthority.ts');
  const {withAuthenticationTransaction:trusted}=await import('../src/services/authenticationPostgresAuthority.ts');
  await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'admin',$2,'synthetic','active',true)",[owner,`+194${randomInt(100000000,999999999)}`]);
  await admin.query("INSERT INTO admin_profiles(id,account_id,profile_kind,display_name,role,enabled,must_change_password) VALUES($1,$1,'admin','Synthetic owner','owner_admin',true,false)",[owner]);
  for(const r of rows){
    await admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[r.merchant,`+197${randomInt(100000000,999999999)}`]);
    await admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[r.merchant]);
    await admin.query("INSERT INTO merchant_channels(id,merchant_id,platform,status) VALUES($1,$2,'messenger','connected')",[r.channel,r.merchant]);
    await admin.query("INSERT INTO conversations(id,merchant_id,channel_id,customer_external_id) VALUES($1,$2,$3,'synthetic-customer')",[r.conversation,r.merchant,r.channel]);
    await admin.query("INSERT INTO audit_events(id,actor_kind,action_type,merchant_id,details) VALUES($1,'system','synthetic',$2,'Synthetic private audit')",[r.row,r.merchant]);
    await admin.query("INSERT INTO manual_reply_requests(id,merchant_id,conversation_id,idempotency_key,text_sha256) VALUES($1,$2,$3,$1,$4)",[r.row,r.merchant,r.conversation,'a'.repeat(64)]);
    await admin.query("INSERT INTO merchant_admin_notes(merchant_id,note) VALUES($1,'Synthetic private note')",[r.merchant]);
    await admin.query("INSERT INTO merchant_channel_overrides(merchant_id,platform,status) VALUES($1,'messenger','connected')",[r.merchant]);
    await admin.query("INSERT INTO merchant_deletion_requests(id,merchant_id,merchant_id_snapshot,merchant_name_snapshot,merchant_phone_snapshot,requested_by_admin_id_snapshot,requested_by_admin_name_snapshot,requested_by_admin_phone_snapshot,reason,details) VALUES($1,$2,$2,'Synthetic','Synthetic','synthetic-admin','Synthetic','Synthetic','policy_violation','Synthetic private deletion note')",[r.row,r.merchant]);
    await admin.query("INSERT INTO notifications(id,audience,merchant_id,type,title_key,body_key) VALUES($1,'merchant',$2,'synthetic','synthetic.title','synthetic.body')",[r.row,r.merchant]);
    await admin.query("INSERT INTO order_drafts(id,merchant_id,conversation_id,customer_external_id,awaiting_field,expires_at) VALUES($1,$2,$3,'synthetic-customer','synthetic',now()+interval '1 hour')",[r.row,r.merchant,r.conversation]);
    await admin.query("INSERT INTO processed_channel_events(id,merchant_id,channel_id,external_event_id,event_type,payload_hash,processing_status) VALUES($1,$2,$3,$1,'synthetic',$4,'received')",[r.row,r.merchant,r.channel,'b'.repeat(64)]);
  }
  await admin.query("INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key) VALUES($1,'admin',$2,$3,'synthetic','private.title','private.body')",[adminNotice,merchants[0],owner]);
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await admin.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id,to_jsonb(t)::text`,[merchants])).rows])));
  const before=await snapshot();
  for(const table of tables)assert.equal(before[table].length,table==='notifications'?3:2,`synthetic seed missing: ${table}`);
  const scopedTables=['audit_events','manual_reply_requests','notifications','order_drafts','processed_channel_events'];
  const {assertProductionDatabaseRlsReady:ready}=await import('../src/services/postgresRuntimeRlsSecurity.ts');
  const env={...process.env,NODE_ENV:'production',FAWRI_DEPLOYMENT_MODE:'production',FAWRI_OPERATOR_DATABASE_URL:'postgresql://unused@127.0.0.1/fawri_ci'};
  let readDenials=0,mutationDenials=0,ownWrites=0;
  const rollbackProbe=async(merchant,sql,values)=>{
    const stop=new Error('owned residual rollback');let result;
    try{await scoped(merchant,async c=>{result=await c.query(sql,values);throw stop;});assert.fail('probe must roll back');}
    catch(error){if(error===stop)return {rows:result.rowCount};if(error.code==='42501')return {denied:true};throw error;}
  };
  await t.test('readiness requires all five scoped boundaries and actual nonprivileged primary LOGIN',async()=>{
    await ready(env);
    assert.deepEqual((await primary.query('SELECT session_user=current_user AS same_login,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreaterole FROM pg_roles r WHERE r.rolname=session_user')).rows[0],{same_login:true,rolcanlogin:true,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
    for(const table of scopedTables){
      await admin.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
      try{await assert.rejects(ready(env),{code:'PRODUCTION_DATABASE_TENANT_RLS_REQUIRED'});}
      finally{await admin.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);}
    }
    await ready(env);
  });
  await t.test('unscoped and foreign reads deny while both merchant scopes retain own operations',async()=>{
    for(const table of scopedTables){
      const sql=`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[])`;
      assert.equal((await primary.query(sql,[merchants])).rowCount,0);readDenials++;
      for(const merchant of merchants){
        const result=await scoped(merchant,c=>c.query(sql,[merchants]));assert.equal(result.rowCount,1);assert.equal(result.rows[0].merchant_id,merchant);readDenials++;
        assert.deepEqual(await rollbackProbe(merchant,`UPDATE ${table} SET merchant_id=merchant_id WHERE merchant_id=$1`,[merchant]),{rows:1});ownWrites++;
      }
      assert.equal((await primary.query(sql,[merchants])).rowCount,0);readDenials++;
    }
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('foreign writes and administrative notifications cannot acquire ordinary tenant authority',async()=>{
    for(const table of scopedTables)for(const merchant of merchants)for(const op of ['UPDATE','DELETE']){
      const sql=op==='UPDATE'?`UPDATE ${table} SET merchant_id=merchant_id WHERE merchant_id=$1`:`DELETE FROM ${table} WHERE merchant_id=$1`;
      const result=await rollbackProbe(merchant,sql,[merchants[1]===merchant?merchants[0]:merchants[1]]);assert.ok(result.denied||result.rows===0);mutationDenials++;
    }
    const b=rows[1],id=`denied-${randomUUID()}`;
    const inserts=[
      ["INSERT INTO audit_events(id,actor_kind,merchant_id,action_type) VALUES($1,'system',$2,'synthetic')",[id,b.merchant]],
      ["INSERT INTO manual_reply_requests(id,merchant_id,conversation_id,idempotency_key,text_sha256) VALUES($1,$2,$3,$1,$4)",[id,b.merchant,b.conversation,'c'.repeat(64)]],
      ["INSERT INTO notifications(id,audience,merchant_id,type,title_key,body_key) VALUES($1,'merchant',$2,'synthetic','synthetic','synthetic')",[id,b.merchant]],
      ["INSERT INTO order_drafts(id,merchant_id,conversation_id,customer_external_id,awaiting_field,expires_at) VALUES($1,$2,$3,'synthetic','synthetic',now()+interval '1 hour') ON CONFLICT(conversation_id) DO UPDATE SET awaiting_field=EXCLUDED.awaiting_field",[id,b.merchant,b.conversation]],
      ["INSERT INTO processed_channel_events(id,merchant_id,channel_id,external_event_id,event_type,payload_hash,processing_status) VALUES($1,$2,$3,$1,'synthetic',$4,'received')",[id,b.merchant,b.channel,'d'.repeat(64)]],
    ];
    for(const [sql,params] of inserts){assert.deepEqual(await rollbackProbe(merchants[0],sql,params),{denied:true});mutationDenials++;}
    assert.equal((await scoped(merchants[0],c=>c.query('SELECT id FROM notifications WHERE id=$1',[adminNotice]))).rowCount,0);readDenials++;
    assert.deepEqual(await rollbackProbe(merchants[0],"UPDATE notifications SET audience='merchant' WHERE id=$1",[adminNotice]),{rows:0});mutationDenials++;
    assert.deepEqual(await rollbackProbe(merchants[0],"INSERT INTO notifications(id,audience,merchant_id,account_id,type,title_key,body_key) VALUES($1,'admin',$2,$3,'synthetic','private','private')",[`denied-admin-${randomUUID()}`,merchants[0],owner]),{denied:true});mutationDenials++;
    assert.deepEqual(await snapshot(),before);
  });
  await t.test('directory capability alone cannot reveal residual business records',async()=>{
    await admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) TO ${fixture.role}`);
    try{
      await assert.rejects(ready(env),{code:'PRODUCTION_DATABASE_OPERATOR_AUTHORITY_REACHABLE'});
      for(const table of scopedTables){assert.equal((await scoped(merchants[0],c=>c.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants]))).rowCount,0);readDenials++;}
    }finally{await admin.query(`REVOKE EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) FROM ${fixture.role}`);}
    await ready(env);assert.deepEqual(await snapshot(),before);
  });
  await t.test('actual own notification and manual-reply persistence and trusted global audit services continue',async()=>{
    await trusted(async c=>{
      for(const table of tables)assert.equal((await c.query(`SELECT merchant_id FROM ${table} WHERE merchant_id=ANY($1::text[])`,[merchants])).rowCount,table==='notifications'?3:2);
    });
    const {notifyMerchantNewOrderPostgres:notify}=await import('../src/services/postgresOperationalNotificationAuthority.ts');
    const notificationInput={merchantId:merchants[0],orderId:`synthetic-order-${randomUUID()}`};
    const first=await notify(notificationInput),repeat=await notify(notificationInput);assert.equal(first.deduplicated,false);assert.equal(repeat.deduplicated,true);assert.equal(first.notification_id,repeat.notification_id);
    assert.equal((await scoped(merchants[1],c=>c.query('SELECT id FROM notifications WHERE id=$1',[first.notification_id]))).rowCount,0);
    const manual=await import('../src/services/postgresManualConversationAuthority.ts');
    assert.equal((await manual.getServerConversationAuthoritative(merchants[0],rows[0].conversation)).id,rows[0].conversation);
    await assert.rejects(manual.getServerConversationAuthoritative(merchants[0],rows[1].conversation),{code:'CONVERSATION_NOT_FOUND'});
    await manual.failManualReplyAuthoritative({merchantId:merchants[0],conversationId:rows[0].conversation,idempotencyKey:rows[0].row,errorCode:'SYNTHETIC_TEST',uncertain:false});
    assert.equal((await admin.query('SELECT status FROM manual_reply_requests WHERE id=$1',[rows[0].row])).rows[0].status,'failed');
    assert.equal((await admin.query('SELECT status FROM manual_reply_requests WHERE id=$1',[rows[1].row])).rows[0].status,'pending');
    const {appendMerchantAdminLogPostgres:append}=await import('../src/services/postgresMerchantAdminLogAuthority.ts');
    const audit=await append({merchantId:merchants[0],actorAdminId:owner,actionType:'plan_activated',details:'Synthetic bounded audit'});
    assert.equal((await admin.query('SELECT id FROM audit_events WHERE id=$1',[audit.id])).rowCount,1);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_type='early_warning_incident'")).rows[0].n,0,'owned isolated history precondition');
    const {syncEarlyWarningIncidentHistory:sync}=await import('../src/services/earlyWarningIncidentHistory.ts');
    const incident={id:incidentId,scope:'system',severity:'warning',area:'synthetic',code:incidentId,value:1,runbook:'synthetic'};
    const active=await sync({incidents:[incident],window:'24h'});assert.ok(active.some(r=>r.incident_key===incidentId&&r.status==='active'));
    await sync({incidents:[incident],window:'24h'});assert.equal((await admin.query('SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1',[incidentId])).rows[0].n,1);
    const resolved=await sync({incidents:[],window:'24h'});assert.ok(resolved.some(r=>r.incident_key===incidentId&&r.status==='resolved'));
    assert.equal((await primary.query('SELECT id FROM audit_events WHERE entity_id=$1',[incidentId])).rowCount,0);
    assert.deepEqual((await primary.query('SELECT public.fawri_tenant_or_audited_admin($1) AS a,public.fawri_tenant_or_audited_admin($2) AS b',merchants)).rows[0],{a:false,b:false});
  });
  console.log('P0_RESIDUAL_BUSINESS_PRIVACY_REMEDIATION '+JSON.stringify({scopedTables:5,syntheticMerchants:2,actualPrimaryAndAuthLogins:2,readDenials,mutationDenials,ownNoopWrites:ownWrites,administrativeNotificationsPrivate:true,directoryOnlyDenied:true,actualNotificationDedupe:true,actualManualFailurePersistence:true,actualAdminLogAndSystemIncidentHistory:true,rollbackAndPeerPreservation:true,httpRoleMatrixTested:false,hostedCertified:false,releaseAccepted:false}));
});
