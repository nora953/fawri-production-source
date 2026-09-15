import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditKnowledgeRuntime } from "../audit-knowledge-operations.mjs";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../..");
const scriptPath = path.join(repoRoot, "scripts/audit-knowledge-operations.mjs");

function validState() {
  return {
    schemaVersion: 1,
    savedAnswers: [{
      id: "saved-a",
      merchantId: "merchant-a",
      category: "delivery",
      questionPattern: "كم التوصيل",
      answerText: "يومان",
      language: "ar",
      source: "merchant_approved",
      active: true,
      version: 1,
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
    }],
    trainingRequests: [{
      id: "training-a",
      merchantId: "merchant-a",
      customerTextPreview: "رقمي [REDACTED_PHONE]",
      customerTextHash: "sha256:test",
      detectedIntent: "delivery",
      detectedLanguage: "ar",
      reason: "knowledge_gap",
      suggestedReply: "يومان",
      suggestedReplySource: "merchant_draft",
      status: "approved",
      rejectionReason: null,
      version: 2,
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
    }],
    learnedAnswers: [{
      id: "learned-a",
      merchantId: "merchant-a",
      intent: "delivery",
      language: "ar",
      examples: ["كم التوصيل"],
      keywords: ["توصيل"],
      answerText: "يومان",
      source: "merchant_approved",
      approvalStatus: "approved",
      confidence: 1,
      safeToAutoReply: true,
      trainingRequestId: "training-a",
      version: 1,
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
    }],
    auditEvents: [{
      id: "audit-a",
      merchantId: "merchant-a",
      action: "knowledge_decision",
      entityType: "decision",
      entityId: null,
      actor: "system",
      outcome: "success",
      customerTextHash: "sha256:test",
      customerTextLength: 22,
      metadata: { stage: "approved_saved_answer" },
      createdAt: "2026-08-07T00:00:00.000Z",
    }],
  };
}

test("audit accepts approved tenant-consistent knowledge", () => {
  const result = auditKnowledgeRuntime(validState());
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(result.summary.merchants, 1);
});

test("audit rejects generated trust, cross-tenant references, and full customer logs", () => {
  const state = validState();
  state.trainingRequests[0].merchantId = "merchant-b";
  state.trainingRequests[0].customerText = "full customer secret";
  state.learnedAnswers[0].source = "openai_generated";
  state.learnedAnswers[0].approvalStatus = "approved";
  state.learnedAnswers[0].safeToAutoReply = true;
  const result = auditKnowledgeRuntime(state);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /generated learned answer/);
  assert.match(result.errors.join("\n"), /crosses tenant boundary/);
  assert.match(result.errors.join("\n"), /full customer content field is forbidden/);
});

test("CLI exits nonzero for an invalid runtime", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "knowledge-audit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runtimePath = path.join(directory, "knowledge-runtime.json");
  const invalid = validState();
  invalid.learnedAnswers[0].source = "openai_generated";
  invalid.learnedAnswers[0].safeToAutoReply = true;
  await writeFile(runtimePath, JSON.stringify(invalid));
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: { ...process.env, FAWRI_KNOWLEDGE_RUNTIME_PATH: runtimePath },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /"ok": false/);
});


test("knowledge routes derive tenant identity only from the authenticated session", async () => {
  const files = [
    "artifacts/api-server/src/routes/knowledge-operations.ts",
    "artifacts/api-server/src/routes/saved-answer-operations.ts",
    "artifacts/api-server/src/routes/training-operations.ts",
  ];
  for (const file of files) {
    const content = await readFile(path.join(repoRoot, file), "utf8");
    assert.match(content, /getMerchantIdFromSession\(res\)/, file);
    assert.doesNotMatch(content, /req\.(body|query|params)\??\.merchantId/, file);
  }
  const trainingRoute = await readFile(
    path.join(repoRoot, "artifacts/api-server/src/routes/training-operations.ts"),
    "utf8",
  );
  assert.match(trainingRoute, /const source = "merchant_draft" as const/);
  assert.doesNotMatch(trainingRoute, /req\.body\??\.source/);
});

test("active knowledge pages contain no operational browser storage or merchant-id authority", async () => {
  const files = [
    "artifacts/fawri/src/pages/dashboard/ServerSavedAnswersPage.tsx",
    "artifacts/fawri/src/pages/dashboard/SavedAnswersPage.ts",
    "artifacts/fawri/src/pages/dashboard/ServerTrainingPage.tsx",
    "artifacts/fawri/src/pages/dashboard/TrainingPage.ts",
  ];
  for (const file of files) {
    const content = await readFile(path.join(repoRoot, file), "utf8");
    assert.doesNotMatch(content, /localStorage|sessionStorage|getCurrentMerchant|merchantId=/i, file);
  }
});
