import { getPostgresKnowledgeManagementRuntime } from "./knowledge/postgresKnowledgeManagementRuntime.js";
import type {
  KnowledgeLanguage,
  SuggestedReplySource,
} from "./knowledge/types.js";

export function listMerchantTrainingRequests(merchantId: string) {
  return getPostgresKnowledgeManagementRuntime().listTrainingRequests(merchantId);
}

export function listMerchantTrainingRequestsPage(input: {
  merchantId: string;
  limit?: number;
  beforeUpdatedAt?: string;
  beforeId?: string;
  search?: string;
  status?: "pending_merchant_reply" | "pending_review" | "approved" | "rejected";
}) {
  return getPostgresKnowledgeManagementRuntime().listTrainingRequestsPage(
    input.merchantId,
    {
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.beforeUpdatedAt ? { beforeUpdatedAt: input.beforeUpdatedAt } : {}),
      ...(input.beforeId ? { beforeId: input.beforeId } : {}),
      ...(input.search ? { search: input.search } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  );
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
  return getPostgresKnowledgeManagementRuntime().createTrainingRequest(input);
}

export function proposeMerchantTrainingReply(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
  suggestedReply: string;
  source: SuggestedReplySource;
}) {
  return getPostgresKnowledgeManagementRuntime().proposeTrainingReply(input);
}

export function approveMerchantTrainingRequest(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
  approvedAnswer?: string;
  keywords?: string[];
}) {
  return getPostgresKnowledgeManagementRuntime().approveTrainingRequest(input);
}

export function rejectMerchantTrainingRequest(input: {
  merchantId: string;
  id: string;
  expectedVersion: number;
  reason?: string;
}) {
  return getPostgresKnowledgeManagementRuntime().rejectTrainingRequest(input);
}
