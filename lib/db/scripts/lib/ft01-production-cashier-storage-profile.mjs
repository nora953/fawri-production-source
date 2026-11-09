/**
 * FT-01 first-commercial cashier 0052 startup profile selector.
 *
 * This is a SOURCE-PINNED, EXPLICIT, FAIL-CLOSED opt-in. It never writes SQL,
 * provisions roles, admits historical backups, or approves launch/deployment.
 * Production must separately pass restricted LOGIN, RLS, provider and recovery
 * admission. The canonical-owner profile is unchanged unless selected.
 */
import {
  buildFt01FirstCommercialInvokerReviewPlan,
} from '../../../../scripts/lib/ft01-first-commercial-invoker-source-plan.mjs';
import {
  assertField002FirstCommercialSourcePolicy,
} from '../../../../scripts/lib/field002-r2-precommercial-source-admission.mjs';

export const FT01_CASHIER_STORAGE_PROFILE_ENV = 'FAWRI_CASHIER_STORAGE_PROFILE';
export const FT01_INVOKER_0052_SHA_ENV = 'FAWRI_FT01_REVIEWED_INVOKER_0052_SHA256';
export const FT01_ROLE_RESERVATION_SHA_ENV = 'FAWRI_FT01_REVIEWED_FOUR_ROLE_SQL_SHA256';
export const FT01_INVOKER_PROFILE = 'first-commercial-invoker-v1';
export const FT01_CANONICAL_PROFILE = 'canonical-owner-v1';

function fail(code) {
  const e = new Error('FT01 cashier storage profile is not source-verified');
  e.code = 'FT01_CASHIER_PROFILE_NOT_APPROVED';
  e.reason = code;
  throw e;
}

export function selectFt01CashierStorageProfile(env = {}) {
  const raw = String(env[FT01_CASHIER_STORAGE_PROFILE_ENV] ?? '').trim();
  if (raw === '' || raw === FT01_CANONICAL_PROFILE) {
    return Object.freeze({mode: 'canonical', explicitOptIn: false});
  }
  if (raw !== FT01_INVOKER_PROFILE) fail('UNKNOWN_STORAGE_PROFILE');
  const manifest = String(env.FAWRI_FIRST_COMMERCIAL_SOURCE_MANIFEST_JSON ?? '');
  if (!manifest || manifest.length > 4096) fail('FIRST_COMMERCIAL_SOURCE_MANIFEST_REQUIRED');
  try {
    assertField002FirstCommercialSourcePolicy(JSON.parse(manifest));
  } catch {
    fail('FIRST_COMMERCIAL_SOURCE_NOT_VERIFIED');
  }
  let plan;
  try {
    plan = buildFt01FirstCommercialInvokerReviewPlan();
  } catch {
    fail('SOURCE_JOURNAL_OR_STAGE_NOT_VERIFIED');
  }
  const variantSha = String(env[FT01_INVOKER_0052_SHA_ENV] ?? '').trim();
  const rolesSha = String(env[FT01_ROLE_RESERVATION_SHA_ENV] ?? '').trim();
  if (!/^[a-f0-9]{64}$/.test(variantSha) ||
      variantSha !== plan.reviewed_invoker_variant_0052_sha256 ||
      !/^[a-f0-9]{64}$/.test(rolesSha) ||
      rolesSha !== plan.four_role_reservation_sql_sha256) {
    fail('EXACT_VARIANT_AND_ROLE_SOURCE_HASHES_REQUIRED');
  }
  if (plan.target.database_name !== 'fawri' ||
      plan.target.postgres_major !== 18 ||
      plan.canonical_source_or_journal_modified !== false ||
      plan.committed_migration_applied !== false ||
      plan.production_startup_profile_adopted !== false ||
      plan.approved_to_execute !== false ||
      plan.commercial_release_authorized !== false) {
    fail('HELD_SOURCE_RELEASE_STATE_UNTRUSTED');
  }
  return Object.freeze({
    mode: 'first-commercial-invoker',
    explicitOptIn: true,
    migrationOwnerRole: 'fawri_owner',
    // Source digests are admission checks, NOT a trusted Neon identity.
    exactCandidateSha256: variantSha,
    exactRoleReservationSha256: rolesSha,
    hostedTargetAttested: false,
    releaseAuthorized: false,
  });
}
