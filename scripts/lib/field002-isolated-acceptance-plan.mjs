import { createHash } from 'node:crypto';
export const CLONE_HOST = 'ep-soft-wildflower-b1i4j4xu.c-5.eu-central-1.aws.neon.tech';
export const CLONE_BRANCH = 'br-young-hill-b1x9vhlz';
export const LEDGER_HASH = '1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea';
export const CLEAN_CLONE_HOST = 'ep-withered-union-b1jh284c.c-5.eu-central-1.aws.neon.tech';
export const CLEAN_CLONE_BRANCH = 'br-polished-mouse-b1proel7';

// Immutable, exact endpoint allowlist. Never build a target host from
// environment variables, arbitrary URLs, a branch name, or the Neon default.
const profiles = Object.freeze({
  cleaned_20261104: Object.freeze({
    name: 'cleaned_20261104', host: CLONE_HOST, branch: CLONE_BRANCH,
    ledgerHash: LEDGER_HASH, notifications: 0,
  }),
  clean_20261106: Object.freeze({
    name: 'clean_20261106', host: CLEAN_CLONE_HOST, branch: CLEAN_CLONE_BRANCH,
    ledgerHash: LEDGER_HASH, notifications: 0,
  }),
});
export function selectCloneProfile(name) {
  if (typeof name !== 'string' || !Object.hasOwn(profiles, name)) {
    throw Error('FIELD002_CLONE_PROFILE_REJECTED');
  }
  return profiles[name];
}
function assertAllowedProfile(profile) {
  if (!Object.values(profiles).includes(profile)) throw Error('FIELD002_CLONE_PROFILE_REJECTED');
}


export function parseCloneAdminUrl(value, profile = selectCloneProfile('cleaned_20261104')) {
  assertAllowedProfile(profile);
  let url;
  try { url = new URL(value); } catch { throw Error('FIELD002_CLONE_ADMIN_URL_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== profile.host ||
      (url.port && url.port !== '5432') || url.pathname !== '/neondb' ||
      url.username !== 'neondb_owner' || !url.password || url.hash ||
      [...url.searchParams].some(([key, val]) =>
        !((key === 'sslmode' && ['require', 'verify-full'].includes(val)) ||
          (key === 'channel_binding' && val === 'require')))) {
    throw Error('FIELD002_CLONE_TARGET_REJECTED');
  }
  // Deliberately do not forward arbitrary libpq options or inherited DATABASE_URL.
  return { host: profile.host, port: 5432, database: 'neondb', user: 'neondb_owner',
    password: decodeURIComponent(url.password), ssl: { rejectUnauthorized: true, servername: profile.host },
    enableChannelBinding: true, connectionTimeoutMillis: 5000, query_timeout: 15000, statement_timeout: 12000 };
}

export function roleNames(runId) {
  if (!/^[a-f0-9]{24}$/.test(runId || '')) throw Error('FIELD002_RUN_ID_REJECTED');
  return [`field002_t_${runId}`, `field002_a_${runId}`];
}

// Third trusted issuer must have a distinct ephemeral principal. Never
// reuse tenant/auth LOGINs or accept role names from deployment inputs.
export function operatorRoleName(runId) {
  if (!/^[a-f0-9]{24}$/.test(runId || '')) throw Error('FIELD002_RUN_ID_REJECTED');
  return `field002_o_${runId}`;
}

export function compileRehearsedGrants(source, runId) {
  if (createHash('sha256').update(source).digest('hex') !==
      '32abaf3d4d4394fede2214a7eae9324fa66192e1cd82a9b2effdf5cdd55aefe5') {
    throw Error('FIELD002_GRANT_SOURCE_REJECTED');
  }
  const names = roleNames(runId);
  // Extract only previously rehearsed GRANT statements. Never execute the
  // rehearsal's CREATE/transaction/DO statements as a provisioning script.
  const grants = source.split(/-- statement-breakpoint\s*/).map(s => s.trim())
    .filter(s => s.startsWith('GRANT '));
  if (grants.length !== 13 || grants.some(s => !/^GRANT [\s\S]+ TO field002_(?:tenant|auth)_probe_20261104(?:, field002_auth_probe_20261104)?;$/.test(s) ||
      /\bALL\b|\bDELETE\b|\bTRUNCATE\b|\bCREATEROLE\b|\bCASCADE\b/.test(s))) {
    throw Error('FIELD002_GRANT_SOURCE_REJECTED');
  }
  const mapped = grants.map(s => s.replaceAll('field002_tenant_probe_20261104', names[0])
    .replaceAll('field002_auth_probe_20261104', names[1]));
  return { names, grants: mapped,
    revokes: [...mapped].reverse().map(s => s.replace(/^GRANT /, 'REVOKE ').replace(/ TO /, ' FROM ')) };
}

export function compileOperatorGrants(role) {
  if (!/^field002_o_[a-f0-9]{24}$/.test(role)) {
    throw Error('FIELD002_OPERATOR_ROLE_REJECTED');
  }
  const functions = Object.freeze([
    'public.fawri_issue_admin_directory_audit(text,text,text)',
    'public.fawri_read_verified_payment_receipts(text,integer,timestamptz,text,text,text)',
    'public.fawri_review_verified_payment_receipt(text,text,text,text,text,text)',
    'public.fawri_authorize_verified_receipt_replay(text,text,text,text,text,text,text,text)',
  ]);
  const grants = [
    `GRANT CONNECT ON DATABASE neondb TO ${role}`,
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    ...functions.map(fn => `GRANT EXECUTE ON FUNCTION ${fn} TO ${role}`),
  ];
  return {
    functions, grants,
    revokes: [...grants].reverse().map(sql =>
      sql.replace(/^GRANT /, 'REVOKE ').replace(/ TO /, ' FROM ')),
  };
}

export function restrictedUrl(role, password, profile = selectCloneProfile('cleaned_20261104')) {
  assertAllowedProfile(profile);
  if (!/^field002_[tao]_[a-f0-9]{24}$/.test(role) || !/^[a-f0-9]{64}$/.test(password)) {
    throw Error('FIELD002_RUNTIME_CREDENTIAL_FORMAT_REJECTED');
  }
  const url = new URL('postgresql://' + profile.host + '/neondb');
  url.username = role; url.password = password;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

/**
 * Snapshot catalogued tables and sequences without treating a PostgreSQL
 * sequence (relkind S) as a composite table row (SQLSTATE 42809).
 * Keep the sequence state in the same deterministic row-count/hash comparison.
 */
export function snapshotObjectStatement(object, ordinal) {
  const { nspname, relname, relkind } = object ?? {};
  if (!['public', 'fawri_security', 'drizzle'].includes(nspname) ||
      !['r', 'p', 'S'].includes(relkind) ||
      typeof relname !== 'string' || !relname || relname.length > 63 ||
      !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= 300) {
    throw Error('FIELD002_SNAPSHOT_OBJECT_REJECTED');
  }
  const q = name => '"' + name.replaceAll('"', '""') + '"';
  const row = relkind === 'S'
    ? "jsonb_build_object('last_value',t.last_value,'log_cnt',t.log_cnt,'is_called',t.is_called)"
    : 'to_jsonb(t)';
  const hash = `md5(${row}::text)`;
  return `SELECT ${ordinal}::int AS ordinal,count(*)::text AS count,
    md5(coalesce(string_agg(${hash},'' ORDER BY ${hash}),'')) AS hash
    FROM ${q(nspname)}.${q(relname)} t`;
}
