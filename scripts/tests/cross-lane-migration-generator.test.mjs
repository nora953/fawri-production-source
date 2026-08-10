import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const databaseDirectory = path.join(repositoryRoot, "lib", "db");
const generatorPath = path.join(
  databaseDirectory,
  "scripts",
  "generate-migration.mjs",
);

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runGenerator(label) {
  const outputDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), `fawri-generator-${label}-`),
  );
  const result = spawnSync(process.execPath, [generatorPath], {
    cwd: databaseDirectory,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FAWRI_MIGRATION_OUTPUT_DIR: outputDirectory,
    },
  });
  assert.equal(
    result.status,
    0,
    [
      `generator ${label} failed with ${result.status}`,
      result.stdout,
      result.stderr,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.match(combined, /"event":"legacy-stage-preflight"/);
  assert.match(combined, /"event":"legacy-stage-postflight"/);
  assert.match(combined, /"event":"legacy-cleanup-preflight"/);
  assert.match(combined, /"event":"legacy-cleanup-postflight"/);
  assert.match(combined, /"event":"append-stage-preflight"/);
  assert.match(combined, /"event":"append-stage-postflight"/);
  assert.doesNotMatch(
    combined,
    /Interactive prompts require|created or renamed|rename prompt/i,
  );
  return { outputDirectory, result };
}

function artifactHashes(outputDirectory) {
  return {
    stageSql: sha256(
      path.join(outputDirectory, "0002_cross_lane_stage.sql"),
    ),
    cleanupSql: sha256(
      path.join(outputDirectory, "0003_cross_lane_cleanup.sql"),
    ),
    stageSnapshot: sha256(
      path.join(outputDirectory, "meta", "0002_snapshot.json"),
    ),
    cleanupSnapshot: sha256(
      path.join(outputDirectory, "meta", "0003_snapshot.json"),
    ),
    productShippingSql: sha256(
      path.join(outputDirectory, "0004_product_shipping_measurements.sql"),
    ),
    productShippingSnapshot: sha256(
      path.join(outputDirectory, "meta", "0004_snapshot.json"),
    ),
    deliveryAreaSql: sha256(
      path.join(outputDirectory, "0005_delivery_fee_per_area.sql"),
    ),
    deliveryAreaSnapshot: sha256(
      path.join(outputDirectory, "meta", "0005_snapshot.json"),
    ),
  };
}

test(
  "Drizzle generator is non-interactive and deterministic across legacy and append stages",
  { timeout: 120_000 },
  () => {
    const generatorSource = fs.readFileSync(generatorPath, "utf8");
    assert.doesNotMatch(
      generatorSource,
      /(writeFileSync|appendFileSync)[\s\S]{0,200}\.sql/i,
      "generator must not edit generated SQL files",
    );

    const first = runGenerator("first");
    const second = runGenerator("second");
    try {
      for (const run of [first, second]) {
        const sql = fs
          .readdirSync(run.outputDirectory)
          .filter((name) => /^\d{4}_.*\.sql$/.test(name))
          .sort();
        assert.deepEqual(sql, [
          "0000_even_kulan_gath.sql",
          "0001_military_proteus.sql",
          "0002_cross_lane_stage.sql",
          "0003_cross_lane_cleanup.sql",
          "0004_product_shipping_measurements.sql",
          "0005_delivery_fee_per_area.sql",
        ]);

        const journal = JSON.parse(
          fs.readFileSync(
            path.join(run.outputDirectory, "meta", "_journal.json"),
            "utf8",
          ),
        );
        assert.equal(journal.entries?.length, 6);
        assert.equal(journal.entries[2]?.tag, "0002_cross_lane_stage");
        assert.equal(journal.entries[3]?.tag, "0003_cross_lane_cleanup");
        assert.equal(
          journal.entries[4]?.tag,
          "0004_product_shipping_measurements",
        );
        assert.equal(journal.entries[5]?.tag, "0005_delivery_fee_per_area");
      }

      const firstHashes = artifactHashes(first.outputDirectory);
      const secondHashes = artifactHashes(second.outputDirectory);
      assert.deepEqual(
        firstHashes,
        secondHashes,
        "same inputs must produce identical SQL and snapshot hashes",
      );

      assert.equal(
        firstHashes.stageSql,
        "f1a7d3435b2b636a03053d7bff77b2c1d25fe1766e4825f8b01c6b3e456b3eda",
        "0002 stage SQL must remain byte-identical to the previously verified Stage-1 Drizzle artifact",
      );
    } finally {
      fs.rmSync(first.outputDirectory, { recursive: true, force: true });
      fs.rmSync(second.outputDirectory, { recursive: true, force: true });
    }
  },
);
