import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

// Actual server function bodies with inert SQL adapters; this is not actual SQL.
class AuthorityError extends Error {
  constructor(code,message,status,details){super(message);Object.assign(this,{code,status,details});}
}
function module(path,name,rowsForQuery){
  const raw=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const code=stripTypeScriptTypes(raw,{mode:'transform'}).replace(/^import[\s\S]*?;\s*$/gm,'').replace(/^export\s+/gm,'');
  return vm.runInNewContext(`(()=>{${code}\nreturn ${name};})()`,{
    CashierStaffAuthorityError:AuthorityError, operationalPostgresAuthorityRequired:()=>true,
    withMerchantOperationalTransaction:async(_,fn)=>fn({}), operationalQueryRows:async(_,query,values)=>rowsForQuery(query,values),
  },{timeout:2000});
}
const reportPath='artifacts/api-server/src/services/postgresCashierCentralReportAuthority.ts';
const activityPath='artifacts/api-server/src/services/postgresCashierCentralActivityAuthority.ts';
test('central financial report refuses a 50001-sale range instead of returning a silently truncated total',async()=>{
  const fn=module(reportPath,'buildCashierCentralReportAuthoritative',(_,values)=>{assert.equal(values[3],50001);return Array(50001).fill({});});
  await assert.rejects(fn({merchantId:'synthetic'}),e=>e.code==='CASHIER_REPORT_RANGE_TOO_LARGE'&&e.status===413&&e.details.max_sales===50000);
});
test('empty financial report retains explicit zero sale count',async()=>{
  const fn=module(reportPath,'buildCashierCentralReportAuthoritative',()=>[]);
  const result=await fn({merchantId:'synthetic'});assert.equal(result.sales_scanned,0);assert.equal(result.report.sale_count,0);
});
test('activity preserves full matching count beyond its 500-operation detail cap',async()=>{
  const fn=module(activityPath,'buildCashierCentralActivityAuthoritative',query=>query.includes('COUNT(*) OVER()')?Array.from({length:500},(_,i)=>({
    operation_id:'operation-'+i,sale_id:'sale-'+i,operation_kind:'sale',staff_id:'staff',station_id:'station',
    shift_id:'shift',occurred_at:'2026-10-12T00:00:00Z',matching_count:750,amount_minor:1000,currency_code:'IQD',currency_fraction_digits:0,
  })):[]);
  const result=await fn({merchantId:'synthetic'});assert.equal(result.operations.length,500);assert.equal(result.operation_matching_count,750);assert.equal(result.operation_detail_limit,500);
});
test('UI limited-detail warning uses matching count rather than aggregate financial count',()=>{
  const raw=readFileSync(new URL('../artifacts/fawri/src/pages/dashboard/CashierCentralReportsPage.tsx',import.meta.url),'utf8');
  const line=raw.split('\n').find(line=>line.includes('const detailsAreLimited ='));
  assert.ok(line);
  const run=vm.runInNewContext(`result=>{${line}\nreturn detailsAreLimited;}`,{},{timeout:2000});
  assert.equal(run({activity:{operations:Array(500),operation_matching_count:750,operation_detail_limit:500}}),true);
  assert.equal(run({activity:{operations:Array(30),operation_matching_count:30,operation_detail_limit:500}}),false);
});
