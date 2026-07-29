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
  const emergencyDebt =
    subscription.emergency_debt ??
    subscription.pending_next_cycle_deduction ??
    0;
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
    <div className="mt-6 w-full rounded-xl border border-orange-200 bg-orange-50/50 p-5 text-start dark:border-orange-900/50 dark:bg-orange-950/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 text-start">
          <div className="mb-1 flex items-center gap-2 font-bold text-orange-600 dark:text-orange-500">
            <ShieldAlert className="h-4 w-4" />
            {t.emergency_credit}
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            {t.emergency_subtitle}
          </p>

          <div className="mt-3 rounded-lg border border-orange-200/70 bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">
              {t.subscription_emergency_balance}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">
              {subscription.emergency_credit_remaining.toLocaleString(locale)}
            </p>
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

      {emergencyDebt > 0 && (
        <div className="mt-4 rounded-lg border border-orange-200/70 bg-background/70 p-3 text-start">
          <p className="text-xs text-muted-foreground">
            {t.subscription_emergency_debt}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-orange-700 dark:text-orange-400" dir="ltr">
            {emergencyDebt.toLocaleString(locale)}
          </p>
          <p className="mt-2 border-t border-orange-200/50 pt-2 text-xs leading-5 text-orange-700/90 dark:border-orange-900/30 dark:text-orange-400/90">
            {t.subscription_pending_deduction}
          </p>
        </div>
      )}
    </div>
  );
}
