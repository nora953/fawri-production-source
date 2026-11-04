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

/**
 * Immutable function identities whose ACLs must be checked AFTER their
 * historical migration has been applied. Checking pg_default_acl only before
 * 0038/0039 does not repair an existing function inherited from unsafe defaults.
 */
export const APPLIED_TRUSTED_FUNCTIONS = Object.freeze([
  Object.freeze({
    migration: "0038_role_bound_admin_directory_issuer",
    signature: "public.fawri_issue_admin_directory_audit(text,text,text)",
  }),
  Object.freeze({
    migration: "0039_role_bound_authentication_runtime",
    signature: "public.fawri_authentication_runtime()",
  }),
]);

export const UNTRUSTED_RUNTIME_FUNCTION_GRANTEES = Object.freeze([
  "fawri_staging_rls_runtime",
  "fawri_staging_runtime",
]);

export function assessAppliedTrustedFunctionExecuteReadiness({ applied, actual } = {}) {
  if (!Array.isArray(applied) ||
      applied.some(tag => typeof tag !== "string" || !tag.trim())) {
    throw new TypeError("verified applied migration tags are required");
  }
  const required = APPLIED_TRUSTED_FUNCTIONS.filter(item =>
    applied.includes(item.migration));
  if (required.length === 0) {
    return { required: false, ready: true, reason: "NOT_APPLIED" };
  }
  const invalid = { required: true, ready: false,
    reason: "APPLIED_TRUSTED_FUNCTION_ACL_UNVERIFIED" };
  if (!Array.isArray(actual) || actual.length !== required.length) return invalid;
  for (const target of required) {
    const rows = actual.filter(row => row && row.migration === target.migration);
    if (rows.length !== 1 || rows[0].present !== true ||
        !Array.isArray(rows[0].runtimeExecuteRoles) ||
        rows[0].runtimeExecuteRoles.some(role =>
          !UNTRUSTED_RUNTIME_FUNCTION_GRANTEES.includes(role)) ||
        new Set(rows[0].runtimeExecuteRoles).size !== rows[0].runtimeExecuteRoles.length) {
      return invalid;
    }
    if (rows[0].runtimeExecuteRoles.length > 0) {
      return { required: true, ready: false,
        reason: "APPLIED_TRUSTED_FUNCTION_RUNTIME_EXECUTE_LEAK" };
    }
  }
  return { required: true, ready: true,
    reason: "APPLIED_TRUSTED_FUNCTION_ACLS_SCOPED" };
}
