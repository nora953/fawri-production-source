import {
  KnowledgeConflictError,
  KnowledgeNotFoundError,
  KnowledgeStateStore,
  KnowledgeTransitionError,
} from "./knowledgeStateStore.js";
import { boundedText, makeKnowledgeId, normalizeKnowledgeText } from "./normalization.js";
import type { KnowledgeLanguage, SavedAnswerRecord } from "./types.js";

export class SavedAnswerStore extends KnowledgeStateStore {
  listSavedAnswers(merchantId: string): SavedAnswerRecord[] {
    return this.readState().savedAnswers
      .filter((answer) => answer.merchantId === merchantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  createSavedAnswer(input: {
    merchantId: string;
    category: string;
    questionPattern: string;
    answerText: string;
    language: KnowledgeLanguage;
    active?: boolean;
  }): SavedAnswerRecord {
    return this.mutate((state) => {
      const now = new Date().toISOString();
      const record: SavedAnswerRecord = {
        id: makeKnowledgeId("saved"),
        merchantId: boundedText(input.merchantId, 120),
        category: boundedText(input.category, 100) || "custom",
        questionPattern: boundedText(input.questionPattern, 500),
        answerText: boundedText(input.answerText, 2_000),
        language: input.language,
        source: "merchant_approved",
        active: input.active !== false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      if (!record.merchantId || !record.questionPattern || !record.answerText) {
        throw new KnowledgeTransitionError("INVALID_SAVED_ANSWER", "saved answer fields are required");
      }
      const normalizedPattern = normalizeKnowledgeText(record.questionPattern);
      const duplicate = state.savedAnswers.find(
        (answer) =>
          answer.merchantId === record.merchantId &&
          answer.language === record.language &&
          normalizeKnowledgeText(answer.questionPattern) === normalizedPattern,
      );
      if (duplicate) {
        throw new KnowledgeConflictError("saved answer already exists", duplicate);
      }
      state.savedAnswers.push(record);
      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: record.merchantId,
        action: "saved_answer_created",
        entityType: "saved_answer",
        entityId: record.id,
        actor: "merchant",
        outcome: "success",
        metadata: { version: record.version, language: record.language },
        createdAt: now,
      });
      return record;
    });
  }

  updateSavedAnswer(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
    category?: string;
    questionPattern?: string;
    answerText?: string;
    language?: KnowledgeLanguage;
    active?: boolean;
  }): SavedAnswerRecord {
    return this.mutate((state) => {
      const index = state.savedAnswers.findIndex(
        (answer) => answer.id === input.id && answer.merchantId === input.merchantId,
      );
      if (index < 0) throw new KnowledgeNotFoundError("saved answer not found for this merchant");
      const current = state.savedAnswers[index];
      if (current.version !== input.expectedVersion) {
        throw new KnowledgeConflictError("saved answer version conflict", current);
      }

      const updated: SavedAnswerRecord = {
        ...current,
        category: input.category === undefined ? current.category : boundedText(input.category, 100) || "custom",
        questionPattern:
          input.questionPattern === undefined
            ? current.questionPattern
            : boundedText(input.questionPattern, 500),
        answerText:
          input.answerText === undefined ? current.answerText : boundedText(input.answerText, 2_000),
        language: input.language ?? current.language,
        active: input.active ?? current.active,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      if (!updated.questionPattern || !updated.answerText) {
        throw new KnowledgeTransitionError("INVALID_SAVED_ANSWER", "question and answer are required");
      }
      const normalizedPattern = normalizeKnowledgeText(updated.questionPattern);
      const duplicate = state.savedAnswers.find(
        (answer, candidateIndex) =>
          candidateIndex !== index &&
          answer.merchantId === updated.merchantId &&
          answer.language === updated.language &&
          normalizeKnowledgeText(answer.questionPattern) === normalizedPattern,
      );
      if (duplicate) {
        throw new KnowledgeConflictError("saved answer already exists", duplicate);
      }
      state.savedAnswers[index] = updated;
      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: input.merchantId,
        action: "saved_answer_updated",
        entityType: "saved_answer",
        entityId: updated.id,
        actor: "merchant",
        outcome: "success",
        metadata: { previousVersion: current.version, version: updated.version },
        createdAt: updated.updatedAt,
      });
      return updated;
    });
  }

  deleteSavedAnswer(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
  }): SavedAnswerRecord {
    return this.mutate((state) => {
      const index = state.savedAnswers.findIndex(
        (answer) => answer.id === input.id && answer.merchantId === input.merchantId,
      );
      if (index < 0) throw new KnowledgeNotFoundError("saved answer not found for this merchant");
      const current = state.savedAnswers[index];
      if (current.version !== input.expectedVersion) {
        throw new KnowledgeConflictError("saved answer version conflict", current);
      }
      state.savedAnswers.splice(index, 1);
      const now = new Date().toISOString();
      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: input.merchantId,
        action: "saved_answer_deleted",
        entityType: "saved_answer",
        entityId: current.id,
        actor: "merchant",
        outcome: "success",
        metadata: { version: current.version },
        createdAt: now,
      });
      return current;
    });
  }

}
