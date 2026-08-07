import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runSuite(suite, report) {
  return spawnSync(process.execPath, ["scripts/quality-run-gate.mjs", suite, "--report", report], {
    cwd: path.resolve("."),
    encoding: "utf8",
  });
}

test("quality gate reports successful checks", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "fawri-quality-gate-"));
  try {
    const reportPath = path.join(temp, "report.json");
    const result = runSuite("__self-test-pass", reportPath);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.status, "pass");
    assert.deepEqual(report.checks.map((entry) => entry.status), ["pass", "pass"]);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("quality gate continues after a failure and returns an aggregate failure", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "fawri-quality-gate-"));
  try {
    const reportPath = path.join(temp, "report.json");
    const result = runSuite("__self-test-mixed", reportPath);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /self-after-fail/);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.status, "fail");
    assert.deepEqual(report.checks.map((entry) => entry.status), ["pass", "fail", "pass"]);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
