import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Pencil, Plus, RefreshCw, Tag, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CatalogPromotionApiError,
  catalogCurrencyStep,
  catalogMajorAmountToMinor,
  catalogMinorAmountToMajor,
  createCatalogPromotion,
  deleteCatalogPromotion,
  getCatalogCommerceContext,
  listCatalogPromotions,
  updateCatalogPromotion,
  type CatalogCommerceContext,
  type CatalogPromotion,
  type CatalogPromotionEffect,
  type CatalogPromotionInput,
  type CatalogPromotionScope,
} from '@/lib/catalogPromotionUiApi';
import {
  createStrongIdempotencyKey,
  listCatalogProducts,
  type CatalogProduct,
} from '@/lib/catalogUiApi';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type PromotionDraft = {
  name: string;
  scope: CatalogPromotionScope;
  product_id: string;
  variant_id: string;
  effect: CatalogPromotionEffect;
  value: string;
  minimum_subtotal: string;
  starts_date: string;
  starts_time: string;
  ends_date: string;
  ends_time: string;
  enabled: boolean;
};

const COPY: Record<Lang, Record<string, string>> = {
  ar: {
    title: 'العروض',
    subtitle: 'أنشئ عروضًا مؤقتة بدون تغيير السعر الأصلي. يبدأ وينتهي العرض تلقائيًا حسب توقيت متجرك.',
    add: 'إضافة عرض',
    loading: 'جارٍ تحميل العروض...',
    retry: 'إعادة المحاولة',
    empty: 'لا توجد عروض بعد.',
    name: 'اسم العرض',
    namePlaceholder: 'مثال: عرض نهاية الأسبوع',
    scope: 'نوع العرض',
    catalog: 'منتج أو خدمة',
    delivery: 'توصيل مجاني',
    item: 'المنتج أو الخدمة',
    variant: 'المتغير (اختياري)',
    allVariants: 'كل المتغيرات / العنصر بالكامل',
    effect: 'نوع الخصم',
    percentage: 'نسبة خصم',
    amountOff: 'مبلغ خصم',
    fixedPrice: 'سعر خاص',
    value: 'القيمة',
    valueCurrency: 'القيمة بعملة المتجر',
    minimumSubtotal: 'الحد الأدنى للطلب (اختياري)',
    minimumSubtotalHint: 'اتركه فارغًا إذا كان التوصيل المجاني بدون حد أدنى.',
    starts: 'يبدأ',
    ends: 'ينتهي',
    datePlaceholder: 'YYYY/MM/DD',
    timePlaceholder: 'HH:mm',
    dateTimeFormat: 'صيغة التاريخ والوقت: YYYY/MM/DD · HH:mm',
    localTime: 'تُفسر هذه الأوقات حسب المنطقة الزمنية المحفوظة لمتجرك.',
    enabled: 'العرض مفعّل',
    save: 'حفظ العرض',
    saving: 'جارٍ الحفظ...',
    cancel: 'إلغاء',
    edit: 'تعديل',
    delete: 'حذف',
    deleteConfirm: 'هل تريد حذف هذا العرض؟',
    created: 'تم إنشاء العرض.',
    updated: 'تم تحديث العرض.',
    deleted: 'تم حذف العرض.',
    invalid: 'راجع بيانات العرض.',
    loadFailed: 'تعذر تحميل العروض.',
    saveFailed: 'تعذر حفظ العرض.',
    scheduled: 'مجدول',
    active: 'فعال الآن',
    expired: 'منتهي',
    disabled: 'متوقف',
    timezone: 'توقيت العرض',
    currency: 'عملة المتجر',
    originalSafe: 'السعر الأصلي لا يتغير؛ فوري يستخدم السعر الفعّال فقط أثناء فترة العرض.',
  },
  ku: {
    title: 'ئۆفەرەکان',
    subtitle: 'ئۆفەری کاتی دروست بکە بەبێ گۆڕینی نرخی بنەڕەتی. بە پێی کاتی فرۆشگاکەت خۆکارانە دەست پێدەکات و کۆتایی دێت.',
    add: 'زیادکردنی ئۆفەر',
    loading: 'ئۆفەرەکان بار دەکرێن...',
    retry: 'دووبارە هەوڵدانەوە',
    empty: 'هێشتا هیچ ئۆفەرێک نییە.',
    name: 'ناوی ئۆفەر',
    namePlaceholder: 'نموونە: ئۆفەری کۆتایی هەفتە',
    scope: 'جۆری ئۆفەر',
    catalog: 'بەرهەم یان خزمەتگوزاری',
    delivery: 'گەیاندنی بەخۆڕایی',
    item: 'بەرهەم یان خزمەتگوزاری',
    variant: 'جۆراوجۆری (ئارەزوومەندانە)',
    allVariants: 'هەموو جۆراوجۆرییەکان / تەواوی بابەت',
    effect: 'جۆری داشکاندن',
    percentage: 'ڕێژەی داشکاندن',
    amountOff: 'بڕی داشکاندن',
    fixedPrice: 'نرخی تایبەت',
    value: 'بەها',
    valueCurrency: 'بەها بە دراوی فرۆشگا',
    minimumSubtotal: 'کەمترین کۆی داواکاری (ئارەزوومەندانە)',
    minimumSubtotalHint: 'ئەگەر سنوور نییە بەتاڵی بهێڵە.',
    starts: 'دەستپێک',
    ends: 'کۆتایی',
    datePlaceholder: 'YYYY/MM/DD',
    timePlaceholder: 'HH:mm',
    dateTimeFormat: 'فۆرماتی بەروار و کات: YYYY/MM/DD · HH:mm',
    localTime: 'ئەم کاتانە بە پێی ناوچەی کاتی هەڵگیراوی فرۆشگاکەت لێکدەدرێنەوە.',
    enabled: 'ئۆفەر چالاکە',
    save: 'پاشەکەوتکردنی ئۆفەر',
    saving: 'پاشەکەوت دەکرێت...',
    cancel: 'هەڵوەشاندنەوە',
    edit: 'دەستکاری',
    delete: 'سڕینەوە',
    deleteConfirm: 'دەتەوێت ئەم ئۆفەرە بسڕیتەوە؟',
    created: 'ئۆفەر دروستکرا.',
    updated: 'ئۆفەر نوێکرایەوە.',
    deleted: 'ئۆفەر سڕایەوە.',
    invalid: 'زانیارییەکانی ئۆفەر بپشکنە.',
    loadFailed: 'بارکردنی ئۆفەرەکان سەرکەوتوو نەبوو.',
    saveFailed: 'پاشەکەوتکردنی ئۆفەر سەرکەوتوو نەبوو.',
    scheduled: 'پلانکراو',
    active: 'ئێستا چالاکە',
    expired: 'کۆتایی هاتووە',
    disabled: 'وەستێنراوە',
    timezone: 'کاتی ئۆفەر',
    currency: 'دراوی فرۆشگا',
    originalSafe: 'نرخی بنەڕەتی ناگۆڕدرێت؛ فەوری تەنها لە ماوەی ئۆفەر نرخە کاریگەرەکە بەکاردێنێت.',
  },
  en: {
    title: 'Promotions',
    subtitle: 'Schedule temporary offers without overwriting the base price. Offers start and expire automatically in your store timezone.',
    add: 'Add promotion',
    loading: 'Loading promotions...',
    retry: 'Retry',
    empty: 'No promotions yet.',
    name: 'Promotion name',
    namePlaceholder: 'e.g. Weekend offer',
    scope: 'Promotion type',
    catalog: 'Product or service',
    delivery: 'Free delivery',
    item: 'Product or service',
    variant: 'Variant (optional)',
    allVariants: 'All variants / whole item',
    effect: 'Discount type',
    percentage: 'Percentage off',
    amountOff: 'Amount off',
    fixedPrice: 'Special price',
    value: 'Value',
    valueCurrency: 'Value in store currency',
    minimumSubtotal: 'Minimum order subtotal (optional)',
    minimumSubtotalHint: 'Leave empty for free delivery with no minimum.',
    starts: 'Starts',
    ends: 'Ends',
    datePlaceholder: 'YYYY/MM/DD',
    timePlaceholder: 'HH:mm',
    dateTimeFormat: 'Date and time format: YYYY/MM/DD · HH:mm',
    localTime: 'These times are interpreted in the timezone saved for your store.',
    enabled: 'Promotion enabled',
    save: 'Save promotion',
    saving: 'Saving...',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this promotion?',
    created: 'Promotion created.',
    updated: 'Promotion updated.',
    deleted: 'Promotion deleted.',
    invalid: 'Review the promotion fields.',
    loadFailed: 'Could not load promotions.',
    saveFailed: 'Could not save promotion.',
    scheduled: 'Scheduled',
    active: 'Active now',
    expired: 'Expired',
    disabled: 'Disabled',
    timezone: 'Promotion timezone',
    currency: 'Store currency',
    originalSafe: 'The base price is never overwritten; Fawri uses the effective price only during the promotion window.',
  },
};

function emptyDraft(): PromotionDraft {
  return {
    name: '',
    scope: 'catalog_item',
    product_id: '',
    variant_id: '',
    effect: 'percentage_off',
    value: '',
    minimum_subtotal: '',
    starts_date: '',
    starts_time: '',
    ends_date: '',
    ends_time: '',
    enabled: true,
  };
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function localParts(value: string): { date: string; time: string } {
  const local = value ? value.slice(0, 16) : '';
  const [date = '', time = ''] = local.split('T');
  return {
    date: date.replace(/-/g, '/'),
    time,
  };
}

function normalizeLocalDate(value: string): string | null {
  const normalized = normalizeDigits(value).trim().replace(/[.-]/g, '/');
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeLocalTime(value: string): string | null {
  const normalized = normalizeDigits(value).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function draftLocalDateTime(dateValue: string, timeValue: string): string | null {
  const date = normalizeLocalDate(dateValue);
  const time = normalizeLocalTime(timeValue);
  return date && time ? `${date}T${time}` : null;
}

function lifecycleClass(lifecycle: CatalogPromotion['lifecycle']): string {
  if (lifecycle === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (lifecycle === 'scheduled') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (lifecycle === 'expired') return 'border-zinc-200 bg-zinc-50 text-zinc-600';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function percentageBps(value: string): number | null {
  const bps = catalogMajorAmountToMinor(value, 2);
  return bps !== null && bps >= 1 && bps <= 10_000 ? bps : null;
}

function percentageText(value: number | undefined): string {
  if (!Number.isSafeInteger(value) || !value || value < 0) return '';
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function promotionValueText(
  promotion: CatalogPromotion,
  context: CatalogCommerceContext | null,
): string {
  const digits = context?.currency_fraction_digits ?? 0;
  const currency = promotion.currency_code || context?.currency_code || '';
  if (promotion.effect === 'percentage_off') {
    return `${percentageText(promotion.percentage_bps)}%`;
  }
  if (promotion.effect === 'free_delivery') {
    if (promotion.minimum_subtotal_minor === undefined) return '';
    return `≥ ${catalogMinorAmountToMajor(promotion.minimum_subtotal_minor, digits)} ${currency}`;
  }
  if (promotion.amount_minor === undefined) return '';
  const prefix = promotion.effect === 'fixed_amount_off' ? '− ' : '';
  return `${prefix}${catalogMinorAmountToMajor(promotion.amount_minor, digits)} ${currency}`;
}

export default function CatalogPromotionsPage() {
  const { lang, dir, isRTL } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const createKey = useRef<string | null>(null);
  const [context, setContext] = useState<CatalogCommerceContext | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [promotions, setPromotions] = useState<CatalogPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogPromotion | null>(null);
  const [draft, setDraft] = useState<PromotionDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadFailed(false);
      try {
        const [nextContext, nextProducts, nextPromotions] = await Promise.all([
          getCatalogCommerceContext(),
          listCatalogProducts(),
          listCatalogPromotions(),
        ]);
        if (!active) return;
        setContext(nextContext);
        setProducts(nextProducts);
        setPromotions(nextPromotions);
      } catch (error) {
        console.error('Promotion load failed:', error);
        if (active) {
          setLoadFailed(true);
          toast.error(copy.loadFailed);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [reload, copy.loadFailed]);

  const productMap = useMemo(
    () => new Map(products.map(product => [product.id, product])),
    [products],
  );
  const selectedProduct = productMap.get(draft.product_id);
  const currencyDigits = context?.currency_fraction_digits ?? 0;
  const currencyCode = context?.currency_code || '';
  const moneyStep = catalogCurrencyStep(currencyDigits);

  const openCreate = () => {
    if (!context) return;
    createKey.current = null;
    setEditing(null);
    setDraft(emptyDraft());
    setEditorOpen(true);
  };

  const openEdit = (promotion: CatalogPromotion) => {
    if (!context) return;
    const starts = localParts(promotion.starts_local);
    const ends = localParts(promotion.ends_local);
    createKey.current = null;
    setEditing(promotion);
    setDraft({
      name: promotion.name,
      scope: promotion.scope,
      product_id: promotion.product_id || '',
      variant_id: promotion.variant_id || '',
      effect: promotion.effect,
      value:
        promotion.effect === 'percentage_off'
          ? percentageText(promotion.percentage_bps)
          : promotion.amount_minor === undefined
            ? ''
            : catalogMinorAmountToMajor(
                promotion.amount_minor,
                context.currency_fraction_digits,
              ),
      minimum_subtotal:
        promotion.minimum_subtotal_minor === undefined
          ? ''
          : catalogMinorAmountToMajor(
              promotion.minimum_subtotal_minor,
              context.currency_fraction_digits,
            ),
      starts_date: starts.date,
      starts_time: starts.time,
      ends_date: ends.date,
      ends_time: ends.time,
      enabled: promotion.enabled,
    });
    setEditorOpen(true);
  };

  const closeEditor = (force = false) => {
    if (saving && !force) return;
    createKey.current = null;
    setEditing(null);
    setDraft(emptyDraft());
    setEditorOpen(false);
  };

  const promotionInput = (): CatalogPromotionInput | null => {
    if (!context) return null;
    const name = draft.name.trim();
    const startsLocal = draftLocalDateTime(draft.starts_date, draft.starts_time);
    const endsLocal = draftLocalDateTime(draft.ends_date, draft.ends_time);
    if (!name || !startsLocal || !endsLocal) return null;
    if (endsLocal <= startsLocal) return null;

    if (draft.scope === 'delivery') {
      const minimum = draft.minimum_subtotal.trim()
        ? catalogMajorAmountToMinor(
            draft.minimum_subtotal,
            context.currency_fraction_digits,
          )
        : null;
      if (draft.minimum_subtotal.trim() && (minimum === null || minimum < 0)) return null;
      return {
        name,
        scope: 'delivery',
        effect: 'free_delivery',
        product_id: undefined,
        variant_id: undefined,
        percentage_bps: null,
        amount_minor: null,
        minimum_subtotal_minor: minimum,
        starts_local: startsLocal,
        ends_local: endsLocal,
        priority: 0,
        enabled: draft.enabled,
      };
    }

    if (!draft.product_id) return null;
    if (
      draft.variant_id &&
      !selectedProduct?.variants.some(variant => variant.id === draft.variant_id)
    ) {
      return null;
    }

    if (draft.effect === 'percentage_off') {
      const bps = percentageBps(draft.value);
      if (bps === null) return null;
      return {
        name,
        scope: 'catalog_item',
        effect: 'percentage_off',
        product_id: draft.product_id,
        variant_id: draft.variant_id || undefined,
        percentage_bps: bps,
        amount_minor: null,
        minimum_subtotal_minor: null,
        starts_local: startsLocal,
        ends_local: endsLocal,
        priority: 0,
        enabled: draft.enabled,
      };
    }

    const amountMinor = catalogMajorAmountToMinor(
      draft.value,
      context.currency_fraction_digits,
    );
    if (amountMinor === null || amountMinor < 0) return null;
    if (draft.effect === 'fixed_amount_off' && amountMinor <= 0) return null;
    return {
      name,
      scope: 'catalog_item',
      effect: draft.effect,
      product_id: draft.product_id,
      variant_id: draft.variant_id || undefined,
      percentage_bps: null,
      amount_minor: amountMinor,
      minimum_subtotal_minor: null,
      starts_local: startsLocal,
      ends_local: endsLocal,
      priority: 0,
      enabled: draft.enabled,
    };
  };

  const save = async () => {
    if (saving) return;
    const input = promotionInput();
    if (!input) {
      toast.error(copy.invalid);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateCatalogPromotion(
          editing.id,
          editing.version,
          input,
        );
        setPromotions(current =>
          current.map(item => (item.id === updated.id ? updated : item)),
        );
        toast.success(copy.updated);
      } else {
        const key =
          createKey.current ||
          createStrongIdempotencyKey('catalog-promotion-create');
        createKey.current = key;
        const result = await createCatalogPromotion(input, key);
        createKey.current = null;
        setPromotions(current => [
          result.promotion,
          ...current.filter(item => item.id !== result.promotion.id),
        ]);
        toast.success(copy.created);
      }
      setSaving(false);
      closeEditor(true);
    } catch (error) {
      console.error('Promotion save failed:', error);
      if (
        error instanceof CatalogPromotionApiError &&
        error.code === 'COMMERCE_PROMOTION_IDEMPOTENCY_CONFLICT'
      ) {
        createKey.current = null;
      }
      toast.error(
        error instanceof CatalogPromotionApiError
          ? `${copy.saveFailed} (${error.code})`
          : copy.saveFailed,
      );
      setSaving(false);
    }
  };

  const remove = async (promotion: CatalogPromotion) => {
    if (!window.confirm(copy.deleteConfirm)) return;
    try {
      await deleteCatalogPromotion(promotion.id, promotion.version);
      setPromotions(current => current.filter(item => item.id !== promotion.id));
      toast.success(copy.deleted);
    } catch (error) {
      toast.error(
        error instanceof CatalogPromotionApiError
          ? `${copy.saveFailed} (${error.code})`
          : copy.saveFailed,
      );
    }
  };

  const lifecycleLabel = (promotion: CatalogPromotion) => copy[promotion.lifecycle];

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className={isRTL ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-extrabold tracking-tight">{copy.title}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {copy.subtitle}
          </p>
          <p className="mt-2 max-w-3xl rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-900">
            {copy.originalSafe}
          </p>
          {context && (
            <p className="mt-2 text-xs text-muted-foreground">
              {copy.currency}: <span dir="ltr">{context.currency_code}</span>
              {' · '}
              {copy.timezone}: <span dir="ltr">{context.timezone}</span>
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={openCreate}
          disabled={!context || loading}
          className="h-11 rounded-xl bg-orange-500 px-4 font-bold text-white hover:bg-orange-600"
        >
          <Plus className={isRTL ? 'ml-2 h-4 w-4' : 'mr-2 h-4 w-4'} />
          {copy.add}
        </Button>
      </header>

      {loading ? (
        <div className="rounded-3xl border bg-card p-10 text-center text-muted-foreground">
          {copy.loading}
        </div>
      ) : loadFailed ? (
        <div className="rounded-3xl border bg-card p-10 text-center">
          <p className="text-destructive">{copy.loadFailed}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 rounded-xl"
            onClick={() => setReload(value => value + 1)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {copy.retry}
          </Button>
        </div>
      ) : promotions.length === 0 ? (
        <div className="rounded-3xl border bg-card p-10 text-center text-muted-foreground">
          {copy.empty}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {promotions.map(promotion => {
            const product = promotion.product_id
              ? productMap.get(promotion.product_id)
              : undefined;
            const variant = promotion.variant_id
              ? product?.variants.find(item => item.id === promotion.variant_id)
              : undefined;
            const valueText = promotionValueText(promotion, context);
            return (
              <article
                key={promotion.id}
                className="rounded-3xl border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={`rounded-full ${lifecycleClass(promotion.lifecycle)}`}
                      >
                        {lifecycleLabel(promotion)}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {promotion.scope === 'delivery' ? (
                          <Truck className="mr-1 h-3 w-3" />
                        ) : (
                          <Tag className="mr-1 h-3 w-3" />
                        )}
                        {promotion.scope === 'delivery' ? copy.delivery : copy.catalog}
                      </Badge>
                    </div>
                    <h2 className="text-lg font-extrabold">{promotion.name}</h2>
                    {promotion.scope === 'catalog_item' && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {product?.name || promotion.product_id}
                        {variant ? ` — ${variant.name}` : ''}
                      </p>
                    )}
                    {valueText && (
                      <p className="mt-2 text-base font-extrabold text-orange-600" dir="ltr">
                        {valueText}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-xl"
                      title={copy.edit}
                      onClick={() => openEdit(promotion)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl text-destructive"
                      title={copy.delete}
                      onClick={() => void remove(promotion)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-muted/30 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <CalendarClock className="h-4 w-4" />
                      {copy.starts}
                    </div>
                    <div dir="ltr" className={isRTL ? 'text-right' : 'text-left'}>
                      {promotion.starts_local.replace('T', ' ')}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-muted/30 p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2 font-semibold">
                      <CalendarClock className="h-4 w-4" />
                      {copy.ends}
                    </div>
                    <div dir="ltr" className={isRTL ? 'text-right' : 'text-left'}>
                      {promotion.ends_local.replace('T', ' ')}
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {copy.timezone}: <span dir="ltr">{promotion.schedule_timezone}</span>
                </p>
              </article>
            );
          })}
        </div>
      )}

      {editorOpen && context && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 px-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-[2px] md:items-center md:px-4 md:py-6">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-background shadow-2xl md:max-h-[calc(100dvh-4rem)]">
            <div className="shrink-0 border-b px-5 py-4">
              <h2 className="text-xl font-extrabold">
                {editing ? copy.edit : copy.add}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                <span dir="ltr">{currencyCode}</span>
                {' · '}
                <span dir="ltr">{context.timezone}</span>
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <label className="space-y-1 text-sm font-semibold">
                <span>{copy.name}</span>
                <Input
                  value={draft.name}
                  onChange={event =>
                    setDraft(current => ({ ...current, name: event.target.value }))
                  }
                  placeholder={copy.namePlaceholder}
                  className="h-11 rounded-xl"
                />
              </label>

              <label className="space-y-1 text-sm font-semibold">
                <span>{copy.scope}</span>
                <select
                  value={draft.scope}
                  onChange={event => {
                    const scope = event.target.value as CatalogPromotionScope;
                    setDraft(current => ({
                      ...current,
                      scope,
                      effect:
                        scope === 'delivery'
                          ? 'free_delivery'
                          : current.effect === 'free_delivery'
                            ? 'percentage_off'
                            : current.effect,
                      product_id: scope === 'delivery' ? '' : current.product_id,
                      variant_id: scope === 'delivery' ? '' : current.variant_id,
                      value: scope === 'delivery' ? '' : current.value,
                    }));
                  }}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3"
                >
                  <option value="catalog_item">{copy.catalog}</option>
                  <option value="delivery">{copy.delivery}</option>
                </select>
              </label>

              {draft.scope === 'catalog_item' ? (
                <>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>{copy.item}</span>
                    <select
                      value={draft.product_id}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          product_id: event.target.value,
                          variant_id: '',
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-input bg-background px-3"
                    >
                      <option value="">—</option>
                      {products.map(product => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedProduct && selectedProduct.variants.length > 0 && (
                    <label className="space-y-1 text-sm font-semibold">
                      <span>{copy.variant}</span>
                      <select
                        value={draft.variant_id}
                        onChange={event =>
                          setDraft(current => ({
                            ...current,
                            variant_id: event.target.value,
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-input bg-background px-3"
                      >
                        <option value="">{copy.allVariants}</option>
                        {selectedProduct.variants.map(variant => (
                          <option key={variant.id} value={variant.id}>
                            {variant.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="space-y-1 text-sm font-semibold">
                    <span>{copy.effect}</span>
                    <select
                      value={draft.effect}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          effect: event.target.value as CatalogPromotionEffect,
                          value: '',
                        }))
                      }
                      className="h-11 w-full rounded-xl border border-input bg-background px-3"
                    >
                      <option value="percentage_off">{copy.percentage}</option>
                      <option value="fixed_amount_off">{copy.amountOff}</option>
                      <option value="fixed_price">{copy.fixedPrice}</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm font-semibold">
                    <span>
                      {draft.effect === 'percentage_off'
                        ? `${copy.value} (%)`
                        : `${copy.valueCurrency} (${currencyCode})`}
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      value={draft.value}
                      onChange={event =>
                        setDraft(current => ({ ...current, value: event.target.value }))
                      }
                      placeholder={
                        draft.effect === 'percentage_off'
                          ? '10'
                          : currencyDigits > 0
                            ? `0.${'0'.repeat(currencyDigits)}`
                            : '0'
                      }
                      className="h-11 rounded-xl"
                    />
                    <span className="block text-xs font-normal text-muted-foreground" dir="ltr">
                      {draft.effect === 'percentage_off' ? '0.01% – 100%' : `${currencyCode} · step ${moneyStep}`}
                    </span>
                  </label>
                </>
              ) : (
                <label className="space-y-1 text-sm font-semibold">
                  <span>
                    {copy.minimumSubtotal} ({currencyCode})
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={draft.minimum_subtotal}
                    onChange={event =>
                      setDraft(current => ({
                        ...current,
                        minimum_subtotal: event.target.value,
                      }))
                    }
                    className="h-11 rounded-xl"
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    {copy.minimumSubtotalHint}
                  </span>
                </label>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-semibold">
                  <span>{copy.starts}</span>
                  <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,.85fr)] gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={draft.starts_date}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          starts_date: event.target.value,
                        }))
                      }
                      placeholder={copy.datePlaceholder}
                      maxLength={10}
                      className="h-11 rounded-xl"
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={draft.starts_time}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          starts_time: event.target.value,
                        }))
                      }
                      placeholder={copy.timePlaceholder}
                      maxLength={5}
                      className="h-11 rounded-xl"
                    />
                  </div>
                </label>
                <label className="space-y-1 text-sm font-semibold">
                  <span>{copy.ends}</span>
                  <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,.85fr)] gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={draft.ends_date}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          ends_date: event.target.value,
                        }))
                      }
                      placeholder={copy.datePlaceholder}
                      maxLength={10}
                      className="h-11 rounded-xl"
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={draft.ends_time}
                      onChange={event =>
                        setDraft(current => ({
                          ...current,
                          ends_time: event.target.value,
                        }))
                      }
                      placeholder={copy.timePlaceholder}
                      maxLength={5}
                      className="h-11 rounded-xl"
                    />
                  </div>
                </label>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {copy.dateTimeFormat}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {copy.localTime} <span dir="ltr">({context.timezone})</span>
              </p>

              <label className="flex items-center gap-3 rounded-2xl border p-4 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={event =>
                    setDraft(current => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  className="h-5 w-5 shrink-0 accent-orange-500"
                />
                <span>{copy.enabled}</span>
              </label>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-3 border-t px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                disabled={saving}
                onClick={() => closeEditor()}
              >
                {copy.cancel}
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl bg-orange-500 font-bold text-white hover:bg-orange-600"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? copy.saving : copy.save}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
