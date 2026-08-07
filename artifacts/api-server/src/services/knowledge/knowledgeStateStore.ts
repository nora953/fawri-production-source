import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../../lib/dataPaths.js";
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
import type {
  KnowledgeAuditEvent,
  KnowledgeLanguage,
  KnowledgeRuntimeState,
  LearnedAnswerRecord,
  SavedAnswerRecord,
  SemanticDocument,
  SuggestedReplySource,
  TrainingRequestRecord,
} from "./types.js";

const MAX_AUDIT_EVENTS = 2_000;
const DEFAULT_RUNTIME_FILE = "knowledge-runtime.json";

function emptyState(): KnowledgeRuntimeState {
  return {
    schemaVersion: 1,
    savedAnswers: [],
    trainingRequests: [],
    learnedAnswers: [],
    auditEvents: [],
  };
}

function isLanguage(value: unknown): value is KnowledgeLanguage {
  return value === "ar" || value === "ku" || value === "en";
}

function safeLanguage(value: unknown, fallbackText = ""): KnowledgeLanguage {
  return isLanguage(value) ? value : detectKnowledgeLanguage(fallbackText);
}

function safeDate(value: unknown): string {
  const candidate = String(value ?? "");
  return Number.isFinite(Date.parse(candidate)) ? candidate : new Date().toISOString();
}

function safeVersion(value: unknown): number {
  const version = Number(value);
  return Number.isInteger(version) && version > 0 ? version : 1;
}

function validateState(value: unknown): KnowledgeRuntimeState {
  if (!value || typeof value !== "object") return emptyState();
  const input = value as Partial<KnowledgeRuntimeState>;
  const state = emptyState();

  if (Array.isArray(input.savedAnswers)) {
    state.savedAnswers = input.savedAnswers.filter((item): item is SavedAnswerRecord =>
      Boolean(
        item &&
          typeof item.id === "string" &&
          typeof item.merchantId === "string" &&
          typeof item.questionPattern === "string" &&
          typeof item.answerText === "string" &&
          isLanguage(item.language) &&
          item.source === "merchant_approved" &&
          typeof item.active === "boolean" &&
          Number.isInteger(item.version),
      ),
    );
  }

  if (Array.isArray(input.trainingRequests)) {
    state.trainingRequests = input.trainingRequests.filter((item): item is TrainingRequestRecord =>
      Boolean(
        item &&
          typeof item.id === "string" &&
          typeof item.merchantId === "string" &&
          typeof item.customerTextPreview === "string" &&
          typeof item.customerTextHash === "string" &&
          typeof item.detectedIntent === "string" &&
          isLanguage(item.detectedLanguage) &&
          ["pending_merchant_reply", "pending_review", "approved", "rejected"].includes(item.status) &&
          Number.isInteger(item.version),
      ),
    );
  }

  if (Array.isArray(input.learnedAnswers)) {
    state.learnedAnswers = input.learnedAnswers
      .filter((item): item is LearnedAnswerRecord =>
        Boolean(
          item &&
            typeof item.id === "string" &&
            typeof item.merchantId === "string" &&
            typeof item.answerText === "string" &&
            isLanguage(item.language) &&
            ["merchant_approved", "openai_generated"].includes(item.source) &&
            ["pending_review", "approved", "rejected"].includes(item.approvalStatus) &&
            Number.isInteger(item.version),
        ),
      )
      .map((item) => ({
        ...item,
        safeToAutoReply:
          item.source === "merchant_approved" &&
          item.approvalStatus === "approved" &&
          item.safeToAutoReply === true,
      }));
  }

  if (Array.isArray(input.auditEvents)) {
    state.auditEvents = input.auditEvents
      .filter((item): item is KnowledgeAuditEvent =>
        Boolean(
          item &&
            typeof item.id === "string" &&
            typeof item.merchantId === "string" &&
            typeof item.action === "string" &&
            typeof item.createdAt === "string",
        ),
      )
      .slice(-MAX_AUDIT_EVENTS);
  }

  return state;
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
    const initial = this.importLegacyOnCreate ? this.buildLegacyImportState() : emptyState();
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
      const status = ["pending_merchant_reply", "pending_review", "approved", "rejected"].includes(
        String(raw.status),
      )
        ? (String(raw.status) as TrainingRequestRecord["status"])
        : "pending_merchant_reply";

      state.trainingRequests.push({
        id: boundedText(raw.id, 160) || makeKnowledgeId("training"),
        merchantId,
        customerTextPreview: customerTextPreview(customerText),
        customerTextHash: digestCustomerText(customerText),
        detectedIntent: boundedText(raw.detectedIntent, 100) || "unknown",
        detectedLanguage: safeLanguage(raw.detectedLanguage, customerText),
        reason: boundedText(raw.reason, 300) || "legacy_import",
        suggestedReply: boundedText(raw.suggestedReply, 2_000) || null,
        suggestedReplySource: raw.suggestedReply ? "merchant_draft" : null,
        status,
        rejectionReason: null,
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
      const source = raw.source === "merchant_approved" ? "merchant_approved" : "openai_generated";
      const approved = source === "merchant_approved" && raw.safeToAutoReply === true && raw.requiresHumanApproval !== true;

      state.learnedAnswers.push({
        id: boundedText(raw.id, 160) || makeKnowledgeId("learned"),
        merchantId,
        intent: boundedText(raw.intent, 100) || "unknown",
        language: safeLanguage(raw.language, String((Array.isArray(raw.examples) ? raw.examples[0] : "") ?? "")),
        examples: uniqueNormalizedList(Array.isArray(raw.examples) ? raw.examples : [], 20),
        keywords: uniqueNormalizedList(Array.isArray(raw.keywords) ? raw.keywords : [], 24),
        answerText,
        source,
        approvalStatus: approved ? "approved" : "pending_review",
        confidence: clampConfidence(raw.confidence),
        safeToAutoReply: approved,
        trainingRequestId: boundedText(raw.trainingRequestId, 160) || null,
        version: 1,
        createdAt: safeDate(raw.createdAt),
        updatedAt: safeDate(raw.updatedAt),
      });
    }

    if (state.savedAnswers.length || state.trainingRequests.length || state.learnedAnswers.length) {
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
    try {
      return validateState(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    } catch (error) {
      throw new KnowledgeTransitionError(
        "KNOWLEDGE_RUNTIME_UNREADABLE",
        error instanceof Error ? error.message : "knowledge runtime is unreadable",
      );
    }
  }

  private writeState(state: KnowledgeRuntimeState): void {
    const directory = path.dirname(this.filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}
`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, this.filePath);
  }

  protected mutate<T>(operation: (state: KnowledgeRuntimeState) => T): T {
    const state = this.readState();
    const result = operation(state);
    state.auditEvents = state.auditEvents.slice(-MAX_AUDIT_EVENTS);
    this.writeState(state);
    return result;
  }

  appendAudit(event: Omit<KnowledgeAuditEvent, "id" | "createdAt">): KnowledgeAuditEvent {
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
