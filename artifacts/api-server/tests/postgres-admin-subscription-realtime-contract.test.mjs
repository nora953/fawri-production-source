import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

test("PostgreSQL entitlement router owns admin subscription realtime", async () => {
  const route = await source("src/routes/subscription-entitlement-pg.ts");

  assert.match(route, /\/admin\/subscriptions\/events/);
  assert.match(route, /requireSecureAdminPermission\("manage_subscriptions"\)/);
  assert.match(route, /listSubscriptionsPostgres\(\)/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /writeSseEvent\(res, "snapshot", \{ subscriptions/);
  assert.doesNotMatch(route, /adminSubscriptionRealtimeClients|ensureDb\(/);
});

test("PostgreSQL admin subscription stream is bounded for session revalidation", async () => {
  const route = await source("src/routes/subscription-entitlement-pg.ts");

  assert.match(route, /FAWRI_AUTH_SSE_REVALIDATE_MS/);
  assert.match(route, /setTimeout\(cleanup, adminSubscriptionSseRevalidateMs\(\)\)/);
  assert.match(route, /req\.once\("close", cleanup\)/);
  assert.match(route, /res\.once\("close", cleanup\)/);
});

test("frontend consumes PostgreSQL snapshot events and reconnects", async () => {
  const controller = await source("../fawri/src/pages/admin/useAdminPageController.tsx");

  assert.match(controller, /\/api\/auth\/admin\/subscriptions\/events/);
  assert.match(controller, /eventName === "snapshot"/);
  assert.match(controller, /applySnapshot\(payload\.subscriptions\)/);
  assert.match(controller, /window\.setTimeout\(\(\) => void connect\(\), 1_500\)/);
});
