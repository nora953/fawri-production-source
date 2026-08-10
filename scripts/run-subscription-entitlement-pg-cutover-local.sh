#!/usr/bin/env bash
set -euo pipefail

LANE="parallel/subscription-entitlement-pg-cutover"
COORDINATOR="parallel/integration-coordinator"
GOLDEN="297e0c047ba9fe38e80d1b7064f9135d16ec0dba"
ROOT="$(git rev-parse --show-toplevel)"

if git remote get-url github >/dev/null 2>&1; then
  REMOTE=github
elif git remote get-url origin 2>/dev/null | grep -Eq 'github\.com[:/]nora953/fawri-production-source(?:\.git)?$'; then
  REMOTE=origin
else
  echo "No GitHub remote for nora953/fawri-production-source was found." >&2
  exit 30
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required and must point to local fawri_ci." >&2
  exit 31
fi
python3 - <<'PY'
import os
from urllib.parse import urlparse
u = urlparse(os.environ["DATABASE_URL"])
if u.hostname not in {"127.0.0.1", "localhost"} or u.path.lstrip("/") != "fawri_ci":
    raise SystemExit("Refusing non-local/non-disposable DATABASE_URL; expected localhost/127.0.0.1 database fawri_ci")
PY

cd "$ROOT"
git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"

coordinator="$(git rev-parse "refs/remotes/$REMOTE/$COORDINATOR")"
[[ "$coordinator" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved to $coordinator" >&2
  exit 32
}
start_lane="$(git rev-parse "refs/remotes/$REMOTE/$LANE")"
[[ "$(git merge-base "$start_lane" "$coordinator")" == "$GOLDEN" ]] || {
  echo "STOP: lane merge-base is not the Golden coordinator" >&2
  exit 33
}

BASE_TMP="${TMPDIR:-$HOME/.cache/fawri-validation}"
mkdir -p "$BASE_TMP"
WORKTREE="$BASE_TMP/subscription-entitlement-pg-cutover-$$"
cleanup() {
  status=$?
  cd "$ROOT" || true
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  git worktree prune >/dev/null 2>&1 || true
  if [[ $status -ne 0 ]]; then
    echo "Validation stopped with exit $status. Temporary validation worktree was cleaned." >&2
  fi
}
trap cleanup EXIT

git worktree add --detach "$WORKTREE" "$start_lane"
cd "$WORKTREE"
python3 scripts/.tmp-subscription-entitlement-pg-cutover.py

corepack enable
# Offline only: this may use the already-populated pnpm store but can never reach npm.
pnpm install --offline --frozen-lockfile --ignore-scripts

reset_db() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL
}

# Existing migration safety remains green; this lane adds no migration.
reset_db
pnpm run migration:test

git diff --exit-code "$GOLDEN" -- lib/db/drizzle

# Leave a fully migrated disposable database for the entitlement integration proof.
reset_db
FAWRI_ALLOW_MIGRATION_SMOKE=1 pnpm --filter @workspace/db run schema:smoke

FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY=required \
  pnpm --filter @workspace/api-server exec tsx --test \
    ./tests/subscription-entitlement-postgres.integration.test.ts

node --test artifacts/api-server/tests/subscription-entitlement-pg-cutover-static.test.mjs

# Legacy-mode regressions prove that the activation gate preserves current behavior
# until production explicitly sets FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY=required.
unset FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY
pnpm --filter @workspace/api-server exec tsx --test \
  ./tests/merchant-reply-entitlement.test.ts \
  ./tests/meta-webhook-outcome-refund.test.ts

# Static grep: no live Meta consumer may import the file authority directly.
if grep -R -nE 'from "(\.\./services/merchantReplyEntitlement|\.\/merchantReplyEntitlement|\.\/merchantReplyRefund|\.\/merchantReplyReservationRelease)"' \
  artifacts/api-server/src/services/metaWebhookWorkerCore.ts \
  artifacts/api-server/src/services/metaWebhookWorker.ts \
  artifacts/api-server/src/middleware/merchantWebhookSubscriptionAccess.ts; then
  echo "STOP: live Meta path still imports legacy subscription entitlement directly" >&2
  exit 34
fi

pnpm --filter @workspace/db run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build

git diff --check "$GOLDEN"

rm -f \
  scripts/.tmp-subscription-entitlement-pg-cutover.py \
  scripts/run-subscription-entitlement-pg-cutover-local.sh

allowed='^(artifacts/api-server/src/middleware/merchantWebhookSubscriptionAccess\.ts|artifacts/api-server/src/routes/auth-security\.ts|artifacts/api-server/src/routes/subscription-entitlement-pg\.ts|artifacts/api-server/src/services/merchantReplyEntitlementAuthority\.ts|artifacts/api-server/src/services/merchantReplyRefundAuthority\.ts|artifacts/api-server/src/services/merchantReplyReservationReleaseAuthority\.ts|artifacts/api-server/src/services/metaWebhookWorker\.ts|artifacts/api-server/src/services/metaWebhookWorkerCore\.ts|artifacts/api-server/src/services/postgresSubscriptionEntitlement\.ts|artifacts/api-server/tests/subscription-entitlement-postgres\.integration\.test\.ts|artifacts/api-server/tests/subscription-entitlement-pg-cutover-static\.test\.mjs)$'
bad="$(git diff --name-only "$GOLDEN" | grep -Ev "$allowed" || true)"
if [[ -n "$bad" ]]; then
  echo "STOP: unexpected files in final net diff:" >&2
  echo "$bad" >&2
  exit 35
fi

git diff --exit-code "$GOLDEN" -- lib/db/drizzle lib/db/src/schema

# Re-read both remote refs immediately before commit/push.
git fetch "$REMOTE" \
  "+refs/heads/$COORDINATOR:refs/remotes/$REMOTE/$COORDINATOR" \
  "+refs/heads/$LANE:refs/remotes/$REMOTE/$LANE"
[[ "$(git rev-parse "refs/remotes/$REMOTE/$COORDINATOR")" == "$GOLDEN" ]] || {
  echo "STOP: coordinator moved during validation" >&2
  exit 36
}
[[ "$(git rev-parse "refs/remotes/$REMOTE/$LANE")" == "$start_lane" ]] || {
  echo "STOP: remote lane moved during validation" >&2
  exit 37
}

git config user.name "nora953"
git config user.email "45720986+nora953@users.noreply.github.com"
git add -A
git commit -m "feat: cut subscription entitlement to PostgreSQL authority"
final_sha="$(git rev-parse HEAD)"
git push "$REMOTE" HEAD:"$LANE"

echo "SUBSCRIPTION_ENTITLEMENT_PG_READY $final_sha"
