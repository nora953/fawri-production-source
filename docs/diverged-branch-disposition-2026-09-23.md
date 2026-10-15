# Diverged branch disposition — 2026-09-23

Baseline main: `8c80adf8f8b0d42f9705c7914cc3acf3a6f690c3`.

After pruning fully merged working branches, the remote contains 102 branches:

- 82 `checkpoint/*` branches
- `main`
- 19 diverged non-checkpoint branches

## Keep

- `feature/whatsapp-offline-foundation` — future dormant/offline WhatsApp work. It is far behind current main and must not be merged directly; recover needed work onto a fresh current-main branch when this product area resumes.

## Archive then delete

The following 18 branches are historical/superseded or QA-only. Their remaining unique commits must be preserved in a verified Git bundle before deletion:

- `docs/staging-env-contract-2026-09-20` — `.env.staging.example` was recovered onto current main during repository hardening.
- `parallel/aws-kms-production-activation` — superseded by the recovered AWS KMS production-activation lane already integrated and checkpointed.
- `parallel/bot-multilocation-stock-routing` — superseded by the recovered multi-location bot stock-routing lane already integrated and checkpointed.
- `parallel/cashier-location-binding` — superseded by the later cashier location/inventory cutover and current canonical location authorities.
- `parallel/cashier-location-inventory-cutover` — superseded by the later v2/current-main cutover implementation.
- `parallel/cashier-manual-discount-return-pricing-v2` — current main already contains `CASHIER_REFUND_PRICING_VERSION = 2` and remaining-value refund logic.
- `parallel/catalog-card-details-modal` — current main already contains the catalog Details dialog/modal implementation.
- `parallel/location-inventory-foundation` — current main contains the canonical PostgreSQL location inventory authority and later migrations.
- `parallel/offline-cashier-inventory-reconciliation` — despite the historical name, its unique commits are the old online-order planner/commit/cancellation stack; current main contains newer fulfillment planner/commit authorities.
- `parallel/online-order-atomic-commit` — superseded by current `postgresOnlineOrderFulfillmentCommit.ts`.
- `parallel/online-order-cancellation-compensation` — current fulfillment commit authority contains idempotent cancellation inventory release.
- `parallel/online-order-location-routing` — superseded by current fulfillment planner and location service-area resolver.
- `parallel/quality-observability` — historical integration lane explicitly marked “do not merge”; current main contains mounted observability, backup/restore tooling, and the integrated quality/security gates.
- `parallel/saved-answer-conflict-code-authority` — incomplete historical conflict-code variant; current main has the canonical knowledge conflict handling and version-conflict API contract.
- `parallel/saved-answers-pagination-authority` — current main contains cursor pagination, search, validation, and management pagination.
- `parallel/service-area-resolver` — superseded by `postgresLocationServiceAreaResolver.ts`.
- `qa/architecture-regression-2026-09-20` — QA-only PR explicitly marked not for merge.
- `qa/0021-merchant-inventory-freshness-candidate` — QA-only migration candidate explicitly marked not for merge.

## Safety rule

These branches are not merged because their tips diverge from current main and several contain older versions of code that has since been recovered or redesigned. Deletion is allowed only after the archive script creates and verifies a bundle containing every listed existing ref.
