import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useLocation } from 'wouter';
import {
  getCurrentMerchant,
  refreshCurrentMerchantFromApi,
} from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import type { Merchant, MerchantBalanceNotification } from '@/lib/types';

function formatNotificationText(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
    template,
  );
}

const PRODUCT_READ_ONLY_STATUSES = new Set([
  'warning_2',
  'warning_3',
  'final_warning',
  'eligible_for_deletion',
]);

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, dir, lang } = useI18n();
  const [location, setLocation] = useLocation();
  const [merchant, setMerchant] = useState<Merchant | undefined>(
    getCurrentMerchant(),
  );
  const [balanceNotification, setBalanceNotification] =
    useState<MerchantBalanceNotification | null>(null);

  const loadLatestBalanceNotification = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/notifications?unread=1&limit=1');
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) return;
      setBalanceNotification(
        Array.isArray(data.notifications) && data.notifications.length > 0
          ? (data.notifications[0] as MerchantBalanceNotification)
          : null,
      );
    } catch (error) {
      console.error('Could not load merchant notifications:', error);
    }
  }, []);

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

  useEffect(() => {
    void loadLatestBalanceNotification();
    const handleFocus = () => void loadLatestBalanceNotification();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadLatestBalanceNotification]);

  const dismissBalanceNotification = async () => {
    if (!balanceNotification) return;
    const notificationId = balanceNotification.id;
    setBalanceNotification(null);
    try {
      const response = await fetch(
        `/api/auth/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'PATCH' },
      );
      if (response.ok) await loadLatestBalanceNotification();
    } catch (error) {
      console.error('Could not mark merchant notification as read:', error);
    }
  };

  const productsReadOnly =
    location.startsWith('/dashboard/products') &&
    PRODUCT_READ_ONLY_STATUSES.has(merchant?.retention_status || '');

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl" dir={dir}>
            {balanceNotification && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950 shadow-sm dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-100">
                <Bell className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{t.balance_notification_title}</p>
                  <p className="mt-1 text-sm font-medium leading-6">
                    {formatNotificationText(
                      balanceNotification.emergency_debt_paid > 0
                        ? balanceNotification.addon_replies_added > 0
                          ? t.balance_notification_debt_and_addon
                          : t.balance_notification_debt_only
                        : t.balance_notification_addon_only,
                      {
                        purchased: balanceNotification.purchased_replies.toLocaleString(),
                        debtPaid: balanceNotification.emergency_debt_paid.toLocaleString(),
                        debtRemaining: balanceNotification.emergency_debt_remaining.toLocaleString(),
                        addonAdded: balanceNotification.addon_replies_added.toLocaleString(),
                      },
                    )}
                  </p>
                  <p className="mt-2 rounded-xl border border-sky-200/80 bg-white/70 px-3 py-2 text-xs font-semibold leading-5 dark:border-sky-800 dark:bg-sky-950/40">
                    {formatNotificationText(t.balance_notification_summary, {
                      base: balanceNotification.base_replies_remaining.toLocaleString(),
                      emergency: balanceNotification.emergency_replies_remaining.toLocaleString(),
                      addon: balanceNotification.addon_replies_remaining.toLocaleString(),
                      total: balanceNotification.total_replies_available.toLocaleString(),
                    })}
                  </p>
                  <p className="mt-2 text-[11px] text-sky-700/80 dark:text-sky-300/80">
                    {new Date(balanceNotification.created_at).toLocaleString(
                      lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-300 bg-white/70 transition-colors hover:bg-white dark:border-sky-700 dark:bg-sky-950/40 dark:hover:bg-sky-900"
                  aria-label={t.balance_notification_dismiss}
                  title={t.balance_notification_dismiss}
                  onClick={() => void dismissBalanceNotification()}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

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
