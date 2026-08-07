import { createHash } from "node:crypto";
import {
  buildValidatedMigrationPlan as buildBaseValidatedMigrationPlan,
  canonicalJson,
  loadLatestSnapshot,
  migrationPlanVersion,
  repositoryRoot,
  validateAgainstSnapshot,
} from "./postgresql-migration-plan.mjs";
import { addOperationalOverlayWriteReadiness } from "./postgresql-migration-write-readiness.mjs";

export {
  canonicalJson,
  loadLatestSnapshot,
  migrationPlanVersion,
  repositoryRoot,
  validateAgainstSnapshot,
};

const schemaValidationCodes = new Set([
  "TARGET_TABLE_NOT_FOUND",
  "UNKNOWN_TARGET_COLUMN",
  "REQUIRED_TARGET_VALUE_MISSING",
  "INVALID_TARGET_ENUM_VALUE",
  "DUPLICATE_TARGET_PRIMARY_KEY",
  "ORPHAN_TARGET_REFERENCE",
]);

function text(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function pushPlannerError(report, code, details = {}) {
  report.errors ||= [];
  report.errors.push({
    code,
    source: "knowledge_migration_normalization",
    ...details,
  });
}

function stripPriorSchemaValidation(report) {
  report.errors = (Array.isArray(report.errors) ? report.errors : []).filter(
    (item) => item?.source || !schemaValidationCodes.has(item?.code),
  );
  report.warnings = (Array.isArray(report.warnings) ? report.warnings : []).filter(
    (item) => item?.code !== "NULL_VALUES_WILL_USE_DATABASE_DEFAULTS",
  );
}

function normalizeSavedAnswers(report) {
  report.rows.saved_answers = (report.rows.saved_answers || []).map((row) => ({
    id: row.id,
    merchant_id: row.merchant_id,
    category: row.category,
    question_pattern: row.question_pattern,
    normalized_question:
      text(row.normalized_question || row.normalized_question_pattern || row.question_pattern)
        .toLowerCase()
        .replace(/\s+/g, " "),
    answer_text: row.answer_text,
    language: row.language,
    source: "merchant_approved",
    active: row.active !== false,
    version: Number(row.version || 1),
    created_at: row.created_at || null,
    updated_at: row.updated_at || row.created_at || null,
  }));
}

function normalizeTrainingRequests(report) {
  report.rows.training_requests = (report.rows.training_requests || []).map((row) => {
    const legacy =
      row?.metadata?.legacy && typeof row.metadata.legacy === "object"
        ? row.metadata.legacy
        : {};
    const customerText = String(
      legacy.customerMessage ?? row.customer_message ?? row.customer_text_preview ?? "",
    );
    if (customerText.length > 10000) {
      pushPlannerError(report, "KNOWLEDGE_CUSTOMER_TEXT_TOO_LARGE", {
        table: "training_requests",
        record_id: row.id,
        customer_text_length: customerText.length,
      });
    }

    const suggestedReply =
      row.suggested_reply === null || row.suggested_reply === undefined
        ? null
        : String(row.suggested_reply);
    const explicitSource = text(
      legacy.suggestedReplySource ??
        legacy.suggested_reply_source ??
        row.suggested_reply_source,
    );
    const validSource = ["merchant_draft", "openai_generated"].includes(explicitSource);
    if (suggestedReply && !validSource) {
      pushPlannerError(report, "AMBIGUOUS_KNOWLEDGE_PROVENANCE", {
        table: "training_requests",
        record_id: row.id,
        field: "suggested_reply",
      });
    }

    return {
      id: row.id,
      merchant_id: row.merchant_id,
      customer_text_preview: customerText.slice(0, 500),
      customer_text_hash: sha256(customerText),
      customer_text_length: customerText.length,
      detected_intent: text(row.detected_intent || legacy.detectedIntent),
      detected_language: row.detected_language,
      reason: text(row.reason || row.reason_code || legacy.reason),
      suggested_reply: suggestedReply,
      suggested_reply_source: suggestedReply && validSource ? explicitSource : null,
      status: row.status,
      rejection_reason: row.rejection_reason || null,
      reviewed_by_account_id: row.reviewed_by_account_id || null,
      reviewed_at: row.reviewed_at || null,
      version: Number(row.version || 1),
      created_at: row.created_at || null,
      updated_at: row.updated_at || row.created_at || null,
    };
  });
}

function normalizeLearnedAnswers(report) {
  report.rows.learned_answers = (report.rows.learned_answers || []).map((row) => {
    const legacy =
      row?.metadata?.legacy && typeof row.metadata.legacy === "object"
        ? row.metadata.legacy
        : {};
    const source = text(row.source || legacy.source);
    if (!["merchant_approved", "openai_generated"].includes(source)) {
      pushPlannerError(report, "AMBIGUOUS_KNOWLEDGE_PROVENANCE", {
        table: "learned_answers",
        record_id: row.id,
        field: "source",
      });
    }

    const legacyRequiresApproval =
      legacy.requiresHumanApproval ?? row.requires_human_approval;
    const requestedSafe = row.safe_to_auto_reply === true;
    let approvalStatus = text(row.approval_status || legacy.approvalStatus);
    if (!approvalStatus) {
      approvalStatus =
        source === "merchant_approved" &&
        requestedSafe &&
        legacyRequiresApproval === false
          ? "approved"
          : "pending_review";
    }

    if (
      source === "openai_generated" &&
      (approvalStatus === "approved" || requestedSafe)
    ) {
      pushPlannerError(report, "AMBIGUOUS_KNOWLEDGE_PROVENANCE", {
        table: "learned_answers",
        record_id: row.id,
        field: "approval_status",
      });
    }

    const safeToAutoReply =
      source === "merchant_approved" &&
      approvalStatus === "approved" &&
      requestedSafe;

    return {
      id: row.id,
      merchant_id: row.merchant_id,
      training_request_id: row.training_request_id || null,
      intent: row.intent,
      language: row.language,
      examples: Array.isArray(row.examples) ? row.examples : [],
      keywords: Array.isArray(row.keywords) ? row.keywords : [],
      answer_text: text(row.answer_text || row.reply || legacy.reply),
      source: ["merchant_approved", "openai_generated"].includes(source)
        ? source
        : "openai_generated",
      approval_status: approvalStatus,
      confidence: row.confidence ?? 0,
      safe_to_auto_reply: safeToAutoReply,
      version: Number(row.version || 1),
      created_at: row.created_at || null,
      updated_at: row.updated_at || row.created_at || null,
    };
  });
}

function normalizeKnowledgeRows(report) {
  report.rows ||= {};
  stripPriorSchemaValidation(report);
  normalizeSavedAnswers(report);
  normalizeTrainingRequests(report);
  normalizeLearnedAnswers(report);
}

export function buildValidatedMigrationPlan(options) {
  const includeRows = options?.includeRows === true;
  const result = buildBaseValidatedMigrationPlan({
    ...options,
    includeRows: true,
  });

  normalizeKnowledgeRows(result.report);
  validateAgainstSnapshot(result.report, loadLatestSnapshot(), {
    removeRows: !includeRows,
  });
  addOperationalOverlayWriteReadiness(result.report);
  return result;
}
