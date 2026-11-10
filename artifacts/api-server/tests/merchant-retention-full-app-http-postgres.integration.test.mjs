import assert from 'node:assert/strict';
import {randomInt, randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

await assertDisposablePostgres();
Object.assign(process.env,{
  NODE_ENV:'test',LOG_LEVEL:'silent',FAWRI_DISABLE_JOB_WORKERS:'1',
  FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',
  FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY:'required',
  FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required',
  FAWRI_AUTH_SECURITY_SECRET:'disposable-retention-http-secret-at-least-32-characters',
  FAWRI_PASSWORD_SALT:'disposable-retention-http-salt-at-least-32-characters',
});

test('real full app merchant HTTP cannot mutate a retention-suspended account on a future pending subscription', {timeout:150_000}, async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const ids=[],notices=[],actors=[];
  let server,stopSupport;
  t.after(()=>cleanupResources([
    ['stop support runtime',()=>stopSupport?.()],
    ['close actual app HTTP',async()=>{if(server){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}}],
    ['delete notices',()=>admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[])',[ids])],
    ['delete subscriptions',()=>admin.query('DELETE FROM subscriptions WHERE merchant_id=ANY($1::text[])',[ids])],
    ['delete synthetic merchants',()=>admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])',[ids])],
    ['delete synthetic accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['dispose restricted database roles',()=>runtime.dispose()],
  ]));
  const day='2026-11-10T03:00:00.000Z',now=new Date(day),expiry='2026-12-10T03:00:00.000Z';
  const oldEnd='2025-01-10T03:00:00.000Z';
  for(const label of ['held','peer']){
    const id='retention-http-'+label+'-'+randomUUID(),device='retention-'+label+'-'+randomUUID();
    ids.push(id);
    await admin.query(
      `INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified)
        VALUES($1,'merchant',$2,'synthetic','active',true)`,
      [id,'+198'+randomInt(100000000,999999999)],
    );
    await admin.query(
      `INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status,
                             last_subscription_ended_at,retention_status)
        VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved',$2,'protected')`,
      [id,label==='held'?oldEnd:null],
    );
    const noticeId='retention-notice-'+randomUUID();
    notices.push(noticeId);
    await admin.query(
      `INSERT INTO notifications
         (id,audience,merchant_id,account_id,type,title_key,body_key,variables,
          source_entity_type,source_entity_id,created_at)
       VALUES($1,'merchant',$2,$2,'operational_customer_message',
              'notifications.operational_customer_message.title',
              'notifications.operational_customer_message.body',
              '{}'::jsonb,'conversation',$3,now())`,
      [noticeId,id,'synthetic-event-'+id],
    );
    actors.push({id,label,device,noticeId});
  }
  const [held,peer]=actors;
  await admin.query(
    `INSERT INTO subscriptions
       (id,merchant_id,plan_name,status,billing_anchor_day,starts_at,expires_at,
        base_reply_limit,base_replies_used,base_replies_remaining,addon_replies_remaining)
     VALUES($1,$2,'silver','pending_activation',1,$3,$4,10,0,10,0)`,
    ['sub-'+held.id,held.id,'2025-01-01T00:00:00Z',expiry],
  );
  const {authPostgresSessionAuthority:auth}=await import('../src/services/authPostgresSessionAuthority.ts');
  const {MERCHANT_SESSION_COOKIE}=await import('../src/middleware/authSession.ts');
  for(const actor of actors){
    actor.issued=await auth.issueSession({
      accountId:actor.id,accountKind:'merchant',tenantId:actor.id,deviceId:actor.device,
    });
    actor.cookie=MERCHANT_SESSION_COOKIE+'='+actor.issued.token;
  }
  const {default:app}=await import('../src/app.ts');
  ({stopPostgresSupportRuntimeCutoverForTests:stopSupport}=await import('../src/services/postgresSupportRuntimeCutover.ts'));
  await stopSupport();
  server=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  const origin='http://127.0.0.1:'+server.address().port;
  const req=async(path,actor,method='GET')=>{
    const response=await fetch(origin+path,{method,headers:{
      Cookie:actor.cookie,'X-Fawri-Device-Id':actor.device,
    }});
    return {status:response.status,body:await response.json()};
  };
  const snapshot=async()=>(await admin.query(
    `SELECT id,merchant_id,read_at,source_entity_id
       FROM notifications WHERE merchant_id=ANY($1::text[]) ORDER BY id`,[ids]
  )).rows;
  const before=await snapshot();
  assert.equal((await req('/api/auth/notifications',peer)).status,200,
    'unrelated approved merchant remains authenticated');
  assert.equal((await req('/api/auth/notifications/'+held.noticeId+'/read',held,'PATCH')).status,200,
    'pre-suspension merchant may use its legitimate session');
  await admin.query('UPDATE notifications SET read_at=NULL WHERE id=$1',[held.noticeId]);
  assert.deepEqual(await snapshot(),before,'fixture reset restores original read state');

  // Simulate retention enforcement in the actual isolated database, then
  // test requests with the previously valid, real session cookie.
  await admin.query(
    `UPDATE merchants SET status='suspended',account_status='suspended',
       retention_suspended_at=$2,retention_status='eligible_for_deletion',
       warning_stage=4,products_read_only=true WHERE id=$1`,
    [held.id,'2026-10-01T00:00:00Z'],
  );
  await admin.query("UPDATE accounts SET state='suspended' WHERE id=$1",[held.id]);
  const {refreshMerchantRetentionPostgres}=await import('../src/services/postgresMerchantRetentionAuthority.ts');
  const heldDecision=await refreshMerchantRetentionPostgres(held.id,now);
  assert.equal(heldDecision.accountSuspended,true);
  assert.equal((await admin.query('SELECT state FROM accounts WHERE id=$1',[held.id])).rows[0].state,'suspended');
  const suspendedNoticeBefore=await snapshot();
  const denied=await req('/api/auth/notifications/'+held.noticeId+'/read',held,'PATCH');
  assert.ok([401,403].includes(denied.status),'old merchant cookie cannot write when retention suspended');
  assert.deepEqual(await snapshot(),suspendedNoticeBefore,'HTTP denial must not alter any merchant notice');
  assert.equal((await req('/api/auth/notifications',peer)).status,200,'unaffected peer stays active');
  assert.equal((await req('/api/auth/notifications/'+held.noticeId+'/read',peer,'PATCH')).status,404);
  assert.deepEqual(await snapshot(),suspendedNoticeBefore,'peer cannot edit held merchant notice');

  // Only test bootstrap simulates a completed approved renewal; not a provider
  // webhook, settlement or public merchant-controlled state change.
  await admin.query("UPDATE subscriptions SET status='active' WHERE merchant_id=$1",[held.id]);
  const restored=await refreshMerchantRetentionPostgres(held.id,now);
  assert.deepEqual(restored,{productsReadOnly:false,accountSuspended:false,retentionStatus:'protected'});
  assert.equal((await admin.query('SELECT state FROM accounts WHERE id=$1',[held.id])).rows[0].state,'active');
  const fresh=await auth.issueSession({accountId:held.id,accountKind:'merchant',tenantId:held.id,deviceId:held.device});
  held.cookie=MERCHANT_SESSION_COOKIE+'='+fresh.token;
  const accepted=await req('/api/auth/notifications/'+held.noticeId+'/read',held,'PATCH');
  assert.equal(accepted.status,200,'fresh approved account session may access own notification');
  assert.ok((await admin.query('SELECT read_at FROM notifications WHERE id=$1',[held.noticeId])).rows[0].read_at);
  assert.equal((await admin.query('SELECT read_at FROM notifications WHERE id=$1',[peer.noticeId])).rows[0].read_at,null,
    'peer merchant notice unaffected by recovered merchant HTTP write');
  console.log('P0_RETENTION_REAL_FULL_APP_HTTP '+JSON.stringify({
    actualApp:true,actualPostgres:true,realAuthenticatedCookies:true,
    restrictedIssuerLogin:true,heldPendingSubscriptionDenied:true,
    oldCookieCannotMutate:true,peer403or404Denied:true,
    approvedRenewalFreshCookieAccepted:true,
    noCrossMerchantWrite:true,syntheticSettlement:true,hostedAccepted:false,
  }));
});
