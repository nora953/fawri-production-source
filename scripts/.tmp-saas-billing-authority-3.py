#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, content): p(rel).write_text(content, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel)
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{rel}: expected {count}, found {actual}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))

# Make the validated-plan test follow the committed journal instead of pinning
# the latest migration to 0005 forever.
rel = "scripts/tests/run-postgresql-migration-plan.test.mjs"
replace(
    rel,
    'const sha256Pattern = /^[a-f0-9]{64}$/;\n',
    '''const sha256Pattern = /^[a-f0-9]{64}$/;\n\nfunction latestCommittedMigration() {\n  const journal = JSON.parse(\n    fs.readFileSync(\n      path.join(repositoryRoot, "lib", "db", "drizzle", "meta", "_journal.json"),\n      "utf8",\n    ),\n  );\n  const latest = journal.entries?.at(-1);\n  assert.ok(Number.isInteger(latest?.idx), "latest committed Drizzle migration is missing");\n  assert.match(String(latest?.tag || ""), new RegExp(`^${String(latest.idx).padStart(4, "0")}_`));\n  return {\n    latest,\n    snapshotName: `${String(latest.idx).padStart(4, "0")}_snapshot.json`,\n  };\n}\n''',
)
replace(
    rel,
    '    assert.equal(report.schema_validation.snapshot, "0005_snapshot.json");',
    '    assert.equal(report.schema_validation.snapshot, latestCommittedMigration().snapshotName);',
)
old = '''  const journal = JSON.parse(\n    fs.readFileSync(\n      path.join(repositoryRoot, "lib", "db", "drizzle", "meta", "_journal.json"),\n      "utf8",\n    ),\n  );\n  const latest = journal.entries?.at(-1);\n  assert.equal(latest?.idx, 5, "latest committed Drizzle migration is not 0005");\n  assert.equal(latest?.tag, "0005_delivery_fee_per_area");\n\n  const snapshot = JSON.parse(\n    fs.readFileSync(\n      path.join(\n        repositoryRoot,\n        "lib",\n        "db",\n        "drizzle",\n        "meta",\n        "0005_snapshot.json",\n      ),\n      "utf8",\n    ),\n  );\n\n  assert.ok(snapshot.tables?.["public.orders"], "orders table missing from 0005");\n'''
new = '''  const { snapshotName } = latestCommittedMigration();\n  const snapshot = JSON.parse(\n    fs.readFileSync(\n      path.join(\n        repositoryRoot,\n        "lib",\n        "db",\n        "drizzle",\n        "meta",\n        snapshotName,\n      ),\n      "utf8",\n    ),\n  );\n\n  assert.ok(snapshot.tables?.["public.orders"], "orders table missing from latest snapshot");\n'''
replace(rel, old, new)
text = read(rel)
text = text.replace('"orders.version missing from 0005"', '"orders.version missing from latest snapshot"')
text = text.replace('`${table} missing from 0005`', '`${table} missing from latest snapshot`')
text = text.replace('"raw training customer_message authority survived 0005"', '"raw training customer_message authority survived latest snapshot"')
text = text.replace('"training customer_text_hash missing from 0005"', '"training customer_text_hash missing from latest snapshot"')
write(rel, text)

# Generalize disposable acceptance to the entire committed chain. This keeps
# reproducibility strict while allowing legitimate append-only migrations.
rel = "scripts/tests/postgresql-disposable-acceptance.test.mjs"
anchor = '''function assertSameBytes(left, right, label) {\n  assert.deepEqual(\n    fs.readFileSync(left),\n    fs.readFileSync(right),\n    `${label} is not byte-for-byte reproducible`,\n  );\n}\n'''
insert = anchor + '''\nfunction committedMigrationState() {\n  const journal = JSON.parse(\n    fs.readFileSync(\n      path.join(committedDrizzleDirectory, "meta", "_journal.json"),\n      "utf8",\n    ),\n  );\n  const entries = Array.isArray(journal.entries) ? journal.entries : [];\n  assert.ok(entries.length >= 2, "committed Drizzle journal is incomplete");\n  const latest = entries.at(-1);\n  assert.ok(Number.isInteger(latest?.idx), "latest committed Drizzle migration is missing");\n  const snapshotName = `${String(latest.idx).padStart(4, "0")}_snapshot.json`;\n  const snapshot = JSON.parse(\n    fs.readFileSync(path.join(committedDrizzleDirectory, "meta", snapshotName), "utf8"),\n  );\n  return { entries, latest, snapshotName, snapshot };\n}\n'''
replace(rel, anchor, insert)
old = '''    assert.equal(report.generated_entries, 6);\n\n    for (const relativePath of [\n      "0002_cross_lane_stage.sql",\n      "0003_cross_lane_cleanup.sql",\n      "meta/0002_snapshot.json",\n      "meta/0003_snapshot.json",\n      "0004_product_shipping_measurements.sql",\n      "meta/0004_snapshot.json",\n      "0005_delivery_fee_per_area.sql",\n      "meta/0005_snapshot.json",\n    ]) {\n      assertSameBytes(\n        path.join(generatedDirectory, relativePath),\n        path.join(committedDrizzleDirectory, relativePath),\n        relativePath,\n      );\n    }\n\n    const journal = JSON.parse(\n      fs.readFileSync(\n        path.join(generatedDirectory, "meta", "_journal.json"),\n        "utf8",\n      ),\n    );\n    assert.equal(journal.entries?.length, 6);\n    assert.deepEqual(\n      journal.entries.map(({ idx, tag }) => [idx, tag]),\n      [\n        [0, "0000_even_kulan_gath"],\n        [1, "0001_military_proteus"],\n        [2, "0002_cross_lane_stage"],\n        [3, "0003_cross_lane_cleanup"],\n        [4, "0004_product_shipping_measurements"],\n        [5, "0005_delivery_fee_per_area"],\n      ],\n    );\n'''
new = '''    const committed = committedMigrationState();\n    assert.equal(report.generated_entries, committed.entries.length);\n\n    for (const entry of committed.entries.slice(2)) {\n      const prefix = String(entry.idx).padStart(4, "0");\n      for (const relativePath of [\n        `${entry.tag}.sql`,\n        `meta/${prefix}_snapshot.json`,\n      ]) {\n        assertSameBytes(\n          path.join(generatedDirectory, relativePath),\n          path.join(committedDrizzleDirectory, relativePath),\n          relativePath,\n        );\n      }\n    }\n\n    const journal = JSON.parse(\n      fs.readFileSync(\n        path.join(generatedDirectory, "meta", "_journal.json"),\n        "utf8",\n      ),\n    );\n    assert.deepEqual(\n      journal.entries.map(({ idx, tag }) => [idx, tag]),\n      committed.entries.map(({ idx, tag }) => [idx, tag]),\n    );\n'''
replace(rel, old, new)
old = '''      assert.equal(smokeReport.ok, true);\n      assert.equal(smokeReport.snapshot, "0005_snapshot.json");\n      assert.equal(smokeReport.tables, 60);\n      assert.equal(smokeReport.migrations, 6);\n'''
new = '''      assert.equal(smokeReport.ok, true);\n      const committed = committedMigrationState();\n      assert.equal(smokeReport.snapshot, committed.snapshotName);\n      assert.equal(smokeReport.tables, Object.keys(committed.snapshot.tables || {}).length);\n      assert.equal(smokeReport.migrations, committed.entries.length);\n'''
replace(rel, old, new)

print("generalized latest-migration tests for append-only history")
