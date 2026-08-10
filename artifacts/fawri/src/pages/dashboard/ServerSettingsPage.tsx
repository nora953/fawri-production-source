import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';

type ReplyLanguage = 'auto' | 'ar' | 'ku' | 'en';
type DeliveryPricingMode = 'flat' | 'per_area';
type DeliveryAreaRate = {
  id: string;
  area_name: string;
  normalized_area_name: string;
  fee_iqd: number;
  enabled: boolean;
};
type PaymentMethod =
  | 'cash_on_delivery'
  | 'superqi'
  | 'fastpay'
  | 'zaincash'
  | 'other';

type MerchantSettings = {
  merchant_id: string;
  version: number;
  auto_reply_enabled: boolean;
  reply_language: ReplyLanguage;
  delivery: {
    enabled: boolean;
    pricing_mode: DeliveryPricingMode;
    fee_iqd: number;
    free_delivery_threshold_iqd: number | null;
    estimated_days_min: number;
    estimated_days_max: number;
    areas: string[];
    area_rates: DeliveryAreaRate[];
    notes: string;
  };
  payment: {
    cash_on_delivery_enabled: boolean;
    electronic_payment_enabled: boolean;
    methods: PaymentMethod[];
    instructions: string;
  };
  created_at: string;
  updated_at: string;
};

type LanguageCode = 'ar' | 'ku' | 'en';

type Copy = {
  title: string;
  subtitle: string;
  refresh: string;
  persist: string;
  persisted: string;
  loading: string;
  loadFailed: string;
  persistFailed: string;
  conflict: string;
  version: string;
  autoReply: string;
  replyLanguage: string;
  delivery: string;
  deliveryEnabled: string;
  pricingMode: string;
  flatPricing: string;
  perAreaPricing: string;
  deliveryFee: string;
  areaName: string;
  areaFee: string;
  addArea: string;
  removeArea: string;
  areaRateRequired: string;
  freeThreshold: string;
  minDays: string;
  maxDays: string;
  areas: string;
  notes: string;
  payment: string;
  cash: string;
  electronic: string;
  instructions: string;
  invalidDelivery: string;
  paymentRequired: string;
  electronicRequired: string;
};

const COPY: Record<LanguageCode, Copy> = {
  ar: {
    title: 'الإعدادات',
    subtitle: 'إعدادات الرد والتوصيل والدفع محفوظة على السيرفر',
    refresh: 'تحديث',
    persist: 'حفظ الإعدادات',
    persisted: 'تم حفظ الإعدادات',
    loading: 'جاري تحميل الإعدادات…',
    loadFailed: 'تعذر تحميل الإعدادات من السيرفر',
    persistFailed: 'تعذر حفظ الإعدادات',
    conflict: 'تم تعديل الإعدادات من جهاز آخر. تم تحميل النسخة الأحدث.',
    version: 'نسخة',
    autoReply: 'الرد التلقائي',
    replyLanguage: 'لغة الرد',
    delivery: 'التوصيل',
    deliveryEnabled: 'التوصيل متاح',
    pricingMode: 'طريقة تسعير التوصيل',
    flatPricing: 'أجرة موحدة',
    perAreaPricing: 'أجرة حسب المنطقة',
    deliveryFee: 'أجرة التوصيل (دينار)',
    areaName: 'المنطقة',
    areaFee: 'أجرة التوصيل',
    addArea: 'إضافة منطقة',
    removeArea: 'حذف',
    areaRateRequired: 'أضف منطقة واحدة على الأقل مع أجرة صحيحة.',
    freeThreshold: 'التوصيل المجاني فوق مبلغ',
    minDays: 'أقل مدة بالأيام',
    maxDays: 'أقصى مدة بالأيام',
    areas: 'مناطق التوصيل',
    notes: 'ملاحظات التوصيل',
    payment: 'الدفع',
    cash: 'الدفع عند الاستلام',
    electronic: 'الدفع الإلكتروني',
    instructions: 'تعليمات الدفع',
    invalidDelivery: 'أقصى مدة للتوصيل يجب ألا تقل عن أقل مدة.',
    paymentRequired: 'يجب إبقاء طريقة دفع واحدة على الأقل.',
    electronicRequired: 'اختر طريقة إلكترونية عند تشغيل الدفع الإلكتروني.',
  },
  ku: {
    title: 'ڕێکخستنەکان',
    subtitle: 'ڕێکخستنەکانی وەڵام و گەیاندن و پارەدان لە ڕاژەکار هەڵدەگیرێن',
    refresh: 'نوێکردنەوە',
    persist: 'پاشەکەوتکردن',
    persisted: 'ڕێکخستنەکان پاشەکەوت کران',
    loading: 'ڕێکخستنەکان بار دەکرێن…',
    loadFailed: 'نەتوانرا ڕێکخستنەکان بار بکرێن',
    persistFailed: 'نەتوانرا ڕێکخستنەکان پاشەکەوت بکرێن',
    conflict: 'ڕێکخستنەکان لە ئامێرێکی تر گۆڕدران. نوێترین وەشان بارکرا.',
    version: 'وەشان',
    autoReply: 'وەڵامی خۆکار',
    replyLanguage: 'زمانی وەڵام',
    delivery: 'گەیاندن',
    deliveryEnabled: 'گەیاندن بەردەستە',
    pricingMode: 'شێوازی نرخی گەیاندن',
    flatPricing: 'یەک نرخ',
    perAreaPricing: 'نرخ بەپێی ناوچە',
    deliveryFee: 'کرێی گەیاندن',
    areaName: 'ناوچە',
    areaFee: 'کرێی گەیاندن',
    addArea: 'زیادکردنی ناوچە',
    removeArea: 'سڕینەوە',
    areaRateRequired: 'لانیکەم یەک ناوچە و نرخ زیاد بکە.',
    freeThreshold: 'گەیاندنی بەخۆڕایی لە سەرووی',
    minDays: 'کەمترین ڕۆژ',
    maxDays: 'زۆرترین ڕۆژ',
    areas: 'ناوچەکانی گەیاندن',
    notes: 'تێبینی گەیاندن',
    payment: 'پارەدان',
    cash: 'پارەدان لە کاتی گەیاندن',
    electronic: 'پارەدانی ئەلیکترۆنی',
    instructions: 'ڕێنمایی پارەدان',
    invalidDelivery: 'زۆرترین ماوە نابێت لە کەمترین ماوە کەمتر بێت.',
    paymentRequired: 'دەبێت لانیکەم یەک شێوازی پارەدان بمێنێتەوە.',
    electronicRequired: 'شێوازێکی ئەلیکترۆنی هەڵبژێرە.',
  },
  en: {
    title: 'Settings',
    subtitle: 'Reply, delivery, and payment settings are stored on the server',
    refresh: 'Refresh',
    persist: 'Save settings',
    persisted: 'Settings saved',
    loading: 'Loading settings…',
    loadFailed: 'Could not load settings from the server',
    persistFailed: 'Could not save settings',
    conflict: 'Settings changed on another device. The latest version was loaded.',
    version: 'Version',
    autoReply: 'Automatic replies',
    replyLanguage: 'Reply language',
    delivery: 'Delivery',
    deliveryEnabled: 'Delivery available',
    pricingMode: 'Delivery pricing',
    flatPricing: 'One flat fee',
    perAreaPricing: 'Fee by area',
    deliveryFee: 'Delivery fee (IQD)',
    areaName: 'Area',
    areaFee: 'Delivery fee',
    addArea: 'Add area',
    removeArea: 'Remove',
    areaRateRequired: 'Add at least one area with a valid delivery fee.',
    freeThreshold: 'Free delivery above',
    minDays: 'Minimum days',
    maxDays: 'Maximum days',
    areas: 'Delivery areas',
    notes: 'Delivery notes',
    payment: 'Payment',
    cash: 'Cash on delivery',
    electronic: 'Electronic payment',
    instructions: 'Payment instructions',
    invalidDelivery: 'Maximum delivery days cannot be less than minimum days.',
    paymentRequired: 'At least one payment method must remain enabled.',
    electronicRequired: 'Select an electronic method when electronic payment is enabled.',
  },
};

const ELECTRONIC_METHODS: PaymentMethod[] = [
  'superqi',
  'fastpay',
  'zaincash',
  'other',
];

function languageCode(i18n: ReturnType<typeof useI18n>): LanguageCode {
  const value = String(
    (i18n as unknown as { language?: string }).language || '',
  ).trim();
  if (value === 'ar' || value === 'ku' || value === 'en') return value;
  return i18n.isRTL ? 'ar' : 'en';
}

function normalizeAreas(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value.split(/[\n,]/)) {
    const normalized = item.trim().slice(0, 100);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= 100) break;
  }
  return result;
}

export default function ServerSettingsPage() {
  const i18n = useI18n();
  const language = languageCode(i18n);
  const copy = COPY[language];
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [draft, setDraft] = useState<MerchantSettings | null>(null);
  const [areasText, setAreasText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dirty = useMemo(
    () =>
      Boolean(
        settings &&
          draft &&
          (JSON.stringify(settings) !== JSON.stringify(draft) ||
            areasText !== settings.delivery.areas.join('\n')),
      ),
    [settings, draft, areasText],
  );

  const applyServerState = (next: MerchantSettings) => {
    setSettings(next);
    setDraft(structuredClone(next));
    setAreasText(next.delivery.areas.join('\n'));
  };

  const loadSettings = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/settings', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true || !data.settings) {
        throw new Error(data?.error || copy.loadFailed);
      }
      applyServerState(data.settings as MerchantSettings);
      setError('');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : copy.loadFailed;
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, [language]);

  const updateDraft = (mutator: (current: MerchantSettings) => MerchantSettings) => {
    setDraft(current => (current ? mutator(current) : current));
  };

  const toggleMethod = (method: PaymentMethod, enabled: boolean) => {
    updateDraft(current => {
      const methods = new Set(current.payment.methods);
      enabled ? methods.add(method) : methods.delete(method);
      return { ...current, payment: { ...current.payment, methods: [...methods] } };
    });
  };

  const addAreaRate = () => {
    updateDraft(current => ({
      ...current,
      delivery: {
        ...current.delivery,
        area_rates: [
          ...current.delivery.area_rates,
          {
            id: `draft-${Date.now()}-${current.delivery.area_rates.length}`,
            area_name: '',
            normalized_area_name: '',
            fee_iqd: 0,
            enabled: true,
          },
        ],
      },
    }));
  };

  const updateAreaRate = (index: number, patch: Partial<DeliveryAreaRate>) => {
    updateDraft(current => ({
      ...current,
      delivery: {
        ...current.delivery,
        area_rates: current.delivery.area_rates.map((rate, rateIndex) =>
          rateIndex === index ? { ...rate, ...patch } : rate,
        ),
      },
    }));
  };

  const removeAreaRate = (index: number) => {
    updateDraft(current => ({
      ...current,
      delivery: {
        ...current.delivery,
        area_rates: current.delivery.area_rates.filter(
          (_, rateIndex) => rateIndex !== index,
        ),
      },
    }));
  };

  const persistSettings = async () => {
    if (!settings || !draft || saving) return;

    const normalized: MerchantSettings = {
      ...draft,
      delivery: {
        ...draft.delivery,
        areas:
          draft.delivery.pricing_mode === 'flat'
            ? normalizeAreas(areasText)
            : [],
        area_rates: draft.delivery.area_rates.map(rate => ({
          ...rate,
          area_name: rate.area_name.trim(),
          fee_iqd: Math.max(0, Number(rate.fee_iqd || 0)),
          enabled: rate.enabled !== false,
        })),
      },
      payment: {
        ...draft.payment,
        methods: draft.payment.methods.filter(method =>
          method === 'cash_on_delivery'
            ? draft.payment.cash_on_delivery_enabled
            : draft.payment.electronic_payment_enabled,
        ),
      },
    };

    if (
      normalized.delivery.pricing_mode === 'per_area' &&
      !normalized.delivery.area_rates.some(
        rate => rate.enabled && rate.area_name.length > 0,
      )
    ) {
      toast.error(copy.areaRateRequired);
      return;
    }
    if (
      normalized.payment.cash_on_delivery_enabled &&
      !normalized.payment.methods.includes('cash_on_delivery')
    ) {
      normalized.payment.methods.unshift('cash_on_delivery');
    }
    if (normalized.delivery.estimated_days_max < normalized.delivery.estimated_days_min) {
      toast.error(copy.invalidDelivery);
      return;
    }
    if (
      !normalized.payment.cash_on_delivery_enabled &&
      !normalized.payment.electronic_payment_enabled
    ) {
      toast.error(copy.paymentRequired);
      return;
    }
    if (
      normalized.payment.electronic_payment_enabled &&
      !normalized.payment.methods.some(method => method !== 'cash_on_delivery')
    ) {
      toast.error(copy.electronicRequired);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expected_version: settings.version,
          settings: {
            auto_reply_enabled: normalized.auto_reply_enabled,
            reply_language: normalized.reply_language,
            delivery: normalized.delivery,
            payment: normalized.payment,
          },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true || !data.settings) {
        if (
          data?.code === 'MERCHANT_SETTINGS_VERSION_CONFLICT' &&
          data.current_settings
        ) {
          applyServerState(data.current_settings as MerchantSettings);
          toast.error(copy.conflict);
          return;
        }
        throw new Error(data?.error || copy.persistFailed);
      }
      applyServerState(data.settings as MerchantSettings);
      setError('');
      toast.success(copy.persisted);
    } catch (persistError) {
      const message =
        persistError instanceof Error ? persistError.message : copy.persistFailed;
      setError(message);
      toast.error(message);
      await loadSettings(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {copy.loading}
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-background p-4" dir={i18n.dir}>
        <div className="mx-auto max-w-3xl rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          {error || copy.loadFailed}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4 pb-28" dir={i18n.dir}>
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{copy.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {copy.version} {settings?.version ?? draft.version}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadSettings()}
              disabled={loading || saving}
            >
              <RefreshCw className="me-2 h-4 w-4" />
              {copy.refresh}
            </Button>
            <Button
              type="button"
              onClick={() => void persistSettings()}
              disabled={!dirty || saving}
            >
              {saving ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="me-2 h-4 w-4" />
              )}
              {copy.persist}
            </Button>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{copy.autoReply}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between rounded-xl border p-4 font-semibold">
              {copy.autoReply}
              <input
                type="checkbox"
                checked={draft.auto_reply_enabled}
                onChange={event =>
                  updateDraft(current => ({
                    ...current,
                    auto_reply_enabled: event.target.checked,
                  }))
                }
                className="h-5 w-5 accent-primary"
              />
            </label>
            <label className="space-y-2 rounded-xl border p-4 font-semibold">
              <span>{copy.replyLanguage}</span>
              <select
                value={draft.reply_language}
                onChange={event =>
                  updateDraft(current => ({
                    ...current,
                    reply_language: event.target.value as ReplyLanguage,
                  }))
                }
                className="h-11 w-full rounded-md border bg-background px-3"
              >
                <option value="auto">Auto</option>
                <option value="ar">العربية</option>
                <option value="ku">کوردی</option>
                <option value="en">English</option>
              </select>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.delivery}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between rounded-xl border p-4 font-semibold">
              {copy.deliveryEnabled}
              <input
                type="checkbox"
                checked={draft.delivery.enabled}
                onChange={event =>
                  updateDraft(current => ({
                    ...current,
                    delivery: { ...current.delivery, enabled: event.target.checked },
                  }))
                }
                className="h-5 w-5 accent-primary"
              />
            </label>
            <label className="block space-y-2 rounded-xl border p-4 text-sm font-semibold">
              <span>{copy.pricingMode}</span>
              <select
                value={draft.delivery.pricing_mode}
                onChange={event =>
                  updateDraft(current => ({
                    ...current,
                    delivery: {
                      ...current.delivery,
                      pricing_mode: event.target.value as DeliveryPricingMode,
                    },
                  }))
                }
                className="h-11 w-full rounded-md border bg-background px-3"
              >
                <option value="flat">{copy.flatPricing}</option>
                <option value="per_area">{copy.perAreaPricing}</option>
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-2 text-sm font-medium">
                <span>{copy.deliveryFee}</span>
                <Input
                  type="number"
                  min={0}
                  disabled={draft.delivery.pricing_mode === 'per_area'}
                  value={draft.delivery.fee_iqd}
                  onChange={event =>
                    updateDraft(current => ({
                      ...current,
                      delivery: {
                        ...current.delivery,
                        fee_iqd: Math.max(0, Number(event.target.value || 0)),
                      },
                    }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{copy.freeThreshold}</span>
                <Input
                  type="number"
                  min={0}
                  value={draft.delivery.free_delivery_threshold_iqd ?? ''}
                  onChange={event =>
                    updateDraft(current => ({
                      ...current,
                      delivery: {
                        ...current.delivery,
                        free_delivery_threshold_iqd: event.target.value
                          ? Math.max(0, Number(event.target.value))
                          : null,
                      },
                    }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{copy.minDays}</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={draft.delivery.estimated_days_min}
                  onChange={event =>
                    updateDraft(current => ({
                      ...current,
                      delivery: {
                        ...current.delivery,
                        estimated_days_min: Math.max(1, Number(event.target.value || 1)),
                      },
                    }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{copy.maxDays}</span>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={draft.delivery.estimated_days_max}
                  onChange={event =>
                    updateDraft(current => ({
                      ...current,
                      delivery: {
                        ...current.delivery,
                        estimated_days_max: Math.max(1, Number(event.target.value || 1)),
                      },
                    }))
                  }
                />
              </label>
            </div>
            {draft.delivery.pricing_mode === 'per_area' ? (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{copy.perAreaPricing}</span>
                  <Button type="button" variant="outline" onClick={addAreaRate}>
                    {copy.addArea}
                  </Button>
                </div>
                {draft.delivery.area_rates.map((rate, index) => (
                  <div
                    key={rate.id || index}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_180px_auto]"
                  >
                    <label className="space-y-1 text-sm font-medium">
                      <span>{copy.areaName}</span>
                      <Input
                        value={rate.area_name}
                        maxLength={100}
                        onChange={event =>
                          updateAreaRate(index, { area_name: event.target.value })
                        }
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium">
                      <span>{copy.areaFee}</span>
                      <Input
                        type="number"
                        min={0}
                        value={rate.fee_iqd}
                        onChange={event =>
                          updateAreaRate(index, {
                            fee_iqd: Math.max(0, Number(event.target.value || 0)),
                          })
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="self-end"
                      onClick={() => removeAreaRate(index)}
                    >
                      {copy.removeArea}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            <label className="block space-y-2 text-sm font-medium">
              <span>{copy.areas}</span>
              <textarea
                value={areasText}
                disabled={draft.delivery.pricing_mode === 'per_area'}
                onChange={event => setAreasText(event.target.value)}
                rows={4}
                maxLength={10000}
                className="w-full rounded-md border bg-background p-3 text-sm"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>{copy.notes}</span>
              <textarea
                value={draft.delivery.notes}
                onChange={event =>
                  updateDraft(current => ({
                    ...current,
                    delivery: {
                      ...current.delivery,
                      notes: event.target.value.slice(0, 1000),
                    },
                  }))
                }
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border bg-background p-3 text-sm"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.payment}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-xl border p-4 font-semibold">
                {copy.cash}
                <input
                  type="checkbox"
                  checked={draft.payment.cash_on_delivery_enabled}
                  onChange={event => {
                    const enabled = event.target.checked;
                    updateDraft(current => {
                      const methods = new Set(current.payment.methods);
                      enabled ? methods.add('cash_on_delivery') : methods.delete('cash_on_delivery');
                      return {
                        ...current,
                        payment: {
                          ...current.payment,
                          cash_on_delivery_enabled: enabled,
                          methods: [...methods],
                        },
                      };
                    });
                  }}
                  className="h-5 w-5 accent-primary"
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border p-4 font-semibold">
                {copy.electronic}
                <input
                  type="checkbox"
                  checked={draft.payment.electronic_payment_enabled}
                  onChange={event => {
                    const enabled = event.target.checked;
                    updateDraft(current => ({
                      ...current,
                      payment: {
                        ...current.payment,
                        electronic_payment_enabled: enabled,
                        methods: enabled
                          ? current.payment.methods
                          : current.payment.methods.filter(
                              method => method === 'cash_on_delivery',
                            ),
                      },
                    }));
                  }}
                  className="h-5 w-5 accent-primary"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ELECTRONIC_METHODS.map(method => (
                <label key={method} className="flex items-center gap-3 rounded-xl border p-3">
                  <input
                    type="checkbox"
                    checked={draft.payment.methods.includes(method)}
                    disabled={!draft.payment.electronic_payment_enabled}
                    onChange={event => toggleMethod(method, event.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-sm font-medium">{method}</span>
                </label>
              ))}
            </div>
            <label className="block space-y-2 text-sm font-medium">
              <span>{copy.instructions}</span>
              <textarea
                value={draft.payment.instructions}
                onChange={event =>
                  updateDraft(current => ({
                    ...current,
                    payment: {
                      ...current.payment,
                      instructions: event.target.value.slice(0, 2000),
                    },
                  }))
                }
                rows={4}
                maxLength={2000}
                className="w-full rounded-md border bg-background p-3 text-sm"
              />
            </label>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
