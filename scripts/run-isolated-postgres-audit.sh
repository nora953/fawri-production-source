#!/usr/bin/env bash
set -euo pipefail
# Only fresh Docker-owned PostgreSQL; no host DB URL or hosted credentials inherited.
audit_suite="${1:-priority}"
case "$audit_suite" in
  priority|foundation-runtime|auth-contract|settings-runtime|regional-runtime|channels-runtime|variant-runtime|inventory-runtime|media-runtime|subscription-reminder|http|node22-http|knowledge-rls|management|meta|meta-rls|bootstrap|deletion|cashier|cashier-operational|subscription-golden|online-routing|billing|tenant|meta-bot|full-restore) ;;
  *) echo 'Unsupported audit suite' >&2; exit 2 ;;
esac
audit_node_image="node:24-bookworm-slim"
if [ "$audit_suite" = node22-http ]; then audit_node_image="node:22-bookworm-slim"; fi
: "${RUNNER_TEMP:?GitHub runner temp is required}"
: "${GITHUB_ACTIONS:?GitHub runner is required}"
audit_root="$(pwd)"
audit_temp="$(mktemp -d "$RUNNER_TEMP/fawri-pg-audit.XXXXXX")"
audit_pg=""
audit_node=""
audit_cleanup() {
  audit_cleanup_status=0
  if [ -n "$audit_node" ]; then docker rm -fv "$audit_node" >/dev/null 2>&1 || audit_cleanup_status=1; fi
  if [ -n "$audit_pg" ]; then docker rm -fv "$audit_pg" >/dev/null 2>&1 || audit_cleanup_status=1; fi
  rm -rf "$audit_temp" || audit_cleanup_status=1
  return "$audit_cleanup_status"
}
trap 'audit_status=$?; audit_cleanup || audit_status=1; exit "$audit_status"' EXIT
umask 077
mkdir -p "$audit_temp/restore-proof"
docker pull postgres:16-alpine >/dev/null
docker pull "$audit_node_image" >/dev/null
audit_run="$(node -e "process.stdout.write(require('node:crypto').randomBytes(16).toString('hex'))")"
audit_password="$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('hex'))")"
printf 'POSTGRES_USER=fawri_ci\nPOSTGRES_DB=fawri_ci\nPOSTGRES_PASSWORD=%s\n' "$audit_password" > "$audit_temp/postgres.env"
audit_pg="$(docker run -d --label "fawri.audit=${GITHUB_RUN_ID}:${GITHUB_RUN_ATTEMPT}" --network none --env-file "$audit_temp/postgres.env" postgres:16-alpine)"
test "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$audit_pg")" = none
for audit_attempt in {1..40}; do
  if docker exec "$audit_pg" pg_isready -h 127.0.0.1 -U fawri_ci -d fawri_ci >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$audit_pg" pg_isready -h 127.0.0.1 -U fawri_ci -d fawri_ci >/dev/null
docker exec "$audit_pg" psql -U fawri_ci -d fawri_ci -v ON_ERROR_STOP=1 -c "COMMENT ON DATABASE fawri_ci IS 'fawri-disposable:$audit_run'" >/dev/null
audit_namespace="$(docker exec "$audit_pg" readlink /proc/self/ns/net)"
AUDIT_RUN="$audit_run" AUDIT_CONTAINER="$audit_pg" AUDIT_NAMESPACE="$audit_namespace" node --input-type=module - "$audit_temp/attestation.json" <<'NODE'
import fs from 'node:fs';
fs.writeFileSync(process.argv[2], JSON.stringify({ format: 'fawri-disposable-pg-v1', runId: process.env.AUDIT_RUN, containerId: process.env.AUDIT_CONTAINER, networkMode: 'none', networkNamespace: process.env.AUDIT_NAMESPACE }), { mode: 0o600 });
NODE
printf 'DATABASE_URL=postgresql://fawri_ci:%s@127.0.0.1:5432/fawri_ci\nNODE_ENV=test\nFAWRI_DATA_DIR=/tmp/fawri-isolated-audit-data\nFAWRI_DISPOSABLE_PG_RUN_ID=%s\nFAWRI_DISPOSABLE_PG_ATTESTATION=/audit-proof.json\nFAWRI_DISABLE_JOB_WORKERS=1\nFAWRI_META_CUTOVER_READY=0\nFAWRI_META_REPLY_TRANSPORT=disabled\nFAWRI_KNOWLEDGE_EMBEDDING_PROVIDER=disabled\nFAWRI_PASSWORD_SALT=disposable-audit-password-salt-over-32-characters\n' "$audit_password" "$audit_run" > "$audit_temp/runner.env"
# Shared network namespace has loopback only. No published ports, host network,
# Docker socket mount, external service secrets, or route to hosted databases.
audit_node="$(docker create --label "fawri.audit=${GITHUB_RUN_ID}:${GITHUB_RUN_ATTEMPT}" --network "container:$audit_pg" --env-file "$audit_temp/runner.env" \
  --mount "type=bind,src=$audit_root,dst=$audit_root,readonly" \
  --mount "type=bind,src=$audit_temp/attestation.json,dst=/audit-proof.json,readonly" \
  --mount "type=bind,src=$audit_temp/restore-proof,dst=/restore-proof" \
  --env FAWRI_AUDIT_RESTORE_PHASE=seed \
  --workdir "$audit_root" "$audit_node_image" \
  node scripts/ci-run-redacted.mjs --label isolated-postgres-audit -- node scripts/execute-disposable-postgres-audit.mjs "$audit_suite")"
AUDIT_CONTAINER="$audit_pg" AUDIT_NAMESPACE="$audit_namespace" AUDIT_SUITE="$audit_suite" AUDIT_NODE_IMAGE="$audit_node_image" node --input-type=module <<'NODE'
console.log('AUDIT_ISOLATION_PROOF ' + JSON.stringify({ suite: process.env.AUDIT_SUITE, nodeImage: process.env.AUDIT_NODE_IMAGE, containerId: process.env.AUDIT_CONTAINER, networkNamespace: process.env.AUDIT_NAMESPACE, networkMode: 'none', publishedPorts: false, database: 'fawri_ci', role: 'fawri_ci', localPort: 5432 }));
NODE
docker start -a "$audit_node"
audit_exit="$(docker inspect -f '{{.State.ExitCode}}' "$audit_node")"
if [ "$audit_exit" -ne 0 ]; then exit "$audit_exit"; fi
if [ "$audit_suite" = full-restore ]; then
  # All commands below address only the fresh owned, offline container ID.
  # No URL or host connection is used by pg_dump/pg_restore/psql.
  docker exec "$audit_pg" pg_dump -U fawri_ci -d fawri_ci --format=custom --file=/tmp/fawri-full-schema.dump
  docker exec "$audit_pg" createdb -U fawri_ci --template=template0 fawri_restore_target
  docker exec "$audit_pg" pg_restore -U fawri_ci -d fawri_restore_target --no-owner --exit-on-error /tmp/fawri-full-schema.dump
  docker exec "$audit_pg" psql -U fawri_ci -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE fawri_ci' -c 'ALTER DATABASE fawri_restore_target RENAME TO fawri_ci' >/dev/null
  docker exec "$audit_pg" psql -U fawri_ci -d fawri_ci -v ON_ERROR_STOP=1 -c "COMMENT ON DATABASE fawri_ci IS 'fawri-disposable:$audit_run'" >/dev/null
  echo 'AUDIT_FULL_SCHEMA_DUMP_RESTORE_PASS'
  docker rm -fv "$audit_node" >/dev/null
  audit_node=""
  audit_node="$(docker create --label "fawri.audit=${GITHUB_RUN_ID}:${GITHUB_RUN_ATTEMPT}" --network "container:$audit_pg" --env-file "$audit_temp/runner.env" --env FAWRI_AUDIT_RESTORE_PHASE=verify \
    --mount "type=bind,src=$audit_root,dst=$audit_root,readonly" \
    --mount "type=bind,src=$audit_temp/attestation.json,dst=/audit-proof.json,readonly" \
    --mount "type=bind,src=$audit_temp/restore-proof,dst=/restore-proof,readonly" \
    --workdir "$audit_root" "$audit_node_image" \
    node scripts/ci-run-redacted.mjs --label isolated-full-schema-restore -- node scripts/execute-disposable-postgres-audit.mjs full-restore)"
  docker start -a "$audit_node"
  audit_exit="$(docker inspect -f '{{.State.ExitCode}}' "$audit_node")"
fi
exit "$audit_exit"
