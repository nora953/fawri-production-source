import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("clean deployment gate proves the migrated schema with the PostgreSQL-only merchant journey", () => {
  const current = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(current, "../../..");
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github/workflows/clean-deployment-golden-gate.yml"),
    "utf8",
  );

  assert.match(workflow, /POSTGRES_DB: fawri_ci/);
  assert.match(workflow, /Apply every committed migration to empty PostgreSQL/);
  assert.match(workflow, /journal\.entries\.length/);
  assert.match(
    workflow,
    /global-merchant-postgres-http-journey\.integration\.test\.ts/,
  );
  assert.equal(
    workflow.includes("test:global-merchant-journey"),
    false,
    "clean deployment must not use the legacy compatibility golden journey",
  );
  assert.equal(
    workflow.includes("push-force"),
    false,
    "clean deployment must prove committed migrations rather than schema push shortcuts",
  );
});
