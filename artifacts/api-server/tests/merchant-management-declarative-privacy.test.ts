import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { merchantAdminNotes, merchantChannelOverrides, merchantDeletionRequests } from "@workspace/db/schema";
import { merchantAdminNotesPrivacyPolicy, merchantChannelOverridesPrivacyPolicy, merchantDeletionRequestsPrivacyPolicy } from "../../../lib/db/src/schema/tenant-security";

const definitions = [
  { table: merchantAdminNotes, policy: merchantAdminNotesPrivacyPolicy },
  { table: merchantChannelOverrides, policy: merchantChannelOverridesPrivacyPolicy },
  { table: merchantDeletionRequests, policy: merchantDeletionRequestsPrivacyPolicy },
];
const dialect = new PgDialect();
for (const { table, policy } of definitions) {
  test(`${getTableConfig(table).name} keeps authentication-only authority in generated metadata`, () => {
    assert.equal(getTableConfig(table).enableRLS, true);
    assert.equal(policy._linkedTable, table);
    assert.equal(policy.for, "all");
    assert.equal(policy.as, "permissive");
    assert.equal(policy.to, "public");
    assert.ok(policy.using); assert.ok(policy.withCheck);
    const read = dialect.sqlToQuery(policy.using);
    const write = dialect.sqlToQuery(policy.withCheck);
    assert.deepEqual(read, write);
    assert.match(read.sql, /has_function_privilege\(session_user, 'public\.fawri_authentication_runtime\(\)'/);
    assert.match(read.sql, /rolcanlogin/);
    assert.match(read.sql, /NOT \(r\.rolsuper OR r\.rolbypassrls OR r\.rolcreaterole\)/);
    assert.doesNotMatch(read.sql, /fawri_tenant_or_audited_admin/);
    assert.deepEqual(read.params, []);
  });
}

test("latest committed schema retains all private management policies", () => {
  const meta = new URL("../../../lib/db/drizzle/meta/", import.meta.url);
  const journal = JSON.parse(fs.readFileSync(new URL("_journal.json", meta), "utf8"));
  const latest = journal.entries.at(-1);
  assert.ok(latest && latest.idx >= 50);
  const snapshot = JSON.parse(fs.readFileSync(new URL(`${String(latest.idx).padStart(4, "0")}_snapshot.json`, meta), "utf8"));
  for (const { table, policy } of definitions) {
    const stored = snapshot.tables[`public.${getTableConfig(table).name}`];
    assert.equal(stored.isRLSEnabled, true);
    const declared = stored.policies[policy.name];
    assert.equal(declared.for, "ALL"); assert.equal(declared.as, "PERMISSIVE");
    assert.deepEqual(declared.to, ["public"]);
    assert.equal(declared.using, dialect.sqlToQuery(policy.using!).sql);
    assert.equal(declared.withCheck, dialect.sqlToQuery(policy.withCheck!).sql);
  }
});
