import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATA_DIR = path.resolve(
  process.env.FAWRI_DATA_DIR || path.join("artifacts", "api-server", "data"),
);

const KNOWN_FILES = [
  "merchants.json",
  "bot-runtime.json",
  "fawri-runtime-db.json",
  "saved-answers.json",
  "training-requests.json",
  "learned-answers.json",
  "support-preview-sessions.json",
  "emergency-read-access.json",
  "admin-work-monitor.json",
  "processed-meta-events.json",
  "reply-reservations.json",
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

const runtimeMapCollections = [
  "productsByMerchant",
  "conversationsByMerchant",
  "ordersByMerchant",
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

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

function countObjectMaps(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([, candidate]) =>
          candidate && typeof candidate === "object" && !Array.isArray(candidate),
      )
      .map(([key, candidate]) => [key, Object.keys(candidate).length]),
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
  const subscriptionIds = collectIds(subscriptions);
  const subscriptionMerchantById = new Map(
    subscriptions
      .map((subscription) => [
        String(subscription?.id || "").trim(),
        String(subscription?.merchant_id || "").trim(),
      ])
      .filter(([subscriptionId]) => Boolean(subscriptionId)),
  );

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

  return {
    merchants,
    merchantIds,
    accountIds,
    subscriptionIds,
    subscriptionMerchantById,
  };
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

function auditRuntimeMaps(value, merchantIds, issues) {
  for (const key of runtimeMapCollections) {
    const collectionMap = asRecord(value?.[key]);
    for (const [merchantId, collectionValue] of Object.entries(collectionMap)) {
      if (!merchantIds.has(merchantId)) {
        issues.push(
          issue("error", "ORPHAN_RUNTIME_MAP_MERCHANT", {
            collection: key,
            merchant_id: merchantId,
          }),
        );
      }
      const collection = asArray(collectionValue);
      for (const duplicate of duplicateValues(collection, (item) => item?.id)) {
        issues.push(
          issue("error", "DUPLICATE_RUNTIME_MAP_ID", {
            collection: key,
            merchant_id: merchantId,
            ...duplicate,
          }),
        );
      }
      for (const item of collection) {
        const rowMerchantId = String(item?.merchant_id || merchantId).trim();
        if (rowMerchantId !== merchantId) {
          issues.push(
            issue("error", "RUNTIME_MAP_MERCHANT_MISMATCH", {
              collection: key,
              map_merchant_id: merchantId,
              record_id: item?.id,
              row_merchant_id: rowMerchantId,
            }),
          );
        }
      }
    }
  }

  const pages = asRecord(value?.metaPagesByPageId);
  for (const [pageId, page] of Object.entries(pages)) {
    const merchantId = String(page?.merchant_id || "").trim();
    if (!merchantId || !merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORPHAN_META_PAGE_MERCHANT", {
          page_id: pageId,
          merchant_id: merchantId || null,
        }),
      );
    }
  }

  const drafts = asRecord(value?.orderDraftsByConversation);
  for (const [conversationId, draft] of Object.entries(drafts)) {
    const merchantId = String(draft?.merchant_id || "").trim();
    if (merchantId && !merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORPHAN_ORDER_DRAFT_MERCHANT", {
          conversation_id: conversationId,
          merchant_id: merchantId,
        }),
      );
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

function auditProcessedMetaEvents(value, issues) {
  const events = asRecord(value?.events);
  for (const [eventId, timestamp] of Object.entries(events)) {
    if (!eventId.startsWith("meta:")) {
      issues.push(
        issue("error", "INVALID_META_EVENT_ID", { event_id: eventId }),
      );
    }
    if (!Number.isFinite(new Date(String(timestamp || "")).getTime())) {
      issues.push(
        issue("error", "INVALID_META_EVENT_TIMESTAMP", {
          event_id: eventId,
          timestamp,
        }),
      );
    }
  }
}

function auditReplyReservations(
  value,
  merchantIds,
  subscriptionIds,
  subscriptionMerchantById,
  issues,
) {
  const reservations = asRecord(value?.reservations);
  const now = Date.now();

  for (const [eventId, reservation] of Object.entries(reservations)) {
    const record = asRecord(reservation);
    const recordEventId = String(record.event_id || "").trim();
    const merchantId = String(record.merchant_id || "").trim();
    const subscriptionId = String(record.subscription_id || "").trim();
    const status = String(record.status || "").trim();
    const amount = Number(record.amount);
    const reservedAt = new Date(String(record.reserved_at || ""));

    if (!eventId.startsWith("meta:") || recordEventId !== eventId) {
      issues.push(
        issue("error", "REPLY_RESERVATION_EVENT_ID_MISMATCH", {
          map_event_id: eventId,
          record_event_id: recordEventId,
        }),
      );
    }
    if (!merchantIds.has(merchantId)) {
      issues.push(
        issue("error", "ORPHAN_REPLY_RESERVATION_MERCHANT", {
          event_id: eventId,
          merchant_id: merchantId || null,
        }),
      );
    }
    if (!subscriptionIds.has(subscriptionId)) {
      issues.push(
        issue("error", "ORPHAN_REPLY_RESERVATION_SUBSCRIPTION", {
          event_id: eventId,
          subscription_id: subscriptionId || null,
        }),
      );
    } else if (subscriptionMerchantById.get(subscriptionId) !== merchantId) {
      issues.push(
        issue("error", "REPLY_RESERVATION_SUBSCRIPTION_MERCHANT_MISMATCH", {
          event_id: eventId,
          merchant_id: merchantId,
          subscription_id: subscriptionId,
          subscription_merchant_id: subscriptionMerchantById.get(subscriptionId),
        }),
      );
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      issues.push(
        issue("error", "INVALID_REPLY_RESERVATION_AMOUNT", {
          event_id: eventId,
          amount: record.amount,
        }),
      );
    }
    if (!Number.isFinite(reservedAt.getTime())) {
      issues.push(
        issue("error", "INVALID_REPLY_RESERVATION_TIMESTAMP", {
          event_id: eventId,
          reserved_at: record.reserved_at,
        }),
      );
    }
    if (status !== "pending" && status !== "consumed") {
      issues.push(
        issue("error", "INVALID_REPLY_RESERVATION_STATUS", {
          event_id: eventId,
          status,
        }),
      );
    }
    if (status === "pending" && Number.isFinite(reservedAt.getTime())) {
      const ageMs = now - reservedAt.getTime();
      issues.push(
        issue(
          ageMs > 5 * 60 * 1000 ? "error" : "warning",
          ageMs > 5 * 60 * 1000
            ? "STALE_PENDING_REPLY_RESERVATION"
            : "PENDING_REPLY_RESERVATION",
          { event_id: eventId, age_ms: ageMs },
        ),
      );
    }
    if (
      status === "consumed" &&
      (!Number.isInteger(Number(record.replies_remaining_after)) ||
        Number(record.replies_remaining_after) < 0)
    ) {
      issues.push(
        issue("error", "INVALID_REPLY_RESERVATION_REMAINING", {
          event_id: eventId,
          replies_remaining_after: record.replies_remaining_after,
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
        maps: countObjectMaps(result.value),
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
  const {
    merchantIds,
    subscriptionIds,
    subscriptionMerchantById,
  } = auditMerchants(merchantsDb, issues);

  auditRuntime(parsed["bot-runtime.json"] || {}, merchantIds, issues);
  auditRuntimeMaps(
    parsed["fawri-runtime-db.json"] || {},
    merchantIds,
    issues,
  );
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

  auditProcessedMetaEvents(parsed["processed-meta-events.json"] || {}, issues);
  auditReplyReservations(
    parsed["reply-reservations.json"] || {},
    merchantIds,
    subscriptionIds,
    subscriptionMerchantById,
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
