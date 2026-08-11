import React from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import type { Subscription } from '@/lib/types';

type Plan = 'silver' | 'gold' | 'diamond';
type BillingPlan = {
  plan: Plan;
  monthly_price_iqd: number;
  base_reply_limit: number;
  emergency_credit_amount: number;
  billing_period_months: 1;
};
type ProviderState = {
  provider: 'disabled' | 'test_fake' | 'superqi_sandbox' | 'unsupported';
  checkout_available: boolean;
  production_ready: boolean;
};
type BillingOrder = {
  id: string;
  operation: 'activate' | 'renew' | 'change';
  requested_plan: Plan;
  amount_iqd: number;
  status:
    | 'pending'
    | 'paid'
    | 'paid_reconciliation_required'
    | 'failed'
    | 'cancelled'
    | 'expired'
    | 'refunded';
  created_at: string;
};

type CatalogResponse = {
  ok: boolean;
  catalog_version: string;
  currency: 'IQD';
  plans: BillingPlan[];
  provider: ProviderState;
};

const copy = {
  ar: {
    title: 'خطط اشتراك فوري',
    providerDisabled: 'الدفع الذاتي لاشتراك فوري غير مفعّل بعد. لن يتم اعتبار أي اشتراك مدفوعًا بدون تأكيد من مزود الدفع المعتمد.',
    cycleActive: 'دورتك الحالية ما زالت فعّالة. التجديد أو تغيير الخطة يصبح متاحًا عند انتهاء الدورة أو نفاد رصيد الخطة الأساسي.',
    choose: 'اختيار',
    current: 'الخطة الحالية',
    perMonth: 'د.ع / شهر',
    replies: 'رد أساسي',
    recent: 'آخر عمليات الاشتراك',
    reconciliation: 'دفعة تحتاج مراجعة',
    checkoutUnavailable: 'الدفع غير متاح حاليًا',
    checkoutCreated: 'تم إنشاء طلب الدفع',
    sandboxNotice: 'أنت تستخدم بيئة اختبار SuperQi. لا يتم استخدام أموال حقيقية في هذا الوضع.',
  },
  en: {
    title: 'Fawri subscription plans',
    providerDisabled: 'Self-service Fawri subscription payment is not enabled yet. No subscription is treated as paid without confirmation from the configured payment provider.',
    cycleActive: 'Your current cycle is still active. Renewal or plan change becomes available when the cycle expires or the base plan balance is exhausted.',
    choose: 'Choose',
    current: 'Current plan',
    perMonth: 'IQD / month',
    replies: 'base replies',
    recent: 'Recent subscription billing',
    reconciliation: 'Payment needs review',
    checkoutUnavailable: 'Checkout is not available yet',
    checkoutCreated: 'Billing order created',
    sandboxNotice: 'SuperQi sandbox is active. No real money is used in this mode.',
  },
  ku: {
    title: 'پلانی بەشداری فەوری',
    providerDisabled: 'پارەدانی خۆخزمەتگوزاری بۆ بەشداری فەوری هێشتا چالاک نەکراوە. هیچ بەشدارییەک بە پارەدراو هەژمار ناکرێت تا دابینکەری پارەدان پشتڕاستی نەکاتەوە.',
    cycleActive: 'خولی ئێستات هێشتا چالاکە. نوێکردنەوە یان گۆڕینی پلان دوای کۆتایی خول یان تەواوبوونی وەڵامی بنەڕەتی بەردەست دەبێت.',
    choose: 'هەڵبژاردن',
    current: 'پلانی ئێستا',
    perMonth: 'IQD / مانگ',
    replies: 'وەڵامی بنەڕەتی',
    recent: 'دوایین مامەڵەکانی بەشداری',
    reconciliation: 'پارەدان پێویستی بە پشکنین هەیە',
    checkoutUnavailable: 'پارەدان هێشتا بەردەست نییە',
    checkoutCreated: 'داواکاری پارەدان دروست کرا',
    sandboxNotice: 'ژینگەی تاقیکردنەوەی SuperQi چالاکە. لەم دۆخەدا پارەی ڕاستەقینە بەکارناهێنرێت.',
  },
};

function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `billing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function SaasBillingPanel({ subscription }: { subscription: Subscription | null }) {
  const { lang, t } = useI18n();
  const text = copy[lang];
  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const [catalog, setCatalog] = React.useState<CatalogResponse | null>(null);
  const [orders, setOrders] = React.useState<BillingOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState<Plan | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [catalogResponse, ordersResponse] = await Promise.all([
        fetch('/api/auth/billing/catalog', { cache: 'no-store' }),
        fetch('/api/auth/billing/orders', { cache: 'no-store' }),
      ]);
      const catalogData = await catalogResponse.json().catch(() => null);
      const ordersData = await ordersResponse.json().catch(() => null);
      if (catalogResponse.ok && catalogData?.ok) setCatalog(catalogData as CatalogResponse);
      if (ordersResponse.ok && ordersData?.ok && Array.isArray(ordersData.orders)) {
        setOrders(ordersData.orders as BillingOrder[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading || !catalog) return null;

  const baseRemaining = subscription?.base_replies_remaining ?? subscription?.replies_remaining ?? 0;
  const expired = subscription
    ? new Date(subscription.expires_at).getTime() <= Date.now()
    : true;
  const canStartCycle = !subscription || expired || baseRemaining <= 0;

  const beginCheckout = async (plan: Plan) => {
    if (!catalog.provider.checkout_available || !canStartCycle) return;
    const operation: 'activate' | 'renew' | 'change' = !subscription
      ? 'activate'
      : subscription.plan_name === plan
        ? 'renew'
        : 'change';
    setSubmitting(plan);
    try {
      const response = await fetch('/api/auth/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          plan,
          idempotency_key: makeIdempotencyKey(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || text.checkoutUnavailable);
      }
      const redirectUrl =
        typeof data?.checkout?.redirect_url === 'string'
          ? data.checkout.redirect_url.trim()
          : '';
      if (catalog.provider.provider === 'superqi_sandbox') {
        if (!redirectUrl) throw new Error(text.checkoutUnavailable);
        window.location.assign(redirectUrl);
        return;
      }
      toast.success(text.checkoutCreated);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : text.checkoutUnavailable);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!catalog.provider.checkout_available && (
          <Alert>
            <AlertTitle>{text.checkoutUnavailable}</AlertTitle>
            <AlertDescription>{text.providerDisabled}</AlertDescription>
          </Alert>
        )}
        {catalog.provider.provider === 'superqi_sandbox' &&
          catalog.provider.checkout_available && (
            <Alert>
              <AlertDescription>{text.sandboxNotice}</AlertDescription>
            </Alert>
          )}
        {catalog.provider.checkout_available && subscription && !canStartCycle && (
          <Alert>
            <AlertDescription>{text.cycleActive}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {catalog.plans.map((plan) => {
            const isCurrent = subscription?.plan_name === plan.plan;
            return (
              <div key={plan.plan} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold">
                    {{ silver: t.plan_silver, gold: t.plan_gold, diamond: t.plan_diamond }[plan.plan]}
                  </h3>
                  {isCurrent && <Badge variant="secondary">{text.current}</Badge>}
                </div>
                <p className="mt-3 text-xl font-extrabold" dir="ltr">
                  {plan.monthly_price_iqd.toLocaleString(locale)} {text.perMonth}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.base_reply_limit.toLocaleString(locale)} {text.replies}
                </p>
                <Button
                  className="mt-4 w-full"
                  disabled={!catalog.provider.checkout_available || !canStartCycle || submitting !== null}
                  onClick={() => void beginCheckout(plan.plan)}
                >
                  {submitting === plan.plan ? t.overview_loading : text.choose}
                </Button>
              </div>
            );
          })}
        </div>

        {orders.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold">{text.recent}</h3>
            {orders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span>
                  {order.requested_plan.toUpperCase()} · {order.amount_iqd.toLocaleString(locale)} IQD
                </span>
                <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                  {order.status === 'paid_reconciliation_required' ? text.reconciliation : order.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
