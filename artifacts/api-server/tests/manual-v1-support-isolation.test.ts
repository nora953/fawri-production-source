import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { enforceManualCommercialCutover } from "../src/middleware/manualCommercialCutover";

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
