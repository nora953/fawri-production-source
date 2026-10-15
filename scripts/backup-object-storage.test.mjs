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

test("object-storage backup and restore run only inside a disposable root and verify every object", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-object-drill-"));
  try {
    const source = path.join(root, "source");
    const backup = path.join(root, "backup");
    const restored = path.join(root, "restored");
    mkdirSync(path.join(source, "merchant-assets", "nested"), { recursive: true });
    writeFileSync(path.join(source, "merchant-assets", "logo.txt"), "safe-fixture-logo");
    writeFileSync(path.join(source, "merchant-assets", "nested", "image.txt"), "safe-fixture-image");

    const commonEnv = { FAWRI_DISPOSABLE_OBJECT_ROOT: root };
    const backupResult = run(
      "scripts/backup-object-storage.mjs",
      ["--source", source, "--output", backup],
      { ...commonEnv, FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP: "1" },
    );
    assert.equal(backupResult.status, 0, backupResult.stderr);

    const manifestText = readFileSync(path.join(backup, "manifest.json"), "utf8");
    assert.equal(manifestText.includes("safe-fixture-logo"), false);
    assert.equal(manifestText.includes("safe-fixture-image"), false);
    assert.equal(manifestText.includes("secret"), false);

    const restoreResult = run(
      "scripts/restore-object-storage.mjs",
      ["--backup", backup, "--target", restored],
      { ...commonEnv, FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE: "1" },
    );
    assert.equal(restoreResult.status, 0, restoreResult.stderr);
    assert.equal(
      readFileSync(path.join(restored, "merchant-assets", "nested", "image.txt"), "utf8"),
      "safe-fixture-image",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("object restore verifies backup checksums before touching the target", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-object-tamper-"));
  try {
    const source = path.join(root, "source");
    const backup = path.join(root, "backup");
    const restored = path.join(root, "restored");
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "fixture.txt"), "safe-fixture");
    const env = { FAWRI_DISPOSABLE_OBJECT_ROOT: root };

    const backupResult = run(
      "scripts/backup-object-storage.mjs",
      ["--source", source, "--output", backup],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP: "1" },
    );
    assert.equal(backupResult.status, 0, backupResult.stderr);
    writeFileSync(path.join(backup, "objects", "fixture.txt"), "tampered");

    const restoreResult = run(
      "scripts/restore-object-storage.mjs",
      ["--backup", backup, "--target", restored],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE: "1" },
    );
    assert.notEqual(restoreResult.status, 0);
    assert.match(restoreResult.stderr, /verification failed/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("object backup and restore refuse paths outside the approved disposable root", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-object-root-"));
  try {
    const outside = path.join(os.tmpdir(), `outside-${process.pid}`);
    const backupResult = run(
      "scripts/backup-object-storage.mjs",
      ["--source", outside, "--output", path.join(root, "backup")],
      {
        FAWRI_DISPOSABLE_OBJECT_ROOT: root,
        FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP: "1",
      },
    );
    assert.notEqual(backupResult.status, 0);
    assert.match(backupResult.stderr, /outside the approved disposable root/i);

    const restoreResult = run(
      "scripts/restore-object-storage.mjs",
      ["--backup", path.join(root, "backup"), "--target", outside],
      {
        FAWRI_DISPOSABLE_OBJECT_ROOT: root,
        FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE: "1",
      },
    );
    assert.notEqual(restoreResult.status, 0);
    assert.match(restoreResult.stderr, /outside the approved disposable root/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
