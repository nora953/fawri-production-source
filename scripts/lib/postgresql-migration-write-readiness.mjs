function count(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function issue(code, details) {
  return {
    severity: "error",
    code,
    source: "migration_write_readiness",
    ...details,
  };
}

export function operationalOverlayWriteBlockers(report) {
  const blockers = [];
  const manualSummary = report?.manual_conversation_migration?.summary || {};
  const manualCounts = {
    conversations: count(manualSummary.conversations),
    inbound_messages: count(manualSummary.inbound_messages),
    manual_messages: count(manualSummary.manual_messages),
    requests: count(manualSummary.requests),
  };
  const manualRows = Object.values(manualCounts).reduce(
    (total, value) => total + value,
    0,
  );
  if (manualRows > 0) {
    blockers.push(
      issue("MANUAL_CONVERSATION_ROWS_NOT_MIGRATED", {
        file: "manual-conversation-operations.json",
        rows: manualRows,
        counts: manualCounts,
        reason:
          "the current PostgreSQL writer does not insert manual takeover messages and reply requests",
      }),
    );
  }

  const orderSummary = report?.order_operations_migration?.summary || {};
  const orderOperations = count(orderSummary.operations);
  if (orderOperations > 0) {
    blockers.push(
      issue("ORDER_OPERATION_ROWS_NOT_MIGRATED", {
        file: "order-operations.json",
        rows: orderOperations,
        counts: { operations: orderOperations },
        reason:
          "the current PostgreSQL writer does not apply server-side order and payment operation overlays",
      }),
    );
  }

  return blockers;
}

export function assertOperationalOverlaysWritable(report) {
  const blockers = operationalOverlayWriteBlockers(report);
  if (blockers.length === 0) return;
  const error = new Error(
    `PostgreSQL write blocked: ${blockers.map((item) => item.code).join(", ")}`,
  );
  error.code = "OPERATIONAL_OVERLAY_WRITE_BLOCKED";
  error.blockers = blockers;
  throw error;
}

export function addOperationalOverlayWriteReadiness(report) {
  const blockers = operationalOverlayWriteBlockers(report);
  report.write_readiness = {
    ok: blockers.length === 0,
    operational_overlays_supported: false,
    blockers,
  };
  report.summary = {
    ...(report.summary || {}),
    write_readiness_errors: blockers.length,
  };
  return report;
}
