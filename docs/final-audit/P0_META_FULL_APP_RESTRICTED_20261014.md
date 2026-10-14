# Signed full-app Meta restricted-role acceptance — 2026-10-14

Prepared test; actual PostgreSQL acceptance pending CI. Draft stacked on #546. #535 remains OPEN.

The original app.ts Express application runs in a fresh child process with required operational/subscription PostgreSQL authorities under a non-owner/non-superuser/non-BYPASSRLS role. Real signed loopback HTTP traverses original signature verification, operational mapping, manual-conversation filter and durable encrypted tenant queue. The original live worker is driven through its production runOnce to claim/decrypt/prepare/reserve/send/complete. Only the external Graph transport is an owned local synthetic HTTP provider; embedding is a synthetic configured provider. No real Meta/AI traffic.

Eight bounded cases cover invalid signatures; unknown/disconnected pages; revoked resolver grant; two-tenant ingress/duplicate queue before debit; original live worker once-only debit/send/completion; manual inbound persistence with no automatic reply; expired subscription suppression; tenant read isolation and pool context reset. Original middleware, route, queue and worker are not replaced. The deployment index/bootstrap/automatic scheduler and full production role grant rollout remain separate.

Only guard-attested offline disposable PostgreSQL in existing CI. No hosted database/migrations/grants, external provider traffic, main merge or deploy. Syntax and diff checks passed locally. Existing earlier bounded Meta and lifecycle suites remain intact and their totals overlap this runner.

## First actual-app attempt and repair — 2026-10-14

Source 039fe108d19e30cf92dcbcfa4edf3343329879be, isolated run 38633527935/job 116090836480: signed ingress/routing denials, duplicate queue and pooled isolation passed. Original worker acceptance failed: subscription admission returned MERCHANT_SUBSCRIPTION_REQUIRED; later dependent debit assertions and expired-code assertion failed. Do not count this attempt as accepted. Five of seven workflows succeeded; isolated audit and foundation failed.

Source inspection confirms getCurrentSubscriptionPostgres/reserveMerchantAutoReplyPostgres opened fresh transactions without transaction-local fawri.tenant_id, so a restricted RLS role cannot see the owned seeded subscription. Add explicit transaction-local merchant scope for four already merchant-identified subscription entrypoints (read/reserve/emergency/action), retaining existing SQL locks, once-only ledger checks, policy predicates and rollback. No role grants or RLS bypass. Global list and event-only restore remain separate unresolved authority surfaces and must not be credited by this bounded fix. Actual acceptance of this repair remains pending CI.

Local regression extension: original subscription authority reads both owned active subscriptions under the restricted child role before ingress, verifies initial balance20 and tenant context reset after each read, and confirms naked subscription reads remain0. Final naked-table isolation also covers subscriptions and reply batches. SQL execution NOT_RUN; syntax checks only. Publication retry after user continuation was again rejected by automatic approval review, which requires explicit destination consent rather than a generic continue.

Five local tests of original private transaction functions with an inert query adapter PASS: parameterized tenant context after BEGIN/before work, rollback on work fault, no work after context failure, COMMIT failure propagates/rollback attempted, fresh context on sequential pooled reuse. No actual PostgreSQL or RLS proof credit. User explicitly authorized publication to nora953/fawri-production-source within PR547 and CI on 2026-10-15 Baghdad. Prior rejection history retained; publication/SQL results pending.
