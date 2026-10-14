# SEQ-379 — Cashier billing negative-path evidence reconciliation (2026-10-14)

**Audit only; no application code edits, no DB or provider outside disposable fixture, no merge/deploy.** Correlates existing canonical findings, without creating duplicate issue IDs or treating nested TAP parents as unique functional defects.

## Evidence identity
- Audit branch source test: `artifacts/api-server/tests/cashier-billing-negative-failure-cases.integration.test.mjs` (guarded by `assertDisposablePostgres()` before database import).
- Independent CI execution: https://github.com/nora953/fawri-production-source/actions/runs/38506114912 ; job `115663896860`, proof branch SHA `eb239c729b203bbe930e54270cbd39a33373c267`; relevant cashier billing source/test not changed by proof PR #522; Node24.21.0, fake provider `test_fake`, disposable PostgreSQL with verified role/DB/loopback/marker.
- Test-file TAP aggregate: `passed=2, failed=4, skipped=0, exit=1` **including one failed parent**; underlying five subtests: **2 passed, 3 failed**. Do not count failed parent as a fourth product defect.

## Five distinct observed assertions
| Case | Observed | Result / existing canonical mapping |
|---|---|---|
| Verified matching payment after proactive order expiry | `CASHIER_BILLING_ORDER_NOT_PAYABLE` thrown, not durable `paid_reconciliation_required` | FAIL; `BILLING-LATE-EXPIRED-027` (cashier scope already documented in ISSUES.md) |
| Mismatched new event after previously applied payment | Durable order status changed `applied` → `paid_reconciliation_required` despite expected immutable terminal `applied` | FAIL; `BILLING-PAID-REPLAY-028` (cashier scope already documented) |
| Six independent simultaneous same-key cashier checkout attempts | `CASHIER_CHECKOUT_RACE` attempts 0–5 all `rejectedCodes:[]`; subtest PASS, same order identity and unique durable order asserted | PASS in this bounded fake-provider SQL fixture; **does not close SaaS race** `BILLING-IDEMPOTENCY-012`, nor prove production concurrency under real provider |
| Shared provider payment reference across two concurrent merchants | One entitlement applied; second rejected `CASHIER_BILLING_PAYMENT_REPLAY`; subtest PASS with one application | PASS in bounded SQL fixture; not a live gateway callback/tenant penetration test |
| Injected SQL P0001 during entitlement application after verified payment | `CASHIER_SQL_FAULT_STATE`: `state=pending`, `eventCount=0`, `applicationCount=0`, `subscriptionCount=0`. Exact retry after removing fault and duplicate replay passed later assertions, but durable reconciliation evidence assertion failed | FAIL; `BILLING-SQL-RECONCILIATION-032` / `CASHIER-BILLING-SQL-RECOVERY-001` alias, existing scope |

## Interpretation and next proof
- The **cashier** same-key concurrency path passed all six fixture attempts; do not generalize the **SaaS** same-key race failure to cashier.
- SQL trigger failure shows atomic rollback plus successful controlled retry after removing fault; **not** a real paid transaction loss. Missing durable receipt/reconciliation work remains a recovery risk when callback retries are exhausted.
- Three functional failures are already mapped to canonical findings. No new issue or severity escalation from these results alone.
- Later, after audit and approved repair plan, require provider-independent durable receipt, terminal-state invariants, late-payment reconciliation, replay/idempotency and staging gateway callback semantics; no repair in this phase.

## Coverage and status
- Five subtests actually executed in this file: 2 bounded PASS / 3 FAIL; **not five new cases** because prior CI already exercised this file.
- New unique accepted cases: 0; new canonical findings: 0; release: BLOCKED; overall audit percentage: NOT_YET_MEASURABLE.
