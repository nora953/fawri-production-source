# P0 — Unmatched verified payment receipt: accepted evidence and release gates (2026-10-18)

## Verified baseline

- Draft PR #550, commit `7d989bf1057ac8e9534e09f965fe65919603c632`: **25/25 GitHub Actions workflows SUCCESS**, including disposable PostgreSQL engineering audit and final security/supply-chain. This is branch CI evidence, not hosted acceptance.
- Disposable restricted-role integration `artifacts/api-server/tests/billing-provider-discovery-restricted-postgres.integration.test.mjs` exercises both SaaS and cashier signed verified callbacks without a matching provider order, preserves one verified receipt with its original first-received time, observes no subscription/entitlement application and no naked cross-tenant reads. It then tests later mapping and the existing race/identity matrix. This is NOT proof of a deployed orphan-repair workflow.
- `lib/db/drizzle/0029_verified_provider_payment_receipts.sql`: durable verified receipt admission, not merchant-wide table access.
- `lib/db/drizzle/0030_audited_verified_receipt_reads.sql`: audited bounded admin listing, masked payment/request suffixes, active enabled admin and permission gate.
- `lib/db/drizzle/0031_audited_receipt_replay_reviews.sql` and `0032_authorized_receipt_replay_execution.sql`: privileged review/replay for an **existing matching order**; not ownership assignment for an absent order.
- `lib/db/drizzle/0033_confirmed_provider_order_resolution.sql`: exact verified receipt identity, amount and request reference validation; unique SaaS/cashier order match; returns **zero rows** when none exists. Never infer merchant from a naked provider reference.

## Outstanding P0 product/security decisions — do not implement speculative recovery

1. **Ownership evidence:** define which independently authenticated provider/checkout records can prove a merchant and subscription authority when no order exists; require matching amount/currency/provider identity and immutable audit chain. If proof is unavailable or ambiguous, retain for manual investigation without entitlement.
2. **Operator recovery authorization:** define admin permission, active session/trusted-device checks, dual control if appropriate, audit reason, immutable receipt identity, idempotency key, and concurrency guard; never grant direct merchant receipt reads or broad PUBLIC EXECUTE.
3. **Financial retention/deletion:** agree retention period, lawful deletion policy, access logging, privileged purge authorization, and backup handling before shipping cleanup.
4. **Hosted acceptance:** inspect actual Railway runtime DB role and schema owner, RLS/FORCE-RLS and grants; plan migrations 0028–0033 on an approved staging clone; run hosted restricted-role acceptance. Disposable green CI is insufficient. Do not deploy, migrate, grant, merge or change hosted data without approval.

## Next verification

- Read-only compare hosted capability inventory against migrations 0028–0033 and runtime role, when authorized access is available.
- Once ownership policy is approved, add disposable PostgreSQL tests for no-match, ambiguous ownership, mismatched amount, replay and concurrent operator assignment; implement only the minimum reviewed backend capability.
- Issue #523 and #535 remain open. **P0 NO-GO.**

Evidence: https://github.com/nora953/fawri-production-source/pull/550#issuecomment-6243535299 and https://github.com/nora953/fawri-production-source/pull/550#issuecomment-6243549270.
