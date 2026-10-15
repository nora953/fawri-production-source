import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const knowledgeTests = [
  "artifacts/api-server/tests/knowledge-postgres-runtime.test.ts",
  "artifacts/api-server/tests/knowledge-postgres-operational-facts.test.ts",
  "artifacts/api-server/tests/knowledge-ai-runtime.test.ts",
  "artifacts/api-server/tests/knowledge-ai-security.test.ts",
];

test("Knowledge PostgreSQL runtime gate suite passes with fake/stub transports only", () => {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    pnpm,
    ["exec", "tsx", "--test", "--test-concurrency=1", ...knowledgeTests],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        OPENAI_API_KEY: "",
        FAWRI_OPENAI_API_KEY: "",
        META_ACCESS_TOKEN: "",
        FAWRI_META_ACCESS_TOKEN: "",
      },
    },
  );

  const diagnostic = `${result.stdout || ""}\n${result.stderr || ""}`;
  assert.equal(
    result.status,
    0,
    `Knowledge PostgreSQL runtime tests failed without live transports.\n${diagnostic}`,
  );
  assert.doesNotMatch(diagnostic, /customer-secret@example\.com|07701234567/);
  process.stdout.write("knowledge-postgres-runtime-suite: passed (4 files; live OpenAI/Meta env disabled)\n");
});
