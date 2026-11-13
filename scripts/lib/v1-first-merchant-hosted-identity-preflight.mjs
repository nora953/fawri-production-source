/**
 * V1 launch gate P0-ACCESS-HOSTED-IDENTITY.
 * Pure, source-only acceptance of a manually supplied, bounded pg_roles SELECT.
 * Does not contact Neon, connect to SQL, create identities, handle credentials,
 * assert OAuth scopes or authorize any production rollout.
 *
 * The SQL catalog alone CANNOT attest the provider's project/branch ID.
 * Only use a result after independently selecting the exact new target.
 */
const TARGET = Object.freeze({
  project_id: "crimson-cherry-65705041",
  branch_id: "br-holy-waterfall-b993zglb",
  database_name: "fawri",
  postgres_major: 18,
});

export const V1_REQUIRED_LOGIN_ROLES = Object.freeze([
  "fawri_restricted_runtime",
  "fawri_auth_issuer",
  "fawri_operator_issuer",
]);
const SECURITY_FLAGS = Object.freeze([
  "can_login", "is_superuser", "bypasses_rls",
  "can_create_roles", "can_create_databases",
]);
const reject = code => {
  const error = new Error(code);
  error.code = code;
  throw error;
};
const plain = value => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function validateObservation(target, rows) {
  if (!plain(target) ||
      Object.keys(TARGET).some(key => target[key] !== TARGET[key]) ||
      Object.keys(target).length !== Object.keys(TARGET).length) {
    reject("V1_HOSTED_IDENTITY_TARGET_NOT_ATTESTED");
  }
  if (!Array.isArray(rows) || rows.length !== V1_REQUIRED_LOGIN_ROLES.length) {
    reject("V1_HOSTED_IDENTITY_ROWS_INCOMPLETE");
  }
  const names = new Set();
  for (const row of rows) {
    if (!plain(row) || !V1_REQUIRED_LOGIN_ROLES.includes(row.role_name) ||
        names.has(row.role_name) || typeof row.role_exists !== "boolean") {
      reject("V1_HOSTED_IDENTITY_ROLE_ROW_UNTRUSTED");
    }
    names.add(row.role_name);
    // For missing roles, LEFT JOIN pg_roles may emit NULL. Some export UIs
    // render absence as false. Neither is a security admission.
    for (const key of SECURITY_FLAGS) {
      if (row.role_exists) {
        if (typeof row[key] !== "boolean")
          reject("V1_HOSTED_IDENTITY_ROLE_FLAGS_INCOMPLETE");
      } else if (row[key] !== null && row[key] !== false) {
        reject("V1_HOSTED_IDENTITY_MISSING_ROLE_FLAGS_INVALID");
      }
    }
  }
  if (names.size !== V1_REQUIRED_LOGIN_ROLES.length) {
    reject("V1_HOSTED_IDENTITY_ROLE_NAMES_INCOMPLETE");
  }
}

/**
 * This deliberately NEVER outputs a RELEASE/ROLLOUT/PROVISIONING approval.
 * A positive catalog result still needs genuine independently authenticated
 * session_user/current_user, grant, RLS, pool/direct, and SQL+HTTP evidence.
 */
export function assessV1HostedIdentityCatalog({target, rows} = {}) {
  validateObservation(target, rows);
  const ordered = [...rows].sort((a, b) =>
    V1_REQUIRED_LOGIN_ROLES.indexOf(a.role_name) -
    V1_REQUIRED_LOGIN_ROLES.indexOf(b.role_name));
  const absent = ordered.filter(row => !row.role_exists).map(row => row.role_name);
  const reserved = ordered.filter(row => row.role_exists && !row.can_login)
    .map(row => row.role_name);
  const elevated = ordered.filter(row => row.role_exists &&
    (row.is_superuser || row.bypasses_rls ||
     row.can_create_roles || row.can_create_databases))
    .map(row => row.role_name);
  let status;
  if (absent.length) status = "MISSING_REQUIRED_LOGIN_ROLES";
  else if (reserved.length) status = "NOLOGIN_ROLES_NOT_RUNTIME";
  else if (elevated.length) status = "ELEVATED_ROLE_FLAGS_REJECTED";
  else status = "ROLE_FLAGS_PRELIMINARY_ONLY";

  return Object.freeze({
    gate_id: "P0-ACCESS-HOSTED-IDENTITY",
    target: TARGET,
    status,
    missing_roles: Object.freeze(absent),
    nologin_roles: Object.freeze(reserved),
    elevated_roles: Object.freeze(elevated),
    catalog_rows_assessed: ordered.length,
    sourced_from_user_provided_result: true,
    project_branch_verified_by_sql: false,
    direct_pool_identity_verified: false,
    real_login_and_grants_verified: false,
    hosted_sql_http_accepted: false,
    backup_restore_accepted: false,
    source_only: true,
    role_provisioning_authorized: false,
    hosted_sql_authorized: false,
    migration_authorized: false,
    commercial_deployment_authorized: false,
    p0_closed: false,
  });
}
