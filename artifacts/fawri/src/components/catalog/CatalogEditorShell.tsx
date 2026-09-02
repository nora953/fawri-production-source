import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  clearCatalogCreateRecoveryDraft,
  saveCatalogCreateRecoveryDraft,
} from '@/lib/catalogEditorRecovery';
import { catalogEditorFormFingerprint, catalogEditorHasUnsavedChanges } from '@/lib/catalogEditorSession';
import { CATALOG_EDITOR_SHELL_COPY } from '@/lib/translations/features/catalog/catalogEditorCopy';
import type { CatalogProductFormState } from '@/lib/catalogProductEditor';
import type { Lang } from '@/lib/types';


export type CatalogEditorShellProps = {
  lang: Lang;
  form: CatalogProductFormState;
  title: string;
  subtitle: string;
  saveLabel: string;
  savingLabel: string;
  saving: boolean;
  onClose: () => void;
  onDiscard?: () => void;
  onSave: () => void;
  children: ReactNode;
};

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )).filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

function isCreateTitle(lang: Lang, title: string): boolean {
  if (lang === 'ar') return title.trim().startsWith('إضافة');
  if (lang === 'ku') return title.trim().startsWith('زیادکردنی');
  return title.trim().toLocaleLowerCase('en-US').startsWith('add ');
}

export function CatalogEditorShell({
  lang,
  form,
  title,
  subtitle,
  saveLabel,
  savingLabel,
  saving,
  onClose,
  onDiscard,
  onSave,
  children,
}: CatalogEditorShellProps) {
  const labels = CATALOG_EDITOR_SHELL_COPY[lang] || CATALOG_EDITOR_SHELL_COPY.en;
  const shellRef = useRef<HTMLDivElement | null>(null);
  const initialFingerprint = useRef(catalogEditorFormFingerprint(form)).current;
  const previousSaving = useRef(saving);
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = catalogEditorHasUnsavedChanges(initialFingerprint, form);
  const createMode = isCreateTitle(lang, title);

  const requestClose = () => {
    if (saving) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    if (createMode) clearCatalogCreateRecoveryDraft();
    onClose();
  };

  const confirmDiscard = () => {
    setDiscardOpen(false);
    if (createMode) clearCatalogCreateRecoveryDraft();
    (onDiscard || onClose)();
  };

  useEffect(() => {
    if (!createMode || !dirty || saving) return;
    saveCatalogCreateRecoveryDraft(form);
  }, [createMode, dirty, form, saving]);

  useEffect(() => {
    if (!createMode) {
      previousSaving.current = saving;
      return;
    }
    const wasSaving = previousSaving.current;
    previousSaving.current = saving;
    if (!wasSaving && saving) {
      // A real save attempt has passed client validation. Clear the recovery
      // copy so a successful save cannot reopen a stale draft later.
      clearCatalogCreateRecoveryDraft();
      return;
    }
    if (wasSaving && !saving && dirty) {
      // The editor stayed mounted, so the save failed. Restore the recovery copy.
      saveCatalogCreateRecoveryDraft(form);
    }
  }, [createMode, dirty, form, saving]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const primary = shellRef.current?.querySelector<HTMLElement>('[data-catalog-primary-input="true"]');
      (primary || focusableElements(shellRef.current)[0])?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = focusableElements(shellRef.current);
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !shellRef.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dirty, saving]);

  return (
    <>
      <div ref={shellRef} className="catalog-editor-shell fawri-ui-baseline fixed inset-0 z-[100] bg-background" dir={lang === 'en' ? 'ltr' : 'rtl'} role="dialog" aria-modal="true" aria-label={title}>
        <div className="catalog-editor-frame flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
          <header className="catalog-editor-header shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-10">
            <div className="mx-auto flex w-full max-w-[1500px] items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
                  {dirty && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">{labels.unsaved}</span>
                  )}
                </div>
                <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground sm:text-sm">{subtitle}</p>
              </div>
              <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" onClick={requestClose} disabled={saving} aria-label={labels.cancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <main className="catalog-editor-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:px-10">
            <div className="catalog-editor-body-grid mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-5">{children}</div>
          </main>

          <footer className="catalog-editor-footer shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-10">
            <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3">
              <Button type="button" onClick={onSave} disabled={saving} className="h-12 min-w-0 flex-1 rounded-xl bg-orange-500 px-8 text-base font-bold text-white hover:bg-orange-600 disabled:opacity-60 sm:max-w-[360px]">
                {saving ? savingLabel : saveLabel}
              </Button>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving} className="h-12 rounded-xl px-6 font-bold">{labels.cancel}</Button>
            </div>
          </footer>
        </div>
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="z-[120] rounded-2xl" dir={lang === 'en' ? 'ltr' : 'rtl'}>
          <AlertDialogHeader className={lang === 'en' ? 'text-left' : 'text-right'}>
            <AlertDialogTitle>{labels.discardTitle}</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">{labels.discard}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel className="mt-0 rounded-xl">{labels.keepEditing}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {labels.discardAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default CatalogEditorShell;
