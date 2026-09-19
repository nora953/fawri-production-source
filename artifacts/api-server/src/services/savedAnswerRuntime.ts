import { getPostgresKnowledgeManagementRuntime } from "./knowledge/postgresKnowledgeManagementRuntime.js";
import type { KnowledgeLanguage } from "./knowledge/types.js";

export function listMerchantSavedAnswers(merchantId: string) {
  return getPostgresKnowledgeManagementRuntime().listSavedAnswers(merchantId);
}

export function listMerchantSavedAnswersPage(
  merchantId: string,
  options: { limit?: number; offset?: number } = {},
) {
  return getPostgresKnowledgeManagementRuntime().listSavedAnswersPage(
    merchantId,
    options,
  );
}

export function createMerchantSavedAnswer(input: {
  merchantId: string;
  category: string;
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
  category?: string;
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
