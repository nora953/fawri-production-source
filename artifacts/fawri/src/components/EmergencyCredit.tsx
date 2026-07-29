import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { Subscription } from '@/lib/types';

interface EmergencyCreditProps {
  subscription: Subscription;
  onActivate: () => void;
}

export function EmergencyCredit({
  subscription,
  onActivate,
}: EmergencyCreditProps) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  const locale =
    lang === 'en'
      ? 'en-US'
      : lang === 'ku'
        ? 'ckb-IQ'
        : 'ar-IQ';

  const baseRepliesRemaining =
    subscription.base_replies_remaining ?? subscription.replies_remaining;
  const canRequestEmergency =
    subscription.status === 'active' ||
    subscription.status === 'replies_exhausted';
  const isEligible =
    canRequestEmergency &&
    !subscription.emergency_credit_activated &&
    subscription.emergency_credit_amount > 0 &&
    baseRepliesRemaining <= 500;

  const handleActivate = () => {
    if (!isEligible) return;

    onActivate();
    setOpen(false);
  };

  return (
    <div className="mt-6 w-full rounded-xl border border-orange-200 bg-orange-50/50 p-4 text-center dark:border-orange-900/50 dark:bg-orange-950/20 sm:w-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 font-bold text-orange-600 dark:text-orange-500">
            <ShieldAlert className="h-4 w-4" />
            {t.emergency_credit}
          </div>

          <p className="text-sm text-muted-foreground">
            {t.emergency_subtitle}
          </p>

          <div className="mt-3">
            <span className="text-2xl font-bold">
              {subscription.emergency_credit_remaining.toLocaleString(locale)}
            </span>

            <span className="ms-1 text-sm text-muted-foreground">
              {t.subscription_replies_available}
            </span>
          </div>
        </div>

        {subscription.emergency_credit_activated ? (
          <Badge
            variant="outline"
            className="w-full shrink-0 justify-center whitespace-normal border-orange-200 bg-orange-100 text-center text-orange-700 sm:w-auto"
          >
            {t.subscription_emergency_activated}
          </Badge>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full shrink-0 justify-center whitespace-normal border-orange-500 text-center text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 sm:w-auto"
                disabled={!isEligible}
              >
                {t.activate_emergency}
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.activate_emergency}</DialogTitle>

                <DialogDescription className="pt-4">
                  {t.emergency_confirm}
                </DialogDescription>
              </DialogHeader>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  {t.cancel}
                </Button>

                <Button
                  onClick={handleActivate}
                  disabled={!isEligible}
                >
                  {t.confirm}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {subscription.pending_next_cycle_deduction > 0 && (
        <div className="mt-4 w-full border-t border-orange-200/50 pt-4 text-center text-xs text-orange-700/80 dark:border-orange-900/30 dark:text-orange-400/80 sm:w-auto">
          {t.subscription_pending_deduction}:{' '}
          {subscription.pending_next_cycle_deduction.toLocaleString(locale)}{' '}
          {t.subscription_reply_unit}
        </div>
      )}
    </div>
  );
}
