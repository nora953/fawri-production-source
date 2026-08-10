#!/usr/bin/env bash
set -euo pipefail

TMP_SCRIPT="${TMPDIR:-/tmp}/fawri-saas-billing-runner-v3-$$.sh"
cleanup_wrapper() { rm -f "$TMP_SCRIPT"; }
trap cleanup_wrapper EXIT

python3 - "$TMP_SCRIPT" <<'PY'
from pathlib import Path
import subprocess
import sys

out = Path(sys.argv[1])
text = subprocess.check_output([
    "git", "show",
    "github/parallel/saas-billing-authority-recovery:scripts/run-saas-billing-authority-local.sh",
], text=True)

old_lane = 'LANE="parallel/saas-billing-authority"'
new_lane = 'LANE="parallel/saas-billing-authority-recovery"'
if old_lane not in text:
    raise SystemExit("STOP: base runner lane declaration changed unexpectedly")
text = text.replace(old_lane, new_lane, 1)

# Patches 3/4 update migration tests that historically pinned 0005 as the
# forever-latest migration. Patch 5 updates the Guarantee SQL-shape proof to
# require the new billing joins while preserving tenant binding. Patch 6 makes
# disposable PostgreSQL acceptance independent of prior test database state.
old = "python3 scripts/.tmp-saas-billing-authority-2.py\n"
new = old + "python3 scripts/.tmp-saas-billing-authority-3.py\npython3 scripts/.tmp-saas-billing-authority-4.py\npython3 scripts/.tmp-saas-billing-authority-5.py\npython3 scripts/.tmp-saas-billing-authority-6.py\n"
if old not in text:
    raise SystemExit("STOP: base runner staging patch block changed unexpectedly")
text = text.replace(old, new, 1)

# Package-filtered test paths are resolved from artifacts/api-server.
old = "mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -print | sort)"
new = "mapfile -t guarantee_tests < <(find artifacts/api-server/tests -maxdepth 1 -type f -name '*guarantee*.test.ts' -printf './tests/%f\\n' | sort)"
if old not in text:
    raise SystemExit("STOP: base runner guarantee path block changed unexpectedly")
text = text.replace(old, new, 1)

# Raw historical SQL contains composite foreign keys whose required UNIQUE
# constraints appear later in the same migration file. Use the repository's
# canonical dependency-order stabilizer for disposable application only.
old_apply = '''apply_migrations() {
  for migration in lib/db/drizzle/[0-9][0-9][0-9][0-9]_*.sql; do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$migration"
  done
}
'''
new_apply = '''apply_migrations() {
  local stabilized rc
  stabilized="$(node --input-type=module - <<'NODE'
import { createStabilizedMigrationFolder } from "./lib/db/scripts/lib/migration-sql-order.mjs";
process.stdout.write(createStabilizedMigrationFolder("./lib/db/drizzle"));
NODE
)"
  rc=0
  for migration in "$stabilized"/[0-9][0-9][0-9][0-9]_*.sql; do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$migration" || { rc=$?; break; }
  done
  rm -rf "$stabilized"
  return "$rc"
}
'''
if old_apply not in text:
    raise SystemExit("STOP: base runner raw migration apply block changed unexpectedly")
text = text.replace(old_apply, new_apply, 1)

# migration:test includes disposable PostgreSQL tests that require an empty
# fawri_ci. Previous failed attempts must never leak database state into it.
old_gate = 'echo "Running migration and PostgreSQL gates..."\npnpm run migration:test\nreset_db\n'
new_gate = 'echo "Running migration and PostgreSQL gates..."\nreset_db\npnpm run migration:test\nreset_db\n'
if old_gate not in text:
    raise SystemExit("STOP: base runner migration gate block changed unexpectedly")
text = text.replace(old_gate, new_gate, 1)

old_cleanup = '''rm -f scripts/.tmp-saas-billing-authority.py \\
  scripts/.tmp-saas-billing-authority-2.py \\
  scripts/run-saas-billing-authority-local.sh\n'''
new_cleanup = '''rm -f scripts/.tmp-saas-billing-authority.py \\
  scripts/.tmp-saas-billing-authority-2.py \\
  scripts/.tmp-saas-billing-authority-3.py \\
  scripts/.tmp-saas-billing-authority-4.py \\
  scripts/.tmp-saas-billing-authority-5.py \\
  scripts/.tmp-saas-billing-authority-6.py \\
  scripts/run-saas-billing-authority-local.sh \\
  scripts/run-saas-billing-authority-local-v2.sh \\
  scripts/run-saas-billing-authority-local-v3.sh\n'''
if old_cleanup not in text:
    raise SystemExit("STOP: base runner cleanup block changed unexpectedly")
text = text.replace(old_cleanup, new_cleanup, 1)

old_allow = '  "scripts/tests/saas-billing-migration-history.test.mjs",\n}'
new_allow = '''  "scripts/tests/saas-billing-migration-history.test.mjs",\n  "artifacts/api-server/tests/subscription-service-guarantee.test.ts",\n  "scripts/tests/run-postgresql-migration-plan.test.mjs",\n  "scripts/tests/postgresql-disposable-acceptance.test.mjs",\n  "scripts/tests/cross-lane-migration-generator.test.mjs",\n  "scripts/tests/cross-lane-postgresql-edge-gates.test.mjs",\n  "scripts/tests/product-shipping-migration-history.test.mjs",\n  "scripts/tests/delivery-fee-per-area-migration-history.test.mjs",\n}'''
if old_allow not in text:
    raise SystemExit("STOP: base runner final allowlist changed unexpectedly")
text = text.replace(old_allow, new_allow, 1)

out.write_text(text, encoding="utf-8")
PY

bash "$TMP_SCRIPT"
