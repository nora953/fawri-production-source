import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function run(script, args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: path.resolve("."),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

test("object storage backup and restore verifies every object", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "fawri-object-drill-"));
  try {
    const source = path.join(temp, "source");
    const backup = path.join(temp, "backup");
    const restored = path.join(temp, "restored");
    mkdirSync(path.join(source, "merchant-assets", "nested"), { recursive: true });
    writeFileSync(path.join(source, "merchant-assets", "logo.txt"), "safe-fixture-logo");
    writeFileSync(path.join(source, "merchant-assets", "nested", "image.txt"), "safe-fixture-image");

    const backupResult = run("scripts/backup-object-storage.mjs", [
      "--source",
      source,
      "--output",
      backup,
    ]);
    assert.equal(backupResult.status, 0, backupResult.stderr);

    const restoreResult = run(
      "scripts/restore-object-storage.mjs",
      ["--backup", backup, "--target", restored],
      { FAWRI_ALLOW_OBJECT_RESTORE: "1" },
    );
    assert.equal(restoreResult.status, 0, restoreResult.stderr);
    assert.equal(
      readFileSync(path.join(restored, "merchant-assets", "nested", "image.txt"), "utf8"),
      "safe-fixture-image",
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("object restore refuses execution without an explicit guard", () => {
  const result = run("scripts/restore-object-storage.mjs", [
    "--backup",
    "missing",
    "--target",
    "missing",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /restore is disabled/i);
});
