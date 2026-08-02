from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    path.write_text(text.replace(old, new, 1))


notifications_path = Path(
    "artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx"
)
ar_path = Path("artifacts/fawri/src/lib/translations/ar.ts")
en_path = Path("artifacts/fawri/src/lib/translations/en.ts")
ku_path = Path("artifacts/fawri/src/lib/translations/ku.ts")
test_path = Path(
    "artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs"
)

replace_once(
    notifications_path,
    '''      return {
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
''',
    '''      const planBody = formatNotificationText(template, {
        plan: getPlanLabel(notification.plan_name),
        previousPlan: notification.previous_plan_name
          ? getPlanLabel(notification.previous_plan_name)
          : getPlanLabel(notification.plan_name),
        start: formatDate(notification.start_date),
        expiry: formatDate(notification.expires_at),
      });
      const debtBody = notification.emergency_debt_paid > 0
        ? formatNotificationText(t.notification_plan_emergency_debt_paid, {
            debtPaid: notification.emergency_debt_paid.toLocaleString(locale),
            base: notification.base_replies_remaining.toLocaleString(locale),
            addon: notification.addon_replies_remaining.toLocaleString(locale),
            total: notification.total_replies_available.toLocaleString(locale),
          })
        : '';

      return {
        title,
        body: debtBody ? `${planBody} ${debtBody}` : planBody,
      };
''',
    "plan notification debt rendering",
)

replace_once(
    ar_path,
    '''  notification_plan_changed_body: "تم تغيير باقتك من {previousPlan} إلى {plan}. تبدأ الدورة الجديدة في {start} وتنتهي في {expiry}.",
''',
    '''  notification_plan_changed_body: "تم تغيير باقتك من {previousPlan} إلى {plan}. تبدأ الدورة الجديدة في {start} وتنتهي في {expiry}.",
  notification_plan_emergency_debt_paid: "تم خصم {debtPaid} رد من رصيد الخطة الجديدة لتسديد دين الطوارئ. رصيدك الآن: {base} أساسي + {addon} إضافي = {total} رد متاح.",
''',
    "Arabic plan debt notification",
)

replace_once(
    en_path,
    '''  notification_plan_changed_body: "Your plan changed from {previousPlan} to {plan}. The new cycle starts on {start} and expires on {expiry}.",
''',
    '''  notification_plan_changed_body: "Your plan changed from {previousPlan} to {plan}. The new cycle starts on {start} and expires on {expiry}.",
  notification_plan_emergency_debt_paid: "{debtPaid} replies were deducted from the new plan balance to settle the emergency debt. Current balance: {base} base + {addon} add-on = {total} replies available.",
''',
    "English plan debt notification",
)

replace_once(
    ku_path,
    '''  notification_plan_changed_body: "پاکێجەکەت لە {previousPlan} بۆ {plan} گۆڕدرا. خولی نوێ لە {start} دەست پێدەکات و لە {expiry} کۆتایی دێت.",
''',
    '''  notification_plan_changed_body: "پاکێجەکەت لە {previousPlan} بۆ {plan} گۆڕدرا. خولی نوێ لە {start} دەست پێدەکات و لە {expiry} کۆتایی دێت.",
  notification_plan_emergency_debt_paid: "{debtPaid} وەڵام لە باڵانسی پلانی نوێ کەمکرایەوە بۆ دانەوەی قەرزی فریاکەوتن. باڵانسی ئێستات: {base} سەرەکی + {addon} زیادە = {total} وەڵامی بەردەست.",
''',
    "Kurdish plan debt notification",
)

replace_once(
    test_path,
    '''  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);

  const activatedC = await planOperation("merchant-c", "activate", "silver");
''',
    '''  assert.equal(changedWithDebt.body.subscription.emergency_credit_activated, false);
  assert.equal(changedWithDebt.body.notification.type, "subscription_plan_event");
  assert.equal(changedWithDebt.body.notification.operation, "change");
  assert.equal(changedWithDebt.body.notification.emergency_debt_paid, 400);
  assert.equal(changedWithDebt.body.notification.emergency_debt_remaining, 0);
  assert.equal(changedWithDebt.body.notification.base_replies_remaining, 7600);
  assert.equal(changedWithDebt.body.notification.addon_replies_remaining, 400);
  assert.equal(changedWithDebt.body.notification.total_replies_available, 8000);

  const activatedC = await planOperation("merchant-c", "activate", "silver");
''',
    "plan debt notification integration coverage",
)

print("Plan debt details and notification coverage applied.")
