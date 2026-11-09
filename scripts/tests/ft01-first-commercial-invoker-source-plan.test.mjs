import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildFt01FirstCommercialInvokerReviewPlan,
} from "../lib/ft01-first-commercial-invoker-source-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readFile = relative => fs.readFileSync(path.join(root, relative), "utf8");
const variant = extra => buildFt01FirstCommercialInvokerReviewPlan({
  root,
  readFile: relative => Object.hasOwn(extra,relative) ? extra[relative] : readFile(relative),
});

test("FT01 0052 first-commercial variant is pinned source-only, never authorized", () => {
  const plan = buildFt01FirstCommercialInvokerReviewPlan();
  assert.equal(plan.decision, "FT01_REVIEWABLE_NEW_COMMERCIAL_0052_INVOKER_SOURCE");
  assert.deepEqual(plan.target,{
    project_id:"crimson-cherry-65705041",
    branch_id:"br-holy-waterfall-b993zglb",
    database_name:"fawri",postgres_major:18,
  });
  assert.equal(plan.source_mode,"fresh_schema_migrations_only");
  assert.equal(plan.source_migrations_count,53);
  assert.deepEqual(plan.deployment_roles,{
    primary_login:"fawri_restricted_runtime",
    authentication_login:"fawri_auth_issuer",
    operator_login:"fawri_operator_issuer",
    cashier_retirement_writer_group:"fawri_cashier_retirement_writer",
  });
  assert.ok(new Set(Object.values(plan.deployment_roles)).size===4,
    "Login role names must be disjoint from NOLOGIN writer role");
  assert.equal(plan.held_invoker_source_path,
    "lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql");
  assert.equal(plan.source_provenance,
    "separately committed HELD SQL, exact canonical source-derived match");
  assert.equal(plan.canonical_0052_tag,"0052_cashier_stream_receipt_storage");
  assert.equal(plan.canonical_0052_sha256,
    "aaf7ee97fbdef0c1b4600e905216117ee8ff89f31ccd67d783ab61a9c4bd9b8e");
  assert.notEqual(plan.reviewed_invoker_variant_0052_sha256,plan.canonical_0052_sha256);
  for(const key of ["canonical_0052_sha256","reviewed_invoker_variant_0052_sha256",
     "reviewed_invoker_function_body_sha256","four_role_reservation_sql_sha256",
     "reviewed_retirement_grants_sql_sha256",
     "canonical_journal_sha256","source_manifest_sha256",
     "snapshot_0052_sha256","stage_0052_sha256"])
    assert.match(plan[key],/^[0-9a-f]{64}$/,key);
  for(const key of [
   "production_startup_profile_adopted","canonical_source_or_journal_modified",
   "committed_migration_applied","roles_provisioned",
   "external_provider_attested","external_backup_verified",
   "new_target_sql_http_accepted","approved_to_execute",
   "approved_to_deploy","field002_closed","commercial_release_authorized"])
    assert.equal(plan[key],false,key);
  assert.ok(Object.isFrozen(plan));
});

test("FT01 0052 review plan rejects changed canonical SQL or its recorded stage", () => {
  const sql="lib/db/drizzle/0052_cashier_stream_receipt_storage.sql";
  assert.throws(()=>variant({[sql]:readFile(sql)+"\n-- corruption\n"}),
    /FT01_0052_SQL_HASH_OR_STAGE_DRIFT/);
  const stage="lib/db/migration-stages/0052/stage.json";
  const broken=JSON.parse(readFile(stage));broken.sql_sha256="0".repeat(64);
  assert.throws(()=>variant({[stage]:JSON.stringify(broken)}),
    /FT01_0052_SQL_HASH_OR_STAGE_DRIFT/);
});

test("FT01 0052 review plan rejects historical missing journal or stale source", () => {
  const journal="lib/db/drizzle/meta/_journal.json";
  const changed=JSON.parse(readFile(journal));changed.entries.pop();
  assert.throws(()=>variant({[journal]:JSON.stringify(changed)}),
    /FT01_JOURNAL_UNEXPECTED/);
  assert.throws(()=>variant({["lib/db/drizzle/0051_residual_merchant_privacy_scoped_authority.sql"]:""}),
    /FT01_MIGRATION_SOURCE_EMPTY/);
});

test("FT01 four-role grant-free reservation cannot omit the separate writer group", () => {
  const sql = "docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-FOUR-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql";
  assert.throws(() => variant({[sql]:readFile(sql).replace(
    "CREATE ROLE fawri_cashier_retirement_writer\n",
    "CREATE ROLE missing_retirement_writer\n",
  )}),/FT01_FIRST_COMMERCIAL_ROLE_RESERVATION_INCOMPLETE/);
});

test("FT01 held first-commercial 0052 file is immutable and not silently reconstructed", () => {
  const source = "lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql";
  const actual = readFile(source);
  assert.match(actual, /LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog/);
  assert.doesNotMatch(actual, /OWNER TO fawri_cashier_retirement_owner/);
  assert.throws(() => variant({[source]: actual + "\n-- unreviewed change\n"}),
    /FT01_HELD_COMMITTED_0052_SOURCE_DRIFT/);
  assert.throws(() => variant({[source]: actual.replace(
    "session_user <> 'fawri_auth_issuer'",
    "session_user <> 'fawri_restricted_runtime'",
  )}), /FT01_HELD_COMMITTED_0052_SOURCE_DRIFT/);
  assert.throws(() => variant({[source]: ""}),
    /FT01_HELD_COMMITTED_0052_SOURCE_DRIFT/);
});

test("FT01 committed HELD cashier issuer grants deny ANY privilege expansion", () => {
  const file = "lib/db/first-commercial/held/0052_cashier_retirement_issuer_grants.sql";
  const actual = readFile(file);
  const review = variant({});
  assert.equal(review.held_retirement_grants_source_path,file);
  assert.match(review.reviewed_retirement_grants_sql_sha256,/^[0-9a-f]{64}$/);
  for(const altered of [
    actual+"\nGRANT ALL ON public.cashier_device_streams TO fawri_operator_issuer;\n",
    actual.replace("GRANT UPDATE(state, device_id, version)",
      "GRANT UPDATE(state, device_id, version, last_sequence)"),
    actual.replace("WITH SET FALSE, INHERIT TRUE",
      "WITH SET TRUE, INHERIT TRUE"),
    "",
  ])assert.throws(()=>variant({[file]:altered}),
    /FT01_HELD_RESTRICTED_GRANT_SOURCE_DRIFT/);
});
