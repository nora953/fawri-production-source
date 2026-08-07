import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  assertCompleteMigrationWritable as assertBaseWritable,
  buildValidatedMigrationPlan as buildBasePlan,
  canonicalJson,
  loadLatestSnapshot,
  repositoryRoot,
  validateAgainstSnapshot,
} from "./postgresql-migration-plan-complete.mjs";

export { canonicalJson, loadLatestSnapshot, repositoryRoot, validateAgainstSnapshot };
export const crossLaneMigrationPlanVersion = "7";

const SCHEMA_VALIDATION_CODES = new Set([
  "TARGET_TABLE_NOT_FOUND",
  "UNKNOWN_TARGET_COLUMN",
  "REQUIRED_TARGET_VALUE_MISSING",
  "INVALID_TARGET_ENUM_VALUE",
  "DUPLICATE_TARGET_PRIMARY_KEY",
  "ORPHAN_TARGET_REFERENCE",
]);
const TERMINAL_PAYMENT = new Set(["paid", "failed"]);
const ALLOWED_PAYMENT_METHODS = new Set(["cash_on_delivery", "superqi", "fastpay", "zaincash", "other"]);
const ALLOWED_PAYMENT_STATUSES = new Set(["cash_on_delivery", "electronic_pending", "manual_review", "paid", "failed"]);
const ALLOWED_ORDER_STATUSES = new Set(["new", "pending_confirmation", "confirmed", "preparing", "shipped", "delivered", "cancelled", "out_of_stock", "waiting_customer_approval"]);
const ALLOWED_KNOWLEDGE_LANGUAGES = new Set(["ar", "ku", "en"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function text(value) {
  return String(value ?? "").trim();
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function stableId(prefix, ...parts) {
  return `${prefix}:${sha256(parts.map((value) => String(value ?? "")).join("\u0000")).slice(0, 32)}`;
}
function safeDate(value, fallback = "1970-01-01T00:00:00.000Z") {
  const parsed = new Date(String(value ?? ""));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}
function positiveInteger(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function readJson(dataDirectory, fileName, fallback = {}) {
  const filePath = path.join(dataDirectory, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
function sourceDescriptor(report, keys, fallbackFile = null) {
  for (const key of keys) {
    const descriptor = report.source_files?.[key];
    if (descriptor?.exists && descriptor?.sha256) return descriptor;
  }
  if (fallbackFile) {
    const descriptor = Object.values(report.source_files || {}).find((value) => value?.file === fallbackFile && value?.sha256);
    if (descriptor) return descriptor;
  }
  return null;
}
function addError(report, code, details = {}) {
  report.errors.push({ code, source: "cross_lane_schema_reconciliation", ...details });
}
function addWarning(report, code, details = {}) {
  report.warnings.push({ code, source: "cross_lane_schema_reconciliation", ...details });
}
function normalizePhone(value) {
  let digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (digits.startsWith("9647") && digits.length === 12) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("7") && digits.length === 10) digits = `0${digits}`;
  return digits;
}
function normalizeKnowledgeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ـًٌٍَُِّْ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ە/g, "ه")
    .replace(/ك/g, "ک")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function redactPreview(value) {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?964|0)?7\d{9}/g, "[phone]")
    .replace(/\b\d{7,}\b/g, "[number]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[secret]")
    .slice(0, 500);
}
function sanitizeRecord(value) {
  const output = {};
  for (const [key, item] of Object.entries(asRecord(value))) {
    if (/(password|otp|token|secret|cookie|authorization|credential|customer_message|payload)/i.test(key)) continue;
    if (["string", "number", "boolean"].includes(typeof item) || item === null) output[key] = item;
  }
  return output;
}
function rowIdentity(tableName, row) {
  if (row?.id) return String(row.id);
  if (tableName === "merchant_settings") return String(row?.merchant_id || "");
  if (tableName === "admin_permissions") return `${row?.admin_id || ""}:${row?.permission || ""}`;
  if (tableName === "order_terminal_decision_links") return `${row?.merchant_id || ""}:${row?.order_id || ""}`;
  return canonicalJson(row);
}
function lineageMap(report) {
  const map = new Map();
  for (const item of asArray(report.source_lineage)) {
    map.set(`${item.target_table}:${item.target_record_id}`, item);
  }
  return map;
}
function rebuildLineage(report, previousLineage) {
  const lineage = [];
  for (const [tableName, rows] of Object.entries(report.rows || {})) {
    for (const row of asArray(rows)) {
      const identity = rowIdentity(tableName, row);
      const prior = previousLineage.get(`${tableName}:${identity}`);
      lineage.push({
        source_key: prior?.source_key || "cross_lane_derived",
        source_collection: tableName,
        source_record_id: prior?.source_record_id || identity,
        source_record_sha256: prior?.source_record_sha256 || sha256(canonicalJson(row)),
        target_table: tableName,
        target_record_id: identity,
      });
    }
  }
  lineage.sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  report.source_lineage = lineage;
  report.source_lineage_sha256 = sha256(canonicalJson(lineage));
}
function clearPreviousSchemaValidation(report) {
  report.errors = asArray(report.errors).filter((item) => !SCHEMA_VALIDATION_CODES.has(item?.code));
  report.warnings = asArray(report.warnings).filter((item) => item?.code !== "NULL_VALUES_WILL_USE_DATABASE_DEFAULTS");
  delete report.schema_validation;
}

function reconcileIdentity(report) {
  const accounts = asArray(report.rows.accounts);
  const merchants = asArray(report.rows.merchants);
  const admins = asArray(report.rows.admin_profiles);
  const phoneOwners = new Map();
  const merchantIds = new Set(merchants.map((row) => String(row.id)));
  const adminIds = new Set(admins.map((row) => String(row.id)));
  for (const account of accounts) {
    account.phone = normalizePhone(account.phone);
    account.password_version = positiveInteger(account.password_version, 1);
    account.security_version = positiveInteger(account.security_version, 1);
    account.session_version = positiveInteger(account.session_version, 1);
    account.metadata = { migrated_from: "merchants.json" };
    if (!/^07\d{9}$/.test(account.phone)) addError(report, "INVALID_ACCOUNT_PHONE", { account_id: account.id });
    if (phoneOwners.has(account.phone)) addError(report, "DUPLICATE_ACCOUNT_PHONE", { phone: account.phone, account_ids: [phoneOwners.get(account.phone), account.id] });
    else phoneOwners.set(account.phone, account.id);
    const hasMerchant = merchantIds.has(String(account.id));
    const hasAdmin = adminIds.has(String(account.id));
    if (hasMerchant === hasAdmin || (account.kind === "merchant") !== hasMerchant || (account.kind === "admin") !== hasAdmin) {
      addError(report, "AMBIGUOUS_ACCOUNT_ROLE", { account_id: account.id, kind: account.kind, merchant_profile: hasMerchant, admin_profile: hasAdmin });
    }
  }
  for (const merchant of merchants) {
    merchant.profile_kind = "merchant";
    merchant.metadata = { migrated_from: "merchants.json" };
  }
  for (const admin of admins) admin.profile_kind = "admin";
  report.rows.account_sessions = [];
  report.rows.trusted_devices = [];
  report.rows.login_attempts = [];
  report.rows.auth_otp_challenges = [];
  report.rows.auth_audit_events = [];
}

function reconcileChannelsAndJobs(report) {
  for (const channel of asArray(report.rows.merchant_channels)) {
    channel.version = positiveInteger(channel.version, 1);
    const legacy = asRecord(channel.metadata?.legacy || channel.metadata?.legacy_runtime);
    if (Object.keys(legacy).some((key) => /(access.?token|page_access_token|credential|secret)/i.test(key) && text(legacy[key]))) {
      addError(report, "PLAINTEXT_CHANNEL_CREDENTIAL_REQUIRES_REKEY", { channel_id: channel.id, merchant_id: channel.merchant_id });
    }
    channel.credential_ciphertext = null;
    channel.credential_nonce = null;
    channel.credential_auth_tag = null;
    channel.credential_key_id = null;
    channel.credential_algorithm = null;
    channel.credential_expires_at = null;
    channel.metadata = { migrated_from: "legacy_channel_runtime" };
  }
  for (const job of asArray(report.rows.background_jobs)) {
    const payload = job.payload;
    if (payload && typeof payload === "object" && Object.keys(payload).length > 0) {
      addError(report, "BACKGROUND_JOB_PAYLOAD_REQUIRES_ENCRYPTION", { job_id: job.id, merchant_id: job.merchant_id });
    }
    job.payload_hash = job.payload_hash || sha256(canonicalJson(payload || {}));
    job.requeue_count = Number(job.requeue_count || 0);
    job.settings_version = job.settings_version == null ? null : positiveInteger(job.settings_version, 1);
    job.lease_expires_at = null;
    job.lease_generation = null;
    job.result = sanitizeRecord(job.result);
    delete job.payload;
    delete job.last_error_message;
  }
  for (const attempt of asArray(report.rows.job_attempts)) {
    attempt.lease_generation = positiveInteger(attempt.lease_generation, 1);
    attempt.metadata = sanitizeRecord(attempt.metadata);
    delete attempt.error_message;
  }
  for (const dead of asArray(report.rows.job_dead_letters)) {
    if (dead.payload_snapshot) dead.payload_sha256 = dead.payload_sha256 || sha256(canonicalJson(dead.payload_snapshot));
    dead.metadata = sanitizeRecord(dead.metadata);
    delete dead.payload_snapshot;
    delete dead.reason_message;
  }
  report.rows.background_job_payloads ||= [];
  report.rows.channel_inbound_events ||= [];
  report.rows.reply_reservations ||= [];
  report.rows.reply_refunds ||= [];
  report.rows.outbound_deliveries ||= [];
}

function decisionValid(decision, order, accountIds) {
  return decision &&
    decision.merchant_id === order.merchant_id &&
    decision.order_id === order.id &&
    ["confirm", "reject"].includes(decision.operation) &&
    ["cash_on_delivery", "electronic"].includes(decision.payment_channel) &&
    ["paid", "failed"].includes(decision.outcome) &&
    ALLOWED_ORDER_STATUSES.has(decision.previous_order_status) &&
    ALLOWED_ORDER_STATUSES.has(decision.resulting_order_status) &&
    ALLOWED_PAYMENT_STATUSES.has(decision.previous_payment_status) &&
    decision.resulting_payment_status === decision.outcome &&
    decision.actor_type === "merchant" &&
    accountIds.has(String(decision.actor_id)) &&
    positiveInteger(decision.expected_version, 0) > 0 &&
    Number(decision.resulting_version) === Number(decision.expected_version) + 1;
}
function reconcileOrders(report, dataDirectory) {
  const source = asRecord(readJson(dataDirectory, "order-operations.json", { version: 1, orders: {} }));
  const decisions = asArray(source.payment_decisions);
  const accountIds = new Set(asArray(report.rows.accounts).map((row) => String(row.id)));
  const orderByKey = new Map(asArray(report.rows.orders).map((row) => [`${row.merchant_id}:${row.id}`, row]));
  const mappedDecisions = [];
  const decisionById = new Map();
  for (const raw of decisions) {
    const order = orderByKey.get(`${raw?.merchant_id}:${raw?.order_id}`);
    if (!order || !decisionValid(raw, order, accountIds)) {
      addError(report, "ORDER_PAYMENT_DECISION_PROVENANCE_INVALID", { decision_id: raw?.id || null, merchant_id: raw?.merchant_id || null, order_id: raw?.order_id || null });
      continue;
    }
    const row = {
      id: String(raw.id), merchant_id: String(raw.merchant_id), order_id: String(raw.order_id), operation: raw.operation,
      payment_channel: raw.payment_channel, outcome: raw.outcome, previous_order_status: raw.previous_order_status,
      resulting_order_status: raw.resulting_order_status, previous_payment_status: raw.previous_payment_status,
      resulting_payment_status: raw.resulting_payment_status, actor_type: raw.actor_type,
      actor_account_id: String(raw.actor_id), actor_session_fingerprint: null, request_id: text(raw.request_id) || null,
      reason: text(raw.reason) || null, expected_version: Number(raw.expected_version), resulting_version: Number(raw.resulting_version),
      source_file: null, source_sha256: null, migration_batch_id: null, decided_at: safeDate(raw.decided_at),
    };
    mappedDecisions.push(row);
    decisionById.set(row.id, row);
  }
  const links = [];
  const operations = asRecord(source.orders);
  const operationDescriptor = sourceDescriptor(report, ["orderOperations"], "order-operations.json");
  const runtimeDescriptor = sourceDescriptor(report, ["runtime", "transitional_runtime"], "fawri-runtime-db.json") || sourceDescriptor(report, ["runtime"], "bot-runtime.json");
  const batch = `cross-lane:${String(report.source_manifest_sha256 || "unknown").slice(0, 24)}`;
  for (const order of asArray(report.rows.orders)) {
    order.version = positiveInteger(order.version, 1);
    order.metadata = { migrated_from: "legacy_order_runtime" };
    if (!ALLOWED_PAYMENT_METHODS.has(order.payment_method) || !ALLOWED_PAYMENT_STATUSES.has(order.payment_status) || !ALLOWED_ORDER_STATUSES.has(order.status)) continue;
    if (!TERMINAL_PAYMENT.has(order.payment_status)) {
      order.payment_verified_at = null;
      order.payment_verified_by_account_id = null;
      order.payment_rejection_reason = null;
      continue;
    }
    const operation = asRecord(asRecord(operations[order.merchant_id])[order.id]);
    const explicitId = text(operation.last_payment_decision_id);
    const trusted = explicitId ? decisionById.get(explicitId) : mappedDecisions
      .filter((item) => item.merchant_id === order.merchant_id && item.order_id === order.id && item.outcome === order.payment_status)
      .sort((a, b) => b.resulting_version - a.resulting_version)[0];
    if (trusted && Number(trusted.resulting_version) === Number(order.version) && trusted.outcome === order.payment_status) {
      links.push({ merchant_id: order.merchant_id, order_id: order.id, decision_id: trusted.id, linked_at: trusted.decided_at });
      if (order.payment_status === "paid") {
        order.payment_verified_at = order.payment_verified_at || trusted.decided_at;
        order.payment_rejection_reason = null;
      } else {
        order.payment_verified_at = null;
        order.payment_verified_by_account_id = null;
        order.payment_rejection_reason = order.payment_rejection_reason || trusted.reason || "payment_rejected";
      }
      continue;
    }
    const descriptor = Object.keys(operation).length > 0 ? operationDescriptor : runtimeDescriptor;
    if (!descriptor?.file || !descriptor?.sha256) {
      addError(report, "ORDER_LEGACY_SOURCE_PROVENANCE_MISSING", { merchant_id: order.merchant_id, order_id: order.id });
      continue;
    }
    if (order.version <= 1) order.version = 2;
    const resultingVersion = order.version;
    const expectedVersion = resultingVersion - 1;
    const decidedAt = safeDate(order.updated_at || order.created_at);
    const id = stableId("legacy-payment", order.merchant_id, order.id, descriptor.sha256, resultingVersion);
    const channel = order.payment_method === "cash_on_delivery" ? "cash_on_delivery" : "electronic";
    const previousPayment = channel === "cash_on_delivery" ? "cash_on_delivery" : "electronic_pending";
    const decision = {
      id, merchant_id: order.merchant_id, order_id: order.id, operation: "legacy_import", payment_channel: channel,
      outcome: order.payment_status, previous_order_status: order.status, resulting_order_status: order.status,
      previous_payment_status: previousPayment, resulting_payment_status: order.payment_status,
      actor_type: "system", actor_account_id: null, actor_session_fingerprint: null, request_id: null,
      reason: order.payment_status === "failed" ? (order.payment_rejection_reason || "legacy_import_failure") : null,
      expected_version: expectedVersion, resulting_version: resultingVersion, source_file: descriptor.file,
      source_sha256: descriptor.sha256, migration_batch_id: batch, decided_at: decidedAt,
    };
    mappedDecisions.push(decision);
    decisionById.set(id, decision);
    links.push({ merchant_id: order.merchant_id, order_id: order.id, decision_id: id, linked_at: decidedAt });
    if (order.payment_status === "paid") {
      order.payment_verified_at = order.payment_verified_at || decidedAt;
      order.payment_verified_by_account_id = null;
      order.payment_rejection_reason = null;
    } else {
      order.payment_verified_at = null;
      order.payment_verified_by_account_id = null;
      order.payment_rejection_reason = order.payment_rejection_reason || "legacy_import_failure";
    }
  }
  const versionKeys = new Set();
  for (const decision of mappedDecisions) {
    const key = `${decision.merchant_id}:${decision.order_id}:${decision.resulting_version}`;
    if (versionKeys.has(key)) addError(report, "DUPLICATE_ORDER_DECISION_VERSION", { key });
    versionKeys.add(key);
  }
  report.rows.order_payment_decisions = mappedDecisions;
  report.rows.order_terminal_decision_links = links;
}

function reconcileSettings(report) {
  for (const row of asArray(report.rows.merchant_settings)) {
    row.version = positiveInteger(row.version, 1);
    const methods = asArray(row.payment_methods);
    if (String(row.delivery_notes || "").length > 1000) addError(report, "MERCHANT_SETTINGS_DELIVERY_NOTES_TOO_LONG", { merchant_id: row.merchant_id });
    if (String(row.payment_instructions || "").length > 2000) addError(report, "MERCHANT_SETTINGS_PAYMENT_INSTRUCTIONS_TOO_LONG", { merchant_id: row.merchant_id });
    if (!methods.length || methods.length > 5 || methods.some((value) => !ALLOWED_PAYMENT_METHODS.has(value))) addError(report, "MERCHANT_SETTINGS_PAYMENT_METHODS_INVALID", { merchant_id: row.merchant_id });
    const hasCash = methods.includes("cash_on_delivery");
    const hasElectronic = methods.some((value) => value !== "cash_on_delivery");
    if (Boolean(row.cash_on_delivery_enabled) !== hasCash || Boolean(row.electronic_payment_enabled) !== hasElectronic) addError(report, "MERCHANT_SETTINGS_PAYMENT_METHODS_INCONSISTENT", { merchant_id: row.merchant_id });
  }
}

function reconcileCatalog(report) {
  const products = asArray(report.rows.products);
  const variants = asArray(report.rows.product_variants);
  const options = [];
  const identifiers = [];
  const images = [];
  const identifierKeys = new Set();
  const productByKey = new Map(products.map((row) => [`${row.merchant_id}:${row.id}`, row]));
  for (const product of products) {
    product.external_ref = text(product.external_ref || product.code) || null;
    product.normalized_external_ref = product.external_ref ? product.external_ref.toLowerCase() : null;
    product.compare_at_price_iqd = product.compare_at_price_iqd == null ? null : Number(product.compare_at_price_iqd);
    product.low_stock_threshold = Math.max(0, Number(product.low_stock_threshold || 0));
    product.variant_stock_mode = false;
    product.version = positiveInteger(product.version, 1);
    product.metadata = { migrated_from: "legacy_catalog_runtime" };
  }
  const variantsByProduct = new Map();
  for (const variant of variants) {
    variant.external_ref = text(variant.external_ref) || null;
    variant.normalized_external_ref = variant.external_ref ? variant.external_ref.toLowerCase() : null;
    variant.version = positiveInteger(variant.version, 1);
    variant.quantity = Math.max(0, Number(variant.quantity || 0));
    variant.price_override_iqd = variant.price_override_iqd == null ? null : Number(variant.price_override_iqd);
    const pairs = [];
    if (text(variant.color)) pairs.push(["color", text(variant.color)]);
    if (text(variant.size)) pairs.push(["size", text(variant.size)]);
    const metadataOptions = asRecord(variant.metadata?.options);
    for (const [name, value] of Object.entries(metadataOptions)) if (text(value)) pairs.push([text(name).toLowerCase(), text(value)]);
    const deduped = [...new Map(pairs.map(([name, value]) => [name.toLowerCase(), [name.toLowerCase(), value]])).values()].sort((a, b) => a[0].localeCompare(b[0]));
    variant.option_signature = deduped.length ? deduped.map(([name, value]) => `${name}=${normalizeKnowledgeText(value)}`).join("|") : `variant=${sha256(String(variant.id)).slice(0, 24)}`;
    deduped.forEach(([name, value], index) => options.push({
      id: stableId("variant-option", variant.merchant_id, variant.id, name), merchant_id: variant.merchant_id,
      product_id: variant.product_id, variant_id: variant.id, option_name: name, normalized_option_name: normalizeKnowledgeText(name),
      option_value: value, normalized_option_value: normalizeKnowledgeText(value), ordinal: index,
    }));
    const key = `${variant.merchant_id}:${variant.product_id}`;
    if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
    variantsByProduct.get(key).push(variant);
    variant.metadata = {};
  }
  for (const [key, productVariants] of variantsByProduct) {
    const product = productByKey.get(key);
    if (!product) continue;
    const total = productVariants.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    if (Number(product.quantity || 0) !== total) addWarning(report, "CATALOG_STOCK_RECONCILED_FROM_VARIANTS", { merchant_id: product.merchant_id, product_id: product.id, previous: product.quantity, reconciled: total });
    product.quantity = total;
    product.variant_stock_mode = true;
  }
  const addIdentifier = (merchantId, kind, value, ownerType, productId, variantId = null) => {
    const display = text(value);
    if (!display) return;
    const normalized = display.toLowerCase();
    const key = `${merchantId}:${kind}:${normalized}`;
    if (identifierKeys.has(key)) { addError(report, "CATALOG_IDENTIFIER_DUPLICATE", { merchant_id: merchantId, kind, normalized_value: normalized }); return; }
    identifierKeys.add(key);
    identifiers.push({ id: stableId("catalog-id", key), merchant_id: merchantId, kind, normalized_value: normalized, display_value: display, owner_type: ownerType, product_id: productId, variant_id: variantId, created_at: "1970-01-01T00:00:00.000Z" });
  };
  for (const product of products) {
    addIdentifier(product.merchant_id, "sku", product.sku, "product", product.id);
    addIdentifier(product.merchant_id, "barcode", product.barcode, "product", product.id);
    const image = text(product.image_url);
    if (image) {
      if (/^https?:\/\//i.test(image)) images.push({ id: stableId("catalog-image", product.merchant_id, product.id, image), merchant_id: product.merchant_id, product_id: product.id, variant_id: null, url: image, storage_key: null, alt_text: product.name || null, ordinal: 0, created_at: safeDate(product.created_at) });
      else if (!image.includes("..") && !/^(data|blob):/i.test(image)) images.push({ id: stableId("catalog-image", product.merchant_id, product.id, image), merchant_id: product.merchant_id, product_id: product.id, variant_id: null, url: null, storage_key: image, alt_text: product.name || null, ordinal: 0, created_at: safeDate(product.created_at) });
      else addError(report, "CATALOG_IMAGE_REFERENCE_UNSAFE", { merchant_id: product.merchant_id, product_id: product.id });
    }
  }
  for (const variant of variants) {
    addIdentifier(variant.merchant_id, "sku", variant.sku, "variant", variant.product_id, variant.id);
    addIdentifier(variant.merchant_id, "barcode", variant.barcode, "variant", variant.product_id, variant.id);
  }
  report.rows.catalog_variant_options = options;
  report.rows.catalog_identifiers = identifiers;
  report.rows.catalog_image_references = images;
  report.rows.catalog_idempotency_keys ||= [];
  report.rows.inventory_mutations ||= [];
}

function reconcileKnowledge(report, dataDirectory) {
  const savedSource = asRecord(readJson(dataDirectory, "saved-answers.json", { answers: [] }));
  const trainingSource = asRecord(readJson(dataDirectory, "training-requests.json", { requests: [] }));
  const learnedSource = asRecord(readJson(dataDirectory, "learned-answers.json", { answers: [] }));
  const saved = [];
  const training = [];
  const learned = [];
  const trainingById = new Map();
  for (const [index, rawValue] of asArray(trainingSource.requests).entries()) {
    const raw = asRecord(rawValue);
    const merchantId = text(raw.merchantId || raw.merchant_id);
    const customerText = String(raw.customerMessage || raw.customer_message || "");
    if (!merchantId || !customerText) continue;
    const id = text(raw.id) || stableId("training", merchantId, index);
    const status = ["pending_merchant_reply", "pending_review", "approved", "rejected"].includes(text(raw.status)) ? text(raw.status) : "pending_merchant_reply";
    const suggested = text(raw.suggestedReply || raw.suggested_reply) || null;
    const row = {
      id, merchant_id: merchantId, customer_text_preview: redactPreview(customerText), customer_text_hash: sha256(customerText),
      customer_text_length: customerText.length, detected_intent: text(raw.detectedIntent || raw.detected_intent) || "unknown",
      detected_language: ALLOWED_KNOWLEDGE_LANGUAGES.has(text(raw.detectedLanguage || raw.detected_language)) ? text(raw.detectedLanguage || raw.detected_language) : "ar",
      reason: text(raw.reason || raw.reason_code) || "legacy_import", suggested_reply: suggested,
      suggested_reply_source: suggested ? "merchant_draft" : null, status,
      rejection_reason: status === "rejected" ? (text(raw.rejectionReason || raw.rejection_reason) || "legacy_rejected") : null,
      reviewed_by_account_id: null, reviewed_at: ["approved", "rejected"].includes(status) ? safeDate(raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at) : null,
      version: positiveInteger(raw.version, 1), created_at: safeDate(raw.createdAt || raw.created_at), updated_at: safeDate(raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at),
    };
    training.push(row);
    trainingById.set(id, row);
  }
  for (const [index, rawValue] of asArray(savedSource.answers).entries()) {
    const raw = asRecord(rawValue);
    const merchantId = text(raw.merchant_id || raw.merchantId);
    const question = text(raw.question_pattern || raw.questionPattern);
    const answer = text(raw.answer_text || raw.answerText);
    if (!merchantId || !question || !answer) continue;
    const id = text(raw.id) || stableId("saved", merchantId, index);
    if (raw.approved === true) {
      saved.push({ id, merchant_id: merchantId, category: text(raw.category) || "custom", question_pattern: question, normalized_question: normalizeKnowledgeText(question), answer_text: answer, language: ALLOWED_KNOWLEDGE_LANGUAGES.has(text(raw.language)) ? text(raw.language) : "ar", source: "merchant_approved", active: raw.active !== false, version: positiveInteger(raw.version, 1), created_at: safeDate(raw.created_at || raw.createdAt), updated_at: safeDate(raw.updated_at || raw.updatedAt || raw.created_at || raw.createdAt) });
    } else {
      learned.push({ id: stableId("legacy-unapproved-saved", merchantId, id), merchant_id: merchantId, training_request_id: null, intent: text(raw.category) || "legacy_saved_answer", language: ALLOWED_KNOWLEDGE_LANGUAGES.has(text(raw.language)) ? text(raw.language) : "ar", examples: [question], keywords: [], answer_text: answer, source: "openai_generated", approval_status: "pending_review", confidence: "0", safe_to_auto_reply: false, version: 1, created_at: safeDate(raw.created_at || raw.createdAt), updated_at: safeDate(raw.updated_at || raw.updatedAt || raw.created_at || raw.createdAt) });
    }
  }
  for (const [index, rawValue] of asArray(learnedSource.answers).entries()) {
    const raw = asRecord(rawValue);
    const merchantId = text(raw.merchantId || raw.merchant_id);
    const answer = text(raw.reply || raw.answerText || raw.answer_text);
    if (!merchantId || !answer) continue;
    const source = raw.source === "merchant_approved" ? "merchant_approved" : "openai_generated";
    const approved = source === "merchant_approved" && raw.safeToAutoReply === true && raw.requiresHumanApproval !== true;
    const trainingId = text(raw.trainingRequestId || raw.training_request_id) || null;
    if (trainingId && (!trainingById.has(trainingId) || trainingById.get(trainingId).merchant_id !== merchantId)) {
      addError(report, "KNOWLEDGE_TRAINING_PROVENANCE_AMBIGUOUS", { merchant_id: merchantId, learned_answer_id: raw.id || null, training_request_id: trainingId });
      continue;
    }
    learned.push({ id: text(raw.id) || stableId("learned", merchantId, index), merchant_id: merchantId, training_request_id: trainingId, intent: text(raw.intent) || "unknown", language: ALLOWED_KNOWLEDGE_LANGUAGES.has(text(raw.language)) ? text(raw.language) : "ar", examples: asArray(raw.examples).slice(0, 20).map(String), keywords: asArray(raw.keywords).slice(0, 24).map(String), answer_text: answer, source, approval_status: approved ? "approved" : "pending_review", confidence: String(Math.min(Math.max(Number(raw.confidence || 0), 0), 1)), safe_to_auto_reply: approved, version: positiveInteger(raw.version, 1), created_at: safeDate(raw.createdAt || raw.created_at), updated_at: safeDate(raw.updatedAt || raw.updated_at || raw.createdAt || raw.created_at) });
  }
  report.rows.saved_answers = saved;
  report.rows.training_requests = training;
  report.rows.learned_answers = learned;
  report.rows.knowledge_audit_events = [];
  report.rows.knowledge_embeddings = [];
}

function ensureNewTables(report) {
  for (const name of [
    "database_admin_access_audits",
    "order_payment_decisions",
    "order_terminal_decision_links",
    "catalog_variant_options",
    "catalog_identifiers",
    "catalog_image_references",
    "catalog_idempotency_keys",
    "inventory_mutations",
    "knowledge_audit_events",
    "knowledge_embeddings",
    "background_job_payloads",
    "channel_inbound_events",
    "reply_reservations",
    "reply_refunds",
    "outbound_deliveries",
    "auth_otp_challenges",
    "auth_audit_events",
  ]) report.rows[name] ||= [];
}

function finalize(report, snapshot, includeRows) {
  report.table_counts = Object.fromEntries(Object.entries(report.rows || {}).filter(([, rows]) => Array.isArray(rows) && rows.length > 0).map(([name, rows]) => [name, rows.length]));
  report.planned_row_count = Object.values(report.table_counts).reduce((sum, count) => sum + Number(count || 0), 0);
  report.tool_version = crossLaneMigrationPlanVersion;
  report.cross_lane_schema_reconciliation = {
    version: 1,
    auth_sessions_migrated: false,
    knowledge_raw_customer_text_persisted: false,
    terminal_orders_require_decision_provenance: true,
    catalog_identifiers_unified: true,
  };
  report.source_manifest_sha256 = sha256(canonicalJson(report.source_files || {}));
  validateAgainstSnapshot(report, snapshot, { removeRows: !includeRows });
  report.write_readiness = { ok: report.errors.length === 0, operational_overlays_supported: true, blockers: report.errors.length === 0 ? [] : report.errors };
  report.summary = { ...(report.summary || {}), errors: report.errors.length, warnings: report.warnings.length, write_readiness_errors: report.errors.length };
  report.ok = report.errors.length === 0;
}

export function buildValidatedMigrationPlan(options) {
  const dataDirectory = path.resolve(options.dataDirectory);
  const base = buildBasePlan({ ...options, dataDirectory, includeRows: true });
  const report = base.report;
  report.rows ||= {};
  clearPreviousSchemaValidation(report);
  const previousLineage = lineageMap(report);
  reconcileIdentity(report);
  reconcileChannelsAndJobs(report);
  reconcileOrders(report, dataDirectory);
  reconcileSettings(report);
  reconcileCatalog(report);
  reconcileKnowledge(report, dataDirectory);
  ensureNewTables(report);
  rebuildLineage(report, previousLineage);
  finalize(report, base.snapshot, options.includeRows === true);
  return { report, snapshot: base.snapshot };
}

export function assertCompleteMigrationWritable(report) {
  if (report?.write_readiness?.ok === true && report?.ok === true) return;
  const blockers = asArray(report?.write_readiness?.blockers);
  const error = new Error(`PostgreSQL write blocked: ${blockers.map((item) => item.code).join(", ")}`);
  error.code = "MIGRATION_WRITE_NOT_READY";
  error.blockers = blockers;
  throw error;
}

export const assertBaseCompleteMigrationWritable = assertBaseWritable;
