import { getPostgresKnowledgeManagementRuntime } from "./knowledge/postgresKnowledgeManagementRuntime.js";
import type {
  KnowledgeLanguage,
  SavedAnswerCategory,
} from "./knowledge/types.js";

export function listMerchantSavedAnswers(merchantId: string) {
  return getPostgresKnowledgeManagementRuntime().listSavedAnswers(merchantId);
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
