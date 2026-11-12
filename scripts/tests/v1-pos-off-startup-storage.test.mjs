import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertV1PosOffStorageReady} from '../../artifacts/api-server/src/services/v1PosOffStorageReadiness.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const roles=Object.freeze({
  primaryRole:'fawri_restricted_runtime',
  authenticationRole:'fawri_auth_issuer',
  operatorRole:'fawri_operator_issuer',
});
const proofs={
  database_ok:true, caller_ok:true, roles_restricted:true,
  no_app_role_memberships:true, retirement_writer_dormant:true,
  financial_tables_rls:true, no_cashier_app_grants:true,
  historic_guards_preserved:true, pos_off_delete_trigger:true,
  pos_off_guard_owner_and_acl:true,
};

test('commercial V1 startup requires every read-only POS-off custody proof',async()=>{
  let q=0;
  const client={query:async(sql,params)=>{
    q++;
    assert.match(sql,/SELECT[\s\S]+current_database\(\)='fawri'/);
    assert.match(sql,/fawri_v1_pos_off_merchant_deleted/);
    assert.match(sql,/cashier_operation_receipts/);
    assert.deepEqual(params,[
      ['fawri_restricted_runtime','fawri_auth_issuer','fawri_operator_issuer'],
      'fawri_restricted_runtime',
    ]);
    return {rows:[{...proofs}]};
  }};
  await assertV1PosOffStorageReady(client,roles);
  assert.equal(q,1);
  for(const column of Object.keys(proofs)){
    await assert.rejects(
      ()=>assertV1PosOffStorageReady({query:async()=>({
        rows:[{...proofs,[column]:false}],
      })},roles),
      /V1_POS_OFF_HISTORICAL_FINANCIAL_STORAGE_NOT_PROVEN/,
      'POS-off required check must fail closed: '+column,
    );
  }
});

test('old cashier writer or owner cannot stand in for true independent V1 LOGINs',async()=>{
  let calls=0;
  const client={query:async()=>{calls++;return {rows:[proofs]}}};
  for(const changed of [
    {...roles,primaryRole:'fawri_owner'},
    {...roles,authenticationRole:'fawri_cashier_retirement_writer'},
    {...roles,operatorRole:'fawri_auth_issuer'},
  ]){
    await assert.rejects(
      ()=>assertV1PosOffStorageReady(client,changed),
      /V1_POS_OFF_HISTORICAL_FINANCIAL_STORAGE_NOT_PROVEN/);
  }
  assert.equal(calls,0,'must reject wrong role IDs before database query');
});

test('V1 startup adds separate guarded admission only for pinned invoker profile',()=>{
  const code=fs.readFileSync(path.join(root,
    'artifacts/api-server/src/services/cashierStreamStorageReadiness.ts'),'utf8');
  assert.match(code,/selectFt01CashierStorageProfile\(env\)/);
  assert.match(code,/v1Selected/);
  assert.match(code,/FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE/);
  assert.match(code,/v1Selected!==(profile\.mode==='first-commercial-invoker')/);
  assert.match(code,/if\(profile\.mode==='canonical'\)/);
  assert.match(code,/await assertCashierStreamStorageReady\(primary,/);
  assert.match(code,/await assertV1PosOffStorageReady\(primary,/);
  assert.doesNotMatch(code,/await assertFt01HeldInvokerStorageReady/);
  const src=fs.readFileSync(path.join(root,
    'artifacts/api-server/src/services/v1PosOffStorageReadiness.ts'),'utf8');
  for(const code of ['SELECT','pg_catalog.pg_proc','pg_catalog.pg_trigger']){
    assert.ok(src.includes(code));
  }
  assert.doesNotMatch(src,/\b(?:CREATE|ALTER|DROP|DELETE|UPDATE|INSERT)\s+(?:TABLE|ROLE|FUNCTION|INTO|FROM|public\.)/i);
});
