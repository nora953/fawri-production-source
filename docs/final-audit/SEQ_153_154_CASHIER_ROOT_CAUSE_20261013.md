# SEQ-153–154 — Root-cause source reconciliation (2026-10-13)

Mode: **read-only code + previous actual CI evidence**. No new test execution; no application fixes.

## SEQ-153 — Cashier native IndexedDB duplicate operation payload

- Prior Chrome154 native IndexedDB [run 38334277568](https://github.com/nora953/fawri-production-source/actions/runs/38334277568), job 115090860081: 3 PASS / 1 FAIL. Changed quantity with same operation ID was returned accepted:true,quantity:1 instead of rejecting.
- `artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts` lines 550–567 `replayCommittedOperation` looks up sale by unique `operation_id`, fetches movements/outbox and returns original snapshot. `commitSale` lines 574–626 validates the incoming lines, then **returns replay immediately when same ID exists without comparing new input to committed payload**.
- Distinguish: this does **not** prove stock was decremented twice; original stock race and pending outbox tests passed. It does prove idempotency key conflict does not reject semantically changed sale request. Canonical candidate `CASHIER-IDB-IDEMPOTENCY-001`, HIGH candidate subject to downstream contract review.

## SEQ-154 — Cashier SQL fault and payment event rollback

- Prior isolated [run 38334277549](https://github.com/nora953/fawri-production-source/actions/runs/38334277549), job 115090747650: `CASHIER_SQL_FAULT_STATE` errorCode P0001, state pending, eventCount 0, applicationCount 0, subscriptionCount 0; test expects `paid_reconciliation_required` and one durable event.
- `artifacts/api-server/tests/cashier-billing-negative-failure-cases.integration.test.mjs` lines 79–101 creates a synthetic BEFORE INSERT trigger raising SQL P0001 on `cashier_entitlement_applications`, then checks recovery.
- `artifacts/api-server/src/services/cashierBillingAuthority.ts` lines 969–1210: verified event is processed within `withMerchantOperationalTransaction`. The paid application path calls `applyPaidOrder` and catches **only** `CashierBillingAuthorityError` to record reconciliation; generic PostgreSQL P0001 is rethrown, causing the encompassing transaction to roll back both order state and event record. This directly explains the test observation.
- Canonical candidate `CASHIER-BILLING-SQL-RECOVERY-001`, HIGH candidate for **durable acknowledgement of provider-confirmed payment on DB application failure**. Important boundary: test uses synthetic payment and synthetic SQL fault; no evidence that a real payment was lost, nor that provider retry cannot later apply it. The test explicitly checks exact retry after removing the trigger; inspect full subtest results before asserting that retry succeeded.

## Follow-up

Review backend payment ingress retries and persistence guarantees, and the cashier local sync replay/dedupe contract. Perform additional isolated test cases only in disposable environments. Keep release BLOCKED; estimate ~54% audited/46% remaining until scoped coverage is reconciled. No code repair or release plan before comprehensive audit completion.
