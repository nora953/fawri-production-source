import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDisposablePostgres, validateDisposablePostgresTarget } from './lib/disposable-postgres-test-guard.mjs';
import { cleanupResources } from '../artifacts/api-server/tests/helpers/cleanup-resources.mjs';

const runId = 'a'.repeat(32);
const proof = { format: 'fawri-disposable-pg-v1', runId, containerId: 'b'.repeat(64), networkMode: 'none', networkNamespace: 'net:[123]' };
const environment = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://fawri_ci:synthetic@127.0.0.1:5432/fawri_ci', FAWRI_DISPOSABLE_PG_RUN_ID: runId, FAWRI_DISPOSABLE_PG_ATTESTATION: '/proof.json' };
const io = { read: () => JSON.stringify(proof), interfaces: () => ['lo'], namespace: () => 'net:[123]' };
const denied = /attestation rejected/;

for (const [name, changes] of [
  ['absent URL', { DATABASE_URL: undefined }],
  ['remote Neon', { DATABASE_URL: 'postgresql://owner:placeholder@host.neon.tech/neondb' }],
  ['remote IP', { DATABASE_URL: 'postgresql://fawri_ci:placeholder@10.0.0.1:5432/fawri_ci' }],
  ['wrong database', { DATABASE_URL: environment.DATABASE_URL.replace('/fawri_ci', '/neondb') }],
  ['wrong role', { DATABASE_URL: environment.DATABASE_URL.replace('fawri_ci:', 'owner:') }],
  ['libpq options override', { DATABASE_URL: environment.DATABASE_URL + '?host=staging' }],
  ['wrong run', { FAWRI_DISPOSABLE_PG_RUN_ID: 'c'.repeat(32) }],
  ['production', { NODE_ENV: 'production' }],
]) test(`reject ${name} before application pool creation`, () => assert.throws(() => validateDisposablePostgresTarget({ ...environment, ...changes }, io), denied));

test('loopback tunnel/environment flags are insufficient', () => {
  assert.throws(() => validateDisposablePostgresTarget(environment, { ...io, interfaces: () => ['lo', 'eth0'] }), denied);
  assert.throws(() => validateDisposablePostgresTarget(environment, { ...io, namespace: () => 'net:[999]' }), denied);
  assert.throws(() => validateDisposablePostgresTarget(environment, { ...io, read: () => '{broken' }), denied);
});

test('valid offline namespace attestation permits read-only identity probe', async () => {
  const calls = [];
  class Client {
    async connect() { calls.push('connect'); }
    async query(sql) {
      assert.match(sql, /^SELECT /);
      assert.match(sql, /host\(inet_server_addr\(\)\)/, 'inet text can include a /32 mask');
      assert.match(sql, /shobj_description\(oid, 'pg_database'\)/, 'database comments live in shared-object catalog');
      calls.push('query');
      return { rows: [{ database: 'fawri_ci', role: 'fawri_ci', address: '127.0.0.1', marker: `fawri-disposable:${runId}` }] };
    }
    async end() { calls.push('end'); }
  }
  await assertDisposablePostgres(environment, { io, Client });
  assert.deepEqual(calls, ['connect', 'query', 'end']);
});

test('mismatched instance marker refuses writes and closes probe', async () => {
  let ended = false;
  class Client {
    async connect() {}
    async query() { return { rows: [{ database: 'fawri_ci', role: 'fawri_ci', address: '127.0.0.1', marker: 'wrong-run' }] }; }
    async end() { ended = true; }
  }
  await assert.rejects(assertDisposablePostgres(environment, { io, Client }), denied);
  assert.equal(ended, true);
});

test('unsafe target never constructs even the probe client', async () => {
  class Client { constructor() { assert.fail('probe must not be constructed'); } }
  await assert.rejects(assertDisposablePostgres({ ...environment, NODE_ENV: 'production' }, { io, Client }), denied);
});

test('setup failure still tears down registered resources', async () => {
  const calls = [];
  const resources = [['fixture', async () => calls.push('fixture')], ['pool', async () => calls.push('pool')]];
  await assert.rejects((async () => { try { throw new Error('setup failure'); } finally { await cleanupResources(resources); } })(), /setup failure/);
  assert.deepEqual(calls, ['fixture', 'pool']);
});

test('cleanup failures cannot give a green result or prevent later cleanup; redact driver detail', async () => {
  const calls = [];
  await assert.rejects(cleanupResources([
    ['fixture', async () => { calls.push('fixture'); throw new Error('postgresql://secret-host/password'); }],
    ['pool', async () => calls.push('pool')],
    ['directory', async () => { calls.push('directory'); throw new Error('private payload'); }],
  ]), error => {
    assert.equal(error.errors.length, 2);
    assert.doesNotMatch(error.errors.map(x => x.message).join(' '), /secret-host|private payload/);
    return true;
  });
  assert.deepEqual(calls, ['fixture', 'pool', 'directory']);
});

test('real MJS entrypoints reject remote target without loading application DB', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const file of ['tenant-transaction-scope-postgres.integration.test.mjs', 'authentication-operator-pool-postgres.integration.test.mjs', 'receipt-operator-pool-postgres.integration.test.mjs', 'receipt-review-operator-pool-postgres.integration.test.mjs', 'receipt-execution-operator-pool-postgres.integration.test.mjs', 'global-merchant-auth-bootstrap-postgres.integration.test.mjs', 'global-merchant-golden-journey.integration.test.mjs', 'merchant-deletion-tenant-rls.integration.test.mjs']) {
    const result = spawnSync(process.execPath, ['--test', `artifacts/api-server/tests/${file}`], {
      env: { NODE_ENV: 'test', DATABASE_URL: 'postgresql://synthetic:placeholder@staging.invalid/neondb' }, encoding: 'utf8', timeout: 10000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, denied);
    assert.doesNotMatch(result.stdout + result.stderr, /ERR_MODULE_NOT_FOUND|ECONNREFUSED|getaddrinfo/);
  }
});
