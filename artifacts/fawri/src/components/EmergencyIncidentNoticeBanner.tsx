import { EMERGENCY_INCIDENT_NOTICE_BANNER_TEXT } from '@/lib/translations/features/components/EmergencyIncidentNoticeBanner';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';

import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

type EmergencyIncidentNotice = {
  id: string;
  request_id: string;
  incident_reference: string;
  accessed_by_admin_name: string;
  activation_mode:
    | 'owner_approval'
    | 'critical_self_activation'
    | 'owner_direct_activation';
  started_at: string;
  ended_at: string;
  created_at: string;
  read_at?: string;
};

const TEXT = EMERGENCY_INCIDENT_NOTICE_BANNER_TEXT;

export default function EmergencyIncidentNoticeBanner() {
  const { lang } = useI18n();
  const [location] = useLocation();
  const [notice, setNotice] = useState<EmergencyIncidentNotice | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const text = TEXT[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';

  const loadNotice = useCallback(async () => {
    if (!location.startsWith('/dashboard')) {
      setNotice(null);
      return;
    }

    try {
      const response = await fetch(
        '/api/auth/emergency-read-access/notices?unread=1&limit=1',
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        setNotice(null);
        return;
      }
      if (!response.ok || !data?.ok || !Array.isArray(data.notices)) {
        return;
      }
      setNotice((data.notices[0] as EmergencyIncidentNotice | undefined) || null);
    } catch {
      // A temporary connection interruption must not hide the rest of the dashboard.
    }
  }, [location]);

  useEffect(() => {
    void loadNotice();
    const intervalId = window.setInterval(() => void loadNotice(), 15_000);
    const handleFocus = () => void loadNotice();
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadNotice]);

  useEffect(() => {
    setDetailsOpen(false);
  }, [notice?.id]);

  const acknowledge = async () => {
    if (!notice || acknowledging) return;
    setAcknowledging(true);
    try {
      const response = await fetch(
        `/api/auth/emergency-read-access/notices/${encodeURIComponent(notice.id)}/read`,
        { method: 'PATCH' },
      );
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        setNotice(null);
        await loadNotice();
      }
    } finally {
      setAcknowledging(false);
    }
  };

  if (!notice || !location.startsWith('/dashboard')) return null;

  const detailsId = `emergency-incident-notice-details-${notice.id}`;

  return (
    <div
      className="fixed inset-x-3 top-3 z-[70] mx-auto max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 sm:top-4 sm:p-4"
      dir={lang === 'en' ? 'ltr' : 'rtl'}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-full bg-amber-200 p-1.5 dark:bg-amber-900">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-black sm:text-base">{text.title}</h2>
          </div>
          <p className="mt-1 text-xs font-medium leading-5 text-amber-900/90 dark:text-amber-100/90 sm:text-sm">
            {text.summary}
          </p>

          {detailsOpen && (
            <div
              id={detailsId}
              className="mt-3 rounded-lg border border-amber-300/80 bg-white/45 p-3 dark:border-amber-800 dark:bg-black/10"
            >
              <p className="text-xs leading-5">{text.body}</p>

              <div className="mt-2 grid gap-x-4 gap-y-1.5 text-[11px] leading-5 sm:grid-cols-2 sm:text-xs">
                <p><strong>{text.reference}:</strong> <span dir="ltr">{notice.incident_reference}</span></p>
                <p><strong>{text.admin}:</strong> {notice.accessed_by_admin_name}</p>
                <p><strong>{text.started}:</strong> {new Date(notice.started_at).toLocaleString(locale)}</p>
                <p><strong>{text.ended}:</strong> {new Date(notice.ended_at).toLocaleString(locale)}</p>
              </div>
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setDetailsOpen((current) => !current)}
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-amber-100 dark:hover:bg-amber-900"
            >
              {detailsOpen ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {detailsOpen ? text.hideDetails : text.showDetails}
            </button>

            <Button
              type="button"
              size="sm"
              onClick={() => void acknowledge()}
              disabled={acknowledging}
              className="h-8 gap-1.5 px-3 text-xs"
            >
              {acknowledging ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {acknowledging ? text.acknowledging : text.acknowledge}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
