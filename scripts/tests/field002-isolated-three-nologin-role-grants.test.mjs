import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const filename = path.join(root,
  "docs/final-audit/evidence/sql/P0-FIELD002-ISOLATED-THREE-NOLOGIN-ROLE-GRANTS-20261107.sql");
const source = fs.readFileSync(filename, "utf8");
const executable = source.split("\n").filter(line => !line.trim().startsWith("--")).join("\n");
const roles = ["fawri_field002_tenant_probe",
  "fawri_field002_auth_probe", "fawri_field002_operator_probe"];
const approvedRoutines = [
  "fawri_security.allows_merchant(text)",
  "public.fawri_authentication_runtime()",
  "fawri_security.issue_scope(name,integer,bigint,text)",
  "public.fawri_issue_admin_directory_audit(text,text,text)",
  "public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)",
  "public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)",
  "public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)",
];

test("FIELD002 grants target ONLY the exact immutable clean staging clone with transaction rollback", () => {
  assert.match(source, /branch br-polished-mouse-b1proel7/);
  assert.match(source, /project round-fire-18493605/);
  assert.match(executable, /^BEGIN;$/m);
  assert.match(executable, /^COMMIT;$/m);
  assert.equal((executable.match(/^COMMIT;$/gm) || []).length, 1);
  assert.match(executable, /SET LOCAL lock_timeout = '3s'/);
  assert.match(executable, /FIELD002_THREE_ROLE_PREFLIGHT_REJECTED/);
  assert.match(executable, /FIELD002_THREE_ROLE_BASELINE_UNSAFE/);
  assert.match(executable, /FIELD002_ROLE_ELEVATION_REJECTED/);
  assert.match(executable, /FIELD002_DIRECT_TABLE_GRANT_SCOPE_REJECTED/);
  assert.match(executable, /FIELD002_TENANT_CAPABILITY_REJECTED/);
  assert.match(executable, /FIELD002_AUTH_CAPABILITY_REJECTED/);
  assert.match(executable, /FIELD002_OPERATOR_CAPABILITY_REJECTED/);
  assert.match(executable, /SELECT count\(\*\) FROM drizzle\.__drizzle_migrations\) <> 52/);
  assert.match(executable, /1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea/);
  assert.match(executable, /c\.relrowsecurity\) <> 8/);
  assert.match(executable, /public\.notifications\) <> 0/);
  assert.match(executable, /fawri_security\.transaction_scopes\) <> 0/);
  assert.match(executable, /r\.rolcanlogin OR r\.rolsuper OR r\.rolbypassrls/);
  assert.match(executable, /r\.rolconnlimit <> 0/);
  assert.match(executable, /r\.rolinherit/);
  assert.match(executable, /pg_auth_members/);
});

test("FIELD002 user-runner grant script cannot activate logins, alter other roles, or write data", () => {
  for (const role of roles) {
    assert.ok(executable.includes(role), role);
  }
  assert.ok(!/\b(?:CREATE|ALTER|DROP)\s+(?:USER|ROLE)\b/i.test(executable));
  assert.ok(!/\b(?:PASSWORD|VALID\s+UNTIL|ENCRYPTED|CREATEDB|CREATEROLE)\s*=/i.test(executable));
  assert.ok(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+|TABLE\s+)?(?:public\.|fawri_security\.)/i.test(executable));
  assert.ok(!/\bGRANT\s+(?:ALL|CREATE|USAGE ON SCHEMA public TO PUBLIC|SELECT ON ALL TABLES)/i.test(executable));
  assert.equal((executable.match(/^GRANT\s/gm) || []).length, 15);
  assert.equal((executable.match(/^DO \$field002_/gm) || []).length, 2);
  assert.ok(executable.indexOf("FIELD002_THREE_ROLE_BASELINE_UNSAFE") < executable.indexOf("GRANT CONNECT"));
  assert.ok(executable.indexOf("FIELD002_OPERATOR_CAPABILITY_REJECTED") < executable.indexOf("COMMIT;"));
});

test("FIELD002 protects all three privilege domains and denies cross-role issuer mixing", () => {
  for (const capability of approvedRoutines) assert.ok(executable.includes(capability), capability);
  assert.match(executable, /GRANT EXECUTE ON FUNCTION fawri_security\.allows_merchant\(text\)\s+TO fawri_field002_tenant_probe/);
  assert.match(executable, /fawri_security\.issue_scope\(name,integer,bigint,text\)\s+TO fawri_field002_auth_probe/);
  assert.match(executable, /public\.fawri_authorize_verified_receipt_replay\(text,text,text,text,text,text,text,text\)\s+TO fawri_field002_operator_probe/);
  assert.match(executable, /r\.rolname='fawri_field002_tenant_probe' AND public_tables<>5/);
  assert.match(executable, /r\.rolname='fawri_field002_auth_probe' AND public_tables<>3/);
  assert.match(executable, /r\.rolname='fawri_field002_operator_probe' AND public_tables<>0/);
  assert.match(executable, /r\.rolname <> 'fawri_field002_auth_probe'/);
  assert.match(executable, /r\.rolname <> 'fawri_field002_operator_probe'/);
  assert.match(executable, /public\.database_admin_access_audits/);
  assert.match(executable, /password_hash/);
  assert.match(executable, /public\.account_sessions/);
  assert.match(executable, /public\.notifications/);
  assert.match(executable, /DELETE,TRUNCATE/);
});

test("FIELD002 grant plan retains an explicit post-commit read-only verification", () => {
  assert.ok(executable.trimEnd().endsWith("ORDER BY r.rolname;"));
  assert.match(executable, /r\.rolcanlogin AS can_login/);
  assert.match(executable, /r\.rolbypassrls AS bypass_rls/);
  assert.match(executable, /r\.rolcreaterole AS can_create_roles/);
  assert.ok(!/^\s*\\copy\b/m.test(executable));
});
