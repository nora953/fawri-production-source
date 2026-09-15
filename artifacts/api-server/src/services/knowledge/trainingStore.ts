import { TrainingApprovalStore } from "./trainingApprovalStore.js";
import { boundedText, clampConfidence, digestCustomerText, makeKnowledgeId, uniqueNormalizedList } from "./normalization.js";
import { customerTextPreview } from "./redaction.js";
import type { KnowledgeLanguage, LearnedAnswerRecord, TrainingRequestRecord } from "./types.js";

export class TrainingStore extends TrainingApprovalStore {
  recordGeneratedCandidate(input: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
    intent: string;
    answerText: string;
    confidence: number;
    reason: string;
  }): { trainingRequest: TrainingRequestRecord; learnedAnswer: LearnedAnswerRecord } {
    return this.mutate((state) => {
      const now = new Date().toISOString();
      const customerText = boundedText(input.customerText, 2_000);
      const trainingRequest: TrainingRequestRecord = {
        id: makeKnowledgeId("training"),
        merchantId: boundedText(input.merchantId, 120),
        customerTextPreview: customerTextPreview(customerText),
        customerTextHash: digestCustomerText(customerText),
        detectedIntent: boundedText(input.intent, 100) || "ai_fallback",
        detectedLanguage: input.language,
        reason: boundedText(input.reason, 300) || "ai_generated_candidate",
        suggestedReply: boundedText(input.answerText, 2_000),
        suggestedReplySource: "openai_generated",
        status: "pending_review",
        rejectionReason: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      const learnedAnswer: LearnedAnswerRecord = {
        id: makeKnowledgeId("learned"),
        merchantId: trainingRequest.merchantId,
        intent: trainingRequest.detectedIntent,
        language: input.language,
        examples: [trainingRequest.customerTextPreview],
        keywords: uniqueNormalizedList(trainingRequest.customerTextPreview.split(/\s+/), 24),
        answerText: trainingRequest.suggestedReply || "",
        source: "openai_generated",
        approvalStatus: "pending_review",
        confidence: clampConfidence(input.confidence),
        safeToAutoReply: false,
        trainingRequestId: trainingRequest.id,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      state.trainingRequests.push(trainingRequest);
      state.learnedAnswers.push(learnedAnswer);
      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: trainingRequest.merchantId,
        action: "openai_candidate_recorded",
        entityType: "learned_answer",
        entityId: learnedAnswer.id,
        actor: "ai_provider",
        outcome: "success",
        customerTextHash: trainingRequest.customerTextHash,
        customerTextLength: customerText.length,
        metadata: {
          source: "openai_generated",
          approvalStatus: "pending_review",
          safeToAutoReply: false,
          trainingRequestId: trainingRequest.id,
        },
        createdAt: now,
      });
      return { trainingRequest, learnedAnswer };
    });
  }

}
