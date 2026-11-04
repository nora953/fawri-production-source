// Read-only assessment of implicit EXECUTE grants that can be applied when
// privileged auth/operator functions are created by migrations 0038/0039.
// Never provision roles or change PostgreSQL ACLs from this preflight.
export const TRUSTED_FUNCTION_CREATION_MIGRATIONS = Object.freeze([
  "0038_role_bound_admin_directory_issuer",
  "0039_role_bound_authentication_runtime",
]);

export function assessDefaultFunctionExecuteReadiness({
  pending,
  nonOwnerDefaultExecuteGrants,
} = {}) {
  if (!Array.isArray(pending) || pending.some(
    (name) => typeof name !== "string" || !name.trim(),
  )) {
    throw new TypeError("a verified migration journal is required");
  }
  const required = pending.some((tag) =>
    TRUSTED_FUNCTION_CREATION_MIGRATIONS.includes(tag));
  if (!required) {
    return { required: false, ready: true, reason: "NOT_PENDING" };
  }
  if (!Number.isSafeInteger(nonOwnerDefaultExecuteGrants) ||
      nonOwnerDefaultExecuteGrants < 0) {
    return {
      required: true,
      ready: false,
      reason: "DEFAULT_FUNCTION_GRANTS_UNVERIFIED",
    };
  }
  if (nonOwnerDefaultExecuteGrants !== 0) {
    return {
      required: true,
      ready: false,
      reason: "DEFAULT_FUNCTION_EXECUTE_WOULD_LEAK",
    };
  }
  return {
    required: true,
    ready: true,
    reason: "NO_NONOWNER_DEFAULT_FUNCTION_EXECUTE",
  };
}
