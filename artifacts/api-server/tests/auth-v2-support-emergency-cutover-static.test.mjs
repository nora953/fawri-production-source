import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

const frontendFilesWithoutLegacyAdminTokenGate = [
  "../fawri/src/components/admin/EmergencyReadAccessLauncher.tsx",
  "../fawri/src/components/admin/SupportPreviewLauncher.tsx",
  "../fawri/src/pages/AdminEmergencyAccessPage.tsx",
  "../fawri/src/pages/AdminEmergencySnapshotPage.tsx",
  "../fawri/src/pages/AdminSupportPreviewPage.tsx",
  "../fawri/src/components/layout/DashboardLayout.tsx",
];

test("support images run only after Auth v2 cutover validation", async () => {
  const app = await read("src/app.ts");
  const cutoverIndex = app.indexOf("app.use(enforceAuthCutoverCompatibility);");
  const supportImagesIndex = app.indexOf(
    'app.use("/api/auth/support-images", supportImagesRouter);',
  );

  assert.ok(cutoverIndex >= 0, "Auth v2 compatibility middleware must remain mounted");
  assert.ok(supportImagesIndex >= 0, "support-images router must remain mounted");
  assert.ok(
    supportImagesIndex > cutoverIndex,
    "support images must not bypass Auth v2 session validation",
  );
});

test("admin support and emergency UI no longer gates on legacy admin bearer state", async () => {
  for (const file of frontendFilesWithoutLegacyAdminTokenGate) {
    const source = await read(file);
    assert.doesNotMatch(
      source,
      /getAdminSessionToken/,
      `${file} must rely on server-authoritative Auth v2 session responses`,
    );
  }
});

test("dashboard proves the secure admin session before merchant lifecycle routing and fails closed on ambiguity", async () => {
  const layout = await read("../fawri/src/components/layout/DashboardLayout.tsx");
  assert.match(layout, /fetch\('\/api\/auth\/admin\/me'/);
  assert.match(layout, /secureAdminSessionStatus/);
  assert.match(layout, /adminStatus === 'admin'/);
  assert.match(layout, /adminStatus === 'unknown'/);
  assert.match(layout, /setLocation\('\/admin'\)/);
});

test("leaving an admin route revokes the secure Auth v2 admin session", async () => {
  const app = await read("../fawri/src/App.tsx");
  assert.match(
    app,
    /previous\.startsWith\('\/admin'\) && !location\.startsWith\('\/admin'\)/,
  );
  assert.match(app, /void secureAdminLogout\(\)/);
});
