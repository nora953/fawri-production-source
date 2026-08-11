#!/usr/bin/env bash
set -euo pipefail

TMP_SCRIPT="${TMPDIR:-/tmp}/fawri-superqi-sandbox-runner-v2-$$.sh"
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

old = '''# Reuse already-installed local dependencies without mutating the user's source checkout.\nfor rel in node_modules artifacts/api-server/node_modules artifacts/fawri/node_modules lib/db/node_modules; do\n  if [[ -d "$ROOT/$rel" && ! -e "$WORKTREE/$rel" ]]; then\n    mkdir -p "$(dirname "$WORKTREE/$rel")"\n    ln -s "$ROOT/$rel" "$WORKTREE/$rel"\n  fi\ndone\n\npython3 scripts/.tmp-superqi-sandbox-provider.py\n'''
new = '''# Keep dependencies strictly inside the disposable worktree. Reusing the\n# source checkout via node_modules symlinks is rejected by pnpm's safety gate.\necho "Installing isolated dependencies from the local pnpm store..."\npnpm install --offline --frozen-lockfile\n\npython3 scripts/.tmp-superqi-sandbox-provider.py\n'''
if old not in text:
    raise SystemExit("STOP: dependency setup block changed unexpectedly")
text = text.replace(old, new, 1)

old_cleanup = '''rm -f scripts/.tmp-superqi-sandbox-provider.py \\\n  scripts/run-superqi-sandbox-provider-local.sh\n'''
new_cleanup = '''rm -f scripts/.tmp-superqi-sandbox-provider.py \\\n  scripts/run-superqi-sandbox-provider-local.sh \\\n  scripts/run-superqi-sandbox-provider-local-v2.sh\n'''
if old_cleanup not in text:
    raise SystemExit("STOP: cleanup block changed unexpectedly")
text = text.replace(old_cleanup, new_cleanup, 1)

out.write_text(text, encoding="utf-8")
PY

bash "$TMP_SCRIPT"
