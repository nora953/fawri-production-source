import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildValidatedMigrationPlan as buildBaseValidatedMigrationPlan,
  canonicalJson,
  loadLatestSnapshot,
  repositoryRoot,
  validateAgainstSnapshot,
} from "./postgresql-migration-plan-safe.mjs";
import { buildTransitionalMigrationReadiness } from "./transitional-migration-readiness.mjs";
import { mergeLegacyAuthHistory } from "./legacy-auth-history.mjs";

export const migrationPlanVersion = "8";

const audits = [
  {
    key: "manual_conversation_migration",
    sourceKey: "manualConversationOperations",
    source: "manual_conversation_preflight",
    fileName: "manual-conversation-operations.json",
    script: "audit-manual-conversation-operations.mjs",
    summaryPrefix: "manual_conversation",
  },
  {
    key: "order_operations_migration",
    sourceKey: "orderOperations",
    source: "order_operations_preflight",
    fileName: "order-operations.json",
    script: "audit-order-operations.mjs",
    summaryPrefix: "order_operations",
  },
  {
    key: "merchant_settings_migration",
    sourceKey: "merchantSettings",
    source: "merchant_settings_preflight",
    fileName: "merchant-settings.json",
    script: "audit-merchant-settings.mjs",
    summaryPrefix: "merchant_settings",
  },
];

const baseSourceByTable = {
  accounts: "auth",
  merchants: "auth",
  admin_profiles: "auth",
  admin_permissions: "auth",
  subscriptions: "auth",
  notifications: "auth",
  merchant_channel_overrides: "auth",
  merchant_deletion_requests: "auth",
  products: "runtime",
  merchant_channels: "runtime",
  conversations: "runtime",
  orders: "runtime",
  order_drafts: "runtime",
  merchant_delivery_area_rates: "merchantSettings",
  saved_answers: "savedAnswers",
  training_requests: "trainingRequests",
  learned_answers: "learnedAnswers",
  support_tickets: "auth",
  support_messages: "auth",
  support_inspection_requests: "auth",
  support_preview_sessions: "supportPreview",
  emergency_authorizations: "emergency",
  emergency_access_requests: "emergency",
  emergency_owner_alerts: "emergency",
  emergency_merchant_notices: "emergency",
  audit_events: "emergency",
  processed_channel_events: "transitional_processedEvents",
  reply_ledger: "transitional_replyReservations",
  background_jobs: "transitional_backgroundJobs",
  job_dead_letters: "transitional_backgroundJobs",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, value) {
  return `${prefix}:${sha256(String(value)).slice(0, 32)}`;
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeDeliveryAreaName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ـًٌٍَُِّْ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[کكگ]/g, "ك")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readOptional(dataDirectory, fileName, fallback = {}) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) {
    return {
      file: fileName,
      exists: false,
      bytes: 0,
      sha256: null,
      value: fallback,
    };
  }
  const bytes = fs.readFileSync(filePath);
  return {
    file: fileName,
    exists: true,
    bytes: bytes.length,
    sha256: sha256(bytes),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function runAudit(dataDirectory, definition) {
  const result = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", definition.script), dataDirectory],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://must-not-be-used.invalid/fawri",
      },
    },
  );
  if (result.error) throw result.error;
  const output = result.status === 1 ? result.stderr : result.stdout;
  if (!output) throw new Error(`${definition.script} returned no JSON output`);
  const report = JSON.parse(output);
  if (result.status === 1) {
    throw new Error(report.fatal_error || `${definition.script} failed`);
  }
  return report;
}

function removeIssuesFromSource(report, source) {
  report.errors = asArray(report.errors).filter((item) => item?.source !== source);
  report.warnings = asArray(report.warnings).filter(
    (item) => item?.source !== source,
  );
}

function mergeAudit(report, dataDirectory, definition, auditReport) {
  removeIssuesFromSource(report, definition.source);
  const issues = asArray(auditReport.issues);
  for (const item of issues) {
    const normalized = {
      code: String(item?.code || "OPERATIONAL_MIGRATION_ISSUE"),
      source: definition.source,
      ...(item?.details && typeof item.details === "object" ? item.details : {}),
    };
    if (item?.severity === "error") report.errors.push(normalized);
    else report.warnings.push(normalized);
  }

  const descriptor = readOptional(dataDirectory, definition.fileName);
  delete descriptor.value;
  report.source_files = {
    ...(report.source_files || {}),
    [definition.sourceKey]: descriptor,
  };
  report[definition.key] = {
    ok: auditReport.ok === true,
    mode: auditReport.mode,
    rows_included: true,
    summary: auditReport.summary || {},
    source_file: descriptor,
    issues,
  };
  report.summary = {
    ...(report.summary || {}),
    [`${definition.summaryPrefix}_errors`]: issues.filter(
      (item) => item?.severity === "error",
    ).length,
    [`${definition.summaryPrefix}_warnings`]: issues.filter(
      (item) => item?.severity !== "error",
    ).length,
  };
}

function rowIdentity(tableName, row) {
  if (tableName === "merchant_channel_overrides") {
    return canonicalJson([row?.merchant_id, row?.platform]);
  }
  if (row?.id) return String(row.id);
  if (tableName === "merchant_settings") return String(row?.merchant_id || "");
  if (tableName === "admin_permissions") {
    return `${row?.admin_id || ""}:${row?.permission || ""}`;
  }
  return canonicalJson(row);
}

function addError(report, code, details = {}) {
  report.errors.push({ code, source: "complete_migration_planner", ...details });
}

function mergeRow(report, tableName, row, sourceKey, sourceRecord, { replaceExisting = false } = {}) {
  report.rows[tableName] ||= [];
  const identity = rowIdentity(tableName, row);
  const existingIndex = report.rows[tableName].findIndex(
    (candidate) => rowIdentity(tableName, candidate) === identity,
  );
  if (existingIndex >= 0) {
    const existing = report.rows[tableName][existingIndex];
    if (replaceExisting) {
      report.rows[tableName][existingIndex] = row;
      upsertLineage(report, tableName, row, sourceKey, sourceRecord);
      return row;
    }
    if (canonicalJson(existing) !== canonicalJson(row)) {
      addError(report, "DUPLICATE_TARGET_IDENTITY_CONFLICT", {
        table: tableName,
        target_record_id: identity,
        source_file: sourceKey,
      });
    }
    return existing;
  }

  report.rows[tableName].push(row);
  report.source_lineage.push({
    source_key: sourceKey,
    source_collection: tableName,
    source_record_id: identity,
    source_record_sha256: sha256(canonicalJson(sourceRecord ?? row)),
    target_table: tableName,
    target_record_id: identity,
  });
  return row;
}

function upsertLineage(report, tableName, row, sourceKey, sourceRecord) {
  const identity = rowIdentity(tableName, row);
  const existing = report.source_lineage.find(
    (item) =>
      item.target_table === tableName && item.target_record_id === identity,
  );
  const lineage = {
    source_key: sourceKey,
    source_collection: tableName,
    source_record_id: identity,
    source_record_sha256: sha256(canonicalJson(sourceRecord ?? row)),
    target_table: tableName,
    target_record_id: identity,
  };
  if (existing) Object.assign(existing, lineage);
  else report.source_lineage.push(lineage);
}

function seedBaseLineage(report) {
  report.source_lineage = [];
  for (const [tableName, rows] of Object.entries(report.rows || {})) {
    const sourceKey = baseSourceByTable[tableName] || "derived";
    for (const row of asArray(rows)) {
      upsertLineage(report, tableName, row, sourceKey, row);
    }
  }
}

function mergeTransitionalRows(report, transitionalReport) {
  const targetRows = asRecord(transitionalReport.target_rows);
  const channelByPage = new Map(
    asArray(report.rows.merchant_channels)
      .filter((row) => text(row.page_id))
      .map((row) => [text(row.page_id), row]),
  );
  const channelIdMap = new Map();

  for (const row of asArray(targetRows.merchant_channels)) {
    const pageId = text(row.page_id);
    const existing = pageId ? channelByPage.get(pageId) : null;
    if (existing) {
      if (text(existing.merchant_id) !== text(row.merchant_id)) {
        addError(report, "TRANSITIONAL_CHANNEL_TENANT_CONFLICT", {
          page_id: pageId,
          expected_merchant_id: existing.merchant_id,
          actual_merchant_id: row.merchant_id,
        });
      }
      channelIdMap.set(row.id, existing.id);
      continue;
    }
    const inserted = mergeRow(
      report,
      "merchant_channels",
      row,
      "transitional_runtime",
      row,
    );
    channelByPage.set(pageId, inserted);
    channelIdMap.set(row.id, inserted.id);
  }

  for (const [tableName, rows] of Object.entries(targetRows)) {
    if (tableName === "merchant_channels") continue;
    for (const rawRow of asArray(rows)) {
      const row = structuredClone(rawRow);
      if (row.channel_id && channelIdMap.has(row.channel_id)) {
        row.channel_id = channelIdMap.get(row.channel_id);
      }
      mergeRow(
        report,
        tableName,
        row,
        {
          processed_channel_events: "transitional_processedEvents",
          reply_ledger: "transitional_replyReservations",
          background_jobs: "transitional_backgroundJobs",
          job_dead_letters: "transitional_backgroundJobs",
        }[tableName] || "transitional_runtime",
        rawRow,
      );
    }
  }
  return channelByPage;
}

function mergeOperationalRuntime(report, runtimeSource, channelByPage) {
  const runtime = asRecord(runtimeSource.value);
  const productsByMerchant = asRecord(runtime.productsByMerchant);
  for (const [merchantId, products] of Object.entries(productsByMerchant)) {
    for (const [index, item] of asArray(products).entries()) {
      const row = {
        id: text(item?.id) || `runtime-product-${merchantId}-${index + 1}`,
        merchant_id: merchantId,
        code: text(item?.code) || null,
        name: text(item?.name),
        sku: text(item?.sku) || null,
        barcode: text(item?.barcode) || null,
        category: text(item?.category) || null,
        description: text(item?.description) || null,
        original_price_iqd: Number(
          item?.original_price_iqd ?? item?.price_iqd ?? item?.price ?? 0,
        ),
        current_price_iqd: Number(
          item?.current_price_iqd ?? item?.sale_price_iqd ?? item?.price_iqd ?? item?.price ?? 0,
        ),
        quantity: Number(item?.quantity ?? item?.stock ?? 0),
        status: text(item?.status) || (item?.active === false ? "inactive" : "available"),
        allow_fawri_reply: item?.allow_fawri_reply !== false,
        image_url: text(item?.image_url) || null,
        metadata: { legacy_runtime: item },
        created_at: item?.created_at || null,
        updated_at: item?.updated_at || item?.created_at || null,
        deleted_at: item?.deleted_at || null,
      };
      mergeRow(report, "products", row, "transitional_runtime", item, { replaceExisting: true });
    }
  }

  const conversationsByMerchant = asRecord(runtime.conversationsByMerchant);
  for (const [merchantId, conversations] of Object.entries(
    conversationsByMerchant,
  )) {
    for (const [index, item] of asArray(conversations).entries()) {
      const pageId = text(item?.page_id);
      const channel = channelByPage.get(pageId);
      const id = text(item?.id) || `runtime-conversation-${merchantId}-${index + 1}`;
      const row = {
        id,
        merchant_id: merchantId,
        channel_id: text(item?.channel_id) || channel?.id || "",
        external_conversation_id: text(item?.external_conversation_id) || null,
        customer_external_id:
          text(item?.customer_external_id || item?.customer_id || item?.customerId) || id,
        customer_name: text(item?.customer_name) || null,
        customer_handle: text(item?.customer_handle) || null,
        status: text(item?.status) || "auto_replying",
        assigned_to_human: item?.assigned_to_human === true,
        assigned_account_id: text(item?.assigned_account_id) || null,
        needs_training: item?.needs_training === true,
        last_message_at: item?.last_message_at || null,
        closed_at: item?.closed_at || null,
        metadata: { legacy_runtime: item },
        created_at: item?.created_at || null,
        updated_at: item?.updated_at || item?.created_at || null,
      };
      mergeRow(report, "conversations", row, "transitional_runtime", item, { replaceExisting: true });
    }
  }

  const ordersByMerchant = asRecord(runtime.ordersByMerchant);
  for (const [merchantId, orders] of Object.entries(ordersByMerchant)) {
    for (const [index, item] of asArray(orders).entries()) {
      const row = {
        id: text(item?.id) || `runtime-order-${merchantId}-${index + 1}`,
        merchant_id: merchantId,
        conversation_id: text(item?.conversation_id) || null,
        customer_external_id: text(item?.customer_external_id) || null,
        customer_name: text(item?.customer_name),
        customer_phone: text(item?.customer_phone) || null,
        customer_address: text(item?.customer_address) || null,
        customer_area: text(item?.customer_area) || null,
        status: text(item?.status) === "new" ? "pending_confirmation" : text(item?.status) || "pending_confirmation",
        payment_method: text(item?.payment_method) || "cash_on_delivery",
        payment_status: text(item?.payment_status) || "cash_on_delivery",
        subtotal_iqd: Number(item?.subtotal_iqd ?? item?.total_iqd ?? item?.total_price ?? 0),
        delivery_fee_iqd: Number(item?.delivery_fee_iqd ?? 0),
        total_iqd: Number(item?.total_iqd ?? item?.total_price ?? item?.total ?? 0),
        source_channel: text(item?.source_channel || item?.channel) || "unknown",
        version: Number(item?.version || 1),
        notes: text(item?.notes) || null,
        payment_verified_at: item?.payment_verified_at || null,
        payment_verified_by_account_id: text(item?.payment_verified_by_account_id || item?.payment_verified_by) || null,
        payment_rejection_reason: text(item?.payment_rejection_reason) || null,
        confirmed_at: item?.confirmed_at || null,
        cancelled_at: item?.cancelled_at || null,
        delivered_at: item?.delivered_at || null,
        metadata: { legacy_runtime: item },
        created_at: item?.created_at || null,
        updated_at: item?.updated_at || item?.created_at || null,
      };
      mergeRow(report, "orders", row, "transitional_runtime", item, { replaceExisting: true });
    }
  }

  const drafts = asRecord(runtime.orderDraftsByConversation);
  for (const [conversationId, itemValue] of Object.entries(drafts)) {
    const item = asRecord(itemValue);
    const merchantId = text(item.merchant_id);
    const row = {
      id: text(item.id) || stableId("runtime-order-draft", conversationId),
      merchant_id: merchantId,
      conversation_id: conversationId,
      customer_external_id: text(item.customer_external_id),
      awaiting_field: text(item.awaiting_field),
      draft_data: item.draft_data || item,
      expires_at: item.expires_at || null,
      created_at: item.created_at || null,
      updated_at: item.updated_at || item.created_at || null,
    };
    mergeRow(report, "order_drafts", row, "transitional_runtime", item, { replaceExisting: true });
  }
}

function applyManualOverlay(report, source) {
  const conversationsByMerchant = asRecord(source.value?.conversations);
  for (const [merchantId, conversationMap] of Object.entries(
    conversationsByMerchant,
  )) {
    for (const [conversationId, overlayValue] of Object.entries(
      asRecord(conversationMap),
    )) {
      const overlay = asRecord(overlayValue);
      const conversation = asArray(report.rows.conversations).find(
        (row) => row.id === conversationId && row.merchant_id === merchantId,
      );
      if (!conversation) {
        addError(report, "MANUAL_OVERLAY_TARGET_CONVERSATION_MISSING", {
          merchant_id: merchantId,
          conversation_id: conversationId,
        });
        continue;
      }
      conversation.status = text(overlay.status) || conversation.status;
      conversation.assigned_to_human = overlay.assigned_to_human === true;
      conversation.updated_at = overlay.updated_at || conversation.updated_at;
      upsertLineage(
        report,
        "conversations",
        conversation,
        "manualConversationOperations",
        overlay,
      );

      const addMessage = (message, senderFallback) => {
        const row = {
          id: text(message?.id),
          merchant_id: merchantId,
          conversation_id: conversationId,
          external_message_id: text(message?.external_message_id) || null,
          external_event_id: text(message?.external_event_id) || null,
          sender: text(message?.sender) || senderFallback,
          text: String(message?.text ?? ""),
          status: text(message?.status) || (senderFallback === "customer" ? "received" : "sent"),
          reply_type: text(message?.reply_type) || (senderFallback === "merchant" ? "manual" : null),
          counted_as_auto_reply: message?.counted_as_auto_reply === true,
          failure_code: text(message?.failure_code) || null,
          sent_at: message?.sent_at || null,
          failed_at: message?.failed_at || null,
          metadata: message?.metadata || {},
          created_at: message?.created_at || null,
        };
        mergeRow(report, "messages", row, "manualConversationOperations", message);
      };

      for (const message of asArray(overlay.inbound_messages)) {
        addMessage(message, "customer");
      }
      for (const message of asArray(overlay.manual_messages)) {
        addMessage(message, "merchant");
      }
      for (const [idempotencyKey, requestValue] of Object.entries(
        asRecord(overlay.requests),
      )) {
        const request = asRecord(requestValue);
        const row = {
          id: text(request.id) || stableId(
            "manual-reply-request",
            `${merchantId}:${conversationId}:${idempotencyKey}`,
          ),
          merchant_id: merchantId,
          conversation_id: conversationId,
          idempotency_key: idempotencyKey,
          text_sha256: text(request.text_sha256),
          status: text(request.status) || "pending",
          message_id: text(request.message_id) || null,
          external_message_id: text(request.external_message_id) || null,
          error_code: text(request.error_code) || null,
          created_at: request.created_at || null,
          updated_at: request.updated_at || request.created_at || null,
        };
        mergeRow(
          report,
          "manual_reply_requests",
          row,
          "manualConversationOperations",
          request,
        );
      }
    }
  }
}

function applyOrderOperations(report, source) {
  for (const [merchantId, operations] of Object.entries(
    asRecord(source.value?.orders),
  )) {
    for (const [orderId, operationValue] of Object.entries(
      asRecord(operations),
    )) {
      const operation = asRecord(operationValue);
      const order = asArray(report.rows.orders).find(
        (row) => row.id === orderId && row.merchant_id === merchantId,
      );
      if (!order) {
        addError(report, "ORDER_OPERATION_TARGET_MISSING", {
          merchant_id: merchantId,
          order_id: orderId,
        });
        continue;
      }
      order.version = Number(operation.version);
      order.status = text(operation.status);
      order.payment_status = text(operation.payment_status);
      order.payment_verified_at = operation.payment_verified_at || null;
      order.payment_verified_by_account_id =
        text(operation.payment_verified_by) || null;
      order.payment_rejection_reason =
        text(operation.payment_rejection_reason) || null;
      order.updated_at = operation.updated_at || order.updated_at;
      upsertLineage(report, "orders", order, "orderOperations", operation);
    }
  }
}

function applyMerchantSettings(report, source) {
  for (const [merchantId, settingsValue] of Object.entries(
    asRecord(source.value?.settings),
  )) {
    const settings = asRecord(settingsValue);
    const delivery = asRecord(settings.delivery);
    const payment = asRecord(settings.payment);
    const pricingMode = delivery.pricing_mode === "per_area" ? "per_area" : "flat";
    const row = {
      merchant_id: merchantId,
      version: Number(settings.version),
      auto_reply_enabled: settings.auto_reply_enabled === true,
      reply_language: text(settings.reply_language) || "auto",
      delivery_enabled: delivery.enabled === true,
      delivery_pricing_mode: pricingMode,
      delivery_fee_iqd: Number(delivery.fee_iqd || 0),
      free_delivery_threshold_iqd:
        delivery.free_delivery_threshold_iqd === null ||
        delivery.free_delivery_threshold_iqd === undefined
          ? null
          : Number(delivery.free_delivery_threshold_iqd),
      delivery_estimated_days_min: Number(delivery.estimated_days_min),
      delivery_estimated_days_max: Number(delivery.estimated_days_max),
      delivery_areas: pricingMode === "per_area" ? [] : asArray(delivery.areas),
      delivery_notes: String(delivery.notes ?? ""),
      cash_on_delivery_enabled: payment.cash_on_delivery_enabled === true,
      electronic_payment_enabled: payment.electronic_payment_enabled === true,
      payment_methods: asArray(payment.methods),
      payment_instructions: String(payment.instructions ?? ""),
      created_at: settings.created_at || null,
      updated_at: settings.updated_at || settings.created_at || null,
    };
    mergeRow(report, "merchant_settings", row, "merchantSettings", settings);

    for (const [index, rateValue] of asArray(delivery.area_rates).entries()) {
      const rate = asRecord(rateValue);
      const areaName = text(rate.area_name);
      const normalizedArea = normalizeDeliveryAreaName(areaName);
      if (!areaName || !normalizedArea) continue;
      mergeRow(
        report,
        "merchant_delivery_area_rates",
        {
          id: text(rate.id) || stableId("delivery-area", `${merchantId}:${normalizedArea}`),
          merchant_id: merchantId,
          area_name: areaName,
          normalized_area_name: normalizedArea,
          fee_iqd: Number(rate.fee_iqd || 0),
          enabled: rate.enabled !== false,
          created_at: settings.created_at || null,
          updated_at: settings.updated_at || settings.created_at || null,
        },
        "merchantSettings",
        { index, ...rate },
      );
    }
  }
}


function mergeLegacyAuthOperationalRows(report, dataDirectory) {
  const source = readOptional(dataDirectory, "merchants.json", {
    merchants: [],
    channel_overrides: {},
    deletion_requests: [],
  });
  if (!source.exists) return;

  const auth = asRecord(source.value);
  mergeLegacyAuthHistory(report, auth, mergeRow);
  const merchants = asArray(auth.merchants);
  const merchantById = new Map(
    merchants
      .filter((item) => text(item?.id))
      .map((item) => [text(item.id), asRecord(item)]),
  );

  for (const [merchantId, overrideValue] of Object.entries(
    asRecord(auth.channel_overrides),
  )) {
    const override = asRecord(overrideValue);
    const merchant = merchantById.get(merchantId) || {};
    const timestamp =
      merchant.updated_at ||
      merchant.created_at ||
      "1970-01-01T00:00:00.000Z";

    for (const platform of ["messenger", "instagram"]) {
      const status = text(override[platform]);
      if (!status) continue;

      mergeRow(
        report,
        "merchant_channel_overrides",
        {
          merchant_id: merchantId,
          platform,
          status,
          updated_by_admin_id: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
        "auth",
        { merchant_id: merchantId, platform, status },
      );
    }
  }

  for (const requestValue of asArray(auth.deletion_requests)) {
    const request = asRecord(requestValue);
    const merchantId = text(request.merchant_id);
    const merchant = merchantById.get(merchantId) || {};

    mergeRow(
      report,
      "merchant_deletion_requests",
      {
        id: text(request.id),
        merchant_id: merchantId || null,
        merchant_id_snapshot: merchantId,
        merchant_name_snapshot:
          text(request.merchant_name) ||
          text(merchant.store_name) ||
          text(merchant.owner_name) ||
          merchantId,
        merchant_phone_snapshot:
          text(request.merchant_phone) || text(merchant.phone),
        requested_by_admin_id: text(request.requested_by_admin_id) || null,
        requested_by_admin_id_snapshot: text(request.requested_by_admin_id),
        requested_by_admin_name_snapshot: text(request.requested_by_admin_name),
        requested_by_admin_phone_snapshot: text(request.requested_by_admin_phone),
        reason: text(request.reason),
        details: text(request.details),
        status: text(request.status) || "pending",
        reviewed_by_admin_id: text(request.reviewed_by_admin_id) || null,
        reviewed_at: request.reviewed_at || null,
        completed_at: request.completed_at || null,
        created_at: request.created_at || null,
      },
      "auth",
      request,
    );
  }
}

function normalizeCompleteRows(report) {
  for (const order of asArray(report.rows?.orders)) {
    order.delivery_fee_iqd = Number(order.delivery_fee_iqd || 0);
    order.total_iqd = Number(order.total_iqd || 0);
    if (order.subtotal_iqd === undefined || order.subtotal_iqd === null) {
      order.subtotal_iqd = order.total_iqd - order.delivery_fee_iqd;
    }
    order.subtotal_iqd = Number(order.subtotal_iqd || 0);
    order.version = Number(order.version || 1);
    if (!order.updated_at && order.created_at) order.updated_at = order.created_at;
  }
  for (const product of asArray(report.rows?.products)) {
    if (!product.updated_at && product.created_at) product.updated_at = product.created_at;
  }
  for (const conversation of asArray(report.rows?.conversations)) {
    if (!conversation.updated_at && conversation.created_at) {
      conversation.updated_at = conversation.created_at;
    }
    if (conversation.status === "manual") conversation.assigned_to_human = true;
  }
}

function finalizeReport(report, snapshot, includeRows) {
  report.table_counts = Object.fromEntries(
    Object.entries(report.rows || {})
      .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
      .map(([table, rows]) => [table, rows.length]),
  );
  report.planned_row_count = Object.values(report.table_counts).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  report.source_lineage.sort((left, right) =>
    canonicalJson(left).localeCompare(canonicalJson(right)),
  );
  report.source_lineage_sha256 = sha256(canonicalJson(report.source_lineage));
  report.tool_version = migrationPlanVersion;
  report.source_manifest_sha256 = sha256(
    canonicalJson(report.source_files || {}),
  );
  validateAgainstSnapshot(report, snapshot, { removeRows: !includeRows });
  report.write_readiness = {
    ok: report.errors.length === 0,
    operational_overlays_supported: true,
    blockers: report.errors.length === 0 ? [] : report.errors,
  };
  report.summary = {
    ...(report.summary || {}),
    errors: report.errors.length,
    warnings: report.warnings.length,
    write_readiness_errors: report.errors.length,
    source_lineage_records: report.source_lineage.length,
    planned_rows: report.planned_row_count,
  };
  report.ok = report.errors.length === 0;
}

export function assertCompleteMigrationWritable(report) {
  if (report?.write_readiness?.ok === true && report?.ok === true) return;
  const blockers = asArray(report?.write_readiness?.blockers);
  const error = new Error(
    `PostgreSQL write blocked: ${blockers.map((item) => item.code).join(", ")}`,
  );
  error.code = "MIGRATION_WRITE_NOT_READY";
  error.blockers = blockers;
  throw error;
}

export function buildValidatedMigrationPlan(options) {
  const dataDirectory = path.resolve(options.dataDirectory);
  const result = buildBaseValidatedMigrationPlan({
    ...options,
    dataDirectory,
    includeRows: true,
  });
  const report = result.report;
  report.rows ||= {};
  report.errors = asArray(report.errors);
  report.warnings = asArray(report.warnings);
  seedBaseLineage(report);

  const transitional = buildTransitionalMigrationReadiness({ dataDirectory });
  const channelByPage = mergeTransitionalRows(report, transitional.report);
  mergeOperationalRuntime(report, transitional.sources.runtime, channelByPage);

  for (const definition of audits) {
    mergeAudit(
      report,
      dataDirectory,
      definition,
      runAudit(dataDirectory, definition),
    );
  }

  const manualSource = readOptional(dataDirectory, "manual-conversation-operations.json", {
    version: 1,
    conversations: {},
  });
  const orderSource = readOptional(dataDirectory, "order-operations.json", {
    version: 1,
    orders: {},
  });
  const settingsSource = readOptional(dataDirectory, "merchant-settings.json", {
    version: 1,
    settings: {},
  });
  applyManualOverlay(report, manualSource);
  applyOrderOperations(report, orderSource);
  applyMerchantSettings(report, settingsSource);
  mergeLegacyAuthOperationalRows(report, dataDirectory);
  normalizeCompleteRows(report);

  finalizeReport(report, result.snapshot, options.includeRows === true);
  return { report, snapshot: result.snapshot };
}

export {
  canonicalJson,
  loadLatestSnapshot,
  repositoryRoot,
  validateAgainstSnapshot,
};
