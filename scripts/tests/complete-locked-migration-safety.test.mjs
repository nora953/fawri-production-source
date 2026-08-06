import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCompleteLockedMigration } from "../../lib/db/scripts/run-complete-migration-with-operational-locks.mjs";

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-complete-locks-"));
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

function settingsRecord() {
  return {
    merchant_id: "merchant-1",
    version: 2,
    auto_reply_enabled: false,
    reply_language: "ku",
    delivery: {
      enabled: true,
      fee_iqd: 5000,
      free_delivery_threshold_iqd: null,
      estimated_days_min: 1,
      estimated_days_max: 3,
      areas: ["Baghdad"],
      notes: "",
    },
    payment: {
      cash_on_delivery_enabled: true,
      electronic_payment_enabled: false,
      methods: ["cash_on_delivery"],
      instructions: "",
    },
    created_at: "2026-08-06T10:00:00.000Z",
    updated_at: "2026-08-06T11:00:00.000Z",
  };
}

test("existing settings lock prevents any migration work", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory);
    const settingsLock = path.join(directory, "merchant-settings.json.lock");
    fs.writeFileSync(settingsLock, "busy\n", "utf8");

    assert.throws(
      () =>
        runCompleteLockedMigration({
          mode: "rollback",
          dataDirectory: directory,
          childEnvironment: {},
        }),
      error => error.code === "OPERATIONAL_MIGRATION_LOCK_BUSY",
    );
    assert.equal(fs.readFileSync(settingsLock, "utf8"), "busy\n");
    assert.equal(
      fs.existsSync(
        path.join(directory, "manual-conversation-operations.json.lock"),
      ),
      false,
    );
    assert.equal(
      fs.existsSync(path.join(directory, "order-operations.json.lock")),
      false,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("merchant settings rows block the child writer and release every lock", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory);
    writeJson(directory, "merchant-settings.json", {
      version: 1,
      settings: { "merchant-1": settingsRecord() },
    });

    assert.throws(
      () =>
        runCompleteLockedMigration({
          mode: "commit",
          dataDirectory: directory,
          childEnvironment: {
            DATABASE_URL: "postgresql://must-not-connect.invalid/fawri",
          },
        }),
      error => {
        assert.equal(error.code, "OPERATIONAL_OVERLAY_WRITE_BLOCKED");
        assert.ok(
          error.blockers.some(
            item => item.code === "MERCHANT_SETTINGS_ROWS_NOT_MIGRATED",
          ),
        );
        return true;
      },
    );

    for (const fileName of [
      "manual-conversation-operations.json.lock",
      "order-operations.json.lock",
      "merchant-settings.json.lock",
    ]) {
      assert.equal(fs.existsSync(path.join(directory, fileName)), false);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid settings fail the plan before child process startup", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory);
    const invalid = settingsRecord();
    invalid.payment.cash_on_delivery_enabled = false;
    invalid.payment.electronic_payment_enabled = false;
    invalid.payment.methods = [];
    writeJson(directory, "merchant-settings.json", {
      version: 1,
      settings: { "merchant-1": invalid },
    });

    assert.throws(
      () =>
        runCompleteLockedMigration({
          mode: "rollback",
          dataDirectory: directory,
          childEnvironment: {
            DATABASE_URL: "postgresql://must-not-connect.invalid/fawri",
          },
        }),
      error => {
        assert.equal(error.code, "MIGRATION_PLAN_INVALID");
        assert.ok(
          error.report.errors.some(
            item => item.code === "MERCHANT_SETTINGS_PAYMENT_UNAVAILABLE",
          ),
        );
        return true;
      },
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
