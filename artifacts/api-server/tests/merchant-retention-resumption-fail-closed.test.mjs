import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source=readFileSync(new URL('../src/services/postgresMerchantRetentionAuthority.ts',import.meta.url),'utf8');
function actualRetentionFunctions(dependencies) {
  const helpersStart=source.indexOf('function permitsRetentionResumption(');
  const helpersEnd=source.indexOf('async function revokeMerchantSessions(',helpersStart);
  const refreshStart=source.indexOf('export async function refreshMerchantRetentionPostgres(');
  const refreshEnd=source.indexOf('export async function refreshAllMerchantRetentionPostgres(',refreshStart);
  assert.ok(helpersStart>0 && helpersEnd>helpersStart &&
    refreshStart>helpersEnd && refreshEnd>refreshStart);
  const block=source.slice(helpersStart,helpersEnd)+'\n'+
    source.slice(refreshStart,refreshEnd).replace('export async function','async function');
  const js=ts.transpileModule(block,{compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,
  }}).outputText;
  const keys=Object.keys(dependencies);
  return new Function(...keys,js+'\nreturn {permitsRetentionResumption,effectiveSubscriptionEnd,refreshMerchantRetentionPostgres};')(
    ...keys.map(key=>dependencies[key]));
}
const now=new Date('2026-11-10T03:00:00Z');
const oldEnd=new Date('2025-01-10T03:00:00Z');
const future=new Date('2026-12-10T03:00:00Z');
function merchant(){
  return {id:'merchant-test',account_state:'suspended',merchant_status:'suspended',
    account_status:'suspended',last_subscription_ended_at:oldEnd,
    retention_status:'eligible_for_deletion',warning_stage:4,products_read_only:true,
    retention_suspended_at:new Date('2026-10-01T03:00:00Z')};
}
function subscription(status,expires_at=future) {
  return {id:'sub-test',status,expires_at,base_replies_remaining:10,
    addon_replies_remaining:0,auto_reply_enabled:false};
}
function arrange(sub) {
  const sql=[],retentionEnds=[];
  const client={query:async(statement,params=[])=>{
    sql.push({sql:statement,params});
    return {rows:[],rowCount:1};
  }};
  const value=actualRetentionFunctions({
    operationalPostgresAuthorityRequired:()=>true,
    withMerchantAuthenticationTransaction:async(_merchantId,callback)=>callback(client),
    selectMerchantForUpdate:async()=>merchant(),
    selectSubscriptionForUpdate:async()=>sub,
    calculateRetentionStatus:end=>{
      retentionEnds.push(end);
      const isCurrent=end && Date.parse(end)>now.getTime();
      return {retentionStatus:isCurrent?'protected':'eligible_for_deletion',
        warningStage:isCurrent?0:4,productsReadOnly:!isCurrent,
        accountShouldBeSuspended:!isCurrent,gracePeriodEndsAt:null,
        eligibleForDeletionAt:null};
    },
    MerchantRetentionStatus:{Protected:'protected'},
    revokeMerchantSessions:async(_client,_merchantId,reason)=>{
      sql.push({sql:'REVOKE_MERCHANT_SESSIONS',params:[reason]});
    },
  });
  return {...value,sql,retentionEnds};
}
const match=(sql,expression)=>sql.filter(row=>expression.test(row.sql));
test('future pending/suspended/expired subscriptions never restore retention-suspended account',async()=>{
  for(const status of ['pending_activation','suspended','expired']){
    const ctx=arrange(subscription(status));
    assert.equal(ctx.permitsRetentionResumption(subscription(status),now),false,status);
    assert.equal(ctx.effectiveSubscriptionEnd(merchant(),subscription(status),now),oldEnd.toISOString());
    const result=await ctx.refreshMerchantRetentionPostgres('merchant-test',now);
    assert.equal(result.accountSuspended,true,status);
    assert.equal(result.productsReadOnly,true,status);
    assert.deepEqual(ctx.retentionEnds,[oldEnd.toISOString()]);
    assert.equal(match(ctx.sql,/SET status = 'approved'/).length,0,status);
    assert.equal(match(ctx.sql,/SET state = 'active'/).length,0,status);
    assert.equal(match(ctx.sql,/SET status = \$2::subscription_status/).length,0,status);
    assert.equal(match(ctx.sql,/SET status = 'suspended'/).length,1,status);
    assert.equal(match(ctx.sql,/SET state = 'suspended'/).length,1,status);
  }
});
test('future active subscription reactivates after proper renewal without session forgery',async()=>{
  const ctx=arrange(subscription('active'));
  assert.equal(ctx.permitsRetentionResumption(subscription('active'),now),true);
  assert.equal(ctx.effectiveSubscriptionEnd(merchant(),subscription('active'),now),future.toISOString());
  const result=await ctx.refreshMerchantRetentionPostgres('merchant-test',now);
  assert.deepEqual(result,{productsReadOnly:false,accountSuspended:false,retentionStatus:'protected'});
  assert.equal(match(ctx.sql,/SET status = 'approved'/).length,1);
  assert.equal(match(ctx.sql,/SET state = 'active'/).length,1);
  assert.equal(match(ctx.sql,/SET status = \$2::subscription_status/).length,1);
  assert.equal(match(ctx.sql,/REVOKE_MERCHANT_SESSIONS/).length,0);
  const subUpdate=ctx.sql.find(row=>/SET status = \$2::subscription_status/.test(row.sql));
  assert.deepEqual(subUpdate.params,['merchant-test','active']);
});
test('future replies-exhausted subscription restores account without re-enabling zero-balance autoresponses',async()=>{
  const exhausted={...subscription('replies_exhausted'),base_replies_remaining:0};
  const ctx=arrange(exhausted);
  const result=await ctx.refreshMerchantRetentionPostgres('merchant-test',now);
  assert.equal(result.accountSuspended,false);
  const update=ctx.sql.find(row=>/SET status = \$2::subscription_status/.test(row.sql));
  assert.deepEqual(update.params,['merchant-test','replies_exhausted']);
  // The actual PostgreSQL UPDATE disables auto reply for this final status.
  assert.match(update.sql,/auto_reply_enabled = \(\$2::subscription_status = 'active'\)/);
});
test('expired active subscription and unsafe future-only pending date cannot grant retention renewal',async()=>{
  const expired=arrange(subscription('active',oldEnd));
  assert.equal(expired.permitsRetentionResumption(subscription('active',oldEnd),now),false);
  const answer=await expired.refreshMerchantRetentionPostgres('merchant-test',now);
  assert.equal(answer.accountSuspended,true);
  assert.equal(match(expired.sql,/SET state = 'active'/).length,0);
  const futureOnly={...merchant(),last_subscription_ended_at:null};
  const ctx=arrange(subscription('pending_activation'));
  assert.equal(ctx.effectiveSubscriptionEnd(futureOnly,subscription('pending_activation'),now),undefined);
});
test('numeric timestamp/caller corruption is never a valid active subscription',()=>{
  const ctx=arrange(subscription('active'));
  assert.equal(ctx.permitsRetentionResumption(subscription('active',new Date('invalid')),now),false);
  assert.equal(ctx.permitsRetentionResumption(null,now),false);
  assert.equal(ctx.permitsRetentionResumption(subscription('pending_activation'),now),false);
});
