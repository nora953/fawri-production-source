import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

function activeEnvAssignments(source) {
  const assignments = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) assignments.set(match[1], match[2]);
  }
  return assignments;
}

test('staging environment template keeps PostgreSQL authority required and external providers disabled', async () => {
  const env = await read('.env.staging.example');
  const values = activeEnvAssignments(env);

  assert.equal(values.get('NODE_ENV'), 'production');
  assert.equal(values.get('FAWRI_OPERATIONAL_POSTGRES_AUTHORITY'), 'required');
  assert.equal(values.get('FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY'), 'required');
  assert.equal(values.get('FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY'), 'required');
  assert.equal(values.get('FAWRI_DISABLE_JOB_WORKERS'), '1');
  assert.equal(values.get('FAWRI_META_CUTOVER_READY'), '0');
  assert.equal(values.get('FAWRI_META_REPLY_TRANSPORT'), 'disabled');
  assert.equal(values.get('FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER'), 'disabled');

  for (const forbidden of [
    'FAWRI_PRODUCTION_RELEASE_GATE',
    'FAWRI_META_CREDENTIAL_PROVIDER',
    'FAWRI_META_AWS_KMS_KEY_ARN',
    'FAWRI_META_AWS_REGION',
    'META_APP_ID',
    'META_APP_SECRET',
    'META_CONFIG_ID',
    'META_VERIFY_TOKEN',
    'OPENAI_API_KEY',
  ]) {
    assert.equal(values.has(forbidden), false, `${forbidden} must not be active in staging template`);
  }
});

test('staging Dockerfile packages one same-origin web/API runtime with fail-closed external defaults', async () => {
  const dockerfile = await read('Dockerfile.staging');

  assert.match(dockerfile, /FROM node:22-bookworm-slim AS build/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS runtime/);
  assert.match(dockerfile, /pnpm --filter @workspace\/fawri build/);
  assert.match(dockerfile, /pnpm --filter @workspace\/api-server build/);
  assert.match(dockerfile, /FAWRI_WEB_DIST_DIR=\/app\/artifacts\/fawri\/dist\/public/);
  assert.match(dockerfile, /FAWRI_DISABLE_JOB_WORKERS=1/);
  assert.match(dockerfile, /FAWRI_META_CUTOVER_READY=0/);
  assert.match(dockerfile, /FAWRI_META_REPLY_TRANSPORT=disabled/);
  assert.match(dockerfile, /FAWRI_KNOWLEDGE_EMBEDDING_PROVIDER=disabled/);
  assert.match(dockerfile, /COPY --from=build \/app\/artifacts\/api-server\/dist \/app\/artifacts\/api-server\/dist/);
  assert.match(dockerfile, /COPY --from=build \/app\/artifacts\/fawri\/dist\/public \/app\/artifacts\/fawri\/dist\/public/);
  assert.match(dockerfile, /CMD \["node", "--enable-source-maps", "\/app\/artifacts\/api-server\/dist\/index\.mjs"\]/);

  assert.doesNotMatch(dockerfile, /FAWRI_PRODUCTION_RELEASE_GATE=/);
  assert.doesNotMatch(dockerfile, /META_APP_SECRET=/);
  assert.doesNotMatch(dockerfile, /OPENAI_API_KEY=/);
});

test('staging documentation preserves same-origin manual-QA boundary', async () => {
  const contract = await read('docs/staging-deployment-contract.md');

  assert.match(contract, /same HTTPS origin/);
  assert.match(contract, /FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=required/);
  assert.match(contract, /FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY=required/);
  assert.match(contract, /FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY=required/);
  assert.match(contract, /Do \*\*not\*\* set `FAWRI_PRODUCTION_RELEASE_GATE=required`/);
  assert.match(contract, /Do not provide real Meta, OpenAI, billing, or production KMS credentials/);
  assert.match(contract, /This workflow proves repository\/container packaging only/);
});
