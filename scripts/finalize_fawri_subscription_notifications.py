from pathlib import Path
import runpy


PATCH_SCRIPT = Path("scripts/apply_fawri_subscription_notifications.py")
LIFECYCLE_TEST = Path(
    "artifacts/api-server/tests/subscription-lifecycle.integration.test.mjs"
)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


# The notification renderer must be inserted at one unique point inside
# NotificationsPage. The original broad marker matched several React returns.
patch_text = PATCH_SCRIPT.read_text()
patch_text = replace_once(
    patch_text,
    "insert_before(NOTIFICATIONS,\n'''  return (''',",
    "insert_before(NOTIFICATIONS,\n'''  const renderBalanceSummary = (notification: MerchantBalanceNotification) =>''',",
    "subscription renderer marker",
)
PATCH_SCRIPT.write_text(patch_text)

# Apply the approved backend, frontend, translation and subscription-card changes.
runpy.run_path(str(PATCH_SCRIPT), run_name="__main__")

# Update the existing lifecycle integration test to validate the new events.
test_text = LIFECYCLE_TEST.read_text()
replacements = [
    (
        '  assert.equal(activated.body.subscription.base_reply_limit, 4000);',
        '''  assert.equal(activated.body.subscription.base_reply_limit, 4000);
  assert.equal(activated.body.notification.type, "subscription_plan_event");
  assert.equal(activated.body.notification.operation, "activate");
  assert.equal(activated.body.notification.plan_name, "silver");''',
        "activation notification assertions",
    ),
    (
        '  assert.equal(emergencyA.body.subscription.replies_remaining, 400);',
        '''  assert.equal(emergencyA.body.subscription.replies_remaining, 400);
  assert.equal(
    emergencyA.body.notification.type,
    "subscription_emergency_activated",
  );
  assert.equal(emergencyA.body.notification.emergency_replies_added, 400);''',
        "emergency notification assertions",
    ),
    (
        '  assert.equal(realtimeSnapshot.unread_notification_count, 0);',
        '''  assert.equal(realtimeSnapshot.unread_notification_count, 2);

  const initialNotifications = await json(await fetch(
    `${baseUrl}/api/auth/notifications?unread=1`,
    { headers: { Cookie: merchantACookie } },
  ));
  assert.equal(initialNotifications.response.status, 200);
  assert.equal(initialNotifications.body.notifications.length, 2);
  assert.deepEqual(
    initialNotifications.body.notifications
      .map((notification) => notification.type)
      .sort(),
    ["subscription_emergency_activated", "subscription_plan_event"].sort(),
  );''',
        "initial notification assertions",
    ),
    (
        '  assert.equal(partialRealtime.unread_notification_count, 1);',
        '  assert.equal(partialRealtime.unread_notification_count, 3);',
        "partial realtime unread count",
    ),
    (
        '  assert.equal(partialNotifications.body.notifications.length, 1);',
        '  assert.equal(partialNotifications.body.notifications.length, 3);',
        "partial notification count",
    ),
    (
        '  assert.equal(partialNotifications.body.notifications[0].merchant_id, "merchant-a");',
        '''  assert.equal(partialNotifications.body.notifications[0].merchant_id, "merchant-a");
  assert.equal(
    partialNotifications.body.notifications[0].id,
    partialDebtPayment.body.notification.id,
  );''',
        "partial notification identity",
    ),
    (
        '  assert.equal(splitRealtime.unread_notification_count, 2);',
        '  assert.equal(splitRealtime.unread_notification_count, 4);',
        "split realtime unread count",
    ),
    (
        '  assert.equal(splitNotifications.body.notifications.length, 2);',
        '  assert.equal(splitNotifications.body.notifications.length, 4);',
        "split notification count",
    ),
    (
        '  assert.equal(readRealtime.unread_notification_count, 1);',
        '  assert.equal(readRealtime.unread_notification_count, 3);',
        "read realtime unread count",
    ),
    (
        '  assert.equal(unreadAfterMark.body.notifications.length, 1);',
        '  assert.equal(unreadAfterMark.body.notifications.length, 3);',
        "remaining unread notification count",
    ),
]

for old, new, label in replacements:
    test_text = replace_once(test_text, old, new, label)

LIFECYCLE_TEST.write_text(test_text)
print("Fawri subscription notification implementation applied successfully.")
