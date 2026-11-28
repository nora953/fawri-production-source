# R-OWN-5 — held first-commercial 0053 operator issuer grants (not deployed)

**Date:** 2026-11-09. **Tested exact source:** [aa3a62b0d01f01584c1a9af3add6454d93553a78](https://github.com/nora953/fawri-production-source/commit/aa3a62b0d01f01584c1a9af3add6454d93553a78).

## What is now source-proven

- Committed the narrow **source-only** held GRANT artifact `lib/db/first-commercial/held/0053_receipt_manual_case_operator_grants.sql`. It addresses **only** `fawri_operator_issuer` and grants schema usage plus EXECUTE for five case functions: unmatched receipt case intake, escalation, restricted case list, restricted history and independent dispute second-review. No grant for direct SELECT/INSERT/UPDATE/DELETE on any case/event/receipt/billing table, role membership, refund or entitlement function.
- [Exact disposable PostgreSQL18 job #42684077867](https://github.com/nora953/fawri-production-source/actions/runs/42684077867), job **129386075155**, **COMPLETED SUCCESS**. CI log marker **`P0_RECEIPT_CASE_HELD_EXACT_OPERATOR_GRANTS_PG18_PASS`**. Same run also passed independent two-admin SQL+mounted HTTP, audited queue/history, immutable case and restricted-user no-entitlement markers.
- Source test `scripts/tests/p0-held-receipt-manual-case-pg18.mjs` checks the *complete executable statement list* against the exact six allowlisted GRANT statements. Any extra or widened line fails closed. In **fresh local PG18 only**, it creates the intended real LOGIN name `fawri_operator_issuer` with `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION`, executes the held GRANT file, reconnects as that role and verifies the exact identity and five EXECUTE capabilities.
- The test denied direct SELECT/INSERT/UPDATE/DELETE privileges on `verified_provider_payment_receipts`, `verified_receipt_manual_cases`, `verified_receipt_manual_case_events`, `saas_billing_orders` and `cashier_billing_orders`; denied CREATE on public schema and direct case table SELECT; an invalid forged actor+session call failed as SQLSTATE `42501`. Only the security-definer case functions can be invoked and they still independently require real active admin/session/device authorization.
- `.github/workflows/p0-receipt-manual-case-held-pg18.yml` watches both held `0053` SQL and held grant file, plus the case service/router/test paths. The canonical 53-stage Drizzle source and journal are untouched. NO hosted connection string was used.

The earlier independent second-review acceptance remains [documented here](./P0-R-OWN5-INDEPENDENT-DISPUTE-SECOND-REVIEW-20261109.md). This milestone proves **restricted source privilege shaping only**, not commercial readiness.

## Still-open launch gates

1. **FT-01/0052 dependency**: approve the separate first-commercial PostgreSQL18 non-superuser 0052 source/journal/role/bootstrap and verify a recoverable new target.
2. **0053 first-commercial adoption**: obtain a separately reviewed full held 0053 migration/journal/role/source-manifest and approved backup/rollback/admission; prove the *real* `fawri_operator_issuer` identity, exact grants, no inherited privilege and full SQL+HTTP on the authorized hosted target. The local role created in this test is **not** hosted role provisioning.
3. **True provider settlement**: obtain independently verified provider transaction/dispute evidence and strictly separated final financial disposition. The second human review now recorded is **not** provider confirmation or payment settlement. No refund or entitlement transition exists.
4. **Operations and retention**: named operator case owner, escalation SLA, written/provider-accepted manual disposition and legally appropriate retention/deletion need explicit acceptance.

**State:** `P0-RECEIPT-OWNERSHIP-POLICY` and `R-OWN-5` OPEN; PR #550 DRAFT; NO-GO. Original known source register 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED (64.4% known-row fraction only). No original row closed, overall P0% uncertified. No Neon/Railway SQL, merge, release or production financial action.
