from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    p.write_text(text.replace(old, new, 1))


def insert_before(path: str, marker: str, block: str, label: str) -> None:
    replace_once(path, marker, block + marker, label)


AUTH = "artifacts/api-server/src/routes/auth.ts"
TYPES = "artifacts/fawri/src/lib/types.ts"
CARD = "artifacts/fawri/src/components/SubscriptionCard.tsx"
NOTIFICATIONS = "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx"
AR = "artifacts/fawri/src/lib/translations/ar.ts"
KU = "artifacts/fawri/src/lib/translations/ku.ts"
EN = "artifacts/fawri/src/lib/translations/en.ts"

replace_once(AUTH,
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
"addon reminder field")

replace_once(AUTH,
'''  emergency_debt: number;
  pending_next_cycle_deduction: number;
};''',
'''  emergency_debt: number;
  pending_next_cycle_deduction: number;
  expiry_reminder_sent_at?: string;
  expired_notification_sent_at?: string;
};''',
"subscription reminder fields")

replace_once(AUTH,
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
"normalize batch reminder")

replace_once(AUTH,
'''        amount,
        remaining,
      };''',
'''        amount,
        remaining,
        ...(expiryReminderSentAt
          ? { expiry_reminder_sent_at: expiryReminderSentAt }
          : {}),
      };''',
"preserve batch reminder")

replace_once(AUTH,
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
"purchase batch return")

replace_once(AUTH,
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
"notification record types")

replace_once(AUTH,
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
"notification union")

replace_once(AUTH,
'''  if (item.type === "subscription_balance_purchase") return true;

  if (item.type === "support_reply_reminder") {''',
'''  if (item.type === "subscription_balance_purchase") return true;
  if (item.type === "subscription_plan_event") {
    return (
      (item.operation === "activate" || item.operation === "change" || item.operation === "renew") &&
      isSubscriptionPlan(item.plan_name) &&
      typeof item.start_date === "string" &&
      typeof item.expires_at === "string"
    );
  }
  if (item.type === "subscription_emergency_activated") {
    return typeof item.addon_batch_id === "string" && typeof item.expires_at === "string";
  }
  if (item.type === "subscription_expiry_reminder") {
    return isSubscriptionPlan(item.plan_name) && typeof item.expires_at === "string";
  }
  if (item.type === "subscription_expired") {
    return isSubscriptionPlan(item.plan_name) && typeof item.expired_at === "string";
  }
  if (item.type === "addon_expiry_reminder") {
    return typeof item.addon_batch_id === "string" && typeof item.expires_at === "string";
  }

  if (item.type === "support_reply_reminder") {''',
"notification validation")

replace_once(AUTH,
'''const SUPPORT_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;''',
'''const SUPPORT_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;
const SUBSCRIPTION_LIFECYCLE_SWEEP_MS =
  process.env.NODE_ENV === "production" ? 60_000 : 5_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_EXPIRY_REMINDER_DAYS = 7;
const ADDON_EXPIRY_REMINDER_DAYS = 10;''',
"lifecycle constants")

replace_once(AUTH,
'''    emergency_debt: emergencyDebt,
    pending_next_cycle_deduction: emergencyDebt,
  });''',
'''    emergency_debt: emergencyDebt,
    pending_next_cycle_deduction: emergencyDebt,
    ...(typeof record.expiry_reminder_sent_at === "string" && record.expiry_reminder_sent_at.trim()
      ? { expiry_reminder_sent_at: record.expiry_reminder_sent_at }
      : {}),
    ...(typeof record.expired_notification_sent_at === "string" && record.expired_notification_sent_at.trim()
      ? { expired_notification_sent_at: record.expired_notification_sent_at }
      : {}),
  });''',
"preserve subscription reminders")

insert_before(AUTH,
'''function appendMerchantBalanceNotification(''',
'''function appendMerchantNotificationRecord<T extends MerchantNotificationRecord>(
  db: AuthDb,
  notification: T,
): T {
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

''',
"shared notification append")

replace_once(AUTH,
'''  purchase: { debtPaid: number; addonAdded: number },''',
'''  purchase: {
    debtPaid: number;
    addonAdded: number;
    addonBatch?: AddonReplyBatch;
  },''',
"balance purchase type")

replace_once(AUTH,
'''    total_replies_available: subscription.replies_remaining,
    created_at: now(),''',
'''    total_replies_available: subscription.replies_remaining,
    ...(purchase.addonBatch
      ? {
          addon_batch_id: purchase.addonBatch.id,
          addon_batch_expires_at: purchase.addonBatch.expires_at,
        }
      : {}),
    created_at: now(),''',
"balance notification batch")

insert_before(AUTH,
'''function appendMerchantInspectionNotification(''',
'''function appendMerchantSubscriptionPlanNotification(
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
    created_at: now(),
  });
}

''',
"subscription notification appenders")

replace_once(AUTH,
'''supportLifecycleTimer.unref();''',
'''supportLifecycleTimer.unref();

function refreshAndPersistSubscriptionLifecycle(db: AuthDb): boolean {
  const currentDate = new Date();
  const timestamp = currentDate.getTime();
  const createdAt = currentDate.toISOString();
  const changedMerchants = new Set<string>();
  const notificationMerchants = new Set<string>();
  let changed = false;

  for (const subscription of db.subscriptions) {
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
      notificationMerchants.add(subscription.merchant_id);
      changed = true;
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
      notificationMerchants.add(subscription.merchant_id);
      changedMerchants.add(subscription.merchant_id);
      changed = true;
    }

    for (const batch of subscription.addon_reply_batches) {
      const batchExpiresAt = new Date(batch.expires_at).getTime();
      const timeUntilBatchExpiry = batchExpiresAt - timestamp;
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
          days_remaining: Math.max(1, Math.ceil(timeUntilBatchExpiry / DAY_MS)),
          created_at: createdAt,
        });
        batch.expiry_reminder_sent_at = createdAt;
        notificationMerchants.add(subscription.merchant_id);
        changed = true;
      }
    }
  }

  if (!changed) return false;
  writeDb(db);
  for (const merchantId of changedMerchants) {
    emitMerchantRealtimeState(db, merchantId, "subscription_updated");
  }
  for (const merchantId of notificationMerchants) {
    emitMerchantRealtimeState(db, merchantId, "notifications_updated");
  }
  return true;
}

const subscriptionLifecycleTimer = setInterval(() => {
  try {
    refreshAndPersistSubscriptionLifecycle(ensureDb());
  } catch (error) {
    console.error("Subscription notification lifecycle sweep failed:", error);
  }
}, SUBSCRIPTION_LIFECYCLE_SWEEP_MS);
subscriptionLifecycleTimer.unref();''',
"subscription lifecycle sweep")

replace_once(AUTH,
'''  refreshAndPersistSupportLifecycle(db);
  const unreadOnly =''',
'''  refreshAndPersistSupportLifecycle(db);
  refreshAndPersistSubscriptionLifecycle(db);
  const unreadOnly =''',
"refresh notifications endpoint")

replace_once(AUTH,
'''  const previousExpiresAt = existing?.expires_at;
  const emergencyDeduction = existing?.emergency_debt || 0;''',
'''  const previousExpiresAt = existing?.expires_at;
  const previousPlanName = existing?.plan_name;
  const emergencyDeduction = existing?.emergency_debt || 0;''',
"capture previous plan")

replace_once(AUTH,
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
"plan event notification")

replace_once(AUTH,
'''    subscription,
  });
});

router.patch("/merchants/:id/subscription"''',
'''    subscription,
    notification: merchantNotification,
  });
});

router.patch("/merchants/:id/subscription"''',
"return plan notification")

replace_once(AUTH,
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
"emergency batch capture")

replace_once(AUTH,
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
"emergency activation notification")

replace_once(TYPES,
'''    amount: number;
    remaining: number;
  }>;''',
'''    amount: number;
    remaining: number;
    expiry_reminder_sent_at?: string;
  }>;''',
"frontend batch reminder")

replace_once(TYPES,
'''  emergency_debt?: number;
  pending_next_cycle_deduction: number;
}''',
'''  emergency_debt?: number;
  pending_next_cycle_deduction: number;
  expiry_reminder_sent_at?: string;
  expired_notification_sent_at?: string;
}''',
"frontend subscription reminder")

replace_once(TYPES,
'''  total_replies_available: number;
  created_at: string;''',
'''  total_replies_available: number;
  addon_batch_id?: string;
  addon_batch_expires_at?: string;
  created_at: string;''',
"frontend balance batch")

insert_before(TYPES,
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

''',
"frontend subscription notification types")

replace_once(TYPES,
'''export type MerchantNotification =
  | MerchantBalanceNotification
  | MerchantInspectionNotification''',
'''export type MerchantNotification =
  | MerchantBalanceNotification
  | MerchantSubscriptionNotification
  | MerchantInspectionNotification''',
"frontend notification union")

for path, block in {
AR: '''  subscription_addon_batches_title: "دفعات الرصيد الإضافي",
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
  notification_emergency_activated_body: "أُضيف {amount} رد طوارئ إلى رصيدك وسُجل دين بقيمة {debt} رد. تنتهي صلاحية هذه الدفعة في {expiry}.",
  notification_subscription_expiry_reminder_title: "اقترب انتهاء اشتراكك",
  notification_subscription_expiry_reminder_body: "تبقى {days} أيام على انتهاء باقة {plan}. ينتهي الاشتراك في {expiry}.",
  notification_subscription_expired_title: "انتهى اشتراكك",
  notification_subscription_expired_body: "انتهت باقة {plan} في {expired}. رصيدك الإضافي المتبقي {addon} رد ويبقى محفوظًا حسب تاريخ انتهاء كل دفعة.",
  notification_addon_expiry_reminder_title: "اقترب انتهاء رصيد إضافي",
  notification_addon_expiry_reminder_body: "تبقى {days} أيام على انتهاء {source} الذي يحتوي على {remaining} رد. ينتهي في {expiry}.",
''',
KU: '''  subscription_addon_batches_title: "کۆمەڵە کرێدیتی زیادەکان",
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
  notification_subscription_expiry_reminder_title: "بەشداریکردنەکەت نزیکە کۆتایی بێت",
  notification_subscription_expiry_reminder_body: "{days} ڕۆژ بۆ کۆتایی پاکێجی {plan} ماوە. لە {expiry} کۆتایی دێت.",
  notification_subscription_expired_title: "بەشداریکردنەکەت کۆتایی هات",
  notification_subscription_expired_body: "پاکێجی {plan} لە {expired} کۆتایی هات. {addon} وەڵامی زیادە ماوە و بە پێی بەرواری کۆتایی هەر کۆمەڵەیەک پارێزراو دەبێت.",
  notification_addon_expiry_reminder_title: "کرێدیتێکی زیادە نزیکە کۆتایی بێت",
  notification_addon_expiry_reminder_body: "{days} ڕۆژ بۆ کۆتایی {source} ماوە کە {remaining} وەڵامی تێدایە. لە {expiry} کۆتایی دێت.",
''',
EN: '''  subscription_addon_batches_title: "Add-on reply batches",
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
  notification_subscription_expiry_reminder_title: "Subscription expiry reminder",
  notification_subscription_expiry_reminder_body: "Your {plan} plan expires in {days} days, on {expiry}.",
  notification_subscription_expired_title: "Subscription expired",
  notification_subscription_expired_body: "Your {plan} plan expired on {expired}. Your remaining {addon} add-on replies stay preserved according to each batch expiry date.",
  notification_addon_expiry_reminder_title: "Add-on balance expiry reminder",
  notification_addon_expiry_reminder_body: "A {source} batch with {remaining} replies expires in {days} days, on {expiry}.",
'''
}.items():
    insert_before(path, '  balance_notification_dismiss:', block, f"translations {path}")

replace_once(CARD,
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
"card batch data")

insert_before(CARD,
'''        {canShowEmergency && (''',
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
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      {batch.source === 'emergency'
                        ? t.subscription_addon_batch_emergency
                        : t.subscription_addon_batch_purchase}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t.subscription_addon_batch_expires}:{' '}
                      <strong className="text-foreground">
                        {new Date(batch.expires_at).toLocaleDateString(locale)}
                      </strong>
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {t.subscription_addon_batch_remaining}:{' '}
                    <strong className="text-base font-extrabold text-foreground" dir="ltr">
                      {batch.remaining.toLocaleString(locale)}
                    </strong>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

''',
"card batch list")

replace_once(NOTIFICATIONS,
'''  MerchantNotification,
  MerchantSupportReplyReminderNotification,''',
'''  MerchantNotification,
  MerchantSubscriptionNotification,
  MerchantSupportReplyReminderNotification,''',
"notification type import")

insert_before(NOTIFICATIONS,
'''const INSPECTION_NOTIFICATION_TEXT = {''',
'''function isSubscriptionNotification(
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
"notification type guard")

insert_before(NOTIFICATIONS,
'''  return (''',
'''  const getPlanLabel = (plan: 'silver' | 'gold' | 'diamond' | 'trial') =>
    ({ silver: t.plan_silver, gold: t.plan_gold, diamond: t.plan_diamond, trial: t.plan_trial })[plan];

  const renderSubscriptionNotification = (notification: MerchantSubscriptionNotification) => {
    const formatDate = (value: string) => new Date(value).toLocaleDateString(locale);
    if (notification.type === 'subscription_plan_event') {
      const title = notification.operation === 'activate'
        ? t.notification_plan_activated_title
        : notification.operation === 'renew'
          ? t.notification_plan_renewed_title
          : t.notification_plan_changed_title;
      const template = notification.operation === 'activate'
        ? t.notification_plan_activated_body
        : notification.operation === 'renew'
          ? t.notification_plan_renewed_body
          : t.notification_plan_changed_body;
      return {
        title,
        body: formatNotificationText(template, {
          plan: getPlanLabel(notification.plan_name),
          previousPlan: notification.previous_plan_name
            ? getPlanLabel(notification.previous_plan_name)
            : getPlanLabel(notification.plan_name),
          start: formatDate(notification.start_date),
          expiry: formatDate(notification.expires_at),
        }),
      };
    }
    if (notification.type === 'subscription_emergency_activated') {
      return {
        title: t.notification_emergency_activated_title,
        body: formatNotificationText(t.notification_emergency_activated_body, {
          amount: notification.emergency_replies_added.toLocaleString(locale),
          debt: notification.emergency_debt.toLocaleString(locale),
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
        }),
      };
    }
    return {
      title: t.notification_addon_expiry_reminder_title,
      body: formatNotificationText(t.notification_addon_expiry_reminder_body, {
        source: notification.source === 'emergency'
          ? t.subscription_addon_batch_emergency
          : t.subscription_addon_batch_purchase,
        remaining: notification.remaining_replies.toLocaleString(locale),
        days: notification.days_remaining.toLocaleString(locale),
        expiry: formatDate(notification.expires_at),
      }),
    };
  };

''',
"subscription renderer")

insert_before(NOTIFICATIONS,
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
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-black text-foreground">{content.title}</h2>
                        <time className="text-[11px] font-medium text-muted-foreground" dateTime={notification.created_at}>
                          {new Date(notification.created_at).toLocaleString(locale)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-7 text-foreground/90">{content.body}</p>
                      <div className="mt-3 flex justify-end">
                        {unread ? (
                          <button
                            type="button"
                            disabled={marking}
                            onClick={() => void markAsRead(notification.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-60"
                          >
                            {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
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

''',
"subscription cards")

insert_before(NOTIFICATIONS,
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

''',
"balance batch expiry display")

print("patched")
