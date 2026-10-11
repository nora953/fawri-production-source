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

## SEQ-34 — webhook/event schema interaction review

Read webhook application code in both billing authorities. SaaS `saasBillingAuthority.ts:770-793` takes advisory transaction lock by provider/event ID, checks `saas_billing_events` for duplicate, and loads the order; missing order fails 404 **before** an event can be durably recorded. Cashier `cashierBillingAuthority.ts:1000-1009` first discovers tenant by selecting `cashier_billing_orders` using supplied order ID, and fails 404 when the order was rolled back; only afterward `withMerchantOperationalTransaction` at 1011-1043 locks and deduplicates `cashier_billing_events`. Thus the proposed orphan inbox must be independent of the presence of a billing order while preserving verified-signature gating, tenant discovery/authorization, provider event uniqueness and no premature entitlement. Cashier event insertion occurs after order resolution (`cashierBillingAuthority.ts:1048-1065`).

**Design constraint:** a verified orphan cannot simply be inserted into the existing tenant-scoped order-linked event table without first checking actual schema FK/NOT NULL/RLS constraints. Investigate migrations and design a restricted, independently durable verified-provider-event inbox (or equivalent) with global provider event dedupe, provider/merchant resolution, retention, bounded retry and audit trail. Do not bypass RLS or accept unverified webhook data as payment proof. This source review does not establish the table schema, transport signature implementation or hosted grants; those remain next checks. No code/test changes.
