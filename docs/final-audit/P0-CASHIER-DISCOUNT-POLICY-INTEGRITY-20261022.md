# P0 cashier discount policy integrity diagnostic — 2026-10-22

## Accepted prerequisite

Executable645b534aea0d32848b4467b5bbebf8fd671deddb is now accepted:47/47 parent workflows SUCCESS;82/82 clean native invocations/80 unique files. Non-row admission proof174 direct protected-table grant cases plus20 role/column cases PASS; Foundation/schema/quality/security PASS (0 high/0 critical/2 moderate), no failures/retries. [Exact acceptance](evidence/P0-CASHIER-NONROW-PRIVILEGE-ACCEPTANCE-20261022.json). Checkpoint reports are documentation only; these results do not certify the new diagnostic.

## New bounded proof prepared

New actual-LOGIN diagnostic: artifacts/api-server/tests/cashier-discount-policy-integrity-postgres.integration.test.mjs, registered in isolated audit boundary. Local node --check PASS; actual runtime result PENDING.

Two merchants each have a cashier with sale.discount, enabled amount limit100, and a manager with separate role/permission/policy. Synthetic trusted cashier context requests discount250 on total1000 with no approval. The real assertCashierOperatorManualDiscountAuthority must initially refuse both merchants with CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED.

Primary merchant-scoped UPDATE then attempts to raise only merchant A's cashier limit to300. It records whether the SQL mutation is accepted or denied42501, readiness response, and the same real validator's decision on an unchanged request with no approval. This is a diagnostic, so a green run can report an authority gap; it does not falsely certify denial. No HTTP route, complete sale, entitlement or PIN approval is executed.

A finally block restores exact original policy fields/version/timestamps through trusted auth; PostgreSQL timestamp text retains microseconds. Snapshots check other merchant and staff/permission/PIN/session/approval state unchanged; after restoration the validator must again demand manager approval. Fixture data/grants exist only in owned network-none PostgreSQL on GitHub Actions; no hosted mutation.

## Exact continuation

Read P0_CASHIER_DISCOUNT_POLICY_INTEGRITY_BASELINE and complete AUDIT_SUITE_RESULT summaries on the final new test source, preserving source tree/checkout/run/job/observations. Check status once; if pending, preserve and continue independent source work without polling. If a concrete mutation+validator bypass is proven, add discount-policy mutation authority restriction while retaining primary scoped reads and trusted-auth writers, table/column/direct/PUBLIC/inherit/SET/unreachable proofs, authenticated HTTP version/role/rollback tests and issue/consume concurrency. Adapt the older own-policy primary write positive to auth-positive/primary-denial while retaining attribution writes.

[Prior nine-file source trace](P0-CASHIER-DISCOUNT-POLICY-MUTATION-TRACE-20261022.md) remains an exact historical source hypothesis. This new test has not yet proven a bypass or a safe outcome. Release NO-GO; whole-P0 percentage UNMEASURED. Complete same-tenant/alternate-path/auth/privacy/offline/grace/sync/retention/provider/storage/P0 inventory remains OPEN. GitHub/Actions only; no external connector, hosted change, deployment, main push, merge, credentials or P1/P2.
