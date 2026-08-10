#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
def p(rel): return ROOT / rel
def read(rel): return p(rel).read_text(encoding="utf-8")
def write(rel, content): p(rel).write_text(content, encoding="utf-8")
def replace(rel, old, new, count=1):
    text = read(rel); actual = text.count(old)
    if actual < count: raise SystemExit(f"{rel}: expected {count}, found {actual}: {old[:120]!r}")
    write(rel, text.replace(old, new, count))
def replace_all(rel, old, new):
    text = read(rel)
    if old not in text: raise SystemExit(f"{rel}: missing target {old[:120]!r}")
    write(rel, text.replace(old, new))

# Legacy bot/order path now consumes the same server quote authority and snapshots the result.
replace("artifacts/api-server/src/routes/index.ts",
'''import { registerMerchantRuntimeDeletion } from "../services/merchantRuntime";''',
'''import {
  formatDeliveryQuoteText,
  type DeliveryQuote,
} from "../services/deliveryPricing";
import { getMerchantDeliveryQuote } from "../services/merchantSettingsRuntime";
import { registerMerchantRuntimeDeletion } from "../services/merchantRuntime";''')
replace("artifacts/api-server/src/routes/index.ts",
'''  quantity: number;
  unit_price: number;
  total_price: number;''',
'''  quantity: number;
  unit_price: number;
  subtotal_iqd: number;
  delivery_fee_iqd: number;
  total_iqd: number;
  total_price: number;
  delivery_pricing_mode: "flat" | "per_area";
  delivery_settings_version: number;
  delivery_area_rate_id?: string;''')
replace("artifacts/api-server/src/routes/index.ts",
'''}) {
  const now = new Date().toISOString();
  const currentOrders = ordersByMerchant.get(params.merchantId) || [];
  const order: Order = {''',
'''}) {
  const subtotal = params.unitPrice * params.quantity;
  const deliveryQuote = getMerchantDeliveryQuote({
    merchantId: params.merchantId,
    area: params.customerAddress,
    subtotalIqd: subtotal,
  });
  if (!deliveryQuote.available) {
    throw Object.assign(
      new Error("delivery quote is required before order creation"),
      {
        code: "ORDER_DELIVERY_QUOTE_REQUIRED",
        status: 409,
        deliveryQuote,
      },
    );
  }
  const now = new Date().toISOString();
  const currentOrders = ordersByMerchant.get(params.merchantId) || [];
  const order: Order = {''')
replace("artifacts/api-server/src/routes/index.ts",
'''    customer_phone: params.customerPhone,
    customer_address: params.customerAddress,
    product_id: params.productId,''',
'''    customer_phone: params.customerPhone,
    customer_address: params.customerAddress,
    customer_area: deliveryQuote.matched_area || params.customerAddress,
    product_id: params.productId,''')
replace("artifacts/api-server/src/routes/index.ts",
'''    quantity: params.quantity,
    unit_price: params.unitPrice,
    total_price: params.unitPrice * params.quantity,
    status: "new",''',
'''    quantity: params.quantity,
    unit_price: params.unitPrice,
    subtotal_iqd: subtotal,
    delivery_fee_iqd: deliveryQuote.effective_fee_iqd,
    total_iqd: deliveryQuote.total_iqd,
    total_price: deliveryQuote.total_iqd,
    delivery_pricing_mode: deliveryQuote.pricing_mode,
    delivery_settings_version: deliveryQuote.settings_version,
    ...(deliveryQuote.area_rate_id
      ? { delivery_area_rate_id: deliveryQuote.area_rate_id }
      : {}),
    status: "new",''')
replace("artifacts/api-server/src/routes/index.ts",
'''function formatPrice(price: number, language: LanguageCode) {
  const formatted = price.toLocaleString("en-US");
  if (language === "en") return `${formatted} IQD`;
  if (language === "ku_sorani") return `${formatted} دینار عێراقی`;
  return `${formatted} دينار عراقي`;
}
''',
'''function formatPrice(price: number, language: LanguageCode) {
  const formatted = price.toLocaleString("en-US");
  if (language === "en") return `${formatted} IQD`;
  if (language === "ku_sorani") return `${formatted} دینار عێراقی`;
  return `${formatted} دينار عراقي`;
}

function deliveryLanguage(language: LanguageCode): "ar" | "ku" | "en" {
  if (language === "en") return "en";
  if (language === "ku_sorani") return "ku";
  return "ar";
}

function deliveryQuoteFromError(error: unknown): DeliveryQuote | null {
  if (!error || typeof error !== "object") return null;
  const quote = (error as { deliveryQuote?: unknown }).deliveryQuote;
  return quote && typeof quote === "object" ? (quote as DeliveryQuote) : null;
}
''')
old = '''      const order = createOrder({
        merchantId: context.merchantId,
        conversationId,
        customerId,
        customerName,
        customerPhone: phone,
        customerAddress: address,
        productId: existingDraft.product_id,
        productName: existingDraft.product_name || "منتج غير محدد",
        quantity: existingDraft.quantity || 1,
        unitPrice: existingDraft.unit_price || 0,
        notes: userText,
      });
      clearOrderDraft(conversationId);
      return withDebug({
        text: replyText(language, "orderConfirm", { orderId: order.id }),
        replyType: "database",
      });'''
new = '''      try {
        const order = createOrder({
          merchantId: context.merchantId,
          conversationId,
          customerId,
          customerName,
          customerPhone: phone,
          customerAddress: address,
          productId: existingDraft.product_id,
          productName: existingDraft.product_name || "منتج غير محدد",
          quantity: existingDraft.quantity || 1,
          unitPrice: existingDraft.unit_price || 0,
          notes: userText,
        });
        clearOrderDraft(conversationId);
        return withDebug({
          text: replyText(language, "orderConfirm", { orderId: order.id }),
          replyType: "database",
        });
      } catch (error) {
        const quote = deliveryQuoteFromError(error);
        if (quote) {
          return withDebug({
            text: formatDeliveryQuoteText(quote, deliveryLanguage(language)),
            replyType: "database",
          });
        }
        throw error;
      }'''
replace("artifacts/api-server/src/routes/index.ts", old, new)
replace("artifacts/api-server/src/routes/index.ts",
'''    case "info_delivery":
      return withDebug({
        text: replyText(language, "delivery"),
        replyType: "database",
      });''',
'''    case "info_delivery": {
      const quote = getMerchantDeliveryQuote({
        merchantId: context.merchantId,
        area: userText,
        subtotalIqd: 0,
      });
      return withDebug({
        text: formatDeliveryQuoteText(quote, deliveryLanguage(language)),
        replyType: "database",
      });
    }''')

# Dashboard server settings contract/UI.
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''type ReplyLanguage = 'auto' | 'ar' | 'ku' | 'en';
type PaymentMethod =''',
'''type ReplyLanguage = 'auto' | 'ar' | 'ku' | 'en';
type DeliveryPricingMode = 'flat' | 'per_area';
type DeliveryAreaRate = {
  id: string;
  area_name: string;
  normalized_area_name: string;
  fee_iqd: number;
  enabled: boolean;
};
type PaymentMethod =''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''  delivery: {
    enabled: boolean;
    fee_iqd: number;''',
'''  delivery: {
    enabled: boolean;
    pricing_mode: DeliveryPricingMode;
    fee_iqd: number;''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''    areas: string[];
    notes: string;''',
'''    areas: string[];
    area_rates: DeliveryAreaRate[];
    notes: string;''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''  deliveryFee: string;
  freeThreshold: string;''',
'''  pricingMode: string;
  flatPricing: string;
  perAreaPricing: string;
  deliveryFee: string;
  areaName: string;
  areaFee: string;
  addArea: string;
  removeArea: string;
  areaRateRequired: string;
  freeThreshold: string;''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''    deliveryEnabled: 'التوصيل متاح',
    deliveryFee: 'أجرة التوصيل (دينار)',
    freeThreshold:''',
'''    deliveryEnabled: 'التوصيل متاح',
    pricingMode: 'طريقة تسعير التوصيل',
    flatPricing: 'أجرة موحدة',
    perAreaPricing: 'أجرة حسب المنطقة',
    deliveryFee: 'أجرة التوصيل (دينار)',
    areaName: 'المنطقة',
    areaFee: 'أجرة التوصيل',
    addArea: 'إضافة منطقة',
    removeArea: 'حذف',
    areaRateRequired: 'أضف منطقة واحدة على الأقل مع أجرة صحيحة.',
    freeThreshold:''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''    deliveryEnabled: 'گەیاندن بەردەستە',
    deliveryFee: 'کرێی گەیاندن',
    freeThreshold:''',
'''    deliveryEnabled: 'گەیاندن بەردەستە',
    pricingMode: 'شێوازی نرخی گەیاندن',
    flatPricing: 'یەک نرخ',
    perAreaPricing: 'نرخ بەپێی ناوچە',
    deliveryFee: 'کرێی گەیاندن',
    areaName: 'ناوچە',
    areaFee: 'کرێی گەیاندن',
    addArea: 'زیادکردنی ناوچە',
    removeArea: 'سڕینەوە',
    areaRateRequired: 'لانیکەم یەک ناوچە و نرخ زیاد بکە.',
    freeThreshold:''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''    deliveryEnabled: 'Delivery available',
    deliveryFee: 'Delivery fee (IQD)',
    freeThreshold:''',
'''    deliveryEnabled: 'Delivery available',
    pricingMode: 'Delivery pricing',
    flatPricing: 'One flat fee',
    perAreaPricing: 'Fee by area',
    deliveryFee: 'Delivery fee (IQD)',
    areaName: 'Area',
    areaFee: 'Delivery fee',
    addArea: 'Add area',
    removeArea: 'Remove',
    areaRateRequired: 'Add at least one area with a valid delivery fee.',
    freeThreshold:''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''  const dirty = useMemo(
    () => Boolean(settings && draft && JSON.stringify(settings) !== JSON.stringify(draft)),
    [settings, draft],
  );''',
'''  const dirty = useMemo(
    () =>
      Boolean(
        settings &&
          draft &&
          (JSON.stringify(settings) !== JSON.stringify(draft) ||
            areasText !== settings.delivery.areas.join('\\n')),
      ),
    [settings, draft, areasText],
  );''')
anchor = '''  const toggleMethod = (method: PaymentMethod, enabled: boolean) => {
    updateDraft(current => {
      const methods = new Set(current.payment.methods);
      enabled ? methods.add(method) : methods.delete(method);
      return { ...current, payment: { ...current.payment, methods: [...methods] } };
    });
  };
'''
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx", anchor, anchor + '''
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
''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''      delivery: { ...draft.delivery, areas: normalizeAreas(areasText) },''',
'''      delivery: {
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
      },''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''    if (
      normalized.payment.cash_on_delivery_enabled &&''',
'''    if (
      normalized.delivery.pricing_mode === 'per_area' &&
      !normalized.delivery.area_rates.some(
        rate => rate.enabled && rate.area_name.length > 0,
      )
    ) {
      toast.error(copy.areaRateRequired);
      return;
    }
    if (
      normalized.payment.cash_on_delivery_enabled &&''')
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''            </label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-2 text-sm font-medium">
                <span>{copy.deliveryFee}</span>''',
'''            </label>
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
                <span>{copy.deliveryFee}</span>''', 1)
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''                  type="number"
                  min={0}
                  value={draft.delivery.fee_iqd}''',
'''                  type="number"
                  min={0}
                  disabled={draft.delivery.pricing_mode === 'per_area'}
                  value={draft.delivery.fee_iqd}''', 1)
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''            <label className="block space-y-2 text-sm font-medium">
              <span>{copy.areas}</span>
              <textarea''',
'''            {draft.delivery.pricing_mode === 'per_area' ? (
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
              <textarea''', 1)
replace("artifacts/fawri/src/pages/dashboard/ServerSettingsPage.tsx",
'''                value={areasText}
                onChange={event => setAreasText(event.target.value)}
                rows={4}''',
'''                value={areasText}
                disabled={draft.delivery.pricing_mode === 'per_area'}
                onChange={event => setAreasText(event.target.value)}
                rows={4}''', 1)

replace_all("artifacts/fawri/src/pages/dashboard/MerchantSettingsPage.tsx",
'''التوصيل يدعم أجرة واحدة لجميع المناطق. اختلاف الأجرة لكل منطقة غير ممثل في نموذج السيرفر ويحتاج COORDINATOR/PRODUCT MODEL HANDOFF REQUIRED قبل أي ترحيل.''',
'''التوصيل يدعم أجرة موحدة أو أجرة مختلفة حسب المنطقة، وتبقى الأسعار والمناطق محفوظة ضمن سلطة السيرفر.''')
replace_all("artifacts/fawri/src/pages/dashboard/MerchantSettingsPage.tsx",
'''گەیاندن تەنها یەک نرخ بۆ هەموو ناوچەکان پشتگیری دەکات. نرخی جیاواز بۆ هەر ناوچەیەک لە مۆدێلی سێرڤەر نییە و پێویستی بە COORDINATOR/PRODUCT MODEL HANDOFF REQUIRED هەیە.''',
'''گەیاندن یەک نرخ یان نرخی جیاواز بەپێی ناوچە پشتگیری دەکات و هەموو نرخەکان لە دەسەڵاتی سێرڤەر پاشەکەوت دەکرێن.''')
replace_all("artifacts/fawri/src/pages/dashboard/MerchantSettingsPage.tsx",
'''Delivery supports one fee across all areas. Different per-area fees are not representable by the current server model and require COORDINATOR/PRODUCT MODEL HANDOFF REQUIRED before migration.''',
'''Delivery supports either one flat fee or different fees by area, with all pricing stored in the server authority.''')

print("patch 3 complete")
