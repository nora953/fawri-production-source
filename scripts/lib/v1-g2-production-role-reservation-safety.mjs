/**
 * FAWRI V1 G2: exact owner-opt-in, one-time NOLOGIN reservation guard.
 * This file alone performs no database calls or writes.
 */
export const G2_RESERVATION_TARGET = Object.freeze({
  project: 'crimson-cherry-65705041',
  branch: 'br-holy-waterfall-b993zglb',
  database: 'fawri',
  host: 'ep-polished-poetry-b9jpvn4r.c-7.eu-central-1.aws.neon.tech',
  owner: 'fawri_owner',
  commitMessage: 'FAWRI_V1_OWNER_AUTHORIZED_G2_NOLOGIN_RESERVATION',
});
const fail = code => { const e = new Error(code); e.code = code; throw e; };
export function assertG2OptIn(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' ||
      env.GITHUB_REPOSITORY !== 'nora953/fawri-production-source' ||
      env.GITHUB_EVENT_NAME !== 'push' ||
      env.GITHUB_REF !== 'refs/heads/fix/p0-provider-receipt-order-discovery-20261015' ||
      env.GITHUB_ACTOR !== 'nora953' ||
      env.FAWRI_V1_G2_ROLE_RESERVATION_ENABLED !== '1' ||
      env.FAWRI_V1_G2_COMMIT_MESSAGE !== G2_RESERVATION_TARGET.commitMessage) {
    fail('V1_G2_ROLE_RESERVATION_NOT_AUTHORIZED');
  }
  return true;
}
export function parseG2OwnerUrl(value) {
  let url;
  try { url = new URL(value ?? ''); }
  catch { fail('V1_G2_OWNER_URL_MISSING'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
      url.hostname !== G2_RESERVATION_TARGET.host ||
      !['','5432'].includes(url.port) ||
      decodeURIComponent(url.username) !== G2_RESERVATION_TARGET.owner ||
      decodeURIComponent(url.pathname) !== '/' + G2_RESERVATION_TARGET.database ||
      !url.password || url.hash) {
    fail('V1_G2_WRONG_PRODUCTION_TARGET');
  }
  const keys = [...url.searchParams.keys()];
  if (keys.length !== new Set(keys).size ||
      keys.some(k => !['sslmode', 'channel_binding'].includes(k)) ||
      !['require','verify-full'].includes(url.searchParams.get('sslmode')) ||
      (url.searchParams.has('channel_binding') &&
        url.searchParams.get('channel_binding') !== 'require')) {
    fail('V1_G2_TLS_OPTIONS_DENIED');
  }
  return true;
}
export function assertG2Preimage(row) {
  if (!row || row.db !== G2_RESERVATION_TARGET.database ||
      row.login !== G2_RESERVATION_TARGET.owner ||
      row.active !== G2_RESERVATION_TARGET.owner ||
      Number(row.major) !== 18 ||
      Number(row.nonsystem_relations) !== 0 ||
      Number(row.drizzle_ledger) !== 0 ||
      Number(row.reserved_roles) !== 0 ||
      row.owner_can_create_roles !== true ||
      row.owner_can_see_stats !== true) {
    fail('V1_G2_NONEMPTY_OR_WRONG_PREIMAGE');
  }
  return true;
}
export function assertG2Postimage(rows) {
  const allowed = new Set([
    'fawri_restricted_runtime', 'fawri_auth_issuer',
    'fawri_operator_issuer', 'fawri_cashier_retirement_writer',
  ]);
  if (!Array.isArray(rows) || rows.length !== 4 ||
      rows.some(r => !allowed.delete(r.name) ||
        r.can_login !== false || r.inherit !== false ||
        r.superuser !== false || r.bypass_rls !== false ||
        r.can_create_roles !== false || r.can_create_db !== false ||
        r.replication !== false ||
        r.outgoing_membership !== 0 ||
        r.inbound_creator_only !== 1 || r.inbound_count !== 1 ||
        r.public_create !== false) ||
      allowed.size !== 0) {
    fail('V1_G2_POSTIMAGE_PRIVILEGE_VIOLATION');
  }
  return true;
}
