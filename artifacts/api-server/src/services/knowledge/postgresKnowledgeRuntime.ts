import type {
  KnowledgeAuditEvent,
  KnowledgeFactResolver,
  KnowledgeFactResolverInput,
  KnowledgeLanguage,
  LearnedAnswerRecord,
  MerchantPolicyContext,
  SavedAnswerRecord,
  SemanticDocument,
  SemanticMatch,
  TrainingRequestRecord,
} from "./types.js";
import {
  boundedText,
  clampConfidence,
  detectKnowledgeLanguage,
  digestCustomerText,
  makeKnowledgeId,
  normalizeKnowledgeText,
  uniqueNormalizedList,
} from "./normalization.js";
import { customerTextPreview } from "./redaction.js";
import { classifyWarrantyAuthorityDomain } from "./subscriptionGuaranteeClassification.js";

export class KnowledgeRuntimeGateError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = "KnowledgeRuntimeGateError";
    this.code = code;
    this.status = status;
  }
}

export type KnowledgeSqlResult<Row> = { rows: Row[] };

export interface KnowledgeSqlExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<KnowledgeSqlResult<Row>>;
}

export interface KnowledgeSqlClient extends KnowledgeSqlExecutor {
  transaction<T>(
    operation: (executor: KnowledgeSqlExecutor) => Promise<T>,
  ): Promise<T>;
}

class PostgresKnowledgeSqlClient implements KnowledgeSqlClient {
  async query<Row extends Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<KnowledgeSqlResult<Row>> {
    const { pool } = await import("@workspace/db");
    const result = await pool.query(sql, Array.from(values));
    return { rows: result.rows as Row[] };
  }

  async transaction<T>(
    operation: (executor: KnowledgeSqlExecutor) => Promise<T>,
  ): Promise<T> {
    const { pool } = await import("@workspace/db");
    const connection = await pool.connect();
    const executor: KnowledgeSqlExecutor = {
      async query<Row extends Record<string, unknown>>(
        sql: string,
        values: readonly unknown[] = [],
      ): Promise<KnowledgeSqlResult<Row>> {
        const result = await connection.query(sql, Array.from(values));
        return { rows: result.rows as Row[] };
      },
    };

    try {
      await connection.query("BEGIN");
      const result = await operation(executor);
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await connection.query("ROLLBACK");
      } catch {
        // Preserve the original safe failure. A rollback failure must not expose DB state.
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}

let sqlClientSingleton: KnowledgeSqlClient | null = null;

export function getPostgresKnowledgeSqlClient(): KnowledgeSqlClient {
  if (!sqlClientSingleton) sqlClientSingleton = new PostgresKnowledgeSqlClient();
  return sqlClientSingleton;
}

export function setPostgresKnowledgeSqlClientForTests(
  client: KnowledgeSqlClient | null,
): void {
  sqlClientSingleton = client;
}

function safeError(code: string, message: string, status = 503): never {
  throw new KnowledgeRuntimeGateError(code, message, status);
}

function rowText(value: unknown, maximum = 2_000): string {
  return boundedText(value, maximum);
}

function positiveVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isInteger(version) || version <= 0) {
    safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return version;
}

function language(value: unknown): KnowledgeLanguage {
  if (value === "ar" || value === "ku" || value === "en") return value;
  safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
}

function booleanValue(value: unknown): boolean {
  if (value === true || value === false) return value;
  safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
}

function timestampMillis(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) {
    safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return parsed;
}

function isoTimestamp(value: unknown): string {
  return new Date(timestampMillis(value)).toISOString();
}

function numberValue(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return numeric;
}

function nonNegativeInteger(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return numeric;
}

function stringArray(value: unknown, maximumItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) {
    safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  if (!value.every((item) => typeof item === "string")) {
    safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return value.map((item) => boundedText(item, 500));
}

function merchantIdFromRow(row: Record<string, unknown>, requested: string): string {
  const merchantId = rowText(row.merchant_id, 160);
  if (!merchantId || merchantId !== requested) {
    safeError("KNOWLEDGE_TENANT_VIOLATION", "knowledge tenant boundary violation");
  }
  return merchantId;
}

const MERCHANT_POLICY_SQL = `
SELECT
  m.id AS merchant_id,
  m.store_name,
  m.status AS merchant_status,
  m.account_status,
  ms.version AS settings_version,
  ms.auto_reply_enabled,
  ms.reply_language,
  ms.delivery_enabled,
  ms.delivery_fee_iqd,
  ms.free_delivery_threshold_iqd,
  ms.delivery_estimated_days_min,
  ms.delivery_estimated_days_max,
  ms.delivery_areas,
  ms.delivery_notes,
  ms.cash_on_delivery_enabled,
  ms.electronic_payment_enabled,
  ms.payment_methods,
  ms.payment_instructions
FROM merchants m
JOIN merchant_settings ms ON ms.merchant_id = m.id
WHERE m.id = $1
LIMIT 2`;

type MerchantSettingsSnapshot = {
  merchantId: string;
  storeName: string;
  merchantStatus: string;
  accountStatus: string;
  version: number;
  autoReplyEnabled: boolean;
  replyLanguage: "auto" | KnowledgeLanguage;
  deliveryEnabled: boolean;
  deliveryFeeIqd: number;
  freeDeliveryThresholdIqd: number | null;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  deliveryAreas: string[];
  deliveryNotes: string;
  cashOnDeliveryEnabled: boolean;
  electronicPaymentEnabled: boolean;
  paymentMethods: string[];
  paymentInstructions: string;
};

async function loadMerchantSettings(
  sqlClient: KnowledgeSqlExecutor,
  merchantId: string,
): Promise<MerchantSettingsSnapshot> {
  const requested = boundedText(merchantId, 160);
  if (!requested) {
    safeError("KNOWLEDGE_POLICY_INVALID", "merchant knowledge policy is invalid", 400);
  }

  let result: KnowledgeSqlResult<Record<string, unknown>>;
  try {
    result = await sqlClient.query(MERCHANT_POLICY_SQL, [requested]);
  } catch {
    safeError("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
  }

  if (result.rows.length !== 1) {
    safeError("KNOWLEDGE_POLICY_MISSING", "merchant knowledge policy is unavailable");
  }

  const row = result.rows[0];
  const resolvedMerchantId = merchantIdFromRow(row, requested);
  const merchantStatus = rowText(row.merchant_status, 40);
  const accountStatus = rowText(row.account_status, 40);
  const replyLanguage = rowText(row.reply_language, 10);
  if (
    merchantStatus !== "approved" ||
    accountStatus !== "approved" ||
    !["auto", "ar", "ku", "en"].includes(replyLanguage)
  ) {
    safeError("MERCHANT_KNOWLEDGE_POLICY_DENIED", "merchant knowledge policy denies retrieval", 403);
  }

  const freeThreshold = row.free_delivery_threshold_iqd;
  const freeDeliveryThresholdIqd =
    freeThreshold === null || freeThreshold === undefined
      ? null
      : nonNegativeInteger(freeThreshold);
  const deliveryDaysMin = nonNegativeInteger(row.delivery_estimated_days_min);
  const deliveryDaysMax = nonNegativeInteger(row.delivery_estimated_days_max);
  if (deliveryDaysMin <= 0 || deliveryDaysMax < deliveryDaysMin || deliveryDaysMax > 30) {
    safeError("KNOWLEDGE_POLICY_INVALID", "merchant knowledge policy is invalid");
  }

  return {
    merchantId: resolvedMerchantId,
    storeName: rowText(row.store_name, 300),
    merchantStatus,
    accountStatus,
    version: positiveVersion(row.settings_version),
    autoReplyEnabled: booleanValue(row.auto_reply_enabled),
    replyLanguage: replyLanguage as "auto" | KnowledgeLanguage,
    deliveryEnabled: booleanValue(row.delivery_enabled),
    deliveryFeeIqd: nonNegativeInteger(row.delivery_fee_iqd),
    freeDeliveryThresholdIqd,
    deliveryDaysMin,
    deliveryDaysMax,
    deliveryAreas: stringArray(row.delivery_areas, 100),
    deliveryNotes: rowText(row.delivery_notes, 1_000),
    cashOnDeliveryEnabled: booleanValue(row.cash_on_delivery_enabled),
    electronicPaymentEnabled: booleanValue(row.electronic_payment_enabled),
    paymentMethods: stringArray(row.payment_methods, 5),
    paymentInstructions: rowText(row.payment_instructions, 2_000),
  };
}

export type MerchantKnowledgePolicyResolution = {
  merchantId: string;
  policyVersion: number;
  allowKnowledgeUse: boolean;
  policy: MerchantPolicyContext;
};

export interface MerchantKnowledgePolicyResolver {
  resolve(merchantId: string): Promise<MerchantKnowledgePolicyResolution>;
}

export class PostgresMerchantKnowledgePolicyResolver
  implements MerchantKnowledgePolicyResolver
{
  constructor(private readonly sqlClient: KnowledgeSqlExecutor = getPostgresKnowledgeSqlClient()) {}

  async resolve(merchantId: string): Promise<MerchantKnowledgePolicyResolution> {
    const settings = await loadMerchantSettings(this.sqlClient, merchantId);
    return {
      merchantId: settings.merchantId,
      policyVersion: settings.version,
      allowKnowledgeUse: settings.autoReplyEnabled,
      policy: {
        businessName: settings.storeName || undefined,
        // Generated content is never authorized by browser input or by this launch policy.
        allowGeneratedAutoReply: false,
      },
    };
  }
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalizeKnowledgeText(term)));
}

const DELIVERY_TERMS = [
  "توصيل",
  "التوصيل",
  "شحن",
  "يوصل",
  "delivery",
  "shipping",
  "گەیاندن",
  "گواستنەوە",
] as const;
const PAYMENT_TERMS = [
  "دفع",
  "الدفع",
  "كاش",
  "نقد",
  "payment",
  "pay",
  "cash",
  "پارەدان",
] as const;
const BUSINESS_TERMS = ["اسم المتجر", "اسم المحل", "store name", "business name", "ناوی فرۆشگا"] as const;

function localizedDelivery(settings: MerchantSettingsSnapshot, lang: KnowledgeLanguage): string {
  if (!settings.deliveryEnabled) {
    if (lang === "en") return "Delivery is currently unavailable.";
    if (lang === "ku") return "گەیاندن لە ئێستادا بەردەست نییە.";
    return "التوصيل غير متاح حاليًا.";
  }

  const days =
    settings.deliveryDaysMin === settings.deliveryDaysMax
      ? String(settings.deliveryDaysMin)
      : `${settings.deliveryDaysMin}-${settings.deliveryDaysMax}`;
  if (lang === "en") {
    return `Delivery is available. Estimated delivery time is ${days} day(s). Delivery fee is ${settings.deliveryFeeIqd.toLocaleString("en-US")} IQD.`;
  }
  if (lang === "ku") {
    return `گەیاندن بەردەستە. ماوەی خەمڵێنراو ${days} ڕۆژە و کرێی گەیاندن ${settings.deliveryFeeIqd.toLocaleString("en-US")} دینارە.`;
  }
  return `التوصيل متاح. المدة التقديرية ${days} يوم، ورسوم التوصيل ${settings.deliveryFeeIqd.toLocaleString("en-US")} دينار.`;
}

function localizedPayment(settings: MerchantSettingsSnapshot, lang: KnowledgeLanguage): string {
  const labels = settings.paymentMethods.map((method) => {
    if (method === "cash_on_delivery") return lang === "en" ? "cash on delivery" : lang === "ku" ? "پارەدان لە کاتی گەیاندن" : "الدفع عند الاستلام";
    return method;
  });
  if (!labels.length || (!settings.cashOnDeliveryEnabled && !settings.electronicPaymentEnabled)) {
    safeError("KNOWLEDGE_POLICY_INVALID", "merchant knowledge policy is invalid");
  }
  if (lang === "en") return `Available payment methods: ${labels.join(", ")}.`;
  if (lang === "ku") return `شێوازە بەردەستەکانی پارەدان: ${labels.join("، ")}.`;
  return `طرق الدفع المتاحة: ${labels.join("، ")}.`;
}

export class PostgresKnowledgeFactResolver implements KnowledgeFactResolver {
  constructor(private readonly sqlClient: KnowledgeSqlExecutor = getPostgresKnowledgeSqlClient()) {}

  async resolve(input: KnowledgeFactResolverInput) {
    const normalized = normalizeKnowledgeText(input.customerText);
    if (!normalized) return null;

    const asksDelivery = containsAny(normalized, DELIVERY_TERMS);
    const asksPayment = containsAny(normalized, PAYMENT_TERMS);
    const asksBusiness = containsAny(normalized, BUSINESS_TERMS);
    const matchedKinds = [asksDelivery, asksPayment, asksBusiness].filter(Boolean).length;
    if (matchedKinds === 0) return null;
    if (matchedKinds > 1) {
      safeError("KNOWLEDGE_FACT_AMBIGUOUS", "authoritative fact request is ambiguous", 409);
    }

    const settings = await loadMerchantSettings(this.sqlClient, input.merchantId);
    if (!settings.autoReplyEnabled) return null;

    if (asksDelivery) {
      return {
        answerText: localizedDelivery(settings, input.language),
        language: input.language,
        confidence: 1,
        factType: "delivery_policy",
        recordId: `${settings.merchantId}:settings:${settings.version}`,
      };
    }
    if (asksPayment) {
      return {
        answerText: localizedPayment(settings, input.language),
        language: input.language,
        confidence: 1,
        factType: "payment_policy",
        recordId: `${settings.merchantId}:settings:${settings.version}`,
      };
    }

    if (!settings.storeName) {
      safeError("KNOWLEDGE_FACT_UNAVAILABLE", "authoritative fact is unavailable");
    }
    return {
      answerText: settings.storeName,
      language: input.language,
      confidence: 1,
      factType: "business_name",
      recordId: settings.merchantId,
    };
  }
}

export interface KnowledgeEmbeddingProvider {
  readonly providerId: string;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<readonly number[]>;
}

export class DisabledKnowledgeEmbeddingProvider implements KnowledgeEmbeddingProvider {
  readonly providerId = "disabled_knowledge_embedding_provider";
  readonly model = "disabled";
  readonly dimensions = 0;

  async embed(): Promise<readonly number[]> {
    safeError("KNOWLEDGE_VECTOR_UNAVAILABLE", "knowledge vector provider is unavailable");
  }
}

function validateEmbedding(values: unknown, dimensions: number): number[] {
  if (!Array.isArray(values) || values.length !== dimensions || dimensions <= 0 || dimensions > 4_096) {
    safeError("KNOWLEDGE_VECTOR_INVALID", "knowledge vector state is invalid");
  }
  const vector = values.map((value) => Number(value));
  if (vector.some((value) => !Number.isFinite(value))) {
    safeError("KNOWLEDGE_VECTOR_INVALID", "knowledge vector state is invalid");
  }
  return vector;
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) {
    safeError("KNOWLEDGE_VECTOR_INVALID", "knowledge vector state is invalid");
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    safeError("KNOWLEDGE_VECTOR_INVALID", "knowledge vector state is invalid");
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

const SAVED_ANSWER_SQL = `
SELECT id, merchant_id, category, question_pattern, normalized_question,
       answer_text, language, source, active, version, created_at, updated_at
FROM saved_answers
WHERE merchant_id = $1
  AND normalized_question = $2
  AND language = $3
  AND active = TRUE
  AND source = 'merchant_approved'
  AND version > 0
LIMIT 2`;

const APPROVED_DOCUMENTS_SQL = `
SELECT id, merchant_id, question_pattern AS question, answer_text AS answer,
       language, source, 'saved_answer' AS kind, active, version
FROM saved_answers
WHERE merchant_id = $1 AND active = TRUE AND source = 'merchant_approved' AND version > 0
UNION ALL
SELECT id, merchant_id, COALESCE(examples->>0, intent) AS question, answer_text AS answer,
       language, source, 'learned_answer' AS kind, safe_to_auto_reply AS active, version
FROM learned_answers
WHERE merchant_id = $1
  AND source = 'merchant_approved'
  AND approval_status = 'approved'
  AND safe_to_auto_reply = TRUE
  AND version > 0
LIMIT 200`;

const VECTOR_CANDIDATES_SQL = `
SELECT e.merchant_id, e.knowledge_kind, e.knowledge_id, e.language,
       e.embedding_model, e.content_hash, e.dimensions, e.embedding,
       e.updated_at AS embedding_updated_at,
       s.question_pattern AS question, s.answer_text AS answer,
       s.language AS source_language, s.source AS source_provenance,
       s.active AS source_active, s.version AS source_version,
       s.updated_at AS source_updated_at,
       NULL::text AS approval_status, NULL::boolean AS safe_to_auto_reply
FROM knowledge_embeddings e
JOIN saved_answers s
  ON s.id = e.saved_answer_id AND s.merchant_id = e.merchant_id
WHERE e.merchant_id = $1
  AND e.embedding_model = $2
  AND e.language = $3
  AND e.knowledge_kind = 'saved_answer'
  AND s.active = TRUE
  AND s.source = 'merchant_approved'
  AND s.version > 0
UNION ALL
SELECT e.merchant_id, e.knowledge_kind, e.knowledge_id, e.language,
       e.embedding_model, e.content_hash, e.dimensions, e.embedding,
       e.updated_at AS embedding_updated_at,
       COALESCE(l.examples->>0, l.intent) AS question, l.answer_text AS answer,
       l.language AS source_language, l.source AS source_provenance,
       TRUE AS source_active, l.version AS source_version,
       l.updated_at AS source_updated_at,
       l.approval_status::text AS approval_status, l.safe_to_auto_reply
FROM knowledge_embeddings e
JOIN learned_answers l
  ON l.id = e.learned_answer_id AND l.merchant_id = e.merchant_id
WHERE e.merchant_id = $1
  AND e.embedding_model = $2
  AND e.language = $3
  AND e.knowledge_kind = 'learned_answer'
  AND l.source = 'merchant_approved'
  AND l.approval_status = 'approved'
  AND l.safe_to_auto_reply = TRUE
  AND l.version > 0
LIMIT 100`;

function savedAnswerFromRow(
  row: Record<string, unknown>,
  merchantId: string,
): SavedAnswerRecord {
  merchantIdFromRow(row, merchantId);
  const source = rowText(row.source, 40);
  if (source !== "merchant_approved" || booleanValue(row.active) !== true) {
    safeError("KNOWLEDGE_PROVENANCE_INVALID", "knowledge provenance is invalid");
  }
  const questionPattern = rowText(row.question_pattern, 500);
  const answerText = rowText(row.answer_text, 2_000);
  const id = rowText(row.id, 160);
  const category = rowText(row.category, 100);
  if (!id || !category || !questionPattern || !answerText) {
    safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return {
    id,
    merchantId,
    category,
    questionPattern,
    answerText,
    language: language(row.language),
    source: "merchant_approved",
    active: true,
    version: positiveVersion(row.version),
    createdAt: isoTimestamp(row.created_at),
    updatedAt: isoTimestamp(row.updated_at),
  };
}

function semanticDocumentFromRow(
  row: Record<string, unknown>,
  merchantId: string,
): SemanticDocument {
  merchantIdFromRow(row, merchantId);
  const kind = rowText(row.kind, 30);
  const source = rowText(row.source, 40);
  if (
    source !== "merchant_approved" ||
    (kind !== "saved_answer" && kind !== "learned_answer") ||
    booleanValue(row.active) !== true
  ) {
    safeError("KNOWLEDGE_PROVENANCE_INVALID", "knowledge provenance is invalid");
  }
  positiveVersion(row.version);
  const id = rowText(row.id, 160);
  const question = rowText(row.question, 500);
  const answer = rowText(row.answer, 2_000);
  if (!id || !question || !answer) {
    safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
  }
  return {
    id,
    merchantId,
    question,
    answer,
    language: language(row.language),
    source: "merchant_approved",
    kind,
  };
}

export type PostgresKnowledgeRuntimeOptions = {
  sqlClient?: KnowledgeSqlClient;
  embeddingProvider?: KnowledgeEmbeddingProvider;
  semanticThreshold?: number;
};

export class PostgresKnowledgeRuntime {
  readonly authorityId = "postgresql_knowledge_authority_v1";
  readonly legacyFallbackEnabled = false;
  private readonly sqlClient: KnowledgeSqlClient;
  private readonly embeddingProvider: KnowledgeEmbeddingProvider;
  private readonly semanticThreshold: number;

  constructor(options: PostgresKnowledgeRuntimeOptions = {}) {
    this.sqlClient = options.sqlClient || getPostgresKnowledgeSqlClient();
    this.embeddingProvider = options.embeddingProvider || new DisabledKnowledgeEmbeddingProvider();
    this.semanticThreshold = options.semanticThreshold ?? 0.58;
  }

  async findApprovedSavedAnswer(params: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
  }): Promise<SavedAnswerRecord | null> {
    const normalized = normalizeKnowledgeText(params.customerText);
    if (!normalized) return null;
    let result: KnowledgeSqlResult<Record<string, unknown>>;
    try {
      result = await this.sqlClient.query(SAVED_ANSWER_SQL, [
        params.merchantId,
        normalized,
        params.language,
      ]);
    } catch {
      safeError("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
    }
    if (result.rows.length > 1) {
      safeError("KNOWLEDGE_PROVENANCE_AMBIGUOUS", "knowledge provenance is ambiguous", 409);
    }
    return result.rows[0]
      ? savedAnswerFromRow(result.rows[0], params.merchantId)
      : null;
  }

  async listApprovedSemanticDocuments(merchantId: string): Promise<SemanticDocument[]> {
    let result: KnowledgeSqlResult<Record<string, unknown>>;
    try {
      result = await this.sqlClient.query(APPROVED_DOCUMENTS_SQL, [merchantId]);
    } catch {
      safeError("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
    }
    return result.rows.map((row) => semanticDocumentFromRow(row, merchantId));
  }

  async retrieveSemanticMatch(params: {
    merchantId: string;
    query: string;
    language: KnowledgeLanguage;
    threshold?: number;
  }): Promise<SemanticMatch | null> {
    if (
      !this.embeddingProvider.model ||
      this.embeddingProvider.model === "disabled" ||
      !Number.isInteger(this.embeddingProvider.dimensions) ||
      this.embeddingProvider.dimensions <= 0
    ) {
      safeError("KNOWLEDGE_VECTOR_UNAVAILABLE", "knowledge vector provider is unavailable");
    }

    let rawQueryVector: readonly number[];
    try {
      rawQueryVector = await this.embeddingProvider.embed(params.query);
    } catch (error) {
      if (error instanceof KnowledgeRuntimeGateError) throw error;
      safeError("KNOWLEDGE_VECTOR_UNAVAILABLE", "knowledge vector provider is unavailable");
    }
    const queryVector = validateEmbedding(rawQueryVector, this.embeddingProvider.dimensions);

    let result: KnowledgeSqlResult<Record<string, unknown>>;
    try {
      result = await this.sqlClient.query(VECTOR_CANDIDATES_SQL, [
        params.merchantId,
        this.embeddingProvider.model,
        params.language,
      ]);
    } catch {
      safeError("KNOWLEDGE_DATABASE_UNAVAILABLE", "knowledge database is unavailable");
    }

    const candidates = result.rows.map((row) => {
      merchantIdFromRow(row, params.merchantId);
      const kind = rowText(row.knowledge_kind, 30);
      const provenance = rowText(row.source_provenance, 40);
      const sourceLanguage = language(row.source_language);
      const embeddingLanguage = language(row.language);
      const model = rowText(row.embedding_model, 160);
      const contentHash = rowText(row.content_hash, 64);
      const dimensions = positiveVersion(row.dimensions);
      const sourceVersion = positiveVersion(row.source_version);
      const active = booleanValue(row.source_active);
      if (
        (kind !== "saved_answer" && kind !== "learned_answer") ||
        provenance !== "merchant_approved" ||
        sourceLanguage !== embeddingLanguage ||
        model !== this.embeddingProvider.model ||
        dimensions !== this.embeddingProvider.dimensions ||
        !/^[0-9a-f]{64}$/i.test(contentHash) ||
        !active ||
        sourceVersion <= 0
      ) {
        safeError("KNOWLEDGE_PROVENANCE_INVALID", "knowledge provenance is invalid");
      }
      if (
        kind === "learned_answer" &&
        (rowText(row.approval_status, 40) !== "approved" ||
          booleanValue(row.safe_to_auto_reply) !== true)
      ) {
        safeError("KNOWLEDGE_PROVENANCE_INVALID", "knowledge provenance is invalid");
      }
      if (timestampMillis(row.embedding_updated_at) < timestampMillis(row.source_updated_at)) {
        safeError("KNOWLEDGE_VECTOR_STALE", "knowledge vector state is stale");
      }
      const embedding = validateEmbedding(row.embedding, dimensions);
      const question = rowText(row.question, 500);
      const answer = rowText(row.answer, 2_000);
      const id = rowText(row.knowledge_id, 160);
      if (!question || !answer || !id) {
        safeError("KNOWLEDGE_STATE_INVALID", "knowledge state is invalid");
      }
      const document: SemanticDocument = {
        id,
        merchantId: params.merchantId,
        question,
        answer,
        language: sourceLanguage,
        source: "merchant_approved",
        kind,
      };
      return { document, score: cosineSimilarity(queryVector, embedding) };
    });

    candidates.sort((left, right) => right.score - left.score);
    const best = candidates[0];
    const threshold = params.threshold ?? this.semanticThreshold;
    if (!best || best.score < threshold) return null;
    const second = candidates[1];
    if (second && best.score < 0.95 && best.score - second.score < 0.03) {
      safeError("KNOWLEDGE_VECTOR_AMBIGUOUS", "knowledge vector match is ambiguous", 409);
    }
    return best;
  }

  async createTrainingRequest(input: {
    merchantId: string;
    customerText: string;
    detectedIntent?: string;
    detectedLanguage?: KnowledgeLanguage;
    reason: string;
    suggestedReply?: string | null;
    suggestedReplySource?: "merchant_draft" | "openai_generated" | null;
  }): Promise<TrainingRequestRecord> {
    const merchantId = boundedText(input.merchantId, 120);
    const customerText = boundedText(input.customerText, 2_000);
    if (!merchantId || !customerText) {
      safeError("INVALID_TRAINING_REQUEST", "knowledge training request is invalid", 400);
    }
    const suggestedReply = boundedText(input.suggestedReply, 2_000) || null;
    const suggestedReplySource = suggestedReply ? input.suggestedReplySource || null : null;
    if (
      (suggestedReply === null) !== (suggestedReplySource === null) ||
      (suggestedReplySource !== null &&
        suggestedReplySource !== "merchant_draft" &&
        suggestedReplySource !== "openai_generated")
    ) {
      safeError("KNOWLEDGE_PROVENANCE_INVALID", "knowledge provenance is invalid");
    }
    const now = new Date().toISOString();
    const record: TrainingRequestRecord = {
      id: makeKnowledgeId("training"),
      merchantId,
      customerTextPreview: customerTextPreview(customerText),
      customerTextHash: digestCustomerText(customerText),
      detectedIntent: boundedText(input.detectedIntent, 100) || "unknown",
      detectedLanguage: input.detectedLanguage || detectKnowledgeLanguage(customerText),
      reason: boundedText(input.reason, 300) || "knowledge_gap",
      suggestedReply,
      suggestedReplySource,
      status: suggestedReply ? "pending_review" : "pending_merchant_reply",
      rejectionReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.sqlClient.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO training_requests
           (id, merchant_id, customer_text_preview, customer_text_hash, customer_text_length,
            detected_intent, detected_language, reason, suggested_reply, suggested_reply_source,
            status, rejection_reason, version, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,1,$12,$12)`,
          [
            record.id,
            merchantId,
            record.customerTextPreview,
            record.customerTextHash,
            customerText.length,
            record.detectedIntent,
            record.detectedLanguage,
            record.reason,
            record.suggestedReply,
            record.suggestedReplySource,
            record.status,
            now,
          ],
        );
        await insertAudit(tx, {
          merchantId,
          action: "training_request_created",
          entityType: "training_request",
          entityId: record.id,
          actor: suggestedReplySource === "openai_generated" ? "ai_provider" : "system",
          outcome: "success",
          customerTextHash: record.customerTextHash,
          customerTextLength: customerText.length,
          metadata: { status: record.status },
        });
      });
    } catch (error) {
      if (error instanceof KnowledgeRuntimeGateError) throw error;
      safeError("KNOWLEDGE_DATABASE_WRITE_FAILED", "knowledge database write failed");
    }
    return record;
  }

  async recordGeneratedCandidate(input: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
    intent: string;
    answerText: string;
    confidence: number;
    reason: string;
  }): Promise<{ trainingRequest: TrainingRequestRecord; learnedAnswer: LearnedAnswerRecord }> {
    const merchantId = boundedText(input.merchantId, 120);
    const customerText = boundedText(input.customerText, 2_000);
    const answerText = boundedText(input.answerText, 2_000);
    if (!merchantId || !customerText || !answerText) {
      safeError("KNOWLEDGE_GENERATED_CANDIDATE_INVALID", "generated knowledge candidate is invalid", 400);
    }
    const now = new Date().toISOString();
    const trainingRequest: TrainingRequestRecord = {
      id: makeKnowledgeId("training"),
      merchantId,
      customerTextPreview: customerTextPreview(customerText),
      customerTextHash: digestCustomerText(customerText),
      detectedIntent: boundedText(input.intent, 100) || "ai_fallback",
      detectedLanguage: input.language,
      reason: boundedText(input.reason, 300) || "ai_generated_candidate",
      suggestedReply: answerText,
      suggestedReplySource: "openai_generated",
      status: "pending_review",
      rejectionReason: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    const learnedAnswer: LearnedAnswerRecord = {
      id: makeKnowledgeId("learned"),
      merchantId,
      intent: trainingRequest.detectedIntent,
      language: input.language,
      examples: [trainingRequest.customerTextPreview],
      keywords: uniqueNormalizedList(trainingRequest.customerTextPreview.split(/\s+/), 24),
      answerText,
      source: "openai_generated",
      approvalStatus: "pending_review",
      confidence: clampConfidence(input.confidence),
      safeToAutoReply: false,
      trainingRequestId: trainingRequest.id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.sqlClient.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO training_requests
           (id, merchant_id, customer_text_preview, customer_text_hash, customer_text_length,
            detected_intent, detected_language, reason, suggested_reply, suggested_reply_source,
            status, rejection_reason, version, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'openai_generated','pending_review',NULL,1,$10,$10)`,
          [
            trainingRequest.id,
            merchantId,
            trainingRequest.customerTextPreview,
            trainingRequest.customerTextHash,
            customerText.length,
            trainingRequest.detectedIntent,
            input.language,
            trainingRequest.reason,
            answerText,
            now,
          ],
        );
        await tx.query(
          `INSERT INTO learned_answers
           (id, merchant_id, training_request_id, intent, language, examples, keywords,
            answer_text, source, approval_status, confidence, safe_to_auto_reply, version,
            created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,'openai_generated','pending_review',$9,FALSE,1,$10,$10)`,
          [
            learnedAnswer.id,
            merchantId,
            trainingRequest.id,
            learnedAnswer.intent,
            learnedAnswer.language,
            JSON.stringify(learnedAnswer.examples),
            JSON.stringify(learnedAnswer.keywords),
            answerText,
            String(learnedAnswer.confidence),
            now,
          ],
        );
        await insertAudit(tx, {
          merchantId,
          action: "openai_candidate_recorded",
          entityType: "learned_answer",
          entityId: learnedAnswer.id,
          actor: "ai_provider",
          outcome: "success",
          customerTextHash: trainingRequest.customerTextHash,
          customerTextLength: customerText.length,
          metadata: { source: "openai_generated", approvalStatus: "pending_review" },
        });
      });
    } catch (error) {
      if (error instanceof KnowledgeRuntimeGateError) throw error;
      safeError("KNOWLEDGE_DATABASE_WRITE_FAILED", "knowledge database write failed");
    }
    return { trainingRequest, learnedAnswer };
  }

  async appendAudit(
    event: Omit<KnowledgeAuditEvent, "id" | "createdAt">,
  ): Promise<void> {
    try {
      await insertAudit(this.sqlClient, event);
    } catch (error) {
      if (error instanceof KnowledgeRuntimeGateError) throw error;
      safeError("KNOWLEDGE_AUDIT_WRITE_FAILED", "knowledge audit write failed");
    }
  }
}

async function insertAudit(
  executor: KnowledgeSqlExecutor,
  event: Omit<KnowledgeAuditEvent, "id" | "createdAt">,
): Promise<void> {
  const merchantId = boundedText(event.merchantId, 120);
  const action = boundedText(event.action, 100);
  const entityType = boundedText(event.entityType, 60) || null;
  const entityId = boundedText(event.entityId, 160) || null;
  const customerTextHash = event.customerTextHash || null;
  const customerTextLength = event.customerTextLength ?? null;
  if (
    !merchantId ||
    !action ||
    (customerTextHash !== null && !/^[0-9a-f]{64}$/i.test(customerTextHash)) ||
    (customerTextLength !== null &&
      (!Number.isInteger(customerTextLength) || customerTextLength < 0 || customerTextLength > 10_000))
  ) {
    safeError("KNOWLEDGE_AUDIT_INVALID", "knowledge audit event is invalid");
  }
  const signals = (event.injectionSignals || [])
    .map((signal) => boundedText(signal, 80))
    .filter(Boolean)
    .slice(0, 32);
  const decisionCode = boundedText(event.metadata?.reasonCode, 100) || null;
  const outcomeCode = boundedText(event.outcome, 40) || "rejected";

  await executor.query(
    `INSERT INTO knowledge_audit_events
     (id, merchant_id, action, entity_type, entity_id, actor_account_id,
      customer_text_hash, customer_text_length, signal_codes, decision_code,
      outcome_code, created_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8::jsonb,$9,$10,NOW())`,
    [
      makeKnowledgeId("audit"),
      merchantId,
      action,
      entityType,
      entityId,
      customerTextHash,
      customerTextLength,
      JSON.stringify(signals),
      decisionCode,
      outcomeCode,
    ],
  );
}

export function isAuthoritativeFactQuestion(customerText: string): boolean {
  const normalized = normalizeKnowledgeText(customerText);
  if (!normalized) return false;

  // Keep the two warranty authorities distinct. The service-guarantee domain is
  // platform SaaS policy; the product-warranty domain is merchant product policy.
  // Both are fail-closed authoritative domains, so neither may fall through to
  // Saved Answers, embeddings, legacy knowledge, or generated AI.
  if (classifyWarrantyAuthorityDomain(customerText)) return true;

  return containsAny(normalized, [
    ...DELIVERY_TERMS,
    ...PAYMENT_TERMS,
    ...BUSINESS_TERMS,
    "سعر",
    "السعر",
    "price",
    "نرخ",
    "مخزون",
    "متوفر",
    "stock",
    "available",
    "طلب",
    "order",
  ]);
}
