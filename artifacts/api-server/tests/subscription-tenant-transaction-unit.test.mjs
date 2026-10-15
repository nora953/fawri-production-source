import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Exercise the actual private transaction functions, isolated from database
// imports. The query adapter proves JS control flow only, not PostgreSQL/RLS.
const source=readFileSync(new URL('../src/services/postgresSubscriptionEntitlement.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('authority.ts',source,ts.ScriptTarget.Latest,true);
const names=['withTransaction','withMerchantSubscriptionTransaction'];
const functions=names.map(name=>{
  const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.ok(node,`missing original function ${name}`);return node.getText(ast);
}).join('\n');
const compiled=ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function harness(failAt){
  const calls=[];let releases=0;
  const client={async query(sql,values){calls.push({sql,values});if(sql===failAt)throw Error('synthetic-query-failure');return {rows:[]};},release(){releases++;}};
  const context=vm.createContext({databasePool:async()=>({connect:async()=>client})});
  vm.runInContext(compiled+'\nglobalThis.run=withMerchantSubscriptionTransaction;',context);
  return {run:context.run,calls,get releases(){return releases;}};
}
test('tenant context is parameterized and set inside BEGIN before work and COMMIT',async()=>{
  const h=harness();const merchant="owned-merchant-'literal";
  assert.equal(await h.run(merchant,async c=>{await c.query('OWNED_WORK');return 42;}),42);
  assert.deepEqual(h.calls.map(c=>c.sql),['BEGIN',"SELECT set_config('fawri.tenant_id', $1, true)",'OWNED_WORK','COMMIT']);
  assert.equal(h.calls[1].values[0],merchant);assert.equal(h.releases,1);
});
test('work failure rolls back and releases without COMMIT',async()=>{
  const h=harness();await assert.rejects(h.run('owned-a',async()=>{throw Error('owned-work-failure');}),/owned-work-failure/);
  assert.deepEqual(h.calls.map(c=>c.sql),['BEGIN',"SELECT set_config('fawri.tenant_id', $1, true)",'ROLLBACK']);assert.equal(h.releases,1);
});
test('tenant-setting failure prevents work and rolls back',async()=>{
  const h=harness("SELECT set_config('fawri.tenant_id', $1, true)");let worked=false;
  await assert.rejects(h.run('owned-a',async()=>{worked=true;}),/synthetic-query-failure/);
  assert.equal(worked,false);assert.equal(h.calls.at(-1).sql,'ROLLBACK');assert.equal(h.releases,1);
});
test('COMMIT failure propagates uncertainty and releases after rollback attempt',async()=>{
  const h=harness('COMMIT');await assert.rejects(h.run('owned-a',async()=>true),/synthetic-query-failure/);
  assert.deepEqual(h.calls.slice(-2).map(c=>c.sql),['COMMIT','ROLLBACK']);assert.equal(h.releases,1);
});
test('same pooled adapter receives a fresh transaction-local tenant on every call',async()=>{
  const h=harness();for(const merchant of ['owned-a','owned-b'])await h.run(merchant,async()=>true);
  assert.deepEqual(h.calls.filter(c=>c.values).map(c=>c.values[0]),['owned-a','owned-b']);
  assert.equal(h.calls.filter(c=>c.sql==='BEGIN').length,2);assert.equal(h.releases,2);
});
