import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../../lib/dataPaths.js";
import {
  boundedText,
  clampConfidence,
  detectKnowledgeLanguage,
  digestCustomerText,
  makeKnowledgeId,
  uniqueNormalizedList,
} from "./normalization.js";
import { customerTextPreview } from "./redaction.js";
import type {
  KnowledgeAuditEvent,
  KnowledgeLanguage,
  KnowledgeRuntimeState,
  LearnedAnswerRecord,
  SuggestedReplySource,
  TrainingRequestRecord,
} from "./types.js";

const MAX_AUDIT_EVENTS = 2_000;
const DEFAULT_RUNTIME_FILE = "knowledge-runtime.json";
const INVALID_RUNTIME_CODE = "KNOWLEDGE_RUNTIME_INVALID";
const INVALID_RUNTIME_MESSAGE = "knowledge runtime state is invalid";
const UNREADABLE_RUNTIME_CODE = "KNOWLEDGE_RUNTIME_UNREADABLE";
const UNREADABLE_RUNTIME_MESSAGE = "knowledge runtime is unreadable";

function emptyState(): KnowledgeRuntimeState {
  return {
    schemaVersion: 1,
    savedAnswers: [],
    trainingRequests: [],
    learnedAnswers: [],
    auditEvents: [],
  };
}

export class KnowledgeConflictError<T> extends Error {
  readonly current: T;

  constructor(message: string, current: T) {
    super(message);
    this.name = "KnowledgeConflictError";
    this.current = current;
  }
}

export class KnowledgeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeNotFoundError";
  }
}

export class KnowledgeTransitionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "KnowledgeTransitionError";
    this.code = code;
  }
}

function invalidRuntime(): never {
  throw new KnowledgeTransitionError(INVALID_RUNTIME_CODE, INVALID_RUNTIME_MESSAGE);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isLanguage(value: unknown): value is KnowledgeLanguage {
  return value === "ar" || value === "ku" || value === "en";
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isPositiveVersion(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isSuggestedReplySource(value: unknown): value is SuggestedReplySource {
  return value === "merchant_draft" || value === "openai_generated";
}

function validateSavedAnswer(value: unknown): void {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "id",
      "merchantId",
      "category",
      "questionPattern",
      "answerText",
      "language",
      "source",
      "active",
      "version",
      "createdAt",
      "updatedAt",
    ])
  ) {
    invalidRuntime();
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.merchantId) ||
    !isNonEmptyString(value.category) ||
    !isNonEmptyString(value.questionPattern) ||
    !isNonEmptyString(value.answerText) ||
    !isLanguage(value.language) ||
    value.source !== "merchant_approved" ||
    typeof value.active !== "boolean" ||
    !isPositiveVersion(value.version) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt)
  ) {
    invalidRuntime();
  }
}

function validateTrainingRequest(value: unknown): void {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "id",
      "merchantId",
      "customerTextPreview",
      "customerTextHash",
      "detectedIntent",
      "detectedLanguage",
      "reason",
      "suggestedReply",
      "suggestedReplySource",
      "status",
      "rejectionReason",
      "version",
      "createdAt",
      "updatedAt",
    ])
  ) {
    invalidRuntime();
  }

  const status = value.status;
  const suggestedReply = value.suggestedReply;
  const source = value.suggestedReplySource;
  const rejectionReason = value.rejectionReason;

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.merchantId) ||
    typeof value.customerTextPreview !== "string" ||
    !isSha256(value.customerTextHash) ||
    !isNonEmptyString(value.detectedIntent) ||
    !isLanguage(value.detectedLanguage) ||
    !isNonEmptyString(value.reason) ||
    !isNullableString(suggestedReply) ||
    !(source === null || isSuggestedReplySource(source)) ||
    !(
      status === "pending_merchant_reply" ||
      status === "pending_review" ||
      status === "approved" ||
      status === "rejected"
    ) ||
    !isNullableString(rejectionReason) ||
    !isPositiveVersion(value.version) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt)
  ) {
    invalidRuntime();
  }

  const hasSuggestion =
    typeof suggestedReply === "string" && suggestedReply.trim().length > 0;

  if ((suggestedReply === null) !== (source === null)) invalidRuntime();
  if (typeof suggestedReply === "string" && !hasSuggestion) invalidRuntime();

  if (status === "pending_merchant_reply") {
    if (suggestedReply !== null || source !== null || rejectionReason !== null) {
      invalidRuntime();
    }
  } else if (status === "pending_review") {
    if (!hasSuggestion || source === null || rejectionReason !== null) {
      invalidRuntime();
    }
  } else if (status === "approved") {
    if (!hasSuggestion || source !== "merchant_draft" || rejectionReason !== null) {
      invalidRuntime();
    }
  } else if (!isNonEmptyString(rejectionReason)) {
    invalidRuntime();
  }
}

function validateLearnedAnswer(value: unknown): void {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "id",
      "merchantId",
      "intent",
      "language",
      "examples",
      "keywords",
      "answerText",
      "source",
      "approvalStatus",
      "confidence",
      "safeToAutoReply",
      "trainingRequestId",
      "version",
      "createdAt",
      "updatedAt",
    ])
  ) {
    invalidRuntime();
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.merchantId) ||
    !isNonEmptyString(value.intent) ||
    !isLanguage(value.language) ||
    !isStringArray(value.examples) ||
    !isStringArray(value.keywords) ||
    !isNonEmptyString(value.answerText) ||
    !(value.source === "merchant_approved" || value.source === "openai_generated") ||
    !(
      value.approvalStatus === "pending_review" ||
      value.approvalStatus === "approved" ||
      value.approvalStatus === "rejected"
    ) ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    typeof value.safeToAutoReply !== "boolean" ||
    !(value.trainingRequestId === null || isNonEmptyString(value.trainingRequestId)) ||
    !isPositiveVersion(value.version) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt)
  ) {
    invalidRuntime();
  }

  if (value.source === "merchant_approved") {
    if (value.approvalStatus !== "approved" || value.safeToAutoReply !== true) {
      invalidRuntime();
    }
  } else if (
    value.approvalStatus === "approved" ||
    value.safeToAutoReply !== false
  ) {
    invalidRuntime();
  }
}

function validateAuditEvent(value: unknown): void {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(
      value,
      [
        "id",
        "merchantId",
        "action",
        "entityType",
        "entityId",
        "actor",
        "outcome",
        "createdAt",
      ],
      ["customerTextHash", "customerTextLength", "injectionSignals", "metadata"],
    )
  ) {
    invalidRuntime();
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.merchantId) ||
    !isNonEmptyString(value.action) ||
    !(
      value.entityType === "saved_answer" ||
      value.entityType === "training_request" ||
      value.entityType === "learned_answer" ||
      value.entityType === "decision"
    ) ||
    !(value.entityId === null || isNonEmptyString(value.entityId)) ||
    !(
      value.actor === "merchant" ||
      value.actor === "system" ||
      value.actor === "ai_provider"
    ) ||
    !(
      value.outcome === "success" ||
      value.outcome === "conflict" ||
      value.outcome === "rejected" ||
      value.outcome === "handoff"
    ) ||
    !isTimestamp(value.createdAt)
  ) {
    invalidRuntime();
  }

  if (
    Object.prototype.hasOwnProperty.call(value, "customerTextHash") &&
    !isSha256(value.customerTextHash)
  ) {
    invalidRuntime();
  }
  if (
    Object.prototype.hasOwnProperty.call(value, "customerTextLength") &&
    (!Number.isInteger(value.customerTextLength) || Number(value.customerTextLength) < 0)
  ) {
    invalidRuntime();
  }
  if (
    Object.prototype.hasOwnProperty.call(value, "injectionSignals") &&
    !isStringArray(value.injectionSignals)
  ) {
    invalidRuntime();
  }
  if (Object.prototype.hasOwnProperty.call(value, "metadata")) {
    if (!isPlainObject(value.metadata)) invalidRuntime();
    const forbidden = new Set([
      "customertext",
      "customermessage",
      "rawcustomertext",
      "rawmessage",
      "conversationcontent",
    ]);
    for (const [key, metadataValue] of Object.entries(value.metadata)) {
      if (forbidden.has(key.toLowerCase())) invalidRuntime();
      if (
        !(
          metadataValue === null ||
          typeof metadataValue === "string" ||
          typeof metadataValue === "boolean" ||
          (typeof metadataValue === "number" && Number.isFinite(metadataValue))
        )
      ) {
        invalidRuntime();
      }
    }
  }
}

function assertUniqueIds(items: Array<{ id: string }>): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) invalidRuntime();
    seen.add(item.id);
  }
}

function validateState(value: unknown): KnowledgeRuntimeState {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "savedAnswers",
      "trainingRequests",
      "learnedAnswers",
      "auditEvents",
    ])
  ) {
    invalidRuntime();
  }
  if (value.schemaVersion !== 1) invalidRuntime();
  if (
    !Array.isArray(value.savedAnswers) ||
    !Array.isArray(value.trainingRequests) ||
    !Array.isArray(value.learnedAnswers) ||
    !Array.isArray(value.auditEvents)
  ) {
    invalidRuntime();
  }

  value.savedAnswers.forEach(validateSavedAnswer);
  value.trainingRequests.forEach(validateTrainingRequest);
  value.learnedAnswers.forEach(validateLearnedAnswer);
  value.auditEvents.forEach(validateAuditEvent);

  const state = value as KnowledgeRuntimeState;
  assertUniqueIds(state.savedAnswers);
  assertUniqueIds(state.trainingRequests);
  assertUniqueIds(state.learnedAnswers);
  assertUniqueIds(state.auditEvents);

  const trainingById = new Map(
    state.trainingRequests.map((item) => [item.id, item]),
  );
  for (const learned of state.learnedAnswers) {
    if (!learned.trainingRequestId) continue;
    const request = trainingById.get(learned.trainingRequestId);
    if (!request || request.merchantId !== learned.merchantId) invalidRuntime();
  }

  return state;
}

function safeLanguage(value: unknown, fallbackText = ""): KnowledgeLanguage {
  return isLanguage(value) ? value : detectKnowledgeLanguage(fallbackText);
}

function safeDate(value: unknown): string {
  const candidate = String(value ?? "");
  return Number.isFinite(Date.parse(candidate))
    ? candidate
    : new Date().toISOString();
}

export type KnowledgeRepositoryOptions = {
  filePath?: string;
  importLegacyOnCreate?: boolean;
};

export class KnowledgeStateStore {
  readonly filePath: string;
  private readonly importLegacyOnCreate: boolean;

  constructor(options: KnowledgeRepositoryOptions = {}) {
    this.filePath = options.filePath || getFawriDataFilePath(DEFAULT_RUNTIME_FILE);
    this.importLegacyOnCreate = options.importLegacyOnCreate !== false;
    this.ensureStateFile();
  }

  private ensureStateFile(): void {
    if (fs.existsSync(this.filePath)) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const initial = this.importLegacyOnCreate
      ? this.buildLegacyImportState()
      : emptyState();
    this.writeState(initial);
  }

  private buildLegacyImportState(): KnowledgeRuntimeState {
    const state = emptyState();
    const dataDir = path.dirname(this.filePath);
    const now = new Date().toISOString();

    const readLegacy = (fileName: string): unknown => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, fileName), "utf8"));
      } catch {
        return null;
      }
    };

    const legacySaved = readLegacy("saved-answers.json") as
      | { answers?: Array<Record<string, unknown>> }
      | null;
    for (const raw of legacySaved?.answers || []) {
      const merchantId = boundedText(raw.merchant_id, 120);
      const questionPattern = boundedText(raw.question_pattern, 500);
      const answerText = boundedText(raw.answer_text, 2_000);
      if (!merchantId || !questionPattern || !answerText) continue;

      if (raw.approved !== true) {
        state.learnedAnswers.push({
          id: boundedText(raw.id, 160) || makeKnowledgeId("learned"),
          merchantId,
          intent: boundedText(raw.category, 100) || "legacy_saved_answer",
          language: safeLanguage(raw.language, questionPattern),
          examples: [questionPattern],
          keywords: uniqueNormalizedList(questionPattern.split(/\s+/), 12),
          answerText,
          source: "openai_generated",
          approvalStatus: "pending_review",
          confidence: 0,
          safeToAutoReply: false,
          trainingRequestId: null,
          version: 1,
          createdAt: safeDate(raw.created_at),
          updatedAt: now,
        });
        continue;
      }

      state.savedAnswers.push({
        id: boundedText(raw.id, 160) || makeKnowledgeId("saved"),
        merchantId,
        category: boundedText(raw.category, 100) || "custom",
        questionPattern,
        answerText,
        language: safeLanguage(raw.language, questionPattern),
        source: "merchant_approved",
        active: raw.active !== false,
        version: 1,
        createdAt: safeDate(raw.created_at),
        updatedAt: now,
      });
    }

    const legacyTraining = readLegacy("training-requests.json") as
      | { requests?: Array<Record<string, unknown>> }
      | null;
    for (const raw of legacyTraining?.requests || []) {
      const merchantId = boundedText(raw.merchantId, 120);
      const customerText = boundedText(raw.customerMessage, 2_000);
      if (!merchantId || !customerText) continue;

      const suggestedReply = boundedText(raw.suggestedReply, 2_000) || null;
      const suggestedReplySource: SuggestedReplySource | null = suggestedReply
        ? raw.suggestedReplySource === "merchant_draft"
          ? "merchant_draft"
          : "openai_generated"
        : null;
      const rawStatus = String(raw.status ?? "");
      const status: TrainingRequestRecord["status"] =
        rawStatus === "rejected"
          ? "rejected"
          : rawStatus === "approved" && suggestedReplySource === "merchant_draft"
            ? "approved"
            : suggestedReply
              ? "pending_review"
              : "pending_merchant_reply";

      state.trainingRequests.push({
        id: boundedText(raw.id, 160) || makeKnowledgeId("training"),
        merchantId,
        customerTextPreview: customerTextPreview(customerText),
        customerTextHash: digestCustomerText(customerText),
        detectedIntent: boundedText(raw.detectedIntent, 100) || "unknown",
        detectedLanguage: safeLanguage(raw.detectedLanguage, customerText),
        reason: boundedText(raw.reason, 300) || "legacy_import",
        suggestedReply,
        suggestedReplySource,
        status,
        rejectionReason:
          status === "rejected"
            ? boundedText(raw.rejectionReason, 300) || "legacy_rejected"
            : null,
        version: 1,
        createdAt: safeDate(raw.createdAt),
        updatedAt: safeDate(raw.updatedAt),
      });
    }

    const legacyLearned = readLegacy("learned-answers.json") as
      | { answers?: Array<Record<string, unknown>> }
      | null;
    for (const raw of legacyLearned?.answers || []) {
      const merchantId = boundedText(raw.merchantId, 120);
      const answerText = boundedText(raw.reply, 2_000);
      if (!merchantId || !answerText) continue;

      const explicitlyMerchantApproved =
        raw.source === "merchant_approved" &&
        raw.safeToAutoReply === true &&
        raw.requiresHumanApproval !== true;
      const source: LearnedAnswerRecord["source"] = explicitlyMerchantApproved
        ? "merchant_approved"
        : "openai_generated";
      const approvalStatus: LearnedAnswerRecord["approvalStatus"] =
        explicitlyMerchantApproved
          ? "approved"
          : raw.approvalStatus === "rejected"
            ? "rejected"
            : "pending_review";
      const requestedTrainingId = boundedText(raw.trainingRequestId, 160) || null;
      const trainingRequestId =
        requestedTrainingId &&
        state.trainingRequests.some(
          (request) =>
            request.id === requestedTrainingId &&
            request.merchantId === merchantId,
        )
          ? requestedTrainingId
          : null;

      state.learnedAnswers.push({
        id: boundedText(raw.id, 160) || makeKnowledgeId("learned"),
        merchantId,
        intent: boundedText(raw.intent, 100) || "unknown",
        language: safeLanguage(
          raw.language,
          String(
            (Array.isArray(raw.examples) ? raw.examples[0] : "") ?? "",
          ),
        ),
        examples: uniqueNormalizedList(
          Array.isArray(raw.examples) ? raw.examples : [],
          20,
        ),
        keywords: uniqueNormalizedList(
          Array.isArray(raw.keywords) ? raw.keywords : [],
          24,
        ),
        answerText,
        source,
        approvalStatus,
        confidence: clampConfidence(raw.confidence),
        safeToAutoReply: explicitlyMerchantApproved,
        trainingRequestId,
        version: 1,
        createdAt: safeDate(raw.createdAt),
        updatedAt: safeDate(raw.updatedAt),
      });
    }

    if (
      state.savedAnswers.length ||
      state.trainingRequests.length ||
      state.learnedAnswers.length
    ) {
      state.auditEvents.push({
        id: makeKnowledgeId("audit"),
        merchantId: "system",
        action: "legacy_import",
        entityType: "decision",
        entityId: null,
        actor: "system",
        outcome: "success",
        metadata: {
          savedAnswers: state.savedAnswers.length,
          trainingRequests: state.trainingRequests.length,
          learnedAnswers: state.learnedAnswers.length,
        },
        createdAt: now,
      });
    }

    return state;
  }

  readState(): KnowledgeRuntimeState {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      throw new KnowledgeTransitionError(
        UNREADABLE_RUNTIME_CODE,
        UNREADABLE_RUNTIME_MESSAGE,
      );
    }
    return validateState(parsed);
  }

  private writeState(state: KnowledgeRuntimeState): void {
    const validated = validateState(state);
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify(validated, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
    fs.renameSync(temporaryPath, this.filePath);
  }

  protected mutate<T>(operation: (state: KnowledgeRuntimeState) => T): T {
    const state = this.readState();
    const result = operation(state);
    state.auditEvents = state.auditEvents.slice(-MAX_AUDIT_EVENTS);
    this.writeState(state);
    return result;
  }

  appendAudit(
    event: Omit<KnowledgeAuditEvent, "id" | "createdAt">,
  ): KnowledgeAuditEvent {
    return this.mutate((state) => {
      const auditEvent: KnowledgeAuditEvent = {
        ...event,
        id: makeKnowledgeId("audit"),
        createdAt: new Date().toISOString(),
      };
      state.auditEvents.push(auditEvent);
      return auditEvent;
    });
  }

  listAuditEvents(merchantId: string, limit = 100): KnowledgeAuditEvent[] {
    return this.readState().auditEvents
      .filter((event) => event.merchantId === merchantId)
      .slice(-Math.min(Math.max(limit, 1), 250))
      .reverse();
  }
}
