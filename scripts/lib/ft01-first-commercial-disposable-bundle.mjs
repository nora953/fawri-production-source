/**
 * FT-01: first-commercial HELD migration bundle for DISPOSABLE CI ONLY.
 * Pure source manifest + guarded local temp-folder assembly. NO hosted SQL,
 * credentials, restore, production deployment or migration authorization.
 * Canonical 53-stage Drizzle journal stays immutable; 0052 differs ONLY in
 * the ephemeral bundle and must have independently recorded ledger provenance.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildFt01CleanBootstrapSourcePlan} from "./ft01-clean-bootstrap-source-plan.mjs";
import {buildFt01FirstCommercialInvokerReviewPlan} from "./ft01-first-commercial-invoker-source-plan.mjs";
import {stabilizeMigrationDependencyOrder} from "../../lib/db/scripts/lib/migration-sql-order.mjs";

const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const HELD_SQL="lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql";
const HELD_JOURNAL="lib/db/first-commercial/held/meta/_journal.json";
const CANONICAL_TAG="0052_cashier_stream_receipt_storage";
export const FT01_HELD_JOURNAL_LAST_TAG="0052_cashier_stream_receipt_storage_invoker";
const DRIZZLE_DIR="lib/db/drizzle";
/** SHA of the exact reviewed 53-stage post-stabilization SQL chain from
 * successful isolated PostgreSQL18 CI #42626425487. Changes to migration
 * ordering or selected 0052 require fresh review, not silent rebinding.
 */
export const FT01_PINNED_DISPOSABLE_CHAIN_SHA256=
  "1036c70db367b3153b6d070bfbb2d0af3edeb6cf02bdf618e47614e0a0104a05";
const hash=source=>createHash("sha256").update(source,"utf8").digest("hex");
const fail=reason=>{const error=new Error(reason);error.code=reason;throw error;};

export function buildFt01DisposableBundleManifest({
  root=defaultRoot,
  readFile=relative=>fs.readFileSync(path.join(root,relative),"utf8"),
}={}){
  const canonical=buildFt01CleanBootstrapSourcePlan({root,readFile});
  const review=buildFt01FirstCommercialInvokerReviewPlan({root,readFile});
  const entries=canonical.inventoried_migrations;
  // Separate first-commercial journal: same 0000..0051 source and timeline,
  // but an independently named 0052 lineage. Avoid silently deploying
  // alternate SQL under the historical tag without a distinct audit trail.
  const originalJournal=readFile("lib/db/drizzle/meta/_journal.json");
  const heldJournal=readFile(HELD_JOURNAL);
  const expectedOriginal=`"tag": "${CANONICAL_TAG}"`;
  if(originalJournal.split(expectedOriginal).length!==2 ||
     heldJournal!==originalJournal.replace(expectedOriginal,
       `"tag": "${FT01_HELD_JOURNAL_LAST_TAG}"`)){
    fail("FT01_FIRST_COMMERCIAL_HELD_JOURNAL_DRIFT");
  }
  const heldLedger=JSON.parse(heldJournal);
  if(heldLedger.entries.length!==53 ||
     heldLedger.entries[52].tag!==FT01_HELD_JOURNAL_LAST_TAG){
    fail("FT01_FIRST_COMMERCIAL_HELD_LEDGER_UNEXPECTED");
  }
  if(entries.length!==53 || review.source_migrations_count!==53 ||
      review.approved_to_execute!==false ||
      review.commercial_release_authorized!==false ||
      canonical.source_manifest_sha256!==review.source_manifest_sha256){
    fail("FT01_DISPOSABLE_BUNDLE_SOURCE_NOT_REVIEWED");
  }
  const rows=entries.map(entry=>{
    const relative=DRIZZLE_DIR+"/"+entry.tag+".sql";
    const canonicalSql=readFile(relative);
    const activeSql=entry.index===52?readFile(HELD_SQL):canonicalSql;
    const canonicalDigest=hash(canonicalSql);
    const effectiveDigest=hash(activeSql);
    if(canonicalDigest!==entry.sha256 ||
        (entry.index===52 && effectiveDigest!==review.reviewed_invoker_variant_0052_sha256) ||
        (entry.index<52 && canonicalDigest!==effectiveDigest)){
      fail("FT01_DISPOSABLE_BUNDLE_SOURCE_DIGEST_DRIFT");
    }
    return Object.freeze({
      index:entry.index,
      tag:entry.tag,
      selected_tag:entry.index===52?FT01_HELD_JOURNAL_LAST_TAG:entry.tag,
      canonical_sha256:canonicalDigest,
      selected_sha256:effectiveDigest,
      executable_sha256:hash(stabilizeMigrationDependencyOrder(activeSql)),
      selected_kind:entry.index===52?"HELD_FIRST_COMMERCIAL_INVOKER":"PINNED_CANONICAL",
    });
  });
  const stagedDigest=hash(JSON.stringify(rows.map(x=>[
    x.index,x.tag,x.executable_sha256,
  ])));
  if(stagedDigest!==FT01_PINNED_DISPOSABLE_CHAIN_SHA256){
    fail("FT01_DISPOSABLE_BUNDLE_CHAIN_PIN_DRIFT");
  }
  const manifest=Object.freeze({
    decision:"FT01_DISPOSABLE_ONLY_FIRST_COMMERCIAL_MIGRATION_BUNDLE",
    source_manifest_sha256:canonical.source_manifest_sha256,
    journal_sha256:canonical.migration_journal_sha256,
    held_journal_sha256:hash(heldJournal),
    held_journal_distinct_from_canonical:true,
    snapshot_0052_sha256:canonical.snapshot_0052_sha256,
    canonical_0052_sha256:review.canonical_0052_sha256,
    selected_0052_sha256:review.reviewed_invoker_variant_0052_sha256,
    selected_0052_executable_sha256:rows[52].executable_sha256,
    cashier_grants_sha256:review.reviewed_retirement_grants_sql_sha256,
    four_role_reservation_sha256:review.four_role_reservation_sql_sha256,
    ledger_variant_noncanonical:true,
    entries:Object.freeze(rows),
    staged_chain_sha256:stagedDigest,
    source_only:true,
    new_target_bootstrap_authorized:false,
    hosted_execution_authorized:false,
    restore_verified:false,
    merge_or_deploy_authorized:false,
  });
  assert.notEqual(manifest.canonical_0052_sha256,manifest.selected_0052_sha256);
  return manifest;
}
function requireLocalGitHubCi(env){
  if(env.GITHUB_ACTIONS!=="true" ||
     env.GITHUB_REPOSITORY!=="nora953/fawri-production-source" ||
     env.FAWRI_ALLOW_FT01_INVOKER_CANDIDATE!=="1"){
    fail("FT01_DISPOSABLE_BUNDLE_NOT_IN_LOCAL_CI");
  }
  let u;
  try{u=new URL(env.DATABASE_URL??"");}
  catch{fail("FT01_DISPOSABLE_BUNDLE_BAD_LOCAL_DATABASE_URL");}
  if(u.protocol!=="postgresql:" ||
     u.hostname!=="127.0.0.1" || u.port!=="5432" ||
     u.pathname!=="/fawri_ci" ||
     decodeURIComponent(u.username)!=="fawri_ci" ||
     u.search!=="" || u.hash!==""){
    fail("FT01_DISPOSABLE_BUNDLE_BAD_LOCAL_DATABASE_URL");
  }
}
/**
 * Materializes a temp-only Drizzle folder under the locked CI profile.
 * NO PostgreSQL connection or DDL here; caller removes folder in finally.
 */
export function materializeFt01LocalOnlyBundle({root=defaultRoot,env=process.env}={}){
  requireLocalGitHubCi(env);
  const readFile=relative=>fs.readFileSync(path.join(root,relative),"utf8");
  const manifest=buildFt01DisposableBundleManifest({root,readFile});
  const source=path.join(root,DRIZZLE_DIR);
  const actual=fs.readdirSync(source,{withFileTypes:true})
    .filter(x=>x.name.endsWith(".sql"));
  const expectedCanonical=new Set(manifest.entries.map(x=>x.tag+".sql"));
  const expected=new Set(manifest.entries.map(x=>x.selected_tag+".sql"));
  if(actual.length!==53 || actual.some(x=>!x.isFile()||!expectedCanonical.has(x.name))){
    fail("FT01_DISPOSABLE_BUNDLE_UNINVENTORIED_SQL");
  }
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"fawri-ft01-review-only-"));
  try{
    fs.mkdirSync(path.join(folder,"meta"));
    for(const item of manifest.entries){
      const input=item.index===52?HELD_SQL:DRIZZLE_DIR+"/"+item.tag+".sql";
      const sql=stabilizeMigrationDependencyOrder(readFile(input));
      if(hash(sql)!==item.executable_sha256){
        fail("FT01_DISPOSABLE_BUNDLE_STAGED_SQL_DRIFT");
      }
      fs.writeFileSync(path.join(folder,item.selected_tag+".sql"),sql,{flag:"wx",mode:0o600});
    }
    const canonicalJournal=readFile("lib/db/drizzle/meta/_journal.json");
    const journal=readFile(HELD_JOURNAL);
    const journalOriginalTag=`"tag": "${CANONICAL_TAG}"`;
    if(hash(canonicalJournal)!==manifest.journal_sha256 ||
       canonicalJournal.split(journalOriginalTag).length!==2 ||
       journal!==canonicalJournal.replace(journalOriginalTag,
         `"tag": "${FT01_HELD_JOURNAL_LAST_TAG}"`) ||
       hash(journal)!==manifest.held_journal_sha256){
      fail("FT01_DISPOSABLE_BUNDLE_JOURNAL_DRIFT");
    }
    fs.writeFileSync(path.join(folder,"meta","_journal.json"),journal,{flag:"wx",mode:0o600});
    const snapshot=readFile("lib/db/drizzle/meta/0052_snapshot.json");
    if(hash(snapshot)!==manifest.snapshot_0052_sha256)
      fail("FT01_DISPOSABLE_BUNDLE_SNAPSHOT_DRIFT");
    fs.writeFileSync(path.join(folder,"meta","0052_snapshot.json"),snapshot,{flag:"wx",mode:0o600});
    const staged=fs.readdirSync(folder).filter(s=>s.endsWith(".sql"));
    if(staged.length!==53 || staged.some(s=>!expected.has(s))){
      fail("FT01_DISPOSABLE_BUNDLE_POSTIMAGE_UNSAFE");
    }
    return Object.freeze({folder,manifest});
  }catch(error){
    fs.rmSync(folder,{recursive:true,force:true});
    throw error;
  }
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,2,"FT01_DISPOSABLE_BUNDLE_SOURCE_ONLY_NO_ARGUMENTS");
  const m=buildFt01DisposableBundleManifest();
  process.stdout.write(JSON.stringify({...m,entries:undefined},null,2)+"\n");
}
