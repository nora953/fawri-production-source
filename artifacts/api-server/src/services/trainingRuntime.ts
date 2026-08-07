import { getKnowledgeRepository } from "./knowledge/knowledgeRepository.js";
import type {
  KnowledgeLanguage,
  SuggestedReplySource,
} from "./knowledge/types.js";

export function listMerchantTrainingRequests(merchantId: string) {
  return getKnowledgeRepository().listTrainingRequests(merchantId);
}

export function createMerchantTrainingRequest(input: {
  merchantId: string;
  customerText: string;
  detectedIntent?: string;
  detectedLanguage?: KnowledgeLanguage;
  reason: string;
  suggestedReply?: string | null;
  suggestedReplySource?: SuggestedReplySource | null;
}) {
  return getKnowledgeRepository().createTrainingRequest(input);
}

export function proposeMerchantTrainingReply(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
  suggestedReply: string;
  source: SuggestedReplySource;
}) {
  return getKnowledgeRepository().proposeTrainingReply(input);
}

export function approveMerchantTrainingRequest(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
  approvedAnswer?: string;
  keywords?: string[];
}) {
  return getKnowledgeRepository().approveTrainingRequest(input);
}

export function rejectMerchantTrainingRequest(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
  reason?: string;
}) {
  return getKnowledgeRepository().rejectTrainingRequest(input);
}
