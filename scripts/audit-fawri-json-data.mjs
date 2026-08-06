import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATA_DIR = path.resolve(
  process.env.FAWRI_DATA_DIR || path.join("artifacts", "api-server", "data"),
);

const KNOWN_FILES = [
  "merchants.json",
  "bot-runtime.json",
  "saved-answers.json",
  "training-requests.json",
  "learned-answers.json",
  "support-preview-sessions.json",
  "emergency-read-access.json",
  "admin-work-monitor.json",
];

const runtimeCollections = [
  "products",
  "conversations",
  "orders",
  "orderDrafts",
  "order_drafts",
  "metaPages",
  "meta_pages",
];

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath);
  return {
    bytes: raw.length,
    sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    value: JSON.parse(raw.toString("utf8")),
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectIds(items) {
  return new Set(
    asArray(items)
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean),
  );
}

function duplicateValues(items, selector) {
  const seen = new Map();
  for (const item of asArray(items)) {
    const value = String(selector(item) || "").trim();
    if (!value) continue;
    seen.set(value, (seen.get(value) || 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }));
}

function countObjectArrays(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, candidate]) => Array.isArray(candidate))
      .map(([key, candidate]) => [key, candidate.length]),
  );
}

function issue(severity, code, details) {
  return { severity, code, details };
}

function auditMerchants(value, issues) {
  const merchants = asArray(value?.merchants);
  const subscriptions = asArray(value?.subscriptions);
  const supportTickets = asArray(value?.support_tickets);
  const merchantIds = collectIds(
    merchants.filter((record) => record?.is_admin !== true),
  );
  const accountIds = collectIds(merchants);

  for (const duplicate of duplicateValues(merchants, (item) => item?.id)) {
    issues.push(issue("error", "DUPLICATE_ACCOUNT_ID", duplicate));
  }
  for (const duplicate of duplicateValues(merchants, (item) => item?.phone)) {
    issues.push(issue("error", "DUPLICATE_ACCOUNT_PHONE", duplicate));
  }
  for (const duplicate of duplicateValues(
    subscriptions,
    (item) => item?.merchant_id,
  )) {
    issues.push(issue("error", "DUPLICATE_MERCHANT_SUBSCRIPTION", duplicate));
  }

  for (const subscription of subscriptions) {
    const merchantId = String(subscription?.merchant_id || "").trim();
    if (merchantId && !merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORPHAN_SUBSCRIPTION", {
          subscription_id: subscription?.id,
          merchant_id: merchantId,
        }),
      );
    }
  }

  for (const ticket of supportTickets) {
    const merchantId = String(ticket?.merchant_id || "").trim();
    const assignedAdminId = String(ticket?.assigned_admin_id || "").trim();
    if (merchantId && !merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORPHAN_SUPPORT_TICKET_MERCHANT", {
          ticket_id: ticket?.id,
          merchant_id: merchantId,
        }),
      );
    }
    if (assignedAdminId && !accountIds.has(assignedAdminId)) {
      issues.push(
        issue("error", "ORPHAN_SUPPORT_TICKET_ADMIN", {
          ticket_id: ticket?.id,
          admin_id: assignedAdminId,
        }),
      );
    }
  }

  return { merchants, merchantIds, accountIds };
}

function auditRuntime(value, merchantIds, issues) {
  for (const key of runtimeCollections) {
    const collection = asArray(value?.[key]);
    for (const duplicate of duplicateValues(collection, (item) => item?.id)) {
      issues.push(
        issue("error", "DUPLICATE_RUNTIME_ID", {
          collection: key,
          ...duplicate,
        }),
      );
    }
    for (const item of collection) {
      const merchantId = String(
        item?.merchant_id || item?.merchantId || "",
      ).trim();
      if (merchantId && !merchantIds.has(merchantId)) {
        issues.push(
          issue("error", "ORPHAN_RUNTIME_MERCHANT", {
            collection: key,
            record_id: item?.id,
            merchant_id: merchantId,
          }),
        );
      }
    }
  }
}

function auditMerchantScopedCollection(value, collectionKey, merchantIds, issues) {
  const collection = asArray(value?.[collectionKey]);
  for (const duplicate of duplicateValues(collection, (item) => item?.id)) {
    issues.push(
      issue("error", "DUPLICATE_COLLECTION_ID", {
        collection: collectionKey,
        ...duplicate,
      }),
    );
  }
  for (const item of collection) {
    const merchantId = String(
      item?.merchant_id || item?.merchantId || "",
    ).trim();
    if (merchantId && !merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORPHAN_COLLECTION_MERCHANT", {
          collection: collectionKey,
          record_id: item?.id,
          merchant_id: merchantId,
        }),
      );
    }
  }
}

function buildReport(dataDir) {
  const issues = [];
  const files = {};
  const parsed = {};

  for (const fileName of KNOWN_FILES) {
    const filePath = path.join(dataDir, fileName);
    if (!fs.existsSync(filePath)) {
      files[fileName] = { exists: false };
      continue;
    }

    try {
      const result = readJsonFile(filePath);
      parsed[fileName] = result.value;
      files[fileName] = {
        exists: true,
        bytes: result.bytes,
        sha256: result.sha256,
        collections: countObjectArrays(result.value),
      };
    } catch (error) {
      files[fileName] = { exists: true, parse_error: String(error) };
      issues.push(
        issue("error", "INVALID_JSON", {
          file: fileName,
          error: String(error),
        }),
      );
    }
  }

  const merchantsDb = parsed["merchants.json"] || {};
  const { merchantIds } = auditMerchants(merchantsDb, issues);

  auditRuntime(parsed["bot-runtime.json"] || {}, merchantIds, issues);
  auditMerchantScopedCollection(
    parsed["saved-answers.json"] || {},
    "answers",
    merchantIds,
    issues,
  );
  auditMerchantScopedCollection(
    parsed["training-requests.json"] || {},
    "requests",
    merchantIds,
    issues,
  );
  auditMerchantScopedCollection(
    parsed["learned-answers.json"] || {},
    "answers",
    merchantIds,
    issues,
  );

  const emergencyDb = parsed["emergency-read-access.json"] || {};
  auditMerchantScopedCollection(
    emergencyDb,
    "requests",
    merchantIds,
    issues,
  );
  auditMerchantScopedCollection(
    emergencyDb,
    "merchant_notices",
    merchantIds,
    issues,
  );

  const severityCounts = issues.reduce(
    (result, item) => {
      result[item.severity] = (result[item.severity] || 0) + 1;
      return result;
    },
    {},
  );

  return {
    ok: !issues.some((item) => item.severity === "error"),
    mode: "read_only",
    generated_at: new Date().toISOString(),
    data_dir: dataDir,
    files,
    summary: {
      known_files: KNOWN_FILES.length,
      existing_files: Object.values(files).filter((item) => item.exists).length,
      parsed_files: Object.values(files).filter(
        (item) => item.exists && !item.parse_error,
      ).length,
      issues: issues.length,
      severity_counts: severityCounts,
    },
    issues,
  };
}

const dataDir = path.resolve(process.argv[2] || DEFAULT_DATA_DIR);
const report = buildReport(dataDir);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 2;
