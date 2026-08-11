#!/usr/bin/env bash
set -euo pipefail

TMP_SCRIPT="${TMPDIR:-/tmp}/fawri-superqi-sandbox-runner-v3-$$.sh"
cleanup_wrapper() { rm -f "$TMP_SCRIPT"; }
trap cleanup_wrapper EXIT

python3 - "$TMP_SCRIPT" <<'PY'
from pathlib import Path
import subprocess
import sys

out = Path(sys.argv[1])
text = subprocess.check_output([
    "git", "show",
    "github/parallel/superqi-sandbox-provider:scripts/run-superqi-sandbox-provider-local.sh",
], text=True)

old_cleanup_fn = '''cleanup() {
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
'''
new_cleanup_fn = '''cleanup() {
  if [[ -n "${WORKSPACE_CONFIG_BACKUP:-}" ]]; then
    rm -f "$WORKSPACE_CONFIG_BACKUP" >/dev/null 2>&1 || true
  fi
  git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$WORKTREE" >/dev/null 2>&1 || true
}
'''
if old_cleanup_fn not in text:
    raise SystemExit("STOP: worktree cleanup block changed unexpectedly")
text = text.replace(old_cleanup_fn, new_cleanup_fn, 1)

old_deps = '''# Reuse already-installed local dependencies without mutating the user's source checkout.
for rel in node_modules artifacts/api-server/node_modules artifacts/fawri/node_modules lib/db/node_modules; do
  if [[ -d "$ROOT/$rel" && ! -e "$WORKTREE/$rel" ]]; then
    mkdir -p "$(dirname "$WORKTREE/$rel")"
    ln -s "$ROOT/$rel" "$WORKTREE/$rel"
  fi
done

python3 scripts/.tmp-superqi-sandbox-provider.py
'''
new_deps = '''# Keep dependencies strictly inside the disposable worktree. pnpm 11 replaced
# onlyBuiltDependencies with allowBuilds. Translate the repository's existing
# trust list temporarily for this isolated install, then restore it before the
# final diff/commit so this lane does not change workspace package policy.
echo "Installing isolated dependencies from the local pnpm store..."
WORKSPACE_CONFIG_BACKUP="${TMPDIR:-/tmp}/fawri-superqi-pnpm-workspace-$$.yaml"
cp pnpm-workspace.yaml "$WORKSPACE_CONFIG_BACKUP"
python3 - <<'PYCFG'
from pathlib import Path
p = Path("pnpm-workspace.yaml")
text = p.read_text(encoding="utf-8")
old = """onlyBuiltDependencies:
  - '@swc/core'
  - esbuild
  - msw
  - unrs-resolver
"""
new = """allowBuilds:
  '@swc/core': true
  esbuild: true
  msw: true
  unrs-resolver: true
"""
if text.count(old) != 1:
    raise SystemExit("STOP: expected legacy pnpm build trust block exactly once")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
PYCFG
pnpm install --offline --frozen-lockfile

python3 scripts/.tmp-superqi-sandbox-provider.py
'''
if old_deps not in text:
    raise SystemExit("STOP: dependency setup block changed unexpectedly")
text = text.replace(old_deps, new_deps, 1)

old_diff = '''git diff --check "$GOLDEN"

# Validation helpers are staging-only and must not enter the final product diff.
'''
new_diff = '''# Restore repository package policy byte-for-byte before final diff checks.
cp "$WORKSPACE_CONFIG_BACKUP" pnpm-workspace.yaml
rm -f "$WORKSPACE_CONFIG_BACKUP"
WORKSPACE_CONFIG_BACKUP=""

git diff --check "$GOLDEN"

# Validation helpers are staging-only and must not enter the final product diff.
'''
if old_diff not in text:
    raise SystemExit("STOP: final diff gate block changed unexpectedly")
text = text.replace(old_diff, new_diff, 1)

old_cleanup = '''rm -f scripts/.tmp-superqi-sandbox-provider.py \\
  scripts/run-superqi-sandbox-provider-local.sh
'''
new_cleanup = '''rm -f scripts/.tmp-superqi-sandbox-provider.py \\
  scripts/run-superqi-sandbox-provider-local.sh \\
  scripts/run-superqi-sandbox-provider-local-v2.sh \\
  scripts/run-superqi-sandbox-provider-local-v3.sh
'''
if old_cleanup not in text:
    raise SystemExit("STOP: staging cleanup block changed unexpectedly")
text = text.replace(old_cleanup, new_cleanup, 1)

out.write_text(text, encoding="utf-8")
PY

bash "$TMP_SCRIPT"
