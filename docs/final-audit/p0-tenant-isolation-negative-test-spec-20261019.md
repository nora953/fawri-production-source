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

## Verified existing executable coverage inventory — 2026-10-19

A source inspection of the audited branch identified **existing** disposable PostgreSQL integration tests; therefore the opening `SPEC ONLY` label describes the *full matrix*, not the absence of all security tests.

- `artifacts/api-server/tests/merchant-session-restricted-http-postgres.integration.test.mjs` is already in the `tenant` audit suite. It creates two synthetic merchants and a PostgreSQL role with `NOBYPASSRLS`, verifies role identity and broad table grants, checks cookie/device rejection, ensures session listings are merchant-scoped, and checks that merchant A receives HTTP 404 when attempting to revoke merchant B's session while B's session remains usable. It also verifies logout-all leaves B's session active and queries account-session database state. **API-04 has existing CI coverage for these routes**, not a blanket proof for every auth endpoint.
- `artifacts/api-server/tests/support-postgres-cutover.integration.test.ts` is already in the `tenant` suite and exercises support PostgreSQL HTTP cutover. Its precise cross-merchant message-ID negative assertions still need case-by-case inspection; do not mark API-05/API-06 complete solely because the suite is green.
- `artifacts/api-server/tests/cashier-operator-own-history-scope-postgres.integration.test.ts` is in the `cashier` suite and covers own-history staff scoping. It does not by itself establish cross-merchant `cashier_operator_sessions` or `order_items` HTTP authorization.
- `scripts/execute-disposable-postgres-audit.mjs` explicitly includes these test files in the corresponding suites. Code revision `0efbfee20ba997940c4334be6604e40c4faf6d86` passed 41/41 workflows including the isolated PostgreSQL audit [39198982292](https://github.com/nora953/fawri-production-source/actions/runs/39198982292).

**Coverage disposition:** API-04 merchant-session list/revoke/logout-all paths: **EXISTING TEST COVERAGE / CI GREEN**. API-01/02/03/05/06 and remaining RLS matrix: **NOT YET PROVEN BY THIS INVENTORY**. Hosted runtime role H-01 and hosted acceptance H-02–H-06 remain OPEN. Never equate broad-grant synthetic-role test success with proof of the actual Railway runtime identity.

## Confirmed support cross-merchant HTTP negative proofs — 2026-10-19

Inspected `artifacts/api-server/tests/support-postgres-cutover.integration.test.ts` on the audit branch. This test creates a second merchant with a distinct session and confirms: foreign ticket GET returns HTTP 404 and `SUPPORT_TICKET_NOT_FOUND`; foreign attachment GET returns 404; foreign `POST /messages` returns 404 with the `support_messages` row count unchanged; and foreign ticket listing excludes the original merchant's ticket. It also tests revoked admin support permission: 403 and unchanged message count. This file is included in the `tenant` suite of `scripts/execute-disposable-postgres-audit.mjs`, and the isolated audit succeeded for code SHA `0efbfee20ba997940c4334be6604e40c4faf6d86` (run 39198982292).

**Coverage update:** API-05 and API-06 have **EXISTING EXECUTED CROSS-MERCHANT TICKET/MESSAGE-PATH NEGATIVE COVERAGE** (not necessarily a direct message-ID endpoint); API-04 already has session list/revoke/logout coverage. API-01/02 (`order_items`) and API-03 (`cashier_operator_sessions`) still need route-specific source inspection and proof. This finding is a coverage reconciliation, not a newly executed test. H-05 remains OPEN until the remaining matrix is satisfied.
