import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Link } from 'wouter';
import { Globe } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Lang } from '@/lib/types';
import { getCurrentMerchant, getMerchants, saveMerchants } from '@/lib/store';

export function Header() {
  const { t, lang, setLang } = useI18n();

  const languageLabels: Record<Lang, string> = {
    ar: t.header_language_arabic,
    ku: t.header_language_kurdish,
    en: t.header_language_english,
  };
  const [open, setOpen] = useState(false);

  const syncMerchantLanguage = (nextLang: Lang) => {
    const merchant = getCurrentMerchant();
    if (!merchant) return;

    const merchants = getMerchants();
    const updated = merchants.map(item =>
      item.id === merchant.id
        ? {
            ...item,
            language: nextLang,
            reply_language: item.reply_language || nextLang,
          }
        : item
    );

    saveMerchants(updated);
  };

  const handleLangChange = (nextLang: Lang) => {
    setLang(nextLang);
    syncMerchantLanguage(nextLang);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 h-16 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-full items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 [-webkit-tap-highlight-color:transparent]"
            aria-label={t.header_home_aria}
          >
            <img
              src="/fawri-logo.svg"
              alt={t.header_brand}
              className="h-10 w-auto object-contain"
              loading="eager"
              draggable={false}
            />

            <span className="text-xl font-bold tracking-tight text-primary md:text-2xl fowri-header-brand-font">
              {t.header_brand}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/login"
            className="inline-flex h-10 min-w-[130px] items-center justify-center whitespace-nowrap rounded-2xl border border-primary bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/90 hover:bg-primary/90 hover:text-primary-foreground hover:shadow-md"
          >
            {t.login}
          </Link>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 gap-2 rounded-full px-3"
              >
                <Globe className="h-5 w-5 text-foreground" />
                <span className="hidden text-sm font-medium sm:inline">
                  {languageLabels[lang]}
                </span>
              </Button>
            </PopoverTrigger>

            <PopoverContent className="w-36 rounded-2xl p-1" align="end">
              <div className="flex flex-col gap-1">
                {(['ar', 'ku', 'en'] as Lang[]).map(item => (
                  <Button
                    key={item}
                    type="button"
                    variant={lang === item ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => handleLangChange(item)}
                    className="justify-start rounded-xl"
                  >
                    {languageLabels[item]}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}