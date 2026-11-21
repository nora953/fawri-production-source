import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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


test("disposable object backup refuses parent output without erasing nested source", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-object-overlap-backup-"));
  try {
    const output = path.join(root, "backup");
    const source = path.join(output, "source");
    mkdirSync(source, { recursive: true });
    const image = path.join(source, "merchant-photo.png");
    writeFileSync(image, "synthetic-image-only");
    const result = run("scripts/backup-object-storage.mjs",
      ["--source", source, "--output", output],
      { FAWRI_DISPOSABLE_OBJECT_ROOT: root, FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP: "1" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not overlap/);
    assert.equal(readFileSync(image, "utf8"), "synthetic-image-only",
      "preflight must not remove the source while trying to replace its parent");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("disposable object restore refuses parent target without erasing its child backup", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-object-overlap-restore-"));
  try {
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    const backup = path.join(target, "backup");
    mkdirSync(source, { recursive: true });
    writeFileSync(path.join(source, "fixture.png"), "synthetic");
    const env = { FAWRI_DISPOSABLE_OBJECT_ROOT: root };
    assert.equal(run("scripts/backup-object-storage.mjs",
      ["--source", source, "--output", backup],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP: "1" }).status, 0);
    const manifestPath = path.join(backup, "manifest.json");
    const manifest = readFileSync(manifestPath, "utf8");
    const result = run("scripts/restore-object-storage.mjs",
      ["--backup", backup, "--target", target],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE: "1" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not overlap/);
    assert.equal(readFileSync(manifestPath, "utf8"), manifest,
      "backup source must remain untouched on rejected restore");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("disposable object restore rejects manifest traversal and duplicates without deleting target", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-object-manifest-guard-"));
  try {
    const source = path.join(root, "source");
    const backup = path.join(root, "backup");
    const target = path.join(root, "target");
    mkdirSync(source);
    mkdirSync(target);
    writeFileSync(path.join(source, "safe.png"), "synthetic-object");
    const marker = path.join(target, "preserve-me");
    writeFileSync(marker, "do-not-delete");
    const env = { FAWRI_DISPOSABLE_OBJECT_ROOT: root };
    assert.equal(run("scripts/backup-object-storage.mjs",
      ["--source", source, "--output", backup],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP: "1" }).status, 0);
    const manifestPath = path.join(backup, "manifest.json");
    const original = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const badPath of ["../secret", "nested/../safe.png", "./safe.png",
                           "nested//safe.png", "nested\\safe.png", "safe.png/"]) {
      const altered = structuredClone(original);
      altered.objects[0].path = badPath;
      writeFileSync(manifestPath, JSON.stringify(altered));
      const result = run("scripts/restore-object-storage.mjs",
        ["--backup", backup, "--target", target],
        { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE: "1" });
      assert.notEqual(result.status, 0, "must reject " + badPath);
      assert.equal(readFileSync(marker, "utf8"), "do-not-delete");
    }
    const duplicated = structuredClone(original);
    duplicated.objects.push({ ...duplicated.objects[0] });
    duplicated.object_count += 1;
    duplicated.total_bytes *= 2;
    writeFileSync(manifestPath, JSON.stringify(duplicated));
    const duplicateRun = run("scripts/restore-object-storage.mjs",
      ["--backup", backup, "--target", target],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE: "1" });
    assert.notEqual(duplicateRun.status, 0);
    assert.match(duplicateRun.stderr, /Duplicate object backup path/);
    assert.equal(readFileSync(marker, "utf8"), "do-not-delete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("disposable backup and restore reject symlink aliases before filesystem writes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-object-symlink-guard-"));
  try {
    const source = path.join(root, "source");
    const backup = path.join(root, "backup");
    const target = path.join(root, "target");
    mkdirSync(source);
    mkdirSync(target);
    writeFileSync(path.join(source, "fixture.png"), "safe-fixture");
    const env = { FAWRI_DISPOSABLE_OBJECT_ROOT: root };
    const link = path.join(root, "alias");
    symlinkSync(target, link);
    const deniedBackup = run("scripts/backup-object-storage.mjs",
      ["--source", source, "--output", path.join(link, "backup")],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP: "1" });
    assert.notEqual(deniedBackup.status, 0);
    assert.match(deniedBackup.stderr, /must not use aliases/);
    assert.equal(run("scripts/backup-object-storage.mjs",
      ["--source", source, "--output", backup],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP: "1" }).status, 0);
    const marker = path.join(target, "preserve-me");
    writeFileSync(marker, "safe");
    const deniedTarget = run("scripts/restore-object-storage.mjs",
      ["--backup", backup, "--target", path.join(link, "restored")],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE: "1" });
    assert.notEqual(deniedTarget.status, 0);
    assert.match(deniedTarget.stderr, /must not use aliases/);
    const originalObject = path.join(backup, "objects", "fixture.png");
    rmSync(originalObject);
    symlinkSync(path.join(source, "fixture.png"), originalObject);
    const deniedArchiveObject = run("scripts/restore-object-storage.mjs",
      ["--backup", backup, "--target", target],
      { ...env, FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE: "1" });
    assert.notEqual(deniedArchiveObject.status, 0);
    assert.equal(readFileSync(marker, "utf8"), "safe");
    assert.ok(existsSync(originalObject));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
