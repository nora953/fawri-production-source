import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const auditPath = path.join(
  repositoryRoot,
  "scripts",
  "audit-browser-operational-storage.mjs",
);

function fixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-storage-audit-"));
  const sourceDirectory = path.join(root, "artifacts", "fawri", "src");
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDirectory, "storage.ts"),
    [
      'localStorage.setItem("fawri_conversations", JSON.stringify([]));',
      'window.localStorage.getItem("theme");',
      'const runtimeKey = "merchant-" + merchantId;',
      "sessionStorage.getItem(runtimeKey);",
      "localStorage.clear();",
    ].join("\n"),
    "utf8",
  );
  return root;
}

function snapshot(root) {
  const filePath = path.join(root, "artifacts", "fawri", "src", "storage.ts");
  const bytes = fs.readFileSync(filePath);
  return {
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function runAudit(root, enforce = false) {
  return spawnSync(process.execPath, [auditPath, root], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      FAWRI_STORAGE_AUDIT_FAIL_ON_OPERATIONAL: enforce ? "1" : "0",
    },
  });
}

test("storage audit reports operational, preference, dynamic, and clear usage read-only", () => {
  const root = fixtureRepository();
  try {
    const before = snapshot(root);
    const result = runAudit(root);
    const after = snapshot(root);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(after, before, "storage audit modified source files");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.mode, "read_only");
    assert.equal(report.summary.scanned_files, 1);
    assert.equal(report.summary.findings, 4);
    assert.equal(report.summary.classification_counts.operational, 2);
    assert.equal(report.summary.classification_counts.ui_preference, 1);
    assert.equal(report.summary.classification_counts.dynamic_review_required, 1);
    assert.deepEqual(report.operational_keys.sort(), ["*", "fawri_conversations"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("storage audit enforcement fails while operational authorities remain", () => {
  const root = fixtureRepository();
  try {
    const result = runAudit(root, true);
    assert.equal(result.status, 2, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.summary.enforcement_enabled, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("storage audit succeeds when only harmless preferences remain", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fawri-storage-safe-"));
  try {
    const sourceDirectory = path.join(root, "artifacts", "fawri", "src");
    fs.mkdirSync(sourceDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDirectory, "preferences.ts"),
      'localStorage.setItem("interface_language", "ar");\n',
      "utf8",
    );

    const result = runAudit(root, true);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.summary.classification_counts.ui_preference, 1);
    assert.equal(report.summary.operational_keys, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
