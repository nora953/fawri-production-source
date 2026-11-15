import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { enforceManualCommercialCutover } from "../src/middleware/manualCommercialCutover";
import { assertFirstCommercialManualProfile } from "../src/services/manualCommercialRelease";

const current = path.dirname(fileURLToPath(import.meta.url));
const source = (p: string) => fs.readFileSync(path.resolve(current, p), "utf8");

function invoke(pathValue: string): { status: number | null; code?: string; next: number; noStore: boolean } {
  const result: { status: number | null; code?: string; next: number; noStore: boolean } =
    { status: null, next: 0, noStore: false };
  const response = {
    set(key: string, value: string) {
      if (key === "Cache-Control" && value === "no-store") result.noStore = true;
      return this;
    },
    status(status: number) { result.status = status; return this; },
    json(value: {code?: string}) { result.code = value.code; return this; },
  };
  enforceManualCommercialCutover(
    { path: pathValue } as never,
    response as never,
    (() => { result.next++; }) as never,
  );
  return result;
}

test("manual V1 fails closed on EVERY in-app Support HTTP surface", () => {
  const original = process.env.FAWRI_V1_MANUAL_COMMERCE;
  try {
    process.env.FAWRI_V1_MANUAL_COMMERCE = "1";
    for (const endpoint of [
      "/api/auth/support",
      "/api/auth/support/tickets",
      "/api/auth/support/tickets/x/messages",
      "/api/auth/support-images/tickets/x/messages",
      "/api/auth/support-images/attachments/x",
      "/api/auth/support-preview/123",
      "/api/auth/admin/support",
      "/api/auth/admin/support/tickets",
      "/api/auth/admin/support/tickets/x/inspection-requests",
      "/api/auth/admin/support-preview/x/start",
      "/api/auth/admin/support-images/tickets/x/messages",
    ]) {
      const result = invoke(endpoint);
      assert.deepEqual(result, {
        status: 403, code: "FAWRI_V1_SUPPORT_NOT_OFFERED",
        next: 0, noStore: true,
      }, endpoint);
    }
    for (const endpoint of [
      "/api/auth/notifications",
      "/api/auth/merchants/store-a/subscription",
      "/api/auth/admin/me",
      "/api/catalog/products",
      "/api/auth/supporter-profile",
      "/api/auth/admin/supportive",
    ]) {
      assert.equal(invoke(endpoint).next, 1, endpoint);
    }
    for (const endpoint of [
      "/api/admin/background-jobs",
      "/api/admin/background-jobs/queued",
      "/api/admin/background-jobs/job-123/requeue",
    ]) {
      const result = invoke(endpoint);
      assert.deepEqual(result, {
        status: 403, code: "FAWRI_V1_PROVIDER_NOT_OFFERED",
        next: 0, noStore: true,
      }, endpoint);
    }
    for (const endpoint of [
      "/api/admin/background-jobs-legacy",
      "/api/orders/manual",
      "/api/catalog/products",
    ]) {
      assert.equal(invoke(endpoint).next, 1, endpoint);
    }
    assert.equal(invoke("/api/auth/billing/checkout").code,
      "FAWRI_V1_PROVIDER_NOT_OFFERED",
      "existing provider cutover must remain unchanged");
  } finally {
    if (original === undefined) delete process.env.FAWRI_V1_MANUAL_COMMERCE;
    else process.env.FAWRI_V1_MANUAL_COMMERCE = original;
  }
});

test("support HTTP paths remain available outside the manual V1 profile", () => {
  const previous = process.env.FAWRI_V1_MANUAL_COMMERCE;
  try {
    process.env.FAWRI_V1_MANUAL_COMMERCE = "0";
    for (const endpoint of [
      "/api/auth/support/tickets", "/api/auth/admin/support/tickets",
      "/api/auth/support-images/tickets/x/messages",
      "/api/auth/admin/support-preview/x",
      "/api/auth/billing/checkout",
      "/api/admin/background-jobs/job-123/requeue",
    ]) {
      assert.equal(invoke(endpoint).next, 1, endpoint);
    }
  } finally {
    if (previous === undefined) delete process.env.FAWRI_V1_MANUAL_COMMERCE;
    else process.env.FAWRI_V1_MANUAL_COMMERCE = previous;
  }
});

test("manual V1 suppresses both old JSON timers and PG support sweeps", () => {
  const code = source("../src/services/postgresSupportRuntimeCutover.ts");
  assert.match(code, /clearInterval\(supportLifecycleTimer\)/);
  assert.match(code, /clearInterval\(subscriptionLifecycleTimer\)/);
  assert.match(code,
    /if \(manualCommercialRelease\(\)\) return;\s*void sweepPostgresSupportRuntime\(\)/);
  // Dedicated authentication issuer deliberately has no tenant-support DML.
  const grants = source("../../../lib/db/first-commercial/held/v1_authentication_core_grants.sql");
  assert.match(grants, /has_table_privilege\(auth,'public\.notifications'/);
  assert.doesNotMatch(grants, /GRANT[^;]+ON\s+public\.support_tickets\s+TO\s+fawri_auth_issuer/i);
});

test("web and admin Support affordances are absent in manual V1", () => {
  const app = source("../../fawri/src/App.tsx");
  const sidebar = source("../../fawri/src/components/layout/Sidebar.tsx");
  const mobile = source("../../fawri/src/components/layout/BottomNav.tsx");
  const admin = source("../../fawri/src/pages/admin/useAdminPageController.tsx");
  assert.match(app, /manualCommercialOnly \? <NotFound \/> : <DashboardRoute Page=\{SupportPage\}/);
  assert.match(app, /manualCommercialOnly \? <NotFound \/> : <AdminSupportPreviewPage/);
  assert.match(app, /!manualCommercialOnly && <SupportPreviewLauncher/);
  for (const nav of [sidebar, mobile]) {
    assert.match(nav, /VITE_FAWRI_V1_MANUAL_COMMERCE === '1'/);
    assert.match(nav, /dashboard\/support/);
  }
  assert.match(admin, /VITE_FAWRI_V1_MANUAL_COMMERCE !== "1" &&/);
});


test("first-commercial production never starts without manual-only cutover", () => {
  for (const value of [undefined, "", "0", "true"]) {
    assert.throws(
      () => assertFirstCommercialManualProfile(
        { FAWRI_V1_MANUAL_COMMERCE: value }, true,
      ),
      (error: unknown) =>
        (error as { code?: string })?.code === "FAWRI_V1_MANUAL_COMMERCE_REQUIRED",
      String(value),
    );
  }
  assert.doesNotThrow(() => assertFirstCommercialManualProfile(
    { FAWRI_V1_MANUAL_COMMERCE: "1" }, true,
  ));
  // Nonproduction regression profiles deliberately remain available.
  assert.doesNotThrow(() => assertFirstCommercialManualProfile(
    { FAWRI_V1_MANUAL_COMMERCE: "0" }, false,
  ));
  const startup = source("../src/index.ts");
  assert.match(startup,
    /assertFirstCommercialManualProfile\(process\.env, productionReleaseGateRequired\(process\.env\)\)/);
  assert.ok(startup.indexOf("assertFirstCommercialManualProfile(process.env,") <
    startup.indexOf("await assertProductionDatabaseRlsReady(process.env);"),
    "manual-only release must fail closed before any production DB check");
});

test("production frontend fails closed on deferred POS, Meta and Support without Vite flags", () => {
  const app = source("../../fawri/src/App.tsx");
  const sidebar = source("../../fawri/src/components/layout/Sidebar.tsx");
  const bottomNav = source("../../fawri/src/components/layout/BottomNav.tsx");
  const admin = source("../../fawri/src/pages/admin/useAdminPageController.tsx");
  const features = source("../../fawri/src/hooks/useMerchantFeatureEntitlements.ts");
  assert.ok(app.includes("const manualCommercialOnly = import.meta.env.PROD || import.meta.env.VITE_FAWRI_V1_MANUAL_COMMERCE === '1'"));
  assert.ok(app.includes("const firstCommercialPosDisabled = import.meta.env.PROD || import.meta.env.VITE_FAWRI_V1_POS_DISABLED === '1'"));
  for (const page of ["ConversationsPage", "SavedAnswersPage", "TrainingPage", "ChannelsPage"]) {
    assert.ok(app.includes("manualCommercialOnly ? <NotFound /> : <DashboardRoute Page={" + page + "} />"), page);
  }
  for (const nav of [sidebar, bottomNav]) {
    assert.ok(nav.includes("import.meta.env.PROD || import.meta.env.VITE_FAWRI_V1_MANUAL_COMMERCE === '1'"));
  }
  assert.ok(admin.includes('!import.meta.env.PROD && import.meta.env.VITE_FAWRI_V1_MANUAL_COMMERCE !== "1" &&'));
  assert.ok(features.includes("(import.meta.env.PROD || import.meta.env.VITE_FAWRI_V1_POS_DISABLED === '1')"));
  assert.ok(features.includes("!import.meta.env.PROD && import.meta.env.VITE_FAWRI_V1_MANUAL_COMMERCE !== '1' &&"));
});

test("public production landing always offers manual commerce, not deferred Meta integrations", () => {
  const landing = source("../../fawri/src/pages/LandingPage.tsx");
  assert.ok(landing.includes("return import.meta.env.PROD || import.meta.env.VITE_FAWRI_V1_MANUAL_COMMERCE === '1'"));
  assert.ok(landing.includes("? <ManualCommerceLanding />"));
  assert.ok(landing.includes(": <FullLandingPage />"));
});

test("subscription frontend hides deferred checkout, POS and emergency reply credits in production", () => {
  const page = source("../../fawri/src/pages/dashboard/SubscriptionPage.tsx");
  const card = source("../../fawri/src/components/SubscriptionCard.tsx");
  assert.match(page, /const manualCommercialOnly = import\.meta\.env\.PROD \|\|/);
  assert.match(page, /const firstCommercialPosDisabled = import\.meta\.env\.PROD \|\|/);
  assert.match(page, /if \(manualCommercialOnly\) return;/);
  assert.match(page, /manualCommercialOnly\s*\? <p className="rounded-xl border p-4">/);
  assert.match(page, /!firstCommercialPosDisabled \? <CashierSubscriptionPanel \/>/);
  assert.match(card, /const canShowEmergency =\s*!import\.meta\.env\.PROD &&/);
  assert.match(card, /import\.meta\.env\.VITE_FAWRI_V1_MANUAL_COMMERCE !== '1'/);
  assert.match(card, /\{canShowEmergency && \(/);
});

test("manual commercial subscription hides unoffered reply credit quotas and purchase warnings", () => {
  const card = source("../../fawri/src/components/SubscriptionCard.tsx");
  assert.match(card, /const manualCommercialOnly = import\.meta\.env\.PROD \|\|/);
  assert.match(card, /const isBaseBalanceLow =\s*!manualCommercialOnly &&/);
  assert.match(card, /!manualCommercialOnly && \(\s*<>\s*<div className="space-y-2 rounded-xl/);
  assert.match(card, /<\/>\s*\)\}\s*\{canShowEmergency && \(/);
});
