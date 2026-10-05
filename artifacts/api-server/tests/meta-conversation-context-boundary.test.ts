import assert from "node:assert/strict";
import test from "node:test";

import { decideMetaKnowledgeReply, mapConversationContextRow } from "../src/services/postgresMetaAutoReplyIntent.js";

test("historical trusted video observation never becomes customer-authored text", () => {
  const matchedRecordId = "catalog-product:video-history-proof";
  const mapped = mapConversationContextRow({
    sender: "customer",
    text: "[video]",
    created_at: "2026-10-06T00:00:00.000Z",
    metadata: {
      matched_record_id: matchedRecordId,
      media: {
        video_sha256: "a".repeat(64),
        video_vision_provider_id: "test-video-provider",
        video_vision_model: "test-video-model",
        video_observation: "كم سعره؟",
      },
    },
  });

  assert.equal(mapped.sender, "customer");
  assert.equal(mapped.text, "[video]");
  assert.notEqual(mapped.text, "كم سعره؟");
  assert.equal(mapped.matchedRecordId, matchedRecordId);
  assert.equal(mapped.trustedCatalogRef, true);
});

test("historical trusted audio transcript remains customer-authored speech", () => {
  const mapped = mapConversationContextRow({
    sender: "customer",
    text: "[audio]",
    created_at: "2026-10-06T00:00:00.000Z",
    metadata: {
      media: {
        audio_sha256: "b".repeat(64),
        transcription_provider_id: "test-audio-provider",
        transcription_model: "test-audio-model",
        audio_transcript: "هل متوفر؟",
      },
    },
  });

  assert.equal(mapped.text, "هل متوفر؟");
});

test("quoted historical video stays context instead of becoming current intent", () => {
  const currentText = "current customer request";
  const quoted = mapConversationContextRow({
    sender: "customer",
    text: "[video]",
    created_at: "2026-10-06T00:00:02.000Z",
    metadata: {
      matched_record_id: "catalog-product:quoted-video-proof",
      media: {
        video_sha256: "c".repeat(64),
        video_vision_provider_id: "test-video-provider",
        video_vision_model: "test-video-model",
        video_observation: "historical generated observation",
      },
    },
  });

  assert.equal(currentText, "current customer request");
  assert.equal(quoted.text, "[video]");
  assert.notEqual(quoted.text, currentText);
  assert.notEqual(quoted.text, "historical generated observation");
});


test("knowledge decision exceptions are normalized to the Meta fail-closed code", async () => {
  const input = {
    merchantId: "merchant-decision-failure-proof",
    customerText: "هل هذا المنتج متوفر؟",
    requestId: "event-decision-failure-proof",
    conversationId: "conversation-decision-failure-proof",
    customerExternalId: "customer-decision-failure-proof",
    recentMessages: [],
  };

  await assert.rejects(
    () => decideMetaKnowledgeReply(input, async () => {
      throw new Error("simulated decision dependency outage");
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "META_REPLY_DECISION_UNAVAILABLE");
      assert.equal((error as Error).message, "Knowledge reply decision is unavailable");
      assert.doesNotMatch((error as Error).message, /simulated|dependency|outage/i);
      return true;
    },
  );
});
