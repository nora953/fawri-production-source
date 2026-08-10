#!/usr/bin/env python3
from pathlib import Path
import json
import shutil

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

# 0005 now also repairs the latent all-or-none dimensions CHECK bug discovered
# in the committed 0004 SQL. Archive catalog.ts at the exact 0004 boundary
# before modifying it so the canonical staged generator can produce an additive
# 0005 delta without rewriting 0004.
stage_root = p("lib/db/migration-stages/0005")
stage = json.loads((stage_root / "stage.json").read_text(encoding="utf-8"))
preimages = list(stage.get("preimage_files") or [])
if "catalog.ts" not in preimages:
    preimages.append("catalog.ts")
stage["preimage_files"] = preimages
(stage_root / "stage.json").write_text(json.dumps(stage, indent=2) + "\n", encoding="utf-8")
shutil.copy2(p("lib/db/src/schema/catalog.ts"), stage_root / "preimage" / "catalog.ts")

replace(
    "lib/db/src/schema/catalog.ts",
    '''    dimensionsCheck: check(\n      "products_dimensions_mm_check",\n      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,\n    ),\n    versionCheck:''',
    '''    dimensionsCheck: check(\n      "products_dimensions_mm_check",\n      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,\n    ),\n    dimensionsAllOrNoneCheck: check(\n      "products_dimensions_mm_all_or_none_check",\n      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} IS NOT NULL AND ${table.widthMm} IS NOT NULL AND ${table.heightMm} IS NOT NULL AND ${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,\n    ),\n    versionCheck:''',
)
replace(
    "lib/db/src/schema/catalog.ts",
    '''    dimensionsCheck: check(\n      "product_variants_dimensions_mm_check",\n      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,\n    ),\n    versionCheck:''',
    '''    dimensionsCheck: check(\n      "product_variants_dimensions_mm_check",\n      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,\n    ),\n    dimensionsAllOrNoneCheck: check(\n      "product_variants_dimensions_mm_all_or_none_check",\n      sql`(${table.lengthMm} IS NULL AND ${table.widthMm} IS NULL AND ${table.heightMm} IS NULL) OR (${table.lengthMm} IS NOT NULL AND ${table.widthMm} IS NOT NULL AND ${table.heightMm} IS NOT NULL AND ${table.lengthMm} BETWEEN 1 AND 100000 AND ${table.widthMm} BETWEEN 1 AND 100000 AND ${table.heightMm} BETWEEN 1 AND 100000)`,\n    ),\n    versionCheck:''',
)

# The delivery migration must explicitly prove it carries the additive repair.
replace(
    "scripts/tests/delivery-fee-per-area-migration-history.test.mjs",
    '''  assert.match(sql, /ADD COLUMN "delivery_pricing_mode"/);\n  assert.doesNotMatch(sql, /^\\s*(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\\b/im);''',
    '''  assert.match(sql, /ADD COLUMN "delivery_pricing_mode"/);\n  assert.match(sql, /products_dimensions_mm_all_or_none_check/);\n  assert.match(sql, /product_variants_dimensions_mm_all_or_none_check/);\n  assert.doesNotMatch(sql, /^\\s*(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\\b/im);''',
)
replace(
    "scripts/tests/delivery-fee-per-area-migration-history.test.mjs",
    '''    preimage_files: ["merchant-settings.ts", "tenant-security.ts"],''',
    '''    preimage_files: ["merchant-settings.ts", "tenant-security.ts", "catalog.ts"],''',
)

# Turn the historical upgrade script into a two-stage proof: 0004 adds the
# nullable fields and preserves data; 0005 closes the PostgreSQL NULL-semantics
# hole with stricter additive CHECK constraints.
rel = "lib/db/scripts/test-product-shipping-measurements-upgrade.mjs"
text = read(rel)
text = text.replace(
    '''const prefixSource = createMigrationPrefix(committedMigrationsFolder, 3);\nconst prefixFolder = createStabilizedMigrationFolder(prefixSource);\nconst fullFolder = createStabilizedMigrationFolder(committedMigrationsFolder);''',
    '''const prefixSource = createMigrationPrefix(committedMigrationsFolder, 3);\nconst measurementSource = createMigrationPrefix(committedMigrationsFolder, 4);\nconst prefixFolder = createStabilizedMigrationFolder(prefixSource);\nconst measurementFolder = createStabilizedMigrationFolder(measurementSource);\nconst fullFolder = createStabilizedMigrationFolder(committedMigrationsFolder);''',
)
text = text.replace(
    '''  await migrate(database, { migrationsFolder: fullFolder });\n  assert.equal(await migrationCount(pool), 5, "0004 must append exactly one migration");''',
    '''  await migrate(database, { migrationsFolder: measurementFolder });\n  assert.equal(await migrationCount(pool), 5, "0004 must append exactly one migration");''',
)
# Remove the two partial-dimension rejection checks from the 0004-only stage;
# they are invalid under PostgreSQL CHECK NULL semantics and are reintroduced
# immediately after 0005 is applied below.
text = text.replace(
    '''  await expectCheckViolation(\n    () => pool.query(\n      "UPDATE products SET length_mm = 10, width_mm = NULL, height_mm = NULL WHERE id = 'measurement-old-product'",\n    ),\n    "partial product dimensions must violate the database contract",\n  );\n''',
    '',
)
text = text.replace(
    '''  await expectCheckViolation(\n    () => pool.query(\n      "UPDATE product_variants SET length_mm = 10, width_mm = 20, height_mm = NULL WHERE id = 'measurement-old-variant'",\n    ),\n    "partial variant dimensions must violate the database contract",\n  );\n''',
    '',
)
insert_before = '''  await pool.query(`\n    UPDATE products\n    SET weight_g = 1500, length_mm = 300, width_mm = 200, height_mm = 100\n    WHERE id = 'measurement-old-product'\n  `);'''
repair_proof = '''  await migrate(database, { migrationsFolder: fullFolder });\n  assert.equal(await migrationCount(pool), 6, "0005 must append the delivery/constraint repair migration");\n\n  const repairedConstraints = await pool.query(`\n    SELECT table_name, constraint_name\n    FROM information_schema.table_constraints\n    WHERE constraint_schema = 'public'\n      AND constraint_type = 'CHECK'\n      AND constraint_name IN (\n        'products_dimensions_mm_all_or_none_check',\n        'product_variants_dimensions_mm_all_or_none_check'\n      )\n    ORDER BY table_name, constraint_name\n  `);\n  assert.deepEqual(\n    repairedConstraints.rows.map((item) => `${item.table_name}:${item.constraint_name}`),\n    [\n      "product_variants:product_variants_dimensions_mm_all_or_none_check",\n      "products:products_dimensions_mm_all_or_none_check",\n    ],\n  );\n\n  await expectCheckViolation(\n    () => pool.query(\n      "UPDATE products SET length_mm = 10, width_mm = NULL, height_mm = NULL WHERE id = 'measurement-old-product'",\n    ),\n    "0005 must reject partial product dimensions",\n  );\n  await expectCheckViolation(\n    () => pool.query(\n      "UPDATE product_variants SET length_mm = 10, width_mm = 20, height_mm = NULL WHERE id = 'measurement-old-variant'",\n    ),\n    "0005 must reject partial variant dimensions",\n  );\n\n'''
if insert_before not in text:
    raise SystemExit("upgrade proof insertion point missing")
text = text.replace(insert_before, repair_proof + insert_before, 1)
text = text.replace(
    '''        upgraded_from: 3,\n        upgraded_to: 4,\n        migrations_before: 4,\n        migrations_after: 5,''',
    '''        upgraded_from: 3,\n        upgraded_to: 5,\n        migrations_before: 4,\n        migrations_after_0004: 5,\n        migrations_after_0005: 6,''',
)
text = text.replace(
    '''        product_constraints_enforced: true,\n        variant_constraints_enforced: true,''',
    '''        product_constraints_enforced: true,\n        variant_constraints_enforced: true,\n        partial_dimensions_repaired_in_0005: true,''',
)
text = text.replace(
    '''  fs.rmSync(prefixSource, { recursive: true, force: true });\n  fs.rmSync(prefixFolder, { recursive: true, force: true });\n  fs.rmSync(fullFolder, { recursive: true, force: true });''',
    '''  fs.rmSync(prefixSource, { recursive: true, force: true });\n  fs.rmSync(measurementSource, { recursive: true, force: true });\n  fs.rmSync(prefixFolder, { recursive: true, force: true });\n  fs.rmSync(measurementFolder, { recursive: true, force: true });\n  fs.rmSync(fullFolder, { recursive: true, force: true });''',
)
write(rel, text)

print("patch 7 complete")
