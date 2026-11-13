import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(repoRoot,
  ".github/workflows/field002-original-staging-readonly-restore.yml"), "utf8");

test("FIELD002 original backup is explicit, single-file, pinned and never production", () => {
  for (const required of [
    "field002-original-staging-portable-restore-request.json",
    "APPROVE_ORIGINAL_STAGING_READONLY_PORTABLE_OBJECT_ACL_RESTORE",
    "request.approved_parent_sha!==parent",
    "test \"$changed\" = docs/final-audit/evidence/field002-original-staging-portable-restore-request.json",
    "br-falling-dust-b1km4gix",
    "ep-plain-leaf-b1wtzjr3.c-5.eu-central-1.aws.neon.tech",
    "FAWRI_FIELD002_ORIGINAL_STAGING_ADMIN_URL",
    "u.username!=='neondb_owner'",
    "u.pathname!=='/neondb'",
    "u.port!=='5432'",
    "neondb|neondb_owner|28|0|180006",
    "95|437|8dcad805b36a3f8f8d33fd13a567e7cd",
    "FIELD002_ORIGINAL_PRECHANGE_DATA_BASELINE_DRIFT_BLOCKED",
    "FIELD002_ORIGINAL_SOURCE_ACL_BASELINE_DRIFT_BLOCKED",
  ]) assert.ok(workflow.includes(required), required);
  for (const forbidden of [
    "br-shiny-lab-b1vxj4wn", "br-polished-mouse-b1proel7",
    "ep-withered-union-b1jh284c", "secrets.FAWRI_FIELD002_CLEAN_CLONE_ADMIN_URL",
  ]) assert.ok(!workflow.includes(forbidden), "unexpected target: "+forbidden);
});

test("FIELD002 original read-only archive cannot run before exact source data and ACL attestation", () => {
  const dump = workflow.indexOf("pg_dump --dbname=");
  const dataPin = workflow.indexOf("95|437|8dcad805b36a3f8f8d33fd13a567e7cd");
  const aclPin = workflow.indexOf("default_acl|4|2c3a21d7a1011f2fbbd745ed7280dfd3");
  const aclCmp = workflow.indexOf('cmp -s "$work/acl-approved-baseline.txt" "$work/acl-source-before.txt"');
  const restore = workflow.indexOf("pg_restore --dbname=");
  assert.ok(dataPin > 0 && aclPin > dataPin && aclCmp > aclPin && dump > aclCmp && restore > dump);
  for(const line of [
    "default_acl|4|2c3a21d7a1011f2fbbd745ed7280dfd3",
    "policies|45|340b969aff1b615b0105985598695069",
    "relations|96|872e96f87f2675a36fa30c1f573ffe49",
    "routines|3|ecf3c858cf63f7a549f65b6aaacb7990",
    "schemas|2|4f509330ba572a6727e34a550b9c4127",
  ]) assert.ok(workflow.includes(line),line);
  assert.match(workflow, /pg_dump --dbname="\$FIELD002_ADMIN_URL" --format=custom/);
  assert.match(workflow, /pg_restore --dbname="postgresql:\/\/fawri_ci:fawri_ci@127\.0\.0\.1:5432\/fawri_field002_portable_restore"/);
  assert.ok(!workflow.includes('pg_restore --dbname="$FIELD002_ADMIN_URL"'));
  assert.ok(!workflow.includes("--no-owner"));
  assert.ok(!workflow.includes("--no-privileges"));
  assert.doesNotMatch(workflow, /actions\/upload-artifact|artifact upload|workflow_dispatch:|pull_request_target:/i);
  assert.match(workflow,/originalStagingReadOnly:true,commercialReleaseAuthorized:false/);
  assert.match(workflow,/roleGlobalsRestored:false,externalDurableBackupProven:false/);
  assert.match(workflow,/rm -rf "\$RUNNER_TEMP\/field002-original-portable-proof"/);
});

test("FIELD002 original-only backup is not misreported as final cutover or commercial green", () => {
  assert.ok(workflow.includes("FIELD002_ORIGINAL_STAGING_LOCAL_OWNER_ACL_RESTORE_PASS"));
  assert.ok(workflow.includes("NOT_ACCEPTED_INSPECT_RUN"));
  assert.ok(workflow.includes("FIELD002 stays OPEN and 0052 BLOCKED"));
  assert.ok(workflow.includes("No raw backup uploaded") ||
    workflow.includes("no raw backup uploaded"));
  assert.doesNotMatch(workflow,/externalDurableBackupProven:true|commercialReleaseAuthorized:true/);
});
