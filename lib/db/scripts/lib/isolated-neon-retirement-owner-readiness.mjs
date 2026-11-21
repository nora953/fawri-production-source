// Read-only, fail-closed readiness decision for a pending 0052 migration.
// Do not modify a committed historical SQL migration to work around hosted role ownership.
export const CASHIER_RETIREMENT_MIGRATION = '0052_cashier_stream_receipt_storage';

const unsafeOwnerFlags = [
  'rolcanlogin', 'rolsuper', 'rolbypassrls', 'rolcreatedb',
  'rolcreaterole', 'rolinherit', 'rolreplication',
];

export function assessIsolatedRetirementOwnerReadiness({
  pending,
  ownerRole,
  ownerMembershipCount,
  executorSuperuser,
  sessionSuperuser,
}) {
  if (!Array.isArray(pending) || !pending.every(tag => typeof tag === 'string')) {
    throw new TypeError('pending migration tags must be an array of strings');
  }
  if (!pending.includes(CASHIER_RETIREMENT_MIGRATION)) {
    return { required: false, ready: true, reason: 'NOT_PENDING' };
  }
  if (!ownerRole || ownerRole.rolname !== 'fawri_cashier_retirement_owner') {
    return { required: true, ready: false, reason: 'OWNER_ROLE_NOT_PREPROVISIONED' };
  }
  if (unsafeOwnerFlags.some(flag => ownerRole[flag] !== false)) {
    return { required: true, ready: false, reason: 'OWNER_ROLE_FLAGS_UNSAFE' };
  }
  // An ADMIN-only membership is still a membership. Neon may add one automatically.
  if (!Number.isSafeInteger(ownerMembershipCount) || ownerMembershipCount !== 0) {
    return { required: true, ready: false, reason: 'OWNER_HAS_ROLE_MEMBERSHIP' };
  }
  // With zero memberships, a non-superuser has no SET ROLE permission and
  // cannot ALTER FUNCTION OWNER TO the isolated owner. Do not grant SET and leave
  // an implicit Neon ADMIN membership in place just to pass the migration.
  if (executorSuperuser !== true || sessionSuperuser !== true) {
    return { required: true, ready: false, reason: 'OWNER_HANDOFF_REQUIRES_TRUSTED_SUPERUSER' };
  }
  return { required: true, ready: true, reason: 'TRUSTED_OWNER_HANDOFF_PRECONDITIONS_MET' };
}
