import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const drizzleRoot = path.join(repoRoot, "lib", "db", "drizzle");
const metaRoot = path.join(drizzleRoot, "meta");
const stageRoot = path.join(repoRoot, "lib", "db", "migration-stages", "0004");

function gitBlobSha(filePath) {
  const content = fs.readFileSync(filePath);
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

const goldenBlobs = new Map([
  ["lib/db/drizzle/0000_even_kulan_gath.sql", "0c9920caee6ea03d4f4776354bfdecd172234969"],
  ["lib/db/drizzle/0001_military_proteus.sql", "0631349cad0075d927bfcf67a96180111555a5a4"],
  ["lib/db/drizzle/0002_cross_lane_stage.sql", "3355d8cd9324b085961236bbb7afe3553d789313"],
  ["lib/db/drizzle/0003_cross_lane_cleanup.sql", "38d71170941615f60d097c398041352e43d297f6"],
  ["lib/db/drizzle/meta/0000_snapshot.json", "2789825cce5fd6edf4e2a79921d8da067df46992"],
  ["lib/db/drizzle/meta/0001_snapshot.json", "23c23f8572482893b7b474311917b71f7869db64"],
  ["lib/db/drizzle/meta/0002_snapshot.json", "d090b6f30182b086df81f0182e242e6237292380"],
  ["lib/db/drizzle/meta/0003_snapshot.json", "4e6f601b17196e9f5f834aab1cca98d37d2499d2"],
]);

const goldenJournalPrefix = [
  {
    idx: 0,
    version: "7",
    when: 1786021331544,
    tag: "0000_even_kulan_gath",
    breakpoints: true,
  },
  {
    idx: 1,
    version: "7",
    when: 1786100550622,
    tag: "0001_military_proteus",
    breakpoints: true,
  },
  {
    idx: 2,
    version: "7",
    when: 1786120375361,
    tag: "0002_cross_lane_stage",
    breakpoints: true,
  },
  {
    idx: 3,
    version: "7",
    when: 1786120376886,
    tag: "0003_cross_lane_cleanup",
    breakpoints: true,
  },
];

test("historical 0000-0003 migration SQL and snapshots stay byte-identical to Golden", () => {
  for (const [relativePath, expectedSha] of goldenBlobs) {
    assert.equal(
      gitBlobSha(path.join(repoRoot, relativePath)),
      expectedSha,
      `${relativePath} changed from the Golden historical artifact`,
    );
  }
});

test("0004 archives the exact Golden catalog schema as its 0003 preimage", () => {
  const stage = JSON.parse(
    fs.readFileSync(path.join(stageRoot, "stage.json"), "utf8"),
  );
  assert.deepEqual(stage, {
    index: 4,
    name: "product_shipping_measurements",
    when: 1786314600000,
    preimage_files: ["catalog.ts"],
  });

  const preimagePath = path.join(stageRoot, "preimage", "catalog.ts");
  assert.equal(
    gitBlobSha(preimagePath),
    "4fe31d1ddea662454d318c0d915f2f1dd07c0ff0",
    "0004 preimage must remain the exact Golden catalog.ts represented at the 0003 boundary",
  );

  const currentCatalog = fs.readFileSync(
    path.join(repoRoot, "lib", "db", "src", "schema", "catalog.ts"),
    "utf8",
  );
  const archivedCatalog = fs.readFileSync(preimagePath, "utf8");
  for (const field of ["weightG", "lengthMm", "widthMm", "heightMm"]) {
    assert.doesNotMatch(archivedCatalog, new RegExp(`\\b${field}\\b`));
    assert.match(currentCatalog, new RegExp(`\\b${field}\\b`));
  }
});

test("migration journal is an append-only 0,1,2,3,4 chain", () => {
  const journal = JSON.parse(
    fs.readFileSync(path.join(metaRoot, "_journal.json"), "utf8"),
  );
  assert.equal(journal.version, "7");
  assert.equal(journal.dialect, "postgresql");
  assert.deepEqual(journal.entries.slice(0, 4), goldenJournalPrefix);
  assert.deepEqual(
    journal.entries.map((entry) => entry.idx),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(journal.entries[4], {
    idx: 4,
    version: "7",
    when: 1786314600000,
    tag: "0004_product_shipping_measurements",
    breakpoints: true,
  });
});

test("0004 SQL is additive and contains only the physical measurement delta", () => {
  const sqlFiles = fs
    .readdirSync(drizzleRoot)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  assert.deepEqual(sqlFiles, [
    "0000_even_kulan_gath.sql",
    "0001_military_proteus.sql",
    "0002_cross_lane_stage.sql",
    "0003_cross_lane_cleanup.sql",
    "0004_product_shipping_measurements.sql",
  ]);

  const sql = fs.readFileSync(
    path.join(drizzleRoot, "0004_product_shipping_measurements.sql"),
    "utf8",
  );
  assert.doesNotMatch(sql, /\\b(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\\b/i);
  assert.doesNotMatch(sql, /ADD COLUMN[^;]*(?:NOT NULL|DEFAULT)/i);

  for (const table of ["products", "product_variants"]) {
    for (const column of ["weight_g", "length_mm", "width_mm", "height_mm"]) {
      assert.match(
        sql,
        new RegExp(`ALTER TABLE \\\"${table}\\\" ADD COLUMN \\\"${column}\\\" integer`),
      );
    }
  }
  for (const constraint of [
    "products_weight_g_check",
    "products_dimensions_mm_check",
    "product_variants_weight_g_check",
    "product_variants_dimensions_mm_check",
  ]) {
    assert.match(sql, new RegExp(`ADD CONSTRAINT \\\"${constraint}\\\" CHECK`));
  }
  assert.match(sql, /weight_g" BETWEEN 1 AND 100000000/);
  assert.match(sql, /length_mm" BETWEEN 1 AND 100000/);
  assert.match(sql, /width_mm" BETWEEN 1 AND 100000/);
  assert.match(sql, /height_mm" BETWEEN 1 AND 100000/);
});

test("canonical 0004 metadata must include a committed Drizzle snapshot", () => {
  assert.ok(
    fs.existsSync(path.join(metaRoot, "0004_snapshot.json")),
    "0004_snapshot.json must be produced by the canonical generator and committed",
  );
});
