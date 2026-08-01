from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    file_path.write_text(text.replace(old, new, 1))


def replace_all_exact(path: str, replacements: list[tuple[str, str, str]]) -> None:
    for old, new, label in replacements:
        replace_once(path, old, new, label)


AUTH = "artifacts/api-server/src/routes/auth.ts"
TYPES = "artifacts/fawri/src/lib/types.ts"
NOTIFICATIONS = "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx"
SUBSCRIPTION_CARD = "artifacts/fawri/src/components/SubscriptionCard.tsx"
TEST = "artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs"

replace_all_exact(
    AUTH,
    [
        (
            '''type AddonReplyBatch = {
  id: string;
  source: "purchase" | "emergency";
  purchased_at: string;
  expires_at: string;
  amount: number;
  remaining: number;
};''',
            '''type AddonReplyBatch = {
  id: string;
  source: "purchase" | "emergency";
  purchased_at: string;
  expires_at: string;
  amount: number;
  remaining: number;
  expiry_reminder_sent_at?: string;
};''',
            "backend addon reminder field",
        ),
        (
            '''  emergency_debt: number;
  pending_next_cycle_deduction: number;
};''',
            '''  emergency_debt: number;
  pending_next_cycle_deduction: number;
  expiry_reminder_sent_at?: string;
  expired_notification_sent_at?: string;
};''',
            "backend subscription reminder fields",
        ),
        (
            '''      const id = String(record.id || "").trim();
      const source = record.source === "emergency" ? "emergency" : "purchase";

      if (''',
            '''      const id = String(record.id || "").trim();
      const source = record.source === "emergency" ? "emergency" : "purchase";
      const expiryReminderSentAt =
        typeof record.expiry_reminder_sent_at === "string" &&
        record.expiry_reminder_sent_at.trim()
          ? record.expiry_reminder_sent_at
          : undefined;

      if (''',
            "normalize addon reminder timestamp",
        ),
        (
            '''      return {
        id,
        source,
        purchased_at: purchasedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        amount,
        remaining,
      };''',
            '''      return {
        id,
        source,
        purchased_at: purchasedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        amount,
        remaining,
        ...(expiryReminderSentAt
          ? { expiry_reminder_sent_at: expiryReminderSentAt }
          : {}),
      };''',
            "preserve addon reminder timestamp",
        ),
        (
            '''function purchaseAdditionalReplies(
  subscription: SubscriptionRecord,
  amount: number,
  purchasedAt: Date = new Date(),
): { debtPaid: number; addonAdded: number } {
  const debtPaid = Math.min(subscription.emergency_debt, amount);
  subscription.emergency_debt -= debtPaid;
  subscription.pending_next_cycle_deduction = subscription.emergency_debt;
  const addonAdded = amount - debtPaid;

  if (addonAdded > 0) {
    const anchorDay = getBaghdadDateParts(purchasedAt).day;
    subscription.addon_reply_batches.push({
      id: makeId("addon-replies"),
      source: "purchase",
      purchased_at: purchasedAt.toISOString(),
      expires_at: addBaghdadCalendarMonths(purchasedAt, 3, anchorDay).toISOString(),
      amount: addonAdded,
      remaining: addonAdded,
    });
  }

  recalculateSubscriptionTotals(subscription, purchasedAt);
  return { debtPaid, addonAdded };
}''',
            '''function purchaseAdditionalReplies(
  subscription: SubscriptionRecord,
  amount: number,
  purchasedAt: Date = new Date(),
): {
  debtPaid: number;
  addonAdded: number;
  addonBatch?: AddonReplyBatch;
} {
  const debtPaid = Math.min(subscription.emergency_debt, amount);
  subscription.emergency_debt -= debtPaid;
  subscription.pending_next_cycle_deduction = subscription.emergency_debt;
  const addonAdded = amount - debtPaid;
  let addonBatch: AddonReplyBatch | undefined;

  if (addonAdded > 0) {
    const anchorDay = getBaghdadDateParts(purchasedAt).day;
    addonBatch = {
      id: makeId("addon-replies"),
      source: "purchase",
      purchased_at: purchasedAt.toISOString(),
      expires_at: addBaghdadCalendarMonths(
        purchasedAt,
        3,
        anchorDay,
      ).toISOString(),
      amount: addonAdded,
      remaining: addonAdded,
    };
    subscription.addon_reply_batches.push(addonBatch);
  }

  recalculateSubscriptionTotals(subscription, purchasedAt);
  return { debtPaid, addonAdded, addonBatch };
}''',
            "return purchased addon batch",
        ),
        (
            '''type MerchantBalanceNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_balance_purchase";
  purchased_replies: number;
  emergency_debt_paid: number;
  addon_replies_added: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  emergency_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
};''',
            '''type MerchantBalanceNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_balance_purchase";
  purchased_replies: number;
  emergency_debt_paid: number;
  addon_replies_added: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  emergency_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  addon_batch_id?: string;
  addon_batch_expires_at?: string;
  created_at: string;
  read_at?: string;
};

type MerchantSubscriptionPlanNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_plan_event";
  operation: "activate" | "change" | "renew";
  plan_name: SubscriptionPlan;
  previous_plan_name?: SubscriptionPlan;
  start_date: string;
  expires_at: string;
  emergency_debt_paid: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
};

type MerchantEmergencyActivationNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_emergency_activated";
  addon_batch_id: string;
  emergency_replies_added: number;
  emergency_debt: number;
  expires_at: string;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
};

type MerchantSubscriptionExpiryReminderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_expiry_reminder";
  plan_name: SubscriptionPlan;
  expires_at: string;
  days_remaining: number;
  created_at: string;
  read_at?: string;
};

type MerchantSubscriptionExpiredNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "subscription_expired";
  plan_name: SubscriptionPlan;
  expired_at: string;
  addon_replies_remaining: number;
  created_at: string;
  read_at?: string;
};

type MerchantAddonExpiryReminderNotificationRecord = {
  id: string;
  merchant_id: string;
  type: "addon_expiry_reminder";
  addon_batch_id: string;
  source: "purchase" | "emergency";
  remaining_replies: number;
  expires_at: string;
  days_remaining: number;
  created_at: string;
  read_at?: string;
};''',
            "backend subscription notification records",
        ),
        (
            '''type MerchantNotificationRecord =
  | MerchantBalanceNotificationRecord
  | MerchantInspectionNotificationRecord
  | MerchantSupportReplyReminderNotificationRecord;''',
            '''type MerchantNotificationRecord =
  | MerchantBalanceNotificationRecord
  | MerchantSubscriptionPlanNotificationRecord
  | MerchantEmergencyActivationNotificationRecord
  | MerchantSubscriptionExpiryReminderNotificationRecord
  | MerchantSubscriptionExpiredNotificationRecord
  | MerchantAddonExpiryReminderNotificationRecord
  | MerchantInspectionNotificationRecord
  | MerchantSupportReplyReminderNotificationRecord;''',
            "backend notification union",
        ),
        (
            '''  if (item.type === "subscription_balance_purchase") return true;

  if (item.type === "support_reply_reminder") {''',
            '''  if (item.type === "subscription_balance_purchase") return true;

  if (item.type === "subscription_plan_event") {
    return (
      (item.operation === "activate" ||
        item.operation === "change" ||
        item.operation === "renew") &&
      isSubscriptionPlan(item.plan_name) &&
      typeof item.start_date === "string" &&
      typeof item.expires_at === "string" &&
      typeof item.emergency_debt_paid === "number" &&
      typeof item.emergency_debt_remaining === "number"
    );
  }

  if (item.type === "subscription_emergency_activated") {
    return (
      typeof item.addon_batch_id === "string" &&
      typeof item.emergency_replies_added === "number" &&
      typeof item.emergency_debt === "number" &&
      typeof item.expires_at === "string"
    );
  }

  if (item.type === "subscription_expiry_reminder") {
    return (
      isSubscriptionPlan(item.plan_name) &&
      typeof item.expires_at === "string" &&
      typeof item.days_remaining === "number"
    );
  }

  if (item.type === "subscription_expired") {
    return (
      isSubscriptionPlan(item.plan_name) &&
      typeof item.expired_at === "string" &&
      typeof item.addon_replies_remaining === "number"
    );
  }

  if (item.type === "addon_expiry_reminder") {
    return (
      typeof item.addon_batch_id === "string" &&
      (item.source === "purchase" || item.source === "emergency") &&
      typeof item.remaining_replies === "number" &&
      typeof item.expires_at === "string" &&
      typeof item.days_remaining === "number"
    );
  }

  if (item.type === "support_reply_reminder") {''',
            "backend notification validation",
        ),
        (
            '''const SUPPORT_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;''',
            '''const SUPPORT_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;
const SUBSCRIPTION_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_EXPIRY_REMINDER_DAYS = 7;
const ADDON_EXPIRY_REMINDER_DAYS = 10;''',
            "subscription lifecycle constants",
        ),
        (
            '''    emergency_debt: emergencyDebt,
    pending_next_cycle_deduction: emergencyDebt,
  });''',
            '''    emergency_debt: emergencyDebt,
    pending_next_cycle_deduction: emergencyDebt,
    ...(typeof record.expiry_reminder_sent_at === "string" &&
    record.expiry_reminder_sent_at.trim()
      ? { expiry_reminder_sent_at: record.expiry_reminder_sent_at }
      : {}),
    ...(typeof record.expired_notification_sent_at === "string" &&
    record.expired_notification_sent_at.trim()
      ? {
          expired_notification_sent_at:
            record.expired_notification_sent_at,
        }
      : {}),
  });''',
            "preserve subscription reminder timestamps",
        ),
    ],
)

replace_once(
    AUTH,
    '''function appendMerchantBalanceNotification(
  db: AuthDb,
  merchantId: string,
  purchasedReplies: number,
  purchase: { debtPaid: number; addonAdded: number },
  subscription: SubscriptionRecord,
): MerchantBalanceNotificationRecord {
  const notification: MerchantBalanceNotificationRecord = {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "subscription_balance_purchase",
    purchased_replies: purchasedReplies,
    emergency_debt_paid: purchase.debtPaid,
    addon_replies_added: purchase.addonAdded,
    emergency_debt_remaining: subscription.emergency_debt,
    base_replies_remaining: subscription.base_replies_remaining,
    emergency_replies_remaining: subscription.emergency_credit_remaining,
    addon_replies_remaining: subscription.addon_replies_remaining,
    total_replies_available: subscription.replies_remaining,
    created_at: now(),
  };

  db.merchant_notifications.unshift(notification);
  const merchantNotificationIds = db.merchant_notifications
    .filter((item) => item.merchant_id === merchantId)
    .slice(100)
    .map((item) => item.id);
  if (merchantNotificationIds.length > 0) {
    const expiredIds = new Set(merchantNotificationIds);
    db.merchant_notifications = db.merchant_notifications.filter(
      (item) => !expiredIds.has(item.id),
    );
  }

  return notification;
}

''',
    '''function appendMerchantNotificationRecord<
  T extends MerchantNotificationRecord,
>(db: AuthDb, notification: T): T {
  db.merchant_notifications.unshift(notification);
  const merchantNotificationIds = db.merchant_notifications
    .filter((item) => item.merchant_id === notification.merchant_id)
    .slice(100)
    .map((item) => item.id);
  if (merchantNotificationIds.length > 0) {
    const expiredIds = new Set(merchantNotificationIds);
    db.merchant_notifications = db.merchant_notifications.filter(
      (item) => !expiredIds.has(item.id),
    );
  }
  return notification;
}

function appendMerchantBalanceNotification(
  db: AuthDb,
  merchantId: string,
  purchasedReplies: number,
  purchase: {
    debtPaid: number;
    addonAdded: number;
    addonBatch?: AddonReplyBatch;
  },
  subscription: SubscriptionRecord,
): MerchantBalanceNotificationRecord {
  return appendMerchantNotificationRecord(db, {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "subscription_balance_purchase",
    purchased_replies: purchasedReplies,
    emergency_debt_paid: purchase.debtPaid,
    addon_replies_added: purchase.addonAdded,
    emergency_debt_remaining: subscription.emergency_debt,
    base_replies_remaining: subscription.base_replies_remaining,
    emergency_replies_remaining: subscription.emergency_credit_remaining,
    addon_replies_remaining: subscription.addon_replies_remaining,
    total_replies_available: subscription.replies_remaining,
    ...(purchase.addonBatch
      ? {
          addon_batch_id: purchase.addonBatch.id,
          addon_batch_expires_at: purchase.addonBatch.expires_at,
        }
      : {}),
    created_at: now(),
  });
}

function appendMerchantSubscriptionPlanNotification(
  db: AuthDb,
  merchantId: string,
  operation: "activate" | "change" | "renew",
  subscription: SubscriptionRecord,
  previousPlanName: SubscriptionPlan | undefined,
  emergencyDebtPaid: number,
): MerchantSubscriptionPlanNotificationRecord {
  return appendMerchantNotificationRecord(db, {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "subscription_plan_event",
    operation,
    plan_name: subscription.plan_name,
    ...(operation === "change" && previousPlanName
      ? { previous_plan_name: previousPlanName }
      : {}),
    start_date: subscription.start_date,
    expires_at: subscription.expires_at,
    emergency_debt_paid: emergencyDebtPaid,
    emergency_debt_remaining: subscription.emergency_debt,
    base_replies_remaining: subscription.base_replies_remaining,
    addon_replies_remaining: subscription.addon_replies_remaining,
    total_replies_available: subscription.replies_remaining,
    created_at: now(),
  });
}

function appendMerchantEmergencyActivationNotification(
  db: AuthDb,
  merchantId: string,
  batch: AddonReplyBatch,
  subscription: SubscriptionRecord,
): MerchantEmergencyActivationNotificationRecord {
  return appendMerchantNotificationRecord(db, {
    id: makeId("merchant-notification"),
    merchant_id: merchantId,
    type: "subscription_emergency_activated",
    addon_batch_id: batch.id,
    emergency_replies_added: batch.amount,
    emergency_debt: subscription.emergency_debt,
    expires_at: batch.expires_at,
    base_replies_remaining: subscription.base_replies_remaining,
    addon_replies_remaining: subscription.addon_replies_remaining,
    total_replies_available: subscription.replies_remaining,
    created_at: now(),
  });
}

''',
    "backend notification append helpers",
)

replace_once(
    AUTH,
    '''function refreshAndPersistSupportLifecycle(db: AuthDb): boolean {
  const lifecycle = refreshSupportTicketLifecycle(db);
  const inspectionChanged = refreshInspectionRequestExpirations(db);
  if (!lifecycle.changed && !inspectionChanged) return false;

  writeDb(db);
  for (const merchantId of lifecycle.merchantIds) {
    emitMerchantRealtimeState(db, merchantId, "support_updated");
  }
  for (const merchantId of lifecycle.notificationMerchantIds) {
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
  }
  return true;
}

const supportLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSupportLifecycle(ensureDb());
  } catch (error) {
    console.error("Support ticket lifecycle sweep failed:", error);
  }
}, SUPPORT_LIFECYCLE_SWEEP_MS);
supportLifecycleTimer.unref();''',
    '''function refreshAndPersistSupportLifecycle(db: AuthDb): boolean {
  const lifecycle = refreshSupportTicketLifecycle(db);
  const inspectionChanged = refreshInspectionRequestExpirations(db);
  if (!lifecycle.changed && !inspectionChanged) return false;

  writeDb(db);
  for (const merchantId of lifecycle.merchantIds) {
    emitMerchantRealtimeState(db, merchantId, "support_updated");
  }
  for (const merchantId of lifecycle.notificationMerchantIds) {
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
  }
  return true;
}

type SubscriptionLifecycleRefreshResult = {
  changed: boolean;
  subscriptionMerchantIds: Set<string>;
  notificationMerchantIds: Set<string>;
};

function refreshSubscriptionNotificationLifecycle(
  db: AuthDb,
  currentDate: Date = new Date(),
): SubscriptionLifecycleRefreshResult {
  const timestamp = currentDate.getTime();
  const createdAt = currentDate.toISOString();
  const subscriptionMerchantIds = new Set<string>();
  const notificationMerchantIds = new Set<string>();
  let changed = false;

  for (const subscription of db.subscriptions) {
    const before = JSON.stringify(subscription);
    recalculateSubscriptionTotals(subscription, currentDate);
    const expiresAt = new Date(subscription.expires_at).getTime();
    const timeUntilExpiry = expiresAt - timestamp;

    if (
      timeUntilExpiry > 0 &&
      timeUntilExpiry <= SUBSCRIPTION_EXPIRY_REMINDER_DAYS * DAY_MS &&
      !subscription.expiry_reminder_sent_at
    ) {
      appendMerchantNotificationRecord(db, {
        id: makeId("merchant-notification"),
        merchant_id: subscription.merchant_id,
        type: "subscription_expiry_reminder",
        plan_name: subscription.plan_name,
        expires_at: subscription.expires_at,
        days_remaining: Math.max(1, Math.ceil(timeUntilExpiry / DAY_MS)),
        created_at: createdAt,
      });
      subscription.expiry_reminder_sent_at = createdAt;
      notificationMerchantIds.add(subscription.merchant_id);
    }

    if (timeUntilExpiry <= 0 && !subscription.expired_notification_sent_at) {
      appendMerchantNotificationRecord(db, {
        id: makeId("merchant-notification"),
        merchant_id: subscription.merchant_id,
        type: "subscription_expired",
        plan_name: subscription.plan_name,
        expired_at: subscription.expires_at,
        addon_replies_remaining: subscription.addon_replies_remaining,
        created_at: createdAt,
      });
      subscription.expired_notification_sent_at = createdAt;
      notificationMerchantIds.add(subscription.merchant_id);
    }

    for (const batch of subscription.addon_reply_batches) {
      const batchExpiry = new Date(batch.expires_at).getTime();
      const timeUntilBatchExpiry = batchExpiry - timestamp;
      if (
        timeUntilBatchExpiry > 0 &&
        timeUntilBatchExpiry <= ADDON_EXPIRY_REMINDER_DAYS * DAY_MS &&
        !batch.expiry_reminder_sent_at
      ) {
        appendMerchantNotificationRecord(db, {
          id: makeId("merchant-notification"),
          merchant_id: subscription.merchant_id,
          type: "addon_expiry_reminder",
          addon_batch_id: batch.id,
          source: batch.source,
          remaining_replies: batch.remaining,
          expires_at: batch.expires_at,
          days_remaining: Math.max(
            1,
            Math.ceil(timeUntilBatchExpiry / DAY_MS),
          ),
          created_at: createdAt,
        });
        batch.expiry_reminder_sent_at = createdAt;
        notificationMerchantIds.add(subscription.merchant_id);
      }
    }

    if (JSON.stringify(subscription) !== before) {
      changed = true;
      subscriptionMerchantIds.add(subscription.merchant_id);
    }
  }

  if (notificationMerchantIds.size > 0) changed = true;
  return {
    changed,
    subscriptionMerchantIds,
    notificationMerchantIds,
  };
}

function refreshAndPersistSubscriptionLifecycle(db: AuthDb): boolean {
  const lifecycle = refreshSubscriptionNotificationLifecycle(db);
  if (!lifecycle.changed) return false;

  writeDb(db);
  for (const merchantId of lifecycle.subscriptionMerchantIds) {
    emitMerchantRealtimeState(db, merchantId, "subscription_updated");
  }
  for (const merchantId of lifecycle.notificationMerchantIds) {
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
  }
  return true;
}

const supportLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSupportLifecycle(ensureDb());
  } catch (error) {
    console.error("Support ticket lifecycle sweep failed:", error);
  }
}, SUPPORT_LIFECYCLE_SWEEP_MS);
supportLifecycleTimer.unref();

const subscriptionLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSubscriptionLifecycle(ensureDb());
  } catch (error) {
    console.error("Subscription notification lifecycle sweep failed:", error);
  }
}, SUBSCRIPTION_LIFECYCLE_SWEEP_MS);
subscriptionLifecycleTimer.unref();''',
    "subscription notification lifecycle",
)

replace_all_exact(
    AUTH,
    [
        (
            '''  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  const unreadOnly = String(req.query.unread || "") === "1";''',
            '''  const db = ensureDb();
  refreshAndPersistSupportLifecycle(db);
  refreshAndPersistSubscriptionLifecycle(db);
  const unreadOnly = String(req.query.unread || "") === "1";''',
            "refresh subscription notifications on list",
        ),
        (
            '''  const previousExpiresAt = existing?.expires_at;
  const emergencyDeduction = existing?.emergency_debt || 0;
  const subscription = createPaidSubscription(''',
            '''  const previousExpiresAt = existing?.expires_at;
  const previousPlanName = existing?.plan_name;
  const emergencyDeduction = existing?.emergency_debt || 0;
  const subscription = createPaidSubscription(''',
            "capture previous plan",
        ),
        (
            '''  appendAdminLog(
    db,
    admin,
    merchant,
    actionType,
    `subscription ${operation}: ${plan}`,
    {
      meta: {
        plan,
        ...(emergencyDeduction > 0
          ? { emergency_deduction: emergencyDeduction }
          : {}),
      },
    },
  );
  writeDb(db);''',
            '''  appendAdminLog(
    db,
    admin,
    merchant,
    actionType,
    `subscription ${operation}: ${plan}`,
    {
      meta: {
        plan,
        ...(emergencyDeduction > 0
          ? { emergency_deduction: emergencyDeduction }
          : {}),
      },
    },
  );
  const merchantNotification = appendMerchantSubscriptionPlanNotification(
    db,
    merchantId,
    operation,
    subscription,
    previousPlanName,
    Math.max(0, emergencyDeduction - subscription.emergency_debt),
  );
  writeDb(db);''',
            "append plan event notification",
        ),
        (
            '''    subscription,
  });
});

router.patch("/merchants/:id/subscription"''',
            '''    subscription,
    notification: merchantNotification,
  });
});

router.patch("/merchants/:id/subscription"''',
            "return plan event notification",
        ),
        (
            '''  subscription.addon_reply_batches.push({
    id: makeId("emergency-replies"),
    source: "emergency",
    purchased_at: activatedAt.toISOString(),
    expires_at: addBaghdadCalendarMonths(
      activatedAt,
      3,
      anchorDay,
    ).toISOString(),
    amount: emergencyAmount,
    remaining: emergencyAmount,
  });''',
            '''  const emergencyBatch: AddonReplyBatch = {
    id: makeId("emergency-replies"),
    source: "emergency",
    purchased_at: activatedAt.toISOString(),
    expires_at: addBaghdadCalendarMonths(
      activatedAt,
      3,
      anchorDay,
    ).toISOString(),
    amount: emergencyAmount,
    remaining: emergencyAmount,
  };
  subscription.addon_reply_batches.push(emergencyBatch);''',
            "capture emergency batch",
        ),
        (
            '''  recalculateSubscriptionTotals(subscription, activatedAt);
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");

  return res.json({ ok: true, subscription });''',
            '''  recalculateSubscriptionTotals(subscription, activatedAt);
  const merchantNotification = appendMerchantEmergencyActivationNotification(
    db,
    merchantId,
    emergencyBatch,
    subscription,
  );
  writeDb(db);
  emitMerchantRealtimeState(db, merchantId, "subscription_updated");

  return res.json({
    ok: true,
    subscription,
    notification: merchantNotification,
  });''',
            "emergency activation notification",
        ),
    ],
)

replace_all_exact(
    TYPES,
    [
        (
            '''    amount: number;
    remaining: number;
  }>;''',
            '''    amount: number;
    remaining: number;
    expiry_reminder_sent_at?: string;
  }>;''',
            "frontend addon reminder field",
        ),
        (
            '''  emergency_debt?: number;
  pending_next_cycle_deduction: number;
}''',
            '''  emergency_debt?: number;
  pending_next_cycle_deduction: number;
  expiry_reminder_sent_at?: string;
  expired_notification_sent_at?: string;
}''',
            "frontend subscription reminder fields",
        ),
        (
            '''  total_replies_available: number;
  created_at: string;
  read_at?: string;
}''',
            '''  total_replies_available: number;
  addon_batch_id?: string;
  addon_batch_expires_at?: string;
  created_at: string;
  read_at?: string;
}''',
            "frontend balance batch fields",
        ),
        (
            '''export interface MerchantInspectionNotification {''',
            '''export interface MerchantSubscriptionPlanNotification {
  id: string;
  merchant_id: string;
  type: 'subscription_plan_event';
  operation: 'activate' | 'change' | 'renew';
  plan_name: Subscription['plan_name'];
  previous_plan_name?: Subscription['plan_name'];
  start_date: string;
  expires_at: string;
  emergency_debt_paid: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
}

export interface MerchantEmergencyActivationNotification {
  id: string;
  merchant_id: string;
  type: 'subscription_emergency_activated';
  addon_batch_id: string;
  emergency_replies_added: number;
  emergency_debt: number;
  expires_at: string;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
}

export interface MerchantSubscriptionExpiryReminderNotification {
  id: string;
  merchant_id: string;
  type: 'subscription_expiry_reminder';
  plan_name: Subscription['plan_name'];
  expires_at: string;
  days_remaining: number;
  created_at: string;
  read_at?: string;
}

export interface MerchantSubscriptionExpiredNotification {
  id: string;
  merchant_id: string;
  type: 'subscription_expired';
  plan_name: Subscription['plan_name'];
  expired_at: string;
  addon_replies_remaining: number;
  created_at: string;
  read_at?: string;
}

export interface MerchantAddonExpiryReminderNotification {
  id: string;
  merchant_id: string;
  type: 'addon_expiry_reminder';
  addon_batch_id: string;
  source: 'purchase' | 'emergency';
  remaining_replies: number;
  expires_at: string;
  days_remaining: number;
  created_at: string;
  read_at?: string;
}

export type MerchantSubscriptionNotification =
  | MerchantSubscriptionPlanNotification
  | MerchantEmergencyActivationNotification
  | MerchantSubscriptionExpiryReminderNotification
  | MerchantSubscriptionExpiredNotification
  | MerchantAddonExpiryReminderNotification;

export interface MerchantInspectionNotification {''',
            "frontend subscription notification interfaces",
        ),
        (
            '''export type MerchantNotification =
  | MerchantBalanceNotification
  | MerchantInspectionNotification
  | MerchantSupportReplyReminderNotification;''',
            '''export type MerchantNotification =
  | MerchantBalanceNotification
  | MerchantSubscriptionNotification
  | MerchantInspectionNotification
  | MerchantSupportReplyReminderNotification;''',
            "frontend notification union",
        ),
    ],
)

translation_insertions = {
    "artifacts/fawri/src/lib/translations/ar.ts": '''  subscription_addon_batches_title: "دفعات الرصيد الإضافي",
  subscription_addon_batch_purchase: "رصيد إضافي مشتَرى",
  subscription_addon_batch_emergency: "رصيد طوارئ",
  subscription_addon_batch_remaining: "المتبقي",
  subscription_addon_batch_expires: "ينتهي في",
  balance_notification_addon_expiry: "تنتهي صلاحية الدفعة المضافة في {expiry}.",
  notification_plan_activated_title: "تم تفعيل الاشتراك",
  notification_plan_activated_body: "تم تفعيل باقة {plan}. تبدأ في {start} وتنتهي في {expiry}.",
  notification_plan_renewed_title: "تم تجديد الاشتراك",
  notification_plan_renewed_body: "تم تجديد باقة {plan}. تبدأ الدورة الجديدة في {start} وتنتهي في {expiry}.",
  notification_plan_changed_title: "تم تغيير الباقة",
  notification_plan_changed_body: "تم تغيير باقتك من {previousPlan} إلى {plan}. تبدأ الدورة الجديدة في {start} وتنتهي في {expiry}.",
  notification_emergency_activated_title: "تم تفعيل رصيد الطوارئ",
  notification_emergency_activated_body: "أُضيف {amount} {amountUnit} طوارئ إلى رصيدك، وسُجل دين بقيمة {debt} {debtUnit}. تنتهي صلاحية هذه الدفعة في {expiry}.",
  notification_emergency_debt_paid_detail: "تم تسديد {paid} {paidUnit} من دين الطوارئ، والمتبقي {remaining} {remainingUnit}.",
  notification_subscription_expiry_reminder_title: "اقترب انتهاء اشتراكك",
  notification_subscription_expiry_reminder_body: "تبقى {days} أيام على انتهاء باقة {plan}. ينتهي الاشتراك في {expiry}.",
  notification_subscription_expired_title: "انتهى اشتراكك",
  notification_subscription_expired_body: "انتهت باقة {plan} في {expired}. رصيدك الإضافي المتبقي هو {addon} {addonUnit} ويبقى محفوظًا حسب تاريخ انتهاء كل دفعة.",
  notification_addon_expiry_reminder_title: "اقترب انتهاء رصيد إضافي",
  notification_addon_expiry_reminder_body: "تبقى {days} أيام على انتهاء {source} الذي يحتوي على {remaining} {remainingUnit}. ينتهي في {expiry}.",
''',
    "artifacts/fawri/src/lib/translations/ku.ts": '''  subscription_addon_batches_title: "کۆمەڵە کرێدیتی زیادەکان",
  subscription_addon_batch_purchase: "کرێدیتی زیادەی کڕدراو",
  subscription_addon_batch_emergency: "کرێدیتی فریاکەوتن",
  subscription_addon_batch_remaining: "ماوە",
  subscription_addon_batch_expires: "کۆتایی دێت لە",
  balance_notification_addon_expiry: "ماوەی ئەم کۆمەڵە کرێدیتە لە {expiry} کۆتایی دێت.",
  notification_plan_activated_title: "بەشداریکردن چالاک کرا",
  notification_plan_activated_body: "پاکێجی {plan} چالاک کرا. لە {start} دەست پێدەکات و لە {expiry} کۆتایی دێت.",
  notification_plan_renewed_title: "بەشداریکردن نوێکرایەوە",
  notification_plan_renewed_body: "پاکێجی {plan} نوێکرایەوە. خولی نوێ لە {start} دەست پێدەکات و لە {expiry} کۆتایی دێت.",
  notification_plan_changed_title: "پاکێج گۆڕدرا",
  notification_plan_changed_body: "پاکێجەکەت لە {previousPlan} بۆ {plan} گۆڕدرا. خولی نوێ لە {start} دەست پێدەکات و لە {expiry} کۆتایی دێت.",
  notification_emergency_activated_title: "کرێدیتی فریاکەوتن چالاک کرا",
  notification_emergency_activated_body: "{amount} وەڵامی فریاکەوتن زیادکرا و {debt} وەڵام وەک قەرز تۆمار کرا. ئەم کۆمەڵەیە لە {expiry} کۆتایی دێت.",
  notification_emergency_debt_paid_detail: "{paid} وەڵام لە قەرزی فریاکەوتن درایەوە و {remaining} وەڵام ماوە.",
  notification_subscription_expiry_reminder_title: "بەشداریکردنەکەت نزیکە کۆتایی بێت",
  notification_subscription_expiry_reminder_body: "{days} ڕۆژ بۆ کۆتایی پاکێجی {plan} ماوە. لە {expiry} کۆتایی دێت.",
  notification_subscription_expired_title: "بەشداریکردنەکەت کۆتایی هات",
  notification_subscription_expired_body: "پاکێجی {plan} لە {expired} کۆتایی هات. {addon} وەڵامی زیادە ماوە و بە پێی بەرواری کۆتایی هەر کۆمەڵەیەک پارێزراو دەبێت.",
  notification_addon_expiry_reminder_title: "کرێدیتێکی زیادە نزیکە کۆتایی بێت",
  notification_addon_expiry_reminder_body: "{days} ڕۆژ بۆ کۆتایی {source} ماوە کە {remaining} وەڵامی تێدایە. لە {expiry} کۆتایی دێت.",
''',
    "artifacts/fawri/src/lib/translations/en.ts": '''  subscription_addon_batches_title: "Add-on reply batches",
  subscription_addon_batch_purchase: "Purchased add-on balance",
  subscription_addon_batch_emergency: "Emergency balance",
  subscription_addon_batch_remaining: "Remaining",
  subscription_addon_batch_expires: "Expires",
  balance_notification_addon_expiry: "The added batch expires on {expiry}.",
  notification_plan_activated_title: "Subscription activated",
  notification_plan_activated_body: "The {plan} plan was activated. It starts on {start} and expires on {expiry}.",
  notification_plan_renewed_title: "Subscription renewed",
  notification_plan_renewed_body: "The {plan} plan was renewed. The new cycle starts on {start} and expires on {expiry}.",
  notification_plan_changed_title: "Plan changed",
  notification_plan_changed_body: "Your plan changed from {previousPlan} to {plan}. The new cycle starts on {start} and expires on {expiry}.",
  notification_emergency_activated_title: "Emergency balance activated",
  notification_emergency_activated_body: "{amount} emergency replies were added and {debt} replies were recorded as emergency debt. This batch expires on {expiry}.",
  notification_emergency_debt_paid_detail: "{paid} replies of emergency debt were paid, with {remaining} replies remaining.",
  notification_subscription_expiry_reminder_title: "Subscription expiry reminder",
  notification_subscription_expiry_reminder_body: "Your {plan} plan expires in {days} days, on {expiry}.",
  notification_subscription_expired_title: "Subscription expired",
  notification_subscription_expired_body: "Your {plan} plan expired on {expired}. Your remaining {addon} add-on replies stay preserved according to each batch expiry date.",
  notification_addon_expiry_reminder_title: "Add-on balance expiry reminder",
  notification_addon_expiry_reminder_body: "A {source} batch with {remaining} replies expires in {days} days, on {expiry}.",
''',
}
for path, insertion in translation_insertions.items():
    replace_once(
        path,
        '  balance_notification_dismiss: ',
        insertion + '  balance_notification_dismiss: ',
        f"translation insertion {path}",
    )

replace_all_exact(
    SUBSCRIPTION_CARD,
    [
        (
            '''  const startDate = new Date(subscription.start_date).toLocaleDateString(locale);
  const expiryDate = new Date(subscription.expires_at).toLocaleDateString(locale);''',
            '''  const startDate = new Date(subscription.start_date).toLocaleDateString(locale);
  const expiryDate = new Date(subscription.expires_at).toLocaleDateString(locale);
  const addonReplyBatches = [...(subscription.addon_reply_batches ?? [])]
    .filter((batch) => batch.remaining > 0)
    .sort(
      (left, right) =>
        new Date(left.expires_at).getTime() -
        new Date(right.expires_at).getTime(),
    );''',
            "subscription card batch data",
        ),
        (
            '''        {canShowEmergency && (
          <EmergencyCredit subscription={subscription} onActivate={onEmergencyActivate} />
        )}''',
            '''        {addonReplyBatches.length > 0 && (
          <div className="space-y-2 rounded-xl border border-border/70 bg-muted/15 p-3">
            <h3 className="text-sm font-bold text-foreground">
              {t.subscription_addon_batches_title}
            </h3>
            <div className="space-y-2">
              {addonReplyBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {batch.source === 'emergency'
                        ? t.subscription_addon_batch_emergency
                        : t.subscription_addon_batch_purchase}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t.subscription_addon_batch_expires}:{' '}
                      <strong className="font-semibold text-foreground">
                        {new Date(batch.expires_at).toLocaleDateString(locale)}
                      </strong>
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {t.subscription_addon_batch_remaining}:{' '}
                    <strong className="text-base font-extrabold tabular-nums text-foreground" dir="ltr">
                      {batch.remaining.toLocaleString(locale)}
                    </strong>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {canShowEmergency && (
          <EmergencyCredit subscription={subscription} onActivate={onEmergencyActivate} />
        )}''',
            "subscription card batch list",
        ),
    ],
)

replace_all_exact(
    NOTIFICATIONS,
    [
        (
            '''  MerchantNotification,
  MerchantSupportReplyReminderNotification,''',
            '''  MerchantNotification,
  MerchantSubscriptionNotification,
  MerchantSupportReplyReminderNotification,''',
            "notification page type import",
        ),
        (
            '''function getArabicAvailabilityWord(count: number): 'متاح' | 'متاحة' {
  const value = Math.abs(Math.trunc(count));
  return value >= 3 && value <= 10 ? 'متاحة' : 'متاح';
}
''',
            '''function getArabicAvailabilityWord(count: number): 'متاح' | 'متاحة' {
  const value = Math.abs(Math.trunc(count));
  return value >= 3 && value <= 10 ? 'متاحة' : 'متاح';
}

function isSubscriptionNotification(
  notification: MerchantNotification,
): notification is MerchantSubscriptionNotification {
  return (
    notification.type === 'subscription_plan_event' ||
    notification.type === 'subscription_emergency_activated' ||
    notification.type === 'subscription_expiry_reminder' ||
    notification.type === 'subscription_expired' ||
    notification.type === 'addon_expiry_reminder'
  );
}
''',
            "subscription notification type guard",
        ),
        (
            '''  const renderBalanceSummary = (notification: MerchantBalanceNotification) =>
    formatNotificationText(t.balance_notification_summary, {
      base: notification.base_replies_remaining.toLocaleString(locale),
      addon: notification.addon_replies_remaining.toLocaleString(locale),
      total: notification.total_replies_available.toLocaleString(locale),
      totalUnit: lang === 'ar' ? getArabicReplyUnit(notification.total_replies_available) : '',
      availabilityWord: lang === 'ar' ? getArabicAvailabilityWord(notification.total_replies_available) : '',
    });
''',
            '''  const renderBalanceSummary = (notification: MerchantBalanceNotification) =>
    formatNotificationText(t.balance_notification_summary, {
      base: notification.base_replies_remaining.toLocaleString(locale),
      addon: notification.addon_replies_remaining.toLocaleString(locale),
      total: notification.total_replies_available.toLocaleString(locale),
      totalUnit: lang === 'ar' ? getArabicReplyUnit(notification.total_replies_available) : '',
      availabilityWord: lang === 'ar' ? getArabicAvailabilityWord(notification.total_replies_available) : '',
    });

  const getPlanLabel = (plan: 'silver' | 'gold' | 'diamond' | 'trial') =>
    ({
      silver: t.plan_silver,
      gold: t.plan_gold,
      diamond: t.plan_diamond,
      trial: t.plan_trial,
    })[plan];

  const renderSubscriptionNotification = (
    notification: MerchantSubscriptionNotification,
  ): { title: string; body: string; detail?: string } => {
    const formatDate = (value: string) =>
      new Date(value).toLocaleDateString(locale);

    if (notification.type === 'subscription_plan_event') {
      const title =
        notification.operation === 'activate'
          ? t.notification_plan_activated_title
          : notification.operation === 'renew'
            ? t.notification_plan_renewed_title
            : t.notification_plan_changed_title;
      const template =
        notification.operation === 'activate'
          ? t.notification_plan_activated_body
          : notification.operation === 'renew'
            ? t.notification_plan_renewed_body
            : t.notification_plan_changed_body;
      const body = formatNotificationText(template, {
        plan: getPlanLabel(notification.plan_name),
        previousPlan: notification.previous_plan_name
          ? getPlanLabel(notification.previous_plan_name)
          : getPlanLabel(notification.plan_name),
        start: formatDate(notification.start_date),
        expiry: formatDate(notification.expires_at),
      });
      const detail = notification.emergency_debt_paid > 0
        ? formatNotificationText(t.notification_emergency_debt_paid_detail, {
            paid: notification.emergency_debt_paid.toLocaleString(locale),
            paidUnit: lang === 'ar' ? getArabicReplyUnit(notification.emergency_debt_paid) : '',
            remaining: notification.emergency_debt_remaining.toLocaleString(locale),
            remainingUnit: lang === 'ar' ? getArabicReplyUnit(notification.emergency_debt_remaining) : '',
          })
        : undefined;
      return { title, body, detail };
    }

    if (notification.type === 'subscription_emergency_activated') {
      return {
        title: t.notification_emergency_activated_title,
        body: formatNotificationText(t.notification_emergency_activated_body, {
          amount: notification.emergency_replies_added.toLocaleString(locale),
          amountUnit: lang === 'ar' ? getArabicReplyUnit(notification.emergency_replies_added) : '',
          debt: notification.emergency_debt.toLocaleString(locale),
          debtUnit: lang === 'ar' ? getArabicReplyUnit(notification.emergency_debt) : '',
          expiry: formatDate(notification.expires_at),
        }),
      };
    }

    if (notification.type === 'subscription_expiry_reminder') {
      return {
        title: t.notification_subscription_expiry_reminder_title,
        body: formatNotificationText(t.notification_subscription_expiry_reminder_body, {
          plan: getPlanLabel(notification.plan_name),
          days: notification.days_remaining.toLocaleString(locale),
          expiry: formatDate(notification.expires_at),
        }),
      };
    }

    if (notification.type === 'subscription_expired') {
      return {
        title: t.notification_subscription_expired_title,
        body: formatNotificationText(t.notification_subscription_expired_body, {
          plan: getPlanLabel(notification.plan_name),
          expired: formatDate(notification.expired_at),
          addon: notification.addon_replies_remaining.toLocaleString(locale),
          addonUnit: lang === 'ar' ? getArabicReplyUnit(notification.addon_replies_remaining) : '',
        }),
      };
    }

    const source = notification.source === 'emergency'
      ? t.subscription_addon_batch_emergency
      : t.subscription_addon_batch_purchase;
    return {
      title: t.notification_addon_expiry_reminder_title,
      body: formatNotificationText(t.notification_addon_expiry_reminder_body, {
        source,
        remaining: notification.remaining_replies.toLocaleString(locale),
        remainingUnit: lang === 'ar' ? getArabicReplyUnit(notification.remaining_replies) : '',
        days: notification.days_remaining.toLocaleString(locale),
        expiry: formatDate(notification.expires_at),
      }),
    };
  };
''',
            "subscription notification renderer",
        ),
        (
            '''            if (notification.type === 'support_reply_reminder') {''',
            '''            if (isSubscriptionNotification(notification)) {
              const content = renderSubscriptionNotification(notification);
              return (
                <article
                  key={notification.id}
                  className={`rounded-2xl border p-4 shadow-sm transition-colors sm:p-5 ${
                    unread
                      ? 'border-violet-300 bg-violet-50/80 dark:border-violet-700 dark:bg-violet-950/25'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        unread
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Bell className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-black text-foreground">{content.title}</h2>
                        <time
                          className="text-[11px] font-medium text-muted-foreground"
                          dateTime={notification.created_at}
                        >
                          {new Date(notification.created_at).toLocaleString(locale)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">
                        {content.body}
                      </p>
                      {content.detail && (
                        <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                          {content.detail}
                        </p>
                      )}
                      <div className="mt-3 flex justify-end">
                        {unread ? (
                          <button
                            type="button"
                            disabled={marking}
                            onClick={() => void markAsRead(notification.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {marking ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            {t.notifications_mark_read}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            <Check className="h-4 w-4" />
                            {t.notifications_read}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            if (notification.type === 'support_reply_reminder') {''',
            "subscription notification cards",
        ),
        (
            '''                    <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                      {renderBalanceSummary(notification)}
                    </p>''',
            '''                    {notification.addon_batch_expires_at && (
                      <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                        {formatNotificationText(t.balance_notification_addon_expiry, {
                          expiry: new Date(notification.addon_batch_expires_at).toLocaleDateString(locale),
                        })}
                      </p>
                    )}

                    <p className="mt-3 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs font-semibold leading-6 text-foreground">
                      {renderBalanceSummary(notification)}
                    </p>''',
            "balance notification batch expiry",
        ),
    ],
)

replace_all_exact(
    TEST,
    [
        (
            '''  const baseMerchant = {
    owner_name: "Merchant Owner", store_name: "Merchant Store", activity_type: "retail",
    status: "approved", account_status: "approved", language: "en", theme_preference: "auto",
    created_at: "2026-07-27T00:00:00.000Z", otp_verified: true, warning_stage: 0,
    retention_status: "protected",
  };
''',
            '''  const baseMerchant = {
    owner_name: "Merchant Owner", store_name: "Merchant Store", activity_type: "retail",
    status: "approved", account_status: "approved", language: "en", theme_preference: "auto",
    created_at: "2026-07-27T00:00:00.000Z", otp_verified: true, warning_stage: 0,
    retention_status: "protected",
  };
  const seededNow = Date.now();
  const seededSubscriptions = [
    {
      id: "subscription-d", merchant_id: "merchant-d", plan_name: "gold",
      price_iqd: 49000, reply_limit: 8050, replies_used: 0, replies_remaining: 8050,
      base_reply_limit: 8000, base_replies_used: 0, base_replies_remaining: 8000,
      addon_replies_remaining: 50,
      addon_reply_batches: [{
        id: "addon-d", source: "purchase",
        purchased_at: new Date(seededNow - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(seededNow + 10 * 24 * 60 * 60 * 1000 - 1000).toISOString(),
        amount: 50, remaining: 50,
      }],
      billing_anchor_day: 1,
      start_date: new Date(seededNow - 23 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(seededNow + 7 * 24 * 60 * 60 * 1000 - 1000).toISOString(),
      status: "active", auto_reply_enabled: true,
      emergency_credit_used: 0, emergency_credit_amount: 800,
      emergency_credit_remaining: 0, emergency_credit_activated: false,
      emergency_debt: 0, pending_next_cycle_deduction: 0,
    },
    {
      id: "subscription-e", merchant_id: "merchant-e", plan_name: "silver",
      price_iqd: 25000, reply_limit: 4000, replies_used: 0, replies_remaining: 4000,
      base_reply_limit: 4000, base_replies_used: 0, base_replies_remaining: 4000,
      addon_replies_remaining: 0, addon_reply_batches: [], billing_anchor_day: 1,
      start_date: new Date(seededNow - 32 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(seededNow - 24 * 60 * 60 * 1000).toISOString(),
      status: "active", auto_reply_enabled: true,
      emergency_credit_used: 0, emergency_credit_amount: 400,
      emergency_credit_remaining: 0, emergency_credit_activated: false,
      emergency_debt: 0, pending_next_cycle_deduction: 0,
    },
  ];
''',
            "test seeded subscription notifications",
        ),
        (
            '''      { ...baseMerchant, id: "merchant-c", phone: "07555555555", password: "Merchant3@" },
    ],
    subscriptions: [],''',
            '''      { ...baseMerchant, id: "merchant-c", phone: "07555555555", password: "Merchant3@" },
      { ...baseMerchant, id: "merchant-d", phone: "07666666666", password: "Merchant4@" },
      { ...baseMerchant, id: "merchant-e", phone: "07777777777", password: "Merchant5@" },
    ],
    subscriptions: seededSubscriptions,''',
            "test scheduled merchants",
        ),
        (
            '''  const merchantCCookie = await merchantCookie("07555555555", "Merchant3@");
''',
            '''  const merchantCCookie = await merchantCookie("07555555555", "Merchant3@");
  const merchantDCookie = await merchantCookie("07666666666", "Merchant4@");
  const merchantECookie = await merchantCookie("07777777777", "Merchant5@");

  const expiringNotifications = await json(await fetch(
    `${baseUrl}/api/auth/notifications?unread=1&limit=50`,
    { headers: { Cookie: merchantDCookie } },
  ));
  assert.equal(expiringNotifications.response.status, 200);
  assert.deepEqual(
    expiringNotifications.body.notifications.map((item) => item.type).sort(),
    ["addon_expiry_reminder", "subscription_expiry_reminder"],
  );
  const expiringNotificationsAgain = await json(await fetch(
    `${baseUrl}/api/auth/notifications?unread=1&limit=50`,
    { headers: { Cookie: merchantDCookie } },
  ));
  assert.equal(expiringNotificationsAgain.body.notifications.length, 2);

  const expiredNotifications = await json(await fetch(
    `${baseUrl}/api/auth/notifications?unread=1&limit=50`,
    { headers: { Cookie: merchantECookie } },
  ));
  assert.equal(expiredNotifications.response.status, 200);
  assert.equal(expiredNotifications.body.notifications.length, 1);
  assert.equal(expiredNotifications.body.notifications[0].type, "subscription_expired");
''',
            "test scheduled notification deduplication",
        ),
        (
            '''  assert.equal(activated.body.subscription.base_reply_limit, 4000);
''',
            '''  assert.equal(activated.body.subscription.base_reply_limit, 4000);
  assert.equal(activated.body.notification.type, "subscription_plan_event");
  assert.equal(activated.body.notification.operation, "activate");
''',
            "test activation notification",
        ),
        (
            '''  assert.equal(emergencyA.body.subscription.replies_remaining, 400);
''',
            '''  assert.equal(emergencyA.body.subscription.replies_remaining, 400);
  assert.equal(emergencyA.body.notification.type, "subscription_emergency_activated");
  assert.equal(emergencyA.body.notification.emergency_replies_added, 400);
''',
            "test emergency notification",
        ),
        (
            '''  assert.equal(realtimeSnapshot.unread_notification_count, 0);''',
            '''  assert.equal(realtimeSnapshot.unread_notification_count, 2);''',
            "test initial unread count",
        ),
        (
            '''  assert.equal(partialRealtime.unread_notification_count, 1);''',
            '''  assert.equal(partialRealtime.unread_notification_count, 3);''',
            "test partial unread count",
        ),
        (
            '''  assert.equal(partialNotifications.body.notifications.length, 1);''',
            '''  assert.equal(partialNotifications.body.notifications.length, 3);''',
            "test partial notification count",
        ),
        (
            '''  assert.equal(splitRealtime.unread_notification_count, 2);''',
            '''  assert.equal(splitRealtime.unread_notification_count, 4);''',
            "test split unread count",
        ),
        (
            '''  assert.equal(splitNotifications.body.notifications.length, 2);''',
            '''  assert.equal(splitNotifications.body.notifications.length, 4);''',
            "test split notification count",
        ),
        (
            '''  assert.equal(readRealtime.unread_notification_count, 1);''',
            '''  assert.equal(readRealtime.unread_notification_count, 3);''',
            "test read realtime count",
        ),
        (
            '''  assert.equal(unreadAfterMark.body.notifications.length, 1);''',
            '''  assert.equal(unreadAfterMark.body.notifications.length, 3);''',
            "test unread count after mark",
        ),
        (
            '''  assert.equal(debtAndAddon.body.notification.total_replies_available, 600);''',
            '''  assert.equal(debtAndAddon.body.notification.total_replies_available, 600);
  assert.ok(debtAndAddon.body.notification.addon_batch_id);
  assert.ok(debtAndAddon.body.notification.addon_batch_expires_at);''',
            "test purchased batch expiry notification",
        ),
        (
            '''  assert.equal(renewedAfterExhaustion.body.subscription.addon_replies_remaining, 600);''',
            '''  assert.equal(renewedAfterExhaustion.body.subscription.addon_replies_remaining, 600);
  assert.equal(renewedAfterExhaustion.body.notification.type, "subscription_plan_event");
  assert.equal(renewedAfterExhaustion.body.notification.operation, "renew");''',
            "test renewal notification",
        ),
        (
            '''  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);''',
            '''  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);
  assert.equal(changedWithDebt.body.notification.type, "subscription_plan_event");
  assert.equal(changedWithDebt.body.notification.operation, "change");
  assert.equal(changedWithDebt.body.notification.emergency_debt_paid, 400);''',
            "test plan change debt notification",
        ),
    ],
)

print("Subscription notification implementation patched successfully.")
