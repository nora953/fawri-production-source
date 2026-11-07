import assert from "node:assert/strict";
import test from "node:test";
import { assertNotificationTypeWritable, requireNotificationSourceReference } from "../src/services/postgresNotificationSourceReference";

test("FIELD002-R2 requires both new notification source reference fields", () => {
  assert.deepEqual(requireNotificationSourceReference("subscription", "sub-1"), {
    sourceEntityType: "subscription", sourceEntityId: "sub-1",
  });
  assert.deepEqual(requireNotificationSourceReference(" subscription ", " sub-1 "), {
    sourceEntityType: "subscription", sourceEntityId: "sub-1",
  });
  for (const [type, id] of [
    [undefined, undefined], [null, "sub-1"], ["subscription", null],
    ["", "sub-1"], ["subscription", ""], ["  ", "sub-1"],
    ["subscription", "  "], [2, "sub-1"], ["subscription", 2],
  ]) {
    assert.throws(() => requireNotificationSourceReference(type, id), (error: unknown) =>
      error instanceof Error &&
      (error as Error & { code?: string }).code === "NOTIFICATION_SOURCE_REFERENCE_REQUIRED",
    );
  }
});

test("FIELD002-R3 historic notification types cannot be issued again", () => {
  for (const type of [
    "subscription_balance_purchase",
    "subscription_plan_event",
    "subscription_emergency_activated",
    " subscription_plan_event ",
  ]) {
    assert.throws(() => assertNotificationTypeWritable(type), (error: unknown) =>
      error instanceof Error &&
      (error as Error & { code?: string }).code === "NOTIFICATION_LEGACY_TYPE_READ_ONLY",
    );
  }
  for (const type of [
    "subscription_expiry_reminder",
    "subscription_expired",
    "addon_expiry_reminder",
    "support_reply_reminder",
    "inspection_session_request",
    "operational_payment_conflict",
    "operational_customer_message",
    "operational_knowledge_gap",
  ]) {
    assert.doesNotThrow(() => assertNotificationTypeWritable(type));
  }
  // A direct helper test is not approval to activate a new-order caller.
  assert.doesNotThrow(() => assertNotificationTypeWritable("operational_new_order"));
});
