from __future__ import annotations

import json
from pathlib import Path

ROOT = Path("/home/runner/workspace") if Path("/home/runner/workspace").exists() else Path.cwd()

AUTH = ROOT / "artifacts/api-server/src/routes/auth.ts"
API_PACKAGE = ROOT / "artifacts/api-server/package.json"
API_TEST = ROOT / "artifacts/api-server/tests/role-session-isolation.integration.test.mjs"
STORE = ROOT / "artifacts/fawri/src/lib/store.ts"
LOGIN = ROOT / "artifacts/fawri/src/pages/LoginPage.tsx"
DASHBOARD = ROOT / "artifacts/fawri/src/components/layout/DashboardLayout.tsx"
FRONTEND_PACKAGE = ROOT / "artifacts/fawri/package.json"
FRONTEND_TEST = ROOT / "artifacts/fawri/tests/role-session-isolation.test.mjs"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# API: branch by role before touching any session cookie.
# Admin login must never clear or replace an existing merchant cookie.
# ---------------------------------------------------------------------------
auth = AUTH.read_text(encoding="utf-8")
auth = replace_once(
    auth,
    '''  if (merchant.is_admin) {
    clearMerchantSessionCookie(res);
  } else {
    setMerchantSessionCookie(res, merchant.id);
  }

  return res.json({
    ok: true,
    merchant: publicMerchant(merchant),
    ...(merchant.is_admin
      ? { admin_token: createAdminSessionToken(merchant, trackedSession) }
      : {}),
  });
''',
    '''  res.setHeader("Cache-Control", "no-store");
  const safeAccount = publicMerchant(merchant);

  if (merchant.is_admin) {
    return res.json({
      ok: true,
      account_type: "admin",
      merchant: safeAccount,
      admin_token: createAdminSessionToken(merchant, trackedSession),
    });
  }

  setMerchantSessionCookie(res, merchant.id);
  return res.json({
    ok: true,
    account_type: "merchant",
    merchant: safeAccount,
  });
''',
    "role-specific login response",
)
AUTH.write_text(auth, encoding="utf-8")


# ---------------------------------------------------------------------------
# Frontend store: merchant identity becomes tab-scoped. Admin and merchant
# logout paths are separated, and admin records can never enter merchant cache.
# ---------------------------------------------------------------------------
store = STORE.read_text(encoding="utf-8")
store = replace_once(
    store,
    '''export const getSession = (): string | null =>
  localStorage.getItem('fawri_session');

export const setSession = (id: string) =>
  localStorage.setItem('fawri_session', id);

const ADMIN_SESSION_TOKEN_KEY = 'fawri_admin_session_token';
const ADMIN_DEVICE_ID_KEY = 'fawri_admin_device_id';
''',
    '''const MERCHANT_SESSION_ID_KEY = 'fawri_merchant_session_id';
const LEGACY_MERCHANT_SESSION_ID_KEY = 'fawri_session';
const ADMIN_SESSION_TOKEN_KEY = 'fawri_admin_session_token';
const ADMIN_DEVICE_ID_KEY = 'fawri_admin_device_id';

export const getSession = (): string | null =>
  sessionStorage.getItem(MERCHANT_SESSION_ID_KEY);

export const setSession = (id: string) =>
  sessionStorage.setItem(MERCHANT_SESSION_ID_KEY, id);

export const clearMerchantTabSession = () =>
  sessionStorage.removeItem(MERCHANT_SESSION_ID_KEY);
''',
    "tab-scoped merchant session",
)

store = replace_once(
    store,
    '''export const clearSession = () => {
  const hadSession = Boolean(localStorage.getItem('fawri_session'));
  const adminToken = getAdminSessionToken();
  const adminHeaders = adminToken ? getAdminAuthHeaders() : {};

  localStorage.removeItem('fawri_session');
  clearAdminSessionToken();

  if (adminToken) {
    void fetch('/api/auth/admin/session/logout', {
      method: 'POST',
      headers: adminHeaders,
      keepalive: true,
    }).catch(() => undefined);
  } else if (hadSession) {
    void fetch('/api/auth/logout', {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  }
};
''',
    '''export const clearAdminSession = () => {
  const adminToken = getAdminSessionToken();
  if (!adminToken) return;

  const adminHeaders = getAdminAuthHeaders();
  clearAdminSessionToken();

  void fetch('/api/auth/admin/session/logout', {
    method: 'POST',
    headers: adminHeaders,
    keepalive: true,
  }).catch(() => undefined);
};

export const clearSession = () => {
  if (getAdminSessionToken()) {
    clearMerchantTabSession();
    clearAdminSession();
    return;
  }

  const hadMerchantSession = Boolean(getSession());
  clearMerchantTabSession();

  if (hadMerchantSession) {
    void fetch('/api/auth/logout', {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  }
};
''',
    "role-specific logout",
)

store = replace_once(
    store,
    '''export const initStore = () => {
  const merchants = safeParse<Merchant[]>('fawri_merchants', []);
  const cleanedMerchants = merchants.filter(
    merchant =>
      merchant.id !== 'merchant-demo' &&
      !(merchant.is_admin === true && merchant.phone === '07800000001')
  );

  if (
    !localStorage.getItem('fawri_merchants') ||
    cleanedMerchants.length !== merchants.length
  ) {
    save('fawri_merchants', cleanedMerchants);
  }
''',
    '''export const initStore = () => {
  const merchants = safeParse<Merchant[]>('fawri_merchants', []);
  const cleanedMerchants = merchants.filter(
    merchant => merchant.id !== 'merchant-demo' && merchant.is_admin !== true
  );

  const legacySessionId = localStorage.getItem(LEGACY_MERCHANT_SESSION_ID_KEY);
  if (
    !getSession() &&
    !getAdminSessionToken() &&
    legacySessionId &&
    cleanedMerchants.some(merchant => merchant.id === legacySessionId)
  ) {
    setSession(legacySessionId);
  }
  localStorage.removeItem(LEGACY_MERCHANT_SESSION_ID_KEY);

  if (
    !localStorage.getItem('fawri_merchants') ||
    cleanedMerchants.length !== merchants.length
  ) {
    save('fawri_merchants', cleanedMerchants);
  }
''',
    "legacy merchant session migration",
)

store = replace_once(
    store,
    '''export const saveMerchants = (merchants: Merchant[]) =>
  save('fawri_merchants', merchants);

export const getCurrentMerchant = (): Merchant | undefined => {
  const id = getSession();
  if (!id) return undefined;
  return getMerchants().find(merchant => merchant.id === id);
};

export const refreshCurrentMerchantFromApi = async (): Promise<Merchant | undefined> => {
  const merchantId = getSession();
  if (!merchantId) return undefined;

  const response = await fetch('/api/auth/me');
''',
    '''export const saveMerchants = (merchants: Merchant[]) =>
  save(
    'fawri_merchants',
    merchants.filter(merchant => merchant.is_admin !== true),
  );

export const getCurrentMerchant = (): Merchant | undefined => {
  const id = getSession();
  if (!id) return undefined;
  return getMerchants().find(
    merchant => merchant.id === id && merchant.is_admin !== true,
  );
};

export const refreshCurrentMerchantFromApi = async (): Promise<Merchant | undefined> => {
  const response = await fetch('/api/auth/me');
''',
    "merchant-only local cache",
)

store = replace_once(
    store,
    '''  const apiMerchant = result.merchant as Merchant;
  setSession(apiMerchant.id);
''',
    '''  const apiMerchant = result.merchant as Merchant;
  if (apiMerchant.is_admin === true) {
    throw new Error('Administrator accounts cannot use the merchant dashboard');
  }
  setSession(apiMerchant.id);
''',
    "reject admin from merchant refresh",
)
STORE.write_text(store, encoding="utf-8")


# ---------------------------------------------------------------------------
# Login: determine account type first. Never write an admin into merchant state.
# ---------------------------------------------------------------------------
login = LOGIN.read_text(encoding="utf-8")
login = replace_once(
    login,
    '''  clearAdminSessionToken,
  getAdminDeviceId,
''',
    '''  clearAdminSession,
  clearMerchantTabSession,
  getAdminDeviceId,
''',
    "login session imports",
)

login = replace_once(
    login,
    '''      const user = result.merchant;

      if (
        user.is_admin &&
        typeof result.admin_token !== 'string'
      ) {
        toast.error(t.login_error_connection);
        return;
      }

      cacheMerchantLocally(user);
      setSession(user.id);

      if (user.is_admin) {
        setAdminSessionToken(result.admin_token);
        toast.success(t.login_success_admin);
        setLocation('/admin');
        return;
      }

      clearAdminSessionToken();

      if (user.status === 'approved') {
''',
    '''      const user = result.merchant;
      const accountType =
        result.account_type === 'admin' || result.account_type === 'merchant'
          ? result.account_type
          : user.is_admin
            ? 'admin'
            : 'merchant';

      if (accountType === 'admin') {
        if (!user.is_admin || typeof result.admin_token !== 'string') {
          toast.error(t.login_error_connection);
          return;
        }

        clearMerchantTabSession();
        setAdminSessionToken(result.admin_token);
        toast.success(t.login_success_admin);
        setLocation('/admin');
        return;
      }

      if (user.is_admin || typeof result.admin_token === 'string') {
        toast.error(t.login_error_connection);
        return;
      }

      clearAdminSession();
      cacheMerchantLocally(user);
      setSession(user.id);

      if (user.status === 'approved') {
''',
    "login role branch",
)
LOGIN.write_text(login, encoding="utf-8")


# ---------------------------------------------------------------------------
# Dashboard: fail closed, wait for server identity, and redirect admin tabs.
# The realtime merchant hooks mount only after merchant authorization succeeds.
# ---------------------------------------------------------------------------
DASHBOARD.write_text('''import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useLocation } from 'wouter';
import {
  clearMerchantTabSession,
  getAdminSessionToken,
  getCurrentMerchant,
  refreshCurrentMerchantFromApi,
} from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import type { Merchant } from '@/lib/types';
import { useMerchantRealtimeConnection } from '@/hooks/useMerchantRealtime';

const PRODUCT_READ_ONLY_STATUSES = new Set([
  'warning_2',
  'warning_3',
  'final_warning',
  'eligible_for_deletion',
]);

function AuthorizedDashboard({
  children,
  merchant,
}: {
  children: React.ReactNode;
  merchant: Merchant;
}) {
  useMerchantRealtimeConnection();
  const { t, dir } = useI18n();
  const [location] = useLocation();
  const productsReadOnly =
    location.startsWith('/dashboard/products') &&
    PRODUCT_READ_ONLY_STATUSES.has(merchant.retention_status || '');

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl" dir={dir}>
            {productsReadOnly && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-extrabold">{t.retention_warning_2_title}</p>
                  <p className="mt-1 text-sm leading-6">
                    {t.retention_warning_2_body}
                  </p>
                </div>
              </div>
            )}

            <div className={productsReadOnly ? 'pointer-events-none select-text opacity-80' : ''}>
              {children}
            </div>
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [, setLocation] = useLocation();
  const [merchant, setMerchant] = useState<Merchant | undefined>(
    getCurrentMerchant(),
  );
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let active = true;

    if (getAdminSessionToken()) {
      clearMerchantTabSession();
      setLocation('/admin');
      setCheckingAccess(false);
      return () => {
        active = false;
      };
    }

    refreshCurrentMerchantFromApi()
      .then((updated) => {
        if (!active) return;
        if (
          !updated ||
          updated.is_admin === true ||
          updated.status !== 'approved'
        ) {
          clearMerchantTabSession();
          setMerchant(undefined);
          setLocation('/login');
          return;
        }
        setMerchant(updated);
      })
      .catch(() => {
        if (!active) return;
        clearMerchantTabSession();
        setMerchant(undefined);
        setLocation('/login');
      })
      .finally(() => {
        if (active) setCheckingAccess(false);
      });

    return () => {
      active = false;
    };
  }, [setLocation]);

  if (checkingAccess) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-center text-sm font-semibold text-muted-foreground">
        {t.app_loading}
      </div>
    );
  }

  if (!merchant || merchant.is_admin === true || merchant.status !== 'approved') {
    return null;
  }

  return <AuthorizedDashboard merchant={merchant}>{children}</AuthorizedDashboard>;
}
''', encoding="utf-8")


# ---------------------------------------------------------------------------
# API integration regression: merchant cookie must survive admin login and
# each API family must reject the other role's credential type.
# ---------------------------------------------------------------------------
API_TEST.parent.mkdir(parents=True, exist_ok=True)
API_TEST.write_text(r'''import assert from "node:assert/strict";
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
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited early.\n${logs()}`);
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become ready.\n${logs()}`);
}

function getSetCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [];
  return values[0] || response.headers.get("set-cookie") || "";
}

function cookiePair(setCookie) {
  assert.match(setCookie, /^fawri_merchant_session=/);
  return setCookie.split(";", 1)[0];
}

async function json(response) {
  return { response, body: await response.json().catch(() => null) };
}

test("merchant, assistant, and owner sessions stay role-isolated", async (t) => {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fawri-role-isolation-"));
  const dataDir = path.join(runtimeDir, "data");
  await mkdir(dataDir, { recursive: true });

  const baseAccount = {
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-04T00:00:00.000Z",
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };

  await writeFile(
    path.join(dataDir, "merchants.json"),
    JSON.stringify({
      merchants: [
        {
          ...baseAccount,
          id: "merchant-one",
          owner_name: "Merchant Owner",
          store_name: "Merchant Store",
          phone: "07111111111",
          password: "Merchant1@",
          activity_type: "retail",
        },
        {
          ...baseAccount,
          id: "owner-admin",
          owner_name: "System Owner",
          store_name: "Fawri Admin",
          phone: "07222222222",
          password: "OwnerPass1@",
          activity_type: "admin",
          is_admin: true,
          admin_role: "owner_admin",
          admin_enabled: true,
        },
        {
          ...baseAccount,
          id: "assistant-admin",
          owner_name: "Assistant",
          store_name: "Fawri Admin",
          phone: "07333333333",
          password: "Assistant1@",
          activity_type: "admin",
          is_admin: true,
          admin_role: "assistant_admin",
          admin_enabled: true,
          permissions: ["view_merchants"],
        },
      ],
      subscriptions: [],
      otps: [],
      admin_logs: [],
      merchant_notifications: [],
      support_tickets: [],
      deletion_requests: [],
      channel_overrides: {},
      admin_notes: {},
    }),
  );

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
      FAWRI_MERCHANT_SESSION_SECRET: "test-merchant-session-secret",
      FAWRI_ADMIN_PHONE: "07222222222",
      FAWRI_ADMIN_DEVICE_TRUST_ENFORCED: "false",
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

  async function login(phone, password, headers = {}) {
    return json(await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ phone, password }),
    }));
  }

  const merchantLogin = await login("07111111111", "Merchant1@");
  assert.equal(merchantLogin.response.status, 200);
  assert.equal(merchantLogin.body.account_type, "merchant");
  assert.equal(merchantLogin.body.merchant.id, "merchant-one");
  assert.equal("admin_token" in merchantLogin.body, false);
  const merchantCookie = cookiePair(getSetCookie(merchantLogin.response));

  const merchantBeforeAdmin = await json(await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: merchantCookie },
  }));
  assert.equal(merchantBeforeAdmin.response.status, 200);
  assert.equal(merchantBeforeAdmin.body.merchant.id, "merchant-one");
  assert.equal(merchantBeforeAdmin.body.merchant.is_admin, undefined);

  const ownerLogin = await login(
    "07222222222",
    "OwnerPass1@",
    { Cookie: merchantCookie },
  );
  assert.equal(ownerLogin.response.status, 200);
  assert.equal(ownerLogin.body.account_type, "admin");
  assert.equal(ownerLogin.body.merchant.admin_role, "owner_admin");
  assert.equal(typeof ownerLogin.body.admin_token, "string");
  assert.equal(getSetCookie(ownerLogin.response), "");

  const merchantAfterAdmin = await json(await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: merchantCookie },
  }));
  assert.equal(merchantAfterAdmin.response.status, 200);
  assert.equal(merchantAfterAdmin.body.merchant.id, "merchant-one");

  const ownerMe = await json(await fetch(`${baseUrl}/api/auth/admin/me`, {
    headers: { Authorization: `Bearer ${ownerLogin.body.admin_token}` },
  }));
  assert.equal(ownerMe.response.status, 200);
  assert.equal(ownerMe.body.admin.id, "owner-admin");
  assert.equal(ownerMe.body.admin.admin_role, "owner_admin");

  const merchantCredentialOnAdminRoute = await fetch(
    `${baseUrl}/api/auth/admin/me`,
    { headers: { Cookie: merchantCookie } },
  );
  assert.equal(merchantCredentialOnAdminRoute.status, 401);

  const adminCredentialOnMerchantRoute = await fetch(
    `${baseUrl}/api/auth/me`,
    { headers: { Authorization: `Bearer ${ownerLogin.body.admin_token}` } },
  );
  assert.equal(adminCredentialOnMerchantRoute.status, 401);

  const assistantLogin = await login("07333333333", "Assistant1@");
  assert.equal(assistantLogin.response.status, 200);
  assert.equal(assistantLogin.body.account_type, "admin");
  assert.equal(assistantLogin.body.merchant.admin_role, "assistant_admin");
  assert.equal(getSetCookie(assistantLogin.response), "");

  const ownerOnlyMonitor = await fetch(
    `${baseUrl}/api/auth/admins/assistant-admin/work-monitor`,
    {
      headers: {
        Authorization: `Bearer ${assistantLogin.body.admin_token}`,
      },
    },
  );
  assert.equal(ownerOnlyMonitor.status, 403);
});
''', encoding="utf-8")

api_package = json.loads(API_PACKAGE.read_text(encoding="utf-8"))
api_package["scripts"]["test:role-session-isolation"] = (
    "node ./build.mjs && node --test ./tests/role-session-isolation.integration.test.mjs"
)
API_PACKAGE.write_text(json.dumps(api_package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Frontend regression test protects the exact session-storage and role-guard
# invariants that caused the cross-tab account contamination.
# ---------------------------------------------------------------------------
FRONTEND_TEST.parent.mkdir(parents=True, exist_ok=True)
FRONTEND_TEST.write_text(r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const store = await readFile(new URL("../src/lib/store.ts", import.meta.url), "utf8");
const login = await readFile(new URL("../src/pages/LoginPage.tsx", import.meta.url), "utf8");
const dashboard = await readFile(
  new URL("../src/components/layout/DashboardLayout.tsx", import.meta.url),
  "utf8",
);

test("merchant and administrator browser state stays isolated by tab and role", () => {
  assert.match(
    store,
    /sessionStorage\.getItem\(MERCHANT_SESSION_ID_KEY\)/,
    "merchant session id must be tab-scoped",
  );
  assert.match(
    store,
    /merchants\.filter\(merchant => merchant\.is_admin !== true\)/,
    "administrator accounts must never enter merchant cache",
  );

  const adminBranchStart = login.indexOf("if (accountType === 'admin')");
  const merchantCacheStart = login.indexOf("cacheMerchantLocally(user)");
  assert.ok(adminBranchStart >= 0, "admin login branch must exist");
  assert.ok(
    merchantCacheStart > adminBranchStart,
    "role must be resolved before merchant state is written",
  );
  const adminBranch = login.slice(adminBranchStart, merchantCacheStart);
  assert.match(adminBranch, /clearMerchantTabSession\(\)/);
  assert.doesNotMatch(adminBranch, /setSession\(/);
  assert.doesNotMatch(adminBranch, /cacheMerchantLocally\(/);

  assert.match(dashboard, /if \(getAdminSessionToken\(\)\)/);
  assert.match(dashboard, /updated\.is_admin === true/);
  assert.match(dashboard, /if \(checkingAccess\)/);
});
''', encoding="utf-8")

frontend_package = json.loads(FRONTEND_PACKAGE.read_text(encoding="utf-8"))
frontend_package["scripts"]["test:role-session-isolation"] = (
    "node --test ./tests/role-session-isolation.test.mjs"
)
FRONTEND_PACKAGE.write_text(
    json.dumps(frontend_package, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print("Role and cross-tab session isolation fix applied.")
