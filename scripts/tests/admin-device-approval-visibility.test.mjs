import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const postgresAdminRoutes = source(
  "artifacts/api-server/src/routes/auth-admin-postgres-routes.ts",
);
const sessionRoutes = source(
  "artifacts/api-server/src/routes/auth-session-routes.ts",
);
const administratorsTab = source(
  "artifacts/fawri/src/components/admin/AdministratorsTab.tsx",
);
const adminPageView = source(
  "artifacts/fawri/src/pages/admin/AdminPageView.tsx",
);
const adminPageController = source(
  "artifacts/fawri/src/pages/admin/useAdminPageController.tsx",
);

test("PostgreSQL administrator list exposes authoritative work and pending-device summary", () => {
  assert.match(postgresAdminRoutes, /async function adminWorkMonitorState\(adminId: string\)/);
  assert.match(postgresAdminRoutes, /authPostgresSessionAuthority\.listActiveSessions\(adminId, "admin"\)/);
  assert.match(postgresAdminRoutes, /listAdminDevicesAuthoritative\(adminId\)/);
  assert.match(postgresAdminRoutes, /work_status: workStatus/);
  assert.match(postgresAdminRoutes, /open_session_count: sessions\.length/);
  assert.match(
    postgresAdminRoutes,
    /pending_device_count: devices\.filter\(\(device\) => device\.status === "pending"\)\.length/,
  );
  assert.match(
    postgresAdminRoutes,
    /admins\.map\(async \(admin\) => \(\{[\s\S]*?\.\.\.payload\(admin\),[\s\S]*?adminWorkMonitorState\(admin\.account\.id\)/,
  );
});

test("owner session summary exposes total pending admin device approvals", () => {
  assert.match(sessionRoutes, /listAdminDevicesAuthoritative/);
  assert.match(
    sessionRoutes,
    /account\.adminProfile\?\.role === "owner_admin"/,
  );
  assert.match(
    sessionRoutes,
    /listAdminDevicesAuthoritative\(\)[\s\S]*?device\.status === "pending"/,
  );
  assert.match(
    sessionRoutes,
    /pending_device_count: pendingDeviceCount/,
  );
});

test("owner UI surfaces pending approvals on both administrator card and tab badge", () => {
  assert.match(
    administratorsTab,
    /\(administrator\.pending_device_count \?\? 0\) > 0/,
  );
  assert.match(
    adminPageView,
    /const pendingAdminDeviceCount = Number\(/,
  );
  assert.match(
    adminPageView,
    /t\.filter === "ADMINISTRATORS"[\s\S]*?\? pendingAdminDeviceCount[\s\S]*?: tabCount\(t\)/,
  );
  assert.match(
    adminPageController,
    /fetch\("\/api\/auth\/admin\/me"/,
  );
  assert.match(
    adminPageController,
    /window\.setInterval\(refreshWhenVisible, 15_000\)/,
  );
});
