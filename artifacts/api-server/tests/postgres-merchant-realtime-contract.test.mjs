import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(apiRoot, relativePath), "utf8");
}

test("PostgreSQL auth router owns merchant realtime before legacy retirement", async () => {
  const securityRouter = await source("src/routes/auth-security.ts");
  const app = await source("src/app.ts");

  assert.match(securityRouter, /merchantRealtimePgRouter/);
  assert.match(securityRouter, /router\.use\(merchantRealtimePgRouter as any\)/);
  assert.ok(
    app.indexOf('app.use("/api/auth", authSecurityRouter)') <
      app.indexOf("app.use(enforceLegacyAuthProductionCutoverGate)"),
  );
});

test("PostgreSQL merchant realtime is session-bound and authority-derived", async () => {
  const route = await source("src/routes/merchant-realtime-pg.ts");

  assert.match(route, /router\.get\("\/events", requireSecureMerchantSession/);
  assert.match(route, /getCurrentSubscriptionPostgres/);
  assert.match(route, /countUnreadMerchantNotificationsPostgresCanonical/);
  assert.match(route, /listMerchantSupportTicketsPostgres/);
  assert.match(route, /refreshSupportLifecyclePostgresCanonical/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /writeSseEvent\(res, "snapshot"/);
  assert.match(route, /writeSseEvent\(res, "subscription_updated"/);
  assert.match(route, /writeSseEvent\(res, "notifications_updated"/);
  assert.match(route, /writeSseEvent\(res, "support_updated"/);
  assert.doesNotMatch(route, /ensureDb\(|merchantRealtimeClients|authRuntime/);
});

test("PostgreSQL merchant realtime is bounded for session revalidation", async () => {
  const route = await source("src/routes/merchant-realtime-pg.ts");

  assert.match(route, /FAWRI_AUTH_SSE_REVALIDATE_MS/);
  assert.match(route, /setTimeout\(cleanup, merchantSseRevalidateMs\(\)\)/);
  assert.match(route, /req\.once\("close", cleanup\)/);
  assert.match(route, /res\.once\("close", cleanup\)/);
});

test("merchant unread realtime count is exact and uncapped", async () => {
  const notificationAuthority = await source(
    "src/services/postgresMerchantNotificationAuthority.ts",
  );

  assert.match(
    notificationAuthority,
    /countUnreadMerchantNotificationsPostgresCanonical/,
  );
  assert.match(notificationAuthority, /SELECT COUNT\(\*\) AS count/);
  assert.match(notificationAuthority, /read_at IS NULL/);
});

test("frontend consumes merchant realtime endpoint and canonical event names", async () => {
  const hook = await source("../fawri/src/hooks/useMerchantRealtime.ts");

  assert.match(hook, /fetch\('\/api\/auth\/events'/);
  assert.match(hook, /'snapshot'/);
  assert.match(hook, /'subscription_updated'/);
  assert.match(hook, /'notifications_updated'/);
  assert.match(hook, /'support_updated'/);
});
