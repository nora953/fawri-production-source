# Checkpoint consolidation plan — 2026-09-23

Before consolidation, all 83 checkpoint tips were preserved in the permanent GitHub archive branch:

`archive/checkpoints-pre-consolidation-2026-09-23`

That archive commit has the current main tree and every unique checkpoint tip as a parent, so deleting redundant checkpoint labels does not lose their commit history.

## Keep — 24 strategic checkpoints

- `checkpoint/arabic-catalog-promotions-final-2026-09-07`
- `checkpoint/bot-multilocation-stock-routing-complete-2026-09-20`
- `checkpoint/branch-prune-workflow-complete-2026-09-23`
- `checkpoint/cashier-arabic-reference`
- `checkpoint/cashier-employees-complete-2026-09-18`
- `checkpoint/cashier-english-reference`
- `checkpoint/cashier-final-verified`
- `checkpoint/cashier-history-arabic-reference`
- `checkpoint/cashier-reports-exports-complete-2026-09-23`
- `checkpoint/cashier-sorani-reference`
- `checkpoint/catalog-editor-final-trilingual-2026-09-07`
- `checkpoint/diverged-branch-archive-plan-complete-2026-09-23`
- `checkpoint/final-release-candidate-green-2026-09-20`
- `checkpoint/inventory-freshness-applicability-complete-2026-09-21`
- `checkpoint/knowledge-retrieval-limit-fail-closed-complete-2026-09-20`
- `checkpoint/location-service-area-resolver-complete-2026-09-19`
- `checkpoint/main-production-readiness-contract-complete-2026-09-20`
- `checkpoint/multi-location-foundation-complete-2026-09-19`
- `checkpoint/online-order-cancellation-compensation-v2-complete-2026-09-19`
- `checkpoint/reports-english-parity-complete-2026-09-23`
- `checkpoint/reports-sorani-parity-complete-2026-09-23`
- `checkpoint/repository-hardening-baseline-2026-09-23`
- `checkpoint/saved-answers-search-conflict-coherence-complete-2026-09-20`
- `checkpoint/training-updated-order-coherence-complete-2026-09-20`

These are retained because they are either:

- language/reference goldens used for visual or terminology comparisons;
- major domain completion anchors;
- release/readiness anchors;
- current repository-hardening milestones.

## Archive then delete — 59 redundant checkpoints

- `checkpoint/aws-kms-production-activation-complete-2026-09-20`
- `checkpoint/bot-location-inventory-cutover-complete-2026-09-19`
- `checkpoint/cashier-central-report-location-language-complete-2026-09-20`
- `checkpoint/cashier-central-report-visual-qa-complete-2026-09-20`
- `checkpoint/cashier-final-reference`
- `checkpoint/cashier-location-binding-2026-09-19`
- `checkpoint/cashier-location-inventory-cutover-complete-2026-09-19`
- `checkpoint/cashier-manual-discount-return-allocation-v2-complete-2026-09-19`
- `checkpoint/cashier-manual-discount-return-pricing-v2-complete-2026-09-19`
- `checkpoint/cashier-offline-report-range-scope-parity-complete-2026-09-19`
- `checkpoint/cashier-one-time-pairing-recovery-complete-2026-09-20`
- `checkpoint/cashier-operation-location-backfill-complete-2026-09-20`
- `checkpoint/cashier-p0-closed-2026-09-09`
- `checkpoint/cashier-p1-scanner-checkout-wip-2026-09-09`
- `checkpoint/cashier-reports-detail-transparency-complete-2026-09-19`
- `checkpoint/cashier-reports-language-parity-complete-2026-09-19`
- `checkpoint/cashier-reports-live-refresh-complete-2026-09-19`
- `checkpoint/cashier-reports-location-authority-complete-2026-09-19`
- `checkpoint/cashier-reports-online-offline-parity-complete-2026-09-19`
- `checkpoint/cashier-reports-server-side-detail-filters-complete-2026-09-19`
- `checkpoint/cashier-station-location-ui-complete-2026-09-20`
- `checkpoint/catalog-before-cashier-ui-restore-20260827`
- `checkpoint/integration-before-service-location-fix-20260903`
- `checkpoint/integration-before-unmerged-recovery-20260901`
- `checkpoint/knowledge-audit-pagination-complete-2026-09-20`
- `checkpoint/learned-answers-management-pagination-complete-2026-09-20`
- `checkpoint/location-delivery-area-migration-fixed-2026-09-20`
- `checkpoint/location-delivery-area-routing-complete-2026-09-19`
- `checkpoint/location-inventory-authority-complete-2026-09-19`
- `checkpoint/location-inventory-foundation-2026-09-19`
- `checkpoint/location-routing-db-adapter-complete-2026-09-19`
- `checkpoint/location-routing-engine-core-complete-2026-09-19`
- `checkpoint/main-integrated-green-2026-09-20`
- `checkpoint/main-post-merge-before-oneshot-cleanup-20260916`
- `checkpoint/main-production-env-contract-2026-09-20`
- `checkpoint/main-production-readiness-contract-2026-09-20`
- `checkpoint/main-release-docs-synced-2026-09-20`
- `checkpoint/merchant-inventory-freshness-policy-complete-2026-09-20`
- `checkpoint/multi-location-inventory-foundation-2026-09-19`
- `checkpoint/online-order-atomic-commit-complete-2026-09-19`
- `checkpoint/online-order-cancellation-compensation-complete-2026-09-19`
- `checkpoint/online-order-fulfillment-planner-complete-2026-09-19`
- `checkpoint/online-order-location-routing-complete-2026-09-19`
- `checkpoint/pre-main-integration-20260915`
- `checkpoint/pre-main-ready-20260916`
- `checkpoint/reports-hub-online-combined-complete-2026-09-21`
- `checkpoint/saved-answers-category-authority-complete-2026-09-19`
- `checkpoint/saved-answers-category-type-hardening-complete-2026-09-19`
- `checkpoint/saved-answers-duplicate-create-ux-complete-2026-09-19`
- `checkpoint/saved-answers-duplicate-edit-ux-complete-2026-09-20`
- `checkpoint/saved-answers-management-pagination-complete-2026-09-20`
- `checkpoint/saved-answers-server-search-complete-2026-09-20`
- `checkpoint/saved-answers-with-cashier-refund-pricing-v2-complete-2026-09-19`
- `checkpoint/service-area-resolver-complete-2026-09-19`
- `checkpoint/training-approved-answer-revocation-complete-2026-09-20`
- `checkpoint/training-conflict-draft-preservation-complete-2026-09-20`
- `checkpoint/training-filter-mutation-coherence-complete-2026-09-20`
- `checkpoint/training-filter-mutation-race-guard-complete-2026-09-20`
- `checkpoint/training-management-pagination-search-complete-2026-09-20`

The pruned labels are intermediate implementation checkpoints, duplicate tips, superseded milestones, or older integration waypoints. Their histories remain reachable from the permanent archive branch above and from the normal Git history where applicable.

The deletion helper is dry-run by default and creates an additional local verified Git bundle before allowing `RUN_DELETE=1`.
