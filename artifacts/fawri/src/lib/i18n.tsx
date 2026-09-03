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
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

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

function localizeDigitString(value: string, lang: Lang): string {
  if (lang === 'en') {
    return value
      .replace(/[٠-٩]/g, digit => String(ARABIC_DIGITS.indexOf(digit)))
      .replace(/[۰-۹]/g, digit => String(PERSIAN_DIGITS.indexOf(digit)));
  }

  return value
    .replace(/[0-9]/g, digit => ARABIC_DIGITS[Number(digit)])
    .replace(/[۰-۹]/g, digit => ARABIC_DIGITS[PERSIAN_DIGITS.indexOf(digit)]);
}

function localizeTextNode(node: Text, lang: Lang) {
  const parent = node.parentElement;
  if (!parent || parent.closest('script, style, noscript')) return;
  if (parent.closest('[data-fawri-preserve-digits="true"]')) return;

  const current = node.nodeValue || '';
  const next = localizeDigitString(current, lang);
  if (next !== current) node.nodeValue = next;
}

function localizeNodeTree(root: Node, lang: Lang) {
  if (root.nodeType === Node.TEXT_NODE) {
    localizeTextNode(root as Text, lang);
    return;
  }

  if (!(root instanceof Element) && root !== document.body) return;
  if (root instanceof Element && root.matches('script, style, noscript')) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    localizeTextNode(current as Text, lang);
    current = walker.nextNode();
  }
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
    const body = document.body;
    if (!body) return;

    localizeNodeTree(body, lang);

    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') {
          localizeTextNode(record.target as Text, lang);
          continue;
        }

        for (const addedNode of record.addedNodes) {
          localizeNodeTree(addedNode, lang);
        }
      }
    });

    observer.observe(body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    return () => observer.disconnect();
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
