import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fawriRoot = path.resolve(here, '..');
const srcRoot = path.join(fawriRoot, 'src');
const repositoryRoot = path.resolve(fawriRoot, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

test('active Fawri source no longer consumes legacy subscription cache APIs', () => {
  const storePath = path.join(srcRoot, 'lib', 'store.ts');
  const offenders = walk(srcRoot)
    .filter((file) => file !== storePath)
    .flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const names = ['getSubscriptions', 'saveSubscriptions'].filter((name) =>
        source.includes(name),
      );
      return names.map((name) => `${path.relative(srcRoot, file)}:${name}`);
    });

  assert.deepEqual(offenders, []);
});

test('merchant realtime dispatch remains server-event only and never writes subscription browser storage', () => {
  const source = read('artifacts/fawri/src/hooks/useMerchantRealtime.ts');
  assert.match(source, /fetch\('\/api\/auth\/events'/);
  assert.match(source, /credentials: 'include'/);
  assert.match(source, /cache: 'no-store'/);
  assert.doesNotMatch(source, /saveSubscriptions|getSubscriptions|fawri_subscriptions/);
  assert.match(source, /new CustomEvent<MerchantRealtimeDetail>/);
});

test('subscription surfaces use canonical authority or server realtime state without local cache writes', () => {
  const page = read('artifacts/fawri/src/pages/dashboard/SubscriptionPage.tsx');
  const retention = read('artifacts/fawri/src/components/SubscriptionRetentionCard.tsx');

  for (const source of [page, retention]) {
    assert.match(source, /loadCurrentSubscriptionAuthority/);
    assert.match(source, /MERCHANT_REALTIME_EVENT/);
    assert.doesNotMatch(source, /saveSubscriptions|getSubscriptions|fawri_subscriptions/);
  }

  assert.match(page, /\/api\/auth\/subscription\/emergency/);
});

test('server realtime subscription payload is session-derived from PostgreSQL authority', () => {
  const server = read('artifacts/api-server/src/routes/merchant-realtime-pg.ts');
  assert.match(server, /router\.get\("\/events", requireSecureMerchantSession/);
  assert.match(server, /getCurrentSubscriptionPostgres\(currentMerchantId\)/);
  assert.match(server, /subscription: state\.subscription/);
  assert.match(server, /writeSseEvent\(res, "snapshot", publicPayload\(state\)\)/);
  assert.match(server, /writeSseEvent\(res, "subscription_updated", payload\)/);
});
