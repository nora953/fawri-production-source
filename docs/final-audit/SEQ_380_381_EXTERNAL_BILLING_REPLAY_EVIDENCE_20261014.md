# SEQ-380–381 — External checkout rollback and SaaS billing replay evidence (2026-10-14)

**Audit-only reconciliation of previously known failures.** No application repair, no provider network request, no hosted DB mutation, no merge/deploy. Preserve canonical IDs and avoid counting TAP parent nodes as distinct defects.

## Runtime identity and fixture
- Source audit branch: `audit/conversation-notes-reconciliation-20261011`; proof branch SHA `eb239c729b203bbe930e54270cbd39a33373c267` (PR #522 changes only cashier profit redaction and related test, not the billing sources or these tests).
- Disposable PostgreSQL CI: https://github.com/nora953/fawri-production-source/actions/runs/38506114912 ; job `115663896860`; Node v24.21.0. Test files include `billing-external-checkout-rollback-postgres.integration.test.mjs`, `saas-billing-sql-failure-recovery.integration.test.mjs`, `saas-billing-negative-failure-cases.integration.test.mjs`.
- External SuperQi sandbox requests are **entirely replaced by a test-local injected `providerFetch`**, RSA webhook signing uses generated local test keys, and synthetic SQL trigger `P0001` forces rollback. These results do **not** establish live gateway behavior, settlement or duplicate charges.

## SEQ-380: External payment created before local transaction commit
- Test asserts provider call occurs with an open local SQL transaction. A synthetic fault on updating `provider_checkout_ref` rolls back the order.
- Observed for **both SaaS and cashier**: `firstOrderRows=0`, `fakeProviderCreations=2`, `requestIdReused=false`, `orderIdReused=false`, `retryOrderExists=true`, `openTransactionAtProviderCall=true`, `orphanWebhook.status=ignored`, `orphanWebhook.reason=order_not_found`.
- Two leaf assertions fail per domain: (a) durable external identity or same-key request reuse, (b) signed status-confirmed orphan payment durable handling or retryable rejection. TAP overall `0 passed / 7 failed` includes parent failure nodes: **four leaf functional failures** (two distinct invariants × two billing domains), not seven independent defects.
- Canonical issues: `BILLING-EXTERNAL-TX-013` and `BILLING-WEBHOOK-ORPHAN-015` (both already confirmed in ISSUES.md). Source chain previously documented in ISSUES.md: external provider called inside uncommitted transaction; order and provider request IDs regenerated after rollback. Do not create duplicates.

## SEQ-381: SaaS verified payment recovery and same-key race
- `saas-billing-sql-failure-recovery.integration.test.mjs`: `1 passed / 2 failed` TAP including failed parent; actual fault observation `errorCode=P0001`, `state=pending`, `events=0`, `applications=0`, `subscriptions=0`; exact-event retry after removing synthetic trigger succeeds. One failed leaf asserts durable reconciliation evidence after received verified payment. Existing `BILLING-SQL-RECONCILIATION-032`.
- `saas-billing-negative-failure-cases.integration.test.mjs`: `1 passed / 4 failed` TAP including failed parent; three failed leaf scenarios: (1) verified matching payment after proactive expiry is rejected as order not payable (`BILLING-LATE-EXPIRED-027`); (2) distinct mismatched event rewrites paid → `paid_reconciliation_required` (`BILLING-PAID-REPLAY-028`); (3) identical simultaneous checkout callers do not both receive same order (`BILLING-IDEMPOTENCY-012`). Race logs: attempt0 no rejected codes, attempt1 one SQLSTATE `23505`; test stops at attempt1, so **do not claim remaining configured attempts executed**.
- The SQL unique constraint prevented two persisted orders in the observed race, but one caller failed instead of receiving idempotent replay. **No duplicate real charge is proven.** Cashier six-attempt same-key race passed separately (SEQ-379); SaaS failure cannot be generalized to cashier.

## Disposition
- New canonical findings: **0**. Existing findings reconfirmed: `BILLING-EXTERNAL-TX-013`, `BILLING-WEBHOOK-ORPHAN-015`, `BILLING-SQL-RECONCILIATION-032`, `BILLING-LATE-EXPIRED-027`, `BILLING-PAID-REPLAY-028`, `BILLING-IDEMPOTENCY-012`.
- New unique accepted cases: **0** (existing CI test reconfirmation, not novel coverage). Product release **BLOCKED**; whole-audit coverage **NOT_YET_MEASURABLE**.
- Future repair planning only after audit sign-off: persist checkout identity before external side effect or safely recover via provider lookup; make orphan callback retryable/durable; preserve terminal paid states; handle late verified payment; ensure same-key concurrent SaaS callers converge; add durable reconciliation receipts and repeat bounded disposable SQL tests before any sandbox/live proof.
