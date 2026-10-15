import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const current = path.dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(current, relativePath), "utf8");
}

test("Support PostgreSQL routers remain ahead of every legacy Support surface", () => {
  const authSecurity = source("../src/routes/auth-security.ts");
  const app = source("../src/app.ts");

  const lifecycleView = authSecurity.indexOf(
    "router.use(supportAdminLifecyclePostgresRoutes as any)",
  );
  const imageAliases = authSecurity.indexOf(
    "router.use(supportImageAliasPostgresRoutes as any)",
  );
  const messageTransitions = authSecurity.indexOf(
    "router.use(supportMessagePostgresRoutes as any)",
  );
  const support = authSecurity.indexOf("router.use(supportPostgresRoutes as any)");
  const publicLegacy = authSecurity.indexOf("router.use(publicRoutes as any)");
  const adminLegacy = authSecurity.indexOf("router.use(adminRoutes as any)");

  assert.ok(
    lifecycleView >= 0 &&
      imageAliases >= 0 &&
      messageTransitions >= 0 &&
      support >= 0,
  );
  assert.ok(lifecycleView < support);
  assert.ok(imageAliases < support);
  assert.ok(messageTransitions < support);
  assert.ok(support < publicLegacy);
  assert.ok(support < adminLegacy);

  const authV2Mount = app.indexOf('app.use("/api/auth", authSecurityRouter)');
  const legacyImages = app.indexOf('"/api/auth/support-images"');
  const legacyPreview = app.indexOf('"/api/auth/admin/support-preview"');
  assert.ok(authV2Mount >= 0 && authV2Mount < legacyImages);
  assert.ok(authV2Mount < legacyPreview);
  assert.match(
    app,
    /"\/api\/auth\/support-images",\s*enforceLegacyAuthProductionCutoverGate,\s*supportImagesRouter/,
  );
  assert.match(
    app,
    /"\/api\/auth\/admin\/support-preview",\s*enforceLegacyAuthProductionCutoverGate,\s*supportPreviewRouter/,
  );
});

test("Support PostgreSQL route authority uses Auth v2 and has no JSON or legacy token dependency", () => {
  const router = source("../src/routes/auth-support-postgres-routes.ts");
  const aliases = source("../src/routes/auth-support-image-alias-postgres-routes.ts");
  const messages = source("../src/routes/auth-support-message-postgres-routes.ts");
  const lifecycleView = source(
    "../src/routes/auth-support-admin-lifecycle-postgres-routes.ts",
  );

  for (const code of [router, aliases, messages, lifecycleView]) {
    assert.equal(code.includes("ensureDb("), false);
    assert.equal(code.includes("readAuthDb("), false);
    assert.equal(code.includes("writeJson("), false);
    assert.equal(code.includes("verifyAdminSessionToken"), false);
    assert.equal(code.includes("verifyMerchantSessionToken"), false);
    assert.equal(code.includes("getBearerToken"), false);
    assert.equal(code.includes('"fawri_merchant_session"'), false);
  }

  assert.match(router, /requireSecureMerchantSession/);
  assert.match(router, /requireSecureAdminSession/);
  assert.match(router, /getSessionToken\(req, "admin"\)/);
  assert.match(aliases, /requireSecureMerchantSession/);
  assert.match(aliases, /requireSecureAdminSession/);
  assert.match(messages, /requireSecureMerchantSession/);
  assert.match(messages, /requireSecureAdminSession/);
});

test("Support text replies reset stale lifecycle reminder state in PostgreSQL", () => {
  const messages = source("../src/routes/auth-support-message-postgres-routes.ts");

  assert.match(messages, /merchant_reminder_sent_at = NULL/);
  assert.match(messages, /assistant_reminder_sent_at = NULL/);
  assert.match(messages, /owner_escalated_at = NULL/);
  assert.match(messages, /addMerchantSupportMessagePostgres/);
  assert.match(messages, /addAdminSupportMessagePostgres/);
});

test("Support lifecycle cuts off legacy JSON timers before PostgreSQL sweeps", () => {
  const runtime = source("../src/services/postgresSupportRuntimeCutover.ts");
  const authSecurity = source("../src/routes/auth-security.ts");
  const lifecycle = source("../src/services/postgresSupportLifecycleAuthority.ts");

  assert.match(authSecurity, /startPostgresSupportRuntimeCutover\(\);/);
  assert.equal(
    /router\.use\([\s\S]{0,160}startPostgresSupportRuntimeCutover/.test(authSecurity),
    false,
    "Support runtime cutover must start at module initialization, not first request",
  );
  assert.match(runtime, /clearInterval\(supportLifecycleTimer\)/);
  assert.match(runtime, /clearInterval\(subscriptionLifecycleTimer\)/);
  assert.match(runtime, /refreshSupportLifecyclePostgresCanonical/);
  assert.match(runtime, /refreshSubscriptionNotificationsPostgres/);

  assert.match(lifecycle, /SUPPORT_MERCHANT_REMINDER_MINUTES/);
  assert.match(lifecycle, /24 \* 60/);
  assert.match(lifecycle, /SUPPORT_OWNER_ESCALATION_MINUTES/);
  assert.match(lifecycle, /48 \* 60/);
  assert.match(lifecycle, /SUPPORT_AUTO_CLOSE_MINUTES/);
  assert.match(lifecycle, /72 \* 60/);
  assert.equal(lifecycle.includes("interval '7 days'"), false);
});

test("Support Preview frontend no longer requires a legacy admin bearer token", () => {
  const preview = source("../../fawri/src/pages/AdminSupportPreviewPage.tsx");

  assert.equal(preview.includes("getAdminSessionToken"), false);
  assert.match(preview, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(preview, /setLocation\("\/login"\)/);
  assert.match(preview, /getAdminAuthHeaders/);
});

test("Support image PostgreSQL aliases preserve merchant and admin frontend contracts", () => {
  const aliases = source("../src/routes/auth-support-image-alias-postgres-routes.ts");
  const merchantButton = source(
    "../../fawri/src/components/support/MerchantSupportImageButton.tsx",
  );
  const adminButton = source(
    "../../fawri/src/components/support/AdminSupportImageButton.tsx",
  );

  assert.match(aliases, /\/support-images\/merchant\/tickets\/:ticketId\/messages/);
  assert.match(aliases, /\/support-images\/admin\/tickets\/:ticketId\/messages/);
  assert.match(merchantButton, /\/api\/auth\/support-images\/merchant\/tickets/);
  assert.match(adminButton, /\/api\/auth\/support-images\/admin\/tickets/);
  assert.match(aliases, /saveSupportImagePostgres/);
});

test("Support Preview snapshot is PostgreSQL allowlisted and excludes channel credentials", () => {
  const snapshot = source("../src/services/postgresSupportSnapshot.ts");

  assert.match(snapshot, /FROM merchant_channels/);
  assert.equal(snapshot.includes("credentials_ciphertext"), false);
  assert.equal(snapshot.includes("credentials_nonce"), false);
  assert.equal(snapshot.includes("credentials_auth_tag"), false);
  assert.equal(snapshot.includes("page_access_token"), false);
  assert.equal(snapshot.includes("access_token"), false);
  assert.equal(snapshot.includes("password_hash"), false);
});

test("merchant notifications are PostgreSQL-readable and subscription reminders no longer require JSON", () => {
  const notifications = source(
    "../src/services/postgresMerchantNotificationAuthority.ts",
  );
  const operational = source(
    "../src/services/postgresOperationalNotificationAuthority.ts",
  );

  for (const code of [notifications, operational]) {
    assert.equal(code.includes("ensureDb("), false);
    assert.equal(code.includes("writeDb("), false);
    assert.equal(code.includes("merchant_notifications"), false);
    assert.match(code, /notifications/);
  }

  assert.match(notifications, /subscription_expiry_reminder/);
  assert.match(notifications, /subscription_expired/);
  assert.match(notifications, /addon_expiry_reminder/);
  assert.match(notifications, /read_at/);
  assert.match(notifications, /FROM merchants WHERE id = \$2/);
});

test("admin Support list exposes lifecycle reminder and escalation fields", () => {
  const lifecycleView = source(
    "../src/routes/auth-support-admin-lifecycle-postgres-routes.ts",
  );

  assert.match(lifecycleView, /assistant_reminder_sent_at/);
  assert.match(lifecycleView, /owner_escalated_at/);
  assert.match(lifecycleView, /refreshSupportLifecyclePostgresCanonical/);
  assert.match(lifecycleView, /listAdminSupportTicketsPostgres/);
});
