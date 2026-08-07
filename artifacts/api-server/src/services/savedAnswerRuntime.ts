import { getKnowledgeRepository } from "./knowledge/knowledgeRepository.js";
import type { KnowledgeLanguage } from "./knowledge/types.js";

export function listMerchantSavedAnswers(merchantId: string) {
  return getKnowledgeRepository().listSavedAnswers(merchantId);
}

export function createMerchantSavedAnswer(input: {
  merchantId: string;
  category: string;
  questionPattern: string;
  answerText: string;
  language: KnowledgeLanguage;
  active?: boolean;
}) {
  return getKnowledgeRepository().createSavedAnswer(input);
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
  return getKnowledgeRepository().updateSavedAnswer(input);
}

export function deleteMerchantSavedAnswer(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
}) {
  return getKnowledgeRepository().deleteSavedAnswer(input);
}
