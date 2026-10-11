# SEQ-33 — Payment checkout repair design (proposal only)

Scope: SaaS and cashier; existing findings BILLING-EXTERNAL-TX-013 / BILLING-WEBHOOK-ORPHAN-015. No application changes or new test execution.

## Verified baseline
- SaaS: `saasBillingAuthority.ts:509,595-605,628-653` inserts order and invokes external provider before transaction commit.
- Cashier: `cashierBillingAuthority.ts:489,596-605,639-664`; wrapper `operationalPostgresAuthority.ts:68-105` confirms BEGIN, transaction-local tenant context, COMMIT after callback.
- Synthetic isolated CI 38180374172 demonstrates rollback loses order/request identity and fake provider retry creates another payment. No actual charges established.

## Proposed repair sequence (subject to approval)
1. Reserve immutable order and stable provider request ID in a short tenant-authorized SQL transaction. Commit before network call. Unique idempotency key, re-read winner on concurrent conflict, reject changed payload.
2. Dispatch provider request outside DB transaction with a leased/fenced claim. Treat timeout as unknown, not safe-to-retry; first reconcile provider outcome. Never assume provider idempotency without checking its sandbox contract.
3. Attach provider reference/redirect URL in a second short tenant-scoped transaction. SQL failure must retain the original durable reservation and request ID.
4. Verify and durably store webhook receipt before entitlement mutation. If order not yet attached, queue verified orphan for bounded retry and operator escalation; reject invalid signature, amount, tenant or provider mismatch.
5. Apply settlement and entitlement once, atomically, protect paid/refunded terminal state and record reconciliation trail.

## Required acceptance tests
- SaaS and cashier: same key across SQL fault, crash and concurrent retries retains one order/request ID; conflicting payload returns conflict.
- No remote call inside open transaction; cashier `fawri.tenant_id` and cross-tenant restrictions preserved.
- Provider success followed by attachment failure; webhook before attachment; duplicate/late/mismatched webhook; expiry and provider timeout; commit failure and restart recovery.
- Subscription renewal/refund cycles, proration, scheduled seat release and 7-day cashier offline grace regressions.
- Node22, restricted PostgreSQL role and synthetic provider tests. Real sandbox idempotency and settlement remain separate external proof.

## Before implementation
Review current migrations, unique indexes, webhook/event storage and provider lookup/idempotency API. Plan additive backward-compatible migration, feature gate and safe rollback. Do not blindly retry payments after unknown provider outcome. Do not merge/deploy or change payment logic without approval. Track run IDs and evidence in `docs/final-audit/`.
