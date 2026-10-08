import { createHash } from "node:crypto";
import { buildValidatedMigrationPlan, canonicalJson, validateAgainstSnapshot } from "./postgresql-cross-lane-reconciliation.mjs";
import { validateUniqueIndexes } from "./postgresql-migration-plan-safe.mjs";

export const currentOwnerId = "admin-c668ed66-2415-4a98-a80e-ce6fe6b8076a";
export const legacyOwnerId = "admin-local-bbf1565a-f04f-4db3-a65e-c2f5ad024b1c";
const hash = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const terminal = new Set(["ended", "expired", "rejected"]);

// An offline proposal only. Existing-target checks and a transactional additive
// writer are deliberately not implemented by this policy.
export function applyStagingRestorePolicy(sourceReport, snapshot, { includeRows = false } = {}) {
  const report = structuredClone(sourceReport);
  if (!report.rows) throw new Error("Staging restore policy requires a plan with rows");
  const schema = snapshot.value || snapshot;
  const history = [];
  const rows = report.rows;
  const errors = [...(report.errors || [])];
  const fail = (code, details = {}) => errors.push({ code, source: "staging_restore_policy", ...details });
  const identity = (table, row) => {
    const definition = schema.tables[`public.${table}`];
    const keys = Object.values(definition?.columns || {}).filter((c) => c.primaryKey).map((c) => c.name);
    const composite = Object.values(definition?.compositePrimaryKeys || {})[0]?.columns;
    const columns = composite || keys;
    return columns.length === 1 ? String(row[columns[0]]) : canonicalJson(columns.map((c) => row[c]));
  };
  const record = (table, row, action, details = {}) => {
    history.push({ table, record_id: identity(table, row), action, original_row_sha256: hash(row), ...details });
  };
  const exclude = (table, predicate, reason, archive = false) => {
    rows[table] = (rows[table] || []).filter((row) => {
      if (!predicate(row)) return true;
      record(table, row, "exclude", { reason, ...(archive ? { original_row: structuredClone(row) } : {}) });
      return false;
    });
  };
  const detach = (table, field, replacement = null) => {
    for (const row of rows[table] || []) {
      if (row[field] !== legacyOwnerId) continue;
      const column = schema.tables[`public.${table}`]?.columns[field];
      if (!column || (replacement === null && column.notNull)) {
        fail("RESTORE_SCHEMA_POLICY_MISMATCH", { table, field });
        continue;
      }
      record(table, row, replacement === null ? "detach" : "remap", {
        field, original_value: legacyOwnerId, replacement,
      });
      row[field] = replacement;
    }
  };

  const owners = (rows.admin_profiles || []).filter((row) => row.role === "owner_admin");
  if (owners.length !== 1 || owners[0].account_id !== legacyOwnerId || owners[0].id !== legacyOwnerId ||
      !(rows.accounts || []).some((row) => row.id === legacyOwnerId && row.kind === "admin")) {
    fail("RESTORE_UNEXPECTED_SOURCE_OWNER");
  }
  if ((rows.accounts || []).some((row) => row.id === currentOwnerId) ||
      (rows.admin_profiles || []).some((row) => row.id === currentOwnerId || row.account_id === currentOwnerId)) {
    fail("RESTORE_CURRENT_OWNER_MUST_NOT_BE_IMPORTED");
  }
  for (const row of rows.emergency_access_requests || []) {
    if (!terminal.has(row.status)) fail("RESTORE_LIVE_EMERGENCY_REQUEST", { record_id: row.id, status: row.status });
  }
  // Never reactivate sessions or import legacy authentication authority.
  for (const table of ["account_sessions", "trusted_devices", "login_attempts", "auth_otp_challenges"]) {
    if ((rows[table] || []).length) fail("RESTORE_SECURITY_ROWS_FORBIDDEN", { table });
  }
  exclude("accounts", (r) => r.id === legacyOwnerId, "legacy_owner_identity");
  exclude("admin_profiles", (r) => r.account_id === legacyOwnerId, "legacy_owner_profile");
  exclude("admin_permissions", (r) => r.admin_id === legacyOwnerId, "legacy_owner_permissions");
  exclude("emergency_authorizations", (r) => r.admin_account_id === legacyOwnerId, "legacy_owner_authorization", true);

  const archivedRequests = new Set((rows.emergency_access_requests || [])
    .filter((r) => r.requested_by_admin_account_id === legacyOwnerId && terminal.has(r.status)).map((r) => r.id));
  exclude("emergency_access_requests", (r) => archivedRequests.has(r.id), "historical_legacy_owner_request", true);
  for (const table of ["emergency_owner_alerts", "emergency_merchant_notices"]) {
    exclude(table, (r) => archivedRequests.has(r.request_id), "archived_request_dependency", true);
  }
  detach("emergency_authorizations", "granted_by_owner_account_id", currentOwnerId);
  detach("emergency_access_requests", "reviewed_by_owner_account_id");
  detach("emergency_merchant_notices", "accessed_by_admin_account_id");
  detach("audit_events", "actor_account_id");
  detach("merchant_deletion_requests", "reviewed_by_admin_id");
  detach("merchant_deletion_requests", "requested_by_admin_id");
  detach("merchant_channel_overrides", "updated_by_admin_id");

  // Fail on any unhandled FK instead of silently assigning old actions to the
  // current owner or broadening the exclusion policy.
  for (const [table, records] of Object.entries(rows)) {
    for (const fk of Object.values(schema.tables[`public.${table}`]?.foreignKeys || {})) {
      if (!["accounts", "admin_profiles"].includes(fk.tableTo)) continue;
      for (const row of records) {
        if (fk.columnsFrom.some((field) => row[field] === legacyOwnerId)) {
          fail("RESTORE_UNHANDLED_LEGACY_OWNER_REFERENCE", { table, record_id: identity(table, row), foreign_key: fk.name });
        }
      }
    }
  }
  const validation = { rows, errors: [], warnings: [] };
  validateAgainstSnapshot(validation, snapshot, { removeRows: false });
  validateUniqueIndexes(validation, snapshot);
  // Exactly one external FK is permitted as a declared precondition, never as
  // evidence that staging was inspected. No placeholder owner enters the rows.
  const grantFk = Object.values(schema.tables["public.emergency_authorizations"].foreignKeys)
    .find((fk) => fk.tableTo === "accounts" && canonicalJson(fk.columnsFrom) === '["granted_by_owner_account_id"]');
  if (!grantFk || grantFk.onDelete !== "restrict" ||
      schema.tables["public.emergency_authorizations"].columns.granted_by_owner_account_id.notNull !== true) {
    fail("RESTORE_SCHEMA_POLICY_MISMATCH", { table: "emergency_authorizations", field: "granted_by_owner_account_id" });
  }
  for (const error of validation.errors) {
    if (error.code === "ORPHAN_TARGET_REFERENCE" && error.table === "emergency_authorizations" &&
        error.foreign_key === grantFk?.name && (rows.emergency_authorizations || []).every((r) =>
          r.granted_by_owner_account_id === currentOwnerId || (rows.accounts || []).some((a) => a.id === r.granted_by_owner_account_id))) continue;
    errors.push(error);
  }
  report.table_counts = Object.fromEntries(Object.entries(rows).filter(([, values]) => values.length).map(([table, values]) => [table, values.length]));
  report.planned_row_count = Object.values(report.table_counts).reduce((sum, count) => sum + count, 0);
  const originalLineage = new Map((report.source_lineage || []).map((entry) => [`${entry.target_table}:${entry.target_record_id}`, entry]));
  report.source_lineage = Object.entries(rows).flatMap(([table, records]) => records.map((row) => {
    const id = identity(table, row);
    // Older planners identify non-id PKs using canonical JSON; retain their
    // source proof through the original row before the policy transforms it.
    const original = sourceReport.rows[table]?.find((r) => identity(table, r) === id);
    const prior = originalLineage.get(`${table}:${id}`) ||
      (table === "admin_permissions" && originalLineage.get(`${table}:${original?.admin_id}:${original?.permission}`)) ||
      (table === "order_terminal_decision_links" && originalLineage.get(`${table}:${original?.merchant_id}:${original?.order_id}`)) ||
      originalLineage.get(`${table}:${canonicalJson(original)}`);
    if (!prior) fail("RESTORE_LINEAGE_MISSING", { table, record_id: id });
    return { ...prior, target_table: table, target_record_id: id, target_record_sha256: hash(row) };
  })).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
  report.source_lineage_sha256 = hash(report.source_lineage);
  report.mode = "additive_staging_restore_dry_run";
  report.writes_performed = false;
  report.database_connection_used = false;
  report.staging_restore_policy = {
    version: 1, legacy_owner_id: legacyOwnerId, current_owner_id: currentOwnerId,
    target_state_verified: false, history_sha256: hash(history), history_records: history.length,
    changes: history.map(({ original_row, ...change }) => change),
    preconditions: ["Verify staging has exactly the current owner and no legacy owner", "Check all target key and unique conflicts without overwriting existing rows", "Review remapped emergency grants; no new consent is inferred", "Preserve and verify the separate history archive before any future write"],
  };
  report.restore_history = history;
  report.errors = errors;
  report.ok = errors.length === 0;
  report.write_readiness = { ok: false, blockers: [...errors, { code: "ADDITIVE_STAGING_WRITER_NOT_IMPLEMENTED" }] };
  report.summary = { ...report.summary, planned_rows: report.planned_row_count, source_lineage_records: report.source_lineage.length,
    errors: errors.length, write_readiness_errors: report.write_readiness.blockers.length };
  report.schema_validation = { ...validation.schema_validation, rows_removed_from_output: !includeRows, external_owner_precondition: currentOwnerId };
  report.restore_plan_sha256 = hash({ policy: report.staging_restore_policy, source_manifest: report.source_manifest_sha256,
    snapshot: snapshot.sha256 || hash(schema), lineage: report.source_lineage_sha256 });
  if (!includeRows) {
    delete report.rows;
    delete report.restore_history;
    delete report.source_lineage;
  }
  return report;
}

export function buildStagingRestorePlan(options) {
  const { report, snapshot } = buildValidatedMigrationPlan({ ...options, includeRows: true });
  return { report: applyStagingRestorePolicy(report, snapshot, options), snapshot };
}
