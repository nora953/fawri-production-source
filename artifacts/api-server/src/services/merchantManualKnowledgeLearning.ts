import {
  getPostgresKnowledgeManagementRuntime,
  type PostgresKnowledgeManagementRuntime,
} from "./knowledge/postgresKnowledgeManagementRuntime.js";
import {
  boundedText,
  normalizeKnowledgeText,
} from "./knowledge/normalization.js";
import { isAuthoritativeFactQuestion } from "./knowledge/postgresKnowledgeRuntime.js";
import { redactSensitiveText } from "./knowledge/redaction.js";

const AUTO_LEARNABLE_INTENTS = new Set(["knowledge_gap", "ai_fallback"]);

const CASE_SPECIFIC_EXCEPTION_TERMS = [
  "discount",
  "special price",
  "coupon",
  "promo code",
  "promotion code",
  "one time",
  "one-time",
  "this time",
  "exception",
  "waive",
  "خصم",
  "تخفيض",
  "سعر خاص",
  "كوبون",
  "كود خصم",
  "استثناء",
  "هذه المره",
  "هذه المرة",
  "هالمره",
  "هالمرة",
  "لمره واحده",
  "لمرة واحدة",
  "داشکاندن",
  "نرخی تایبەت",
  "کۆپۆن",
  "ئەم جارە",
  "تەنها ئەم جارە",
] as const;

export type ManualReplyLearningResult = {
  learned: boolean;
  reasonCode:
    | "MANUAL_REPLY_LEARNED"
    | "TRAINING_REQUEST_MISSING"
    | "TRAINING_REQUEST_NOT_PENDING"
    | "TRAINING_INTENT_NOT_REUSABLE"
    | "AUTHORITATIVE_FACT_NOT_REUSABLE"
    | "CASE_SPECIFIC_REPLY_NOT_REUSABLE"
    | "SENSITIVE_REPLY_NOT_REUSABLE"
    | "MANUAL_REPLY_EMPTY";
  trainingRequestId: string;
  learnedAnswerId?: string;
};

type ManualReplyLearningRuntime = Pick<
  PostgresKnowledgeManagementRuntime,
  "getTrainingRequest" | "approveTrainingRequest"
>;

function containsCaseSpecificException(value: string): boolean {
  const normalized = normalizeKnowledgeText(value);
  if (!normalized) return false;
  return CASE_SPECIFIC_EXCEPTION_TERMS.some((term) =>
    normalized.includes(normalizeKnowledgeText(term)),
  );
}

export async function learnFromMerchantManualReply(input: {
  merchantId: string;
  trainingRequestId: string;
  merchantReply: string;
  runtime?: ManualReplyLearningRuntime;
}): Promise<ManualReplyLearningResult> {
  const merchantId = boundedText(input.merchantId, 120);
  const trainingRequestId = boundedText(input.trainingRequestId, 160);
  const merchantReply = boundedText(input.merchantReply, 2_000);

  if (!merchantReply) {
    return {
      learned: false,
      reasonCode: "MANUAL_REPLY_EMPTY",
      trainingRequestId,
    };
  }

  const runtime = input.runtime || getPostgresKnowledgeManagementRuntime();
  const request = await runtime.getTrainingRequest(merchantId, trainingRequestId);
  if (!request) {
    return {
      learned: false,
      reasonCode: "TRAINING_REQUEST_MISSING",
      trainingRequestId,
    };
  }

  if (
    request.status !== "pending_merchant_reply" &&
    request.status !== "pending_review"
  ) {
    return {
      learned: false,
      reasonCode: "TRAINING_REQUEST_NOT_PENDING",
      trainingRequestId,
    };
  }

  if (!AUTO_LEARNABLE_INTENTS.has(request.detectedIntent)) {
    return {
      learned: false,
      reasonCode: "TRAINING_INTENT_NOT_REUSABLE",
      trainingRequestId,
    };
  }

  if (isAuthoritativeFactQuestion(request.customerTextPreview)) {
    return {
      learned: false,
      reasonCode: "AUTHORITATIVE_FACT_NOT_REUSABLE",
      trainingRequestId,
    };
  }

  if (
    containsCaseSpecificException(request.customerTextPreview) ||
    containsCaseSpecificException(merchantReply)
  ) {
    return {
      learned: false,
      reasonCode: "CASE_SPECIFIC_REPLY_NOT_REUSABLE",
      trainingRequestId,
    };
  }

  if (redactSensitiveText(merchantReply, 2_000) !== merchantReply) {
    return {
      learned: false,
      reasonCode: "SENSITIVE_REPLY_NOT_REUSABLE",
      trainingRequestId,
    };
  }

  const approved = await runtime.approveTrainingRequest({
    merchantId,
    id: request.id,
    expectedVersion: request.version,
    approvedAnswer: merchantReply,
  });

  return {
    learned: true,
    reasonCode: "MANUAL_REPLY_LEARNED",
    trainingRequestId,
    learnedAnswerId: approved.learnedAnswer.id,
  };
}
