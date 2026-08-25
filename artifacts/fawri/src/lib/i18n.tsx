import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Lang } from './types';
import { en } from './translations/en';
import { ar } from './translations/ar';
import { ku } from './translations/ku';

type Translations = typeof en;

interface I18nContextType {
  t: Translations;
  lang: Lang;
  /** Backward-compatible alias for older page helpers. */
  language: Lang;
  setLang: (lang: Lang) => void;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
}

const LANG_STORAGE_KEY = 'fawri_lang';

const translations: Record<Lang, Translations> = {
  en,
  ar,
  ku,
};

function isValidLang(value: string | null): value is Lang {
  return value === 'ar' || value === 'ku' || value === 'en';
}

function getInitialLang(): Lang {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  return isValidLang(saved) ? saved : 'ar';
}

function getDirection(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'en' ? 'ltr' : 'rtl';
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  useEffect(() => {
    const direction = getDirection(lang);

    localStorage.setItem(LANG_STORAGE_KEY, lang);
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', direction);
    document.body.setAttribute('dir', direction);

    window.dispatchEvent(
      new CustomEvent('fawri-language-change', {
        detail: { lang, direction },
      })
    );
  }, [lang]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LANG_STORAGE_KEY || !isValidLang(event.newValue)) return;
      setLangState(event.newValue);
    };

    const handleLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<{ lang?: string }>).detail?.lang || null;
      if (!isValidLang(next)) return;
      setLangState(next);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('fawri-language-change', handleLanguageChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('fawri-language-change', handleLanguageChange);
    };
  }, []);

  const setLang = useCallback((newLang: Lang) => {
    if (!isValidLang(newLang)) return;
    setLangState(newLang);
  }, []);

  const value = useMemo<I18nContextType>(() => {
    const dir = getDirection(lang);

    return {
      t: translations[lang] || ar,
      lang,
      language: lang,
      setLang,
      dir,
      isRTL: dir === 'rtl',
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }

  return context;
}
