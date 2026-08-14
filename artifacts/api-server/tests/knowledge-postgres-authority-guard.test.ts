import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const srcRoot = path.resolve(process.cwd(), "src");

const activeKnowledgeFiles = [
  "services/savedAnswerRuntime.ts",
  "services/trainingRuntime.ts",
  "services/merchantLifecycle.ts",
  "services/knowledge/knowledgeLifecycle.ts",
  "services/knowledge/postgresKnowledgeLifecycle.ts",
  "routes/saved-answer-operations.ts",
  "routes/training-operations.ts",
  "routes/knowledge-operations.ts",
];

function read(relativePath: string): string {
  return fs.readFileSync(path.join(srcRoot, relativePath), "utf8");
}

test("active Knowledge management paths cannot fall back to legacy JSON authority", () => {
  for (const relativePath of activeKnowledgeFiles) {
    const source = read(relativePath);
    assert.equal(
      source.includes("getKnowledgeRepository"),
      false,
      `${relativePath} must not import or call getKnowledgeRepository`,
    );
    assert.equal(
      source.includes("knowledge-runtime.json"),
      false,
      `${relativePath} must not depend on knowledge-runtime.json`,
    );
  }
});

test("merchant lifecycle deletion is wired directly to PostgreSQL Knowledge cleanup", () => {
  const lifecycle = read("services/merchantLifecycle.ts");
  assert.match(lifecycle, /deleteMerchantKnowledgePostgresData/);
  assert.doesNotMatch(lifecycle, /deleteMerchantSavedAnswersData/);
  assert.doesNotMatch(lifecycle, /deleteMerchantBotTrainingData/);

  const compatibilityLifecycle = read("services/knowledge/knowledgeLifecycle.ts");
  assert.doesNotMatch(compatibilityLifecycle, /registerMerchantSavedAnswersDeletion/);
  assert.doesNotMatch(compatibilityLifecycle, /registerMerchantBotTrainingDeletion/);
});
