import assert from "node:assert/strict";
import test from "node:test";

import {
  loadLatestSnapshot,
  normalizeSupportPreviewSessions,
  validateUniqueIndexes,
} from "../lib/postgresql-migration-plan-safe.mjs";

function endedSession(id, requestId, startedAt, endedAt, endReason = "expired") {
  return {
    id,
    request_id: requestId,
    ticket_id: "ticket-1",
    merchant_id: "merchant-1",
    admin_account_id: "admin-1",
    status: "ended",
    started_at: startedAt,
    expires_at: endedAt,
    last_seen_at: endedAt,
    ended_at: endedAt,
    end_reason: endReason,
    viewed_sections: ["snapshot"],
  };
}

function reportWithPreviewRows(rows) {
  return {
    ok: true,
    errors: [],
    warnings: [],
    rows: {
      support_preview_sessions: rows,
      support_inspection_requests: [
        {
          id: "request-1",
          ticket_id: "ticket-1",
          merchant_id: "merchant-1",
          admin_account_id: "admin-1",
          mode: "independent_read_only",
          reason: "Support inspection",
          status: "expired",
          consent_decision: "approved",
          request_expires_at: "2026-08-05T03:00:00.000Z",
          metadata: { legacy: { id: "request-1" } },
        },
      ],
    },
  };
}

test("terminal legacy support preview replay collapses to first consent consumption and preserves evidence", () => {
  const first = endedSession(
    "preview-first",
    "request-1",
    "2026-08-05T02:29:37.395Z",
    "2026-08-05T02:56:47.853Z",
    "admin_terminated",
  );
  const replay = endedSession(
    "preview-replay",
    "request-1",
    "2026-08-05T02:56:56.784Z",
    "2026-08-05T03:27:32.606Z",
    "expired",
  );
  const report = reportWithPreviewRows([replay, first]);

  normalizeSupportPreviewSessions(report);

  assert.deepEqual(
    report.rows.support_preview_sessions.map((row) => row.id),
    ["preview-first"],
  );
  assert.equal(report.errors.length, 0);
  assert.ok(
    report.warnings.some(
      (warning) =>
        warning.code === "LEGACY_SUPPORT_PREVIEW_REPLAY_COLLAPSED" &&
        warning.request_id === "request-1" &&
        warning.retained_preview_session_id === "preview-first",
    ),
    JSON.stringify(report.warnings),
  );
  const evidence =
    report.rows.support_inspection_requests[0].metadata.migration_normalization
      .support_preview_consent_replay;
  assert.equal(evidence.canonical_preview_session_id, "preview-first");
  assert.deepEqual(evidence.dropped_replayed_sessions, [
    {
      id: "preview-replay",
      started_at: "2026-08-05T02:56:56.784Z",
      ended_at: "2026-08-05T03:27:32.606Z",
      end_reason: "expired",
      status: "ended",
    },
  ]);
});

test("nonterminal legacy support preview replay remains fail-closed", () => {
  const first = endedSession(
    "preview-first",
    "request-1",
    "2026-08-05T02:29:37.395Z",
    "2026-08-05T02:56:47.853Z",
  );
  const active = {
    ...endedSession(
      "preview-active",
      "request-1",
      "2026-08-05T02:56:56.784Z",
      "2026-08-05T03:27:32.606Z",
    ),
    status: "active",
    ended_at: null,
    end_reason: null,
  };
  const report = reportWithPreviewRows([first, active]);

  normalizeSupportPreviewSessions(report);

  assert.equal(report.rows.support_preview_sessions.length, 2);
  assert.ok(
    report.errors.some(
      (error) =>
        error.code === "LEGACY_SUPPORT_PREVIEW_REPLAY_UNSAFE" &&
        error.request_id === "request-1",
    ),
    JSON.stringify(report.errors),
  );
});

test("schema unique-index validation catches collisions missed by primary-key validation", () => {
  const snapshot = loadLatestSnapshot();
  const report = {
    ok: true,
    errors: [],
    warnings: [],
    rows: {
      support_preview_sessions: [
        endedSession(
          "preview-a",
          "request-1",
          "2026-08-05T01:00:00.000Z",
          "2026-08-05T01:30:00.000Z",
        ),
        endedSession(
          "preview-b",
          "request-1",
          "2026-08-05T02:00:00.000Z",
          "2026-08-05T02:30:00.000Z",
        ),
      ],
    },
  };

  validateUniqueIndexes(report, snapshot);

  assert.equal(report.ok, false);
  assert.ok(
    report.errors.some(
      (error) =>
        error.code === "DUPLICATE_TARGET_UNIQUE_INDEX" &&
        error.table === "support_preview_sessions" &&
        error.unique_definition === "support_preview_sessions_request_unique" &&
        error.record_id === "preview-b" &&
        error.conflicts_with_record_id === "preview-a",
    ),
    JSON.stringify(report.errors),
  );
});

test("normal unique indexes preserve PostgreSQL null-distinct semantics", () => {
  const snapshot = loadLatestSnapshot();
  const report = {
    ok: true,
    errors: [],
    warnings: [],
    rows: {
      accounts: [
        { id: "closed-a", phone: null },
        { id: "closed-b", phone: null },
      ],
    },
  };

  validateUniqueIndexes(report, snapshot);

  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(report.errors.length, 0);
});
