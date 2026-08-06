import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(
  process.argv[2] ||
    process.env.FAWRI_DATA_DIR ||
    path.join("artifacts", "api-server", "data"),
);

const FILES = {
  auth: "merchants.json",
  runtime: "bot-runtime.json",
  savedAnswers: "saved-answers.json",
  trainingRequests: "training-requests.json",
  learnedAnswers: "learned-answers.json",
  supportPreview: "support-preview-sessions.json",
  emergency: "emergency-read-access.json",
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? "").trim();
const now = () => new Date().toISOString();

function readJson(fileName) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return { exists: false, value: {} };
  const raw = fs.readFileSync(filePath);
  return {
    exists: true,
    bytes: raw.length,
    sha256: crypto.createHash("sha256").update(raw).digest("hex"),
    value: JSON.parse(raw.toString("utf8")),
  };
}

function rowId(prefix, legacyId, index) {
  return text(legacyId) || `${prefix}-${String(index + 1).padStart(6, "0")}`;
}

function normalizeLanguage(value) {
  return ["ar", "ku", "en"].includes(text(value)) ? text(value) : "ar";
}

function normalizeAccountState(record) {
  if (record?.status === "suspended") return "suspended";
  return "active";
}

function mapAccount(record, index) {
  return {
    id: rowId("account", record?.id, index),
    kind: record?.is_admin === true ? "admin" : "merchant",
    phone: text(record?.phone),
    password_hash: text(record?.password_hash || record?.password),
    state: normalizeAccountState(record),
    language: normalizeLanguage(record?.language),
    phone_verified: record?.otp_verified === true,
    phone_verified_at: record?.phone_verified_at || null,
    session_version: Number(record?.admin_session_version || 1),
    suspended_at: record?.suspended_at || record?.retention_suspended_at || null,
    created_at: record?.created_at || null,
    updated_at: record?.updated_at || record?.created_at || null,
    metadata: { legacy: record },
  };
}

function mapMerchant(record, accountId) {
  return {
    id: accountId,
    owner_name: text(record?.owner_name),
    store_name: text(record?.store_name),
    activity_type: text(record?.activity_type),
    status: text(record?.status) || "pending_activation",
    account_status: text(record?.account_status) || "pending_review",
    onboarding_status: text(record?.onboarding_status) || "pending_review",
    trial_status: text(record?.trial_status) || "eligible",
    signup_source: text(record?.signup_source) || "direct",
    requested_plan: text(record?.requested_plan) || null,
    approved_at: record?.approved_at || null,
    first_channel_connected_at: record?.first_channel_connected_at || null,
    channel_activation_deadline: record?.channel_activation_deadline || null,
    trial_started_at: record?.trial_started_at || null,
    trial_expires_at: record?.trial_expires_at || null,
    last_subscription_ended_at: record?.last_subscription_ended_at || null,
    retention_status: text(record?.retention_status) || null,
    warning_stage: Number(record?.warning_stage || 0),
    grace_period_ends_at: record?.grace_period_ends_at || null,
    eligible_for_deletion_at: record?.eligible_for_deletion_at || null,
    metadata: { legacy: record },
  };
}

function mapAdminProfile(record, accountId) {
  return {
    account_id: accountId,
    role: text(record?.admin_role) || "assistant_admin",
    enabled: record?.admin_enabled !== false,
    must_change_password: record?.must_change_password === true,
    created_at: record?.created_at || null,
    updated_at: record?.updated_at || record?.created_at || null,
  };
}

function planMigration() {
  const sources = Object.fromEntries(
    Object.entries(FILES).map(([key, fileName]) => [key, readJson(fileName)]),
  );
  const auth = sources.auth.value || {};
  const runtime = sources.runtime.value || {};
  const rows = Object.fromEntries(
    [
      "accounts",
      "merchants",
      "admin_profiles",
      "admin_permissions",
      "subscriptions",
      "products",
      "conversations",
      "orders",
      "order_drafts",
      "merchant_channels",
      "saved_answers",
      "training_requests",
      "learned_answers",
      "support_tickets",
      "support_messages",
      "support_inspection_requests",
      "support_preview_sessions",
      "emergency_authorizations",
      "emergency_access_requests",
      "emergency_owner_alerts",
      "emergency_merchant_notices",
      "audit_events",
    ].map((name) => [name, []]),
  );
  const errors = [];
  const warnings = [];

  const legacyAccounts = asArray(auth.merchants);
  const accountIds = new Set();
  const merchantIds = new Set();

  legacyAccounts.forEach((record, index) => {
    const account = mapAccount(record, index);
    if (!account.id || accountIds.has(account.id)) {
      errors.push({ code: "DUPLICATE_ACCOUNT_ID", id: account.id });
      return;
    }
    if (!account.phone) warnings.push({ code: "ACCOUNT_PHONE_MISSING", id: account.id });
    if (!account.password_hash) warnings.push({ code: "PASSWORD_HASH_MISSING", id: account.id });
    accountIds.add(account.id);
    rows.accounts.push(account);

    if (account.kind === "admin") {
      rows.admin_profiles.push(mapAdminProfile(record, account.id));
      for (const permission of asArray(record?.permissions)) {
        rows.admin_permissions.push({
          admin_id: account.id,
          permission: text(permission),
          granted_at: record?.updated_at || record?.created_at || null,
          granted_by_admin_id: null,
        });
      }
    } else {
      merchantIds.add(account.id);
      rows.merchants.push(mapMerchant(record, account.id));
    }
  });

  asArray(auth.subscriptions).forEach((item, index) => {
    const merchantId = text(item?.merchant_id);
    if (!merchantIds.has(merchantId)) {
      errors.push({ code: "ORPHAN_SUBSCRIPTION", merchant_id: merchantId });
    }
    rows.subscriptions.push({
      id: rowId("subscription", item?.id, index),
      merchant_id: merchantId,
      plan_name: text(item?.plan_name || item?.plan) || "silver",
      status: text(item?.status) || "pending_activation",
      price_iqd: Number(item?.price_iqd || 0),
      billing_anchor_day: Number(item?.billing_anchor_day || 1),
      base_reply_limit: Number(item?.base_reply_limit || item?.reply_limit || 0),
      base_replies_used: Number(item?.base_replies_used || item?.replies_used || 0),
      base_replies_remaining: Number(item?.base_replies_remaining || 0),
      addon_replies_remaining: Number(item?.addon_replies_remaining || 0),
      emergency_credit_amount: Number(item?.emergency_credit_amount || 0),
      emergency_credit_activated: item?.emergency_credit_activated === true,
      emergency_debt: Number(item?.emergency_debt || 0),
      auto_reply_enabled: item?.auto_reply_enabled === true,
      starts_at: item?.starts_at || item?.activated_at || null,
      expires_at: item?.expires_at || null,
      activated_at: item?.activated_at || null,
      metadata: { legacy: item },
    });
  });

  const mapMerchantScoped = (source, target, mapper) => {
    asArray(source).forEach((item, index) => {
      const merchantId = text(item?.merchant_id || item?.merchantId);
      if (merchantId && !merchantIds.has(merchantId)) {
        errors.push({ code: "ORPHAN_MERCHANT_REFERENCE", table: target, merchant_id: merchantId, id: item?.id });
      }
      rows[target].push(mapper(item, index, merchantId));
    });
  };

  mapMerchantScoped(runtime.products, "products", (item, index, merchantId) => ({
    id: rowId("product", item?.id, index), merchant_id: merchantId,
    name: text(item?.name), description: text(item?.description) || null,
    price_iqd: Number(item?.price_iqd || item?.price || 0), active: item?.active !== false,
    metadata: { legacy: item },
  }));
  mapMerchantScoped(runtime.conversations, "conversations", (item, index, merchantId) => ({
    id: rowId("conversation", item?.id, index), merchant_id: merchantId,
    external_conversation_id: text(item?.external_conversation_id) || null,
    customer_external_id: text(item?.customer_external_id || item?.customerId),
    customer_name: text(item?.customer_name) || null,
    status: text(item?.status) || "auto_replying", metadata: { legacy: item },
  }));
  mapMerchantScoped(runtime.orders, "orders", (item, index, merchantId) => ({
    id: rowId("order", item?.id, index), merchant_id: merchantId,
    conversation_id: text(item?.conversation_id) || null,
    customer_name: text(item?.customer_name), customer_phone: text(item?.customer_phone) || null,
    customer_address: text(item?.customer_address) || null,
    status: text(item?.status) || "pending_confirmation",
    payment_method: text(item?.payment_method) || "cash_on_delivery",
    payment_status: text(item?.payment_status) || "cash_on_delivery",
    total_iqd: Number(item?.total_iqd || item?.total || 0),
    source_channel: text(item?.source_channel || item?.channel) || "unknown",
    metadata: { legacy: item },
  }));
  mapMerchantScoped(runtime.orderDrafts || runtime.order_drafts, "order_drafts", (item, index, merchantId) => ({
    id: rowId("order-draft", item?.id, index), merchant_id: merchantId,
    conversation_id: text(item?.conversation_id), customer_external_id: text(item?.customer_external_id),
    awaiting_field: text(item?.awaiting_field), draft_data: item?.draft_data || item,
    expires_at: item?.expires_at || null,
  }));
  mapMerchantScoped(runtime.metaPages || runtime.meta_pages, "merchant_channels", (item, index, merchantId) => ({
    id: rowId("channel", item?.id, index), merchant_id: merchantId,
    platform: text(item?.platform) || "messenger", status: text(item?.status) || "connected",
    external_account_id: text(item?.page_id || item?.external_account_id),
    display_name: text(item?.page_name || item?.display_name) || null,
    metadata: { legacy: item },
  }));

  mapMerchantScoped(sources.savedAnswers.value?.answers, "saved_answers", (item, index, merchantId) => ({
    id: rowId("saved-answer", item?.id, index), merchant_id: merchantId,
    category: text(item?.category) || "custom", question_pattern: text(item?.question_pattern),
    normalized_question_pattern: text(item?.question_pattern).toLowerCase(),
    answer_text: text(item?.answer_text), product_id: text(item?.product_id) || null,
    language: normalizeLanguage(item?.language), approved: item?.approved !== false, active: item?.active !== false,
    metadata: { legacy: item },
  }));
  mapMerchantScoped(sources.trainingRequests.value?.requests, "training_requests", (item, index, merchantId) => ({
    id: rowId("training", item?.id, index), merchant_id: merchantId,
    customer_external_id: text(item?.customerId) || null, customer_message: text(item?.customerMessage),
    normalized_message: text(item?.normalizedMessage), detected_intent: text(item?.detectedIntent),
    detected_language: text(item?.detectedLanguage), reason_code: text(item?.reason),
    suggested_reply: item?.suggestedReply || null, status: text(item?.status) || "pending_merchant_reply",
    metadata: { legacy: item },
  }));
  mapMerchantScoped(sources.learnedAnswers.value?.answers, "learned_answers", (item, index, merchantId) => ({
    id: rowId("learned", item?.id, index), merchant_id: merchantId,
    training_request_id: text(item?.trainingRequestId) || null, intent: text(item?.intent),
    language: text(item?.language), examples: asArray(item?.examples), keywords: asArray(item?.keywords),
    reply: text(item?.reply), source: text(item?.source) || "merchant_approved",
    confidence: Number(item?.confidence || 0), safe_to_auto_reply: item?.safeToAutoReply === true,
    requires_human_approval: item?.requiresHumanApproval !== false, conditions: item?.conditions || {},
  }));

  asArray(auth.support_tickets).forEach((ticket, ticketIndex) => {
    const merchantId = text(ticket?.merchant_id);
    rows.support_tickets.push({
      id: rowId("support-ticket", ticket?.id, ticketIndex), merchant_id: merchantId,
      subject: text(ticket?.subject), category: text(ticket?.category),
      status: text(ticket?.status) || "open", assigned_admin_account_id: text(ticket?.assigned_admin_id) || null,
      waiting_on: text(ticket?.waiting_on) || null, metadata: { legacy: ticket },
    });
    asArray(ticket?.messages).forEach((message, messageIndex) => {
      rows.support_messages.push({
        id: rowId(`support-message-${ticketIndex + 1}`, message?.id, messageIndex),
        ticket_id: rowId("support-ticket", ticket?.id, ticketIndex), merchant_id: merchantId,
        sender_type: text(message?.sender_type) || "system", sender_account_id: text(message?.sender_id) || null,
        sender_name_snapshot: text(message?.sender_name), body: text(message?.body), created_at: message?.created_at || null,
      });
    });
    asArray(ticket?.inspection_requests).forEach((request, requestIndex) => {
      rows.support_inspection_requests.push({
        id: rowId(`inspection-${ticketIndex + 1}`, request?.id, requestIndex),
        ticket_id: rowId("support-ticket", ticket?.id, ticketIndex), merchant_id: merchantId,
        admin_account_id: text(request?.admin_id), mode: text(request?.mode) || "independent_read_only",
        reason: text(request?.reason), status: text(request?.status) || "pending",
        consent_decision: text(request?.consent_decision) || null,
        request_expires_at: request?.request_expires_at || null, metadata: { legacy: request },
      });
    });
  });

  asArray(sources.supportPreview.value?.sessions).forEach((item, index) => {
    rows.support_preview_sessions.push({
      id: rowId("support-preview", item?.id, index), request_id: text(item?.request_id),
      ticket_id: text(item?.ticket_id), merchant_id: text(item?.merchant_id),
      admin_account_id: text(item?.admin_id), status: text(item?.status) || "active",
      started_at: item?.started_at || null, expires_at: item?.expires_at || null,
      last_seen_at: item?.last_seen_at || null, ended_at: item?.ended_at || null,
      end_reason: text(item?.end_reason) || null, viewed_sections: asArray(item?.viewed_sections),
    });
  });

  const emergency = sources.emergency.value || {};
  asArray(emergency.authorizations).forEach((item) => rows.emergency_authorizations.push({
    admin_account_id: text(item?.admin_id), can_request: item?.can_request === true,
    can_critical_self_activate: item?.can_critical_self_activate === true,
    granted_by_owner_account_id: text(item?.granted_by_owner_id),
    granted_at: item?.granted_at || null, updated_at: item?.updated_at || null, revoked_at: item?.revoked_at || null,
  }));
  mapMerchantScoped(emergency.requests, "emergency_access_requests", (item, index, merchantId) => ({
    id: rowId("emergency-request", item?.id, index), merchant_id: merchantId,
    requested_by_admin_account_id: text(item?.requested_by_admin_id), incident_reference: text(item?.incident_reference),
    severity: text(item?.severity), reason: text(item?.reason), duration_minutes: Number(item?.duration_minutes || 15),
    status: text(item?.status) || "pending", activation_mode: text(item?.activation_mode) || "owner_approval",
    metadata: { legacy: item },
  }));
  asArray(emergency.owner_alerts).forEach((item, index) => rows.emergency_owner_alerts.push({
    id: rowId("emergency-alert", item?.id, index), request_id: text(item?.request_id), type: text(item?.type),
    title_key: "emergency.owner_alert", details: { legacy_title: item?.title, legacy_details: item?.details },
    read_at: item?.read_at || null, created_at: item?.created_at || null,
  }));
  mapMerchantScoped(emergency.merchant_notices, "emergency_merchant_notices", (item, index, merchantId) => ({
    id: rowId("emergency-notice", item?.id, index), request_id: text(item?.request_id), merchant_id: merchantId,
    incident_reference: text(item?.incident_reference), activation_mode: text(item?.activation_mode),
    started_at: item?.started_at || null, ended_at: item?.ended_at || null,
    read_at: item?.read_at || null, created_at: item?.created_at || null,
  }));
  asArray(emergency.audit_events).forEach((item, index) => rows.audit_events.push({
    id: rowId("audit", item?.id, index), actor_kind: item?.actor_admin_id ? "account" : "system",
    actor_account_id: text(item?.actor_admin_id) || null, merchant_id: text(item?.merchant_id) || null,
    action_type: text(item?.event_type), entity_type: "emergency_access_request",
    entity_id: text(item?.request_id) || null, metadata: item?.metadata || {},
    previous_hash: text(item?.previous_hash) || null, event_hash: text(item?.hash) || null,
    created_at: item?.created_at || null,
  }));

  const tableCounts = Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, values.length]));
  return {
    ok: errors.length === 0,
    mode: "dry_run",
    writes_performed: false,
    database_connection_used: false,
    generated_at: now(),
    data_dir: dataDir,
    source_files: Object.fromEntries(
      Object.entries(sources).map(([key, source]) => [key, {
        file: FILES[key], exists: source.exists, bytes: source.bytes || 0, sha256: source.sha256 || null,
      }]),
    ),
    summary: { tables: Object.keys(rows).length, planned_rows: Object.values(tableCounts).reduce((a, b) => a + b, 0), errors: errors.length, warnings: warnings.length },
    table_counts: tableCounts,
    errors,
    warnings,
  };
}

try {
  const report = planMigration();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, mode: "dry_run", writes_performed: false, fatal_error: String(error) }, null, 2)}\n`);
  process.exitCode = 1;
}
