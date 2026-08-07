import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildValidatedMigrationPlan } from "../lib/postgresql-migration-plan-complete.mjs";

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-order-plan-gate-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function createBaseFixture(directory) {
  writeJson(directory, "merchants.json", {
    merchants: [
      {
        id: "merchant-1",
        is_admin: false,
        phone: "07111111111",
        password: "legacy-password-hash",
        owner_name: "Owner",
        store_name: "Store",
        activity_type: "retail",
        status: "approved",
        account_status: "approved",
        onboarding_status: "channel_connected",
        trial_status: "active",
        signup_source: "direct",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    subscriptions: [],
  });
  writeJson(directory, "fawri-runtime-db.json", {
    productsByMerchant: {},
    conversationsByMerchant: {},
    metaPagesByPageId: {},
    orderDraftsByConversation: {},
    ordersByMerchant: {
      "merchant-1": [
        {
          id: "order-1",
          merchant_id: "merchant-1",
          customer_name: "Customer",
          customer_phone: "07222222222",
          customer_address: "Baghdad",
          product_name: "Product",
          quantity: 1,
          unit_price: 10000,
          total_price: 10000,
          status: "pending_confirmation",
          payment_method: "zaincash",
          payment_status: "electronic_pending",
          source_channel: "messenger",
          created_at: "2026-08-06T10:00:00.000Z",
          updated_at: "2026-08-06T10:00:00.000Z",
        },
      ],
    },
    lastSyncedMerchantId: null,
  });
  writeJson(directory, "background-jobs.json", { version: 1, jobs: [] });
  writeJson(directory, "processed-meta-events.json", { events: {} });
  writeJson(directory, "reply-reservations.json", { reservations: {} });
  writeJson(directory, "manual-conversation-operations.json", {
    version: 1,
    conversations: {},
  });
  writeJson(directory, "order-operations.json", {
    version: 1,
    orders: {},
  });
}

test("validated plan includes order operation source identity", () => {
  const directory = makeDirectory();
  try {
    createBaseFixture(directory);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });

    assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
    assert.equal(report.tool_version, "6");
    assert.equal(report.order_operations_migration.ok, true);
    assert.equal(report.order_operations_migration.rows_included, true);
    assert.equal(
      report.source_files.orderOperations.file,
      "order-operations.json",
    );
    assert.equal(report.source_files.orderOperations.exists, true);
    assert.match(report.source_files.orderOperations.sha256, /^[a-f0-9]{64}$/);
    assert.equal(report.order_operations_migration.summary.operations, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("order operation changes alter the validated source manifest", () => {
  const directory = makeDirectory();
  try {
    createBaseFixture(directory);
    const first = buildValidatedMigrationPlan({ dataDirectory: directory }).report;

    writeJson(directory, "order-operations.json", {
      version: 2,
      orders: {
        "merchant-1": {
          "order-1": {
            version: 2,
            status: "confirmed",
            payment_status: "paid",
            payment_verified_at: "2026-08-06T12:00:00.000Z",
            payment_verified_by: "merchant-1",
            payment_rejection_reason: null,
            last_payment_decision_id: "decision-1",
            updated_at: "2026-08-06T12:00:00.000Z",
          },
        },
      },
      payment_decisions: [
        {
          id: "decision-1",
          merchant_id: "merchant-1",
          order_id: "order-1",
          operation: "confirm",
          payment_channel: "electronic",
          outcome: "paid",
          previous_payment_status: "electronic_pending",
          resulting_payment_status: "paid",
          previous_order_status: "pending_confirmation",
          resulting_order_status: "confirmed",
          actor_type: "merchant",
          actor_id: "merchant-1",
          request_id: "manifest-change-request-1",
          expected_version: 1,
          resulting_version: 2,
          decided_at: "2026-08-06T12:00:00.000Z",
        },
      ],
    });
    const second = buildValidatedMigrationPlan({ dataDirectory: directory }).report;

    assert.equal(first.ok, true);
    assert.equal(second.ok, true, JSON.stringify(second.errors, null, 2));
    assert.notEqual(first.source_manifest_sha256, second.source_manifest_sha256);
    assert.equal(second.order_operations_migration.summary.operations, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("orphan order operation blocks the validated plan before database use", () => {
  const directory = makeDirectory();
  try {
    createBaseFixture(directory);
    writeJson(directory, "order-operations.json", {
      version: 1,
      orders: {
        "merchant-1": {
          "missing-order": {
            version: 2,
            status: "confirmed",
            payment_status: "paid",
            payment_verified_at: "2026-08-06T12:00:00.000Z",
            payment_verified_by: "merchant-1",
            updated_at: "2026-08-06T12:00:00.000Z",
          },
        },
      },
    });

    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });
    assert.equal(report.ok, false);
    assert.equal(report.database_connection_used, false);
    assert.equal(report.schema_validation.database_connection_used, false);
    assert.ok(
      report.errors.some(
        (item) =>
          item.code === "ORDER_OPERATION_ORDER_MISSING" &&
          item.source === "order_operations_preflight",
      ),
      JSON.stringify(report.errors, null, 2),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("contradictory paid metadata blocks the validated plan", () => {
  const directory = makeDirectory();
  try {
    createBaseFixture(directory);
    writeJson(directory, "order-operations.json", {
      version: 1,
      orders: {
        "merchant-1": {
          "order-1": {
            version: 2,
            status: "confirmed",
            payment_status: "paid",
            payment_rejection_reason: "cannot be both paid and rejected",
            updated_at: "2026-08-06T12:00:00.000Z",
          },
        },
      },
    });

    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });
    assert.equal(report.ok, false);
    assert.ok(
      report.errors.some(
        (item) =>
          item.code === "ORDER_OPERATION_PAID_METADATA_INVALID" &&
          item.source === "order_operations_preflight",
      ),
      JSON.stringify(report.errors, null, 2),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
