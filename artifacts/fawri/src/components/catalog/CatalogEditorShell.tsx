import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { CatalogProductFormState } from '@/lib/catalogProductEditor';
import type { Lang } from '@/lib/types';

const copy = {
  ar: {
    cancel: 'إلغاء',
    unsaved: 'تغييرات غير محفوظة',
    discard: 'لديك تغييرات غير محفوظة. هل تريد إغلاق الصفحة وتجاهلها؟',
  },
  ku: {
    cancel: 'هەڵوەشاندنەوە',
    unsaved: 'گۆڕانکاری پاشەکەوت نەکراوە',
    discard: 'گۆڕانکاری پاشەکەوت نەکراوت هەیە. دەتەوێت پەڕەکە دابخەیت و فەرامۆشیان بکەیت؟',
  },
  en: {
    cancel: 'Cancel',
    unsaved: 'Unsaved changes',
    discard: 'You have unsaved changes. Close the editor and discard them?',
  },
} as const;

function formFingerprint(form: CatalogProductFormState): string {
  return JSON.stringify(form);
}

export type CatalogEditorShellProps = {
  lang: Lang;
  form: CatalogProductFormState;
  title: string;
  subtitle: string;
  saveLabel: string;
  savingLabel: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
};

export function CatalogEditorShell({
  lang,
  form,
  title,
  subtitle,
  saveLabel,
  savingLabel,
  saving,
  onClose,
  onSave,
  children,
}: CatalogEditorShellProps) {
  const labels = copy[lang] || copy.en;
  const initialFingerprint = useMemo(() => formFingerprint(form), []);
  const dirty = formFingerprint(form) !== initialFingerprint;

  const requestClose = () => {
    if (saving) return;
    if (dirty && typeof window !== 'undefined' && !window.confirm(labels.discard)) return;
    onClose();
  };

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const primary = document.querySelector<HTMLElement>('[data-catalog-primary-input="true"]');
      primary?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestClose();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [dirty, labels.discard, saving]);

  return (
    <div className="catalog-editor-shell fixed inset-0 z-[100] bg-background" role="dialog" aria-modal="true" aria-label={title}>
      <div className="catalog-editor-frame flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
        <header className="catalog-editor-header shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-[1500px] items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
                {dirty && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                    {labels.unsaved}
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground sm:text-sm">{subtitle}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-2xl"
              onClick={requestClose}
              disabled={saving}
              aria-label={labels.cancel}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="catalog-editor-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-10">
          <div className="catalog-editor-body-grid mx-auto grid w-full max-w-[1500px] grid-cols-12 gap-5">
            {children}
          </div>
        </main>

        <footer className="catalog-editor-footer shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3">
            <Button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="h-12 min-w-0 flex-1 rounded-2xl bg-orange-500 px-8 text-base font-bold text-white hover:bg-orange-600 disabled:opacity-60 sm:max-w-[360px]"
            >
              {saving ? savingLabel : saveLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={saving}
              className="h-12 rounded-2xl px-6 font-bold"
            >
              {labels.cancel}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default CatalogEditorShell;
