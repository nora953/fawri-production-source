import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  confirmServerPayment,
  getServerOrder,
  OrderOperationError,
  rejectServerPayment,
  updateServerOrderStatus,
  updateServerPaymentStatus,
} from "../src/services/orderOperationsRuntime";
import {
  getMerchantOperationalSettings,
  MerchantSettingsError,
  updateMerchantOperationalSettingsWithEffects,
} from "../src/services/merchantSettingsRuntime";
import { deleteMerchantRuntimeData } from "../src/services/merchantRuntime";

async function withDataDirectory(
  prefix: string,
  callback: (dataDirectory: string) => Promise<void>,
): Promise<void> {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), prefix));
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = dataDirectory;
  try {
    await callback(dataDirectory);
  } finally {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

function runtimeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-a",
    merchant_id: "merchant-a",
    customer_name: "Customer",
    customer_phone: "07111111111",
    customer_address: "Baghdad",
    product_name: "Product",
    quantity: 1,
    unit_price: 25_000,
    total_price: 25_000,
    status: "pending_confirmation",
    payment_method: "zaincash",
    payment_status: "electronic_pending",
    source_channel: "messenger",
    created_at: "2026-08-07T00:00:00.000Z",
    updated_at: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

async function seedRuntime(
  dataDirectory: string,
  orders: unknown[],
): Promise<void> {
  await writeFile(
    path.join(dataDirectory, "fawri-runtime-db.json"),
    JSON.stringify({ ordersByMerchant: { "merchant-a": orders } }),
  );
}

test("terminal payment states require audited dedicated operations", async () => {
  await withDataDirectory("fawri-order-hardening-", async (dataDirectory) => {
    await seedRuntime(dataDirectory, [runtimeOrder()]);

    assert.throws(
      () =>
        updateServerPaymentStatus({
          merchantId: "merchant-a",
          orderId: "order-a",
          expectedVersion: 1,
          paymentStatus: "paid",
        }),
      (error: unknown) =>
        error instanceof OrderOperationError &&
        error.code === "ORDER_PAYMENT_TERMINAL_OPERATION_REQUIRED",
    );

    const confirmed = confirmServerPayment({
      merchantId: "merchant-a",
      orderId: "order-a",
      expectedVersion: 1,
      actorId: "merchant-a",
      requestId: "request-1",
    });
    assert.equal(confirmed.version, 2);
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.payment_status, "paid");
    assert.equal(confirmed.payment_verified_by, "merchant-a");
    assert.equal(confirmed.last_payment_decision?.operation, "confirm");
    assert.equal(confirmed.last_payment_decision?.request_id, "request-1");

    const store = JSON.parse(
      await readFile(path.join(dataDirectory, "order-operations.json"), "utf8"),
    );
    assert.equal(store.version, 2);
    assert.equal(store.payment_decisions.length, 1);
    assert.equal(store.payment_decisions[0].resulting_version, 2);
    assert.equal(
      store.orders["merchant-a"]["order-a"].last_payment_decision_id,
      store.payment_decisions[0].id,
    );

    assert.throws(
      () =>
        updateServerOrderStatus({
          merchantId: "merchant-a",
          orderId: "order-a",
          expectedVersion: 1,
          status: "cancelled",
        }),
      (error: unknown) =>
        error instanceof OrderOperationError &&
        error.code === "ORDER_VERSION_CONFLICT" &&
        error.details?.current_version === 2,
    );
  });
});

test("payment rejection writes unified failed metadata atomically", async () => {
  await withDataDirectory("fawri-order-reject-", async (dataDirectory) => {
    await seedRuntime(dataDirectory, [runtimeOrder()]);
    const rejected = rejectServerPayment({
      merchantId: "merchant-a",
      orderId: "order-a",
      expectedVersion: 1,
      reason: "receipt does not match",
      actorId: "merchant-a",
      requestId: "request-2",
    });
    assert.equal(rejected.payment_status, "failed");
    assert.equal(rejected.payment_rejection_reason, "receipt does not match");
    assert.equal(rejected.payment_verified_at, undefined);
    assert.equal(rejected.last_payment_decision?.outcome, "failed");
    assert.equal(
      rejected.last_payment_decision?.reason,
      "receipt does not match",
    );
  });
});

test("runtime tenant mismatch fails closed", async () => {
  await withDataDirectory("fawri-order-tenant-", async (dataDirectory) => {
    await seedRuntime(dataDirectory, [
      runtimeOrder({ merchant_id: "merchant-b" }),
    ]);
    assert.throws(
      () => getServerOrder("merchant-a", "order-a"),
      (error: unknown) =>
        error instanceof OrderOperationError &&
        error.code === "ORDER_RUNTIME_TENANT_MISMATCH",
    );
  });
});

test("disabling auto reply suppresses waiting jobs without consuming credit", async () => {
  await withDataDirectory("fawri-settings-hardening-", async (dataDirectory) => {
    await writeFile(
      path.join(dataDirectory, "background-jobs.json"),
      JSON.stringify({
        version: 1,
        jobs: [
          {
            id: "job-a-queued",
            type: "meta.webhook.reply",
            merchant_id: "merchant-a",
            status: "queued",
            payload: { merchant_id: "merchant-a" },
            created_at: "2026-08-07T00:00:00.000Z",
            updated_at: "2026-08-07T00:00:00.000Z",
          },
          {
            id: "job-a-retry",
            type: "meta.webhook.reply",
            status: "retry",
            payload: { merchant_id: "merchant-a" },
            created_at: "2026-08-07T00:00:00.000Z",
            updated_at: "2026-08-07T00:00:00.000Z",
          },
          {
            id: "job-a-processing",
            type: "meta.webhook.reply",
            merchant_id: "merchant-a",
            status: "processing",
            payload: { merchant_id: "merchant-a" },
            locked_by: "worker",
            created_at: "2026-08-07T00:00:00.000Z",
            updated_at: "2026-08-07T00:00:00.000Z",
          },
          {
            id: "job-b-queued",
            type: "meta.webhook.reply",
            merchant_id: "merchant-b",
            status: "queued",
            payload: { merchant_id: "merchant-b" },
            created_at: "2026-08-07T00:00:00.000Z",
            updated_at: "2026-08-07T00:00:00.000Z",
          },
        ],
      }),
    );

    const result = updateMerchantOperationalSettingsWithEffects({
      merchantId: "merchant-a",
      expectedVersion: 1,
      patch: { auto_reply_enabled: false },
    });
    assert.equal(result.settings.version, 2);
    assert.equal(result.settings.auto_reply_enabled, false);
    assert.deepEqual(result.effects, {
      queued_auto_reply_jobs_suppressed: 2,
      processing_auto_reply_jobs_observed: 1,
      credit_consumed: false,
    });

    const jobs = JSON.parse(
      await readFile(path.join(dataDirectory, "background-jobs.json"), "utf8"),
    ).jobs;
    for (const id of ["job-a-queued", "job-a-retry"]) {
      const job = jobs.find((item: { id: string }) => item.id === id);
      assert.equal(job.status, "completed");
      assert.deepEqual(job.result, {
        delivery_status: "suppressed",
        suppression_code: "MERCHANT_AUTO_REPLY_DISABLED",
        credit_consumed: false,
        settings_version: 2,
      });
    }
    assert.equal(
      jobs.find((item: { id: string }) => item.id === "job-a-processing").status,
      "processing",
    );
    assert.equal(
      jobs.find((item: { id: string }) => item.id === "job-b-queued").status,
      "queued",
    );

    assert.throws(
      () =>
        updateMerchantOperationalSettingsWithEffects({
          merchantId: "merchant-a",
          expectedVersion: 1,
          patch: { reply_language: "en" },
        }),
      (error: unknown) =>
        error instanceof MerchantSettingsError &&
        error.code === "MERCHANT_SETTINGS_VERSION_CONFLICT",
    );
  });
});

test("merchant deletion removes settings, order overlays, audit decisions, and jobs", async () => {
  await withDataDirectory(
    "fawri-orders-settings-delete-",
    async (dataDirectory) => {
      await seedRuntime(dataDirectory, [runtimeOrder()]);
      confirmServerPayment({
        merchantId: "merchant-a",
        orderId: "order-a",
        expectedVersion: 1,
      });
      updateMerchantOperationalSettingsWithEffects({
        merchantId: "merchant-a",
        expectedVersion: 1,
        patch: { reply_language: "ar" },
      });
      await writeFile(
        path.join(dataDirectory, "background-jobs.json"),
        JSON.stringify({
          version: 1,
          jobs: [
            {
              id: "job-a",
              type: "meta.webhook.reply",
              merchant_id: "merchant-a",
              status: "queued",
              payload: {},
            },
          ],
        }),
      );

      const summary = deleteMerchantRuntimeData("merchant-a");
      assert.equal(summary.orderOperations, 1);
      assert.equal(summary.orderPaymentDecisions, 1);
      assert.equal(summary.merchantSettings, 1);
      assert.equal(summary.autoReplyJobs, 1);
      assert.equal(getMerchantOperationalSettings("merchant-a").version, 1);

      const operationStore = JSON.parse(
        await readFile(
          path.join(dataDirectory, "order-operations.json"),
          "utf8",
        ),
      );
      assert.deepEqual(operationStore.orders, {});
      assert.deepEqual(operationStore.payment_decisions, []);
    },
  );
});
