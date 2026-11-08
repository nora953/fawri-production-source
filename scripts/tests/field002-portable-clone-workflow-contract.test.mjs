import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(
  path.join(root, ".github/workflows/field002-portable-clone-readonly-restore.yml"),
  "utf8",
);
const request = JSON.parse(readFileSync(
  path.join(root, "docs/final-audit/evidence/field002-portable-clone-run-request.json"),
  "utf8",
));

test("FIELD002 portable workflow is authorized by one immutable push request to one isolated clone", () => {
  for (const pin of [
    "fix/p0-provider-receipt-order-discovery-20261015",
    "docs/final-audit/evidence/field002-portable-clone-run-request.json",
    "APPROVE_CLONE_READONLY_PORTABLE_DATA_DRILL",
    "br-polished-mouse-b1proel7",
    "ep-withered-union-b1jh284c.c-5.eu-central-1.aws.neon.tech",
    "u.username!=='neondb_owner'",
    "u.pathname!=='/neondb'",
    "request.approved_parent_sha!==parent",
    "test \"$GITHUB_EVENT_NAME\" = push",
    "test \"$changed\" = docs/final-audit/evidence/field002-portable-clone-run-request.json",
    "secrets.FAWRI_FIELD002_CLEAN_CLONE_ADMIN_URL",
  ]) assert.ok(workflow.includes(pin), "missing pinned safety contract: " + pin);
  assert.deepEqual(Object.keys(request).sort(), [
    "approval", "approved_branch", "approved_parent_sha",
  ]);
  assert.equal(request.approval, "APPROVE_CLONE_READONLY_PORTABLE_DATA_DRILL");
  assert.equal(request.approved_branch, "br-polished-mouse-b1proel7");
  assert.match(request.approved_parent_sha, /^[a-f0-9]{40}$/);
  assert.doesNotMatch(workflow, /\bworkflow_dispatch:|\bpull_request_target:/);
});

test("FIELD002 hosted work keeps privileged remote source read-only and all writes local", () => {
  for (const pin of [
    "postgres:18-alpine", "127.0.0.1:5432:5432",
    "52|0|180006", "pg_dump --dbname=",
    "--format=custom", "--serializable-deferrable",
    "pg_restore --dbname=", "--no-owner --no-privileges",
    "fawri_field002_portable_restore",
    "cmp -s \"$work/source-before.txt\" \"$work/source-after.txt\"",
    "cmp -s \"$work/source-before.txt\" \"$work/restored.txt\"",
    "FIELD002_PORTABLE_CLEAN_CLONE_DATA_ONLY_PASS",
    "ownerAclRestoreProven:false",
    "externalDurableBackupProven:false",
    "commercialReleaseAuthorized:false",
    "NOT_ACCEPTED_INSPECT_RUN", "BOUNDED_PORTABLE_DATA_ONLY_PASS",
  ]) assert.ok(workflow.includes(pin), "missing portable safety contract: " + pin);
  const remote = workflow.split("FIELD002_ADMIN_URL");
  assert.ok(remote.length >= 5, "source URL must never silently route to another target");
  assert.doesNotMatch(workflow, /actions\/upload-artifact|create-deployment|accept-deploy|pg_dumpall|pg_restore\s+--dbname="\$FIELD002_ADMIN_URL"/i);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /rm -rf "\$RUNNER_TEMP\/field002-portable-proof"/);
  // This is not an owner/ACL-validating disaster recovery drill and cannot
  // substitute for an independent original staging portable restore.
});

test("FIELD002 proof cannot silently target original staging or default production branch", () => {
  for (const forbidden of [
    "br-falling-dust-b1km4gix", "br-shiny-lab-b1vxj4wn",
    "ep-withered-union-b1jh284c-pooler",
  ]) assert.ok(!workflow.includes(forbidden), "unsafe workflow target: " + forbidden);
  assert.ok(!workflow.includes("pg_restore --dbname=\"$FIELD002_ADMIN_URL\""),
    "never restore into hosted clone");
});
