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

## SEQ-35 — provider transport contract source review

`superQiSandboxTransport.ts:316-367` enforces UUIDv4 request ID and integer IQD amount, sends POST /payment with requestId, amount, currency, notificationUrl and additionalInfo.fawriOrderId, then verifies response requestId/amount/status CREATED/formUrl. There is **no separate idempotency header or proof that provider deduplicates repeated POST by requestId** in this code. Thus stable requestId is necessary but insufficient to assert exactly-once provider creation; sandbox contract/lookup must be verified before automatic retry after timeout. No provider live call executed.

## SEQ-36 — webhook signature and cashier discovery source review

`superQiSandboxTransport.ts:418-446` computes SHA-256 of canonical webhook signing payload and checks RSA-SHA256 against configured public key; this establishes an implemented signature check, not end-to-end security of all routes or live provider trust. `cashierBillingAuthority.ts:1221-1246` has existing discovery by provider checkout ref OR metadata.provider_request_id, rejects multiple matching orders; a committed reserved order with stable request ID would make that path usable for pre-attachment webhook resolution. When order rolled back, discovery cannot succeed. Preserve this discovery and its ambiguity rejection during repair; verify tenant scope and DB policies separately. These are source inspections only, not executed integration tests.

## SEQ-37 and SEQ-38 — incomplete checkout replay and schema verification

Reviewed SaaS billing lines 518-550 and cashier billing lines 498-505, 533-555. Both reject a matching idempotency-key order without provider reference and redirect URL with an incomplete-checkout error. A durable reservation repair must provide a safe resume/reconciliation state for that existing order instead of requiring a new key. The existing immutable-payload comparison should remain.

For concurrent initial requests, SELECT FOR UPDATE on a missing row cannot itself serialize insertion. Verify the actual schema uniqueness constraints and migration compatibility before coding a conflict re-read. Required regression cases: simultaneous same-key checkout, incomplete checkout replay, timeout unknown state, process restart, and conflicting payload. This is source/design review only; schema constraints were not inspected or asserted in this step.

## SEQ-39 — billing event recording preconditions

SaaS `saasBillingAuthority.ts:708-734` inserts into `saas_billing_events` with required order_id and merchant_id supplied by resolved order; no independent verified-event inbox is implemented in this function. Both SaaS (`736-755`) and cashier (`cashierBillingAuthority.ts:969-989`) require provider enabled in current non-production/test environment and `signatureVerified === true` before event application. Preserve these gates when designing any inbox; a new table alone does not prove verification. Actual SQL FK/NOT NULL and RLS policies remain unverified.

## SEQ-40 — environment release boundary

Both provider-event application functions explicitly exclude `superqi_sandbox` when `NODE_ENV === production` (`saasBillingAuthority.ts:741-745`, `cashierBillingAuthority.ts:978-983`). Therefore a sandbox-successful billing regression cannot demonstrate production provider readiness. Production payment integration requires a separately approved provider contract/configuration, security verification and end-to-end settlement evidence; do not remove environment restrictions to make tests pass. Source review only; no live sandbox or production transaction.
