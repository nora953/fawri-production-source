import { TrainingStore } from "./trainingStore.js";
import { normalizeKnowledgeText } from "./normalization.js";
import type {
  KnowledgeLanguage,
  LearnedAnswerRecord,
  SavedAnswerRecord,
  SemanticDocument,
} from "./types.js";

export {
  KnowledgeConflictError,
  KnowledgeNotFoundError,
  KnowledgeTransitionError,
} from "./knowledgeStateStore.js";
export type { KnowledgeRepositoryOptions } from "./knowledgeStateStore.js";

export class KnowledgeRepository extends TrainingStore {
  listLearnedAnswers(merchantId: string): LearnedAnswerRecord[] {
    return this.readState().learnedAnswers
      .filter((answer) => answer.merchantId === merchantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  findApprovedSavedAnswer(params: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
  }): SavedAnswerRecord | null {
    const normalizedCustomer = normalizeKnowledgeText(params.customerText);
    if (!normalizedCustomer) return null;
    const candidates = this.readState().savedAnswers.filter(
      (answer) =>
        answer.merchantId === params.merchantId &&
        answer.active &&
        answer.source === "merchant_approved",
    );

    const exact = candidates.find(
      (answer) => normalizeKnowledgeText(answer.questionPattern) === normalizedCustomer,
    );
    if (exact) return exact;

    const contained = candidates
      .filter((answer) => {
        const pattern = normalizeKnowledgeText(answer.questionPattern);
        return pattern.length >= 4 &&
          (normalizedCustomer.includes(pattern) || pattern.includes(normalizedCustomer));
      })
      .sort((left, right) => {
        const leftLanguage = left.language === params.language ? 1 : 0;
        const rightLanguage = right.language === params.language ? 1 : 0;
        return rightLanguage - leftLanguage || right.questionPattern.length - left.questionPattern.length;
      });
    return contained[0] || null;
  }

  listApprovedSemanticDocuments(merchantId: string): SemanticDocument[] {
    const state = this.readState();
    const saved: SemanticDocument[] = state.savedAnswers
      .filter(
        (answer) =>
          answer.merchantId === merchantId &&
          answer.active &&
          answer.source === "merchant_approved",
      )
      .map((answer) => ({
        id: answer.id,
        merchantId: answer.merchantId,
        question: answer.questionPattern,
        answer: answer.answerText,
        language: answer.language,
        source: "merchant_approved",
        kind: "saved_answer",
      }));

    const learned: SemanticDocument[] = state.learnedAnswers
      .filter(
        (answer) =>
          answer.merchantId === merchantId &&
          answer.source === "merchant_approved" &&
          answer.approvalStatus === "approved" &&
          answer.safeToAutoReply,
      )
      .flatMap((answer) =>
        (answer.examples.length ? answer.examples : [answer.intent]).map((example) => ({
          id: answer.id,
          merchantId: answer.merchantId,
          question: example,
          answer: answer.answerText,
          language: answer.language,
          source: "merchant_approved" as const,
          kind: "learned_answer" as const,
        })),
      );

    return [...saved, ...learned];
  }

  deleteMerchantSavedAnswers(merchantId: string): number {
    return this.mutate((state) => {
      const before = state.savedAnswers.length;
      state.savedAnswers = state.savedAnswers.filter(
        (item) => item.merchantId !== merchantId,
      );
      return before - state.savedAnswers.length;
    });
  }

  deleteMerchantTrainingData(merchantId: string): {
    trainingRequests: number;
    learnedAnswers: number;
  } {
    return this.mutate((state) => {
      const beforeTraining = state.trainingRequests.length;
      const beforeLearned = state.learnedAnswers.length;
      state.trainingRequests = state.trainingRequests.filter(
        (item) => item.merchantId !== merchantId,
      );
      state.learnedAnswers = state.learnedAnswers.filter(
        (item) => item.merchantId !== merchantId,
      );
      return {
        trainingRequests: beforeTraining - state.trainingRequests.length,
        learnedAnswers: beforeLearned - state.learnedAnswers.length,
      };
    });
  }

  deleteMerchantKnowledge(merchantId: string): {
    savedAnswers: number;
    trainingRequests: number;
    learnedAnswers: number;
    auditEvents: number;
  } {
    return this.mutate((state) => {
      const before = {
        savedAnswers: state.savedAnswers.length,
        trainingRequests: state.trainingRequests.length,
        learnedAnswers: state.learnedAnswers.length,
        auditEvents: state.auditEvents.length,
      };
      state.savedAnswers = state.savedAnswers.filter((item) => item.merchantId !== merchantId);
      state.trainingRequests = state.trainingRequests.filter((item) => item.merchantId !== merchantId);
      state.learnedAnswers = state.learnedAnswers.filter((item) => item.merchantId !== merchantId);
      state.auditEvents = state.auditEvents.filter((item) => item.merchantId !== merchantId);
      return {
        savedAnswers: before.savedAnswers - state.savedAnswers.length,
        trainingRequests: before.trainingRequests - state.trainingRequests.length,
        learnedAnswers: before.learnedAnswers - state.learnedAnswers.length,
        auditEvents: before.auditEvents - state.auditEvents.length,
      };
    });
  }
}

let singleton: KnowledgeRepository | null = null;

export function getKnowledgeRepository(): KnowledgeRepository {
  if (!singleton) singleton = new KnowledgeRepository();
  return singleton;
}

export function resetKnowledgeRepositoryForTests(): void {
  singleton = null;
}
