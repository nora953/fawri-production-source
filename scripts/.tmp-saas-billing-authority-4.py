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
        raise SystemExit(f"{rel}: expected {count}, found {actual}: {old[:140]!r}")
    write(rel, text.replace(old, new, count))

# Generator test: compare the whole generated append chain to the committed
# chain dynamically while retaining the immutable 0002 Stage-1 hash check.
rel = "scripts/tests/cross-lane-migration-generator.test.mjs"
old = '''function artifactHashes(outputDirectory) {\n  return {\n    stageSql: sha256(\n      path.join(outputDirectory, "0002_cross_lane_stage.sql"),\n    ),\n    cleanupSql: sha256(\n      path.join(outputDirectory, "0003_cross_lane_cleanup.sql"),\n    ),\n    stageSnapshot: sha256(\n      path.join(outputDirectory, "meta", "0002_snapshot.json"),\n    ),\n    cleanupSnapshot: sha256(\n      path.join(outputDirectory, "meta", "0003_snapshot.json"),\n    ),\n    productShippingSql: sha256(\n      path.join(outputDirectory, "0004_product_shipping_measurements.sql"),\n    ),\n    productShippingSnapshot: sha256(\n      path.join(outputDirectory, "meta", "0004_snapshot.json"),\n    ),\n    deliveryAreaSql: sha256(\n      path.join(outputDirectory, "0005_delivery_fee_per_area.sql"),\n    ),\n    deliveryAreaSnapshot: sha256(\n      path.join(outputDirectory, "meta", "0005_snapshot.json"),\n    ),\n  };\n}\n'''
new = '''function artifactHashes(outputDirectory) {\n  const sql = fs\n    .readdirSync(outputDirectory)\n    .filter((name) => /^\\d{4}_.*\\.sql$/.test(name))\n    .sort();\n  const snapshots = fs\n    .readdirSync(path.join(outputDirectory, "meta"))\n    .filter((name) => /^\\d{4}_snapshot\\.json$/.test(name))\n    .sort();\n  return {\n    stageSql: sha256(path.join(outputDirectory, "0002_cross_lane_stage.sql")),\n    all: Object.fromEntries([\n      ...sql.map((name) => [name, sha256(path.join(outputDirectory, name))]),\n      ...snapshots.map((name) => [\n        `meta/${name}`,\n        sha256(path.join(outputDirectory, "meta", name)),\n      ]),\n    ]),\n  };\n}\n'''
replace(rel, old, new)
old = '''        assert.deepEqual(sql, [\n          "0000_even_kulan_gath.sql",\n          "0001_military_proteus.sql",\n          "0002_cross_lane_stage.sql",\n          "0003_cross_lane_cleanup.sql",\n          "0004_product_shipping_measurements.sql",\n          "0005_delivery_fee_per_area.sql",\n        ]);\n\n        const journal = JSON.parse(\n          fs.readFileSync(\n            path.join(run.outputDirectory, "meta", "_journal.json"),\n            "utf8",\n          ),\n        );\n        assert.equal(journal.entries?.length, 6);\n        assert.equal(journal.entries[2]?.tag, "0002_cross_lane_stage");\n        assert.equal(journal.entries[3]?.tag, "0003_cross_lane_cleanup");\n        assert.equal(\n          journal.entries[4]?.tag,\n          "0004_product_shipping_measurements",\n        );\n        assert.equal(journal.entries[5]?.tag, "0005_delivery_fee_per_area");\n'''
new = '''        const committedSql = fs\n          .readdirSync(path.join(databaseDirectory, "drizzle"))\n          .filter((name) => /^\\d{4}_.*\\.sql$/.test(name))\n          .sort();\n        assert.deepEqual(sql, committedSql);\n\n        const journal = JSON.parse(\n          fs.readFileSync(\n            path.join(run.outputDirectory, "meta", "_journal.json"),\n            "utf8",\n          ),\n        );\n        const committedJournal = JSON.parse(\n          fs.readFileSync(\n            path.join(databaseDirectory, "drizzle", "meta", "_journal.json"),\n            "utf8",\n          ),\n        );\n        assert.deepEqual(\n          journal.entries.map(({ idx, tag }) => [idx, tag]),\n          committedJournal.entries.map(({ idx, tag }) => [idx, tag]),\n        );\n        assert.equal(journal.entries[2]?.tag, "0002_cross_lane_stage");\n        assert.equal(journal.entries[3]?.tag, "0003_cross_lane_cleanup");\n        assert.equal(journal.entries[4]?.tag, "0004_product_shipping_measurements");\n        assert.equal(journal.entries[5]?.tag, "0005_delivery_fee_per_area");\n'''
replace(rel, old, new)

# Edge PostgreSQL gate: number of applied migrations follows committed journal.
rel = "scripts/tests/cross-lane-postgresql-edge-gates.test.mjs"
old = '''      const history = await pool.query(\n        'SELECT COUNT(*)::integer AS count FROM "drizzle"."__drizzle_migrations"',\n      );\n      assert.equal(history.rows[0].count, 6, "committed chain must apply 6 migrations");\n'''
new = '''      const history = await pool.query(\n        'SELECT COUNT(*)::integer AS count FROM "drizzle"."__drizzle_migrations"',\n      );\n      const committedJournal = JSON.parse(\n        fs.readFileSync(path.join(committedDrizzle, "meta", "_journal.json"), "utf8"),\n      );\n      assert.equal(\n        history.rows[0].count,\n        committedJournal.entries.length,\n        "committed chain must apply every journaled migration",\n      );\n'''
replace(rel, old, new)

# Product-shipping history remains fixed at 0004, while later append stages are
# allowed and must remain contiguous with the journal.
rel = "scripts/tests/product-shipping-migration-history.test.mjs"
replace(
    rel,
    'test("migration journal keeps the Golden 0-4 prefix and appends 0005", () => {',
    'test("migration journal keeps the Golden 0-4 prefix with contiguous append-only history", () => {',
)
old = '''  assert.deepEqual(\n    journal.entries.map((entry) => entry.idx),\n    [0, 1, 2, 3, 4, 5],\n  );\n'''
new = '''  assert.deepEqual(\n    journal.entries.map((entry) => entry.idx),\n    journal.entries.map((_entry, index) => index),\n    "migration journal must remain contiguous from 0000",\n  );\n'''
replace(rel, old, new)
old = '''  assert.deepEqual(sqlFiles, [\n    "0000_even_kulan_gath.sql",\n    "0001_military_proteus.sql",\n    "0002_cross_lane_stage.sql",\n    "0003_cross_lane_cleanup.sql",\n    "0004_product_shipping_measurements.sql",\n    "0005_delivery_fee_per_area.sql",\n  ]);\n'''
new = '''  const journal = JSON.parse(\n    fs.readFileSync(path.join(metaRoot, "_journal.json"), "utf8"),\n  );\n  assert.deepEqual(\n    sqlFiles,\n    journal.entries.map((entry) => `${entry.tag}.sql`),\n    "SQL files must match the complete append-only migration journal",\n  );\n'''
replace(rel, old, new)

# Delivery migration test must prove 0005 itself, not incorrectly require 0005
# to remain the latest migration forever.
rel = "scripts/tests/delivery-fee-per-area-migration-history.test.mjs"
old = '''  assert.equal(journal.entries.at(-1)?.idx, 5);\n  assert.equal(journal.entries.at(-1)?.tag, "0005_delivery_fee_per_area");\n'''
new = '''  const deliveryEntry = journal.entries.find((entry) => entry.idx === 5);\n  assert.equal(deliveryEntry?.tag, "0005_delivery_fee_per_area");\n'''
replace(rel, old, new)

print("preserved historical migration gates across append-only 0006+")
