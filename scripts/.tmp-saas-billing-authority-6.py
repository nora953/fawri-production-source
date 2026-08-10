#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "scripts/tests/postgresql-disposable-acceptance.test.mjs"
text = path.read_text(encoding="utf-8")
old = '''    const fixtureDirectory = fs.mkdtempSync(\n      path.join(process.env.RUNNER_TEMP || "/tmp", "fawri-postgresql-acceptance-"),\n    );\n    try {\n      const smoke = run(\n'''
new = '''    const fixtureDirectory = fs.mkdtempSync(\n      path.join(process.env.RUNNER_TEMP || "/tmp", "fawri-postgresql-acceptance-"),\n    );\n    await resetDisposableSchema(process.env.DATABASE_URL);\n    try {\n      const smoke = run(\n'''
if old not in text:
    raise SystemExit("STOP: disposable PostgreSQL acceptance start block changed unexpectedly")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("isolated disposable PostgreSQL acceptance from prior test state")
