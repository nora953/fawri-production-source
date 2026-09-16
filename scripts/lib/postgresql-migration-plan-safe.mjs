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
  "DUPLICATE_TARGET_UNIQUE_INDEX",
  "DUPLICATE_TARGET_UNIQUE_CONSTRAINT",
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

function pushSupportMigrationError(report, code, details = {}) {
  report.errors ||= [];
  report.errors.push({
    code,
    source: "support_preview_migration_normalization",
    ...details,
  });
}

function pushSupportMigrationWarning(report, code, details = {}) {
  report.warnings ||= [];
  report.warnings.push({
    code,
    source: "support_preview_migration_normalization",
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

function parsedTime(value) {
  const result = new Date(String(value || "")).getTime();
  return Number.isFinite(result) ? result : null;
}

function terminalPreviewSession(row) {
  return text(row?.status) === "ended" && parsedTime(row?.ended_at) !== null;
}

function safeReplayEvidence(row) {
  return {
    id: text(row?.id),
    started_at: row?.started_at || null,
    ended_at: row?.ended_at || null,
    end_reason: text(row?.end_reason) || null,
    status: text(row?.status) || null,
  };
}

export function normalizeSupportPreviewSessions(report) {
  report.rows ||= {};
  const sessions = Array.isArray(report.rows.support_preview_sessions)
    ? report.rows.support_preview_sessions
    : [];
  const byRequest = new Map();
  for (const row of sessions) {
    const requestId = text(row?.request_id);
    if (!requestId) continue;
    const group = byRequest.get(requestId) || [];
    group.push(row);
    byRequest.set(requestId, group);
  }

  const droppedIds = new Set();
  for (const [requestId, group] of byRequest.entries()) {
    if (group.length <= 1) continue;
    const deterministic = group
      .map((row) => ({ row, startedAt: parsedTime(row?.started_at) }))
      .sort(
        (left, right) =>
          (left.startedAt ?? Number.MAX_SAFE_INTEGER) -
            (right.startedAt ?? Number.MAX_SAFE_INTEGER) ||
          text(left.row?.id).localeCompare(text(right.row?.id)),
      );
    const unsafe = deterministic.some(
      (entry) => entry.startedAt === null || !terminalPreviewSession(entry.row),
    );
    if (unsafe) {
      pushSupportMigrationError(report, "LEGACY_SUPPORT_PREVIEW_REPLAY_UNSAFE", {
        table: "support_preview_sessions",
        request_id: requestId,
        preview_session_ids: deterministic.map((entry) => text(entry.row?.id)),
      });
      continue;
    }

    const retained = deterministic[0].row;
    const dropped = deterministic.slice(1).map((entry) => entry.row);
    for (const row of dropped) droppedIds.add(text(row?.id));

    const request = (report.rows.support_inspection_requests || []).find(
      (candidate) => text(candidate?.id) === requestId,
    );
    if (request) {
      const metadata =
        request.metadata && typeof request.metadata === "object"
          ? structuredClone(request.metadata)
          : {};
      const normalization =
        metadata.migration_normalization &&
        typeof metadata.migration_normalization === "object"
          ? metadata.migration_normalization
          : {};
      metadata.migration_normalization = {
        ...normalization,
        support_preview_consent_replay: {
          canonical_preview_session_id: text(retained?.id),
          dropped_replayed_sessions: dropped.map(safeReplayEvidence),
        },
      };
      request.metadata = metadata;
    }

    pushSupportMigrationWarning(
      report,
      "LEGACY_SUPPORT_PREVIEW_REPLAY_COLLAPSED",
      {
        table: "support_preview_sessions",
        request_id: requestId,
        retained_preview_session_id: text(retained?.id),
        dropped_preview_session_ids: dropped.map((row) => text(row?.id)),
        durable_evidence_preserved_in:
          "support_inspection_requests.metadata.migration_normalization",
      },
    );
  }

  if (droppedIds.size > 0) {
    report.rows.support_preview_sessions = sessions.filter(
      (row) => !droppedIds.has(text(row?.id)),
    );
  }
}

function rowRecordId(row, index) {
  return text(row?.id || row?.account_id || row?.merchant_id) || `row-${index + 1}`;
}

function uniqueColumnsFromIndex(index) {
  if (!index?.isUnique || index?.where) return null;
  const columns = Array.isArray(index.columns) ? index.columns : [];
  if (
    columns.length === 0 ||
    columns.some(
      (column) => column?.isExpression === true || !text(column?.expression),
    )
  ) {
    return null;
  }
  return columns.map((column) => text(column.expression));
}

function uniqueCollisionKey(row, columns) {
  return canonicalJson(columns.map((column) => row?.[column]));
}

function hasDatabaseNull(row, columns) {
  return columns.some(
    (column) => row?.[column] === null || row?.[column] === undefined,
  );
}

function validateUniqueDefinition(
  report,
  tableName,
  tableRows,
  definitionName,
  columns,
  code,
  { nullsNotDistinct = false } = {},
) {
  const seen = new Map();
  tableRows.forEach((row, index) => {
    if (!nullsNotDistinct && hasDatabaseNull(row, columns)) return;
    const key = uniqueCollisionKey(row, columns);
    const recordId = rowRecordId(row, index);
    if (seen.has(key)) {
      report.errors ||= [];
      report.errors.push({
        code,
        source: "schema_validation",
        table: tableName,
        unique_definition: definitionName,
        columns,
        record_id: recordId,
        conflicts_with_record_id: seen.get(key),
      });
      return;
    }
    seen.set(key, recordId);
  });
}

export function validateUniqueIndexes(report, snapshotDescriptor) {
  const snapshot = snapshotDescriptor?.value || snapshotDescriptor;
  const rows = report.rows && typeof report.rows === "object" ? report.rows : {};
  for (const [tableName, tableRowsValue] of Object.entries(rows)) {
    const tableRows = Array.isArray(tableRowsValue) ? tableRowsValue : [];
    const table = snapshot?.tables?.[`public.${tableName}`];
    if (!table || tableRows.length <= 1) continue;

    for (const index of Object.values(table.indexes || {})) {
      const columns = uniqueColumnsFromIndex(index);
      if (!columns) continue;
      validateUniqueDefinition(
        report,
        tableName,
        tableRows,
        index.name,
        columns,
        "DUPLICATE_TARGET_UNIQUE_INDEX",
      );
    }

    for (const constraint of Object.values(table.uniqueConstraints || {})) {
      const columns = Array.isArray(constraint?.columns)
        ? constraint.columns.map(text).filter(Boolean)
        : [];
      if (columns.length === 0) continue;
      validateUniqueDefinition(
        report,
        tableName,
        tableRows,
        constraint.name,
        columns,
        "DUPLICATE_TARGET_UNIQUE_CONSTRAINT",
        { nullsNotDistinct: constraint.nullsNotDistinct === true },
      );
    }
  }

  report.ok = (report.errors || []).length === 0;
  report.summary = {
    ...(report.summary || {}),
    errors: (report.errors || []).length,
    warnings: (report.warnings || []).length,
  };
  return report;
}

export function buildValidatedMigrationPlan(options) {
  const includeRows = options?.includeRows === true;
  const result = buildBaseValidatedMigrationPlan({
    ...options,
    includeRows: true,
  });

  normalizeKnowledgeRows(result.report);
  normalizeSupportPreviewSessions(result.report);
  const snapshot = loadLatestSnapshot();
  validateAgainstSnapshot(result.report, snapshot, {
    removeRows: false,
  });
  validateUniqueIndexes(result.report, snapshot);
  if (!includeRows) delete result.report.rows;
  if (result.report.schema_validation) {
    result.report.schema_validation.rows_removed_from_output = !includeRows;
  }
  addOperationalOverlayWriteReadiness(result.report);
  return result;
}
