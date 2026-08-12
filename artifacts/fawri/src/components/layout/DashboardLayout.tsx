import { COMMON_UI_COPY } from '@/lib/translations/commonUi';
import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useLocation } from 'wouter';
import {
  clearMerchantTabSession,
  getCurrentMerchant,
  refreshCurrentMerchantFromApi,
} from '@/lib/store';
import { checkMerchantLifecycle } from '@/lib/merchantLifecycle';
import { useI18n } from '@/lib/i18n';
import type { Merchant } from '@/lib/types';
import { useMerchantRealtimeConnection } from '@/hooks/useMerchantRealtime';

const PRODUCT_READ_ONLY_STATUSES = new Set([
  'warning_2',
  'warning_3',
  'final_warning',
  'eligible_for_deletion',
]);

async function secureAdminSessionStatus(
  signal: AbortSignal,
): Promise<'admin' | 'none' | 'unknown'> {
  try {
    const response = await fetch('/api/auth/admin/me', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      return data?.ok === true && data?.admin?.is_admin === true ? 'admin' : 'none';
    }
    return response.status === 401 ? 'none' : 'unknown';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return 'unknown';
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

    const routeToLifecycle = () => {
      clearMerchantTabSession();
      setMerchant(undefined);
      setCheckingAccess(false);
      setLocation('/pending');
    };

    async function verifyAccess() {
      controller?.abort();
      controller = new AbortController();

      try {
        const adminStatus = await secureAdminSessionStatus(controller.signal);
        if (!active) return;
        if (adminStatus === 'admin') {
          clearMerchantTabSession();
          setMerchant(undefined);
          setCheckingAccess(false);
          setLocation('/admin');
          return;
        }
        if (adminStatus === 'unknown') {
          setCheckingAccess(true);
          timer = window.setTimeout(() => void verifyAccess(), 5_000);
          return;
        }

        const lifecycle = await checkMerchantLifecycle(controller.signal);
        if (!active) return;

        if (!lifecycle.ok) {
          clearMerchantTabSession();
          setMerchant(undefined);
          setCheckingAccess(false);
          setLocation(
            lifecycle.reason === 'unauthenticated' ? '/login' : '/pending',
          );
          return;
        }

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
          } catch {
            if (!active) return;
            routeToLifecycle();
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
        routeToLifecycle();
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
