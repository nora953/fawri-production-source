import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../../pnpm-workspace.yaml", import.meta.url),
  "utf8",
);

test("pnpm workspace uses pnpm 11 allowBuilds policy", () => {
  assert.doesNotMatch(workspace, /^onlyBuiltDependencies:/m);

  assert.match(workspace, /^allowBuilds:/m);

  for (const dependency of [
    "'@swc/core': true",
    "esbuild: true",
    "msw: true",
    "unrs-resolver: true",
  ]) {
    assert.ok(
      workspace.includes(dependency),
      `expected approved build dependency: ${dependency}`,
    );
  }
});

test("approved dependency builds are explicit booleans", () => {
  assert.doesNotMatch(workspace, /set this to true or false/);
});
