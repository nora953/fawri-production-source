import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDirectory, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(apiRoot, relativePath), "utf8");
}

test("production Meta conversation context persists and reloads trusted catalog references", () => {
  const metaIntent = source("src/services/postgresMetaAutoReplyIntent.ts");
  const engine = source("src/services/ai/knowledgeDecisionEngine.ts");

  assert.match(
    metaIntent,
    /matched_record_id:\s*decision\.matchedRecordId/,
    "Fawri decisions must persist matched_record_id in server message metadata",
  );
  assert.match(
    metaIntent,
    /const matchedRecordId = text\(metadata\.matched_record_id\)/,
    "recent PostgreSQL conversation context must reload matched_record_id",
  );
  assert.match(
    metaIntent,
    /const reasonCode = text\(metadata\.reason_code\)/,
    "safe clarification continuity depends on persisted reason_code",
  );
  assert.match(
    metaIntent,
    /recentMessages,\s*\}\);/,
    "the trusted server-loaded recent message set must reach the knowledge engine",
  );

  assert.match(
    engine,
    /recordId\.startsWith\("catalog-product:"\)/,
    "the engine must recognize stable product conversation references",
  );
  assert.match(
    engine,
    /recordId\.startsWith\("catalog-variant:"\)/,
    "the engine must recognize stable variant conversation references",
  );
  assert.match(
    engine,
    /trustedProductIdHint:\s*catalogConversationRef\?\.productId/,
    "catalog memory must be passed only as an internal trusted product hint",
  );
  assert.match(
    engine,
    /trustedVariantIdHint:\s*catalogConversationRef\?\.variantId/,
    "catalog memory must be passed only as an internal trusted variant hint",
  );
});
