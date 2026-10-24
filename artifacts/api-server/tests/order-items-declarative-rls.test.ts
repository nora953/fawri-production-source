import assert from "node:assert/strict";
import test from "node:test";
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
