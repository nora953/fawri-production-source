import {
  detectKnowledgeLanguage,
} from "./knowledge/normalization.js";
import { isAuthoritativeFactQuestion } from "./knowledge/postgresKnowledgeRuntime.js";
import { getPostgresKnowledgeManagementRuntime } from "./knowledge/postgresKnowledgeManagementRuntime.js";
import { ManualConversationError } from "./manualConversationRuntime.js";
import {
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority.js";

type CorrectionStage =
  | "approved_saved_answer"
  | "semantic_retrieval"
  | "fawri_encyclopedia"
  | "ai_fallback";

type CorrectionReview = {
  status: "pending" | "approved" | "dismissed";
  customer_message_id: string;
  fawri_message_id: string;
  source_stage: CorrectionStage;
  matched_record_id?: string | null;
  created_at?: string;
  reviewed_at?: string;
  knowledge_id?: string | null;
  apply_mode?: "created" | "updated" | "unchanged" | null;
};

export type MerchantCorrectionReviewResult = {
  status: "approved" | "dismissed";
  messageId: string;
  knowledgeId: string | null;
  applyMode: "created" | "updated" | "unchanged" | null;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function correctionReview(value: unknown): CorrectionReview | null {
  const raw = objectRecord(value);
  const status = text(raw.status);
  const stage = text(raw.source_stage);
  const customerMessageId = text(raw.customer_message_id);
  const fawriMessageId = text(raw.fawri_message_id);
  if (
    (status !== "pending" && status !== "approved" && status !== "dismissed") ||
    (
      stage !== "approved_saved_answer" &&
      stage !== "semantic_retrieval" &&
      stage !== "fawri_encyclopedia" &&
      stage !== "ai_fallback"
    ) ||
    !customerMessageId ||
    !fawriMessageId
  ) {
    return null;
  }
  return {
    status,
    customer_message_id: customerMessageId,
    fawri_message_id: fawriMessageId,
    source_stage: stage,
    matched_record_id: text(raw.matched_record_id) || null,
    created_at: text(raw.created_at) || undefined,
    reviewed_at: text(raw.reviewed_at) || undefined,
    knowledge_id: text(raw.knowledge_id) || null,
    apply_mode:
      raw.apply_mode === "created" ||
      raw.apply_mode === "updated" ||
      raw.apply_mode === "unchanged"
        ? raw.apply_mode
        : null,
  };
}

async function loadCorrectionContext(input: {
  merchantId: string;
  conversationId: string;
  messageId: string;
}) {
  return withMerchantOperationalTransaction(input.merchantId, async (client) => {
    const merchantMessage = await client.query<{
      id: string;
      text: string;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, text, metadata
         FROM messages
        WHERE merchant_id=$1
          AND conversation_id=$2
          AND id=$3
          AND sender='merchant'
          AND status='sent'
        LIMIT 1`,
      [input.merchantId, input.conversationId, input.messageId],
    );
    const message = merchantMessage.rows[0];
    if (!message) {
      throw new ManualConversationError(
        "CORRECTION_REVIEW_NOT_FOUND",
        "correction review was not found",
        404,
      );
    }

    const metadata = objectRecord(message.metadata);
    const review = correctionReview(metadata.correction_review);
    if (!review) {
      throw new ManualConversationError(
        "CORRECTION_REVIEW_NOT_FOUND",
        "correction review was not found",
        404,
      );
    }

    if (review.status !== "pending") {
      return {
        resolved: true as const,
        review,
        merchantReply: message.text,
      };
    }

    const customer = await client.query<{ id: string; text: string }>(
      `SELECT id, text
         FROM messages
        WHERE merchant_id=$1
          AND conversation_id=$2
          AND id=$3
          AND sender='customer'
          AND status='received'
        LIMIT 1`,
      [input.merchantId, input.conversationId, review.customer_message_id],
    );
    const fawri = await client.query<{
      id: string;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, metadata
         FROM messages
        WHERE merchant_id=$1
          AND conversation_id=$2
          AND id=$3
          AND sender='fawri'
          AND status='sent'
        LIMIT 1`,
      [input.merchantId, input.conversationId, review.fawri_message_id],
    );

    const customerMessage = customer.rows[0];
    const fawriMessage = fawri.rows[0];
    if (!customerMessage || !fawriMessage) {
      throw new ManualConversationError(
        "CORRECTION_REVIEW_CONTEXT_INVALID",
        "correction review context is invalid",
        409,
      );
    }

    const fawriMetadata = objectRecord(fawriMessage.metadata);
    if (text(fawriMetadata.knowledge_stage) !== review.source_stage) {
      throw new ManualConversationError(
        "CORRECTION_REVIEW_CONTEXT_INVALID",
        "correction review context is invalid",
        409,
      );
    }

    if (isAuthoritativeFactQuestion(customerMessage.text)) {
      throw new ManualConversationError(
        "CORRECTION_REVIEW_REQUIRES_SOURCE_UPDATE",
        "operational facts must be corrected in their source data",
        422,
      );
    }

    return {
      resolved: false as const,
      review,
      merchantReply: message.text,
      customerQuestion: customerMessage.text,
    };
  });
}

async function resolveReviewMetadata(input: {
  merchantId: string;
  conversationId: string;
  messageId: string;
  expectedStatus: "pending";
  next: CorrectionReview;
}): Promise<void> {
  await withMerchantOperationalTransaction(input.merchantId, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE messages
          SET metadata = jsonb_set(
            metadata,
            '{correction_review}',
            $4::jsonb,
            true
          )
        WHERE merchant_id=$1
          AND conversation_id=$2
          AND id=$3
          AND sender='merchant'
          AND status='sent'
          AND metadata->'correction_review'->>'status'=$5
      RETURNING id`,
      [
        input.merchantId,
        input.conversationId,
        input.messageId,
        JSON.stringify(input.next),
        input.expectedStatus,
      ],
    );
    if (updated.rows.length !== 1) {
      throw new ManualConversationError(
        "CORRECTION_REVIEW_CONFLICT",
        "correction review was already resolved",
        409,
      );
    }
  });
}

export async function reviewMerchantCorrectionAuthoritative(input: {
  merchantId: string;
  conversationId: string;
  messageId: string;
  decision: "approve" | "dismiss";
}): Promise<MerchantCorrectionReviewResult> {
  const merchantId = text(input.merchantId);
  const conversationId = text(input.conversationId);
  const messageId = text(input.messageId);
  if (!merchantId || !conversationId || !messageId) {
    throw new ManualConversationError(
      "CORRECTION_REVIEW_INVALID",
      "correction review input is invalid",
      400,
    );
  }

  const context = await loadCorrectionContext({
    merchantId,
    conversationId,
    messageId,
  });

  if (context.resolved) {
    const sameDecision =
      (input.decision === "approve" && context.review.status === "approved") ||
      (input.decision === "dismiss" && context.review.status === "dismissed");
    if (!sameDecision) {
      throw new ManualConversationError(
        "CORRECTION_REVIEW_CONFLICT",
        "correction review was already resolved",
        409,
      );
    }
    const resolvedStatus =
      context.review.status === "approved" ? "approved" : "dismissed";
    return {
      status: resolvedStatus,
      messageId,
      knowledgeId: context.review.knowledge_id || null,
      applyMode: context.review.apply_mode || null,
    };
  }

  const reviewedAt = new Date().toISOString();
  if (input.decision === "dismiss") {
    const next: CorrectionReview = {
      ...context.review,
      status: "dismissed",
      reviewed_at: reviewedAt,
      knowledge_id: null,
      apply_mode: null,
    };
    await resolveReviewMetadata({
      merchantId,
      conversationId,
      messageId,
      expectedStatus: "pending",
      next,
    });
    return {
      status: "dismissed",
      messageId,
      knowledgeId: null,
      applyMode: null,
    };
  }

  const knowledge = await getPostgresKnowledgeManagementRuntime()
    .applyMerchantCorrection({
      merchantId,
      customerQuestion: context.customerQuestion,
      correctedAnswer: context.merchantReply,
      language: detectKnowledgeLanguage(context.customerQuestion),
      sourceStage: context.review.source_stage,
      matchedRecordId: context.review.matched_record_id || null,
    });

  const next: CorrectionReview = {
    ...context.review,
    status: "approved",
    reviewed_at: reviewedAt,
    knowledge_id: knowledge.savedAnswer.id,
    apply_mode: knowledge.mode,
  };
  await resolveReviewMetadata({
    merchantId,
    conversationId,
    messageId,
    expectedStatus: "pending",
    next,
  });

  return {
    status: "approved",
    messageId,
    knowledgeId: knowledge.savedAnswer.id,
    applyMode: knowledge.mode,
  };
}
