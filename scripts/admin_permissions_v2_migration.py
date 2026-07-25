from __future__ import annotations

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def write(rel: str, content: str) -> None:
    (ROOT / rel).write_text(content, encoding="utf-8")


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return content.replace(old, new, 1)


def regex_once(content: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return updated


NEW_PERMISSION_TS_DOUBLE = '''export type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";'''

NEW_PERMISSION_TS_SINGLE = '''export type AdminPermission =
  | 'view_merchants'
  | 'manage_merchant_status'
  | 'manage_subscriptions'
  | 'manage_channels'
  | 'view_logs'
  | 'inspect_merchant_sessions'
  | 'manage_support';'''

path = "artifacts/api-server/src/services/adminManagement.ts"
content = read(path)
content = regex_once(
    content,
    r'export type AdminPermission =\n(?:\s+\| "[^"]+"\n)*\s+\| "[^"]+";',
    NEW_PERMISSION_TS_DOUBLE,
    "adminManagement AdminPermission",
)
write(path, content)

path = "artifacts/fawri/src/lib/types.ts"
content = read(path)
content = regex_once(
    content,
    r"export type AdminPermission =\n(?:\s+\| '[^']+'\n)*\s+\| '[^']+';",
    NEW_PERMISSION_TS_SINGLE,
    "frontend AdminPermission",
)
write(path, content)

path = "artifacts/api-server/src/routes/auth.ts"
content = read(path)
content = regex_once(
    content,
    r'type AdminPermission =\n(?:\s+\| "[^"]+"\n)*\s+\| "[^"]+";',
    '''type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";''',
    "auth AdminPermission",
)
content = regex_once(
    content,
    r'const ALL_ADMIN_PERMISSIONS: readonly AdminPermission\[\] = \[.*?\n\];',
    '''const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  "view_merchants",
  "manage_merchant_status",
  "manage_subscriptions",
  "manage_channels",
  "view_logs",
  "inspect_merchant_sessions",
  "manage_support",
];''',
    "auth ALL_ADMIN_PERMISSIONS",
)
content = regex_once(
    content,
    r'function normalizeAssistantPermissions\(.*?\n}\n\nfunction normalizeAdminRoles\(.*?\n}\n\nfunction now',
    '''const LEGACY_ADMIN_PERMISSION_MAP: Readonly<Record<string, readonly AdminPermission[]>> = {
  manage_merchants: ["view_merchants", "manage_merchant_status"],
  inspection_sessions: ["inspect_merchant_sessions"],
  manage_subscriptions: ["manage_subscriptions"],
  manage_channels: ["manage_channels"],
  view_logs: ["view_logs"],
};

function normalizeAssistantPermissions(
  value: unknown,
): AdminPermission[] {
  if (!Array.isArray(value)) return [];

  const normalized = new Set<AdminPermission>();

  for (const permission of value) {
    if (typeof permission !== "string" || permission === "manage_admins") {
      continue;
    }

    if (isAdminPermission(permission)) {
      normalized.add(permission);
      continue;
    }

    for (const migratedPermission of LEGACY_ADMIN_PERMISSION_MAP[permission] || []) {
      normalized.add(migratedPermission);
    }
  }

  return ALL_ADMIN_PERMISSIONS.filter((permission) => normalized.has(permission));
}

function resolveOwnerAdminId(merchants: Merchant[]): string | null {
  const admins = merchants.filter((merchant) => merchant.is_admin === true);
  if (admins.length === 0) return null;

  const configuredOwnerPhone = normalizePhone(
    process.env.FAWRI_ADMIN_PHONE || "",
  );

  if (configuredOwnerPhone) {
    const configuredOwner = admins.find(
      (admin) => normalizePhone(admin.phone) === configuredOwnerPhone,
    );

    if (!configuredOwner) {
      throw new Error(
        "FAWRI_ADMIN_PHONE does not match an existing administrator account",
      );
    }

    return configuredOwner.id;
  }

  const explicitOwners = admins.filter(
    (admin) => admin.admin_role === "owner_admin",
  );

  if (explicitOwners.length > 1) {
    throw new Error("multiple owner administrators are configured");
  }

  return explicitOwners[0]?.id || null;
}

function normalizeAdminRoles(merchants: Merchant[]): Merchant[] {
  const ownerAdminId = resolveOwnerAdminId(merchants);

  return merchants.map((merchant) => {
    if (merchant.is_admin !== true) {
      const {
        admin_role: _adminRole,
        permissions: _permissions,
        admin_enabled: _adminEnabled,
        ...regularMerchant
      } = merchant;

      void _adminRole;
      void _permissions;
      void _adminEnabled;

      return regularMerchant;
    }

    if (merchant.id === ownerAdminId) {
      return {
        ...merchant,
        admin_role: "owner_admin",
        permissions: undefined,
        admin_enabled: true,
      };
    }

    return {
      ...merchant,
      admin_role: "assistant_admin",
      permissions: normalizeAssistantPermissions(merchant.permissions),
      admin_enabled: merchant.admin_enabled !== false,
    };
  });
}

function now''',
    "auth permission normalization",
)

legacy_marker = 'const LEGACY_ADMIN_PERMISSION_MAP:'
legacy_index = content.index(legacy_marker)
prefix = content[:legacy_index]
suffix = content[legacy_index:]
prefix = prefix.replace('"manage_merchants"', '"manage_merchant_status"')
prefix = prefix.replace('"inspection_sessions"', '"inspect_merchant_sessions"')
suffix_after_map_end = suffix.index('};') + 2
legacy_map = suffix[:suffix_after_map_end]
remaining = suffix[suffix_after_map_end:]
remaining = remaining.replace('"manage_merchants"', '"manage_merchant_status"')
remaining = remaining.replace('"inspection_sessions"', '"inspect_merchant_sessions"')
content = prefix + legacy_map + remaining

content = replace_once(
    content,
    '''  const admin = requireAnyAdminPermission(req, res, [
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "inspect_merchant_sessions",
  ]);''',
    '''  const admin = requireAnyAdminPermission(req, res, [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "inspect_merchant_sessions",
  ]);''',
    "merchant list permissions",
)
content = replace_once(
    content,
    '''router.get("/merchants", (req: Request, res: Response) => {''',
    '''router.get("/admin/me", (req: Request, res: Response) => {
  const admin = requireAdminSession(req, res);
  if (!admin) return;

  res.setHeader("Cache-Control", "no-store");
  return res.json({ ok: true, admin: toAdminSummary(admin) });
});

router.get("/merchants", (req: Request, res: Response) => {''',
    "admin me endpoint",
)
write(path, content)

path = "artifacts/fawri/src/components/admin/AdministratorsTab.tsx"
content = read(path)
content = regex_once(
    content,
    r'type AdminPermission =\n(?:\s+\| "[^"]+"\n)*\s+\| "[^"]+";',
    '''type AdminPermission =
  | "view_merchants"
  | "manage_merchant_status"
  | "manage_subscriptions"
  | "manage_channels"
  | "view_logs"
  | "inspect_merchant_sessions"
  | "manage_support";''',
    "AdministratorsTab AdminPermission",
)
content = regex_once(
    content,
    r'  const permissionList: readonly AdminPermission\[\] = \[.*?\n  \];',
    '''  const permissionList: readonly AdminPermission[] = [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "view_logs",
    "inspect_merchant_sessions",
  ];''',
    "AdministratorsTab permission list",
)
for old, new, label in [
    (
        '''      manage_admins: "إدارة المسؤولين",
      manage_merchants: "إدارة التجار",
      manage_subscriptions: "إدارة الاشتراكات",
      manage_channels: "إدارة القنوات",
      view_logs: "عرض سجل النشاط",
      inspection_sessions: "جلسات الفحص",''',
        '''      view_merchants: "عرض التجار",
      manage_merchant_status: "إدارة حالة التجار",
      manage_subscriptions: "إدارة الاشتراكات",
      manage_channels: "إدارة القنوات",
      view_logs: "عرض سجل النشاط",
      inspect_merchant_sessions: "جلسات فحص حساب التاجر",
      manage_support: "إدارة الدعم",''',
        "Arabic permission labels",
    ),
    (
        '''      manage_admins: "Manage administrators",
      manage_merchants: "Manage merchants",
      manage_subscriptions: "Manage subscriptions",
      manage_channels: "Manage channels",
      view_logs: "View activity logs",
      inspection_sessions: "Inspection sessions",''',
        '''      view_merchants: "View merchants",
      manage_merchant_status: "Manage merchant status",
      manage_subscriptions: "Manage subscriptions",
      manage_channels: "Manage channels",
      view_logs: "View activity logs",
      inspect_merchant_sessions: "Inspect merchant sessions",
      manage_support: "Manage support",''',
        "English permission labels",
    ),
    (
        '''      manage_admins: "بەڕێوەبردنی بەڕێوەبەران",
      manage_merchants: "بەڕێوەبردنی بازرگانان",
      manage_subscriptions: "بەڕێوەبردنی بەشداریکردنەکان",
      manage_channels: "بەڕێوەبردنی کەناڵەکان",
      view_logs: "بینینی تۆماری چالاکی",
      inspection_sessions: "دانیشتنەکانی پشکنین",''',
        '''      view_merchants: "بینینی بازرگانان",
      manage_merchant_status: "بەڕێوەبردنی دۆخی بازرگانان",
      manage_subscriptions: "بەڕێوەبردنی بەشداریکردنەکان",
      manage_channels: "بەڕێوەبردنی کەناڵەکان",
      view_logs: "بینینی تۆماری چالاکی",
      inspect_merchant_sessions: "دانیشتنەکانی پشکنینی هەژماری بازرگان",
      manage_support: "بەڕێوەبردنی پشتگیری",''',
        "Kurdish permission labels",
    ),
]:
    content = replace_once(content, old, new, label)
write(path, content)

path = "artifacts/fawri/src/pages/AdminPage.tsx"
content = read(path)
content = content.replace('  getCurrentMerchant,\n', '')
content = replace_once(
    content,
    '''  const currentAdmin = getCurrentMerchant();
  const isOwnerAdmin = currentAdmin?.admin_role === "owner_admin";
  const canManageAdmins = hasAdminPermission(currentAdmin, "manage_admins");
  const canManageMerchants = hasAdminPermission(currentAdmin, "manage_merchants");
  const canManageSubscriptions = hasAdminPermission(
    currentAdmin,
    "manage_subscriptions",
  );
  const canManageChannels = hasAdminPermission(currentAdmin, "manage_channels");
  const canViewLogs = hasAdminPermission(currentAdmin, "view_logs");
  const canInspectSessions = hasAdminPermission(
    currentAdmin,
    "inspection_sessions",
  );
  const canViewMerchantData =
    canManageMerchants ||
    canManageSubscriptions ||
    canManageChannels ||
    canInspectSessions;''',
    '''  const [currentAdmin, setCurrentAdmin] = useState<Merchant | undefined>();
  const isOwnerAdmin = currentAdmin?.admin_role === "owner_admin";
  const canManageAdmins = isOwnerAdmin;
  const canViewMerchants = hasAdminPermission(currentAdmin, "view_merchants");
  const canManageMerchants = hasAdminPermission(
    currentAdmin,
    "manage_merchant_status",
  );
  const canManageSubscriptions = hasAdminPermission(
    currentAdmin,
    "manage_subscriptions",
  );
  const canManageChannels = hasAdminPermission(currentAdmin, "manage_channels");
  const canViewLogs = hasAdminPermission(currentAdmin, "view_logs");
  const canInspectSessions = hasAdminPermission(
    currentAdmin,
    "inspect_merchant_sessions",
  );
  const canViewMerchantData =
    canViewMerchants ||
    canManageMerchants ||
    canManageSubscriptions ||
    canManageChannels ||
    canInspectSessions;''',
    "AdminPage permission derivation",
)
content = replace_once(
    content,
    '''  // Guard: admin-only
  useEffect(() => {
    const current = getCurrentMerchant();
    if (!current) {
      setLocation("/login");
      return;
    }
    if (!current.is_admin) {
      setLocation("/dashboard");
      return;
    }
  }, [setLocation]);''',
    '''  const refreshCurrentAdminFromApi = useCallback(async (): Promise<Merchant | null> => {
    try {
      const response = await fetch("/api/auth/admin/me", {
        headers: getAdminAuthHeaders(),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok || !data.admin?.is_admin) {
        clearSession();
        setCurrentAdmin(undefined);
        setLocation("/login");
        return null;
      }

      const serverAdmin = data.admin as Merchant;
      setCurrentAdmin(serverAdmin);
      return serverAdmin;
    } catch (error) {
      console.error("Current admin API refresh failed:", error);
      clearSession();
      setCurrentAdmin(undefined);
      setLocation("/login");
      return null;
    }
  }, [setLocation]);

  useEffect(() => {
    void refreshCurrentAdminFromApi();
  }, [refreshCurrentAdminFromApi]);''',
    "AdminPage server admin guard",
)
content = replace_once(
    content,
    '''      if (response.status === 403) {
        toast.error(adminText.permissionDenied);
        return true;
      }''',
    '''      if (response.status === 403) {
        void refreshCurrentAdminFromApi();
        toast.error(adminText.permissionDenied);
        return true;
      }''',
    "AdminPage refresh permissions on 403",
)
content = replace_once(
    content,
    '''    [adminText.permissionDenied, setLocation],''',
    '''    [adminText.permissionDenied, refreshCurrentAdminFromApi, setLocation],''',
    "AdminPage unauthorized callback dependencies",
)
write(path, content)

path = "artifacts/api-server/package.json"
package = json.loads(read(path))
package["scripts"]["test:admin-permissions"] = (
    "node ./build.mjs && node --test ./tests/admin-permissions.integration.test.mjs"
)
write(path, json.dumps(package, indent=2, ensure_ascii=False) + "\n")

test_path = ROOT / "artifacts/api-server/tests/admin-permissions.integration.test.mjs"
test_path.write_text(r'''import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const serverEntry = path.join(apiRoot, "dist", "index.mjs");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early.\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become ready.\n${logs()}`);
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("admin permissions migrate and remain server-authoritative", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-admin-permissions-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const baseAdmin = {
    store_name: "Fawri Admin",
    activity_type: "admin",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-07-25T00:00:00.000Z",
    is_admin: true,
    admin_enabled: true,
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };

  await writeFile(path.join(dataDir, "merchants.json"), JSON.stringify({
    merchants: [
      {
        ...baseAdmin,
        id: "owner-admin",
        owner_name: "Owner",
        phone: "07111111111",
        password: "OwnerPass1@",
        admin_role: "owner_admin",
        permissions: ["manage_admins"],
      },
      {
        ...baseAdmin,
        id: "assistant-admin",
        owner_name: "Assistant",
        phone: "07222222222",
        password: "Assistant1@",
        admin_role: "assistant_admin",
        permissions: [
          "manage_admins",
          "manage_merchants",
          "manage_subscriptions",
          "inspection_sessions",
        ],
      },
      {
        id: "merchant-a",
        owner_name: "Merchant Owner",
        store_name: "Merchant Store",
        phone: "07333333333",
        password: "Merchant1@",
        activity_type: "retail",
        status: "pending_activation",
        language: "en",
        theme_preference: "auto",
        created_at: "2026-07-25T00:00:00.000Z",
        otp_verified: true,
        warning_stage: 0,
        retention_status: "protected",
      },
    ],
    otps: [],
    admin_logs: [],
    deletion_requests: [],
    channel_overrides: {},
    admin_notes: {},
  }));

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      LOG_LEVEL: "silent",
      BOT_DEBUG: "false",
      FAWRI_PASSWORD_SALT: "test-password-salt",
      FAWRI_ADMIN_SESSION_SECRET: "test-admin-session-secret",
      FAWRI_ADMIN_PHONE: "07111111111",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    await rm(runtimeDir, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => output);

  async function login(phone, password) {
    const result = await json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    }));
    assert.equal(result.response.status, 200);
    return result.body.admin_token;
  }

  const ownerToken = await login("07111111111", "OwnerPass1@");
  const assistantToken = await login("07222222222", "Assistant1@");
  const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
  const assistantHeaders = { Authorization: `Bearer ${assistantToken}` };

  const ownerMe = await json(await fetch(`${baseUrl}/api/auth/admin/me`, { headers: ownerHeaders }));
  assert.equal(ownerMe.response.status, 200);
  assert.equal(ownerMe.body.admin.admin_role, "owner_admin");
  assert.deepEqual(ownerMe.body.admin.permissions, [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "manage_channels",
    "view_logs",
    "inspect_merchant_sessions",
    "manage_support",
  ]);

  const assistantMe = await json(await fetch(`${baseUrl}/api/auth/admin/me`, { headers: assistantHeaders }));
  assert.equal(assistantMe.response.status, 200);
  assert.deepEqual(assistantMe.body.admin.permissions, [
    "view_merchants",
    "manage_merchant_status",
    "manage_subscriptions",
    "inspect_merchant_sessions",
  ]);
  assert.equal(assistantMe.body.admin.permissions.includes("manage_admins"), false);

  const merchantList = await fetch(`${baseUrl}/api/auth/merchants`, { headers: assistantHeaders });
  assert.equal(merchantList.status, 200);

  const statusUpdate = await fetch(`${baseUrl}/api/auth/merchants/merchant-a/status`, {
    method: "PATCH",
    headers: { ...assistantHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "suspended", reason: "test" }),
  });
  assert.equal(statusUpdate.status, 200);

  const forbiddenAdmins = await fetch(`${baseUrl}/api/auth/admins`, { headers: assistantHeaders });
  assert.equal(forbiddenAdmins.status, 403);

  const ownerDisable = await fetch(`${baseUrl}/api/auth/admins/owner-admin/enabled`, {
    method: "PATCH",
    headers: { ...ownerHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(ownerDisable.status, 400);

  const permissionsUpdate = await json(await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/permissions`,
    {
      method: "PATCH",
      headers: { ...ownerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: ["view_logs", "manage_support"] }),
    },
  ));
  assert.equal(permissionsUpdate.response.status, 200);
  assert.deepEqual(permissionsUpdate.body.admin.permissions, ["view_logs", "manage_support"]);

  const refreshedAssistant = await json(await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: assistantHeaders,
  }));
  assert.equal(refreshedAssistant.response.status, 200);
  assert.deepEqual(refreshedAssistant.body.admin.permissions, ["view_logs", "manage_support"]);

  const revokedMerchantList = await fetch(`${baseUrl}/api/auth/merchants`, {
    headers: assistantHeaders,
  });
  assert.equal(revokedMerchantList.status, 403);
});
''', encoding="utf-8")

for rel in [
    "artifacts/api-server/src/services/adminManagement.ts",
    "artifacts/fawri/src/lib/types.ts",
    "artifacts/fawri/src/components/admin/AdministratorsTab.tsx",
]:
    text = read(rel)
    if "manage_admins" in text or "manage_merchants" in text or "inspection_sessions" in text:
        raise RuntimeError(f"legacy permission remains in {rel}")

print("Admin permissions v2 migration applied successfully")
