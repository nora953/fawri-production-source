import { createHash } from "node:crypto";
import {
  boundedText,
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
import { createOpenAiKnowledgeEmbeddingProvider } from "./openAiKnowledgeEmbeddingProvider.js";
import {
  getPostgresKnowledgeSqlClient,
  KnowledgeRuntimeGateError,
  PostgresKnowledgeRuntime,
  type KnowledgeEmbeddingProvider,
  type KnowledgeSqlClient,
  type KnowledgeSqlExecutor,
} from "./postgresKnowledgeRuntime.js";
import { customerTextPreview } from "./redaction.js";
import {
  isSavedAnswerCategory,
  type KnowledgeAuditEvent,
  type KnowledgeLanguage,
  type LearnedAnswerRecord,
  type SavedAnswerCategory,
  type SavedAnswerRecord,
  type SuggestedReplySource,
  type TrainingRequestRecord,
} from "./types.js";

function dbError(code: string, message: string): never {
  throw new KnowledgeRuntimeGateError(code, message);
}

function rethrowRead(error: unknown): never {
  if (
    error instanceof KnowledgeRuntimeGateError ||
    error instanceof KnowledgeConflictError ||
    error instanceof KnowledgeNotFoundError ||
    error instanceof KnowledgeTransitionError
  ) throw error;
  dbError("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
}

function rethrowWrite(error: unknown): never {
  if (
    error instanceof KnowledgeRuntimeGateError ||
    error instanceof KnowledgeConflictError ||
    error instanceof KnowledgeNotFoundError ||
    error instanceof KnowledgeTransitionError
  ) throw error;
  dbError("KNOWLEDGE_DATABASE_WRITE_FAILED", "knowledge database write failed");
}

function merchantId(value: unknown): string {
  const result = boundedText(value, 120);
  if (!result) throw new KnowledgeTransitionError("KNOWLEDGE_MERCHANT_REQUIRED", "merchant is required");
  return result;
}

function assertTenant(row: Record<string, unknown>, requested: string): void {
  if (boundedText(row.merchant_id, 120) !== requested) {
    dbError("KNOWLEDGE_TENANT_VIOLATION", "knowledge tenant boundary violation");
  }
}

function version(value: unknown): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result <= 0) dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  return result;
}

function iso(value: unknown): string {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  return parsed.toISOString();
}

function lang(value: unknown): KnowledgeLanguage {
  if (value === "ar" || value === "ku" || value === "en") return value;
  dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
}

function bool(value: unknown): boolean {
  if (value === true || value === false) return value;
  dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
}

function strings(value: unknown, max: number): string[] {
  let resolved = value;
  if (typeof resolved === "string") {
    try { resolved = JSON.parse(resolved); } catch { resolved = null; }
  }
  if (!Array.isArray(resolved) || resolved.length > max || !resolved.every((item) => typeof item === "string")) {
    dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return resolved.map((item) => boundedText(item, 500));
}

function storedCategory(value: unknown): SavedAnswerCategory {
  const result = boundedText(value, 100);
  if (!isSavedAnswerCategory(result)) {
    dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return result;
}

function inputCategory(value: unknown): SavedAnswerCategory {
  const result = boundedText(value, 100);
  if (!isSavedAnswerCategory(result)) {
    throw new KnowledgeTransitionError(
      "INVALID_SAVED_ANSWER_CATEGORY",
      "saved answer category is invalid",
    );
  }
  return result;
}

function replySource(value: unknown): SuggestedReplySource | null {
  if (value === null || value === undefined || value === "") return null;
  if (value === "merchant_draft" || value === "openai_generated") return value;
  dbError("KNOWLEDGE_PROVENANCE_INVALID", "knowledge provenance is invalid");
}

function status(value: unknown): TrainingRequestRecord["status"] {
  if (value === "pending_merchant_reply" || value === "pending_review" || value === "approved" || value === "rejected") return value;
  dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
}

function savedFromRow(row: Record<string, unknown>, requestedMerchantId: string): SavedAnswerRecord {
  assertTenant(row, requestedMerchantId);
  const source = boundedText(row.source, 40);
  const id = boundedText(row.id, 160);
  const questionPattern = boundedText(row.question_pattern, 500);
  const answerText = boundedText(row.answer_text, 2_000);
  if (!id || !questionPattern || !answerText || source !== "merchant_approved") {
    dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return {
    id,
    merchantId: requestedMerchantId,
    category: storedCategory(row.category),
    questionPattern,
    answerText,
    language: lang(row.language),
    source: "merchant_approved",
    active: bool(row.active),
    version: version(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function trainingFromRow(row: Record<string, unknown>, requestedMerchantId: string): TrainingRequestRecord {
  assertTenant(row, requestedMerchantId);
  const id = boundedText(row.id, 160);
  const customerTextHash = boundedText(row.customer_text_hash, 64);
  const detectedIntent = boundedText(row.detected_intent, 100);
  const reason = boundedText(row.reason, 300);
  const suggestedReply = boundedText(row.suggested_reply, 2_000) || null;
  const suggestedReplySource = replySource(row.suggested_reply_source);
  if (!id || !detectedIntent || !reason || !/^[0-9a-f]{64}$/i.test(customerTextHash) || (suggestedReply === null) !== (suggestedReplySource === null)) {
    dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return {
    id,
    merchantId: requestedMerchantId,
    customerTextPreview: boundedText(row.customer_text_preview, 500),
    customerTextHash,
    detectedIntent,
    detectedLanguage: lang(row.detected_language),
    reason,
    suggestedReply,
    suggestedReplySource,
    status: status(row.status),
    rejectionReason: boundedText(row.rejection_reason, 500) || null,
    version: version(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function learnedFromRow(row: Record<string, unknown>, requestedMerchantId: string): LearnedAnswerRecord {
  assertTenant(row, requestedMerchantId);
  const id = boundedText(row.id, 160);
  const intent = boundedText(row.intent, 100);
  const answerText = boundedText(row.answer_text, 2_000);
  const source = boundedText(row.source, 40);
  const approvalStatus = boundedText(row.approval_status, 40);
  const confidence = Number(row.confidence);
  if (
    !id || !intent || !answerText ||
    (source !== "merchant_approved" && source !== "openai_generated") ||
    (approvalStatus !== "pending_review" && approvalStatus !== "approved" && approvalStatus !== "rejected") ||
    !Number.isFinite(confidence) || confidence < 0 || confidence > 1
  ) dbError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  return {
    id,
    merchantId: requestedMerchantId,
    intent,
    language: lang(row.language),
    examples: strings(row.examples, 20),
    keywords: strings(row.keywords, 24),
    answerText,
    source,
    approvalStatus,
    confidence,
    safeToAutoReply: bool(row.safe_to_auto_reply),
    trainingRequestId: boundedText(row.training_request_id, 160) || null,
    version: version(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function configuredEmbeddingProvider(): KnowledgeEmbeddingProvider | null {
  const selected = String(process.env.FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER ?? "").trim().toLowerCase();
  if (!selected || selected === "disabled") return null;
  if (selected === "openai") return createOpenAiKnowledgeEmbeddingProvider({ apiKey: process.env.OPENAI_API_KEY });
  dbError("KNOWLEDGE_VECTOR_PROVIDER_CONFIG_INVALID", "Knowledge embedding provider selection is invalid");
}

async function prepareEmbedding(
  provider: KnowledgeEmbeddingProvider | null,
  input: { kind: "saved_answer" | "learned_answer"; language: KnowledgeLanguage; question: string; answer: string },
): Promise<{ model: string; dimensions: number; contentHash: string; values: number[] } | null> {
  if (!provider) return null;
  let raw: readonly number[];
  try {
    raw = await provider.embed(`${input.question}\n${input.answer}`);
  } catch (error) {
    if (error instanceof KnowledgeRuntimeGateError) throw error;
    dbError("KNOWLEDGE_VECTOR_UNAVAILABLE", "knowledge vector provider is unavailable");
  }
  if (!Array.isArray(raw) || raw.length !== provider.dimensions || raw.some((item) => !Number.isFinite(Number(item)))) {
    dbError("KNOWLEDGE_VECTOR_INVALID", "knowledge vector state is invalid");
  }
  return {
    model: provider.model,
    dimensions: provider.dimensions,
    contentHash: createHash("sha256").update(JSON.stringify({
      kind: input.kind,
      language: input.language,
      question: normalizeKnowledgeText(input.question),
      answer: input.answer,
    })).digest("hex"),
    values: raw.map(Number),
  };
}

async function syncEmbedding(
  tx: KnowledgeSqlExecutor,
  input: {
    merchantId: string;
    kind: "saved_answer" | "learned_answer";
    knowledgeId: string;
    language: KnowledgeLanguage;
    embedding: { model: string; dimensions: number; contentHash: string; values: number[] } | null;
  },
): Promise<void> {
  await tx.query(
    `DELETE FROM knowledge_embeddings WHERE merchant_id = $1 AND knowledge_kind = $2 AND knowledge_id = $3`,
    [input.merchantId, input.kind, input.knowledgeId],
  );
  if (!input.embedding) return;
  await tx.query(
    `INSERT INTO knowledge_embeddings
     (id, merchant_id, knowledge_kind, knowledge_id, saved_answer_id, learned_answer_id,
      language, embedding_model, content_hash, dimensions, embedding, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::real[],NOW(),NOW())`,
    [
      makeKnowledgeId("embedding"), input.merchantId, input.kind, input.knowledgeId,
      input.kind === "saved_answer" ? input.knowledgeId : null,
      input.kind === "learned_answer" ? input.knowledgeId : null,
      input.language, input.embedding.model, input.embedding.contentHash,
      input.embedding.dimensions, input.embedding.values,
    ],
  );
}

async function audit(
  tx: KnowledgeSqlExecutor,
  input: {
    merchantId: string;
    action: string;
    entityType: "saved_answer" | "training_request" | "learned_answer" | "decision";
    entityId: string | null;
    outcome: "success" | "conflict" | "rejected" | "handoff";
    customerTextHash?: string;
    customerTextLength?: number;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO knowledge_audit_events
     (id, merchant_id, action, entity_type, entity_id, actor_account_id,
      customer_text_hash, customer_text_length, signal_codes, decision_code, outcome_code, created_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,'[]'::jsonb,NULL,$8,NOW())`,
    [makeKnowledgeId("audit"), input.merchantId, input.action, input.entityType, input.entityId,
      input.customerTextHash || null, input.customerTextLength ?? null, input.outcome],
  );
}

const SAVED_COLUMNS = `id, merchant_id, category, question_pattern, answer_text, language,
  source, active, version, created_at, updated_at`;
const TRAINING_COLUMNS = `id, merchant_id, customer_text_preview, customer_text_hash,
  detected_intent, detected_language, reason, suggested_reply, suggested_reply_source,
  status, rejection_reason, version, created_at, updated_at`;
const LEARNED_COLUMNS = `id, merchant_id, training_request_id, intent, language, examples,
  keywords, answer_text, source, approval_status, confidence, safe_to_auto_reply,
  version, created_at, updated_at`;

async function currentSaved(tx: KnowledgeSqlExecutor, merchant: string, id: string): Promise<SavedAnswerRecord | null> {
  const result = await tx.query<Record<string, unknown>>(
    `SELECT ${SAVED_COLUMNS} FROM saved_answers WHERE merchant_id = $1 AND id = $2 LIMIT 1`,
    [merchant, id],
  );
  return result.rows[0] ? savedFromRow(result.rows[0], merchant) : null;
}

async function currentTraining(tx: KnowledgeSqlExecutor, merchant: string, id: string): Promise<TrainingRequestRecord | null> {
  const result = await tx.query<Record<string, unknown>>(
    `SELECT ${TRAINING_COLUMNS} FROM training_requests WHERE merchant_id = $1 AND id = $2 LIMIT 1`,
    [merchant, id],
  );
  return result.rows[0] ? trainingFromRow(result.rows[0], merchant) : null;
}

export class PostgresKnowledgeManagementRuntime {
  readonly authorityId = "postgresql_knowledge_management_authority_v1";
  readonly legacyFallbackEnabled = false;
  private readonly sql: KnowledgeSqlClient;
  private readonly embeddings: KnowledgeEmbeddingProvider | null;
  private readonly decisionRuntime: PostgresKnowledgeRuntime;

  constructor(options: { sqlClient?: KnowledgeSqlClient; embeddingProvider?: KnowledgeEmbeddingProvider | null } = {}) {
    this.sql = options.sqlClient || getPostgresKnowledgeSqlClient();
    this.embeddings = options.embeddingProvider === undefined ? configuredEmbeddingProvider() : options.embeddingProvider;
    this.decisionRuntime = new PostgresKnowledgeRuntime({
      sqlClient: this.sql,
      embeddingProvider: this.embeddings || undefined,
    });
  }

  async listSavedAnswers(value: string): Promise<SavedAnswerRecord[]> {
    const merchant = merchantId(value);
    try {
      const result = await this.sql.query<Record<string, unknown>>(
        `SELECT ${SAVED_COLUMNS} FROM saved_answers WHERE merchant_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 500`,
        [merchant],
      );
      return result.rows.map((row) => savedFromRow(row, merchant));
    } catch (error) { rethrowRead(error); }
  }

  async createSavedAnswer(input: {
    merchantId: string; category: SavedAnswerCategory; questionPattern: string; answerText: string;
    language: KnowledgeLanguage; active?: boolean;
  }): Promise<SavedAnswerRecord> {
    const merchant = merchantId(input.merchantId);
    const question = boundedText(input.questionPattern, 500);
    const answer = boundedText(input.answerText, 2_000);
    const language = lang(input.language);
    const normalized = normalizeKnowledgeText(question);
    const active = input.active !== false;
    if (!question || !answer || !normalized) throw new KnowledgeTransitionError("INVALID_SAVED_ANSWER", "saved answer fields are required");
    const embedding = active ? await prepareEmbedding(this.embeddings, { kind: "saved_answer", language, question, answer }) : null;
    const id = makeKnowledgeId("saved");
    try {
      return await this.sql.transaction(async (tx) => {
        const duplicate = await tx.query<Record<string, unknown>>(
          `SELECT ${SAVED_COLUMNS} FROM saved_answers
           WHERE merchant_id = $1 AND language = $2 AND normalized_question = $3 LIMIT 1`,
          [merchant, language, normalized],
        );
        if (duplicate.rows[0]) throw new KnowledgeConflictError("saved answer already exists", savedFromRow(duplicate.rows[0], merchant));
        const result = await tx.query<Record<string, unknown>>(
          `INSERT INTO saved_answers
           (id, merchant_id, category, question_pattern, normalized_question, answer_text,
            language, source, active, version, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'merchant_approved',$8,1,NOW(),NOW())
           RETURNING ${SAVED_COLUMNS}`,
          [id, merchant, inputCategory(input.category), question, normalized, answer, language, active],
        );
        const record = savedFromRow(result.rows[0], merchant);
        await syncEmbedding(tx, { merchantId: merchant, kind: "saved_answer", knowledgeId: id, language, embedding });
        await audit(tx, { merchantId: merchant, action: "saved_answer_created", entityType: "saved_answer", entityId: id, outcome: "success" });
        return record;
      });
    } catch (error) { rethrowWrite(error); }
  }

  async updateSavedAnswer(input: {
    merchantId: string; id: string; expectedVersion: number; category?: SavedAnswerCategory;
    questionPattern?: string; answerText?: string; language?: KnowledgeLanguage; active?: boolean;
  }): Promise<SavedAnswerRecord> {
    const merchant = merchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    if (!id || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError("INVALID_SAVED_ANSWER", "saved answer update is invalid");
    }
    let current: SavedAnswerRecord | null;
    try { current = await currentSaved(this.sql, merchant, id); } catch (error) { rethrowRead(error); }
    if (!current) throw new KnowledgeNotFoundError("saved answer not found for this merchant");
    if (current.version !== input.expectedVersion) throw new KnowledgeConflictError("saved answer version conflict", current);

    const next = {
      category: input.category === undefined ? current.category : inputCategory(input.category),
      question: input.questionPattern === undefined ? current.questionPattern : boundedText(input.questionPattern, 500),
      answer: input.answerText === undefined ? current.answerText : boundedText(input.answerText, 2_000),
      language: input.language === undefined ? current.language : lang(input.language),
      active: input.active === undefined ? current.active : input.active === true,
    };
    const normalized = normalizeKnowledgeText(next.question);
    if (!next.question || !next.answer || !normalized) throw new KnowledgeTransitionError("INVALID_SAVED_ANSWER", "question and answer are required");
    const embedding = next.active ? await prepareEmbedding(this.embeddings, {
      kind: "saved_answer", language: next.language, question: next.question, answer: next.answer,
    }) : null;
    try {
      return await this.sql.transaction(async (tx) => {
        const duplicate = await tx.query<Record<string, unknown>>(
          `SELECT ${SAVED_COLUMNS} FROM saved_answers
           WHERE merchant_id = $1 AND language = $2 AND normalized_question = $3 AND id <> $4 LIMIT 1`,
          [merchant, next.language, normalized, id],
        );
        if (duplicate.rows[0]) throw new KnowledgeConflictError("saved answer already exists", savedFromRow(duplicate.rows[0], merchant));
        const result = await tx.query<Record<string, unknown>>(
          `UPDATE saved_answers SET category=$4, question_pattern=$5, normalized_question=$6,
             answer_text=$7, language=$8, active=$9, version=version+1, updated_at=NOW()
           WHERE merchant_id=$1 AND id=$2 AND version=$3 RETURNING ${SAVED_COLUMNS}`,
          [merchant, id, input.expectedVersion, next.category, next.question, normalized, next.answer, next.language, next.active],
        );
        if (!result.rows[0]) {
          const latest = await currentSaved(tx, merchant, id);
          if (!latest) throw new KnowledgeNotFoundError("saved answer not found for this merchant");
          throw new KnowledgeConflictError("saved answer version conflict", latest);
        }
        const updated = savedFromRow(result.rows[0], merchant);
        await syncEmbedding(tx, { merchantId: merchant, kind: "saved_answer", knowledgeId: id, language: next.language, embedding });
        await audit(tx, { merchantId: merchant, action: "saved_answer_updated", entityType: "saved_answer", entityId: id, outcome: "success" });
        return updated;
      });
    } catch (error) { rethrowWrite(error); }
  }

  async deleteSavedAnswer(input: { merchantId: string; id: string; expectedVersion: number }): Promise<SavedAnswerRecord> {
    const merchant = merchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    if (!id || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError("INVALID_SAVED_ANSWER", "saved answer delete is invalid");
    }
    try {
      return await this.sql.transaction(async (tx) => {
        const result = await tx.query<Record<string, unknown>>(
          `DELETE FROM saved_answers WHERE merchant_id=$1 AND id=$2 AND version=$3 RETURNING ${SAVED_COLUMNS}`,
          [merchant, id, input.expectedVersion],
        );
        if (!result.rows[0]) {
          const latest = await currentSaved(tx, merchant, id);
          if (!latest) throw new KnowledgeNotFoundError("saved answer not found for this merchant");
          throw new KnowledgeConflictError("saved answer version conflict", latest);
        }
        const deleted = savedFromRow(result.rows[0], merchant);
        await audit(tx, { merchantId: merchant, action: "saved_answer_deleted", entityType: "saved_answer", entityId: id, outcome: "success" });
        return deleted;
      });
    } catch (error) { rethrowWrite(error); }
  }

  async listTrainingRequests(value: string): Promise<TrainingRequestRecord[]> {
    const merchant = merchantId(value);
    try {
      const result = await this.sql.query<Record<string, unknown>>(
        `SELECT ${TRAINING_COLUMNS} FROM training_requests WHERE merchant_id=$1 ORDER BY updated_at DESC, id DESC LIMIT 500`,
        [merchant],
      );
      return result.rows.map((row) => trainingFromRow(row, merchant));
    } catch (error) { rethrowRead(error); }
  }

  async createTrainingRequest(input: {
    merchantId: string; customerText: string; detectedIntent?: string; detectedLanguage?: KnowledgeLanguage;
    reason: string; suggestedReply?: string | null; suggestedReplySource?: SuggestedReplySource | null;
  }): Promise<TrainingRequestRecord> {
    return this.decisionRuntime.createTrainingRequest({
      ...input,
      suggestedReplySource: input.suggestedReply ? input.suggestedReplySource || "merchant_draft" : null,
    });
  }

  async proposeTrainingReply(input: {
    merchantId: string; id: string; expectedVersion: number; suggestedReply: string; source: SuggestedReplySource;
  }): Promise<TrainingRequestRecord> {
    const merchant = merchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    const suggested = boundedText(input.suggestedReply, 2_000);
    const source = replySource(input.source);
    if (!id || !suggested || !source || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError("SUGGESTED_REPLY_REQUIRED", "suggested reply is required");
    }
    try {
      return await this.sql.transaction(async (tx) => {
        const result = await tx.query<Record<string, unknown>>(
          `UPDATE training_requests SET suggested_reply=$4, suggested_reply_source=$5,
             status='pending_review', rejection_reason=NULL, reviewed_at=NULL,
             version=version+1, updated_at=NOW()
           WHERE merchant_id=$1 AND id=$2 AND version=$3 AND status<>'approved'
           RETURNING ${TRAINING_COLUMNS}`,
          [merchant, id, input.expectedVersion, suggested, source],
        );
        if (!result.rows[0]) {
          const latest = await currentTraining(tx, merchant, id);
          if (!latest) throw new KnowledgeNotFoundError("training request not found for this merchant");
          if (latest.version !== input.expectedVersion) throw new KnowledgeConflictError("training request version conflict", latest);
          throw new KnowledgeTransitionError("APPROVED_REQUEST_IMMUTABLE", "approved training requests must be reopened through a new request");
        }
        const updated = trainingFromRow(result.rows[0], merchant);
        await audit(tx, { merchantId: merchant, action: "training_reply_proposed", entityType: "training_request", entityId: id, outcome: "success" });
        return updated;
      });
    } catch (error) { rethrowWrite(error); }
  }

  async approveTrainingRequest(input: {
    merchantId: string; id: string; expectedVersion: number; approvedAnswer?: string; keywords?: string[];
  }): Promise<{ request: TrainingRequestRecord; learnedAnswer: LearnedAnswerRecord }> {
    const merchant = merchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    if (!id || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError("INVALID_TRAINING_REQUEST", "training approval is invalid");
    }
    let current: TrainingRequestRecord | null;
    try { current = await currentTraining(this.sql, merchant, id); } catch (error) { rethrowRead(error); }
    if (!current) throw new KnowledgeNotFoundError("training request not found for this merchant");
    if (current.version !== input.expectedVersion) throw new KnowledgeConflictError("training request version conflict", current);
    if (current.status !== "pending_review" && current.status !== "pending_merchant_reply") {
      throw new KnowledgeTransitionError("INVALID_TRAINING_TRANSITION", `cannot approve training request from ${current.status}`);
    }
    const answer = boundedText(input.approvedAnswer ?? current.suggestedReply, 2_000);
    if (!answer) throw new KnowledgeTransitionError("APPROVED_ANSWER_REQUIRED", "approved answer is required");
    const newExamples = uniqueNormalizedList([current.customerTextPreview], 20);
    const newKeywords = uniqueNormalizedList([...(input.keywords || []), ...current.customerTextPreview.split(/\s+/)], 24);
    try {
      return await this.sql.transaction(async (tx) => {
        const requestResult = await tx.query<Record<string, unknown>>(
          `UPDATE training_requests SET suggested_reply=$4, suggested_reply_source='merchant_draft',
             status='approved', rejection_reason=NULL, reviewed_at=NOW(), version=version+1, updated_at=NOW()
           WHERE merchant_id=$1 AND id=$2 AND version=$3 AND status IN ('pending_review','pending_merchant_reply')
           RETURNING ${TRAINING_COLUMNS}`,
          [merchant, id, input.expectedVersion, answer],
        );
        if (!requestResult.rows[0]) {
          const latest = await currentTraining(tx, merchant, id);
          if (!latest) throw new KnowledgeNotFoundError("training request not found for this merchant");
          if (latest.version !== input.expectedVersion) throw new KnowledgeConflictError("training request version conflict", latest);
          throw new KnowledgeTransitionError("INVALID_TRAINING_TRANSITION", `cannot approve training request from ${latest.status}`);
        }
        const request = trainingFromRow(requestResult.rows[0], merchant);
        const existingResult = await tx.query<Record<string, unknown>>(
          `SELECT ${LEARNED_COLUMNS} FROM learned_answers WHERE merchant_id=$1 AND training_request_id=$2 LIMIT 1 FOR UPDATE`,
          [merchant, id],
        );
        let learnedResult;
        if (existingResult.rows[0]) {
          const existing = learnedFromRow(existingResult.rows[0], merchant);
          const examples = uniqueNormalizedList([...existing.examples, ...newExamples], 20);
          const keywords = uniqueNormalizedList([...existing.keywords, ...newKeywords], 24);
          learnedResult = await tx.query<Record<string, unknown>>(
            `UPDATE learned_answers SET intent=$4, language=$5, examples=$6::jsonb, keywords=$7::jsonb,
               answer_text=$8, source='merchant_approved', approval_status='approved', confidence='1',
               safe_to_auto_reply=TRUE, version=version+1, updated_at=NOW()
             WHERE merchant_id=$1 AND id=$2 AND training_request_id=$3 RETURNING ${LEARNED_COLUMNS}`,
            [merchant, existing.id, id, current.detectedIntent, current.detectedLanguage,
              JSON.stringify(examples), JSON.stringify(keywords), answer],
          );
        } else {
          learnedResult = await tx.query<Record<string, unknown>>(
            `INSERT INTO learned_answers
             (id, merchant_id, training_request_id, intent, language, examples, keywords,
              answer_text, source, approval_status, confidence, safe_to_auto_reply, version, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,'merchant_approved','approved','1',TRUE,1,NOW(),NOW())
             RETURNING ${LEARNED_COLUMNS}`,
            [makeKnowledgeId("learned"), merchant, id, current.detectedIntent, current.detectedLanguage,
              JSON.stringify(newExamples), JSON.stringify(newKeywords), answer],
          );
        }
        const learnedAnswer = learnedFromRow(learnedResult.rows[0], merchant);
        const embedding = await prepareEmbedding(this.embeddings, {
          kind: "learned_answer", language: learnedAnswer.language,
          question: learnedAnswer.examples[0] || learnedAnswer.intent, answer: learnedAnswer.answerText,
        });
        await syncEmbedding(tx, {
          merchantId: merchant, kind: "learned_answer", knowledgeId: learnedAnswer.id,
          language: learnedAnswer.language, embedding,
        });
        await audit(tx, { merchantId: merchant, action: "training_request_approved", entityType: "training_request", entityId: id, outcome: "success" });
        return { request, learnedAnswer };
      });
    } catch (error) { rethrowWrite(error); }
  }

  async rejectTrainingRequest(input: {
    merchantId: string; id: string; expectedVersion: number; reason?: string;
  }): Promise<TrainingRequestRecord> {
    const merchant = merchantId(input.merchantId);
    const id = boundedText(input.id, 160);
    if (!id || !Number.isInteger(input.expectedVersion) || input.expectedVersion <= 0) {
      throw new KnowledgeTransitionError("INVALID_TRAINING_REQUEST", "training rejection is invalid");
    }
    try {
      return await this.sql.transaction(async (tx) => {
        const result = await tx.query<Record<string, unknown>>(
          `UPDATE training_requests SET status='rejected', rejection_reason=$4, reviewed_at=NOW(),
             version=version+1, updated_at=NOW()
           WHERE merchant_id=$1 AND id=$2 AND version=$3 AND status<>'approved'
           RETURNING ${TRAINING_COLUMNS}`,
          [merchant, id, input.expectedVersion, boundedText(input.reason, 300) || "merchant_rejected"],
        );
        if (!result.rows[0]) {
          const latest = await currentTraining(tx, merchant, id);
          if (!latest) throw new KnowledgeNotFoundError("training request not found for this merchant");
          if (latest.version !== input.expectedVersion) throw new KnowledgeConflictError("training request version conflict", latest);
          throw new KnowledgeTransitionError("INVALID_TRAINING_TRANSITION", "approved training requests cannot be rejected in place");
        }
        await tx.query(
          `DELETE FROM knowledge_embeddings WHERE merchant_id=$1 AND knowledge_kind='learned_answer'
           AND learned_answer_id IN (SELECT id FROM learned_answers WHERE merchant_id=$1 AND training_request_id=$2)`,
          [merchant, id],
        );
        await tx.query(
          `UPDATE learned_answers SET approval_status='rejected', safe_to_auto_reply=FALSE,
             version=version+1, updated_at=NOW() WHERE merchant_id=$1 AND training_request_id=$2`,
          [merchant, id],
        );
        const request = trainingFromRow(result.rows[0], merchant);
        await audit(tx, { merchantId: merchant, action: "training_request_rejected", entityType: "training_request", entityId: id, outcome: "rejected" });
        return request;
      });
    } catch (error) { rethrowWrite(error); }
  }

  async listLearnedAnswers(value: string): Promise<LearnedAnswerRecord[]> {
    const merchant = merchantId(value);
    try {
      const result = await this.sql.query<Record<string, unknown>>(
        `SELECT ${LEARNED_COLUMNS} FROM learned_answers WHERE merchant_id=$1 ORDER BY updated_at DESC, id DESC LIMIT 500`,
        [merchant],
      );
      return result.rows.map((row) => learnedFromRow(row, merchant));
    } catch (error) { rethrowRead(error); }
  }

  async listAuditEvents(value: string, requestedLimit = 100): Promise<KnowledgeAuditEvent[]> {
    const merchant = merchantId(value);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
    try {
      const result = await this.sql.query<Record<string, unknown>>(
        `SELECT id, merchant_id, action, entity_type, entity_id, customer_text_hash,
                customer_text_length, signal_codes, decision_code, outcome_code, created_at
         FROM knowledge_audit_events WHERE merchant_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2`,
        [merchant, limit],
      );
      return result.rows.map((row) => {
        assertTenant(row, merchant);
        const action = boundedText(row.action, 100);
        const outcomeRaw = boundedText(row.outcome_code, 40);
        const entityRaw = boundedText(row.entity_type, 60);
        const outcome: KnowledgeAuditEvent["outcome"] =
          outcomeRaw === "success" || outcomeRaw === "conflict" || outcomeRaw === "rejected" || outcomeRaw === "handoff"
            ? outcomeRaw : "rejected";
        const entityType: KnowledgeAuditEvent["entityType"] =
          entityRaw === "saved_answer" || entityRaw === "training_request" || entityRaw === "learned_answer" || entityRaw === "decision"
            ? entityRaw : "decision";
        const actor: KnowledgeAuditEvent["actor"] = action === "openai_candidate_recorded"
          ? "ai_provider"
          : action.startsWith("saved_answer_") || action.startsWith("training_reply_") || action.startsWith("training_request_approve") || action.startsWith("training_request_reject")
            ? "merchant" : "system";
        return {
          id: boundedText(row.id, 160), merchantId: merchant, action, entityType,
          entityId: boundedText(row.entity_id, 160) || null, actor, outcome,
          customerTextHash: boundedText(row.customer_text_hash, 64) || undefined,
          customerTextLength: row.customer_text_length == null ? undefined : Number(row.customer_text_length),
          injectionSignals: strings(row.signal_codes ?? [], 32),
          metadata: { decisionCode: boundedText(row.decision_code, 100) || null },
          createdAt: iso(row.created_at),
        };
      });
    } catch (error) { rethrowRead(error); }
  }
}

let singleton: PostgresKnowledgeManagementRuntime | null = null;

export function getPostgresKnowledgeManagementRuntime(): PostgresKnowledgeManagementRuntime {
  if (!singleton) singleton = new PostgresKnowledgeManagementRuntime();
  return singleton;
}

export function resetPostgresKnowledgeManagementRuntimeForTests(): void {
  singleton = null;
}
