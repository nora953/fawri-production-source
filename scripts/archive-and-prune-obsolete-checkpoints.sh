#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
git fetch origin --prune

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_DIR="${BRANCH_ARCHIVE_DIR:-branch-archives}"
mkdir -p "$ARCHIVE_DIR"

REPORT="$ARCHIVE_DIR/checkpoints-prune-$STAMP.txt"
BUNDLE="$ARCHIVE_DIR/checkpoints-prune-$STAMP.bundle"
DELETE_SCRIPT="$ARCHIVE_DIR/delete-checkpoints-prune-$STAMP.sh"

BRANCHES=(
  "checkpoint/aws-kms-production-activation-complete-2026-09-20"
  "checkpoint/bot-location-inventory-cutover-complete-2026-09-19"
  "checkpoint/cashier-central-report-location-language-complete-2026-09-20"
  "checkpoint/cashier-central-report-visual-qa-complete-2026-09-20"
  "checkpoint/cashier-final-reference"
  "checkpoint/cashier-location-binding-2026-09-19"
  "checkpoint/cashier-location-inventory-cutover-complete-2026-09-19"
  "checkpoint/cashier-manual-discount-return-allocation-v2-complete-2026-09-19"
  "checkpoint/cashier-manual-discount-return-pricing-v2-complete-2026-09-19"
  "checkpoint/cashier-offline-report-range-scope-parity-complete-2026-09-19"
  "checkpoint/cashier-one-time-pairing-recovery-complete-2026-09-20"
  "checkpoint/cashier-operation-location-backfill-complete-2026-09-20"
  "checkpoint/cashier-p0-closed-2026-09-09"
  "checkpoint/cashier-p1-scanner-checkout-wip-2026-09-09"
  "checkpoint/cashier-reports-detail-transparency-complete-2026-09-19"
  "checkpoint/cashier-reports-language-parity-complete-2026-09-19"
  "checkpoint/cashier-reports-live-refresh-complete-2026-09-19"
  "checkpoint/cashier-reports-location-authority-complete-2026-09-19"
  "checkpoint/cashier-reports-online-offline-parity-complete-2026-09-19"
  "checkpoint/cashier-reports-server-side-detail-filters-complete-2026-09-19"
  "checkpoint/cashier-station-location-ui-complete-2026-09-20"
  "checkpoint/catalog-before-cashier-ui-restore-20260827"
  "checkpoint/integration-before-service-location-fix-20260903"
  "checkpoint/integration-before-unmerged-recovery-20260901"
  "checkpoint/knowledge-audit-pagination-complete-2026-09-20"
  "checkpoint/learned-answers-management-pagination-complete-2026-09-20"
  "checkpoint/location-delivery-area-migration-fixed-2026-09-20"
  "checkpoint/location-delivery-area-routing-complete-2026-09-19"
  "checkpoint/location-inventory-authority-complete-2026-09-19"
  "checkpoint/location-inventory-foundation-2026-09-19"
  "checkpoint/location-routing-db-adapter-complete-2026-09-19"
  "checkpoint/location-routing-engine-core-complete-2026-09-19"
  "checkpoint/main-integrated-green-2026-09-20"
  "checkpoint/main-post-merge-before-oneshot-cleanup-20260916"
  "checkpoint/main-production-env-contract-2026-09-20"
  "checkpoint/main-production-readiness-contract-2026-09-20"
  "checkpoint/main-release-docs-synced-2026-09-20"
  "checkpoint/merchant-inventory-freshness-policy-complete-2026-09-20"
  "checkpoint/multi-location-inventory-foundation-2026-09-19"
  "checkpoint/online-order-atomic-commit-complete-2026-09-19"
  "checkpoint/online-order-cancellation-compensation-complete-2026-09-19"
  "checkpoint/online-order-fulfillment-planner-complete-2026-09-19"
  "checkpoint/online-order-location-routing-complete-2026-09-19"
  "checkpoint/pre-main-integration-20260915"
  "checkpoint/pre-main-ready-20260916"
  "checkpoint/reports-hub-online-combined-complete-2026-09-21"
  "checkpoint/saved-answers-category-authority-complete-2026-09-19"
  "checkpoint/saved-answers-category-type-hardening-complete-2026-09-19"
  "checkpoint/saved-answers-duplicate-create-ux-complete-2026-09-19"
  "checkpoint/saved-answers-duplicate-edit-ux-complete-2026-09-20"
  "checkpoint/saved-answers-management-pagination-complete-2026-09-20"
  "checkpoint/saved-answers-server-search-complete-2026-09-20"
  "checkpoint/saved-answers-with-cashier-refund-pricing-v2-complete-2026-09-19"
  "checkpoint/service-area-resolver-complete-2026-09-19"
  "checkpoint/training-approved-answer-revocation-complete-2026-09-20"
  "checkpoint/training-conflict-draft-preservation-complete-2026-09-20"
  "checkpoint/training-filter-mutation-coherence-complete-2026-09-20"
  "checkpoint/training-filter-mutation-race-guard-complete-2026-09-20"
  "checkpoint/training-management-pagination-search-complete-2026-09-20"
)

: > "$REPORT"
REFS=()
EXISTING=()
for name in "${BRANCHES[@]}"; do
  ref="refs/remotes/origin/$name"
  if git show-ref --verify --quiet "$ref"; then
    sha="$(git rev-parse "$ref")"
    printf "%s %s\n" "$sha" "$name" >> "$REPORT"
    REFS+=("$ref")
    EXISTING+=("$name")
  else
    echo "SKIP_MISSING=$name"
  fi
done

COUNT="${#EXISTING[@]}"
echo "CHECKPOINTS_ELIGIBLE_FOR_PRUNE=$COUNT"

if [ "$COUNT" -eq 0 ]; then
  echo "No listed checkpoints remain."
  exit 0
fi

git bundle create "$BUNDLE" "${REFS[@]}"
git bundle verify "$BUNDLE"

{
  echo "#!/usr/bin/env bash"
  echo "set -euo pipefail"
  printf "git push origin --delete"
  for name in "${EXISTING[@]}"; do
    printf " %q" "$name"
  done
  echo
  echo "git fetch origin --prune"
} > "$DELETE_SCRIPT"
chmod +x "$DELETE_SCRIPT"

echo "ARCHIVE_REPORT=$REPORT"
echo "ARCHIVE_BUNDLE=$BUNDLE"
echo "DELETE_SCRIPT=$DELETE_SCRIPT"
echo
cat "$REPORT"

if [ "${RUN_DELETE:-0}" = "1" ]; then
  echo
  echo "Deleting only the explicit checkpoint prune allowlist..."
  "$DELETE_SCRIPT"
else
  echo
  echo "Dry run only. No remote checkpoint branches were deleted."
  echo "After reviewing the verified bundle and report, rerun with:"
  echo "RUN_DELETE=1 bash scripts/archive-and-prune-obsolete-checkpoints.sh"
fi
