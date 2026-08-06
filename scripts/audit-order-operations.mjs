import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve(
  process.argv.find((value, index) => index > 1 && !value.startsWith("--")) ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);

const ORDER_STATUSES = new Set([
  "pending_confirmation",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "out_of_stock",
  "waiting_customer_approval",
]);
const PAYMENT_STATUSES = new Set([
  "cash_on_delivery",
  "electronic_pending",
  "paid",
  "failed",
  "manual_review",
]);
const PAYMENT_METHODS = new Set([
  "cash_on_delivery",
  "superqi",
  "fastpay",
  "zaincash",
  "other",
]);

function text(value) {
  return String(value || "").trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readOptional(fileName, fallback) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) return { exists: false, value: fallback };
  return {
    exists: true,
    value: JSON.parse(fs.readFileSync(filePath, "utf8")),
  };
}

function issue(severity, code, details) {
  return { severity, code, details };
}

function validTimestamp(value) {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeBaseStatus(value) {
  const normalized = text(value);
  if (normalized === "new") return "pending_confirmation";
  return ORDER_STATUSES.has(normalized) ? normalized : "pending_confirmation";
}

function normalizePaymentMethod(value) {
  const normalized = text(value);
  return PAYMENT_METHODS.has(normalized) ? normalized : "cash_on_delivery";
}

function normalizeBasePaymentStatus(value, paymentMethod) {
  const normalized = text(value);
  if (PAYMENT_STATUSES.has(normalized)) return normalized;
  return paymentMethod === "cash_on_delivery"
    ? "cash_on_delivery"
    : "electronic_pending";
}

function buildReport() {
  const merchantSource = readOptional("merchants.json", { merchants: [] });
  const runtimeSource = readOptional("fawri-runtime-db.json", {
    ordersByMerchant: {},
  });
  const operationSource = readOptional("order-operations.json", {
    version: 1,
    orders: {},
  });

  const merchantIds = new Set(
    asArray(merchantSource.value?.merchants)
      .filter((record) => record?.is_admin !== true)
      .map((record) => text(record?.id))
      .filter(Boolean),
  );
  const runtimeByMerchant = asRecord(runtimeSource.value?.ordersByMerchant);
  const runtimeIndexes = new Map();
  for (const [merchantId, ordersValue] of Object.entries(runtimeByMerchant)) {
    const index = new Map();
    for (const order of asArray(ordersValue)) {
      const orderId = text(order?.id);
      if (orderId) index.set(orderId, asRecord(order));
    }
    runtimeIndexes.set(merchantId, index);
  }

  const issues = [];
  let operations = 0;
  if (operationSource.exists && operationSource.value?.version !== 1) {
    issues.push(
      issue("error", "ORDER_OPERATIONS_VERSION_UNSUPPORTED", {
        version: operationSource.value?.version ?? null,
      }),
    );
  }

  for (const [merchantId, operationsValue] of Object.entries(
    asRecord(operationSource.value?.orders),
  )) {
    if (!merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORDER_OPERATION_MERCHANT_MISSING", {
          merchant_id: merchantId,
        }),
      );
    }
    const runtimeOrders = runtimeIndexes.get(merchantId) || new Map();
    for (const [orderId, operationValue] of Object.entries(
      asRecord(operationsValue),
    )) {
      operations += 1;
      const operation = asRecord(operationValue);
      const base = runtimeOrders.get(orderId);
      if (!base) {
        issues.push(
          issue("error", "ORDER_OPERATION_ORDER_MISSING", {
            merchant_id: merchantId,
            order_id: orderId,
          }),
        );
        continue;
      }
      if (text(base.merchant_id) !== merchantId) {
        issues.push(
          issue("error", "ORDER_OPERATION_RUNTIME_TENANT_MISMATCH", {
            merchant_id: merchantId,
            order_id: orderId,
            runtime_merchant_id: text(base.merchant_id) || null,
          }),
        );
      }

      const version = Number(operation.version);
      const status = text(operation.status);
      const paymentStatus = text(operation.payment_status);
      const paymentMethod = normalizePaymentMethod(base.payment_method);
      const updatedAt = validTimestamp(operation.updated_at);

      if (!Number.isInteger(version) || version < 2) {
        issues.push(
          issue("error", "ORDER_OPERATION_VERSION_INVALID", {
            merchant_id: merchantId,
            order_id: orderId,
            version: operation.version ?? null,
          }),
        );
      }
      if (!ORDER_STATUSES.has(status)) {
        issues.push(
          issue("error", "ORDER_OPERATION_STATUS_INVALID", {
            merchant_id: merchantId,
            order_id: orderId,
            status: status || null,
          }),
        );
      }
      if (!PAYMENT_STATUSES.has(paymentStatus)) {
        issues.push(
          issue("error", "ORDER_OPERATION_PAYMENT_STATUS_INVALID", {
            merchant_id: merchantId,
            order_id: orderId,
            payment_status: paymentStatus || null,
          }),
        );
      }
      if (!updatedAt) {
        issues.push(
          issue("error", "ORDER_OPERATION_UPDATED_AT_INVALID", {
            merchant_id: merchantId,
            order_id: orderId,
          }),
        );
      }

      if (
        paymentMethod === "cash_on_delivery" &&
        !["cash_on_delivery", "paid"].includes(paymentStatus)
      ) {
        issues.push(
          issue("error", "ORDER_OPERATION_PAYMENT_METHOD_MISMATCH", {
            merchant_id: merchantId,
            order_id: orderId,
            payment_method: paymentMethod,
            payment_status: paymentStatus,
          }),
        );
      }
      if (
        paymentMethod !== "cash_on_delivery" &&
        paymentStatus === "cash_on_delivery"
      ) {
        issues.push(
          issue("error", "ORDER_OPERATION_PAYMENT_METHOD_MISMATCH", {
            merchant_id: merchantId,
            order_id: orderId,
            payment_method: paymentMethod,
            payment_status: paymentStatus,
          }),
        );
      }

      const verifiedAt = validTimestamp(operation.payment_verified_at);
      const verifiedBy = text(operation.payment_verified_by);
      const rejectionReason = text(operation.payment_rejection_reason);
      if (paymentStatus === "paid") {
        if (!verifiedAt || !verifiedBy || rejectionReason) {
          issues.push(
            issue("error", "ORDER_OPERATION_PAID_METADATA_INVALID", {
              merchant_id: merchantId,
              order_id: orderId,
              has_verified_at: Boolean(verifiedAt),
              has_verified_by: Boolean(verifiedBy),
              has_rejection_reason: Boolean(rejectionReason),
            }),
          );
        }
      } else if (paymentStatus === "failed") {
        if (!rejectionReason || verifiedAt || verifiedBy) {
          issues.push(
            issue("error", "ORDER_OPERATION_FAILED_METADATA_INVALID", {
              merchant_id: merchantId,
              order_id: orderId,
              has_rejection_reason: Boolean(rejectionReason),
              has_verified_at: Boolean(verifiedAt),
              has_verified_by: Boolean(verifiedBy),
            }),
          );
        }
      } else if (verifiedAt || verifiedBy || rejectionReason) {
        issues.push(
          issue("error", "ORDER_OPERATION_PENDING_METADATA_INVALID", {
            merchant_id: merchantId,
            order_id: orderId,
            payment_status: paymentStatus,
          }),
        );
      }

      const baseStatus = normalizeBaseStatus(base.status);
      const basePaymentStatus = normalizeBasePaymentStatus(
        base.payment_status,
        paymentMethod,
      );
      if (
        version === 2 &&
        status === baseStatus &&
        paymentStatus === basePaymentStatus &&
        !verifiedAt &&
        !verifiedBy &&
        !rejectionReason
      ) {
        issues.push(
          issue("warning", "ORDER_OPERATION_NO_EFFECT", {
            merchant_id: merchantId,
            order_id: orderId,
          }),
        );
      }
    }
  }

  const severityCounts = issues.reduce((result, item) => {
    result[item.severity] = (result[item.severity] || 0) + 1;
    return result;
  }, {});
  return {
    ok: !issues.some((item) => item.severity === "error"),
    mode: "read_only",
    generated_at: new Date().toISOString(),
    data_dir: dataDirectory,
    files: {
      merchants: { file: "merchants.json", exists: merchantSource.exists },
      runtime: { file: "fawri-runtime-db.json", exists: runtimeSource.exists },
      operations: {
        file: "order-operations.json",
        exists: operationSource.exists,
      },
    },
    summary: {
      operations,
      issues: issues.length,
      severity_counts: severityCounts,
    },
    issues,
  };
}

try {
  const report = buildReport();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        mode: "read_only",
        generated_at: new Date().toISOString(),
        data_dir: dataDirectory,
        fatal_error: String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
}
