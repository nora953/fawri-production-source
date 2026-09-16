import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

const LANGUAGE_OPTIONS: Array<{ id: Lang; label: string; title: string }> = [
  { id: 'ar', label: 'AR', title: 'العربية' },
  { id: 'ku', label: 'KU', title: 'کوردی' },
  { id: 'en', label: 'EN', title: 'English' },
];

const SWITCHER_LABEL: Record<Lang, string> = {
  ar: 'تغيير لغة الكاشير',
  ku: 'گۆڕینی زمانی کاشێر',
  en: 'Change cashier language',
};

function languageSlotSelector(): string | null {
  const view = document.documentElement.dataset.cashierView;
  if (view === 'pos') {
    return "html[data-cashier-view='pos'] #cashier-root main > div > header > div:last-child > div:first-child";
  }
  if (view === 'history') {
    return "html[data-cashier-view='history'] #cashier-root main > div > header > div:last-child";
  }
  if (view === 'reports') {
    return "html[data-cashier-view='reports'] #cashier-root main > div > header > div:last-child";
  }
  if (view === 'sync') {
    return "html[data-cashier-view='sync'] #cashier-root main > div > header";
  }
  return null;
}

export default function CashierLanguageSwitcher() {
  const { lang, dir, setLang } = useI18n();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.getElementById('cashier-root');
    if (!root) return;

    const resolveTarget = () => {
      const selector = languageSlotSelector();
      const next = selector ? document.querySelector<HTMLElement>(selector) : null;
      setTarget(current => current === next ? current : next);
    };

    resolveTarget();
    const observer = new MutationObserver(resolveTarget);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const control = (
    <div
      data-cashier-language-switcher="true"
      dir={dir}
      role="group"
      aria-label={SWITCHER_LABEL[lang]}
      className="flex shrink-0 items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-0.5 text-[11px] font-bold shadow-sm"
    >
      {LANGUAGE_OPTIONS.map(language => (
        <button
          key={language.id}
          type="button"
          onClick={() => setLang(language.id)}
          aria-pressed={lang === language.id}
          aria-label={language.title}
          title={language.title}
          className={`rounded-lg px-2 py-1.5 transition-colors ${
            lang === language.id
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {language.label}
        </button>
      ))}
    </div>
  );

  if (target) return createPortal(control, target);

  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[95] -translate-x-1/2">
      <div className="pointer-events-auto">{control}</div>
    </div>
  );
}
