import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const authority = read('../src/lib/currentSubscriptionAuthority.ts');
const overview = read('../src/pages/dashboard/OverviewPage.tsx');
const subscriptionPage = read('../src/pages/dashboard/SubscriptionPage.tsx');
const messages = read('../src/lib/translations/features/lib/subscriptionStateMessages.ts');
const serverRoute = read('../../api-server/src/routes/subscription-entitlement-pg.ts');

test('current subscription authority distinguishes absence from authority failure', () => {
  assert.match(serverRoute, /sendAuthError\(res, 404, "SUBSCRIPTION_NOT_FOUND"/);
  assert.match(serverRoute, /503,[\s\S]*"SUBSCRIPTION_ENTITLEMENT_UNAVAILABLE"/);

  assert.match(authority, /response\.status === 404/);
  assert.match(authority, /data\?\.code === 'SUBSCRIPTION_NOT_FOUND'/);
  assert.match(authority, /status: 'missing'/);
  assert.match(authority, /status: 'unavailable'/);
  assert.match(authority, /credentials: 'include'/);
});

test('merchant dashboard surfaces consume the shared subscription authority', () => {
  assert.match(overview, /loadCurrentSubscriptionAuthority/);
  assert.match(subscriptionPage, /loadCurrentSubscriptionAuthority/);
  assert.doesNotMatch(overview, /fetch\('\/api\/auth\/subscription\/current'/);
  assert.doesNotMatch(subscriptionPage, /fetch\('\/api\/auth\/subscription\/current'/);

  assert.match(overview, /status === 'unavailable'/);
  assert.match(subscriptionPage, /status === 'unavailable'/);
});

test('subscription authority unavailable copy exists in all supported languages', () => {
  const unavailableTitles = messages.match(/authorityUnavailableTitle:/g) || [];
  const unavailableBodies = messages.match(/authorityUnavailableBody:/g) || [];
  const retryLabels = messages.match(/authorityRetry:/g) || [];

  assert.equal(unavailableTitles.length, 3);
  assert.equal(unavailableBodies.length, 3);
  assert.equal(retryLabels.length, 3);
});
