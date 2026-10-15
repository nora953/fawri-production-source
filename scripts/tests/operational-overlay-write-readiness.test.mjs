import assert from "node:assert/strict";
import test from "node:test";
import {
  addOperationalOverlayWriteReadiness,
  assertOperationalOverlaysWritable,
  operationalOverlayWriteBlockers,
} from "../lib/postgresql-migration-write-readiness.mjs";

test("empty operational overlays are write-ready", () => {
  const report = {
    summary: {},
    manual_conversation_migration: {
      summary: {
        conversations: 0,
        inbound_messages: 0,
        manual_messages: 0,
        requests: 0,
      },
    },
    order_operations_migration: { summary: { operations: 0 } },
  };

  assert.deepEqual(operationalOverlayWriteBlockers(report), []);
  assert.doesNotThrow(() => assertOperationalOverlaysWritable(report));
  addOperationalOverlayWriteReadiness(report);
  assert.deepEqual(report.write_readiness, {
    ok: true,
    operational_overlays_supported: false,
    blockers: [],
  });
  assert.equal(report.summary.write_readiness_errors, 0);
});

test("manual takeover rows block a writer that cannot insert them", () => {
  const report = {
    summary: {},
    manual_conversation_migration: {
      summary: {
        conversations: 1,
        inbound_messages: 2,
        manual_messages: 1,
        requests: 1,
      },
    },
    order_operations_migration: { summary: { operations: 0 } },
  };

  const blockers = operationalOverlayWriteBlockers(report);
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].code, "MANUAL_CONVERSATION_ROWS_NOT_MIGRATED");
  assert.equal(blockers[0].rows, 5);
  assert.deepEqual(blockers[0].counts, {
    conversations: 1,
    inbound_messages: 2,
    manual_messages: 1,
    requests: 1,
  });
  assert.equal(JSON.stringify(blockers).includes("message text"), false);
  assert.throws(
    () => assertOperationalOverlaysWritable(report),
    (error) => {
      assert.equal(error.code, "OPERATIONAL_OVERLAY_WRITE_BLOCKED");
      assert.equal(error.blockers[0].code, blockers[0].code);
      return true;
    },
  );
});

test("order operation rows block a writer that cannot apply them", () => {
  const report = {
    summary: {},
    manual_conversation_migration: {
      summary: {
        conversations: 0,
        inbound_messages: 0,
        manual_messages: 0,
        requests: 0,
      },
    },
    order_operations_migration: { summary: { operations: 3 } },
  };

  const blockers = operationalOverlayWriteBlockers(report);
  assert.equal(blockers.length, 1);
  assert.deepEqual(blockers[0], {
    severity: "error",
    code: "ORDER_OPERATION_ROWS_NOT_MIGRATED",
    source: "migration_write_readiness",
    file: "order-operations.json",
    rows: 3,
    counts: { operations: 3 },
    reason:
      "the current PostgreSQL writer does not apply server-side order and payment operation overlays",
  });
});

test("all unsupported operational overlays are reported together", () => {
  const report = {
    summary: {},
    manual_conversation_migration: {
      summary: {
        conversations: 1,
        inbound_messages: 1,
        manual_messages: 0,
        requests: 0,
      },
    },
    order_operations_migration: { summary: { operations: 2 } },
  };

  addOperationalOverlayWriteReadiness(report);
  assert.equal(report.write_readiness.ok, false);
  assert.equal(report.write_readiness.blockers.length, 2);
  assert.equal(report.summary.write_readiness_errors, 2);
});
