import { SavedAnswerStore } from "./savedAnswerStore.js";
import { KnowledgeConflictError, KnowledgeNotFoundError, KnowledgeTransitionError } from "./knowledgeStateStore.js";
import { boundedText, detectKnowledgeLanguage, digestCustomerText, makeKnowledgeId } from "./normalization.js";
import { customerTextPreview } from "./redaction.js";
import type { KnowledgeLanguage, SuggestedReplySource, TrainingRequestRecord } from "./types.js";

export class TrainingRequestStore extends SavedAnswerStore {
  listTrainingRequests(merchantId: string): TrainingRequestRecord[] {
    return this.readState().trainingRequests
      .filter((request) => request.merchantId === merchantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createTrainingRequest(input: {
    merchantId: string;
    customerText: string;
    detectedIntent?: string;
    detectedLanguage?: KnowledgeLanguage;
    reason: string;
    suggestedReply?: string | null;
    suggestedReplySource?: SuggestedReplySource | null;
  }): TrainingRequestRecord {
    return this.mutate((state) => {
      const now = new Date().toISOString();
      const customerText = boundedText(input.customerText, 2_000);
      const suggestedReply = boundedText(input.suggestedReply, 2_000) || null;
      const source = suggestedReply ? input.suggestedReplySource || "merchant_draft" : null;
      const record: TrainingRequestRecord = {
        id: makeKnowledgeId("training"),
        merchantId: boundedText(input.merchantId, 120),
        customerTextPreview: customerTextPreview(customerText),
        customerTextHash: digestCustomerText(customerText),
        detectedIntent: boundedText(input.detectedIntent, 100) || "unknown",
        detectedLanguage:
          input.detectedLanguage || detectKnowledgeLanguage(customerText),
        reason: boundedText(input.reason, 300) || "knowledge_gap",
        suggestedReply,
        suggestedReplySource: source,
        status: suggestedReply ? "pending_review" : "pending_merchant_reply",
        rejectionReason: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      if (!record.merchantId || !customerText) {
        throw new KnowledgeTransitionError("INVALID_TRAINING_REQUEST", "merchant and customer text are required");
      }
      state.trainingRequests.push(record);
      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: record.merchantId,
        action: "training_request_created",
        entityType: "training_request",
        entityId: record.id,
        actor: source === "openai_generated" ? "ai_provider" : "system",
        outcome: "success",
        customerTextHash: record.customerTextHash,
        customerTextLength: customerText.length,
        metadata: { status: record.status, suggestedReplySource: source },
        createdAt: now,
      });
      return record;
    });
  }

  proposeTrainingReply(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
    suggestedReply: string;
    source: SuggestedReplySource;
  }): TrainingRequestRecord {
    return this.mutate((state) => {
      const index = state.trainingRequests.findIndex(
        (request) => request.id === input.id && request.merchantId === input.merchantId,
      );
      if (index < 0) throw new KnowledgeNotFoundError("training request not found for this merchant");
      const current = state.trainingRequests[index];
      if (current.version !== input.expectedVersion) {
        throw new KnowledgeConflictError("training request version conflict", current);
      }
      if (current.status === "approved") {
        throw new KnowledgeTransitionError(
          "APPROVED_REQUEST_IMMUTABLE",
          "approved training requests must be reopened through a new request",
        );
      }
      const suggestedReply = boundedText(input.suggestedReply, 2_000);
      if (!suggestedReply) {
        throw new KnowledgeTransitionError("SUGGESTED_REPLY_REQUIRED", "suggested reply is required");
      }
      const updated: TrainingRequestRecord = {
        ...current,
        suggestedReply,
        suggestedReplySource: input.source,
        status: "pending_review",
        rejectionReason: null,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      state.trainingRequests[index] = updated;
      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: input.merchantId,
        action: "training_reply_proposed",
        entityType: "training_request",
        entityId: updated.id,
        actor: input.source === "openai_generated" ? "ai_provider" : "merchant",
        outcome: "success",
        metadata: {
          source: input.source,
          previousVersion: current.version,
          version: updated.version,
        },
        createdAt: updated.updatedAt,
      });
      return updated;
    });
  }

}
