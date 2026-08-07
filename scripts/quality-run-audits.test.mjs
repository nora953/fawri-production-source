import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function fixtureRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "fawri-audit-runner-"));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "artifacts/api-server/data"), { recursive: true });
  return root;
}

function writeAudit(root, name, payload, exitCode = 0) {
  writeFileSync(
    path.join(root, "scripts", name),
    `process.stdout.write(${JSON.stringify(JSON.stringify(payload))}); process.exitCode=${exitCode};\n`,
  );
}

function run(root, output) {
  return spawnSync(
    process.execPath,
    ["scripts/quality-run-audits.mjs", "--audit-root", root, "--output-dir", output],
    { cwd: path.resolve("."), encoding: "utf8" },
  );
}

test("audit runner writes bounded summaries and marks missing lanes as not integrated", () => {
  const root = fixtureRoot();
  const output = path.join(root, "output");
  try {
    writeAudit(root, "audit-order-operations.mjs", {
      ok: true,
      mode: "read_only",
      summary: { operations: 2, severity_counts: { error: 0 }, merchant_id: "hidden" },
      issues: [{ merchant_id: "must-not-appear" }],
      migration_readiness: { ready: true, blockers: [] },
    });
    const result = run(root, output);
    assert.equal(result.status, 0, result.stderr);
    const reportText = readFileSync(path.join(output, "order-operations.json"), "utf8");
    assert.equal(reportText.includes("must-not-appear"), false);
    assert.equal(reportText.includes("merchant_id"), false);
    const manifest = JSON.parse(readFileSync(path.join(output, "manifest.json"), "utf8"));
    assert.equal(manifest.audits_present, 1);
    assert.equal(manifest.audits_not_integrated, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audit runner fails when an integrated audit reports a blocker", () => {
  const root = fixtureRoot();
  const output = path.join(root, "output");
  try {
    writeAudit(
      root,
      "audit-merchant-settings.mjs",
      {
        ok: false,
        mode: "read_only",
        summary: { settings: 3, issues: 1, severity_counts: { error: 1 } },
        migration_readiness: { ready: false, blockers: ["MERCHANT_SETTINGS_INVALID"] },
      },
      2,
    );
    const result = run(root, output);
    assert.equal(result.status, 1);
    const report = JSON.parse(readFileSync(path.join(output, "merchant-settings.json"), "utf8"));
    assert.equal(report.status, "fail");
    assert.deepEqual(report.migration_readiness.blockers, ["MERCHANT_SETTINGS_INVALID"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
