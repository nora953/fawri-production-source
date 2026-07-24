import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Link } from 'wouter';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearSession } from '@/lib/store';

export default function PendingPage() {
  const { t, isRTL, lang } = useI18n();

  const brandName = lang === 'ar' ? 'فوري' : lang === 'ku' ? 'فورى' : 'Fawri';

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-muted/30 p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="flex w-full max-w-md flex-col items-center rounded-3xl border bg-card p-8 text-center shadow-xl">
        <Link
          href="/"
          className="mb-8 inline-block text-3xl font-extrabold leading-none tracking-tight text-primary fowri-header-brand-font"
        >
          {brandName}
        </Link>

        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <h1 className="mb-4 text-2xl font-bold">{t.pending_title}</h1>

        <p className="mb-8 leading-relaxed text-muted-foreground">
          {t.pending_msg}
        </p>

        <Button
          variant="ghost"
          onClick={() => {
            clearSession();
            window.location.href = '/login';
          }}
          className="h-11 w-full rounded-xl text-sm text-muted-foreground"
        >
          {t.logout}
        </Button>
      </div>
    </div>
  );
}
