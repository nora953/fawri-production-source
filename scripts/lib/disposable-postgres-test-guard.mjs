import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const deny = () => { throw new Error('Disposable PostgreSQL attestation rejected; no application DB import permitted'); };

// The runner creates the attestation after starting its own network-none container.
// A localhost URL or an environment flag alone is deliberately insufficient.
export function validateDisposablePostgresTarget(env = process.env, io = {
  read: file => fs.readFileSync(file, 'utf8'),
  interfaces: () => Object.keys(os.networkInterfaces()),
  namespace: () => fs.readlinkSync('/proc/self/ns/net'),
}) {
  let url, proof;
  try {
    url = new URL(env.DATABASE_URL);
    proof = JSON.parse(io.read(env.FAWRI_DISPOSABLE_PG_ATTESTATION));
  } catch { return deny(); }
  if (env.NODE_ENV !== 'test' || env.FAWRI_DISPOSABLE_PG_RUN_ID !== proof.runId ||
      !/^[a-f0-9]{32}$/.test(proof.runId || '') ||
      proof.format !== 'fawri-disposable-pg-v1' ||
      proof.networkMode !== 'none' || !/^[a-f0-9]{64}$/.test(proof.containerId || '') ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' || url.port !== '5432' ||
      url.pathname !== '/fawri_ci' || url.username !== 'fawri_ci' ||
      !url.password || url.search || url.hash) return deny();
  try {
    if (io.namespace() !== proof.networkNamespace ||
        io.interfaces().some(name => name !== 'lo')) return deny();
  } catch { return deny(); }
  return { runId: proof.runId, connectionString: url.toString() };
}

export async function assertDisposablePostgres(env = process.env, dependencies = {}) {
  const target = validateDisposablePostgresTarget(env, dependencies.io);
  // Only this read-only, short-lived probe is permitted before DB application imports.
  const Client = dependencies.Client || createRequire(new URL('../../lib/db/package.json', import.meta.url))('pg').Client;
  const client = new Client({ connectionString: target.connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  try {
    await client.connect();
    const result = await client.query(`SELECT current_database() AS database, current_user AS role,
      inet_server_addr()::text AS address, shobj_description(oid, 'pg_database') AS marker
      FROM pg_database WHERE datname = current_database()`);
    const row = result.rows[0];
    if (row?.database !== 'fawri_ci' || row.role !== 'fawri_ci' || row.address !== '127.0.0.1' ||
        row.marker !== `fawri-disposable:${target.runId}`) deny();
  } catch { deny(); }
  finally { await client.end(); }
}
