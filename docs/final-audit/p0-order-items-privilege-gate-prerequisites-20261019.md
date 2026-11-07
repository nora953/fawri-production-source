# P0 order_items privilege gate execution prerequisites

The opt-in test at `artifacts/api-server/tests/p0-restricted-order-items-privilege.audit.test.ts` was committed on the audit branch. It is NOT yet executed or part of mandatory CI.

Run only with the repository's disposable PostgreSQL attestation and local `fawri_ci` database. Command from api-server workspace: `pnpm exec tsx --test ./tests/p0-restricted-order-items-privilege.audit.test.ts`. The test requires a candidate role `fawri_staging_rls_runtime` present in that disposable database, and the local test owner must be permitted to `SET LOCAL ROLE` to it. The role must be NO BYPASSRLS. The test expects SQLSTATE 42501 for an unscoped SELECT of `public.order_items`. If the role is missing or cannot be assumed, setup fails and must not be reported as an isolation failure or success.

This is a least-privilege contract, not a complete tenant A/B data visibility test. In a design where the role legitimately needs direct `order_items` SELECT, replace the denial expectation with an RLS-backed two-tenant fixture and positive/negative assertions before enabling this as a required gate. Avoid granting unrestricted SELECT merely to make the test pass. Production roles and migrations are unchanged. P0 NO-GO.
