import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const scriptPath = path.join(
  repoRoot,
  "artifacts",
  "api-server",
  "scripts",
  "provision-owner-admin.ts",
);

test("owner admin provisioning CLI reads stdin in a Node 24 compatible way", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.doesNotMatch(
    source,
    /readFile\(\s*0\s*,/,
    "fs/promises.readFile(0, ...) is not portable to Node 24",
  );
  assert.match(source, /process\.stdin\.setEncoding\("utf8"\)/);
  assert.match(source, /for await \(const chunk of process\.stdin\)/);
  assert.match(source, /PASSWORD_STDIN_REQUIRED/);
});
