import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import {
  buildP0Held0053SourceAdmissionPlan,
  PINNED_HELD_0053_SQL_SHA256,
  PINNED_HELD_0053_GRANTS_SHA256,
  PINNED_HELD_0053_JOURNAL_SHA256,
} from "../lib/p0-held-0053-source-admission-plan.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const original=relative=>readFileSync(path.join(root,relative),"utf8");
const substitute=(changes={})=>buildP0Held0053SourceAdmissionPlan({
  root,readFile:relative=>Object.hasOwn(changes,relative)?changes[relative]:original(relative),
});
const sql="lib/db/first-commercial/held/0053_verified_receipt_manual_cases_candidate.sql";
const grants="lib/db/first-commercial/held/0053_receipt_manual_case_operator_grants.sql";
const journal="lib/db/first-commercial/held/meta/_journal_with_0053.json";
const parent="lib/db/first-commercial/held/meta/_journal.json";
const canonical="lib/db/drizzle/meta/_journal.json";

test("P0 0053 has exact source review lineage and does not authorize deployment",()=>{
  const plan=substitute();
  assert.equal(plan.decision,"P0_HELD_0053_SOURCE_ONLY_REVIEW");
  assert.equal(plan.source_mode,"new_first_commercial_fresh_schema_only");
  assert.equal(plan.predecessor_source_migrations,53);
  assert.equal(plan.proposed_held_source_migrations,54);
  assert.equal(plan.candidate_0053_sql_sha256,PINNED_HELD_0053_SQL_SHA256);
  assert.equal(plan.candidate_0053_grants_sha256,PINNED_HELD_0053_GRANTS_SHA256);
  assert.equal(plan.candidate_0053_held_journal_sha256,PINNED_HELD_0053_JOURNAL_SHA256);
  assert.equal(plan.intended_operator_login,"fawri_operator_issuer");
  for(const key of [
    "original_canonical_journal_modified","hosted_migration_applied",
    "roles_provisioned","external_backup_verified",
    "live_provider_settlement_verified","independent_financial_disposition_approved",
    "commercial_retention_approved","hosted_sql_http_accepted","approved_to_execute",
    "approved_to_deploy","receipt_gate_closed","release_authorized",
  ])assert.equal(plan[key],false,key);
  assert.ok(Object.isFrozen(plan));
});

test("P0 0053 pinned source rejects even innocuous SQL or table privilege changes",()=>{
  const s=original(sql);
  for(const edited of [
    s+"\n-- unrelated changed source\n",
    s.replace("ON DELETE RESTRICT","ON DELETE CASCADE"),
    s.replace("CREATE TRIGGER manual_case_event_immutable BEFORE UPDATE OR DELETE",
              "CREATE TRIGGER manual_case_event_immutable BEFORE DELETE"),
  ]) assert.throws(()=>substitute({[sql]:edited}),/P0_HELD_0053_SQL_SHA256_DRIFT/);
});

test("P0 0053 held exact operator grant source rejects privilege widening or role replacement",()=>{
  const s=original(grants);
  for(const edited of [
    s+"GRANT SELECT ON public.verified_provider_payment_receipts TO fawri_operator_issuer;\n",
    s.replace("GRANT EXECUTE ON FUNCTION","GRANT ALL ON FUNCTION"),
    s.replaceAll("fawri_operator_issuer","fawri_restricted_runtime"),
    s.replace("public.fawri_acknowledge_receipt_dispute_second_review","public.fawri_authorize_verified_receipt_replay"),
    "",
  ]) assert.throws(()=>substitute({[grants]:edited}),/P0_HELD_0053_GRANTS_SHA256_DRIFT/);
});

test("P0 0053 draft journal rejects changed tag, when, missing or added entry",()=>{
  const s=original(journal),j=JSON.parse(s);
  const cases=[s.replace("0053_verified_receipt_manual_cases_candidate","0053_wrong"),
    s+"\n",
  ];
  const changed=structuredClone(j);changed.entries[53].when+=1;cases.push(JSON.stringify(changed,null,2)+"\n");
  const removed=structuredClone(j);removed.entries.pop();cases.push(JSON.stringify(removed,null,2)+"\n");
  const added=structuredClone(j);added.entries.push({...j.entries[53],idx:54,tag:"0054_unapproved"});cases.push(JSON.stringify(added,null,2)+"\n");
  for(const edited of cases)assert.throws(()=>substitute({[journal]:edited}),/P0_HELD_0053_CANDIDATE_JOURNAL_DRIFT/);
});

test("P0 0053 cannot rewrite predecessor 0052 held journal or canonical history",()=>{
  const before=original(parent);
  assert.throws(()=>substitute({[parent]:before.replace("0052_cashier_stream_receipt_storage_invoker","0052_untrusted")}),
    /FT01_FIRST_COMMERCIAL_HELD_JOURNAL_DRIFT/);
  const historical=original(canonical);
  assert.throws(()=>substitute({[canonical]:historical.replace("0052_cashier_stream_receipt_storage","0052_untrusted")}),
    /FT01_JOURNAL_UNEXPECTED|FT01_FIRST_COMMERCIAL_CANONICAL_JOURNAL_TAG_UNTRUSTED|FT01_SOURCE_MANIFEST/);
});
