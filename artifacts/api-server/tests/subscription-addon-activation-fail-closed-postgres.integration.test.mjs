import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

// Real source/real restricted SQL ONLY inside the isolated disposable audit.
// Financial provider settlements are NOT simulated or declared accepted.
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
process.env.FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY='required';
process.env.FAWRI_DISABLE_JOB_WORKERS='1';

test('adding reply credits cannot activate pending/suspended/expired subscriptions based only on future expiry', {timeout:120_000}, async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const now=new Date('2026-11-10T06:00:00.000Z');
  const starts=new Date('2026-09-10T00:00:00.000Z');
  const future=new Date('2026-12-10T00:00:00.000Z');
  const past=new Date('2026-10-10T00:00:00.000Z');
  const actor='addon-test-admin-'+randomUUID(),merchantIds=[];
  t.after(()=>cleanupResources([
    ['reply ledger',()=>admin.query('DELETE FROM reply_ledger WHERE merchant_id=ANY($1::text[])',[merchantIds])],
    ['audit events',()=>admin.query('DELETE FROM audit_events WHERE merchant_id=ANY($1::text[])',[merchantIds])],
    ['addon batches',()=>admin.query('DELETE FROM subscription_reply_batches WHERE merchant_id=ANY($1::text[])',[merchantIds])],
    ['subscriptions',()=>admin.query('DELETE FROM subscriptions WHERE merchant_id=ANY($1::text[])',[merchantIds])],
    ['merchants',()=>admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])',[merchantIds])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[[...merchantIds,actor]])],
    ['runtime',()=>runtime.dispose()],
  ]));
  await admin.query(
    "INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'admin',$2,'synthetic','active',true)",
    [actor,'+198'+randomInt(100000000,999999999)],
  );
  const cases=[
    {key:'pending',status:'pending_activation',expiry:future,baseUsed:0,expected:'pending_activation',auto:false,allowed:false},
    {key:'suspended',status:'suspended',expiry:future,baseUsed:0,expected:'suspended',auto:false,allowed:false},
    {key:'expired-future',status:'expired',expiry:future,baseUsed:0,expected:'expired',auto:false,allowed:false},
    {key:'expired-past',status:'expired',expiry:past,baseUsed:0,expected:'expired',auto:false,allowed:false},
    {key:'exhausted',status:'replies_exhausted',expiry:future,baseUsed:10,expected:'active',auto:true,allowed:true},
    {key:'active',status:'active',expiry:future,baseUsed:0,expected:'active',auto:true,allowed:true},
  ];
  for(const entry of cases){
    const id='addon-activation-'+entry.key+'-'+randomUUID();
    merchantIds.push(id);
    entry.merchantId=id;
    await admin.query(
      "INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",
      [id,'+198'+randomInt(100000000,999999999)],
    );
    await admin.query(
      "INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",
      [id],
    );
    await admin.query(
      `INSERT INTO subscriptions(
        id,merchant_id,plan_name,status,billing_anchor_day,starts_at,expires_at,
        base_reply_limit,base_replies_used,base_replies_remaining,
        addon_replies_remaining,auto_reply_enabled)
        VALUES($1,$2,'silver',$3,10,$4,$5,10,$6,$7,0,$8)`,
      ['sub-'+id,id,entry.status,starts,entry.expiry,entry.baseUsed,
        10-entry.baseUsed,entry.status==='active'],
    );
  }
  const {applySubscriptionActionPostgres,reserveMerchantAutoReplyPostgres,
    getCurrentSubscriptionPostgres}=await import('../src/services/postgresSubscriptionEntitlement.ts');
  const catalog=async()=>(await admin.query(
    `SELECT merchant_id,status,auto_reply_enabled,expires_at,base_replies_used,
          base_replies_remaining,addon_replies_remaining
       FROM subscriptions WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id`,
    [merchantIds],
  )).rows;
  const catalogBefore=await catalog();
  let denied=0,legitimate=0;
  for(const entry of cases){
    const peersBefore=(await catalog()).filter(row=>row.merchant_id!==entry.merchantId);
    const result=await applySubscriptionActionPostgres({
      merchantId:entry.merchantId,actorAccountId:actor,
      action:'add_replies',amount:3,now,
    });
    assert.equal(result.status,entry.expected,entry.key+' final status');
    assert.equal(result.auto_reply_enabled,entry.auto,entry.key+' auto-reply setting');
    const row=(await catalog()).find(r=>r.merchant_id===entry.merchantId);
    assert.equal(row.status,entry.expected,entry.key+' real SQL status');
    assert.equal(row.auto_reply_enabled,entry.auto,entry.key+' real SQL auto_reply_enabled');
    assert.equal(row.addon_replies_remaining,3,'only the current merchant credit is added');
    assert.deepEqual((await catalog()).filter(r=>r.merchant_id!==entry.merchantId),
      peersBefore,entry.key+' must never change peer tenant SQL rows');
    const decision=await reserveMerchantAutoReplyPostgres(
      entry.merchantId,'addon-activation-'+randomUUID(),now,
    );
    assert.equal(decision.allowed,entry.allowed,entry.key+' reserve authority after addon');
    if(entry.allowed){
      assert.equal(decision.duplicate,false);
      legitimate++;
    }else{
      const ledger=(await admin.query(
        "SELECT COUNT(*)::int AS count FROM reply_ledger WHERE merchant_id=$1",
        [entry.merchantId],
      )).rows[0].count;
      assert.equal(ledger,0,'unapproved/expired subscriptions must never consume reply ledger credit');
      denied++;
    }
    const persisted=await getCurrentSubscriptionPostgres(entry.merchantId,now);
    assert.equal(persisted.status,entry.expected,'read projection must not autoactivate old status');
    if(!entry.allowed)assert.equal(persisted.auto_reply_enabled,false);
  }
  assert.equal(denied,4);
  assert.equal(legitimate,2);
  const originalStatuses=Object.fromEntries(cases.map(e=>[e.key,e.status]));
  const resultingStatuses=Object.fromEntries(cases.map(e=>[e.key,e.expected]));
  assert.equal(catalogBefore.length,6);
  console.log('P0_ADDON_SUBSCRIPTION_ACTIVATION_FAIL_CLOSED_REAL_PG '+JSON.stringify({
    actualPostgres:true,restrictedMerchantScopedSql:true,syntheticMerchants:6,
    originalStatuses,resultingStatuses,
    pendingAndSuspendedStayBlocked:true,expiredFutureCannotReactivate:true,
    expiredPastCannotReactivate:true,activeAndExhaustedStayFunctional:true,
    deniedAutoReplies:denied,acceptedAutoReplies:legitimate,
    peerRowsUnchanged:true,syntheticAddonOnly:true,
    realPaymentProviderVerified:false,hostedAccepted:false,
  }));
});
