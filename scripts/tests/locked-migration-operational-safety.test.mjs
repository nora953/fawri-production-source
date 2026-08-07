import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runLockedMigration } from "../../lib/db/scripts/run-migration-with-operational-locks.mjs";

function makeDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-locked-migration-"));
}

function writeJson(directory, fileName, value) {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function createFixture(directory, { orderOperations = {} } = {}) {
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
    orders: orderOperations,
  });
}

test("an existing operational lock prevents migration startup", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory);
    const lockPath = path.join(
      directory,
      "manual-conversation-operations.json.lock",
    );
    fs.writeFileSync(lockPath, "already-busy\n", "utf8");

    assert.throws(
      () =>
        runLockedMigration({
          mode: "rollback",
          dataDirectory: directory,
          childEnvironment: {},
        }),
      (error) => {
        assert.equal(error.code, "OPERATIONAL_MIGRATION_LOCK_BUSY");
        return true;
      },
    );
    assert.equal(fs.readFileSync(lockPath, "utf8"), "already-busy\n");
    assert.equal(
      fs.existsSync(path.join(directory, "order-operations.json.lock")),
      false,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("valid but unsupported order overlays block the child writer", () => {
  const directory = makeDirectory();
  try {
    createFixture(directory, {
      orderOperations: {
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

    assert.throws(
      () =>
        runLockedMigration({
          mode: "rollback",
          dataDirectory: directory,
          childEnvironment: {
            DATABASE_URL: "postgresql://must-not-connect.invalid/fawri",
          },
        }),
      (error) => {
        assert.equal(error.code, "OPERATIONAL_OVERLAY_WRITE_BLOCKED");
        assert.ok(
          error.blockers.some(
            (item) => item.code === "ORDER_OPERATION_ROWS_NOT_MIGRATED",
          ),
        );
        return true;
      },
    );
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

test("valid but unsupported manual overlays block the child writer", () => {
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
      orderDraftsByConversation: {},
      ordersByMerchant: {},
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

    assert.throws(
      () =>
        runLockedMigration({
          mode: "commit",
          dataDirectory: directory,
          childEnvironment: {
            DATABASE_URL: "postgresql://must-not-connect.invalid/fawri",
          },
        }),
      (error) => {
        assert.equal(error.code, "OPERATIONAL_OVERLAY_WRITE_BLOCKED");
        assert.ok(
          error.blockers.some(
            (item) => item.code === "MANUAL_CONVERSATION_ROWS_NOT_MIGRATED",
          ),
        );
        return true;
      },
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
