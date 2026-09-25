import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const current = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(
  current,
  "../../../.github/workflows/bot-logic-adversarial-matrix.yml",
);

test("bot adversarial workflow includes every critical reply send-path boundary", () => {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  const requiredPaths = [
    "artifacts/api-server/src/services/ai/**",
    "artifacts/api-server/src/services/knowledge/**",
    "artifacts/api-server/src/services/postgresMetaAutoReplyIntent.ts",
    "artifacts/api-server/src/services/postgresMetaWebhookReplyTransport.ts",
    "artifacts/api-server/src/services/metaWebhookWorker.ts",
    "artifacts/api-server/src/services/metaWebhookWorkerCore.ts",
    "artifacts/api-server/src/services/metaGraphSendClient.ts",
    "artifacts/api-server/src/services/durableJobQueue.ts",
    "artifacts/api-server/src/services/postgresDurableJobQueue.ts",
    "artifacts/api-server/src/services/merchantOperationalAccess.ts",
    "artifacts/api-server/src/services/merchantReply*.ts",
    "artifacts/api-server/src/services/postgresMerchantSettingsAuthority.ts",
    "artifacts/api-server/src/middleware/metaWebhook*.ts",
    "artifacts/api-server/src/middleware/merchantWebhook*.ts",
    "artifacts/api-server/src/middleware/manualConversationWebhookAccess.ts",
    "lib/db/**",
  ];

  for (const required of requiredPaths) {
    assert.equal(
      workflow.includes(`      - "${required}"`),
      true,
      `bot safety workflow path coverage is missing: ${required}`,
    );
  }
});
