import { EMERGENCY_READ_ACCESS_LAUNCHER_TEXT } from '@/lib/translations/features/components/admin/EmergencyReadAccessLauncher';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

import { useI18n } from '@/lib/i18n';
import {
  clearSession,
  getAdminAuthHeaders,
  getAdminSessionToken,
} from '@/lib/store';
import { Button } from '@/components/ui/button';

type EmergencyOverview = {
  ok: boolean;
  is_owner?: boolean;
  authorization?: {
    can_request?: boolean;
  } | null;
  requests?: Array<{
    id: string;
    status: string;
  }>;
};

const TEXT = EMERGENCY_READ_ACCESS_LAUNCHER_TEXT;

function findLanguageSwitcher(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('header div'));

  for (const candidate of candidates) {
    if (candidate.children.length !== 3) continue;

    const buttons = Array.from(candidate.children).filter(
      (child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
    );

    if (buttons.length !== 3) continue;

    const labels = new Set(
      buttons.map((button) => button.textContent?.trim().toUpperCase() || ''),
    );

    if (labels.has('AR') && labels.has('KU') && labels.has('EN')) {
      return candidate;
    }
  }

  return null;
}

export default function EmergencyReadAccessLauncher() {
  const { lang } = useI18n();
  const text = TEXT[lang];
  const [location, setLocation] = useLocation();
  const [visible, setVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const previousPendingCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      !location.startsWith('/admin') ||
      location.startsWith('/admin/support-preview/') ||
      location === '/admin/emergency-access' ||
      !getAdminSessionToken()
    ) {
      setVisible(false);
      setPendingCount(0);
      previousPendingCountRef.current = null;
      return;
    }

    let stopped = false;

    const refresh = async () => {
      try {
        const response = await fetch(
          '/api/auth/admin/emergency-read-access/overview',
          {
            headers: getAdminAuthHeaders(),
            cache: 'no-store',
          },
        );
        const data = (await response.json().catch(() => null)) as
          | EmergencyOverview
          | null;

        if (stopped) return;
        if (response.status === 401) {
          clearSession();
          setVisible(false);
          window.location.href = '/login';
          return;
        }
        if (!response.ok || !data?.ok) {
          setVisible(false);
          return;
        }

        const allowed =
          data.is_owner === true || data.authorization?.can_request === true;
        setVisible(allowed);

        const nextPendingCount = data.is_owner
          ? (data.requests || []).filter((request) => request.status === 'pending')
              .length
          : 0;

        if (
          previousPendingCountRef.current !== null &&
          nextPendingCount > previousPendingCountRef.current
        ) {
          toast.info(text.newRequest);
        }
        previousPendingCountRef.current = nextPendingCount;
        setPendingCount(nextPendingCount);
      } catch {
        if (!stopped) setVisible(false);
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 10_000);
    const handleFocus = () => void refresh();
    window.addEventListener('focus', handleFocus);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [location, text.newRequest]);

  useEffect(() => {
    if (
      !location.startsWith('/admin') ||
      location.startsWith('/admin/support-preview/') ||
      location === '/admin/emergency-access'
    ) {
      setPortalHost(null);
      return;
    }

    let host: HTMLSpanElement | null = null;

    const mountHost = () => {
      if (host?.isConnected) return;

      const languageSwitcher = findLanguageSwitcher();
      if (!languageSwitcher?.parentElement) return;

      host = document.createElement('span');
      host.dataset.emergencyAccessHost = 'true';
      host.className = 'inline-flex shrink-0';
      languageSwitcher.insertAdjacentElement('afterend', host);
      setPortalHost(host);
    };

    mountHost();

    const observer = new MutationObserver(() => {
      if (!host?.isConnected) mountHost();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      setPortalHost(null);
      host?.remove();
    };
  }, [lang, location]);

  if (!visible || !portalHost) return null;

  return createPortal(
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setLocation('/admin/emergency-access')}
      className="h-8 min-h-0 gap-1.5 whitespace-nowrap rounded-md border-sky-300 bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-sm hover:border-sky-400 hover:bg-sky-200 hover:text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
      aria-label={text.label}
      title={text.label}
    >
      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
      <span className="hidden lg:inline">{text.label}</span>
      {pendingCount > 0 && (
        <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
          {pendingCount}
        </span>
      )}
    </Button>,
    portalHost,
  );
}
