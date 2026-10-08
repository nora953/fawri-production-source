const text = (value) => String(value ?? "").trim();
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const notificationTypes = new Set([
  "subscription_balance_purchase", "subscription_plan_event", "subscription_emergency_activated",
  "subscription_expiry_reminder", "subscription_expired", "addon_expiry_reminder",
  "inspection_session_request", "support_reply_reminder", "operational_new_order",
  "operational_customer_message", "operational_payment_conflict",
]);
const notificationFields = new Set(("action_url addon_batch_expires_at addon_batch_id addon_replies_added " +
  "addon_replies_remaining admin_name base_replies_remaining days_remaining emergency_debt emergency_debt_paid " +
  "emergency_debt_remaining emergency_replies_added emergency_replies_remaining expires_at inspection_request_id " +
  "mode operation plan_name previous_plan_name purchased_replies read_at request_expires_at start_date ticket_id " +
  "ticket_subject total_replies_available expired_at source remaining_replies order_id conversation_id dedupe_key provider " +
  "id merchant_id type created_at").split(" "));

// Only invoked by the offline planner. No runtime importer, credentials or DB.
export function mergeLegacyAuthHistory(report, auth, mergeRow) {
  const fail = (code, details) => report.errors.push({ code, source: "legacy_auth_history", ...details });
  const list = (key) => {
    if (auth[key] === undefined) return [];
    if (Array.isArray(auth[key])) return auth[key];
    fail("LEGACY_HISTORY_COLLECTION_INVALID", { collection: key });
    return [];
  };
  const notifications = list("merchant_notifications");
  const logs = list("admin_logs");
  const otps = list("otps");
  const merchants = new Map((report.rows.merchants || []).map((r) => [r.id, r]));
  const admins = new Set((report.rows.admin_profiles || []).map((r) => r.account_id));
  const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  const valid = (row, collection, fields) => {
    if (!record(row) || fields.some((field) => !text(row[field])) || !validDate(row.created_at)) {
      fail("LEGACY_HISTORY_RECORD_INVALID", { collection, record_id: text(row?.id) });
      return false;
    }
    return true;
  };
  for (const source of notifications) {
    if (!valid(source, "merchant_notifications", ["id", "merchant_id", "type"])) continue;
    if (!notificationTypes.has(source.type) || Object.keys(source).some((key) => !notificationFields.has(key)) ||
        Object.values(source).some((v) => v !== null && !["string", "number", "boolean"].includes(typeof v)) ||
        (source.read_at && !validDate(source.read_at))) {
      fail("LEGACY_NOTIFICATION_UNSUPPORTED", { record_id: source.id });
      continue;
    }
    const merchant = merchants.get(source.merchant_id);
    if (!merchant) {
      fail("LEGACY_NOTIFICATION_MERCHANT_MISSING", { record_id: source.id });
      continue;
    }
    const { id, merchant_id, type, created_at, read_at, ...variables } = source;
    const sourceType = source.inspection_request_id ? "support_inspection_request" : source.ticket_id ? "support_ticket" :
      source.order_id ? "order" : source.conversation_id ? "conversation" : null;
    mergeRow(report, "notifications", {
      id, audience: "merchant", merchant_id, account_id: merchant.account_id,
      type, title_key: `notifications.${type}.title`, body_key: `notifications.${type}.body`, variables,
      source_entity_type: sourceType,
      source_entity_id: source.inspection_request_id || source.ticket_id || source.order_id || source.conversation_id || null,
      read_at: read_at || null,
      // Legacy expires_at describes a subscription/batch, not notification TTL.
      expires_at: null, created_at,
    }, "auth", source);
  }
  for (const source of logs) {
    if (!valid(source, "admin_logs", ["id", "action_type"])) continue;
    const fields = new Set(["id", "admin_id", "admin_name", "admin_phone", "admin_role", "merchant_id", "merchant_name", "action_type", "reason", "details", "meta", "created_at"]);
    if (Object.entries(source).some(([key, value]) => !fields.has(key) ||
        (value != null && (key === "meta" ? !record(value) : typeof value !== "string")))) {
      fail("LEGACY_ADMIN_LOG_UNSUPPORTED", { record_id: source.id });
      continue;
    }
    const actorId = text(source.admin_id);
    const merchantId = text(source.merchant_id);
    mergeRow(report, "audit_events", {
      id: text(source.id), actor_kind: actorId ? "account" : "system",
      actor_account_id: admins.has(actorId) ? actorId : null,
      merchant_id: merchants.has(merchantId) ? merchantId : null,
      action_type: text(source.action_type), entity_type: "merchant", entity_id: merchantId || null,
      reason_code: source.reason == null ? null : String(source.reason),
      details: source.details == null ? null : String(source.details),
      metadata: {
        legacy_import: true, source_admin_id: actorId,
        source_admin_name: String(source.admin_name ?? ""), source_admin_phone: String(source.admin_phone ?? ""),
        source_admin_role: String(source.admin_role ?? ""), merchant_id_snapshot: merchantId,
        merchant_name_snapshot: String(source.merchant_name ?? ""), source_meta: source.meta ?? {},
      },
      previous_hash: null, event_hash: null, created_at: source.created_at,
    }, "auth", source);
  }
  const notes = auth.admin_notes === undefined ? {} : auth.admin_notes;
  if (!record(notes)) fail("LEGACY_HISTORY_COLLECTION_INVALID", { collection: "admin_notes" });
  else for (const [merchantId, note] of Object.entries(notes)) {
    if (typeof note !== "string" || [...note].length > 5000 || !merchants.has(merchantId)) {
      fail("LEGACY_ADMIN_NOTE_INVALID", { merchant_id: merchantId });
      continue;
    }
    const merchant = merchants.get(merchantId);
    const timestamp = merchant.updated_at || merchant.created_at || "1970-01-01T00:00:00.000Z";
    mergeRow(report, "merchant_admin_notes", {
      merchant_id: merchantId, note, updated_by_admin_id: null, created_at: timestamp, updated_at: timestamp,
    }, "auth", { merchant_id: merchantId, note });
  }
  report.legacy_auth_history = {
    merchant_notifications: notifications.length, admin_logs: logs.length,
    admin_notes: record(notes) ? Object.keys(notes).length : 0,
    security_exclusions: { otps: { count: otps.length, reason: "Legacy OTP challenges never become current authentication authority" } },
    note_timestamp_policy: "merchant_timestamp_fallback_not_historical_authorship",
  };
}
