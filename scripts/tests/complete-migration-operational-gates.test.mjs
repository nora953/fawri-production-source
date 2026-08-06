import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertCompleteMigrationWritable,
  buildValidatedMigrationPlan,
} from "../lib/postgresql-migration-plan-complete.mjs";

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-complete-plan-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function createFixture(directory) {
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
    ordersByMerchant: {},
    orderDraftsByConversation: {},
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
  writeJson(directory, "merchant-settings.json", {
    version: 1,
    settings: {},
  });
}

function validSettings() {
  return {
    merchant_id: "merchant-1",
    version: 2,
    auto_reply_enabled: false,
    reply_language: "ku",
    delivery: {
      enabled: true,
      fee_iqd: 5000,
      free_delivery_threshold_iqd: 50000,
      estimated_days_min: 1,
      estimated_days_max: 3,
      areas: ["Baghdad", "Erbil"],
      notes: "Delivery note",
    },
    payment: {
      cash_on_delivery_enabled: true,
      electronic_payment_enabled: true,
      methods: ["cash_on_delivery", "zaincash"],
      instructions: "Payment instructions",
    },
    created_at: "2026-08-06T10:00:00.000Z",
    updated_at: "2026-08-06T11:00:00.000Z",
  };
}

test("complete plan identifies every operational overlay source", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory);
    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });

    assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
    assert.equal(report.tool_version, "5");
    assert.equal(report.write_readiness.ok, true);
    assert.equal(report.write_readiness.blockers.length, 0);
    for (const [key, file] of [
      ["manualConversationOperations", "manual-conversation-operations.json"],
      ["orderOperations", "order-operations.json"],
      ["merchantSettings", "merchant-settings.json"],
    ]) {
      assert.equal(report.source_files[key].file, file);
      assert.equal(report.source_files[key].exists, true);
      assert.match(report.source_files[key].sha256, /^[a-f0-9]{64}$/);
    }
    assert.equal(report.manual_conversation_migration.rows_included, false);
    assert.equal(report.order_operations_migration.rows_included, false);
    assert.equal(report.merchant_settings_migration.rows_included, false);
    assert.doesNotThrow(() => assertCompleteMigrationWritable(report));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("merchant settings alter the complete manifest and block unsupported writes", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory);
    const first = buildValidatedMigrationPlan({ dataDirectory: directory }).report;

    writeJson(directory, "merchant-settings.json", {
      version: 1,
      settings: { "merchant-1": validSettings() },
    });
    const second = buildValidatedMigrationPlan({ dataDirectory: directory }).report;

    assert.equal(second.ok, true, JSON.stringify(second.errors, null, 2));
    assert.notEqual(first.source_manifest_sha256, second.source_manifest_sha256);
    assert.equal(second.merchant_settings_migration.summary.settings, 1);
    assert.equal(second.write_readiness.ok, false);
    assert.equal(second.write_readiness.blockers.length, 1);
    assert.equal(
      second.write_readiness.blockers[0].code,
      "MERCHANT_SETTINGS_ROWS_NOT_MIGRATED",
    );
    assert.throws(
      () => assertCompleteMigrationWritable(second),
      error =>
        error.code === "OPERATIONAL_OVERLAY_WRITE_BLOCKED" &&
        error.blockers[0].rows === 1,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid settings block planning before database use", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory);
    const invalid = validSettings();
    invalid.delivery.estimated_days_min = 7;
    invalid.delivery.estimated_days_max = 2;
    writeJson(directory, "merchant-settings.json", {
      version: 1,
      settings: { "merchant-1": invalid },
    });

    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });
    assert.equal(report.ok, false);
    assert.equal(report.database_connection_used, false);
    assert.ok(
      report.errors.some(
        item =>
          item.code === "MERCHANT_SETTINGS_DELIVERY_INVALID" &&
          item.source === "merchant_settings_preflight",
      ),
      JSON.stringify(report.errors, null, 2),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("all unsupported overlays are reported together", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory);
    writeJson(directory, "fawri-runtime-db.json", {
      productsByMerchant: {},
      conversationsByMerchant: {
        "merchant-1": [
          {
            id: "messenger-customer-1",
            merchant_id: "merchant-1",
            page_id: "page-1",
          },
        ],
      },
      metaPagesByPageId: {
        "page-1": { page_id: "page-1", merchant_id: "merchant-1" },
      },
      ordersByMerchant: {
        "merchant-1": [
          {
            id: "order-1",
            merchant_id: "merchant-1",
            status: "pending_confirmation",
            payment_method: "zaincash",
            payment_status: "electronic_pending",
          },
        ],
      },
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
    });
    writeJson(directory, "manual-conversation-operations.json", {
      version: 1,
      conversations: {
        "merchant-1": {
          "messenger-customer-1": {
            status: "manual",
            assigned_to_human: true,
            page_id: "page-1",
            inbound_messages: [],
            manual_messages: [],
            requests: {},
            updated_at: "2026-08-06T12:00:00.000Z",
          },
        },
      },
    });
    writeJson(directory, "order-operations.json", {
      version: 1,
      orders: {
        "merchant-1": {
          "order-1": {
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
    writeJson(directory, "merchant-settings.json", {
      version: 1,
      settings: { "merchant-1": validSettings() },
    });

    const { report } = buildValidatedMigrationPlan({ dataDirectory: directory });
    assert.equal(report.ok, true, JSON.stringify(report.errors, null, 2));
    assert.equal(report.write_readiness.ok, false);
    assert.deepEqual(
      report.write_readiness.blockers.map(item => item.code).sort(),
      [
        "MANUAL_CONVERSATION_ROWS_NOT_MIGRATED",
        "MERCHANT_SETTINGS_ROWS_NOT_MIGRATED",
        "ORDER_OPERATION_ROWS_NOT_MIGRATED",
      ].sort(),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
