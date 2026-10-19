# P0 tenant isolation — executable test specification (2026-10-19)

**Status: SPEC ONLY / tests not implemented or run.** Hosted Neon is not a test fixture. Never insert, modify, or delete hosted merchant data to validate isolation.

## Confirmed hosted observations

- `account_sessions` has `tenant_id`; `cashier_operator_sessions`, `order_items`, and `support_messages` have `merchant_id`.
- RLS is disabled on these four tables, and `fawri_staging_runtime` has SELECT and DELETE privileges on each.
- `fawri_staging_runtime` also has `BYPASSRLS`, `CREATEDB`, and `CREATEROLE`. Whether Railway uses this role is still unverified because variable values are redacted.

## Isolated PostgreSQL fixture requirements

Use disposable PostgreSQL, all repository migrations, and two synthetic merchants A/B with separate accounts and credentials. No production secrets or live customer data. Create a dedicated `LOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE` runtime role with only required grants; use a separate privileged migration role. Verify role attributes and `current_user` inside test connections. Reset transaction-scoped `fawri.tenant_id`, `fawri.admin_audit_id`, and `fawri.admin_account_id` between cases.

## Test matrix

| Case | Access path | Expected result |
| --- | --- | --- |
| RLS-01 | A reads A-owned RLS-protected record | Allowed |
| RLS-02 | A reads B-owned RLS-protected record | No B record returned |
| RLS-03 | A updates/deletes B-owned RLS-protected record | Zero B rows changed |
| RLS-04 | A inserts record with B merchant ID | Denied by WITH CHECK |
| RLS-05 | No tenant context reads/writes protected record | No rows / denied |
| RLS-06 | Forged or expired admin audit context | Denied |
| RLS-07 | Valid scoped admin audit context | Only authorized merchant scope allowed |
| API-01 | A session requests B `order_items` record by ID | 403/404; no B data |
| API-02 | A session attempts mutation of B `order_items` | Denied; no B rows changed |
| API-03 | A cashier operator session requests B session/shift | Denied; no B data |
| API-04 | A account session accesses B session | Denied; no B data |
| API-05 | A requests B `support_messages` by ID | Denied; no B data |
| API-06 | A attempts mutation of B `support_messages` | Denied; no B rows changed |
| REG-01 | Legitimate A checkout, auth, support, worker flows | Remain functional |

For API cases, discover actual handlers/routes and their expected denial semantics from code before implementing; do not assume a route exists. For RLS cases, use tables actually covered by RLS. Test assertions must check both HTTP response and database state. Prefer deterministic synthetic IDs, rollback/cleanup, and CI job artifacts with redacted diagnostics.

## Release gates

1. Identify exact deployed database role without leaking credentials.
2. Review privileged function execution and admin audit authorization.
3. Implement and pass test matrix in isolated CI.
4. Prepare least-privilege grants and migration reconciliation; request explicit approval before hosted role changes or deployment.

**No hosted changes authorized. P0 remains NO-GO.**
