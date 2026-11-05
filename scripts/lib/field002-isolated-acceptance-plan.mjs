import { createHash } from 'node:crypto';
export const CLONE_HOST = 'ep-soft-wildflower-b1i4j4xu.c-5.eu-central-1.aws.neon.tech';
export const CLONE_BRANCH = 'br-young-hill-b1x9vhlz';
export const LEDGER_HASH = '1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea';

export function parseCloneAdminUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('FIELD002_CLONE_ADMIN_URL_REQUIRED'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== CLONE_HOST ||
      (url.port && url.port !== '5432') || url.pathname !== '/neondb' ||
      url.username !== 'neondb_owner' || !url.password || url.hash ||
      [...url.searchParams].some(([key, val]) =>
        !((key === 'sslmode' && ['require', 'verify-full'].includes(val)) ||
          (key === 'channel_binding' && val === 'require')))) {
    throw Error('FIELD002_CLONE_TARGET_REJECTED');
  }
  // Deliberately do not forward arbitrary libpq options or inherited DATABASE_URL.
  return { host: CLONE_HOST, port: 5432, database: 'neondb', user: 'neondb_owner',
    password: decodeURIComponent(url.password), ssl: { rejectUnauthorized: true, servername: CLONE_HOST },
    enableChannelBinding: true, connectionTimeoutMillis: 5000, query_timeout: 15000, statement_timeout: 12000 };
}

export function roleNames(runId) {
  if (!/^[a-f0-9]{24}$/.test(runId || '')) throw Error('FIELD002_RUN_ID_REJECTED');
  return [`field002_t_${runId}`, `field002_a_${runId}`];
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

export function restrictedUrl(role, password) {
  if (!/^field002_[ta]_[a-f0-9]{24}$/.test(role) || !/^[a-f0-9]{64}$/.test(password)) {
    throw Error('FIELD002_RUNTIME_CREDENTIAL_FORMAT_REJECTED');
  }
  const url = new URL('postgresql://' + CLONE_HOST + '/neondb');
  url.username = role; url.password = password;
  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}
