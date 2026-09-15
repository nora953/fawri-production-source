import type {
  MerchantAddonExpiryReminderNotification,
  MerchantBalanceNotification,
  MerchantCustomerMessageNotification,
  MerchantEmergencyActivationNotification,
  MerchantInspectionNotification,
  MerchantNewOrderNotification,
  MerchantNotification,
  MerchantOperationalNotification,
  MerchantPaymentConflictNotification,
  MerchantSubscriptionExpiredNotification,
  MerchantSubscriptionExpiryReminderNotification,
  MerchantSubscriptionNotification,
  MerchantSubscriptionPlanNotification,
  MerchantSupportReplyReminderNotification,
} from "@/lib/types";

type WithoutMerchantId<T> = T extends unknown ? Omit<T, "merchant_id"> : never;

export type MerchantNotificationRecord = WithoutMerchantId<MerchantNotification>;
export type MerchantBalanceNotificationRecord = WithoutMerchantId<MerchantBalanceNotification>;
export type MerchantSubscriptionNotificationRecord = WithoutMerchantId<MerchantSubscriptionNotification>;
export type MerchantInspectionNotificationRecord = WithoutMerchantId<MerchantInspectionNotification>;
export type MerchantSupportReplyReminderNotificationRecord = WithoutMerchantId<MerchantSupportReplyReminderNotification>;
export type MerchantOperationalNotificationRecord = WithoutMerchantId<MerchantOperationalNotification>;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dateText(value: unknown): value is string {
  return text(value) && Number.isFinite(new Date(value).getTime());
}

function optionalDateText(value: unknown): boolean {
  return value === undefined || dateText(value);
}

function optionalText(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function plan(value: unknown): boolean {
  return value === "silver" || value === "gold" || value === "diamond" || value === "trial";
}

export function isSafeMerchantNotificationActionUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

function common(record: JsonObject): boolean {
  return (
    text(record.id) &&
    text(record.type) &&
    dateText(record.created_at) &&
    (record.read_at === undefined || dateText(record.read_at))
  );
}

function isBalance(record: JsonObject): record is MerchantBalanceNotificationRecord & JsonObject {
  return (
    record.type === "subscription_balance_purchase" &&
    finiteNumber(record.purchased_replies) &&
    finiteNumber(record.emergency_debt_paid) &&
    finiteNumber(record.addon_replies_added) &&
    finiteNumber(record.emergency_debt_remaining) &&
    finiteNumber(record.base_replies_remaining) &&
    finiteNumber(record.emergency_replies_remaining) &&
    finiteNumber(record.addon_replies_remaining) &&
    finiteNumber(record.total_replies_available) &&
    optionalText(record.addon_batch_id) &&
    optionalDateText(record.addon_batch_expires_at)
  );
}

function isSubscriptionPlan(record: JsonObject): record is WithoutMerchantId<MerchantSubscriptionPlanNotification> & JsonObject {
  return (
    record.type === "subscription_plan_event" &&
    (record.operation === "activate" || record.operation === "change" || record.operation === "renew") &&
    plan(record.plan_name) &&
    (record.previous_plan_name === undefined || plan(record.previous_plan_name)) &&
    dateText(record.start_date) &&
    dateText(record.expires_at) &&
    finiteNumber(record.emergency_debt_paid) &&
    finiteNumber(record.emergency_debt_remaining) &&
    finiteNumber(record.base_replies_remaining) &&
    finiteNumber(record.addon_replies_remaining) &&
    finiteNumber(record.total_replies_available)
  );
}

function isEmergency(record: JsonObject): record is WithoutMerchantId<MerchantEmergencyActivationNotification> & JsonObject {
  return (
    record.type === "subscription_emergency_activated" &&
    text(record.addon_batch_id) &&
    finiteNumber(record.emergency_replies_added) &&
    finiteNumber(record.emergency_debt) &&
    dateText(record.expires_at)
  );
}

function isSubscriptionExpiryReminder(record: JsonObject): record is WithoutMerchantId<MerchantSubscriptionExpiryReminderNotification> & JsonObject {
  return (
    record.type === "subscription_expiry_reminder" &&
    plan(record.plan_name) &&
    dateText(record.expires_at) &&
    finiteNumber(record.days_remaining)
  );
}

function isSubscriptionExpired(record: JsonObject): record is WithoutMerchantId<MerchantSubscriptionExpiredNotification> & JsonObject {
  return (
    record.type === "subscription_expired" &&
    plan(record.plan_name) &&
    dateText(record.expired_at) &&
    finiteNumber(record.addon_replies_remaining)
  );
}

function isAddonExpiryReminder(record: JsonObject): record is WithoutMerchantId<MerchantAddonExpiryReminderNotification> & JsonObject {
  return (
    record.type === "addon_expiry_reminder" &&
    text(record.addon_batch_id) &&
    (record.source === "purchase" || record.source === "emergency") &&
    finiteNumber(record.remaining_replies) &&
    dateText(record.expires_at) &&
    finiteNumber(record.days_remaining)
  );
}

function isInspection(record: JsonObject): record is MerchantInspectionNotificationRecord & JsonObject {
  const status = record.request_status;
  const decision = record.consent_decision;
  const endReason = record.end_reason;
  return (
    record.type === "inspection_session_request" &&
    text(record.ticket_id) &&
    text(record.inspection_request_id) &&
    text(record.ticket_subject) &&
    text(record.admin_name) &&
    (record.mode === "live_observation" || record.mode === "independent_read_only") &&
    dateText(record.request_expires_at) &&
    isSafeMerchantNotificationActionUrl(record.action_url) &&
    (status === "pending" || status === "approved" || status === "rejected" || status === "expired") &&
    (decision === undefined || decision === "approved" || decision === "rejected") &&
    optionalDateText(record.responded_at) &&
    optionalDateText(record.session_expires_at) &&
    optionalDateText(record.ended_at) &&
    (
      endReason === undefined ||
      endReason === "request_timeout" ||
      endReason === "approval_window_expired" ||
      endReason === "ticket_resolved" ||
      endReason === "ticket_closed" ||
      endReason === "merchant_terminated"
    )
  );
}

function isSupportReminder(record: JsonObject): record is MerchantSupportReplyReminderNotificationRecord & JsonObject {
  return (
    record.type === "support_reply_reminder" &&
    text(record.ticket_id) &&
    text(record.ticket_subject) &&
    isSafeMerchantNotificationActionUrl(record.action_url)
  );
}

function isNewOrder(record: JsonObject): record is WithoutMerchantId<MerchantNewOrderNotification> & JsonObject {
  return (
    record.type === "operational_new_order" &&
    text(record.order_id) &&
    optionalText(record.conversation_id) &&
    isSafeMerchantNotificationActionUrl(record.action_url)
  );
}

function isCustomerMessage(record: JsonObject): record is WithoutMerchantId<MerchantCustomerMessageNotification> & JsonObject {
  return (
    record.type === "operational_customer_message" &&
    text(record.conversation_id) &&
    isSafeMerchantNotificationActionUrl(record.action_url)
  );
}

function isPaymentConflict(record: JsonObject): record is WithoutMerchantId<MerchantPaymentConflictNotification> & JsonObject {
  return (
    record.type === "operational_payment_conflict" &&
    text(record.order_id) &&
    optionalText(record.conversation_id) &&
    optionalText(record.provider) &&
    isSafeMerchantNotificationActionUrl(record.action_url)
  );
}

export function isMerchantNotificationRecord(value: unknown): value is MerchantNotificationRecord {
  const record = object(value);
  if (!record || !common(record)) return false;

  return (
    isBalance(record) ||
    isSubscriptionPlan(record) ||
    isEmergency(record) ||
    isSubscriptionExpiryReminder(record) ||
    isSubscriptionExpired(record) ||
    isAddonExpiryReminder(record) ||
    isInspection(record) ||
    isSupportReminder(record) ||
    isNewOrder(record) ||
    isCustomerMessage(record) ||
    isPaymentConflict(record)
  );
}

async function jsonObject(response: Response): Promise<JsonObject> {
  const body = object(await response.json().catch(() => null));
  if (!body) throw new Error("invalid notification authority response");
  return body;
}

export async function readMerchantNotificationsAuthority(): Promise<MerchantNotificationRecord[]> {
  const response = await fetch("/api/auth/notifications?limit=50", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await jsonObject(response);
  if (
    !response.ok ||
    body.ok !== true ||
    !Array.isArray(body.notifications) ||
    !body.notifications.every(isMerchantNotificationRecord)
  ) {
    throw new Error("merchant notification authority unavailable");
  }
  return body.notifications;
}

export async function markMerchantNotificationReadAuthority(
  notificationId: string,
): Promise<MerchantNotificationRecord> {
  const response = await fetch(
    `/api/auth/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );
  const body = await jsonObject(response);
  if (
    !response.ok ||
    body.ok !== true ||
    !isMerchantNotificationRecord(body.notification) ||
    body.notification.id !== notificationId ||
    !dateText(body.notification.read_at)
  ) {
    throw new Error("merchant notification read mutation failed");
  }
  return body.notification;
}
