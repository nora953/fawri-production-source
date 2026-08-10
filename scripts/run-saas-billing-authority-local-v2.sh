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

# Patches 3/4 update migration tests that historically pinned 0005 as the
# forever-latest migration. They preserve historical hashes/positions while
# making latest-state assertions follow the committed journal.
old = "python3 scripts/.tmp-saas-billing-authority-2.py\n"
new = old + "python3 scripts/.tmp-saas-billing-authority-3.py\npython3 scripts/.tmp-saas-billing-authority-4.py\n"
if old not in text:
    raise SystemExit("STOP: base runner staging patch block changed unexpectedly")
text = text.replace(old, new, 1)

# Package-filtered test paths are resolved from artifacts/api-server.
old = "mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -print | sort)"
new = "mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -printf './tests/%f\\n' | sort)"
if old not in text:
    raise SystemExit("STOP: base runner guarantee path block changed unexpectedly")
text = text.replace(old, new, 1)

old_cleanup = '''rm -f scripts/.tmp-saas-billing-authority.py \\
  scripts/.tmp-saas-billing-authority-2.py \\
  scripts/run-saas-billing-authority-local.sh\n'''
new_cleanup = '''rm -f scripts/.tmp-saas-billing-authority.py \\
  scripts/.tmp-saas-billing-authority-2.py \\
  scripts/.tmp-saas-billing-authority-3.py \\
  scripts/.tmp-saas-billing-authority-4.py \\
  scripts/run-saas-billing-authority-local.sh \\
  scripts/run-saas-billing-authority-local-v2.sh\n'''
if old_cleanup not in text:
    raise SystemExit("STOP: base runner cleanup block changed unexpectedly")
text = text.replace(old_cleanup, new_cleanup, 1)

old_allow = '  "scripts/tests/saas-billing-migration-history.test.mjs",\n}'
new_allow = '''  "scripts/tests/saas-billing-migration-history.test.mjs",\n  "scripts/tests/run-postgresql-migration-plan.test.mjs",\n  "scripts/tests/postgresql-disposable-acceptance.test.mjs",\n  "scripts/tests/cross-lane-migration-generator.test.mjs",\n  "scripts/tests/cross-lane-postgresql-edge-gates.test.mjs",\n  "scripts/tests/product-shipping-migration-history.test.mjs",\n  "scripts/tests/delivery-fee-per-area-migration-history.test.mjs",\n}'''
if old_allow not in text:
    raise SystemExit("STOP: base runner final allowlist changed unexpectedly")
text = text.replace(old_allow, new_allow, 1)

out.write_text(text, encoding="utf-8")
PY

bash "$TMP_SCRIPT"
