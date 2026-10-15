import { TrainingRequestStore } from "./trainingRequestStore.js";
import { KnowledgeConflictError, KnowledgeNotFoundError, KnowledgeTransitionError } from "./knowledgeStateStore.js";
import { boundedText, makeKnowledgeId, uniqueNormalizedList } from "./normalization.js";
import type { LearnedAnswerRecord, TrainingRequestRecord } from "./types.js";

export class TrainingApprovalStore extends TrainingRequestStore {
  approveTrainingRequest(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
    approvedAnswer?: string;
    keywords?: string[];
  }): { request: TrainingRequestRecord; learnedAnswer: LearnedAnswerRecord } {
    return this.mutate((state) => {
      const index = state.trainingRequests.findIndex(
        (request) => request.id === input.id && request.merchantId === input.merchantId,
      );
      if (index < 0) throw new KnowledgeNotFoundError("training request not found for this merchant");
      const current = state.trainingRequests[index];
      if (current.version !== input.expectedVersion) {
        throw new KnowledgeConflictError("training request version conflict", current);
      }
      if (current.status !== "pending_review" && current.status !== "pending_merchant_reply") {
        throw new KnowledgeTransitionError(
          "INVALID_TRAINING_TRANSITION",
          `cannot approve training request from ${current.status}`,
        );
      }
      const approvedAnswer = boundedText(input.approvedAnswer ?? current.suggestedReply, 2_000);
      if (!approvedAnswer) {
        throw new KnowledgeTransitionError("APPROVED_ANSWER_REQUIRED", "approved answer is required");
      }
      const now = new Date().toISOString();
      const updatedRequest: TrainingRequestRecord = {
        ...current,
        suggestedReply: approvedAnswer,
        suggestedReplySource: "merchant_draft",
        status: "approved",
        rejectionReason: null,
        version: current.version + 1,
        updatedAt: now,
      };
      state.trainingRequests[index] = updatedRequest;

      const existingIndex = state.learnedAnswers.findIndex(
        (answer) =>
          answer.merchantId === input.merchantId &&
          answer.trainingRequestId === current.id,
      );
      const currentLearned = existingIndex >= 0 ? state.learnedAnswers[existingIndex] : null;
      const learnedAnswer: LearnedAnswerRecord = {
        id: currentLearned?.id || makeKnowledgeId("learned"),
        merchantId: input.merchantId,
        intent: current.detectedIntent,
        language: current.detectedLanguage,
        examples: uniqueNormalizedList([
          ...(currentLearned?.examples || []),
          current.customerTextPreview,
        ], 20),
        keywords: uniqueNormalizedList([
          ...(currentLearned?.keywords || []),
          ...(input.keywords || []),
          ...current.customerTextPreview.split(/\s+/),
        ], 24),
        answerText: approvedAnswer,
        source: "merchant_approved",
        approvalStatus: "approved",
        confidence: 1,
        safeToAutoReply: true,
        trainingRequestId: current.id,
        version: currentLearned ? currentLearned.version + 1 : 1,
        createdAt: currentLearned?.createdAt || now,
        updatedAt: now,
      };
      if (existingIndex >= 0) state.learnedAnswers[existingIndex] = learnedAnswer;
      else state.learnedAnswers.push(learnedAnswer);

      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: input.merchantId,
        action: "training_request_approved",
        entityType: "training_request",
        entityId: current.id,
        actor: "merchant",
        outcome: "success",
        metadata: {
          previousVersion: current.version,
          version: updatedRequest.version,
          learnedAnswerId: learnedAnswer.id,
        },
        createdAt: now,
      });
      return { request: updatedRequest, learnedAnswer };
    });
  }

  rejectTrainingRequest(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
    reason?: string;
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
          "INVALID_TRAINING_TRANSITION",
          "approved training requests cannot be rejected in place",
        );
      }
      const now = new Date().toISOString();
      const updated: TrainingRequestRecord = {
        ...current,
        status: "rejected",
        rejectionReason: boundedText(input.reason, 300) || "merchant_rejected",
        version: current.version + 1,
        updatedAt: now,
      };
      state.trainingRequests[index] = updated;
      for (let learnedIndex = 0; learnedIndex < state.learnedAnswers.length; learnedIndex += 1) {
        const learned = state.learnedAnswers[learnedIndex];
        if (
          learned.merchantId === input.merchantId &&
          learned.trainingRequestId === current.id
        ) {
          state.learnedAnswers[learnedIndex] = {
            ...learned,
            approvalStatus: "rejected",
            safeToAutoReply: false,
            version: learned.version + 1,
            updatedAt: now,
          };
        }
      }
      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: input.merchantId,
        action: "training_request_rejected",
        entityType: "training_request",
        entityId: current.id,
        actor: "merchant",
        outcome: "rejected",
        metadata: { previousVersion: current.version, version: updated.version },
        createdAt: now,
      });
      return updated;
    });
  }

}
