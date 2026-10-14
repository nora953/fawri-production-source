# P0 verified provider receipt inbox — prepared 2026-10-14

New branch fix/p0-verified-provider-receipt-inbox-20261014, stacked on draftPR538/441d1016. Last tested parent abe851db had189PASS/0FAIL/0SKIP,26/26 CI SUCCESS; parent documentation CI441d1016 was still finishing at start. No merge/deploy/hosted migration/grants/real provider/payment.

## Admission implementation
SuperQi sandbox webhook validates enabled configuration, RSA signature, terminal status/currency/amount, confirms identical gateway payment state and request identity, then independently commits normalized identity evidence BEFORE local order lookup/attachment/entitlement. Migration0029 adds verified_provider_payment_receipts with no tenant/order guess, raw payload, signature or credential. Provider/event primary key; immutable payment/request/type/amount/hash checked on exact replay; first received time never overwritten. Confirmed unknown order still returns retryable503, but now preserves a receipt. A later restored exact order mapping processes the event with its original receipt time; no entitlement is granted merely because an inbox row exists.

RLS enabled with no merchant policy; direct read/write is denied to a restricted role even if SQL table privileges exist. Narrow SECURITY DEFINER admission function has fixed pg_catalog search_path, qualified table access, bounded identifiers/hash/type/positive amount/finite time, PUBLIC EXECUTE revoked. Returns only the one receipt timestamp. Function owner must be trusted; future verified-ingress runtime EXECUTE grant requires review, never a merchant grant. No grant or migration applied to hosted DB.

## Actual SQL acceptance (NOT_RUN pending CI)
New owned offline suite verifies invalid signatures/status/request mismatches create0receipts; injected receipt SQL failure creates0 before exact retry; SaaS/cashier unmatched confirmed event persists1receipt/0entitlement under concurrent redelivery; changed identity rejected without overwrite; only after exact synthetic mapping restoration concurrent signed gateway-confirmed retry applies1entitlement using first time. Restricted role tests table denial, no PUBLIC function execution, explicit owned capability grant, invalid bounds, collision denial and no enumeration. All fixtures/roles/trigger objects/receipts/accounts/pools cleaned; fake transport only. Original orphan503 test unchanged except cleanup of its new owned receipt. Existing billing/real-wire/tenant/restore proofs mandatory.

## Local validation
API typecheck/build PASS; transport unit tests PASS; MJS syntax/diff PASS. Canonical Drizzle history30migrations generated with deterministic0029snapshot, reviewed SQL hash and preimage stage; no historical schema change. Real SQL runtime NOT_RUN until CI; local Docker/PostgreSQL unavailable.

## Remaining scope
This is durable verified receipt admission and provider-redelivery recovery, not a completed operator inbox API/UI or manual-resolution authorization flow. Operator access/reconciliation/retention and reviewed hosted owner/runtime grant rollout remain under523; full downstream signed restricted-role Meta535 remains separate. SuperQi sandbox is still forbidden in production; do not claim real gateway/live release readiness from fake confirmations.
