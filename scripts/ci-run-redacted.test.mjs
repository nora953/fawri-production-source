import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "ci-run-redacted.mjs");

function runWrapped(childArgs) {
  return spawnSync(process.execPath, [script, "--label", "wrapper-test", "--", process.execPath, ...childArgs], {
    encoding: "utf8",
  });
}

test("wrapper preserves safe command exit code", () => {
  const result = runWrapped(["-e", "process.stdout.write('safe output'); process.exit(7)"]);
  assert.equal(result.status, 7);
  assert.match(result.stdout, /safe output/);
});

test("wrapper fails closed and redacts sensitive output", () => {
  const token = `EAA${"B".repeat(45)}`;
  const result = runWrapped(["-e", `process.stdout.write('page_access_token=${token}')`]);
  assert.equal(result.status, 86);
  assert.equal(result.stdout.includes(token), false);
  assert.equal(result.stderr.includes(token), false);
  assert.match(result.stdout, /\[REDACTED:/);
});

test("wrapper passes safe successful output", () => {
  const result = runWrapped(["-e", "process.stdout.write('ok')"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ok/);
});
