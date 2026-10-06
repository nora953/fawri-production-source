import React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { getAdminAuthHeaders } from '@/lib/store';
import { useI18n } from '@/lib/i18n';
import { ADMIN_CASHIER_SUBSCRIPTION_COPY } from '@/lib/translations/features/admin/AdminCashierSubscriptionControls';

type Entitlement = {
  state: 'inactive' | 'active' | 'grace' | 'restricted' | 'suspended';
  licensed_seats: number;
  billing_period_end?: string;
  grace_until?: string;
  version?: number;
};



function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function AdminCashierSubscriptionControls({
  merchantId,
}: {
  merchantId: string;
}) {
  const { lang } = useI18n();
  const text = ADMIN_CASHIER_SUBSCRIPTION_COPY[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const [entitlement, setEntitlement] = React.useState<Entitlement | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/merchants/${encodeURIComponent(merchantId)}/cashier/subscription`,
        {
          headers: getAdminAuthHeaders(),
          cache: 'no-store',
          credentials: 'same-origin',
        },
      );
      const payload = record(await response.json().catch(() => null));
      if (!response.ok || payload.ok !== true) throw new Error(String(payload.error || text.unavailable));
      const raw = record(payload.entitlement);
      setEntitlement(
        raw.state
          ? {
              state: String(raw.state) as Entitlement['state'],
              licensed_seats: Number(raw.licensed_seats || 0),
              ...(raw.billing_period_end ? { billing_period_end: String(raw.billing_period_end) } : {}),
              ...(raw.grace_until ? { grace_until: String(raw.grace_until) } : {}),
              ...(Number.isSafeInteger(Number(raw.version)) ? { version: Number(raw.version) } : {}),
            }
          : null,
      );
    } catch {
      setFailed(true);
      setEntitlement(null);
    } finally {
      setLoading(false);
    }
  }, [merchantId, text.unavailable]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: 'suspend' | 'resume' | 'cancel') => {
    if (!entitlement) return;
    if (action === 'cancel' && !window.confirm(text.confirmCancel)) return;
    if (action === 'suspend' && !window.confirm(text.confirmSuspend)) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/merchants/${encodeURIComponent(merchantId)}/cashier/subscription/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          credentials: 'same-origin',
          body: JSON.stringify({ expected_version: entitlement.version }),
        },
      );
      const payload = record(await response.json().catch(() => null));
      if (!response.ok || payload.ok !== true) throw new Error(String(payload.error || text.unavailable));
      toast.success(text.updated);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.unavailable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border/80 bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{text.title}</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
          {text.refresh}
        </Button>
      </div>
      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">…</p>
      ) : failed ? (
        <p className="mt-3 text-xs text-destructive">{text.unavailable}</p>
      ) : !entitlement ? (
        <p className="mt-3 text-xs text-muted-foreground">{text.state}: {text.inactive}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-background p-2">
              <p className="text-[11px] text-muted-foreground">{text.state}</p>
              <p className="mt-1 text-sm font-bold">{entitlement.state}</p>
            </div>
            <div className="rounded-lg bg-background p-2">
              <p className="text-[11px] text-muted-foreground">{text.seats}</p>
              <p className="mt-1 text-sm font-bold">{entitlement.licensed_seats}</p>
            </div>
            <div className="rounded-lg bg-background p-2">
              <p className="text-[11px] text-muted-foreground">{text.renewal}</p>
              <p className="mt-1 text-xs font-bold">
                {entitlement.billing_period_end
                  ? new Date(entitlement.billing_period_end).toLocaleString(locale)
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-background p-2">
              <p className="text-[11px] text-muted-foreground">{text.grace}</p>
              <p className="mt-1 text-xs font-bold">
                {entitlement.grace_until
                  ? new Date(entitlement.grace_until).toLocaleString(locale)
                  : '—'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {entitlement.state === 'suspended' ? (
              <Button type="button" size="sm" onClick={() => void act('resume')} disabled={busy}>
                {text.resume}
              </Button>
            ) : entitlement.state !== 'inactive' ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void act('suspend')} disabled={busy}>
                {text.suspend}
              </Button>
            ) : null}
            {entitlement.state !== 'inactive' ? (
              <Button type="button" size="sm" variant="destructive" onClick={() => void act('cancel')} disabled={busy}>
                {text.cancel}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
