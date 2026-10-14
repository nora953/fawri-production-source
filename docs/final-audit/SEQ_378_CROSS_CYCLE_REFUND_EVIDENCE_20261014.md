# SEQ-378 — Cross-cycle reply refund SQL failure: source and runtime reconciliation (2026-10-14)

**Audit and evidence only. No application repair, schema change, hosted database write, merge or deployment.** This is a reclassification/root-cause inspection of a previously recorded canonical finding, **not a new issue or new accepted test case**.

## Proven execution
- Audit source branch: `audit/conversation-notes-reconciliation-20261011`, checkpoint `7c81aeccf79c479eecbd900dc533ba70128a8135`.
- Independently run on disposable proof branch `fix/p0-cashier-profit-audit-proof-20261014` at `eb239c729b203bbe930e54270cbd39a33373c267` (the relevant reply-refund source/test were not changed by PR #522).
- Workflow: https://github.com/nora953/fawri-production-source/actions/runs/38506114912 ; job `115663896860`; `tenant` batch; Node v24.21.0; guarded disposable PostgreSQL (identity checks database/role/loopback/marker all true); test `artifacts/api-server/tests/reply-cross-cycle-refund-postgres.integration.test.mjs`.
- TAP: `exit=1, passed=0, failed=1, skipped=0, summaryComplete=true`. Assertion at test line 38: **actual 0, expected 1**.
- Synthetic test sequence: activate Silver 2026-08-11; reserve old reply 2026-08-11; renew Silver 2026-09-12; reserve new reply 2026-09-12; assert new cycle `base_replies_used=1`, `base_replies_remaining=3999`; refund old event 2026-09-12.
- Actual sanitized log: `refund.refunded=true`, `beforeUsed=1`, `afterUsed=0`, `beforeRemaining=3999`, `afterRemaining=4000`. No customer data or live provider interaction.

## Source-level cause boundary
- `artifacts/api-server/src/services/merchantReplyRefundAuthority.ts` delegates to `restoreMerchantAutoReplyPostgres` when PostgreSQL authority is required.
- `artifacts/api-server/src/services/postgresSubscriptionEntitlement.ts` `readEventLedger` resolves old event's debit by `external_event_id` and correctly checks for prior credit; `restoreMerchantAutoReplyPostgres` then locks the **subscription row identified by that debit**.
- In the base-reply path (`debit.reply_batch_id` absent), the function checks only `row.base_replies_used > 0` before `UPDATE subscriptions SET base_replies_used = base_replies_used - 1, base_replies_remaining = base_replies_remaining + 1`. It does **not** verify that the row's current `starts_at`/cycle matches the old debit's accounting period. The renewal can retain the same subscription ID, so ID equality is insufficient for cycle isolation.
- Result: late credit against an old event decrements **new-cycle** base usage while its new debit remains in the ledger. This is an **accounting integrity bug reproduced under synthetic SQL**, not evidence of a real customer balance incident.

## Canonical issue and proof gaps
- **Existing ID `REPLY-RESTORE-CYCLE-018`** in `ISSUES.md`, already confirmed and described at SEQ-11. Do not duplicate or falsely close.
- Severity: financial/entitlement integrity, high-priority triage; affected scope is one merchant's renewal cycle; no cross-tenant access or production impact proven.
- Needed after comprehensive audit and approved repair plan: define late historical refund policy; bind base debit to immutable cycle identity, prevent old-cycle refund from mutating new-cycle counters, preserve idempotent credits, verify concurrent refunds and add-on batches, then rerun disposable SQL and later appropriate staging acceptance. No repair is authorized in this checkpoint.

## Coverage accounting
- New unique accepted cases: **0** (reconfirmation of existing failed test).
- New canonical defects: **0** (existing `REPLY-RESTORE-CYCLE-018`).
- Whole-audit coverage: **NOT_YET_MEASURABLE**. Release: **BLOCKED**.
