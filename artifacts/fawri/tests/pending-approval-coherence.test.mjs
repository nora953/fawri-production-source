import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const fawriRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(fawriRoot, relativePath), "utf8");
}

test("merchant lifecycle client uses only the secure server lifecycle endpoint", async () => {
  const lifecycle = await source("src/lib/merchantLifecycle.ts");

  assert.match(lifecycle, /fetch\('\/api\/auth\/lifecycle'/);
  assert.match(lifecycle, /credentials:\s*'same-origin'/);
  assert.match(lifecycle, /cache:\s*'no-store'/);
  assert.match(lifecycle, /response\.status === 401/);
  assert.match(lifecycle, /'pending_review'/);
  assert.match(lifecycle, /'approved'/);
  assert.match(lifecycle, /'rejected'/);
  assert.match(lifecycle, /'suspended'/);
  assert.doesNotMatch(lifecycle, /localStorage|sessionStorage/);
  assert.doesNotMatch(lifecycle, /phone|merchant_id|Authorization/);
});

test("PendingPage refreshes server status, backs off, cleans polling, and uses secure logout", async () => {
  const pending = await source("src/pages/PendingPage.tsx");

  assert.match(pending, /checkMerchantLifecycle\(controller\.signal\)/);
  assert.match(pending, /lifecyclePollDelay/);
  assert.match(pending, /window\.setTimeout/);
  assert.match(pending, /window\.clearTimeout/);
  assert.match(pending, /controller\?\.abort\(\)/);
  assert.match(pending, /setRefreshKey/);
  assert.match(pending, /status === 'approved'/);
  assert.match(pending, /setLocation\('\/dashboard'\)/);
  assert.match(pending, /setView\('unavailable'\)/);
  assert.match(pending, /secureMerchantLogout\(\)/);
  assert.doesNotMatch(pending, /localStorage\.getItem|sessionStorage\.getItem/);
});

test("DashboardLayout permits only authoritative approved lifecycle state", async () => {
  const layout = await source("src/components/layout/DashboardLayout.tsx");

  assert.match(layout, /checkMerchantLifecycle\(controller\.signal\)/);
  assert.match(layout, /lifecycle\.lifecycle\.account_status !== 'approved'/);
  assert.match(layout, /setLocation\('\/pending'\)/);
  assert.match(layout, /lifecycle\.reason === 'unauthenticated' \? '\/login' : '\/pending'/);
  assert.match(layout, /window\.setTimeout\(\(\) => void verifyAccess\(\), 30_000\)/);
  assert.match(layout, /window\.clearTimeout/);
  assert.match(layout, /controller\?\.abort\(\)/);
  assert.match(layout, /updated\.status !== 'approved'/);
});
