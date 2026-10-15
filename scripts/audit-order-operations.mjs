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
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readOptional(fileName, fallback) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) return { exists: false, value: fallback };
  return { exists: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) };
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
    version: 2,
    orders: {},
    payment_decisions: [],
  });

  const merchantIds = new Set(
    asArray(merchantSource.value?.merchants)
      .filter((record) => record?.is_admin !== true)
      .map((record) => text(record?.id))
      .filter(Boolean),
  );
  const runtimeByMerchant = asRecord(runtimeSource.value?.ordersByMerchant);
  const runtimeIndexes = new Map();
  const issues = [];

  for (const [merchantId, ordersValue] of Object.entries(runtimeByMerchant)) {
    if (!merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORDER_RUNTIME_MERCHANT_MISSING", {
          merchant_id: merchantId,
        }),
      );
    }
    if (!Array.isArray(ordersValue)) {
      issues.push(
        issue("error", "ORDER_RUNTIME_TENANT_DATA_INVALID", {
          merchant_id: merchantId,
        }),
      );
      continue;
    }
    const index = new Map();
    for (const rawOrder of ordersValue) {
      const order = asRecord(rawOrder);
      const orderId = text(order.id);
      if (!orderId || index.has(orderId)) {
        issues.push(
          issue("error", "ORDER_RUNTIME_ID_INVALID", {
            merchant_id: merchantId,
            order_id: orderId || null,
          }),
        );
        continue;
      }
      if (text(order.merchant_id) !== merchantId) {
        issues.push(
          issue("error", "ORDER_RUNTIME_TENANT_MISMATCH", {
            merchant_id: merchantId,
            order_id: orderId,
            runtime_merchant_id: text(order.merchant_id) || null,
          }),
        );
      }
      index.set(orderId, order);
    }
    runtimeIndexes.set(merchantId, index);
  }

  const storeVersion = Number(operationSource.value?.version);
  if (operationSource.exists && ![1, 2].includes(storeVersion)) {
    issues.push(
      issue("error", "ORDER_OPERATIONS_VERSION_UNSUPPORTED", {
        version: operationSource.value?.version ?? null,
      }),
    );
  }
  if (operationSource.exists && storeVersion === 1) {
    issues.push(
      issue("warning", "ORDER_OPERATIONS_V2_MIGRATION_REQUIRED", {
        reason: "payment decision audit records are unavailable in store version 1",
      }),
    );
  }

  const decisions = asArray(operationSource.value?.payment_decisions);
  if (storeVersion === 2 && !Array.isArray(operationSource.value?.payment_decisions)) {
    issues.push(issue("error", "ORDER_PAYMENT_DECISIONS_MISSING", {}));
  }
  const decisionsById = new Map();
  for (const rawDecision of decisions) {
    const decision = asRecord(rawDecision);
    const id = text(decision.id);
    if (!id || decisionsById.has(id)) {
      issues.push(
        issue("error", "ORDER_PAYMENT_DECISION_ID_INVALID", {
          decision_id: id || null,
        }),
      );
      continue;
    }
    decisionsById.set(id, decision);
    const merchantId = text(decision.merchant_id);
    const orderId = text(decision.order_id);
    const operation = text(decision.operation);
    const outcome = text(decision.outcome);
    const paymentChannel = text(decision.payment_channel);
    const expectedVersion = Number(decision.expected_version);
    const resultingVersion = Number(decision.resulting_version);
    if (
      !merchantIds.has(merchantId) ||
      !runtimeIndexes.get(merchantId)?.has(orderId) ||
      !["confirm", "reject"].includes(operation) ||
      !["paid", "failed"].includes(outcome) ||
      !["electronic", "cash_on_delivery"].includes(paymentChannel) ||
      !PAYMENT_STATUSES.has(text(decision.previous_payment_status)) ||
      !PAYMENT_STATUSES.has(text(decision.resulting_payment_status)) ||
      !ORDER_STATUSES.has(text(decision.previous_order_status)) ||
      !ORDER_STATUSES.has(text(decision.resulting_order_status)) ||
      text(decision.actor_type) !== "merchant" ||
      !text(decision.actor_id) ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion <= 0 ||
      !Number.isInteger(resultingVersion) ||
      resultingVersion !== expectedVersion + 1 ||
      !validTimestamp(decision.decided_at)
    ) {
      issues.push(
        issue("error", "ORDER_PAYMENT_DECISION_INVALID", {
          decision_id: id,
          merchant_id: merchantId || null,
          order_id: orderId || null,
        }),
      );
    }
    if (operation === "confirm" && outcome !== "paid") {
      issues.push(
        issue("error", "ORDER_PAYMENT_DECISION_OUTCOME_MISMATCH", {
          decision_id: id,
        }),
      );
    }
    if (operation === "reject" && (outcome !== "failed" || !text(decision.reason))) {
      issues.push(
        issue("error", "ORDER_PAYMENT_REJECTION_AUDIT_INVALID", {
          decision_id: id,
        }),
      );
    }
  }

  let operations = 0;
  let terminalOperations = 0;
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
      if (
        !ORDER_STATUSES.has(status) ||
        !PAYMENT_STATUSES.has(paymentStatus) ||
        !updatedAt
      ) {
        issues.push(
          issue("error", "ORDER_OPERATION_STATE_INVALID", {
            merchant_id: merchantId,
            order_id: orderId,
            status: status || null,
            payment_status: paymentStatus || null,
          }),
        );
      }
      if (
        (paymentMethod === "cash_on_delivery" &&
          !["cash_on_delivery", "paid"].includes(paymentStatus)) ||
        (paymentMethod !== "cash_on_delivery" &&
          paymentStatus === "cash_on_delivery")
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
      const decisionId = text(operation.last_payment_decision_id);
      if (paymentStatus === "paid" || paymentStatus === "failed") {
        terminalOperations += 1;
        if (storeVersion !== 2 || !decisionId || !decisionsById.has(decisionId)) {
          issues.push(
            issue("error", "ORDER_TERMINAL_PAYMENT_AUDIT_MISSING", {
              merchant_id: merchantId,
              order_id: orderId,
              payment_status: paymentStatus,
            }),
          );
        } else {
          const decision = decisionsById.get(decisionId);
          if (
            text(decision.merchant_id) !== merchantId ||
            text(decision.order_id) !== orderId ||
            text(decision.resulting_payment_status) !== paymentStatus ||
            Number(decision.resulting_version) !== version
          ) {
            issues.push(
              issue("error", "ORDER_TERMINAL_PAYMENT_AUDIT_MISMATCH", {
                merchant_id: merchantId,
                order_id: orderId,
                decision_id: decisionId,
              }),
            );
          }
        }
      }
      if (paymentStatus === "paid") {
        if (!verifiedAt || !verifiedBy || rejectionReason) {
          issues.push(
            issue("error", "ORDER_OPERATION_PAID_METADATA_INVALID", {
              merchant_id: merchantId,
              order_id: orderId,
            }),
          );
        }
      } else if (paymentStatus === "failed") {
        if (!rejectionReason || verifiedAt || verifiedBy) {
          issues.push(
            issue("error", "ORDER_OPERATION_FAILED_METADATA_INVALID", {
              merchant_id: merchantId,
              order_id: orderId,
            }),
          );
        }
      } else if (verifiedAt || verifiedBy || rejectionReason) {
        issues.push(
          issue("error", "ORDER_OPERATION_PENDING_METADATA_INVALID", {
            merchant_id: merchantId,
            order_id: orderId,
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
  const errorCount = severityCounts.error || 0;
  return {
    ok: errorCount === 0,
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
      terminal_operations: terminalOperations,
      payment_decisions: decisions.length,
      issues: issues.length,
      severity_counts: severityCounts,
    },
    migration_readiness: {
      ready: errorCount === 0 && (!operationSource.exists || storeVersion === 2),
      source_store_version: operationSource.exists ? storeVersion : null,
      target_contract:
        "orders + order_payment_decisions with tenant composite keys and atomic version checks",
      blockers: issues
        .filter((item) => item.severity === "error")
        .map((item) => item.code),
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
