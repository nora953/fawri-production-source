import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findSensitiveText, redactSensitiveText } from "./security-redaction-lib.mjs";

const fakeToken = `ghp_${"A".repeat(36)}`;

test("detects and redacts high-confidence secrets without returning the value", () => {
  const input = `authorization: ${fakeToken}`;
  const findings = findSensitiveText(input, { includePii: true });
  assert.ok(findings.length >= 1);
  const redacted = redactSensitiveText(input, { includePii: true });
  assert.equal(redacted.text.includes(fakeToken), false);
  assert.match(redacted.text, /\[REDACTED:/);
});

test("allows disposable local database credentials", () => {
  const findings = findSensitiveText(
    "postgresql://fawri_ci:fawri_ci@127.0.0.1:5432/fawri_ci",
    { includePii: true },
  );
  assert.equal(findings.length, 0);
});

test("output scanner reports only rule and location", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "fawri-output-scan-"));
  try {
    const target = path.join(temp, "log.txt");
    writeFileSync(target, `api_key: ${fakeToken}\n`);
    const result = spawnSync(process.execPath, ["scripts/security-scan-output.mjs", target], {
      cwd: path.resolve("."),
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(fakeToken), false);
    assert.match(result.stdout, /github-token|named-secret/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("CI wrapper never prints raw sensitive output", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/ci-run-redacted.mjs",
      "--label",
      "redaction-test",
      "--",
      process.execPath,
      "-e",
      `process.stdout.write(${JSON.stringify(fakeToken)})`,
    ],
    { cwd: path.resolve("."), encoding: "utf8" },
  );
  assert.equal(result.status, 86);
  assert.equal(`${result.stdout}${result.stderr}`.includes(fakeToken), false);
  assert.match(result.stdout, /REDACTED/);
});
