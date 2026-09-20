import { getPostgresKnowledgeManagementRuntime } from "./knowledge/postgresKnowledgeManagementRuntime.js";
import type {
  KnowledgeLanguage,
  SavedAnswerCategory,
} from "./knowledge/types.js";

export function listMerchantSavedAnswers(merchantId: string) {
  return getPostgresKnowledgeManagementRuntime().listSavedAnswers(merchantId);
}

export function listMerchantSavedAnswersPage(input: {
  merchantId: string;
  limit?: number;
  beforeUpdatedAt?: string;
  beforeId?: string;
  search?: string;
  categories?: readonly SavedAnswerCategory[];
}) {
  return getPostgresKnowledgeManagementRuntime().listSavedAnswersPage(
    input.merchantId,
    {
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.beforeUpdatedAt ? { beforeUpdatedAt: input.beforeUpdatedAt } : {}),
      ...(input.beforeId ? { beforeId: input.beforeId } : {}),
      ...(input.search ? { search: input.search } : {}),
      ...(input.categories?.length ? { categories: input.categories } : {}),
    },
  );
}

export function createMerchantSavedAnswer(input: {
  merchantId: string;
  category: SavedAnswerCategory;
  questionPattern: string;
  answerText: string;
  language: KnowledgeLanguage;
  active?: boolean;
}) {
  return getPostgresKnowledgeManagementRuntime().createSavedAnswer(input);
}

export function updateMerchantSavedAnswer(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
  category?: SavedAnswerCategory;
  questionPattern?: string;
  answerText?: string;
  language?: KnowledgeLanguage;
  active?: boolean;
}) {
  return getPostgresKnowledgeManagementRuntime().updateSavedAnswer(input);
}

export function deleteMerchantSavedAnswer(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
}) {
  return getPostgresKnowledgeManagementRuntime().deleteSavedAnswer(input);
}
