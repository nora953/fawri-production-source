import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '../../..');

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

test('overview refreshes authoritative counts in the background on notification realtime changes', () => {
  const overview = read('artifacts/fawri/src/pages/dashboard/OverviewPage.tsx');

  assert.match(overview, /fetch\(path, \{[\s\S]*cache: 'no-store'/);
  assert.match(overview, /credentials: 'include'/);
  assert.match(overview, /const loadStats = async \(showLoading = true\) =>/);
  assert.match(overview, /if \(active && showLoading\) setStats\(loadingStats\(\)\)/);
  assert.match(overview, /loadServerCount\('\/api\/conversations'\)/);
  assert.match(overview, /loadServerCount\('\/api\/orders'\)/);
  assert.match(overview, /loadServerCount\('\/api\/catalog\/products'\)/);
  assert.match(
    overview,
    /if \(detail\?\.event === 'notifications_updated'\) \{\s*void loadStats\(false\);\s*\}/,
  );
});

test('new PostgreSQL customer messages drive the realtime signal used by overview freshness', () => {
  const metaIntent = read(
    'artifacts/api-server/src/services/postgresMetaAutoReplyIntent.ts',
  );
  const realtime = read(
    'artifacts/api-server/src/routes/merchant-realtime-pg.ts',
  );

  assert.match(
    metaIntent,
    /if \(inbound\.customerInserted\) \{[\s\S]*notifyMerchantNewCustomerMessagePostgres\(\{/,
  );
  assert.match(
    realtime,
    /countUnreadMerchantNotificationsPostgresCanonical\(currentMerchantId\)/,
  );
  assert.match(
    realtime,
    /nextState\.unreadNotificationCount !== state\.unreadNotificationCount[\s\S]*writeSseEvent\(res, "notifications_updated", payload\)/,
  );
});
