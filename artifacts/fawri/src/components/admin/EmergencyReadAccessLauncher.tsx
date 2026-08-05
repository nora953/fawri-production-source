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

const TEXT = {
  ar: {
    label: 'الوصول الطارئ',
    newRequest: 'وصل طلب جديد للوصول الطارئ وينتظر قرار المالك.',
  },
  ku: {
    label: 'دەستگەیشتنی فریاکەوتن',
    newRequest: 'داواکارییەکی نوێی دەستگەیشتنی فریاکەوتن گەیشت و چاوەڕوانی بڕیاری خاوەن سیستەمە.',
  },
  en: {
    label: 'Emergency access',
    newRequest: 'A new emergency access request is awaiting the owner’s decision.',
  },
} as const;

export default function EmergencyReadAccessLauncher() {
  const { lang } = useI18n();
  const text = TEXT[lang];
  const [location, setLocation] = useLocation();
  const [visible, setVisible] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
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

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <Button
      type="button"
      onClick={() => setLocation('/admin/emergency-access')}
      className="fixed z-40 h-auto min-h-11 max-w-[calc(100vw-2.5rem)] gap-2 rounded-full px-3.5 py-2.5 shadow-lg"
      style={{
        bottom: 'max(5.25rem, calc(env(safe-area-inset-bottom) + 1.25rem))',
        ...(lang === 'en'
          ? { right: '1.25rem', left: 'auto' }
          : { left: '1.25rem', right: 'auto' }),
      }}
      aria-label={text.label}
    >
      <ShieldAlert className="h-5 w-5" aria-hidden="true" />
      <span className="hidden font-semibold sm:inline">{text.label}</span>
      {pendingCount > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
          {pendingCount}
        </span>
      )}
    </Button>,
    document.body,
  );
}
