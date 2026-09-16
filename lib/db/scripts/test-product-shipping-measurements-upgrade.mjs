import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { createStabilizedMigrationFolder } from "./lib/migration-sql-order.mjs";

const { Pool } = pg;

function requireSafeCiDatabase(connectionString) {
  assert.equal(
    process.env.FAWRI_ALLOW_PRODUCT_MEASUREMENT_MIGRATION_TEST,
    "1",
    "FAWRI_ALLOW_PRODUCT_MEASUREMENT_MIGRATION_TEST=1 is required",
  );
  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.replace(/^\//, "");
  assert.ok(
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost",
    "product measurement migration test only permits a local PostgreSQL host",
  );
  assert.equal(
    databaseName,
    "fawri_ci",
    "product measurement migration test only permits the fawri_ci database",
  );
}

function migrationIndex(fileName) {
  const match = fileName.match(/^(\d{4})_/);
  return match ? Number(match[1]) : null;
}

function createMigrationPrefix(sourceFolder, latestIndex) {
  const destination = fs.mkdtempSync(
    path.join(os.tmpdir(), `fawri-migration-prefix-${latestIndex}-`),
  );
  fs.cpSync(sourceFolder, destination, { recursive: true });

  for (const entry of fs.readdirSync(destination, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
    const index = migrationIndex(entry.name);
    if (index !== null && index > latestIndex) {
      fs.rmSync(path.join(destination, entry.name), { force: true });
    }
  }

  const meta = path.join(destination, "meta");
  for (const entry of fs.readdirSync(meta, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^(\d{4})_snapshot\.json$/);
    if (match && Number(match[1]) > latestIndex) {
      fs.rmSync(path.join(meta, entry.name), { force: true });
    }
  }

  const journalPath = path.join(meta, "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  journal.entries = (Array.isArray(journal.entries) ? journal.entries : []).filter(
    (entry) => Number.isInteger(entry.idx) && entry.idx <= latestIndex,
  );
  fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
  return destination;
}

async function publicTables(pool) {
  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((row) => row.table_name);
}

async function migrationCount(pool) {
  const result = await pool.query(
    'SELECT COUNT(*)::integer AS count FROM "drizzle"."__drizzle_migrations"',
  );
  return result.rows[0]?.count;
}

async function expectCheckViolation(callback, message) {
  await assert.rejects(
    callback,
    (error) => error && error.code === "23514",
    message,
  );
}

const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, "DATABASE_URL is required");
requireSafeCiDatabase(connectionString);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const committedMigrationsFolder = path.resolve(currentDirectory, "../drizzle");
const prefixSource = createMigrationPrefix(committedMigrationsFolder, 3);
const measurementSource = createMigrationPrefix(committedMigrationsFolder, 4);
const prefixFolder = createStabilizedMigrationFolder(prefixSource);
const measurementFolder = createStabilizedMigrationFolder(measurementSource);
const repairSource = createMigrationPrefix(committedMigrationsFolder, 5);
const repairFolder = createStabilizedMigrationFolder(repairSource);
const pool = new Pool({ connectionString });
const database = drizzle(pool);

try {
  assert.deepEqual(
    await publicTables(pool),
    [],
    "fawri_ci must be empty before the 0003 -> 0004 upgrade test",
  );

  await migrate(database, { migrationsFolder: prefixFolder });
  assert.equal(await migrationCount(pool), 4, "0000-0003 must be applied first");

  await pool.query(`
    INSERT INTO accounts (id, kind, phone, password_hash)
    VALUES ('measurement-upgrade-merchant', 'merchant', '07999999999', 'test-password-hash')
  `);
  await pool.query(`
    INSERT INTO merchants (id, account_id, owner_name, store_name, activity_type)
    VALUES (
      'measurement-upgrade-merchant',
      'measurement-upgrade-merchant',
      'Migration Owner',
      'Migration Store',
      'test'
    )
  `);
  await pool.query(`
    INSERT INTO products (
      id,
      merchant_id,
      name,
      original_price_iqd,
      current_price_iqd,
      quantity,
      low_stock_threshold,
      variant_stock_mode,
      version,
      status,
      allow_fawri_reply
    ) VALUES (
      'measurement-old-product',
      'measurement-upgrade-merchant',
      'Old Product',
      12000,
      10000,
      7,
      2,
      true,
      3,
      'available',
      true
    )
  `);
  await pool.query(`
    INSERT INTO product_variants (
      id,
      product_id,
      merchant_id,
      name,
      quantity,
      price_adjustment_iqd,
      option_signature,
      version
    ) VALUES (
      'measurement-old-variant',
      'measurement-old-product',
      'measurement-upgrade-merchant',
      'Old Variant',
      7,
      0,
      '0123456789abcdef',
      2
    )
  `);

  const before = await pool.query(`
    SELECT p.name AS product_name,
           p.current_price_iqd,
           p.quantity AS product_quantity,
           v.name AS variant_name,
           v.quantity AS variant_quantity
    FROM products p
    JOIN product_variants v
      ON v.product_id = p.id AND v.merchant_id = p.merchant_id
    WHERE p.id = 'measurement-old-product'
  `);
  assert.equal(before.rows.length, 1);

  await migrate(database, { migrationsFolder: measurementFolder });
  assert.equal(await migrationCount(pool), 5, "0004 must append exactly one migration");

  const after = await pool.query(`
    SELECT p.name AS product_name,
           p.current_price_iqd,
           p.quantity AS product_quantity,
           p.weight_g AS product_weight_g,
           p.length_mm AS product_length_mm,
           p.width_mm AS product_width_mm,
           p.height_mm AS product_height_mm,
           v.name AS variant_name,
           v.quantity AS variant_quantity,
           v.weight_g AS variant_weight_g,
           v.length_mm AS variant_length_mm,
           v.width_mm AS variant_width_mm,
           v.height_mm AS variant_height_mm
    FROM products p
    JOIN product_variants v
      ON v.product_id = p.id AND v.merchant_id = p.merchant_id
    WHERE p.id = 'measurement-old-product'
  `);
  assert.equal(after.rows.length, 1);
  const row = after.rows[0];
  assert.equal(row.product_name, before.rows[0].product_name);
  assert.equal(row.current_price_iqd, before.rows[0].current_price_iqd);
  assert.equal(row.product_quantity, before.rows[0].product_quantity);
  assert.equal(row.variant_name, before.rows[0].variant_name);
  assert.equal(row.variant_quantity, before.rows[0].variant_quantity);
  for (const value of [
    row.product_weight_g,
    row.product_length_mm,
    row.product_width_mm,
    row.product_height_mm,
    row.variant_weight_g,
    row.variant_length_mm,
    row.variant_width_mm,
    row.variant_height_mm,
  ]) {
    assert.equal(value, null, "pre-existing measurement values must remain unknown/NULL");
  }

  const constraints = await pool.query(`
    SELECT table_name, constraint_name
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_type = 'CHECK'
      AND constraint_name IN (
        'products_weight_g_check',
        'products_dimensions_mm_check',
        'product_variants_weight_g_check',
        'product_variants_dimensions_mm_check'
      )
    ORDER BY table_name, constraint_name
  `);
  assert.deepEqual(
    constraints.rows.map((item) => `${item.table_name}:${item.constraint_name}`),
    [
      "product_variants:product_variants_dimensions_mm_check",
      "product_variants:product_variants_weight_g_check",
      "products:products_dimensions_mm_check",
      "products:products_weight_g_check",
    ],
  );

  await expectCheckViolation(
    () => pool.query("UPDATE products SET weight_g = 0 WHERE id = 'measurement-old-product'"),
    "product weight zero must violate the database contract",
  );
  await expectCheckViolation(
    () => pool.query(
      "UPDATE product_variants SET weight_g = -1 WHERE id = 'measurement-old-variant'",
    ),
    "negative variant weight must violate the database contract",
  );

  await migrate(database, { migrationsFolder: repairFolder });
  assert.equal(await migrationCount(pool), 6, "0005 must append the delivery/constraint repair migration");

  const repairedConstraints = await pool.query(`
    SELECT table_name, constraint_name
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND constraint_type = 'CHECK'
      AND constraint_name IN (
        'products_dimensions_mm_all_or_none_check',
        'product_variants_dimensions_mm_all_or_none_check'
      )
    ORDER BY table_name, constraint_name
  `);
  assert.deepEqual(
    repairedConstraints.rows.map((item) => `${item.table_name}:${item.constraint_name}`),
    [
      "product_variants:product_variants_dimensions_mm_all_or_none_check",
      "products:products_dimensions_mm_all_or_none_check",
    ],
  );

  await expectCheckViolation(
    () => pool.query(
      "UPDATE products SET length_mm = 10, width_mm = NULL, height_mm = NULL WHERE id = 'measurement-old-product'",
    ),
    "0005 must reject partial product dimensions",
  );
  await expectCheckViolation(
    () => pool.query(
      "UPDATE product_variants SET length_mm = 10, width_mm = 20, height_mm = NULL WHERE id = 'measurement-old-variant'",
    ),
    "0005 must reject partial variant dimensions",
  );

  await pool.query(`
    UPDATE products
    SET weight_g = 1500, length_mm = 300, width_mm = 200, height_mm = 100
    WHERE id = 'measurement-old-product'
  `);
  await pool.query(`
    UPDATE product_variants
    SET weight_g = 1750, length_mm = 310, width_mm = 210, height_mm = 110
    WHERE id = 'measurement-old-variant'
  `);

  const valid = await pool.query(`
    SELECT p.weight_g AS product_weight_g,
           p.length_mm AS product_length_mm,
           p.width_mm AS product_width_mm,
           p.height_mm AS product_height_mm,
           v.weight_g AS variant_weight_g,
           v.length_mm AS variant_length_mm,
           v.width_mm AS variant_width_mm,
           v.height_mm AS variant_height_mm
    FROM products p
    JOIN product_variants v
      ON v.product_id = p.id AND v.merchant_id = p.merchant_id
    WHERE p.id = 'measurement-old-product'
  `);
  assert.deepEqual(valid.rows[0], {
    product_weight_g: 1500,
    product_length_mm: 300,
    product_width_mm: 200,
    product_height_mm: 100,
    variant_weight_g: 1750,
    variant_length_mm: 310,
    variant_width_mm: 210,
    variant_height_mm: 110,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        upgraded_from: 3,
        upgraded_to: 5,
        migrations_before: 4,
        migrations_after_0004: 5,
        migrations_after_0005: 6,
        old_data_preserved: true,
        old_measurements_remained_null: true,
        product_constraints_enforced: true,
        variant_constraints_enforced: true,
        partial_dimensions_repaired_in_0005: true,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await pool.end();
  fs.rmSync(prefixSource, { recursive: true, force: true });
  fs.rmSync(measurementSource, { recursive: true, force: true });
  fs.rmSync(prefixFolder, { recursive: true, force: true });
  fs.rmSync(measurementFolder, { recursive: true, force: true });
  fs.rmSync(repairSource, { recursive: true, force: true });
  fs.rmSync(repairFolder, { recursive: true, force: true });
}
