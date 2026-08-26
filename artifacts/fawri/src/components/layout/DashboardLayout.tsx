import { COMMON_UI_COPY } from '@/lib/translations/commonUi';
import React, { useEffect, useState } from 'react';
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
import { checkMerchantLifecycle, lifecyclePollDelay } from '@/lib/merchantLifecycle';
import { useI18n } from '@/lib/i18n';
import { FAWRI_UI_BASELINE_CLASS } from '@/lib/fawriUiBaseline';
import type { Merchant } from '@/lib/types';
import { useMerchantRealtimeConnection } from '@/hooks/useMerchantRealtime';

const PRODUCT_READ_ONLY_STATUSES = new Set([
  'warning_2',
  'warning_3',
  'final_warning',
  'eligible_for_deletion',
]);

const DASHBOARD_RETURN_PATH_KEY = 'fawri.dashboard.returnPath';
const SESSION_401_CONFIRM_DELAYS_MS = [150, 650] as const;

function isSafeDashboardReturnPath(value: string) {
  return value === '/dashboard' || value.startsWith('/dashboard/');
}

function currentDashboardReturnPath() {
  if (typeof window === 'undefined') return '/dashboard';
  const candidate = `${window.location.pathname}${window.location.search}`;
  return isSafeDashboardReturnPath(candidate) ? candidate : '/dashboard';
}

function rememberDashboardReturnPath() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      DASHBOARD_RETURN_PATH_KEY,
      currentDashboardReturnPath(),
    );
  } catch {
    // Session storage is a navigation convenience only.
  }
}

function consumeDashboardReturnPath() {
  if (typeof window === 'undefined') return null;
  try {
    const candidate = window.sessionStorage.getItem(DASHBOARD_RETURN_PATH_KEY);
    window.sessionStorage.removeItem(DASHBOARD_RETURN_PATH_KEY);
    return candidate && isSafeDashboardReturnPath(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

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
          <div className={`mx-auto max-w-6xl ${FAWRI_UI_BASELINE_CLASS}`} dir={dir}>
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
  const { lang } = useI18n();
  const commonCopy = COMMON_UI_COPY[lang];
  const [, setLocation] = useLocation();
  const [merchant, setMerchant] = useState<Merchant | undefined>(
    getCurrentMerchant(),
  );
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let profileLoaded = false;
    let transientFailures = 0;

    if (getAdminSessionToken()) {
      clearMerchantTabSession();
      setLocation('/admin');
      setCheckingAccess(false);
      return () => {
        active = false;
      };
    }

    const scheduleRetry = () => {
      if (!active) return;
      const delay = lifecyclePollDelay(transientFailures);
      timer = window.setTimeout(() => void verifyAccess(), delay);
    };

    const routeToLifecycle = () => {
      clearMerchantTabSession();
      setMerchant(undefined);
      setCheckingAccess(false);
      setLocation('/pending');
    };

    const routeToLogin = () => {
      rememberDashboardReturnPath();
      clearMerchantTabSession();
      setMerchant(undefined);
      setCheckingAccess(false);
      setLocation('/login');
    };

    async function verifyAccess() {
      controller?.abort();
      controller = new AbortController();

      try {
        let lifecycle = await checkMerchantLifecycle(controller.signal);
        if (!active) return;

        // Session rotation can briefly leave an already-started request carrying
        // the superseded cookie while another response is delivering the fresh
        // replacement. A single 401 is therefore not enough to destroy an active
        // merchant workspace. Confirm it twice, using the browser's newest cookie,
        // before treating it as an authoritative logout decision.
        if (!lifecycle.ok && lifecycle.reason === 'unauthenticated') {
          for (const delay of SESSION_401_CONFIRM_DELAYS_MS) {
            await new Promise<void>(resolve => window.setTimeout(resolve, delay));
            if (!active) return;
            lifecycle = await checkMerchantLifecycle(controller.signal);
            if (lifecycle.ok || lifecycle.reason !== 'unauthenticated') break;
          }
        }

        if (!active) return;
        if (!lifecycle.ok) {
          if (lifecycle.reason === 'unauthenticated') {
            routeToLogin();
            return;
          }

          // Connectivity/server failures are not authentication decisions.
          // Keep an already-authorized merchant in place and retry instead of
          // clearing the tab session and throwing away in-progress merchant work.
          transientFailures += 1;
          scheduleRetry();
          return;
        }

        transientFailures = 0;

        if (lifecycle.lifecycle.account_status !== 'approved') {
          routeToLifecycle();
          return;
        }

        if (!profileLoaded) {
          try {
            const updated = await refreshCurrentMerchantFromApi();
            if (!active) return;
            if (
              !updated ||
              updated.is_admin === true ||
              updated.status !== 'approved'
            ) {
              routeToLifecycle();
              return;
            }
            setMerchant(updated);
            profileLoaded = true;
            setCheckingAccess(false);

            const returnPath = consumeDashboardReturnPath();
            if (
              returnPath &&
              returnPath !== currentDashboardReturnPath()
            ) {
              setLocation(returnPath);
              return;
            }
          } catch {
            if (!active) return;
            // The lifecycle endpoint has already authenticated the merchant and
            // confirmed an approved account. A temporary profile refresh failure
            // must not manufacture a logout. Keep/reuse the cached profile when
            // available and retry the server refresh on the next poll.
            const cached = getCurrentMerchant();
            if (
              cached &&
              cached.is_admin !== true &&
              cached.status === 'approved'
            ) {
              setMerchant(cached);
              setCheckingAccess(false);
            }
            transientFailures += 1;
            scheduleRetry();
            return;
          }
        }

        if (active) {
          timer = window.setTimeout(() => void verifyAccess(), 30_000);
        }
      } catch (error) {
        if (!active || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }
        transientFailures += 1;
        scheduleRetry();
      }
    }

    void verifyAccess();

    return () => {
      active = false;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [setLocation]);

  if (checkingAccess) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-center text-sm font-semibold text-muted-foreground">
        {commonCopy.checkingAccountAccess}
      </div>
    );
  }

  if (!merchant || merchant.is_admin === true || merchant.status !== 'approved') {
    return null;
  }

  return <AuthorizedDashboard merchant={merchant}>{children}</AuthorizedDashboard>;
}