import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {cashierAuthorityCandidateHistory,validateCashierAuthorityCandidateHistory as validate} from '../../lib/db/scripts/lib/cashier-authority-candidate-history.mjs';
import {stabilizeMigrationDependencyOrder} from '../../lib/db/scripts/lib/migration-sql-order.mjs';
const generated='docs/final-audit/evidence/seq-d3-authority-candidate/generated';
test('all54 pinned hashes/timestamps match actual migrator dependency-stabilized source',()=>{
  const journal=JSON.parse(fs.readFileSync(generated+'/meta/_journal.json'));
  const actual=journal.entries.map(e=>({hash:createHash('sha256').update(stabilizeMigrationDependencyOrder(fs.readFileSync((e.idx===53?generated:'lib/db/drizzle')+'/'+e.tag+'.sql','utf8'))).digest('hex'),created_at:String(e.when)}));
  assert.deepEqual(cashierAuthorityCandidateHistory,actual);assert.deepEqual(validate(actual),[]);
});
for(const fault of ['missing','hash','timestamp','extra','duplicate','null-time','numeric-time','reordered'])test('history refuses '+fault,()=>{
  const rows=cashierAuthorityCandidateHistory.map(x=>({...x}));
  if(fault==='missing')rows.pop();
  if(fault==='hash')rows[0].hash='0'.repeat(64);
  if(fault==='timestamp')rows[53].created_at=String(BigInt(rows[53].created_at)+1n);
  if(fault==='extra')rows.push({...rows[53]});
  if(fault==='duplicate')rows[1]={...rows[0]};
  if(fault==='null-time')rows[0].created_at=null;
  if(fault==='numeric-time')rows[0].created_at=Number(rows[0].created_at);
  if(fault==='reordered')rows.reverse();
  assert.ok(validate(rows).length>0);
});
