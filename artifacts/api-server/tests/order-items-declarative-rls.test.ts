import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { orderItems } from "@workspace/db/schema";
import { orderItemsTenantPolicy } from "../../../lib/db/src/schema/tenant-security";

test("order line items retain RLS in generated schema metadata", () => {
  assert.equal(getTableConfig(orderItems).name, "order_items");
  assert.equal(getTableConfig(orderItems).enableRLS, true);
});

test("order line item policy retains the established tenant boundary for reads and writes", () => {
  const policy = orderItemsTenantPolicy;
  assert.equal(policy.name, "order_items_tenant_boundary");
  assert.equal(policy.for, "all");
  assert.equal(policy.as, "permissive");
  assert.equal(policy.to, "public");
  assert.equal(policy._linkedTable, orderItems);
  assert.ok(policy.using);
  assert.ok(policy.withCheck);
  const dialect = new PgDialect();
  for (const predicate of [policy.using, policy.withCheck]) {
    const query = dialect.sqlToQuery(predicate!);
    assert.equal(query.sql, 'public.fawri_tenant_or_audited_admin("order_items"."merchant_id")');
    assert.deepEqual(query.params, []);
  }
});

// Read the latest committed snapshot rather than pinning a historical filename:
// a future generated schema must retain the same already-established protection.
test("latest committed schema snapshot preserves order item read and write policy", () => {
  const meta = new URL("../../../lib/db/drizzle/meta/", import.meta.url);
  const journal = JSON.parse(fs.readFileSync(new URL("_journal.json", meta), "utf8"));
  const latest = journal.entries.at(-1);
  assert.ok(latest && latest.idx >= 49);
  const name = `${String(latest.idx).padStart(4, "0")}_snapshot.json`;
  const snapshot = JSON.parse(fs.readFileSync(new URL(name, meta), "utf8"));
  const table = snapshot.tables["public.order_items"];
  assert.equal(table.isRLSEnabled, true);
  const policy = table.policies.order_items_tenant_boundary;
  assert.equal(policy.as, "PERMISSIVE");
  assert.equal(policy.for, "ALL");
  assert.deepEqual(policy.to, ["public"]);
  const dialect = new PgDialect();
  assert.equal(policy.using, dialect.sqlToQuery(orderItemsTenantPolicy.using!).sql);
  assert.equal(policy.withCheck, dialect.sqlToQuery(orderItemsTenantPolicy.withCheck!).sql);
});
