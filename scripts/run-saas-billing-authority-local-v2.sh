#!/usr/bin/env bash
set -euo pipefail

TMP_SCRIPT="${TMPDIR:-/tmp}/fawri-saas-billing-runner-v2-$$.sh"
cleanup_wrapper() { rm -f "$TMP_SCRIPT"; }
trap cleanup_wrapper EXIT

python3 - "$TMP_SCRIPT" <<'PY'
from pathlib import Path
import subprocess
import sys

out = Path(sys.argv[1])
text = subprocess.check_output([
    "git", "show",
    "github/parallel/saas-billing-authority:scripts/run-saas-billing-authority-local.sh",
], text=True)
old = "mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -print | sort)"
new = "mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -printf './tests/%f\\n' | sort)"
if old not in text:
    raise SystemExit("STOP: base runner guarantee path block changed unexpectedly")
text = text.replace(old, new, 1)
old_cleanup = "  scripts/run-saas-billing-authority-local.sh\n"
new_cleanup = "  scripts/run-saas-billing-authority-local.sh \\\n  scripts/run-saas-billing-authority-local-v2.sh\n"
if old_cleanup not in text:
    raise SystemExit("STOP: base runner cleanup block changed unexpectedly")
text = text.replace(old_cleanup, new_cleanup, 1)
out.write_text(text, encoding="utf-8")
PY

bash "$TMP_SCRIPT"
