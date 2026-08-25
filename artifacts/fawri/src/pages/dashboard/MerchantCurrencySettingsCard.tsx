import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import {
  getMerchantRegionalContext,
  MerchantRegionalApiError,
  updateMerchantCurrency,
  type MerchantRegionalContext,
} from '@/lib/merchantRegionalUiApi';
import type { Lang } from '@/lib/types';

const CURRENCIES = [
  'IQD',
  'USD',
  'AED',
  'SAR',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
  'JOD',
  'TRY',
  'EUR',
  'GBP',
] as const;

const COPY: Record<Lang, {
  title: string;
  description: string;
  currency: string;
  country: string;
  timezone: string;
  save: string;
  saving: string;
  loading: string;
  retry: string;
  loadFailed: string;
  saved: string;
  blocked: string;
  failed: string;
  noFx: string;
}> = {
  ar: {
    title: 'عملة المتجر',
    description: 'العملة المركزية التي يعتمدها فوري لعرض أسعار المتجر والكاشير والتقارير.',
    currency: 'العملة',
    country: 'البلد',
    timezone: 'المنطقة الزمنية',
    save: 'حفظ العملة',
    saving: 'جارٍ الحفظ...',
    loading: 'جارٍ تحميل إعداد العملة...',
    retry: 'إعادة المحاولة',
    loadFailed: 'تعذر تحميل عملة المتجر من الخادم.',
    saved: 'تم تحديث عملة المتجر.',
    blocked: 'لا يمكن تغيير العملة بعد وجود بيانات مالية تشغيلية. لا يجري فوري أي تحويل تلقائي للعملات.',
    failed: 'تعذر تحديث عملة المتجر.',
    noFx: 'تغيير العملة لا يحوّل أسعار المنتجات أو الطلبات القديمة بسعر صرف. لذلك يُمنع التغيير عندما توجد بيانات مالية تحتاج إلى ترحيل.',
  },
  ku: {
    title: 'دراوی فرۆشگا',
    description: 'دراوی سەرەکیی فرۆشگا کە فەوری بۆ پیشاندانی نرخ، کاشێر و ڕاپۆرتەکان بەکاری دەهێنێت.',
    currency: 'دراو',
    country: 'وڵات',
    timezone: 'ناوچەی کات',
    save: 'پاشەکەوتکردنی دراو',
    saving: 'پاشەکەوت دەکرێت...',
    loading: 'ڕێکخستنی دراو بار دەکرێت...',
    retry: 'دووبارە هەوڵدانەوە',
    loadFailed: 'بارکردنی دراوی فرۆشگا لە سێرڤەر سەرکەوتوو نەبوو.',
    saved: 'دراوی فرۆشگا نوێکرایەوە.',
    blocked: 'دوای هەبوونی داتای داراییی کارپێکراو ناتوانرێت دراو بگۆڕدرێت. فەوری خۆکارانە نرخەکان ناگۆڕێت.',
    failed: 'نوێکردنەوەی دراوی فرۆشگا سەرکەوتوو نەبوو.',
    noFx: 'گۆڕینی دراو نرخە کۆنەکان بە نرخی ئاڵوگۆڕ ناگۆڕێت؛ بۆیە کاتێک داتای دارایی هەبێت گۆڕین دادەخرێت تا ترحیلێکی پارێزراو هەبێت.',
  },
  en: {
    title: 'Store currency',
    description: 'The merchant-level currency Fawri uses for store prices, cashier displays, and reports.',
    currency: 'Currency',
    country: 'Country',
    timezone: 'Timezone',
    save: 'Save currency',
    saving: 'Saving...',
    loading: 'Loading store currency...',
    retry: 'Retry',
    loadFailed: 'Could not load the store currency from the server.',
    saved: 'Store currency updated.',
    blocked: 'Currency cannot be changed after monetary operational data exists. Fawri never performs automatic FX conversion.',
    failed: 'Could not update the store currency.',
    noFx: 'Changing currency does not convert existing product prices or historical orders using an exchange rate, so changes are blocked when monetary data requires a safe migration.',
  },
};

export default function MerchantCurrencySettingsCard() {
  const { lang } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const [context, setContext] = useState<MerchantRegionalContext | null>(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    void getMerchantRegionalContext()
      .then(next => {
        if (!active) return;
        setContext(next);
        setSelected(next.currency_code);
      })
      .catch(error => {
        console.error('Merchant regional context load failed:', error);
        if (!active) return;
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const options = useMemo(() => {
    const values = new Set<string>(CURRENCIES);
    if (context?.currency_code) values.add(context.currency_code);
    return [...values];
  }, [context?.currency_code]);

  const save = async () => {
    if (!context || !selected || saving || selected === context.currency_code) return;
    setSaving(true);
    try {
      const result = await updateMerchantCurrency(selected);
      setContext(result.context);
      setSelected(result.context.currency_code);
      toast.success(copy.saved);
    } catch (error) {
      console.error('Merchant currency update failed:', error);
      if (
        error instanceof MerchantRegionalApiError &&
        error.code === 'MERCHANT_CURRENCY_CHANGE_BLOCKED'
      ) {
        toast.error(copy.blocked);
      } else {
        toast.error(copy.failed);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{copy.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">{copy.loading}</p>
        ) : failed || !context ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">{copy.loadFailed}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>
              <RefreshCw className="me-2 h-4 w-4" />
              {copy.retry}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm font-medium">
                <span>{copy.currency}</span>
                <select
                  value={selected}
                  onChange={event => setSelected(event.target.value)}
                  className="h-11 w-full rounded-md border bg-background px-3"
                >
                  {options.map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <div className="space-y-2 text-sm font-medium">
                <span>{copy.country}</span>
                <div className="flex h-11 items-center rounded-md border bg-muted/20 px-3" dir="ltr">
                  {context.country_code}
                </div>
              </div>
              <div className="space-y-2 text-sm font-medium">
                <span>{copy.timezone}</span>
                <div className="flex h-11 items-center rounded-md border bg-muted/20 px-3" dir="ltr">
                  {context.timezone}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-3xl text-xs leading-5 text-muted-foreground">{copy.noFx}</p>
              <Button
                type="button"
                onClick={() => void save()}
                disabled={saving || selected === context.currency_code}
                className="shrink-0"
              >
                {saving ? copy.saving : copy.save}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
