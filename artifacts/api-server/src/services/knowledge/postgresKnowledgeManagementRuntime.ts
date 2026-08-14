import { createHash } from "node:crypto";
import { getConfiguredKnowledgeEmbeddingProvider } from "../ai/knowledgeDecisionEngine.js";
import {
  boundedText,
  clampConfidence,
  detectKnowledgeLanguage,
  digestCustomerText,
  makeKnowledgeId,
  normalizeKnowledgeText,
  uniqueNormalizedList,
} from "./normalization.js";
import {
  KnowledgeConflictError,
  KnowledgeNotFoundError,
  KnowledgeTransitionError,
} from "./knowledgeStateStore.js";
import {
  getPostgresKnowledgeSqlClient,
  KnowledgeRuntimeGateError,
  PostgresKnowledgeRuntime,
  type KnowledgeEmbeddingProvider,
  type KnowledgeSqlClient,
  type KnowledgeSqlExecutor,
} from "./postgresKnowledgeRuntime.js";
import { customerTextPreview } from "./redaction.js";
import type {
  KnowledgeAuditEvent,
  KnowledgeLanguage,
  LearnedAnswerRecord,
  SavedAnswerRecord,
  SuggestedReplySource,
  TrainingRequestRecord,
} from "./types.js";

const SAVED_ANSWER_CATEGORIES = [
  "delivery",
  "payment",
  "return_exchange",
  "product",
  "warranty",
  "custom",
] as const;

type SavedAnswerCategory = (typeof SAVED_ANSWER_CATEGORIES)[number];

type PreparedEmbedding = {
  model: string;
  dimensions: number;
  contentHash: string;
  values: number[];
};

type PostgresErrorLike = {
  code?: unknown;
};

function postgresCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return String((error as PostgresErrorLike).code ?? "").trim();
}

function databaseUnavailable(error: unknown): never {
  if (
    error instanceof KnowledgeRuntimeGateError ||
    error instanceof KnowledgeConflictError ||
    error instanceof KnowledgeNotFoundError ||
    error instanceof KnowledgeTransitionError
  ) {
    throw error;
  }
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_DATABASE_UNAVAILABLE",
    "knowledge database is unavailable",
  );
}

function databaseWriteFailed(error: unknown): never {
  if (
    error instanceof KnowledgeRuntimeGateError ||
    error instanceof KnowledgeConflictError ||
    error instanceof KnowledgeNotFoundError ||
    error instanceof KnowledgeTransitionError
  ) {
    throw error;
  }
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_DATABASE_WRITE_FAILED",
    "knowledge database write failed",
  );
}

function requireMerchantId(value: unknown): string {
  const merchantId = boundedText(value, 120);
  if (!merchantId) {
    throw new KnowledgeTransitionError(
      "KNOWLEDGE_MERCHANT_REQUIRED",
      "merchant is required",
    );
  }
  return merchantId;
}

function requireRowMerchant(
  row: Record<string, unknown>,
  requestedMerchantId: string,
): void {
  if (boundedText(row.merchant_id, 120) !== requestedMerchantId) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_TENANT_VIOLATION",
      "knowledge tenant boundary violation",
    );
  }
}

function positiveVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isInteger(version) || version <= 0) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_STATE_INVALID",
      "knowledge state is invalid",
    );
  }
  return version;
}

function isoTimestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_STATE_INVALID",
      "knowledge state is invalid",
    );
  }
  return date.toISOString();
}

function languageValue(value: unknown): KnowledgeLanguage {
  if (value === "ar" || value === "ku" || value === "en") return value;
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_STATE_INVALID",
    "knowledge state is invalid",
  );
}

function booleanValue(value: unknown): boolean {
  if (value === true || value === false) return value;
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_STATE_INVALID",
    "knowledge state is invalid",
  );
}

function jsonStringArray(value: unknown, maximumItems: number): string[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > maximumItems ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_STATE_INVALID",
      "knowledge state is invalid",
    );
  }
  return parsed.map((item) => boundedText(item, 500));
}

function categoryValue(value: unknown): SavedAnswerCategory {
  const category = boundedText(value, 100);
  return (SAVED_ANSWER_CATEGORIES as readonly string[]).includes(category)
    ? (category as SavedAnswerCategory)
    : "custom";
}

function suggestedReplySourceValue(value: unknown): SuggestedReplySource | null {
  if (value === null || value === undefined || value === "") return null;
  if (value === "merchant_draft" || value === "openai_generated") return value;
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_PROVENANCE_INVALID",
    "knowledge provenance is invalid",
  );
}

function trainingStatusValue(value: unknown): TrainingRequestRecord["status"] {
  if (
    value === "pending_merchant_reply" ||
    value === "pending_review" ||
    value === "approved" ||
    value === "rejected"
  ) {
    return value;
  }
  throw new KnowledgeRuntimeGateError(
    "KNOWLEDGE_STATE_INVALID",
    "knowledge state is invalid",
  );
}

function savedAnswerFromRow(
  row: Record<string, unknown>,
  merchantId: string,
): SavedAnswerRecord {
  requireRowMerchant(row, merchantId);
  const source = boundedText(row.source, 40);
  const id = boundedText(row.id, 160);
  const questionPattern = boundedText(row.question_pattern, 500);
  const answerText = boundedText(row.answer_text, 2_000);
  if (!id || !questionPattern || !answerText || source !== "merchant_approved") {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_STATE_INVALID",
      "knowledge state is invalid",
    );
  }
  return {
    id,
    merchantId,
    category: categoryValue(row.category),
    questionPattern,
    answerText,
    language: languageValue(row.language),
    source: "merchant_approved",
    active: booleanValue(row.active),
    version: positiveVersion(row.version),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

function trainingRequestFromRow(
  row: Record<string, unknown>,
  merchantId: string,
): TrainingRequestRecord {
  requireRowMerchant(row, merchantId);
  const id = boundedText(row.id, 160);
  const customerTextPreviewValue = boundedText(row.customer_text_preview, 500);
  const customerTextHash = boundedText(row.customer_text_hash, 64);
  const detectedIntent = boundedText(row.detected_intent, 100);
  const reason = boundedText(row.reason, 300);
  const suggestedReply = boundedText(row.suggested_reply, 2_000) || null;
  const source = suggestedReplySourceValue(row.suggested_reply_source);
  const rejectionReason = boundedText(row.rejection_reason, 500) || null;
  if (
    !id ||
    !detectedIntent ||
    !reason ||
    !/^[0-9a-f]{64}$/i.test(customerTextHash) ||
    (suggestedReply === null) !== (source === null)
  ) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_STATE_INVALID",
      "knowledge state is invalid",
    );
  }
  return {
    id,
    merchantId,
    customerTextPreview: customerTextPreviewValue,
    customerTextHash,
    detectedIntent,
    detectedLanguage: languageValue(row.detected_language),
    reason,
    suggestedReply,
    suggestedReplySource: source,
    status: trainingStatusValue(row.status),
    rejectionReason,
    version: positiveVersion(row.version),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

function learnedAnswerFromRow(
  row: Record<string, unknown>,
  merchantId: string,
): LearnedAnswerRecord {
  requireRowMerchant(row, merchantId);
  const source = boundedText(row.source, 40);
  const approvalStatus = boundedText(row.approval_status, 40);
  const confidence = Number(row.confidence);
  const id = boundedText(row.id, 160);
  const intent = boundedText(row.intent, 100);
  const answerText = boundedText(row.answer_text, 2_000);
  const trainingRequestId = boundedText(row.training_request_id, 160) || null;
  if (
    !id ||
    !intent ||
    !answerText ||
    (source !== "merchant_approved" && source !== "openai_generated") ||
    (approvalStatus !== "pending_review" &&
      approvalStatus !== "approved" &&
      approvalStatus !== "rejected") ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_STATE_INVALID",
      "knowledge state is invalid",
    );
  }
  return {
    id,
    merchantId,
    intent,
    language: languageValue(row.language),
    examples: jsonStringArray(row.examples, 20),
    keywords: jsonStringArray(row.keywords, 24),
    answerText,
    source,
    approvalStatus,
    confidence,
    safeToAutoReply: booleanValue(row.safe_to_auto_reply),
    trainingRequestId,
    version: positiveVersion(row.version),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

function auditActor(action: string): KnowledgeAuditEvent["actor"] {
  if (action === "openai_candidate_recorded") return "ai_provider";
  if (
    action.startsWith("saved_answer_") ||
    action === "training_reply_proposed" ||
    action === "training_request_approved" ||
    action === "training_request_rejected"
  ) {
    return "merchant";
  }
  return "system";
}

function auditOutcome(value: unknown): KnowledgeAuditEvent["outcome"] {
  const outcome = boundedText(value, 40);
  if (
    outcome === "success" ||
    outcome === "conflict" ||
    outcome === "rejected" ||
    outcome === "handoff"
  ) {
    return outcome;
  }
  return "rejected";
}

function auditEntityType(value: unknown): KnowledgeAuditEvent["entityType"] {
  const entityType = boundedText(value, 60);
  if (
    entityType === "saved_answer" ||
    entityType === "training_request" ||
    entityType === "learned_answer" ||
    entityType === "decision"
  ) {
    return entityType;
  }
  return "decision";
}

function auditEventFromRow(
  row: Record<string, unknown>,
  merchantId: string,
): KnowledgeAuditEvent {
  requireRowMerchant(row, merchantId);
  const action = boundedText(row.action, 100);
  const id = boundedText(row.id, 160);
  const customerTextHash = boundedText(row.customer_text_hash, 64) || undefined;
  const customerTextLength =
    row.customer_text_length === null || row.customer_text_length === undefined
      ? undefined
      : Number(row.customer_text_length);
  if (
    !id ||
    !action ||
    (customerTextHash !== undefined && !/^[0-9a-f]{64}$/i.test(customerTextHash)) ||
    (customerTextLength !== undefined &&
      (!Number.isInteger(customerTextLength) ||
        customerTextLength < 0 ||
        customerTextLength > 10_000))
  ) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_STATE_INVALID",
      "knowledge state is invalid",
    );
  }
  return {
    id,
    merchantId,
    action,
    entityType: auditEntityType(row.entity_type),
    entityId: boundedText(row.entity_id, 160) || null,
    actor: auditActor(action),
    outcome: auditOutcome(row.outcome_code),
    customerTextHash,
    customerTextLength,
    injectionSignals: jsonStringArray(row.signal_codes ?? [], 32),
    metadata: {
      decisionCode: boundedText(row.decision_code, 100) || null,
    },
    createdAt: isoTimestamp(row.created_at),
  };
}

function validEmbeddingProvider(
  provider: KnowledgeEmbeddingProvider | null,
): provider is KnowledgeEmbeddingProvider {
  return Boolean(
    provider &&
      boundedText(provider.providerId, 160) &&
      boundedText(provider.model, 160) &&
      provider.model !== "disabled" &&
      Number.isInteger(provider.dimensions) &&
      provider.dimensions > 0 &&
      provider.dimensions <= 4_096 &&
      typeof provider.embed === "function",
  );
}

async function prepareEmbedding(
  provider: KnowledgeEmbeddingProvider | null,
  input: {
    kind: "saved_answer" | "learned_answer";
    language: KnowledgeLanguage;
    question: string;
    answer: string;
  },
): Promise<PreparedEmbedding | null> {
  if (!validEmbeddingProvider(provider)) return null;
  const question = boundedText(input.question, 500);
  const answer = boundedText(input.answer, 2_000);
  if (!question || !answer) return null;

  let raw: readonly number[];
  try {
    raw = await provider.embed(`${question}\n${answer}`);
  } catch (error) {
    if (error instanceof KnowledgeRuntimeGateError) throw error;
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_VECTOR_UNAVAILABLE",
      "knowledge vector provider is unavailable",
    );
  }
  if (
    !Array.isArray(raw) ||
    raw.length !== provider.dimensions ||
    raw.some((value) => !Number.isFinite(Number(value)))
  ) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_VECTOR_INVALID",
      "knowledge vector state is invalid",
    );
  }
  const values = raw.map((value) => Number(value));
  const contentHash = createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.kind,
        language: input.language,
        question: normalizeKnowledgeText(question),
        answer,
      }),
    )
    .digest("hex");
  return {
    model: provider.model,
    dimensions: provider.dimensions,
    contentHash,
    values,
  };
}

async function syncEmbedding(
  executor: KnowledgeSqlExecutor,
  input: {
    merchantId: string;
    kind: "saved_answer" | "learned_answer";
    knowledgeId: string;
    language: KnowledgeLanguage;
    embedding: PreparedEmbedding | null;
  },
): Promise<void> {
  await executor.query(
    `DELETE FROM knowledge_embeddings
     WHERE merchant_id = $1 AND knowledge_kind = $2 AND knowledge_id = $3`,
    [input.merchantId, input.kind, input.knowledgeId],
  );
  if (!input.embedding) return;

  await executor.query(
    `INSERT INTO knowledge_embeddings
     (id, merchant_id, knowledge_kind, knowledge_id, saved_answer_id, learned_answer_id,
      language, embedding_model, content_hash, dimensions, embedding, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::real[],NOW(),NOW())`,
    [
      makeKnowledgeId("embedding"),
      input.merchantId,
      input.kind,
      input.knowledgeId,
      input.kind === "saved_answer" ? input.knowledgeId : null,
      input.kind === "learned_answer" ? input.knowledgeId : null,
      input.language,
      input.embedding.model,
      input.embedding.contentHash,
      input.embedding.dimensions,
      input.embedding.values,
    ],
  );
}

async function insertAudit(
  executor: KnowledgeSqlExecutor,
  event: {
    merchantId: string;
    action: string;
    entityType: KnowledgeAuditEvent["entityType"];
    entityId: string | null;
    outcome: KnowledgeAuditEvent["outcome"];
    customerTextHash?: string;
    customerTextLength?: number;
  },
): Promise<void> {
  await executor.query(
    `INSERT INTO knowledge_audit_events
     (id, merchant_id, action, entity_type, entity_id, actor_account_id,
      customer_text_hash, customer_text_length, signal_codes, decision_code,
      outcome_code, created_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,'[]'::jsonb,NULL,$8,NOW())`,
    [
      makeKnowledgeId("audit"),
      event.merchantId,
      boundedText(event.action, 100),
      event.entityType,
      event.entityId,
      event.customerTextHash || null,
      event.customerTextLength ?? null,
      event.outcome,
    ],
  );
}

async function currentSavedAnswer(
  executor: KnowledgeSqlExecutor,
  merchantId: string,
  id: string,
): Promise<SavedAnswerRecord | null> {
  const result = await executor.query<Record<string, unknown>>(
    `SELECT id, merchant_id, category, question_pattern, answer_text, language,
            source, active, version, created_at, updated_at
     FROM saved_answers
     WHERE id = $1 AND merchant_id = $2
     LIMIT 1`,
    [id, merchantId],
  );
  return result.rows[0] ? savedAnswerFromRow(result.rows[0], merchantId) : null;
}

async function duplicateSavedAnswer(
  executor: KnowledgeSqlExecutor,
  input: {
    merchantId: string;
    language: KnowledgeLanguage;
    normalizedQuestion: string;
    excludeId?: string;
  },
): Promise<SavedAnswerRecord | null> {
  const values: unknown[] = [
    input.merchantId,
    input.language,
    input.normalizedQuestion,
  ];
  const exclusion = input.excludeId ? "AND id <> $4" : "";
  if (input.excludeId) values.push(input.excludeId);
  const result = await executor.query<Record<string, unknown>>(
    `SELECT id, merchant_id, category, question_pattern, answer_text, language,
            source, active, version, created_at, updated_at
     FROM saved_answers
     WHERE merchant_id = $1 AND language = $2 AND normalized_question = $3
       ${exclusion}
     LIMIT 1`,
    values,
  );
  return result.rows[0] ? savedAnswerFromRow(result.rows[0], input.merchantId) : null;
}

async function currentTrainingRequest(
  executor: KnowledgeSqlExecutor,
  merchantId: string,
  id: string,
): Promise<TrainingRequestRecord | null> {
  const result = await executor.query<Record<string, unknown>>(
    `SELECT id, merchant_id, customer_text_preview, customer_text_hash,
            detected_intent, detected_language, reason, suggested_reply,
            suggested_reply_source, status, rejection_reason, version,
            created_at, updated_at
     FROM training_requests
     WHERE id = $1 AND merchant_id = $2
     LIMIT 1`,
    [id, merchantId],
  );
  return result.rows[0] ? trainingRequestFromRow(result.rows[0], merchantId) : null;
}

export type PostgresKnowledgeManagementRuntimeOptions = {
  sqlClient?: KnowledgeSqlClient;
  embeddingProvider?: KnowledgeEmbeddingProvider | null;
};

export class PostgresKnowledgeManagementRuntime {
  readonly authorityId = "postgresql_knowledge_management_authority_v1";
  readonly legacyFallbackEnabled = false;
  private readonly sqlClient: KnowledgeSqlClient;
  private readonly embeddingProvider: KnowledgeEmbeddingProvider | null;
  private readonly decisionRuntime: PostgresKnowledgeRuntime;

  constructor(options: PostgresKnowledgeManagementRuntimeOptions = {}) {
    this.sqlClient = options.sqlClient || getPostgresKnowledgeSqlClient();
    this.embeddingProvider = options.embeddingProvider ?? null;
    this.decisionRuntime = new PostgresKnowledgeRuntime({
      sqlClient: this.sqlClient,
      embeddingProvider: this.embeddingProvider || undefined,
    });
  }

  async listSavedAnswers(merchantIdValue: string): Promise<SavedAnswerRecord[]> {
    const merchantId = requireMerchantId(merchantIdValue);
    try {
      const result = await this.sqlClient.query<Record<string, unknown>>(
        `SELECT id, merchant_id, category, question_pattern, answer_text, language,
                source, active, version, created_at, updated_at
         FROM saved_answers
         WHERE merchant_id = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 500`,
        [merchantId],
      );
      return result.rows.map((row) => savedAnswerFromRow(row, merchantId));
    } catch (error) {
      databaseUnavailable(error);
    }
  }

  async createSavedAnswer(input: {
    merchantId: string;
    category: string;
    questionPattern: string;
    answerText: string;
    language: KnowledgeLanguage;
    active?: boolean;
  }): Promise<SavedAnswerRecord> {
    const merchantId = requireMerchantId(input.merchantId);
    const questionPattern = boundedText(input.questionPattern, 500);
    const answerText = boundedText(input.answerText, 2_000);
    const language = languageValue(input.language);
    const category = categoryValue(input.category);
    const active = input.active !== false;
    const normalizedQuestion = normalizeKnowledgeText(questionPattern);
    if (!questionPattern || !answerText || !normalizedQuestion) {
      throw new KnowledgeTransitionError(
        "INVALID_SAVED_ANSWER",
        "saved answer fields are required",
      );
    }

    const embedding = active
      ? await prepareEmbedding(this.embeddingProvider, {
          kind: "saved_answer",
          language,
          question: questionPattern,
          answer: answerText,
        })
      : null;
    const id = makeKnowledgeId("saved");
    const now = new Date().toISOString();

    try {
      return await this.sqlClient.transaction(async (tx) => {
        const duplicate = await duplicateSavedAnswer(tx, {
          merchantId,
          language,
          normalizedQuestion,
        });
        if (duplicate) {
          throw new KnowledgeConflictError("saved answer already exists", duplicate);
        }

        const result = await tx.query<Record<string, unknown>>(
          `INSERT INTO saved_answers
           (id, merchant_id, category, question_pattern, normalized_question,
            answer_text, language, source, active, version, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'merchant_approved',$8,1,$9,$9)
           RETURNING id, merchant_id, category, question_pattern, answer_text,
                     language, source, active, version, created_at, updated_at`,
          [
            id,
            merchantId,
            category,
            questionPattern,
            normalizedQuestion,
            answerText,
            language,
            active,
            now,
          ],
        );
        const record = savedAnswerFromRow(result.rows[0], merchantId);
        await syncEmbedding(tx, {
          merchantId,
          kind: "saved_answer",
          knowledgeId: record.id,
          language: record.language,
          embedding,
        });
        await insertAudit(tx, {
          merchantId,
          action: "saved_answer_created",
          entityType: "saved_answer",
          entityId: record.id,
          outcome: "success",
        });
        return record;
      });
    } catch (error) {
      if (postgresCode(error) === "23505") {
        try {
          const duplicate = await duplicateSavedAnswer(this.sqlClient, {
            merchantId,
            language,
            normalizedQuestion,
          });
          if (duplicate) {
            throw new KnowledgeConflictError("saved answer already exists", duplicate);
          }
        } catch (lookupError) {
          if (lookupError instanceof KnowledgeConflictError) throw lookupError;
        }
      }
      databaseWriteFailed(error);
    }
  }

  async updateSavedAnswer(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
    category?: string;
    questionPattern?: string;
    answerText?: string;
    language?: KnowledgeLanguage;
    active?: boolean;
  }): Promise<SavedAnswerRecord> {
    const merchantId = requireMerchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    if (!id || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError(
        "INVALID_SAVED_ANSWER",
        "saved answer update is invalid",
      );
    }

    let current: SavedAnswerRecord | null;
    try {
      current = await currentSavedAnswer(this.sqlClient, merchantId, id);
    } catch (error) {
      databaseUnavailable(error);
    }
    if (!current) throw new KnowledgeNotFoundError("saved answer not found for this merchant");
    if (current.version !== input.expectedVersion) {
      throw new KnowledgeConflictError("saved answer version conflict", current);
    }

    const category = input.category === undefined ? current.category : categoryValue(input.category);
    const questionPattern =
      input.questionPattern === undefined
        ? current.questionPattern
        : boundedText(input.questionPattern, 500);
    const answerText =
      input.answerText === undefined
        ? current.answerText
        : boundedText(input.answerText, 2_000);
    const language = input.language === undefined ? current.language : languageValue(input.language);
    const active = input.active === undefined ? current.active : input.active === true;
    const normalizedQuestion = normalizeKnowledgeText(questionPattern);
    if (!questionPattern || !answerText || !normalizedQuestion) {
      throw new KnowledgeTransitionError(
        "INVALID_SAVED_ANSWER",
        "question and answer are required",
      );
    }

    const embedding = active
      ? await prepareEmbedding(this.embeddingProvider, {
          kind: "saved_answer",
          language,
          question: questionPattern,
          answer: answerText,
        })
      : null;
    const now = new Date().toISOString();

    try {
      return await this.sqlClient.transaction(async (tx) => {
        const duplicate = await duplicateSavedAnswer(tx, {
          merchantId,
          language,
          normalizedQuestion,
          excludeId: id,
        });
        if (duplicate) {
          throw new KnowledgeConflictError("saved answer already exists", duplicate);
        }

        const result = await tx.query<Record<string, unknown>>(
          `UPDATE saved_answers
           SET category = $4,
               question_pattern = $5,
               normalized_question = $6,
               answer_text = $7,
               language = $8,
               active = $9,
               version = version + 1,
               updated_at = $10
           WHERE id = $1 AND merchant_id = $2 AND version = $3
           RETURNING id, merchant_id, category, question_pattern, answer_text,
                     language, source, active, version, created_at, updated_at`,
          [
            id,
            merchantId,
            input.expectedVersion,
            category,
            questionPattern,
            normalizedQuestion,
            answerText,
            language,
            active,
            now,
          ],
        );
        if (!result.rows[0]) {
          const latest = await currentSavedAnswer(tx, merchantId, id);
          if (!latest) throw new KnowledgeNotFoundError("saved answer not found for this merchant");
          throw new KnowledgeConflictError("saved answer version conflict", latest);
        }
        const updated = savedAnswerFromRow(result.rows[0], merchantId);
        await syncEmbedding(tx, {
          merchantId,
          kind: "saved_answer",
          knowledgeId: updated.id,
          language: updated.language,
          embedding,
        });
        await insertAudit(tx, {
          merchantId,
          action: "saved_answer_updated",
          entityType: "saved_answer",
          entityId: updated.id,
          outcome: "success",
        });
        return updated;
      });
    } catch (error) {
      if (postgresCode(error) === "23505") {
        try {
          const duplicate = await duplicateSavedAnswer(this.sqlClient, {
            merchantId,
            language,
            normalizedQuestion,
            excludeId: id,
          });
          if (duplicate) {
            throw new KnowledgeConflictError("saved answer already exists", duplicate);
          }
        } catch (lookupError) {
          if (lookupError instanceof KnowledgeConflictError) throw lookupError;
        }
      }
      databaseWriteFailed(error);
    }
  }

  async deleteSavedAnswer(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
  }): Promise<SavedAnswerRecord> {
    const merchantId = requireMerchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    if (!id || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError(
        "INVALID_SAVED_ANSWER",
        "saved answer delete is invalid",
      );
    }

    try {
      return await this.sqlClient.transaction(async (tx) => {
        const result = await tx.query<Record<string, unknown>>(
          `DELETE FROM saved_answers
           WHERE id = $1 AND merchant_id = $2 AND version = $3
           RETURNING id, merchant_id, category, question_pattern, answer_text,
                     language, source, active, version, created_at, updated_at`,
          [id, merchantId, input.expectedVersion],
        );
        if (!result.rows[0]) {
          const latest = await currentSavedAnswer(tx, merchantId, id);
          if (!latest) throw new KnowledgeNotFoundError("saved answer not found for this merchant");
          throw new KnowledgeConflictError("saved answer version conflict", latest);
        }
        const deleted = savedAnswerFromRow(result.rows[0], merchantId);
        await insertAudit(tx, {
          merchantId,
          action: "saved_answer_deleted",
          entityType: "saved_answer",
          entityId: deleted.id,
          outcome: "success",
        });
        return deleted;
      });
    } catch (error) {
      databaseWriteFailed(error);
    }
  }

  async listTrainingRequests(merchantIdValue: string): Promise<TrainingRequestRecord[]> {
    const merchantId = requireMerchantId(merchantIdValue);
    try {
      const result = await this.sqlClient.query<Record<string, unknown>>(
        `SELECT id, merchant_id, customer_text_preview, customer_text_hash,
                detected_intent, detected_language, reason, suggested_reply,
                suggested_reply_source, status, rejection_reason, version,
                created_at, updated_at
         FROM training_requests
         WHERE merchant_id = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 500`,
        [merchantId],
      );
      return result.rows.map((row) => trainingRequestFromRow(row, merchantId));
    } catch (error) {
      databaseUnavailable(error);
    }
  }

  async createTrainingRequest(input: {
    merchantId: string;
    customerText: string;
    detectedIntent?: string;
    detectedLanguage?: KnowledgeLanguage;
    reason: string;
    suggestedReply?: string | null;
    suggestedReplySource?: SuggestedReplySource | null;
  }): Promise<TrainingRequestRecord> {
    return this.decisionRuntime.createTrainingRequest({
      ...input,
      suggestedReplySource: input.suggestedReply
        ? input.suggestedReplySource || "merchant_draft"
        : null,
    });
  }

  async proposeTrainingReply(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
    suggestedReply: string;
    source: SuggestedReplySource;
  }): Promise<TrainingRequestRecord> {
    const merchantId = requireMerchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    const suggestedReply = boundedText(input.suggestedReply, 2_000);
    const source = suggestedReplySourceValue(input.source);
    if (
      !id ||
      !suggestedReply ||
      !source ||
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion <= 0
    ) {
      throw new KnowledgeTransitionError(
        "SUGGESTED_REPLY_REQUIRED",
        "suggested reply is required",
      );
    }

    try {
      return await this.sqlClient.transaction(async (tx) => {
        const result = await tx.query<Record<string, unknown>>(
          `UPDATE training_requests
           SET suggested_reply = $4,
               suggested_reply_source = $5,
               status = 'pending_review',
               rejection_reason = NULL,
               reviewed_at = NULL,
               version = version + 1,
               updated_at = $6
           WHERE id = $1 AND merchant_id = $2 AND version = $3 AND status <> 'approved'
           RETURNING id, merchant_id, customer_text_preview, customer_text_hash,
                     detected_intent, detected_language, reason, suggested_reply,
                     suggested_reply_source, status, rejection_reason, version,
                     created_at, updated_at`,
          [
            id,
            merchantId,
            input.expectedVersion,
            suggestedReply,
            source,
            new Date().toISOString(),
          ],
        );
        if (!result.rows[0]) {
          const latest = await currentTrainingRequest(tx, merchantId, id);
          if (!latest) throw new KnowledgeNotFoundError("training request not found for this merchant");
          if (latest.version !== input.expectedVersion) {
            throw new KnowledgeConflictError("training request version conflict", latest);
          }
          throw new KnowledgeTransitionError(
            "APPROVED_REQUEST_IMMUTABLE",
            "approved training requests must be reopened through a new request",
          );
        }
        const updated = trainingRequestFromRow(result.rows[0], merchantId);
        await insertAudit(tx, {
          merchantId,
          action: "training_reply_proposed",
          entityType: "training_request",
          entityId: updated.id,
          outcome: "success",
        });
        return updated;
      });
    } catch (error) {
      databaseWriteFailed(error);
    }
  }

  async approveTrainingRequest(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
    approvedAnswer?: string;
    keywords?: string[];
  }): Promise<{ request: TrainingRequestRecord; learnedAnswer: LearnedAnswerRecord }> {
    const merchantId = requireMerchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    if (!id || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError(
        "INVALID_TRAINING_REQUEST",
        "training approval is invalid",
      );
    }

    let current: TrainingRequestRecord | null;
    try {
      current = await currentTrainingRequest(this.sqlClient, merchantId, id);
    } catch (error) {
      databaseUnavailable(error);
    }
    if (!current) throw new KnowledgeNotFoundError("training request not found for this merchant");
    if (current.version !== input.expectedVersion) {
      throw new KnowledgeConflictError("training request version conflict", current);
    }
    if (current.status !== "pending_review" && current.status !== "pending_merchant_reply") {
      throw new KnowledgeTransitionError(
        "INVALID_TRAINING_TRANSITION",
        `cannot approve training request from ${current.status}`,
      );
    }

    const approvedAnswer = boundedText(input.approvedAnswer ?? current.suggestedReply, 2_000);
    if (!approvedAnswer) {
      throw new KnowledgeTransitionError(
        "APPROVED_ANSWER_REQUIRED",
        "approved answer is required",
      );
    }
    const examples = uniqueNormalizedList([current.customerTextPreview], 20);
    const keywords = uniqueNormalizedList(
      [...(input.keywords || []), ...current.customerTextPreview.split(/\s+/)],
      24,
    );
    const embedding = await prepareEmbedding(this.embeddingProvider, {
      kind: "learned_answer",
      language: current.detectedLanguage,
      question: examples[0] || current.detectedIntent,
      answer: approvedAnswer,
    });
    const now = new Date().toISOString();

    try {
      return await this.sqlClient.transaction(async (tx) => {
        const requestResult = await tx.query<Record<string, unknown>>(
          `UPDATE training_requests
           SET suggested_reply = $4,
               suggested_reply_source = 'merchant_draft',
               status = 'approved',
               rejection_reason = NULL,
               reviewed_at = $5,
               version = version + 1,
               updated_at = $5
           WHERE id = $1 AND merchant_id = $2 AND version = $3
             AND status IN ('pending_review','pending_merchant_reply')
           RETURNING id, merchant_id, customer_text_preview, customer_text_hash,
                     detected_intent, detected_language, reason, suggested_reply,
                     suggested_reply_source, status, rejection_reason, version,
                     created_at, updated_at`,
          [id, merchantId, input.expectedVersion, approvedAnswer, now],
        );
        if (!requestResult.rows[0]) {
          const latest = await currentTrainingRequest(tx, merchantId, id);
          if (!latest) throw new KnowledgeNotFoundError("training request not found for this merchant");
          if (latest.version !== input.expectedVersion) {
            throw new KnowledgeConflictError("training request version conflict", latest);
          }
          throw new KnowledgeTransitionError(
            "INVALID_TRAINING_TRANSITION",
            `cannot approve training request from ${latest.status}`,
          );
        }
        const updatedRequest = trainingRequestFromRow(requestResult.rows[0], merchantId);

        const existingResult = await tx.query<Record<string, unknown>>(
          `SELECT id, merchant_id, training_request_id, intent, language, examples,
                  keywords, answer_text, source, approval_status, confidence,
                  safe_to_auto_reply, version, created_at, updated_at
           FROM learned_answers
           WHERE merchant_id = $1 AND training_request_id = $2
           LIMIT 1
           FOR UPDATE`,
          [merchantId, id],
        );

        let learnedRow: Record<string, unknown>;
        if (existingResult.rows[0]) {
          const existing = learnedAnswerFromRow(existingResult.rows[0], merchantId);
          const mergedExamples = uniqueNormalizedList(
            [...existing.examples, ...examples],
            20,
          );
          const mergedKeywords = uniqueNormalizedList(
            [...existing.keywords, ...keywords],
            24,
          );
          const learnedResult = await tx.query<Record<string, unknown>>(
            `UPDATE learned_answers
             SET intent = $4,
                 language = $5,
                 examples = $6::jsonb,
                 keywords = $7::jsonb,
                 answer_text = $8,
                 source = 'merchant_approved',
                 approval_status = 'approved',
                 confidence = '1',
                 safe_to_auto_reply = TRUE,
                 version = version + 1,
                 updated_at = $9
             WHERE id = $1 AND merchant_id = $2 AND training_request_id = $3
             RETURNING id, merchant_id, training_request_id, intent, language,
                       examples, keywords, answer_text, source, approval_status,
                       confidence, safe_to_auto_reply, version, created_at, updated_at`,
            [
              existing.id,
              merchantId,
              id,
              current.detectedIntent,
              current.detectedLanguage,
              JSON.stringify(mergedExamples),
              JSON.stringify(mergedKeywords),
              approvedAnswer,
              now,
            ],
          );
          learnedRow = learnedResult.rows[0];
        } else {
          const learnedId = makeKnowledgeId("learned");
          const learnedResult = await tx.query<Record<string, unknown>>(
            `INSERT INTO learned_answers
             (id, merchant_id, training_request_id, intent, language, examples,
              keywords, answer_text, source, approval_status, confidence,
              safe_to_auto_reply, version, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,
                     'merchant_approved','approved','1',TRUE,1,$9,$9)
             RETURNING id, merchant_id, training_request_id, intent, language,
                       examples, keywords, answer_text, source, approval_status,
                       confidence, safe_to_auto_reply, version, created_at, updated_at`,
            [
              learnedId,
              merchantId,
              id,
              current.detectedIntent,
              current.detectedLanguage,
              JSON.stringify(examples),
              JSON.stringify(keywords),
              approvedAnswer,
              now,
            ],
          );
          learnedRow = learnedResult.rows[0];
        }

        const learnedAnswer = learnedAnswerFromRow(learnedRow, merchantId);
        const learnedEmbedding = await prepareEmbedding(this.embeddingProvider, {
          kind: "learned_answer",
          language: learnedAnswer.language,
          question: learnedAnswer.examples[0] || learnedAnswer.intent,
          answer: learnedAnswer.answerText,
        });
        await syncEmbedding(tx, {
          merchantId,
          kind: "learned_answer",
          knowledgeId: learnedAnswer.id,
          language: learnedAnswer.language,
          embedding: learnedEmbedding || embedding,
        });
        await insertAudit(tx, {
          merchantId,
          action: "training_request_approved",
          entityType: "training_request",
          entityId: id,
          outcome: "success",
        });
        return { request: updatedRequest, learnedAnswer };
      });
    } catch (error) {
      databaseWriteFailed(error);
    }
  }

  async rejectTrainingRequest(input: {
    merchantId: string;
    id: string;
    expectedVersion: number;
    reason?: string;
  }): Promise<TrainingRequestRecord> {
    const merchantId = requireMerchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    const reason = boundedText(input.reason, 300) || "merchant_rejected";
    if (!id || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError(
        "INVALID_TRAINING_REQUEST",
        "training rejection is invalid",
      );
    }

    try {
      return await this.sqlClient.transaction(async (tx) => {
        const result = await tx.query<Record<string, unknown>>(
          `UPDATE training_requests
           SET status = 'rejected',
               rejection_reason = $4,
               reviewed_at = $5,
               version = version + 1,
               updated_at = $5
           WHERE id = $1 AND merchant_id = $2 AND version = $3 AND status <> 'approved'
           RETURNING id, merchant_id, customer_text_preview, customer_text_hash,
                     detected_intent, detected_language, reason, suggested_reply,
                     suggested_reply_source, status, rejection_reason, version,
                     created_at, updated_at`,
          [id, merchantId, input.expectedVersion, reason, new Date().toISOString()],
        );
        if (!result.rows[0]) {
          const latest = await currentTrainingRequest(tx, merchantId, id);
          if (!latest) throw new KnowledgeNotFoundError("training request not found for this merchant");
          if (latest.version !== input.expectedVersion) {
            throw new KnowledgeConflictError("training request version conflict", latest);
          }
          throw new KnowledgeTransitionError(
            "INVALID_TRAINING_TRANSITION",
            "approved training requests cannot be rejected in place",
          );
        }
        const updated = trainingRequestFromRow(result.rows[0], merchantId);

        await tx.query(
          `DELETE FROM knowledge_embeddings
           WHERE merchant_id = $1
             AND knowledge_kind = 'learned_answer'
             AND learned_answer_id IN (
               SELECT id FROM learned_answers
               WHERE merchant_id = $1 AND training_request_id = $2
             )`,
          [merchantId, id],
        );
        await tx.query(
          `UPDATE learned_answers
           SET approval_status = 'rejected',
               safe_to_auto_reply = FALSE,
               version = version + 1,
               updated_at = NOW()
           WHERE merchant_id = $1 AND training_request_id = $2`,
          [merchantId, id],
        );
        await insertAudit(tx, {
          merchantId,
          action: "training_request_rejected",
          entityType: "training_request",
          entityId: id,
          outcome: "rejected",
        });
        return updated;
      });
    } catch (error) {
      databaseWriteFailed(error);
    }
  }

  async listLearnedAnswers(merchantIdValue: string): Promise<LearnedAnswerRecord[]> {
    const merchantId = requireMerchantId(merchantIdValue);
    try {
      const result = await this.sqlClient.query<Record<string, unknown>>(
        `SELECT id, merchant_id, training_request_id, intent, language, examples,
                keywords, answer_text, source, approval_status, confidence,
                safe_to_auto_reply, version, created_at, updated_at
         FROM learned_answers
         WHERE merchant_id = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 500`,
        [merchantId],
      );
      return result.rows.map((row) => learnedAnswerFromRow(row, merchantId));
    } catch (error) {
      databaseUnavailable(error);
    }
  }

  async listAuditEvents(
    merchantIdValue: string,
    requestedLimit = 100,
  ): Promise<KnowledgeAuditEvent[]> {
    const merchantId = requireMerchantId(merchantIdValue);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 100;
    try {
      const result = await this.sqlClient.query<Record<string, unknown>>(
        `SELECT id, merchant_id, action, entity_type, entity_id, actor_account_id,
                customer_text_hash, customer_text_length, signal_codes,
                decision_code, outcome_code, created_at
         FROM knowledge_audit_events
         WHERE merchant_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2`,
        [merchantId, limit],
      );
      return result.rows.map((row) => auditEventFromRow(row, merchantId));
    } catch (error) {
      databaseUnavailable(error);
    }
  }
}

let singleton: PostgresKnowledgeManagementRuntime | null = null;

export function getPostgresKnowledgeManagementRuntime(): PostgresKnowledgeManagementRuntime {
  if (!singleton) {
    singleton = new PostgresKnowledgeManagementRuntime({
      embeddingProvider: getConfiguredKnowledgeEmbeddingProvider(),
    });
  }
  return singleton;
}

export function resetPostgresKnowledgeManagementRuntimeForTests(): void {
  singleton = null;
}
