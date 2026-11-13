import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {
  buildFt01DisposableBundleManifest,
  materializeFt01LocalOnlyBundle,
  FT01_PINNED_DISPOSABLE_CHAIN_SHA256,
  FT01_HELD_JOURNAL_LAST_TAG,
} from "../lib/ft01-first-commercial-disposable-bundle.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");
const mutated=(changes)=>buildFt01DisposableBundleManifest({
  root,readFile:relative=>Object.hasOwn(changes,relative)?changes[relative]:read(relative),
});
test("FT01 immutable canonical 53 stage chain differs ONLY in held final 0052",()=>{
  const m=buildFt01DisposableBundleManifest();
  assert.equal(m.decision,"FT01_DISPOSABLE_ONLY_FIRST_COMMERCIAL_MIGRATION_BUNDLE");
  assert.equal(m.entries.length,53);
  assert.deepEqual(m.entries.map(x=>x.index),Array.from({length:53},(_,i)=>i));
  assert.ok(m.entries.slice(0,52).every(x=>
    x.selected_kind==="PINNED_CANONICAL"&&
    x.canonical_sha256===x.selected_sha256));
  assert.equal(m.entries[52].selected_kind,"HELD_FIRST_COMMERCIAL_INVOKER");
  assert.equal(m.entries[52].tag,"0052_cashier_stream_receipt_storage");
  assert.equal(m.entries[52].selected_tag,FT01_HELD_JOURNAL_LAST_TAG);
  assert.equal(m.held_journal_distinct_from_canonical,true);
  assert.match(m.held_journal_sha256,/^[a-f0-9]{64}$/);
  assert.notEqual(m.held_journal_sha256,m.journal_sha256);
  assert.ok(m.entries.slice(0,52).every(x=>x.selected_tag===x.tag));
  assert.equal(m.entries[52].selected_sha256,m.selected_0052_sha256);
  assert.notEqual(m.canonical_0052_sha256,m.selected_0052_sha256);
  assert.equal(m.entries[52].executable_sha256,m.selected_0052_executable_sha256);
  assert.match(m.staged_chain_sha256,/^[a-f0-9]{64}$/);
  assert.equal(m.staged_chain_sha256,
    FT01_PINNED_DISPOSABLE_CHAIN_SHA256,
    "FT01_SOURCE_REVIEWED_STAGED_CHAIN_IMMUTABLE");
  assert.equal(FT01_PINNED_DISPOSABLE_CHAIN_SHA256,
    "1036c70db367b3153b6d070bfbb2d0af3edeb6cf02bdf618e47614e0a0104a05");
  assert.match(m.cashier_grants_sha256,/^[a-f0-9]{64}$/);
  assert.match(m.four_role_reservation_sha256,/^[a-f0-9]{64}$/);
  assert.equal(m.ledger_variant_noncanonical,true);
  assert.equal(m.new_target_bootstrap_authorized,false);
  assert.equal(m.hosted_execution_authorized,false);
  assert.equal(m.restore_verified,false);
  assert.equal(m.merge_or_deploy_authorized,false);
  assert.equal(Object.isFrozen(m),true);
  assert.equal(Object.isFrozen(m.entries),true);
  assert.equal(Object.isFrozen(m.entries[52]),true);
});
test("FT01 denies source drift in canonical earlier stage and alternate 0052",()=>{
  const earlier="lib/db/drizzle/0001_military_proteus.sql";
  assert.throws(()=>mutated({[earlier]:read(earlier)+"\n--unexpected\n"}),
    /FT01_SOURCE_CHAIN_PIN_DRIFT/);
  const held="lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql";
  assert.throws(()=>mutated({[held]:read(held)+"\n--unexpected\n"}),
    /FT01_HELD_COMMITTED_0052_SOURCE_DRIFT/);
});
test("FT01 distinct first-commercial journal rejects renamed 0052, earlier drift and extra entries",()=>{
  const path="lib/db/first-commercial/held/meta/_journal.json";
  const text=read(path);
  const obj=JSON.parse(text);
  assert.equal(obj.entries[52].tag,FT01_HELD_JOURNAL_LAST_TAG);
  assert.throws(()=>mutated({[path]:text.replace(
    '"tag": "'+FT01_HELD_JOURNAL_LAST_TAG+'"',
    '"tag": "0052_cashier_stream_receipt_storage"',
  )}),/FT01_FIRST_COMMERCIAL_HELD_JOURNAL_DRIFT/);
  obj.entries[1].when+=1;
  assert.throws(()=>mutated({[path]:JSON.stringify(obj)}),
    /FT01_FIRST_COMMERCIAL_HELD_JOURNAL_DRIFT/);
  obj.entries.push({...obj.entries[52],idx:53});
  assert.throws(()=>mutated({[path]:JSON.stringify(obj)}),
    /FT01_FIRST_COMMERCIAL_HELD_JOURNAL_DRIFT/);
});
test("FT01 materializer cannot run outside local GitHub Actions CI",()=>{
  assert.throws(()=>materializeFt01LocalOnlyBundle({env:{}}),
    /FT01_DISPOSABLE_BUNDLE_NOT_IN_LOCAL_CI/);
  const base={
    GITHUB_ACTIONS:"true",
    GITHUB_REPOSITORY:"nora953/fawri-production-source",
    FAWRI_ALLOW_FT01_INVOKER_CANDIDATE:"1",
    DATABASE_URL:"postgresql://fawri_ci:test@127.0.0.1:5432/fawri_ci",
  };
  for(const databaseUrl of [
    "postgresql://user:test@127.0.0.1:5432/fawri_ci",
    "postgresql://fawri_ci:test@neon.tech:5432/fawri_ci",
    "postgresql://fawri_ci:test@127.0.0.1:5432/neondb",
    "postgresql://fawri_ci:test@127.0.0.1:5432/fawri_ci?sslmode=require",
  ]){
    assert.throws(()=>materializeFt01LocalOnlyBundle({
      env:{...base,DATABASE_URL:databaseUrl},
    }),/FT01_DISPOSABLE_BUNDLE_BAD_LOCAL_DATABASE_URL/);
  }
  assert.throws(()=>materializeFt01LocalOnlyBundle({
    env:{...base,GITHUB_REPOSITORY:"other/repo"},
  }),/FT01_DISPOSABLE_BUNDLE_NOT_IN_LOCAL_CI/);
});
