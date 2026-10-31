# P0 — Provider operator and transport source review (2026-10-18)

## Scope and evidence

Read-only review of committed SQL `0030_audited_verified_receipt_reads.sql`, `0031_audited_receipt_replay_reviews.sql`, and `artifacts/api-server/src/services/superQiSandboxTransport.ts` on PR #550. No hosted SQL writes, deployments, merges or grants.

## Verified source controls

- `0030`: only active, enabled admin accounts with `owner_admin` or `manage_subscriptions` permission may request the bounded receipt listing (1–51 rows). Audit insertion precedes returning results. Payment and request references are represented by at most their last eight characters; `PUBLIC EXECUTE` is revoked.
- `0031`: audited administrative review requires the same role/permission check; verifies a unique existing matching order across bot/SaaS and cashier authorities, plus matching authority, request reference, optional payment reference, and amount. Missing or ambiguous assignments return no row. This function does not grant entitlements or create orders; `PUBLIC EXECUTE` is revoked.
- SuperQi sandbox transport: checkout response must match requested UUID and amount; status lookup checks payment ID; webhook signature uses RSA-SHA256 over payment ID, amount, currency, creation date and status; the provider status is independently retrieved by the billing callback path per existing disposable CI coverage. This is explicitly **sandbox**, not production provider acceptance.

## Remaining verification, not assumed resolved

1. Trace each HTTP administrative route through session identity, permissions, and device/session checks to its SQL capability call. SQL functions receive `p_actor_id`; caller must never trust an actor ID from unvalidated request input.
2. Confirm hosted SECURITY DEFINER function owners and least-privilege EXECUTE grants after applying migrations 0028–0033 to an approved disposable rehearsal branch.
3. Prove RLS isolation using an actual restricted runtime identity; the staging owner has BYPASSRLS and cannot be used for this proof.
4. Review gateway signed payload field coverage and independent status confirmation together, rather than assuming the signature alone authenticates every payload field.
5. Do not equate 25/25 disposable CI success with hosted staging acceptance or provider production readiness.

**P0 NO-GO.**
