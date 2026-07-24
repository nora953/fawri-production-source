import React from 'react';
import { PolicyContent } from '@/components/PolicyContent';
import { useI18n } from '@/lib/i18n';
import { en } from '@/lib/translations/en';
import { ar } from '@/lib/translations/ar';
import { ku } from '@/lib/translations/ku';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type PolicyTab = 'privacy' | 'terms';

export function getPolicyReadLabel(lang: string) {
  if (lang === 'ar') {
    return ar.policy_read_label;
  }

  if (lang === 'ku') {
    return ku.policy_read_label;
  }

  return en.policy_read_label;
}

type PolicyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyTab: PolicyTab;
  setPolicyTab: (tab: PolicyTab) => void;
};

export function PolicyModal({
  open,
  onOpenChange,
  policyTab,
  setPolicyTab,
}: PolicyModalProps) {
  const { t, isRTL, lang } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fowri-policy-dialog flex max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border bg-background p-0 shadow-2xl sm:w-full"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <DialogHeader className="fowri-policy-modal-header shrink-0 border-b bg-muted/25 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-extrabold leading-tight text-foreground">
                {policyTab === 'privacy'
                  ? t.privacy_title
                  : t.terms_title}
              </DialogTitle>

              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                {t.policy_modal_description}
              </p>
            </div>

            <div className="inline-flex shrink-0 rounded-full border bg-background p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setPolicyTab('privacy')}
                className={`rounded-full px-4 py-2 text-sm font-extrabold transition-colors ${
                  policyTab === 'privacy'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.privacy_title}
              </button>

              <button
                type="button"
                onClick={() => setPolicyTab('terms')}
                className={`rounded-full px-4 py-2 text-sm font-extrabold transition-colors ${
                  policyTab === 'terms'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.terms_title}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="rounded-2xl border bg-card/60 p-4 sm:p-5">
            <PolicyContent
              lang={lang}
              type={policyTab}
              variant="modal"
            />
          </div>
        </div>

        <div className="shrink-0 border-t bg-background px-5 py-4 sm:px-6">
          <Button
            onClick={() => onOpenChange(false)}
            className="h-12 w-full rounded-2xl text-base font-extrabold shadow-sm"
          >
            {t.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
