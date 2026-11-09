/**
 * FT-01 first-commercial cashier 0052 startup profile selector.
 *
 * This is a SOURCE-PINNED, EXPLICIT, FAIL-CLOSED opt-in. It never writes SQL,
 * provisions roles, admits historical backups, or approves launch/deployment.
 * Production must separately pass restricted LOGIN, RLS, provider and recovery
 * admission. The canonical-owner profile is unchanged unless selected.
 */
import {
  assertField002FirstCommercialSourcePolicy,
} from '../../../../scripts/lib/field002-r2-precommercial-source-admission.mjs';

export const FT01_CASHIER_STORAGE_PROFILE_ENV = 'FAWRI_CASHIER_STORAGE_PROFILE';
export const FT01_INVOKER_0052_SHA_ENV = 'FAWRI_FT01_REVIEWED_INVOKER_0052_SHA256';
export const FT01_ROLE_RESERVATION_SHA_ENV = 'FAWRI_FT01_REVIEWED_FOUR_ROLE_SQL_SHA256';
export const FT01_INVOKER_PROFILE = 'first-commercial-invoker-v1';
export const FT01_CANONICAL_PROFILE = 'canonical-owner-v1';
// Compile-time release candidate fingerprints; tested against the exact
// canonical Drizzle 0052, held variant, role SQL and project/branch source.
// Do NOT read migration files from a bundled API process: those paths refer
// to the bundler output and could crash every worker before listener setup.
// These source pins do not constitute independent hosted attestation.
export const FT01_PINNED_FIRST_COMMERCIAL_SOURCE = Object.freeze({
  projectId: 'crimson-cherry-65705041',
  branchId: 'br-holy-waterfall-b993zglb',
  database: 'fawri',
  postgresMajor: 18,
  canonical0052Sha256: 'aaf7ee97fbdef0c1b4600e905216117ee8ff89f31ccd67d783ab61a9c4bd9b8e',
  variant0052Sha256: '4879d09310a651580a23efcae60bba71b14ceae43b5cc84840f2e53a2bbfed09',
  fourRoleReservationSha256: 'ad152346f7f02447db656bd1d04a76d1f7ba3a78ebe218dc2b4e0355b2bf152e',
});

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
  // Source/journal invariants are checked at CI against these pinned digests;
  // the packaged server must never import source-only CLI/readFile code.
  const plan = FT01_PINNED_FIRST_COMMERCIAL_SOURCE;
  const variantSha = String(env[FT01_INVOKER_0052_SHA_ENV] ?? '').trim();
  const rolesSha = String(env[FT01_ROLE_RESERVATION_SHA_ENV] ?? '').trim();
  if (!/^[a-f0-9]{64}$/.test(variantSha) ||
      variantSha !== plan.variant0052Sha256 ||
      !/^[a-f0-9]{64}$/.test(rolesSha) ||
      rolesSha !== plan.fourRoleReservationSha256) {
    fail('EXACT_VARIANT_AND_ROLE_SOURCE_HASHES_REQUIRED');
  }
  if (plan.database !== 'fawri' || plan.postgresMajor !== 18 ||
      plan.projectId !== 'crimson-cherry-65705041' ||
      plan.branchId !== 'br-holy-waterfall-b993zglb') {
    fail('PINNED_FIRST_COMMERCIAL_TARGET_UNTRUSTED');
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
