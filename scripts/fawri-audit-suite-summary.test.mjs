import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the actual runner's summary and fail-closed classification, including
// the missing terminal TAP counters seen in the Support fixture failure.
const source=fs.readFileSync(new URL('./execute-disposable-postgres-audit.mjs',import.meta.url),'utf8');
const start=source.indexOf('  const summary ='),end=source.indexOf("  console.log('AUDIT_SUITE_RESULT",start);
assert.ok(start>0&&end>start);
function classify(stdout,status){
 return vm.runInNewContext(`(()=>{let failed=false;${source.slice(start,end)};return {summary,failed};})()`,{
  result:{stdout,status},file:'synthetic-audit.integration.test.ts',process:{version:process.version,argv:['node','audit','tenant']},
 },{timeout:2000});
}
test('a complete non-skipped passing TAP result is accepted',()=>{
 const r=classify('# pass 5\n# fail 0\n# skipped 0\n',0);
 assert.equal(r.summary.passed,5);assert.equal(r.summary.summaryComplete,true);assert.equal(r.failed,false);
});
test('complete failed TAP counters retain parent markers and reject the suite',()=>{
 const r=classify('not ok 1 - parent\n    not ok 1 - child\n# pass 1\n# fail 2\n# skipped 0\n',1);
 assert.equal(r.summary.failed,2);assert.equal(r.summary.summaryComplete,true);assert.equal(r.failed,true);
});
test('an unfinished setup failure counts its observed marker and stays incomplete',()=>{
 const r=classify('TAP version 13\nnot ok 1 - fixture setup\n  error: synthetic constraint failure\n',7);
 assert.equal(r.summary.failed,1);assert.equal(r.summary.summaryComplete,false);assert.equal(r.failed,true);
});
test('missing terminal counters cannot produce green even with exit zero',()=>{
 const r=classify('TAP version 13\nok 1 - partial output\n',0);
 assert.equal(r.summary.summaryComplete,false);assert.equal(r.failed,true);
});
