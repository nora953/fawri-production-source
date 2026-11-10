import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import test from 'node:test';
import {assertDisposablePostgres} from '../../../scripts/lib/disposable-postgres-test-guard.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
import {cleanupResources} from './helpers/cleanup-resources.mjs';

// This test runs only in the existing network-isolated Docker PostgreSQL audit
// and uses real restricted authentication SQL transactions, not a SQL recorder.
await assertDisposablePostgres();
process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY='required';
process.env.FAWRI_DISABLE_JOB_WORKERS='1';

test('retention suspension only restores from an activated unexpired subscription on real PostgreSQL', {timeout:100_000}, async t=>{
  const runtime=await createDisposableKnowledgeRuntime(),admin=runtime.admin;
  const ids=[],testNow=new Date('2026-11-10T03:00:00.000Z');
  const oldEnd=new Date('2025-01-10T03:00:00.000Z');
  const future=new Date('2026-12-10T03:00:00.000Z');
  t.after(()=>cleanupResources([
    ['subscriptions',()=>admin.query('DELETE FROM subscriptions WHERE merchant_id=ANY($1::text[])',[ids])],
    ['merchants',()=>admin.query('DELETE FROM merchants WHERE id=ANY($1::text[])',[ids])],
    ['accounts',()=>admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[ids])],
    ['restricted runtime',()=>runtime.dispose()],
  ]));
  const cases=[
    {label:'future-pending',status:'pending_activation',replies:10,restore:false},
    {label:'future-suspended',status:'suspended',replies:10,restore:false},
    {label:'future-expired',status:'expired',replies:10,restore:false},
    {label:'future-active',status:'active',replies:10,restore:true,final:'active'},
    {label:'future-exhausted',status:'replies_exhausted',replies:0,restore:true,final:'replies_exhausted'},
    {label:'past-active',status:'active',replies:10,restore:false,expired:true},
  ];
  for(const entry of cases){
    const id='retention-real-'+entry.label+'-'+randomUUID();ids.push(id);entry.id=id;
    await admin.query(
      "INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified,suspended_at) VALUES($1,'merchant',$2,'synthetic','suspended',true,$3)",
      [id,'+198'+randomInt(100000000,999999999),new Date('2026-09-01T00:00:00Z')],
    );
    await admin.query(
      `INSERT INTO merchants
          (id,account_id,owner_name,store_name,activity_type,status,account_status,
           last_subscription_ended_at,retention_status,warning_stage,
           products_read_only,retention_suspended_at)
       VALUES($1,$1,'Synthetic','Synthetic','retail','suspended','suspended',$2,
              'eligible_for_deletion',4,true,$3)`,
      [id,oldEnd,new Date('2026-09-01T00:00:00Z')],
    );
    await admin.query(
      `INSERT INTO subscriptions
         (id,merchant_id,plan_name,status,billing_anchor_day,starts_at,expires_at,
          base_reply_limit,base_replies_used,base_replies_remaining,
          addon_replies_remaining,auto_reply_enabled)
       VALUES($1,$2,'silver',$3,1,$4,$5,$6,0,$6,0,false)`,
      ['sub-'+id,id,entry.status,oldEnd,entry.expired?oldEnd:future,entry.replies],
    );
  }
  const snapshot=async()=> (await admin.query(
    `SELECT m.id, m.status AS merchant_status, m.account_status, m.retention_suspended_at,
            m.products_read_only, m.retention_status, a.state AS account_state,
            a.session_version, s.status AS subscription_status, s.auto_reply_enabled,
            s.base_replies_remaining, s.expires_at
       FROM merchants m JOIN accounts a ON a.id=m.account_id
       JOIN subscriptions s ON s.merchant_id=m.id
      WHERE m.id=ANY($1::text[]) ORDER BY m.id`,
    [ids],
  )).rows;
  const {refreshMerchantRetentionPostgres}=await import('../src/services/postgresMerchantRetentionAuthority.ts');
  const {withMerchantAuthenticationTransaction}=await import('../src/services/authenticationPostgresAuthority.ts');
  const login=await withMerchantAuthenticationTransaction(ids[0],async(client)=>{
    const result=await client.query('SELECT session_user::text AS login, current_user::text AS active');
    return result.rows[0];
  });
  assert.deepEqual(login,{login:runtime.authRole,active:runtime.authRole},
    'production service uses a separately authenticated restricted issuer LOGIN, not bootstrap owner');

  let protectedCount=0,deniedCount=0;
  for(const entry of cases){
    const peersBefore=(await snapshot()).filter(row=>row.id!==entry.id);
    const result=await refreshMerchantRetentionPostgres(entry.id,testNow);
    const rows=(await snapshot()),own=rows.find(row=>row.id===entry.id);
    assert.ok(own);
    assert.deepEqual(rows.filter(row=>row.id!==entry.id),peersBefore,
      'one merchant retention refresh may not modify peer SQL rows');
    if(entry.restore){
      assert.deepEqual(result,{
        productsReadOnly:false,accountSuspended:false,retentionStatus:'protected',
      },entry.label);
      assert.equal(own.account_state,'active');
      assert.equal(own.merchant_status,'approved');
      assert.equal(own.account_status,'approved');
      assert.equal(own.retention_suspended_at,null);
      assert.equal(own.products_read_only,false);
      assert.equal(own.subscription_status,entry.final);
      assert.equal(own.auto_reply_enabled,entry.final==='active');
      protectedCount++;
    } else {
      assert.equal(result.accountSuspended,true,entry.label);
      assert.equal(own.account_state,'suspended');
      assert.equal(own.merchant_status,'suspended');
      assert.equal(own.account_status,'suspended');
      assert.notEqual(own.retention_suspended_at,null);
      assert.equal(own.products_read_only,true);
      assert.equal(own.auto_reply_enabled,false);
      assert.equal(own.subscription_status,'suspended',
        'pending/invalid subscription must not be silently auto-activated');
      deniedCount++;
    }
    const first=rows;
    await refreshMerchantRetentionPostgres(entry.id,testNow);
    const replay=(await snapshot());
    // Existing implementation updates non-business updated_at fields; only
    // stable ownership, entitlement and retention projections are compared.
    assert.deepEqual(replay,first,'retention refresh must be semantically idempotent');
  }
  assert.equal(protectedCount,2);
  assert.equal(deniedCount,4);
  assert.equal(await refreshMerchantRetentionPostgres('synthetic-missing-'+randomUUID(),testNow),null);
  console.log('P0_RETENTION_REAL_AUTH_LOGIN_POSTGRES '+JSON.stringify({
    actualPostgres:true,separateAuthenticationLogin:true,restrictedRole:login.login===runtime.authRole,
    merchants:6,unapprovedFutureDenied:3,expiredActiveDenied:true,
    properlyActivatedRestored:true,repliesExhaustedNoAutoReply:true,
    noCrossMerchantMutation:true,idempotentReplay:true,hostedAccepted:false,
  }));
});
