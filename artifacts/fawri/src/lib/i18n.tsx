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

function getDocumentLanguageTag(lang: Lang): string {
  if (lang === 'ar') return 'ar-IQ';
  if (lang === 'ku') return 'ku-Arab-IQ';
  return 'en';
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  useEffect(() => {
    const direction = getDirection(lang);

    localStorage.setItem(LANG_STORAGE_KEY, lang);
    document.documentElement.setAttribute('lang', getDocumentLanguageTag(lang));
    document.documentElement.setAttribute('dir', direction);
    document.body.setAttribute('dir', direction);

    window.dispatchEvent(
      new CustomEvent('fawri-language-change', {
        detail: { lang, direction },
      })
    );
  }, [lang]);

  const setLang = useCallback((newLang: Lang) => {
    if (!isValidLang(newLang)) return;
    setLangState(newLang);
  }, []);

  const value = useMemo<I18nContextType>(() => {
    const dir = getDirection(lang);

    return {
      t: translations[lang] || ar,
      lang,
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
