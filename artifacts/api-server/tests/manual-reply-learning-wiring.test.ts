import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const services = path.resolve(here, "../src/services");

test("handoff metadata links the exact training request to the conversation", () => {
  const source = fs.readFileSync(
    path.join(services, "postgresMetaAutoReplyIntent.ts"),
    "utf8",
  );
  assert.match(source, /training_request_id:\s*decision\.trainingRequestId/);
  assert.match(source, /handoff_after_reply:\s*handoff/);
});

test("manual reply learning is tied to the latest handoff and refuses ambiguous later customer turns", () => {
  const source = fs.readFileSync(
    path.join(services, "postgresManualConversationAuthority.ts"),
    "utf8",
  );
  assert.match(source, /metadata->>'handoff_after_reply' = 'true'/);
  assert.match(source, /metadata\.training_request_id/);
  assert.match(source, /sender = 'customer'/);
  assert.match(source, /created_at > \$3::timestamptz/);
  assert.match(source, /learnFromMerchantManualReply\(/);
  assert.match(source, /SET needs_training = FALSE/);
});

test("knowledge-gap reasons trigger only the dedicated scoped merchant notification", () => {
  const autoReplySource = fs.readFileSync(
    path.join(services, "postgresMetaAutoReplyIntent.ts"),
    "utf8",
  );
  const notificationSource = fs.readFileSync(
    path.join(services, "postgresOperationalNotificationAuthority.ts"),
    "utf8",
  );

  assert.match(
    autoReplySource,
    /\[\s*"AUTHORITATIVE_FACT_UNAVAILABLE",\s*"NO_TRUSTED_ANSWER",\s*"AI_CANDIDATE_REQUIRES_MERCHANT_APPROVAL",?\s*\]\.includes\(decision\.reasonCode\)[\s\S]*decision\.trainingRequestId[\s\S]*try\s*\{[\s\S]*notifyMerchantKnowledgeGapPostgres\(\{[\s\S]*merchantId:\s*parsed\.merchantId[\s\S]*trainingRequestId:\s*decision\.trainingRequestId[\s\S]*conversationId:\s*current\.id[\s\S]*\}\s*catch\s*\{[\s\S]*Meta knowledge gap notification failed/,
  );

  assert.doesNotMatch(
    autoReplySource,
    /"PROMPT_INJECTION_BLOCKED"[\s\S]{0,300}notifyMerchantKnowledgeGapPostgres/,
  );

  assert.match(
    notificationSource,
    /type:\s*"operational_knowledge_gap"[\s\S]*sourceEntityType:\s*"training_request"[\s\S]*sourceEntityId:\s*trainingRequestId/,
  );

  assert.match(
    notificationSource,
    /training_request_id:\s*trainingRequestId/,
  );
});
