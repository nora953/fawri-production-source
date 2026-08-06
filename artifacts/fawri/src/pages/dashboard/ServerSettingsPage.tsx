import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Bot,
  CreditCard,
  Languages,
  Loader2,
  RefreshCw,
  Save,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';

type ReplyLanguage = 'auto' | 'ar' | 'ku' | 'en';
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
    fee_iqd: number;
    free_delivery_threshold_iqd: number | null;
    estimated_days_min: number;
    estimated_days_max: number;
    areas: string[];
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

type Labels = {
  title: string;
  subtitle: string;
  loading: string;
  refresh: string;
  save: string;
  saved: string;
  loadFailed: string;
  saveFailed: string;
  conflict: string;
  autoReply: string;
  autoReplyHelp: string;
  replyLanguage: string;
  languageAuto: string;
  languageArabic: string;
  languageKurdish: string;
  languageEnglish: string;
  delivery: string;
  deliveryEnabled: string;
  deliveryFee: string;
  freeDeliveryThreshold: string;
  minDays: string;
  maxDays: string;
  deliveryAreas: string;
  deliveryAreasHelp: string;
  deliveryNotes: string;
  payment: string;
  cashOnDelivery: string;
  electronicPayment: string;
  methods: string;
  paymentInstructions: string;
  atLeastOnePayment: string;
  electronicMethodRequired: string;
  invalidDeliveryRange: string;
  version: string;
  paymentMethods: Record<PaymentMethod, string>;
};

const LABELS: Record<LanguageCode, Labels> = {
  ar: {
    title: 'الإعدادات',
    subtitle: 'إعدادات الرد والتوصيل والدفع محفوظة على السيرفر',
    loading: 'جاري تحميل الإعدادات…',
    refresh: 'تحديث',
    save: 'حفظ الإعدادات',
    saved: 'تم حفظ الإعدادات',
    loadFailed: 'تعذر تحميل الإعدادات من السيرفر',
    saveFailed: 'تعذر حفظ الإعدادات',
    conflict: 'تم تعديل الإعدادات من جهاز آخر. تم تحميل النسخة الأحدث.',
    autoReply: 'الرد التلقائي',
    autoReplyHelp: 'إطفاؤه يوقف الرسائل المنتظرة أيضاً قبل إرسالها إلى العميل.',
    replyLanguage: 'لغة الرد',
    languageAuto: 'تلقائي حسب لغة العميل',
    languageArabic: 'العربية',
    languageKurdish: 'الكردية',
    languageEnglish: 'الإنجليزية',
    delivery: 'التوصيل',
    deliveryEnabled: 'التوصيل متاح',
    deliveryFee: 'أجرة التوصيل (دينار)',
    freeDeliveryThreshold: 'توصيل مجاني فوق مبلغ (اختياري)',
    minDays: 'أقل مدة بالأيام',
    maxDays: 'أقصى مدة بالأيام',
    deliveryAreas: 'مناطق التوصيل',
    deliveryAreasHelp: 'اكتب كل منطقة بسطر مستقل أو افصل بينها بفاصلة.',
    deliveryNotes: 'ملاحظات التوصيل',
    payment: 'الدفع',
    cashOnDelivery: 'الدفع عند الاستلام',
    electronicPayment: 'الدفع الإلكتروني',
    methods: 'طرق الدفع',
    paymentInstructions: 'تعليمات الدفع',
    atLeastOnePayment: 'يجب إبقاء طريقة دفع واحدة على الأقل.',
    electronicMethodRequired: 'اختر طريقة إلكترونية عند تشغيل الدفع الإلكتروني.',
    invalidDeliveryRange: 'أقصى مدة للتوصيل يجب ألا تقل عن أقل مدة.',
    version: 'نسخة',
    paymentMethods: {
      cash_on_delivery: 'الدفع عند الاستلام',
      superqi: 'SuperQi',
      fastpay: 'FastPay',
      zaincash: 'ZainCash',
      other: 'أخرى',
    },
  },
  ku: {
    title: 'ڕێکخستنەکان',
    subtitle: 'ڕێکخستنەکانی وەڵام، گەیاندن و پارەدان لە ڕاژەکار هەڵدەگیرێن',
    loading: 'ڕێکخستنەکان بار دەکرێن…',
    refresh: 'نوێکردنەوە',
    save: 'پاشەکەوتکردن',
    saved: 'ڕێکخستنەکان پاشەکەوت کران',
    loadFailed: 'نەتوانرا ڕێکخستنەکان لە ڕاژەکارەوە باربکرێن',
    saveFailed: 'نەتوانرا ڕێکخستنەکان پاشەکەوت بکرێن',
    conflict: 'ڕێکخستنەکان لە ئامێرێکی تر گۆڕدران. نوێترین وەشان بارکرا.',
    autoReply: 'وەڵامی خۆکار',
    autoReplyHelp: 'کوژاندنەوەی، پەیامە چاوەڕوانەکانیش پێش ناردن دەوەستێنێت.',
    replyLanguage: 'زمانی وەڵام',
    languageAuto: 'خۆکار بەپێی زمانی کڕیار',
    languageArabic: 'عەرەبی',
    languageKurdish: 'کوردی',
    languageEnglish: 'ئینگلیزی',
    delivery: 'گەیاندن',
    deliveryEnabled: 'گەیاندن بەردەستە',
    deliveryFee: 'کرێی گەیاندن (دینار)',
    freeDeliveryThreshold: 'گەیاندنی بەخۆڕایی لە سەرووی بڕێک',
    minDays: 'کەمترین ڕۆژ',
    maxDays: 'زۆرترین ڕۆژ',
    deliveryAreas: 'ناوچەکانی گەیاندن',
    deliveryAreasHelp: 'هەر ناوچەیەک لە هێڵێک یان بە کۆما جیا بکەوە.',
    deliveryNotes: 'تێبینی گەیاندن',
    payment: 'پارەدان',
    cashOnDelivery: 'پارەدان لە کاتی گەیاندن',
    electronicPayment: 'پارەدانی ئەلیکترۆنی',
    methods: 'شێوازەکانی پارەدان',
    paymentInstructions: 'ڕێنمایی پارەدان',
    atLeastOnePayment: 'دەبێت لانیکەم یەک شێوازی پارەدان بمێنێتەوە.',
    electronicMethodRequired: 'کاتێک پارەدانی ئەلیکترۆنی چالاکە شێوازێکی ئەلیکترۆنی هەڵبژێرە.',
    invalidDeliveryRange: 'زۆرترین ماوە نابێت لە کەمترین ماوە کەمتر بێت.',
    version: 'وەشان',
    paymentMethods: {
      cash_on_delivery: 'پارەدان لە کاتی گەیاندن',
      superqi: 'SuperQi',
      fastpay: 'FastPay',
      zaincash: 'ZainCash',
      other: 'هی تر',
    },
  },
  en: {
    title: 'Settings',
    subtitle: 'Reply, delivery, and payment settings are stored on the server',
    loading: 'Loading settings…',
    refresh: 'Refresh',
    save: 'Save settings',
    saved: 'Settings saved',
    loadFailed: 'Could not load settings from the server',
    saveFailed: 'Could not save settings',
    conflict: 'Settings changed on another device. The latest version was loaded.',
    autoReply: 'Automatic replies',
    autoReplyHelp: 'Turning this off also suppresses queued replies before delivery.',
    replyLanguage: 'Reply language',
    languageAuto: 'Automatic based on customer language',
    languageArabic: 'Arabic',
    languageKurdish: 'Kurdish',
    languageEnglish: 'English',
    delivery: 'Delivery',
    deliveryEnabled: 'Delivery available',
    deliveryFee: 'Delivery fee (IQD)',
    freeDeliveryThreshold: 'Free delivery above (optional)',
    minDays: 'Minimum days',
    maxDays: 'Maximum days',
    deliveryAreas: 'Delivery areas',
    deliveryAreasHelp: 'Enter one area per line or separate areas with commas.',
    deliveryNotes: 'Delivery notes',
    payment: 'Payment',
    cashOnDelivery: 'Cash on delivery',
    electronicPayment: 'Electronic payment',
    methods: 'Payment methods',
    paymentInstructions: 'Payment instructions',
    atLeastOnePayment: 'At least one payment method must remain enabled.',
    electronicMethodRequired: 'Select an electronic method when electronic payment is enabled.',
    invalidDeliveryRange: 'Maximum delivery days cannot be less than minimum days.',
    version: 'Version',
    paymentMethods: {
      cash_on_delivery: 'Cash on delivery',
      superqi: 'SuperQi',
      fastpay: 'FastPay',
      zaincash: 'ZainCash',
      other: 'Other',
    },
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

function uniqueAreas(value: string): string[] {
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
  const labels = LABELS[language];
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [draft, setDraft] = useState<MerchantSettings | null>(null);
  const [areasText, setAreasText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(settings) !== JSON.stringify(draft);
  }, [settings, draft]);

  const applySettings = (next: MerchantSettings) => {
    setSettings(next);
    setDraft(structuredClone(next));
    setAreasText(next.delivery.areas.join('\n'));
  };

  const loadSettings = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/settings', {
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.settings) {
        throw new Error(data?.error || labels.loadFailed);
      }
      applySettings(data.settings as MerchantSettings);
      setError('');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : labels.loadFailed;
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
      if (enabled) methods.add(method);
      else methods.delete(method);
      return {
        ...current,
        payment: { ...current.payment, methods: [...methods] },
      };
    });
  };

  const validate = (current: MerchantSettings): string | null => {
    if (current.delivery.estimated_days_max < current.delivery.estimated_days_min) {
      return labels.invalidDeliveryRange;
    }
    if (
      !current.payment.cash_on_delivery_enabled &&
      !current.payment.electronic_payment_enabled
    ) {
      return labels.atLeastOnePayment;
    }
    if (
      current.payment.electronic_payment_enabled &&
      !current.payment.methods.some(method => method !== 'cash_on_delivery')
    ) {
      return labels.electronicMethodRequired;
    }
    return null;
  };

  const saveSettings = async () => {
    if (!draft || !settings || saving) return;
    const normalized: MerchantSettings = {
      ...draft,
      delivery: {
        ...draft.delivery,
        areas: uniqueAreas(areasText),
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
      normalized.payment.cash_on_delivery_enabled &&
      !normalized.payment.methods.includes('cash_on_delivery')
    ) {
      normalized.payment.methods.unshift('cash_on_delivery');
    }
    const validationError = validate(normalized);
    if (validationError) {
      toast.error(validationError);
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
      if (!response.ok || !data?.ok || !data.settings) {
        if (
          data?.code === 'MERCHANT_SETTINGS_VERSION_CONFLICT' &&
          data.current_settings
        ) {
          applySettings(data.current_settings as MerchantSettings);
          toast.error(labels.conflict);
          return;
        }
        throw new Error(data?.error || labels.saveFailed);
      }
      applySettings(data.settings as MerchantSettings);
      setError('');
      toast.success(labels.saved);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : labels.saveFailed;
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
        {labels.loading}
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-background p-4" dir={i18n.dir}>
        <div className="mx-auto max-w-3xl rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          {error || labels.loadFailed}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={i18n.dir}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{labels.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {labels.version} {settings?.version || draft.version}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void loadSettings()}
              disabled={loading || saving}
            >
              <RefreshCw className="me-2 h-4 w-4" />
              {labels.refresh}
            </Button>
            <Button onClick={() => void saveSettings()} disabled={!dirty || saving}>
              {saving ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="me-2 h-4 w-4" />
              )}
              {labels.save}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              {labels.autoReply}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <label className="flex items-start justify-between gap-4 rounded-xl border p-4">
              <span>
                <span className="block font-semibold">{labels.autoReply}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {labels.autoReplyHelp}
                </span>
              </span>
              <input
                type="checkbox"
                checked={draft.auto_reply_enabled}
                onChange={event =>
                  updateDraft(current => ({
                    ...current,
                    auto_reply_enabled: event.target.checked,
                  }))
                }
                className="mt-1 h-5 w-5 accent-primary"
              />
            </label>

            <label className="space-y-2 rounded-xl border p-4">
              <span className="flex items-center gap-2 font-semibold">
                <Languages className="h-4 w-4 text-primary" />
                {labels.replyLanguage}
              </span>
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
                <option value="auto">{labels.languageAuto}</option>
                <option value="ar">{labels.languageArabic}</option>
                <option value="ku">{labels.languageKurdish}</option>
                <option value="en">{labels.languageEnglish}</option>
              </select>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              {labels.delivery}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="flex items-center justify-between rounded-xl border p-4 font-semibold">
              {labels.deliveryEnabled}
              <input
                type="checkbox"
                checked={draft.delivery.enabled}
                onChange={event =>
                  updateDraft(current => ({
                    ...current,
                    delivery: {
                      ...current.delivery,
                      enabled: event.target.checked,
                    },
                  }))
                }
                className="h-5 w-5 accent-primary"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.deliveryFee}</span>
                <Input
                  type="number"
                  min={0}
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
                <span>{labels.freeDeliveryThreshold}</span>
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
                <span>{labels.minDays}</span>
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
                <span>{labels.maxDays}</span>
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

            <label className="block space-y-2 text-sm font-medium">
              <span>{labels.deliveryAreas}</span>
              <textarea
                value={areasText}
                onChange={event => setAreasText(event.target.value)}
                rows={4}
                maxLength={10000}
                className="w-full rounded-md border bg-background p-3 text-sm"
              />
              <span className="block text-xs font-normal text-muted-foreground">
                {labels.deliveryAreasHelp}
              </span>
            </label>

            <label className="block space-y-2 text-sm font-medium">
              <span>{labels.deliveryNotes}</span>
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
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {labels.payment}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-xl border p-4 font-semibold">
                {labels.cashOnDelivery}
                <input
                  type="checkbox"
                  checked={draft.payment.cash_on_delivery_enabled}
                  onChange={event => {
                    const enabled = event.target.checked;
                    updateDraft(current => {
                      const methods = new Set(current.payment.methods);
                      if (enabled) methods.add('cash_on_delivery');
                      else methods.delete('cash_on_delivery');
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
                {labels.electronicPayment}
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

            <div>
              <p className="mb-3 text-sm font-semibold">{labels.methods}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ELECTRONIC_METHODS.map(method => (
                  <label
                    key={method}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      draft.payment.electronic_payment_enabled
                        ? ''
                        : 'opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={draft.payment.methods.includes(method)}
                      disabled={!draft.payment.electronic_payment_enabled}
                      onChange={event => toggleMethod(method, event.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm font-medium">
                      {labels.paymentMethods[method]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <label className="block space-y-2 text-sm font-medium">
              <span>{labels.paymentInstructions}</span>
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
    </div>
  );
}
