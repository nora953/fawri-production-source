/**
 * R-OWN-5 HELD 0053 review: source-only, fail closed.
 * NO SQL execution, hosted DB, credentials, deployment, refunds or grants.
 * Reuse the exact accepted FT01 first-commercial 0052 provenance chain; do
 * not silently append to or mutate the canonical 53-stage Drizzle journal.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFt01FirstCommercialInvokerReviewPlan } from "./ft01-first-commercial-invoker-source-plan.mjs";

const rootDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HELD_SQL = "lib/db/first-commercial/held/0053_verified_receipt_manual_cases_candidate.sql";
const HELD_GRANTS = "lib/db/first-commercial/held/0053_receipt_manual_case_operator_grants.sql";
const HELD_0052_JOURNAL = "lib/db/first-commercial/held/meta/_journal.json";
const HELD_0053_JOURNAL = "lib/db/first-commercial/held/meta/_journal_with_0053.json";
const CANONICAL_JOURNAL = "lib/db/drizzle/meta/_journal.json";
const hash = s => createHash("sha256").update(s,"utf8").digest("hex");

export const PINNED_HELD_0053_SQL_SHA256 = "b9806fde1614d181a22c01ae63aef6d66cead6b5dfc27f9e372a13749a03eb41";
export const PINNED_HELD_0053_GRANTS_SHA256 = "848b6e98da5366ac2cf7c8fa0ea033395e37b06ef30ef29ce272638c5a7772d6";
export const PINNED_HELD_0053_JOURNAL_SHA256 = "65b24ee8ae1bdef9032fa0c056b4ba919a9838ae98dc5fd69bf134a054dc5a56";
export const PINNED_HELD_0052_JOURNAL_SHA256 = "7683b1fe807a514c0662ffb216e995492712433302f8292f9b2966582ed46339";

const allowedGrants = Object.freeze([
  "GRANT USAGE ON SCHEMA public TO fawri_operator_issuer;",
  "GRANT EXECUTE ON FUNCTION public.fawri_open_unmatched_verified_receipt_case(text,text,text,text,text) TO fawri_operator_issuer;",
  "GRANT EXECUTE ON FUNCTION public.fawri_escalate_verified_receipt_manual_case(text,text,text,text,text,text,text) TO fawri_operator_issuer;",
  "GRANT EXECUTE ON FUNCTION public.fawri_list_verified_receipt_manual_cases(text,text,text,integer,timestamptz,text,text,text) TO fawri_operator_issuer;",
  "GRANT EXECUTE ON FUNCTION public.fawri_read_verified_receipt_manual_case_history(text,text,text,text,integer,bigint,text,text) TO fawri_operator_issuer;",
  "GRANT EXECUTE ON FUNCTION public.fawri_acknowledge_receipt_dispute_second_review(text,text,text,text,text,text) TO fawri_operator_issuer;",
]);

export function buildP0Held0053SourceAdmissionPlan({
  root = rootDefault,
  readFile = relative => fs.readFileSync(path.join(root,relative),"utf8"),
}={}) {
  const predecessor=buildFt01FirstCommercialInvokerReviewPlan({root,readFile});
  assert.equal(predecessor.approved_to_execute,false,"P0_HELD_0053_PREDECESSOR_NOT_HELD");
  assert.equal(predecessor.source_migrations_count,53,"P0_HELD_0053_PARENT_COUNT_INVALID");
  assert.equal(predecessor.reviewed_held_journal_sha256,PINNED_HELD_0052_JOURNAL_SHA256,
    "P0_HELD_0053_PARENT_JOURNAL_PIN_INVALID");
  const canonical=readFile(CANONICAL_JOURNAL);
  const parent=readFile(HELD_0052_JOURNAL);
  const candidate=readFile(HELD_0053_JOURNAL);
  assert.equal(hash(canonical),predecessor.canonical_journal_sha256,
    "P0_HELD_0053_CANONICAL_JOURNAL_DRIFT");
  assert.equal(hash(parent),PINNED_HELD_0052_JOURNAL_SHA256,
    "P0_HELD_0053_PARENT_JOURNAL_DRIFT");
  assert.equal(hash(candidate),PINNED_HELD_0053_JOURNAL_SHA256,
    "P0_HELD_0053_CANDIDATE_JOURNAL_DRIFT");
  const before=JSON.parse(parent), after=JSON.parse(candidate);
  assert.equal(after.version,before.version);
  assert.equal(after.dialect,"postgresql");
  assert.equal(before.entries.length,53);
  assert.equal(after.entries.length,54,"P0_HELD_0053_CANDIDATE_JOURNAL_COUNT");
  assert.deepEqual(after.entries.slice(0,53),before.entries,"P0_HELD_0053_PREDECESSOR_CHANGED");
  assert.deepEqual(after.entries[53],{
    idx:53,version:"7",when:1791936000025,
    tag:"0053_verified_receipt_manual_cases_candidate",breakpoints:true,
  },"P0_HELD_0053_JOURNAL_TAIL_INVALID");
  assert.equal(JSON.stringify(after,null,2)+"\n",candidate,
    "P0_HELD_0053_JOURNAL_SERIALIZATION_DRIFT");
  const sql=readFile(HELD_SQL);
  const grants=readFile(HELD_GRANTS);
  assert.equal(hash(sql),PINNED_HELD_0053_SQL_SHA256,"P0_HELD_0053_SQL_SHA256_DRIFT");
  assert.equal(hash(grants),PINNED_HELD_0053_GRANTS_SHA256,"P0_HELD_0053_GRANTS_SHA256_DRIFT");
  assert.deepEqual(grants.split("\n").map(x=>x.trim())
    .filter(x=>x&&!x.startsWith("--")),allowedGrants,
    "P0_HELD_0053_GRANTS_WIDENED");
  for(const functionName of [
    "fawri_open_unmatched_verified_receipt_case",
    "fawri_escalate_verified_receipt_manual_case",
    "fawri_list_verified_receipt_manual_cases",
    "fawri_read_verified_receipt_manual_case_history",
    "fawri_acknowledge_receipt_dispute_second_review",
  ]) assert.ok(sql.includes("CREATE FUNCTION public."+functionName+"("),
    "P0_HELD_0053_MISSING_SOURCE_CAPABILITY");
  assert.match(sql,/REVOKE ALL ON public\.verified_receipt_manual_cases, public\.verified_receipt_manual_case_events FROM PUBLIC;/,
    "P0_HELD_0053_RAW_TABLE_ACCESS");
  assert.match(sql,/CREATE TRIGGER manual_case_immutable BEFORE UPDATE OR DELETE/);
  assert.match(sql,/CREATE TRIGGER manual_case_event_immutable BEFORE UPDATE OR DELETE/);
  assert.match(sql,/PROVIDER_DISPUTE_REVIEWED/);
  assert.doesNotMatch(grants,/GRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|CREATE)\b/i,
    "P0_HELD_0053_RAW_GRANT_FORBIDDEN");

  return Object.freeze({
    decision:"P0_HELD_0053_SOURCE_ONLY_REVIEW",
    source_mode:"new_first_commercial_fresh_schema_only",
    target:predecessor.target,
    predecessor_source_migrations:53,
    proposed_held_source_migrations:54,
    canonical_journal_sha256:hash(canonical),
    predecessor_0052_held_journal_sha256:hash(parent),
    candidate_0053_held_journal_sha256:hash(candidate),
    candidate_0053_sql_sha256:hash(sql),
    candidate_0053_grants_sha256:hash(grants),
    proposed_journal_path:HELD_0053_JOURNAL,
    proposed_sql_path:HELD_SQL,
    proposed_operator_grants_path:HELD_GRANTS,
    intended_operator_login:"fawri_operator_issuer",
    original_canonical_journal_modified:false,
    hosted_migration_applied:false,
    roles_provisioned:false,
    external_backup_verified:false,
    live_provider_settlement_verified:false,
    independent_financial_disposition_approved:false,
    commercial_retention_approved:false,
    hosted_sql_http_accepted:false,
    approved_to_execute:false,
    approved_to_deploy:false,
    receipt_gate_closed:false,
    release_authorized:false,
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length,2,"P0_HELD_0053_SOURCE_PLAN_NO_ARGS");
  process.stdout.write(JSON.stringify(buildP0Held0053SourceAdmissionPlan(),null,2)+"\n");
}
