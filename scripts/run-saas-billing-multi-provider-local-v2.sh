#!/usr/bin/env bash
set -euo pipefail

TMP_SCRIPT="${TMPDIR:-/tmp}/fawri-saas-multi-provider-runner-v2-$$.sh"
cleanup_wrapper() { rm -f "$TMP_SCRIPT"; }
trap cleanup_wrapper EXIT

python3 - "$TMP_SCRIPT" <<'PY'
from pathlib import Path
import subprocess
import sys

out = Path(sys.argv[1])
text = subprocess.check_output([
    "git", "show",
    "github/parallel/saas-billing-multi-provider-readiness:scripts/run-saas-billing-multi-provider-local.sh",
], text=True)

old_restore = '''pnpm install --offline --frozen-lockfile
cp "$WORKSPACE_CONFIG_BACKUP" pnpm-workspace.yaml
rm -f "$WORKSPACE_CONFIG_BACKUP"
WORKSPACE_CONFIG_BACKUP=""

python3 scripts/.tmp-saas-billing-multi-provider.py
'''
new_restore = '''pnpm install --offline --frozen-lockfile

# Keep the pnpm 11-compatible build trust translation active for every pnpm
# validation command. Restoring it here makes pnpm see a configuration change
# and triggers an implicit install during the first pnpm exec.
python3 scripts/.tmp-saas-billing-multi-provider.py
'''
if old_restore not in text:
    raise SystemExit("STOP: dependency restore block changed unexpectedly")
text = text.replace(old_restore, new_restore, 1)

old_diff = '''git diff --check "$GOLDEN"

rm -f scripts/.tmp-saas-billing-multi-provider.py \\
  scripts/run-saas-billing-multi-provider-local.sh
'''
new_diff = '''# Restore repository package policy byte-for-byte only after all pnpm commands
# have completed, then prove it does not enter the final diff.
cp "$WORKSPACE_CONFIG_BACKUP" pnpm-workspace.yaml
rm -f "$WORKSPACE_CONFIG_BACKUP"
WORKSPACE_CONFIG_BACKUP=""

git diff --check "$GOLDEN"

rm -f scripts/.tmp-saas-billing-multi-provider.py \\
  scripts/run-saas-billing-multi-provider-local.sh \\
  scripts/run-saas-billing-multi-provider-local-v2.sh
'''
if old_diff not in text:
    raise SystemExit("STOP: final diff/cleanup block changed unexpectedly")
text = text.replace(old_diff, new_diff, 1)

out.write_text(text, encoding="utf-8")
PY

bash "$TMP_SCRIPT"
