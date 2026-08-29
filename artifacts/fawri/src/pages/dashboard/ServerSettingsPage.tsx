import { COMMON_UI_COPY } from '@/lib/translations/commonUi';
import { COMMON_UI_LABELS } from '@/lib/translations/commonUi';
import { SERVER_SETTINGS_PAGE_COPY } from '@/lib/translations/features/pages/dashboard/ServerSettingsPage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  catalogCurrencyStep,
  catalogMajorAmountToMinor,
  catalogMinorAmountToMajor,
} from '@/lib/catalogPromotionUiApi';
import {
  getMerchantRegionalContext,
  type MerchantRegionalContext,
} from '@/lib/merchantRegionalUiApi';

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
type AuthorityStatus = 'loading' | 'ready' | 'unavailable';

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

const COPY: Record<LanguageCode, Copy> = SERVER_SETTINGS_PAGE_COPY;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    value === 'cash_on_delivery' ||
    value === 'superqi' ||
    value === 'fastpay' ||
    value === 'zaincash' ||
    value === 'other'
  );
}

function isMerchantSettings(value: unknown): value is MerchantSettings {
  if (!isRecord(value) || !isRecord(value.delivery) || !isRecord(value.payment)) {
    return false;
  }

  const delivery = value.delivery;
  const payment = value.payment;
  const areaRates = delivery.area_rates;
  const areas = delivery.areas;
  const methods = payment.methods;

  return (
    typeof value.merchant_id === 'string' &&
    Number.isInteger(value.version) &&
    typeof value.auto_reply_enabled === 'boolean' &&
    (value.reply_language === 'auto' ||
      value.reply_language === 'ar' ||
      value.reply_language === 'ku' ||
      value.reply_language === 'en') &&
    typeof delivery.enabled === 'boolean' &&
    (delivery.pricing_mode === 'flat' || delivery.pricing_mode === 'per_area') &&
    typeof delivery.fee_iqd === 'number' &&
    (delivery.free_delivery_threshold_iqd === null ||
      typeof delivery.free_delivery_threshold_iqd === 'number') &&
    typeof delivery.estimated_days_min === 'number' &&
    typeof delivery.estimated_days_max === 'number' &&
    Array.isArray(areas) &&
    areas.every(area => typeof area === 'string') &&
    Array.isArray(areaRates) &&
    areaRates.every(rate =>
      isRecord(rate) &&
      typeof rate.id === 'string' &&
      typeof rate.area_name === 'string' &&
      typeof rate.normalized_area_name === 'string' &&
      typeof rate.fee_iqd === 'number' &&
      typeof rate.enabled === 'boolean',
    ) &&
    typeof delivery.notes === 'string' &&
    typeof payment.cash_on_delivery_enabled === 'boolean' &&
    typeof payment.electronic_payment_enabled === 'boolean' &&
    Array.isArray(methods) &&
    methods.every(isPaymentMethod) &&
    typeof payment.instructions === 'string' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}

export default function ServerSettingsPage() {
  const i18n = useI18n();
  const language = languageCode(i18n);
  const copy = COPY[language];
  const commonCopy = COMMON_UI_COPY[language];
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [draft, setDraft] = useState<MerchantSettings | null>(null);
  const [regional, setRegional] = useState<MerchantRegionalContext | null>(null);
  const [areasText, setAreasText] = useState('');
  const [loading, setLoading] = useState(true);
  const [authorityStatus, setAuthorityStatus] = useState<AuthorityStatus>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const loadRequestIdRef = useRef(0);

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
    const requestId = ++loadRequestIdRef.current;
    setAuthorityStatus('loading');
    if (!silent) {
      setLoading(true);
      setError('');
    }

    try {
      const [response, regionalContext] = await Promise.all([
        fetch('/api/settings', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        }),
        getMerchantRegionalContext(),
      ]);
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.ok !== true || !isMerchantSettings(data.settings)) {
        throw new Error(data?.error || copy.loadFailed);
      }
      if (requestId !== loadRequestIdRef.current) return;

      setRegional(regionalContext);
      applyServerState(data.settings);
      setAuthorityStatus('ready');
      setError('');
    } catch (loadError) {
      if (requestId !== loadRequestIdRef.current) return;
      const message = loadError instanceof Error ? loadError.message : copy.loadFailed;
      setAuthorityStatus('unavailable');
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      if (requestId === loadRequestIdRef.current && !silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
    return () => {
      loadRequestIdRef.current += 1;
    };
  }, []);

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
    if (!settings || !draft || saving || authorityStatus !== 'ready') return;

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
        credentials: 'same-origin',
        cache: 'no-store',
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
      if (!response.ok || data?.ok !== true || !isMerchantSettings(data.settings)) {
        if (
          data?.code === 'MERCHANT_SETTINGS_VERSION_CONFLICT' &&
          isMerchantSettings(data.current_settings)
        ) {
          applyServerState(data.current_settings);
          setAuthorityStatus('ready');
          setError('');
          toast.error(copy.conflict);
          return;
        }
        throw new Error(data?.error || copy.persistFailed);
      }
      applyServerState(data.settings);
      setAuthorityStatus('ready');
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

  if (loading && (!draft || !regional)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {copy.loading}
      </div>
    );
  }

  if (!draft || !regional) {
    return (
      <div className="min-h-screen bg-background p-4" dir={i18n.dir}>
        <div className="mx-auto max-w-3xl rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          {error || copy.loadFailed}
        </div>
      </div>
    );
  }

  const currencyCode = regional.currency_code;
  const currencyFractionDigits = regional.currency_fraction_digits;
  const currencyStep = catalogCurrencyStep(currencyFractionDigits);
  const displayMoney = (amountMinor: number) =>
    catalogMinorAmountToMajor(amountMinor, currencyFractionDigits);
  const parseMoney = (amountMajor: string) =>
    catalogMajorAmountToMinor(amountMajor, currencyFractionDigits);

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
              disabled={!dirty || saving || loading || authorityStatus !== 'ready'}
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
          <div
            role="status"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <fieldset disabled={authorityStatus !== 'ready' || saving} className="contents">
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
                  <option value="auto">{commonCopy.auto}</option>
                  <option value="ar">{COMMON_UI_LABELS.languageNames.ar}</option>
                  <option value="ku">{COMMON_UI_LABELS.languageNames.ku}</option>
                  <option value="en">{COMMON_UI_LABELS.languageNames.en}</option>
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
                  <span>{copy.deliveryFee} ({currencyCode})</span>
                  <Input
                    type="number"
                    min={0}
                    step={currencyStep}
                    disabled={draft.delivery.pricing_mode === 'per_area'}
                    value={displayMoney(draft.delivery.fee_iqd)}
                    onChange={event => {
                      const minor = parseMoney(event.target.value || '0');
                      if (minor === null) return;
                      updateDraft(current => ({
                        ...current,
                        delivery: {
                          ...current.delivery,
                          fee_iqd: minor,
                        },
                      }));
                    }}
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  <span>{copy.freeThreshold} ({currencyCode})</span>
                  <Input
                    type="number"
                    min={0}
                    step={currencyStep}
                    value={
                      draft.delivery.free_delivery_threshold_iqd === null
                        ? ''
                        : displayMoney(draft.delivery.free_delivery_threshold_iqd)
                    }
                    onChange={event => {
                      if (!event.target.value) {
                        updateDraft(current => ({
                          ...current,
                          delivery: {
                            ...current.delivery,
                            free_delivery_threshold_iqd: null,
                          },
                        }));
                        return;
                      }
                      const minor = parseMoney(event.target.value);
                      if (minor === null) return;
                      updateDraft(current => ({
                        ...current,
                        delivery: {
                          ...current.delivery,
                          free_delivery_threshold_iqd: minor,
                        },
                      }));
                    }}
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
                        <span>{copy.areaFee} ({currencyCode})</span>
                        <Input
                          type="number"
                          min={0}
                          step={currencyStep}
                          value={displayMoney(rate.fee_iqd)}
                          onChange={event => {
                            const minor = parseMoney(event.target.value || '0');
                            if (minor === null) return;
                            updateAreaRate(index, { fee_iqd: minor });
                          }}
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
        </fieldset>
      </div>
    </main>
  );
}
