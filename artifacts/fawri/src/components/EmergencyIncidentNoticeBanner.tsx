import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck } from 'lucide-react';
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

const TEXT = {
  ar: {
    title: 'إشعار أمني مهم',
    body: 'تم استخدام وصول طارئ للقراءة فقط إلى حساب متجرك لمعالجة حادثة تقنية. لم يكن الوصول قادرًا على التعديل أو الإرسال أو الحذف.',
    reference: 'مرجع الحادثة',
    admin: 'المسؤول',
    started: 'بداية الوصول',
    ended: 'نهاية الوصول',
    acknowledge: 'قرأت الإشعار',
    acknowledging: 'جارٍ التسجيل...',
  },
  ku: {
    title: 'ئاگادارییەکی گرنگی ئاسایش',
    body: 'بۆ چارەسەرکردنی ڕووداوێکی تەکنیکی، دەستگەیشتنی فریاکەوتنی تەنها خوێندنەوە بۆ هەژماری فرۆشگاکەت بەکارهێنرا. ئەم دەستگەیشتنە توانای دەستکاری، ناردن یان سڕینەوەی نەبوو.',
    reference: 'ژمارەی ڕووداو',
    admin: 'بەڕێوەبەر',
    started: 'دەستپێکی دەستگەیشتن',
    ended: 'کۆتایی دەستگەیشتن',
    acknowledge: 'ئاگادارییەکەم خوێندەوە',
    acknowledging: 'تۆمار دەکرێت...',
  },
  en: {
    title: 'Important security notice',
    body: 'Emergency read-only access was used on your store account to handle a technical incident. The access could not edit, send, or delete anything.',
    reference: 'Incident reference',
    admin: 'Administrator',
    started: 'Access started',
    ended: 'Access ended',
    acknowledge: 'I have read this notice',
    acknowledging: 'Recording...',
  },
} as const;

export default function EmergencyIncidentNoticeBanner() {
  const { lang } = useI18n();
  const [location] = useLocation();
  const [notice, setNotice] = useState<EmergencyIncidentNotice | null>(null);
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

  return (
    <div
      className="fixed inset-x-3 top-3 z-[70] mx-auto max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-2xl dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 sm:top-4 sm:p-5"
      dir={lang === 'en' ? 'ltr' : 'rtl'}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-200 p-2 dark:bg-amber-900">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <h2 className="font-bold">{text.title}</h2>
          </div>
          <p className="mt-2 text-sm leading-6">{text.body}</p>

          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <p><strong>{text.reference}:</strong> <span dir="ltr">{notice.incident_reference}</span></p>
            <p><strong>{text.admin}:</strong> {notice.accessed_by_admin_name}</p>
            <p><strong>{text.started}:</strong> {new Date(notice.started_at).toLocaleString(locale)}</p>
            <p><strong>{text.ended}:</strong> {new Date(notice.ended_at).toLocaleString(locale)}</p>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void acknowledge()}
              disabled={acknowledging}
              className="gap-2"
            >
              {acknowledging ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              {acknowledging ? text.acknowledging : text.acknowledge}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
