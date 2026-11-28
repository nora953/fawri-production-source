import assert from 'node:assert/strict';
import {createHash,randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

// Execute against the production service, real restricted PostgreSQL tenant
// transactions, and a network-isolated disposable schema ONLY.
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
process.env.FAWRI_DISABLE_JOB_WORKERS='1';

test('operational payment-conflict dedup never acknowledges a foreign or altered event', {timeout:90_000}, async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const merchants=[],accounts=[];
  t.after(()=>cleanupResources([
    ['synthetic notices',()=>admin.query('DELETE FROM notifications WHERE merchant_id=ANY($1::text[]) OR account_id=ANY($1::text[])',[accounts])],
    ['synthetic merchants',()=>admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])',[merchants])],
    ['synthetic accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[accounts])],
    ['restricted runtime',()=>runtime.dispose()],
  ]));
  const merchantId='payment-conflict-a-'+randomUUID(),foreignId='payment-conflict-b-'+randomUUID();
  for(const id of [merchantId,foreignId]){
    accounts.push(id);merchants.push(id);
    await admin.query(
      "INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",
      [id,'+198'+randomInt(100000000,999999999)],
    );
    await admin.query(
      "INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",
      [id],
    );
  }
  const {notifyMerchantPaymentConflictPostgres}=await import('../src/services/postgresOperationalNotificationAuthority.ts');
  const input={merchantId,orderId:'order-a',sourceEventId:'provider-event-'+randomUUID(),
    conversationId:'conversation-a',provider:'synthetic-provider',createdAt:'2026-10-25T00:00:00Z'};
  const notificationId='notification-'+createHash('sha256')
    .update('operational_payment_conflict:'+merchantId+':'+input.sourceEventId)
    .digest('hex');
  const foreignOriginal={
    order_id:'foreign-order',provider:'synthetic-provider',action_url:'/dashboard/orders?order=foreign-order',
  };
  const stored=async()=>(await admin.query(
    'SELECT to_jsonb(n) AS notice FROM notifications n WHERE merchant_id=ANY($1::text[]) ORDER BY id',
    [merchants],
  )).rows;
  await admin.query(
    `INSERT INTO notifications
      (id,audience,merchant_id,account_id,type,title_key,body_key,variables,
       source_entity_type,source_entity_id,created_at)
     VALUES($1,'merchant',$2,$2,'operational_payment_conflict',
       'notifications.payment_conflict.title','notifications.payment_conflict.body',
       $3::jsonb,'order_payment_conflict',$4,'2026-10-25T00:00:00Z')`,
    [notificationId,foreignId,JSON.stringify(foreignOriginal),'foreign-event'],
  );
  const original=await stored();
  await assert.rejects(
    notifyMerchantPaymentConflictPostgres(input),
    error=>error?.code==='OPERATIONAL_NOTIFICATION_SOURCE_CONFLICT',
    'foreign unique-ID conflict cannot be reported as a legitimate replay',
  );
  assert.deepEqual(await stored(),original,'foreign ID collision must not mutate either merchant notice');
  assert.equal((await admin.query(
    'SELECT COUNT(*)::int AS n FROM notifications WHERE merchant_id=$1',[merchantId],
  )).rows[0].n,0);
  await admin.query('DELETE FROM notifications WHERE id=$1 AND merchant_id=$2',[notificationId,foreignId]);

  const accepted=await notifyMerchantPaymentConflictPostgres(input);
  assert.deepEqual(accepted,{notification_id:notificationId,deduplicated:false});
  const validSnapshot=await stored();
  const retry=await notifyMerchantPaymentConflictPostgres({...input,createdAt:'2026-10-26T00:00:00Z'});
  assert.deepEqual(retry,{notification_id:notificationId,deduplicated:true});
  assert.deepEqual(await stored(),validSnapshot,'same event retry cannot rewrite original fields/time');

  await assert.rejects(
    notifyMerchantPaymentConflictPostgres({...input,orderId:'wrong-order'}),
    error=>error?.code==='OPERATIONAL_NOTIFICATION_SOURCE_CONFLICT',
    'same provider-event ID but different financial order cannot be silently deduplicated',
  );
  assert.deepEqual(await stored(),validSnapshot,'same-source changed financial payload must not mutate stored evidence');

  await admin.query(
    "UPDATE notifications SET source_entity_id='tampered-source' WHERE id=$1 AND merchant_id=$2",
    [notificationId,merchantId],
  );
  const altered=await stored();
  await assert.rejects(
    notifyMerchantPaymentConflictPostgres(input),
    error=>error?.code==='OPERATIONAL_NOTIFICATION_SOURCE_CONFLICT',
    'same tenant with altered event source must fail closed',
  );
  assert.deepEqual(await stored(),altered,'mismatched source must remain untouched, not silently rewritten');
  console.log('P0_OPERATIONAL_NOTIFICATION_DEDUPE_IDENTITY_REAL_SQL '+JSON.stringify({
    actualPostgres:true,restrictedMerchantTransaction:true,merchantCount:2,
    foreignGlobalIdDenied:true,foreignNoticeUnchanged:true,
    exactOriginalReplayAccepted:true,immutableCreatedAtAndPayload:true,
    differentOrderSameEventDenied:true,alteredSourceDenied:true,
    noCrossMerchantMutation:true,syntheticEvent:true,hostedAccepted:false,
  }));
});
