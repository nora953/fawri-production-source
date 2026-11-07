import assert from "node:assert/strict";
import test from "node:test";
import { assertDisposablePostgres } from "../../../scripts/lib/disposable-postgres-test-guard.mjs";

// Opt-in P0 security gate. Run only against the attested network-none fawri_ci database.
// It intentionally fails if the candidate restricted role can read unprotected order items.
// Do not enable as a required CI gate until the intended least-privilege grants are reconciled.
const enabled = process.env.FAWRI_P0_RESTRICTED_ORDER_ITEMS_AUDIT === "1";

test("P0 restricted role must not read unscoped order items", { skip: !enabled && "requires explicit isolated PostgreSQL audit opt-in" }, async () => {
  await assertDisposablePostgres();
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const identity = await client.query("SELECT current_database() AS database, current_user AS role");
    assert.equal(identity.rows[0].database, "fawri_ci");
    assert.equal(identity.rows[0].role, "fawri_ci");
    // Explicit setup checks distinguish missing fixtures from an authorization failure.
    const candidate = await client.query(
      "SELECT oid, rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = $1",
      ["fawri_staging_rls_runtime"],
    );
    assert.equal(candidate.rowCount, 1, "SETUP BLOCKED: candidate restricted role is missing");
    assert.equal(candidate.rows[0].rolbypassrls, false, "SETUP BLOCKED: candidate role bypasses RLS");
    const membership = await client.query(
      "SELECT pg_has_role(current_user, $1, 'SET') AS can_assume",
      ["fawri_staging_rls_runtime"],
    );
    assert.equal(membership.rows[0].can_assume, true, "SETUP BLOCKED: local runner cannot assume candidate role");
    // SET LOCAL ROLE is transaction-local and does not change grants.
    await client.query("SET LOCAL ROLE fawri_staging_rls_runtime");
    const role = await client.query(
      "SELECT current_user AS role, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user",
    );
    assert.equal(role.rows[0].role, "fawri_staging_rls_runtime");
    assert.equal(role.rows[0].bypass, false);
    const session = await client.query("SELECT session_user AS login_role");
    assert.equal(session.rows[0].login_role, "fawri_ci");
    // This SET ROLE probe is NOT runtime-login attestation: session_user stays fawri_ci.
    const table = await client.query(
      "SELECT relrowsecurity AS rls_enabled FROM pg_class WHERE oid = 'public.order_items'::regclass",
    );
    assert.equal(table.rowCount, 1, "SETUP BLOCKED: order_items table missing");
    assert.equal(table.rows[0].rls_enabled, true, "P0: order_items RLS must be enabled");
    // With no tenant context, a policy-protected table must return no rows.
    // A permission-denied result is also safe if SELECT is intentionally revoked.
    let denied = false;
    try {
      const rows = await client.query("SELECT id FROM public.order_items LIMIT 1");
      denied = rows.rowCount === 0;
    } catch (error) {
      denied = error?.code === "42501";
      if (!denied) throw error;
    }
    assert.equal(denied, true, "P0: restricted role can read unscoped order items");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
});
