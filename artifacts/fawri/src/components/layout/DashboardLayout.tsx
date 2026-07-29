import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useLocation } from 'wouter';
import {
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

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  useMerchantRealtimeConnection();
  const { t, dir } = useI18n();
  const [location, setLocation] = useLocation();
  const [merchant, setMerchant] = useState<Merchant | undefined>(
    getCurrentMerchant(),
  );

  useEffect(() => {
    let active = true;

    refreshCurrentMerchantFromApi()
      .then((updated) => {
        if (!active) return;
        if (updated) setMerchant(updated);
        if (!updated || updated.status !== 'approved') {
          setLocation('/login');
        }
      })
      .catch(() => {
        const current = getCurrentMerchant();
        if (!current || current.status !== 'approved') {
          setLocation('/login');
        }
      });

    return () => {
      active = false;
    };
  }, [setLocation]);

  const productsReadOnly =
    location.startsWith('/dashboard/products') &&
    PRODUCT_READ_ONLY_STATUSES.has(merchant?.retention_status || '');

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
