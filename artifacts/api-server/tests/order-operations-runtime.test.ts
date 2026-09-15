import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  confirmServerPayment,
  getServerOrder,
  listServerOrders,
  OrderOperationError,
  rejectServerPayment,
  updateServerOrderStatus,
  updateServerPaymentStatus,
} from "../src/services/orderOperationsRuntime";
import { deleteMerchantRuntimeData } from "../src/services/merchantRuntime";

function makeDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-order-runtime-"));
}

function writeJson(directory: string, fileName: string, value: unknown): void {
  fs.writeFileSync(
    path.join(directory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function withDataDirectory(directory: string): () => void {
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  return () => {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
  };
}

function runtimeFixture() {
  return {
    productsByMerchant: {},
    conversationsByMerchant: {},
    metaPagesByPageId: {},
    orderDraftsByConversation: {},
    lastSyncedMerchantId: null,
    ordersByMerchant: {
      "merchant-1": [
        {
          id: "order-electronic",
          merchant_id: "merchant-1",
          conversation_id: "conversation-1",
          customer_id: "customer-1",
          customer_name: "Customer One",
          customer_phone: "07111111111",
          customer_address: "Baghdad",
          product_id: "product-1",
          product_name: "Product One",
          quantity: 2,
          unit_price: 10000,
          total_price: 20000,
          status: "pending_confirmation",
          payment_method: "zaincash",
          payment_status: "electronic_pending",
          source_channel: "messenger",
          created_at: "2026-08-06T10:00:00.000Z",
          updated_at: "2026-08-06T10:00:00.000Z",
        },
        {
          id: "order-cash",
          merchant_id: "merchant-1",
          customer_name: "Cash Customer",
          customer_phone: "07222222222",
          customer_address: "Basra",
          product_id: "product-2",
          product_name: "Product Two",
          quantity: 1,
          unit_price: 15000,
          total_price: 15000,
          status: "new",
          payment_method: "cash_on_delivery",
          source_channel: "messenger",
          created_at: "2026-08-06T11:00:00.000Z",
          updated_at: "2026-08-06T11:00:00.000Z",
        },
      ],
      "merchant-2": [
        {
          id: "order-other-merchant",
          merchant_id: "merchant-2",
          customer_name: "Other Customer",
          customer_phone: "07333333333",
          customer_address: "Erbil",
          product_name: "Other Product",
          quantity: 1,
          unit_price: 5000,
          total_price: 5000,
          status: "pending_confirmation",
          payment_method: "cash_on_delivery",
          source_channel: "messenger",
          created_at: "2026-08-06T12:00:00.000Z",
          updated_at: "2026-08-06T12:00:00.000Z",
        },
      ],
    },
  };
}

function assertOrderError(
  callback: () => unknown,
  code: string,
): OrderOperationError {
  let thrown: unknown;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof OrderOperationError);
  assert.equal(thrown.code, code);
  return thrown;
}

test("server orders normalize legacy data and remain tenant isolated", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(directory, "fawri-runtime-db.json", runtimeFixture());
    const orders = listServerOrders("merchant-1");
    assert.equal(orders.length, 2);
    const cash = orders.find((order) => order.id === "order-cash");
    assert.ok(cash);
    assert.equal(cash.status, "pending_confirmation");
    assert.equal(cash.payment_status, "cash_on_delivery");
    assert.equal(cash.version, 1);
    assert.deepEqual(cash.items, [
      {
        product_id: "product-2",
        product_name: "Product Two",
        quantity: 1,
        price: 15000,
      },
    ]);

    assertOrderError(
      () => getServerOrder("merchant-1", "order-other-merchant"),
      "ORDER_NOT_FOUND",
    );
    assert.equal(listServerOrders("merchant-2").length, 1);
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("optimistic versioning rejects stale devices without overwriting", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(directory, "fawri-runtime-db.json", runtimeFixture());
    const first = updateServerOrderStatus({
      merchantId: "merchant-1",
      orderId: "order-electronic",
      expectedVersion: 1,
      status: "confirmed",
    });
    assert.equal(first.status, "confirmed");
    assert.equal(first.version, 2);

    const conflict = assertOrderError(
      () =>
        updateServerOrderStatus({
          merchantId: "merchant-1",
          orderId: "order-electronic",
          expectedVersion: 1,
          status: "cancelled",
        }),
      "ORDER_VERSION_CONFLICT",
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.details?.current_version, 2);
    assert.equal(
      (conflict.details?.current_order as { status?: string })?.status,
      "confirmed",
    );
    assert.equal(
      getServerOrder("merchant-1", "order-electronic").status,
      "confirmed",
    );
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("electronic payment confirmation changes payment and order atomically", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(directory, "fawri-runtime-db.json", runtimeFixture());
    const confirmed = confirmServerPayment({
      merchantId: "merchant-1",
      orderId: "order-electronic",
      expectedVersion: 1,
    });
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.payment_status, "paid");
    assert.equal(confirmed.payment_verified_by, "merchant-1");
    assert.match(confirmed.payment_verified_at || "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(confirmed.version, 2);

    assertOrderError(
      () =>
        rejectServerPayment({
          merchantId: "merchant-1",
          orderId: "order-electronic",
          expectedVersion: 2,
          reason: "late rejection",
        }),
      "ORDER_PAYMENT_REVIEW_REQUIRED",
    );
    const persisted = getServerOrder("merchant-1", "order-electronic");
    assert.equal(persisted.payment_status, "paid");
    assert.equal(persisted.version, 2);
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("payment rejection requires review state and a reason", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(directory, "fawri-runtime-db.json", runtimeFixture());
    assertOrderError(
      () =>
        rejectServerPayment({
          merchantId: "merchant-1",
          orderId: "order-electronic",
          expectedVersion: 1,
          reason: "",
        }),
      "ORDER_PAYMENT_REJECTION_REASON_INVALID",
    );

    const rejected = rejectServerPayment({
      merchantId: "merchant-1",
      orderId: "order-electronic",
      expectedVersion: 1,
      reason: "Screenshot does not match the amount",
    });
    assert.equal(rejected.status, "pending_confirmation");
    assert.equal(rejected.payment_status, "failed");
    assert.equal(
      rejected.payment_rejection_reason,
      "Screenshot does not match the amount",
    );
    assert.equal(rejected.version, 2);
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("payment method and terminal order transitions are enforced", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(directory, "fawri-runtime-db.json", runtimeFixture());
    assertOrderError(
      () =>
        updateServerPaymentStatus({
          merchantId: "merchant-1",
          orderId: "order-cash",
          expectedVersion: 1,
          paymentStatus: "manual_review",
        }),
      "ORDER_PAYMENT_METHOD_MISMATCH",
    );

    let order = updateServerOrderStatus({
      merchantId: "merchant-1",
      orderId: "order-cash",
      expectedVersion: 1,
      status: "confirmed",
    });
    order = updateServerOrderStatus({
      merchantId: "merchant-1",
      orderId: "order-cash",
      expectedVersion: order.version,
      status: "preparing",
    });
    order = updateServerOrderStatus({
      merchantId: "merchant-1",
      orderId: "order-cash",
      expectedVersion: order.version,
      status: "shipped",
    });
    order = updateServerOrderStatus({
      merchantId: "merchant-1",
      orderId: "order-cash",
      expectedVersion: order.version,
      status: "delivered",
    });
    assert.equal(order.status, "delivered");
    assertOrderError(
      () =>
        updateServerOrderStatus({
          merchantId: "merchant-1",
          orderId: "order-cash",
          expectedVersion: order.version,
          status: "pending_confirmation",
        }),
      "ORDER_STATUS_TRANSITION_INVALID",
    );
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("merchant deletion removes only its order operation overlay", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    writeJson(directory, "fawri-runtime-db.json", runtimeFixture());
    updateServerOrderStatus({
      merchantId: "merchant-1",
      orderId: "order-electronic",
      expectedVersion: 1,
      status: "confirmed",
    });
    const operationsPath = path.join(directory, "order-operations.json");
    const database = JSON.parse(fs.readFileSync(operationsPath, "utf8"));
    database.orders["merchant-2"] = {
      "order-other-merchant": {
        version: 2,
        status: "cancelled",
        payment_status: "cash_on_delivery",
        updated_at: "2026-08-06T13:00:00.000Z",
      },
    };
    writeJson(directory, "order-operations.json", database);

    const summary = deleteMerchantRuntimeData("merchant-1");
    assert.equal(summary.orderOperations, 1);
    const after = JSON.parse(fs.readFileSync(operationsPath, "utf8"));
    assert.equal(Object.hasOwn(after.orders, "merchant-1"), false);
    assert.equal(Object.hasOwn(after.orders, "merchant-2"), true);
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
