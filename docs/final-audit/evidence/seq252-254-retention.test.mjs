import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
const root=new URL('../../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const strip=s=>stripTypeScriptTypes(s,{mode:'transform'}).replace(/^import[^;]+;\s*$/gm,'').replace(/^export\s+/gm,'');
const lifecycle=read('artifacts/api-server/src/services/merchantLifecycle.ts');
const pure=vm.runInNewContext(`(()=>{${strip(lifecycle.slice(0,lifecycle.indexOf('export function canDeleteMerchant(')))};return {calculateRetentionStatus,MerchantRetentionStatus};})()`,{Date});
const authority=strip(read('artifacts/api-server/src/services/postgresMerchantRetentionAuthority.ts'));
const now=new Date('2026-10-13T00:00:00Z');
function fixture(options={}){
  const calls=[],merchant={id:'synthetic',account_state:'active',merchant_status:'approved',account_status:'approved',last_subscription_ended_at:new Date('2026-01-01T00:00:00Z'),retention_status:'protected',warning_stage:0,products_read_only:false,retention_suspended_at:null,...options.merchant};
  const subscription={id:'synthetic-sub',status:'expired',expires_at:new Date('2026-01-01T00:00:00Z'),base_replies_remaining:0,addon_replies_remaining:0,auto_reply_enabled:false,...options.subscription};
  const client={query:async(sql,values)=>{calls.push({sql,values});return {rows:[]};}};
  const fn=vm.runInNewContext(`(()=>{${authority};return refreshMerchantRetentionPostgres;})()`,{
    ...pure,Date,operationalPostgresAuthorityRequired:()=>options.required!==false,
    withMerchantOperationalTransaction:async(id,work)=>{assert.equal(id,'synthetic');return work(client);},
    operationalQueryRows:async(target,sql,values)=>{calls.push({sql,values});assert.equal(values[0],'synthetic');return sql.includes('FROM merchants')?[merchant]:[subscription];},
  });return {fn,calls};
}
test('SEQ252 disabled PostgreSQL authority rejects before transaction',async()=>{
  const f=fixture({required:false});await assert.rejects(()=>f.fn('synthetic',now),/POSTGRES_OPERATIONAL_AUTHORITY_REQUIRED/);assert.equal(f.calls.length,0);
});
test('SEQ252 blank merchant avoids all SQL adapters',async()=>{
  const f=fixture();assert.equal(await f.fn(' ',now),null);assert.equal(f.calls.length,0);
});
test('SEQ252 closed account cannot be revived by future subscription',async()=>{
  const f=fixture({merchant:{account_state:'closed'},subscription:{expires_at:new Date('2027-01-01')}});assert.equal(await f.fn('synthetic',now),null);assert.equal(f.calls.length,1);
});
for(const repeat of [false,true])test(`SEQ253 overdue retention ${repeat?'repeat':'first'} suspension`,async()=>{
  const f=fixture({merchant:repeat?{account_state:'suspended',retention_suspended_at:new Date('2026-08-01')}: {}});
  const r=await f.fn('synthetic',now);assert.equal(r.productsReadOnly,true);assert.equal(r.accountSuspended,true);assert.equal(r.retentionStatus,'eligible_for_deletion');
  const update=f.calls.find(c=>c.sql.includes('UPDATE accounts'));assert.equal(update.values[0],'synthetic');assert.equal(update.values[1],!repeat);
  assert.equal(f.calls.filter(c=>c.sql.includes('UPDATE account_sessions')).length,repeat?0:1);
});
test('SEQ254 paid future expiry restores retention-suspended account but exhausted replies stay disabled',async()=>{
  const f=fixture({merchant:{account_state:'suspended',retention_suspended_at:new Date('2026-08-01')},subscription:{status:'suspended',expires_at:new Date('2026-11-01')}});
  const r=await f.fn('synthetic',now);assert.equal(r.accountSuspended,false);assert.equal(r.productsReadOnly,false);assert.equal(r.retentionStatus,'protected');
  const sub=f.calls.find(c=>c.sql.includes('UPDATE subscriptions'));assert.equal(sub.values[1],'replies_exhausted');assert.match(sub.sql,/auto_reply_enabled = \(\$2::subscription_status = 'active'\)/);
  assert.equal(f.calls.filter(c=>c.sql.includes('UPDATE account_sessions')).length,0);
});
test('SEQ254 suspension without retention marker is not automatically set active',async()=>{
  const f=fixture({merchant:{account_state:'suspended',last_subscription_ended_at:new Date('2026-11-01')},subscription:{expires_at:new Date('2026-11-01')}});await f.fn('synthetic',now);
  assert.equal(f.calls.filter(c=>c.sql.includes('UPDATE accounts')).length,0);assert.equal(f.calls.filter(c=>c.sql.includes("SET status = 'approved'")).length,0);
});
