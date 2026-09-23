#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

git fetch origin --prune

MAIN_REF="refs/remotes/origin/main"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_DIR="${BRANCH_ARCHIVE_DIR:-branch-archives}"
mkdir -p "$ARCHIVE_DIR"

SAFE_LIST="$ARCHIVE_DIR/merged-working-branches-$STAMP.txt"
BUNDLE="$ARCHIVE_DIR/merged-working-branches-$STAMP.bundle"
DELETE_SCRIPT="$ARCHIVE_DIR/delete-merged-working-branches-$STAMP.sh"

: > "$SAFE_LIST"

while IFS= read -r ref; do
  case "$ref" in
    refs/remotes/origin/HEAD|refs/remotes/origin/main|refs/remotes/origin/checkpoint/*)
      continue
      ;;
  esac

  # Never treat symbolic remote refs (for example origin/HEAD) as branches.
  if [ -n "$(git for-each-ref --format='%(symref)' "$ref")" ]; then
    continue
  fi

  if git merge-base --is-ancestor "$ref" "$MAIN_REF"; then
    printf '%s\n' "${ref#refs/remotes/origin/}" >> "$SAFE_LIST"
  fi
done < <(git for-each-ref --format='%(refname)' refs/remotes/origin | sort)

COUNT="$(wc -l < "$SAFE_LIST" | tr -d ' ')"
echo "SAFE_MERGED_WORKING_BRANCHES=$COUNT"

if [ "$COUNT" -eq 0 ]; then
  echo "No merged working branches are eligible for pruning."
  exit 0
fi

mapfile -t BRANCHES < "$SAFE_LIST"
BUNDLE_REFS=()
for name in "${BRANCHES[@]}"; do
  BUNDLE_REFS+=("refs/remotes/origin/$name")
done

git bundle create "$BUNDLE" "${BUNDLE_REFS[@]}"
git bundle verify "$BUNDLE"

{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  printf 'git push origin --delete'
  for name in "${BRANCHES[@]}"; do
    printf ' %q' "$name"
  done
  echo
  echo 'git fetch origin --prune'
} > "$DELETE_SCRIPT"
chmod +x "$DELETE_SCRIPT"

echo "ARCHIVE_BUNDLE=$BUNDLE"
echo "SAFE_LIST=$SAFE_LIST"
echo "DELETE_SCRIPT=$DELETE_SCRIPT"
echo
cat "$SAFE_LIST"

if [ "${RUN_DELETE:-0}" = "1" ]; then
  echo
  echo "Deleting only branches proven to be ancestors of origin/main..."
  "$DELETE_SCRIPT"
else
  echo
  echo "Dry run only. No remote branches were deleted."
  echo "After reviewing the list and verified bundle, rerun with:"
  echo "RUN_DELETE=1 bash scripts/archive-and-prune-merged-branches.sh"
fi
