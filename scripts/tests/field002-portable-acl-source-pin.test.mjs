import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(root,
  ".github/workflows/field002-portable-clone-owner-acl-restore.yml"), "utf8");
const sql = readFileSync(path.join(root,
  "docs/final-audit/evidence/sql/P0-FIELD002-ISOLATED-PORTABLE-OBJECT-ACL-CATALOG-20261108.sql"), "utf8");

test("FIELD002 owner/ACL portable restore fails closed on drift from independently verified source", () => {
  const baseline = workflow.match(/cat > "\$work\/acl-approved-baseline\.txt" <<'CATALOG'\n([\s\S]*?)\n\s+CATALOG/);
  assert.ok(baseline, "approved, nonsecret security catalog baseline is required");
  const rows = baseline[1].trim().split("\n").map(line => line.trim());
  assert.deepEqual(rows, [
    "default_acl|4|2c3a21d7a1011f2fbbd745ed7280dfd3",
    "policies|74|f6ace2b1988536ae51e23938d2e94f7e",
    "relations|98|da9c9f2bdb4ba57a0cc4ff2b876065d9",
    "routines|19|c93ee0374b4194dacf05a743e81304dd",
    "schemas|3|6efdbd38f95288b67c1b1c74fc2e245f",
  ]);
  const compare = workflow.indexOf("cmp -s \"$work/acl-approved-baseline.txt\" \"$work/acl-source-before.txt\"");
  const dump = workflow.indexOf("pg_dump --dbname=");
  const sourceDigest = workflow.indexOf("> \"$work/acl-source-before.txt\"");
  assert.ok(sourceDigest >= 0 && sourceDigest < compare && compare < dump,
    "detect baseline drift BEFORE creating any source archive");
  assert.ok(workflow.includes("FIELD002_CLONE_SOURCE_ACL_BASELINE_DRIFT_BLOCKED"));
  assert.ok(workflow.includes("exit 1\n          fi\n          if ! docker run"));
  assert.doesNotMatch(workflow, /actions\/upload-artifact/);
});

test("FIELD002 source catalog includes effective PostgreSQL default ACLs and all security categories", () => {
  assert.match(sql, /COALESCE\(c\.relacl,acldefault\(/i);
  assert.match(sql, /COALESCE\(p\.proacl,acldefault\(/i);
  for (const category of ["relations", "routines", "schemas", "default_acl", "policies"]) {
    assert.ok(sql.includes("'" + category + "'"), category);
  }
  assert.match(sql, /SELECT grp,count\(\*\)::int n,md5\(string_agg\(val,E'\\n' ORDER BY val\)\) digest FROM rec GROUP BY grp ORDER BY grp;/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ""), /\b(?:ALTER|CREATE|DROP|TRUNCATE|UPDATE|INSERT|DELETE|GRANT|REVOKE|RESET|SET\s+ROLE)\b/i);
});
