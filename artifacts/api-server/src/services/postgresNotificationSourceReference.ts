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
