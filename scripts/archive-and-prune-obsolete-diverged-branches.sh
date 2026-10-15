#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
git fetch origin --prune

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_DIR="${BRANCH_ARCHIVE_DIR:-branch-archives}"
mkdir -p "$ARCHIVE_DIR"

REPORT="$ARCHIVE_DIR/diverged-obsolete-$STAMP.txt"
BUNDLE="$ARCHIVE_DIR/diverged-obsolete-$STAMP.bundle"
DELETE_SCRIPT="$ARCHIVE_DIR/delete-diverged-obsolete-$STAMP.sh"

BRANCHES=(
  "docs/staging-env-contract-2026-09-20"
  "parallel/aws-kms-production-activation"
  "parallel/bot-multilocation-stock-routing"
  "parallel/cashier-location-binding"
  "parallel/cashier-location-inventory-cutover"
  "parallel/cashier-manual-discount-return-pricing-v2"
  "parallel/catalog-card-details-modal"
  "parallel/location-inventory-foundation"
  "parallel/offline-cashier-inventory-reconciliation"
  "parallel/online-order-atomic-commit"
  "parallel/online-order-cancellation-compensation"
  "parallel/online-order-location-routing"
  "parallel/quality-observability"
  "parallel/saved-answer-conflict-code-authority"
  "parallel/saved-answers-pagination-authority"
  "parallel/service-area-resolver"
  "qa/architecture-regression-2026-09-20"
  "qa/0021-merchant-inventory-freshness-candidate"
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
echo "DIVERGED_OBSOLETE_BRANCHES_FOUND=$COUNT"

if [ "$COUNT" -eq 0 ]; then
  echo "No listed obsolete diverged branches remain."
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
  echo "Deleting only the explicit obsolete diverged allowlist..."
  "$DELETE_SCRIPT"
else
  echo
  echo "Dry run only. No remote branches were deleted."
  echo "After reviewing the verified bundle and report, rerun with:"
  echo "RUN_DELETE=1 bash scripts/archive-and-prune-obsolete-diverged-branches.sh"
fi
