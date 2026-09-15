import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbRoot = path.resolve(here, "..");
const drizzleDir = path.join(dbRoot, "drizzle");
const stagesDir = path.join(dbRoot, "migration-stages");

const reviewedStages = [
  {
    index: 13,
    tag: "0013_cashier_staff_station_authority",
    sha256: "ba05d067ae0863278125c0dd696f03ca833a5884445b4d5ec2d0018c8ecc1353",
  },
  {
    index: 14,
    tag: "0014_cashier_operation_attribution",
    sha256: "19dc84fec4dc93e6bc6644cdf559732fd1ae7b43f8cbe980f2bfdee384c72a75",
  },
];

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("reviewed cashier migration SQL remains pinned while snapshots are reproducible", () => {
  for (const stage of reviewedStages) {
    const metadata = JSON.parse(
      fs.readFileSync(
        path.join(stagesDir, String(stage.index).padStart(4, "0"), "stage.json"),
        "utf8",
      ),
    );
    assert.equal(metadata.mode, "reviewed_sql");
    assert.equal(metadata.sql_sha256, stage.sha256);
    assert.equal(sha256(path.join(drizzleDir, `${stage.tag}.sql`)), stage.sha256);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-reviewed-sql-"));
  const output = path.join(tempRoot, "drizzle");
  try {
    const result = spawnSync(process.execPath, [path.join(here, "generate-migration.mjs")], {
      cwd: dbRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "1",
        FAWRI_MIGRATION_OUTPUT_DIR: output,
      },
    });
    assert.equal(
      result.status,
      0,
      `generator failed\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}`,
    );

    for (const stage of reviewedStages) {
      assert.equal(sha256(path.join(output, `${stage.tag}.sql`)), stage.sha256);
      assert.ok(
        fs.existsSync(
          path.join(output, "meta", `${String(stage.index).padStart(4, "0")}_snapshot.json`),
        ),
        `snapshot ${stage.index} is missing`,
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
