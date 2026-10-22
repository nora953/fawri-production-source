import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import test from 'node:test';
import {cleanupResources} from './helpers/cleanup-resources.mjs';
import {createDisposableKnowledgeRuntime} from './helpers/disposable-knowledge-runtime.mjs';
const fixture=await createDisposableKnowledgeRuntime();
const {withOperationalTransaction,withMerchantOperationalTransaction}=await import('../src/services/operationalPostgresAuthority.ts');
const {getCurrentSubscriptionPostgres}=await import('../src/services/postgresSubscriptionEntitlement.ts');
Object.assign(process.env,{FAWRI_OPERATIONAL_POSTGRES_AUTHORITY:'required',FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY:'required'});

test('central merchant wrappers commit private authority before protected work on actual tenant LOGIN',async t=>{
  const merchants=['central-a-'+randomUUID(),'central-b-'+randomUUID()];
  const issuer='fawri_security.issue_scope(name,integer,bigint,text)';
  t.after(()=>cleanupResources([
    ['owned accounts',()=>fixture.admin.query('DELETE FROM accounts WHERE id=ANY($1::text[])',[merchants])],
    ['runtime',()=>fixture.dispose()],
  ]));
  for(const id of merchants){
    await fixture.admin.query("INSERT INTO accounts(id,kind,phone,password_hash,state,phone_verified) VALUES($1,'merchant',$2,'synthetic','active',true)",[id,'+197'+randomInt(100000000,999999999)]);
    await fixture.admin.query("INSERT INTO merchants(id,account_id,owner_name,store_name,activity_type,status,account_status) VALUES($1,$1,'Synthetic','Synthetic','retail','approved','approved')",[id]);
    await fixture.admin.query("INSERT INTO subscriptions(id,merchant_id,plan_name,status,billing_anchor_day,starts_at,expires_at) VALUES($1,$2,'trial','active',1,now()-interval '1 day',now()+interval '5 days')",['sub-'+id,id]);
  }
  const privateScope=async(client,own,foreign)=>{
    const row=(await client.query('SELECT session_user::text AS login,current_user::text AS active,pg_backend_pid() AS pid,txid_current()::text AS xid,fawri_security.allows_merchant($1) AS own,fawri_security.allows_merchant($2) AS foreign',[own,foreign])).rows[0];
    assert.equal(row.login,fixture.role);assert.equal(row.active,fixture.role);assert.equal(row.own,true);assert.equal(row.foreign,false);
    const visible=(await client.query('SELECT merchant_id FROM subscriptions WHERE merchant_id=ANY($1::text[]) ORDER BY merchant_id',[[own,foreign]])).rows;
    assert.deepEqual(visible,[{merchant_id:own}],'canonical public RLS permits only issued merchant');
    const committed=(await fixture.admin.query('SELECT merchant_id,pg_xact_status(transaction_id::text::xid8) AS state FROM fawri_security.transaction_scopes WHERE runtime_login=$1 AND backend_pid=$2 AND transaction_id=$3',[fixture.role,row.pid,row.xid])).rows;
    assert.deepEqual(committed,[{merchant_id:own,state:'in progress'}]);
  };
  await t.test('generic transactions never mint even with forged tenant setting',async()=>{
    await withOperationalTransaction(async client=>{
      await client.query("SELECT set_config('fawri.tenant_id',$1,true)",[merchants[0]]);
      assert.equal((await client.query('SELECT fawri_security.allows_merchant($1) AS allowed',[merchants[0]])).rows[0].allowed,false);
      assert.deepEqual((await client.query('SELECT merchant_id FROM subscriptions')).rows,[],'forged tenant GUC grants no public-table access');
    });
  });
  await t.test('operational scope is committed before the first merchant lock and cannot be changed by GUC',async()=>{
    await withMerchantOperationalTransaction(merchants[0],async client=>{
      await privateScope(client,merchants[0],merchants[1]);
      await client.query('SELECT id FROM merchants WHERE id=$1 FOR UPDATE',[merchants[0]]);
      await client.query("SELECT set_config('fawri.tenant_id',$1,true)",[merchants[1]]);
      await privateScope(client,merchants[0],merchants[1]);
    });
    assert.equal((await fixture.runtimePool.query('SELECT fawri_security.allows_merchant($1) AS allowed',[merchants[0]])).rows[0].allowed,false);
  });
  await t.test('rollback and next tenant receive independent full transaction identities',async()=>{
    const error=Error('owned-work-rollback');
    await assert.rejects(()=>withMerchantOperationalTransaction(merchants[0],async client=>{await privateScope(client,merchants[0],merchants[1]);throw error;}),value=>value===error);
    await withMerchantOperationalTransaction(merchants[1],client=>privateScope(client,merchants[1],merchants[0]));
  });
  await t.test('revoked issuer prevents operational callback and subscription reads until restored',async()=>{
    await fixture.admin.query(`REVOKE EXECUTE ON FUNCTION ${issuer} FROM ${fixture.authRole}`);
    let invoked=false;
    try{
      await assert.rejects(()=>withMerchantOperationalTransaction(merchants[0],async()=>{invoked=true;}));
      await assert.rejects(()=>getCurrentSubscriptionPostgres(merchants[0]));
      assert.equal(invoked,false);
    }finally{await fixture.admin.query(`GRANT EXECUTE ON FUNCTION ${issuer} TO ${fixture.authRole}`);}
    await withMerchantOperationalTransaction(merchants[0],client=>privateScope(client,merchants[0],merchants[1]));
  });
  await t.test('subscription wrapper mints on its actual lease before subscription work',async()=>{
    const before=(await fixture.admin.query('SELECT count(*)::int AS n FROM fawri_security.transaction_scopes WHERE runtime_login=$1 AND merchant_id=$2',[fixture.role,merchants[1]])).rows[0].n;
    assert.equal((await getCurrentSubscriptionPostgres(merchants[1])).merchant_id,merchants[1]);
    const rows=(await fixture.admin.query('SELECT pg_xact_status(transaction_id::text::xid8) AS state FROM fawri_security.transaction_scopes WHERE runtime_login=$1 AND merchant_id=$2',[fixture.role,merchants[1]])).rows;
    assert.equal(rows.length,before+1);assert.ok(rows.every(row=>row.state==='committed'));
    const reset=(await fixture.runtimePool.query("SELECT nullif(current_setting('fawri.tenant_id',true),'') AS tenant,fawri_security.allows_merchant($1) AS allowed",[merchants[1]])).rows[0];
    assert.deepEqual(reset,{tenant:null,allowed:false});
  });
  console.log('P0_CENTRAL_MERCHANT_SCOPE_PROOF '+JSON.stringify({actualLogin:true,issuerCommittedBeforeLocks:true,genericCannotMint:true,gucCannotRebindPrivateScope:true,revocationFailClosed:true,rollbackAndSessionReset:true,subscriptionCaller:true,publicPredicateChanged:true,releaseAccepted:false}));
});
