import React from 'react';
import { Header } from '@/components/layout/Header';
import { PolicyContent } from '@/components/PolicyContent';
import { useI18n } from '@/lib/i18n';
import { Link } from 'wouter';
import { ArrowRight, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  const { t, lang, isRTL } = useI18n();
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div
      className="min-h-[100dvh] flex flex-col bg-background"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <Header />

      <main className="flex-1">
        <section className="border-b bg-muted/20">
          <div className="container mx-auto max-w-4xl px-4 py-8 sm:py-10">
            <Link
              href="/"
              className="mb-6 inline-flex h-10 items-center gap-2 rounded-full border bg-background px-4 text-sm font-extrabold text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
            >
              <BackArrow className="h-4 w-4" />
              {t.back}
            </Link>

            <div className="rounded-[1.75rem] border bg-background p-6 shadow-sm sm:p-8">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl">
                {t.privacy_title}
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                {t.privacy_description}
              </p>
            </div>
          </div>
        </section>

        <section className="container mx-auto max-w-4xl px-4 py-8 sm:py-10">
          <div className="rounded-[1.75rem] border bg-card/60 p-4 shadow-sm sm:p-6">
            <PolicyContent
              lang={lang}
              type="privacy"
              variant="page"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
