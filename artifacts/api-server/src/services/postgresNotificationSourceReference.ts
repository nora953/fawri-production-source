// FIELD002-R2: New canonical PostgreSQL notifications must retain both
// provenance columns. Existing historical NULL/NULL records remain untouched.
export function requireNotificationSourceReference(
  sourceEntityType: unknown,
  sourceEntityId: unknown,
): { sourceEntityType: string; sourceEntityId: string } {
  const type = typeof sourceEntityType === "string" ? sourceEntityType.trim() : "";
  const id = typeof sourceEntityId === "string" ? sourceEntityId.trim() : "";
  if (!type || !id) {
    throw Object.assign(new Error("notification source reference required"), {
      code: "NOTIFICATION_SOURCE_REFERENCE_REQUIRED",
    });
  }
  return { sourceEntityType: type, sourceEntityId: id };
}

/** FIELD002-R3: Preserve historical compatibility reads, but forbid new
 * PostgreSQL notifications under the three deprecated subscription types. */
const LEGACY_READ_ONLY_NOTIFICATION_TYPES = new Set([
  "subscription_balance_purchase",
  "subscription_plan_event",
  "subscription_emergency_activated",
]);

export function assertNotificationTypeWritable(notificationType: unknown): void {
  const type = typeof notificationType === "string" ? notificationType.trim() : "";
  if (LEGACY_READ_ONLY_NOTIFICATION_TYPES.has(type)) {
    throw Object.assign(new Error("legacy notification type is read-only"), {
      code: "NOTIFICATION_LEGACY_TYPE_READ_ONLY",
    });
  }
}
