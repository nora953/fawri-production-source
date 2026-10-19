import assert from "node:assert/strict";
import test from "node:test";
import { assertDisposablePostgres } from "../../../scripts/lib/disposable-postgres-test-guard.mjs";

// Opt-in P0 security gate. Run only against the attested network-none fawri_ci database.
// It intentionally fails if the candidate restricted role can read unprotected order items.
// Do not enable as a required CI gate until the intended least-privilege grants are reconciled.
test("P0 restricted role must not read unscoped order items", async () => {
  await assertDisposablePostgres();
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const identity = await client.query("SELECT current_database() AS database, current_user AS role");
    assert.equal(identity.rows[0].database, "fawri_ci");
    assert.equal(identity.rows[0].role, "fawri_ci");
    // SET LOCAL ROLE applies only inside this read-only transaction; no grants are changed.
    await client.query("SET LOCAL ROLE fawri_staging_rls_runtime");
    const role = await client.query(
      "SELECT current_user AS role, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user",
    );
    assert.equal(role.rows[0].role, "fawri_staging_rls_runtime");
    assert.equal(role.rows[0].bypass, false);
    // A restricted tenant role should not have unscoped table-wide SELECT.
    // An authorization failure is the expected secure result.
    let denied = false;
    try {
      await client.query("SELECT id FROM public.order_items LIMIT 1");
    } catch (error) {
      denied = error?.code === "42501";
      if (!denied) throw error;
    }
    assert.equal(denied, true, "P0: restricted role has unrestricted SELECT on order_items");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});
