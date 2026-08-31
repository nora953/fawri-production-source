import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  Eye,
  Image as ImageIcon,
  Minus,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import { CatalogEditorShell } from '@/components/catalog/CatalogEditorShell';
import { CatalogImageUploadEditor } from '@/components/catalog/CatalogImageUploadEditor';
import { CatalogItemTypeEditor } from '@/components/catalog/CatalogItemTypeEditor';
import { CatalogProductDetailsEditor } from '@/components/catalog/CatalogProductDetailsEditor';
import { CatalogProtectedImage } from '@/components/catalog/CatalogProtectedImage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  adjustCatalogInventory,
  CatalogApiError,
  createCatalogProduct,
  createStrongIdempotencyKey,
  deleteCatalogProduct,
  getCatalogProduct,
  idempotencyAttemptForRequest,
  listCatalogProducts,
  setCatalogInventory,
  updateCatalogProduct,
  type CatalogIdempotencyAttempt,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogVariant,
} from '@/lib/catalogUiApi';
import {
  catalogMoneyFormForAuthority,
  catalogMoneyFormForDisplay,
  validateCatalogMoneyForm,
} from '@/lib/catalogMoneyFormAdapter';
import {
  catalogCurrencyStep,
  getCatalogCommerceContext,
  type CatalogCommerceContext,
} from '@/lib/catalogPromotionUiApi';
import { subscribeCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';
import {
  catalogProductFormFromProduct,
  catalogProductInputFromForm,
  createEmptyCatalogProductForm,
  validateCatalogProductForm,
  variantOptionSummary,
  type CatalogProductFormState,
} from '@/lib/catalogProductEditor';
import { useI18n } from '@/lib/i18n';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import type { Lang, ProductStatus } from '@/lib/types';

type PageCopy = {
  title: string;
  subtitle: string;
  add: string;
  import: string;
  search: string;
  all: string;
  products: string;
  services: string;
  product: string;
  service: string;
  noItems: string;
  noItemsHint: string;
  loading: string;
  retry: string;
  loadFailed: string;
  saveFailed: string;
  saved: string;
  updated: string;
  deleted: string;
  deleteConfirm: string;
  versionConflict: string;
  secureCrypto: string;
  invalidName: string;
  invalidPrice: string;
  invalidQuantity: string;
  invalidForm: string;
  name: string;
  namePlaceholder: string;
  category: string;
  categoryPlaceholder: string;
  basePrice: string;
  basePriceHint: string;
  price: string;
  freePrice: string;
  customPrice: string;
  quantity: string;
  inventoryNotTracked: string;
  duration: string;
  booking: string;
  bookingRequired: string;
  bookingOptional: string;
  description: string;
  descriptionPlaceholder: string;
  descriptionMissing: string;
  details: string;
  detailsTitle: string;
  variants: string;
  fawri: string;
  fawriHint: string;
  inventory: string;
  inventorySet: string;
  inventorySaved: string;
  inventoryFailed: string;
  inventoryDetails: string;
  hideInventoryDetails: string;
  variantDetails: string;
  hideVariantDetails: string;
  save: string;
  saving: string;
  edit: string;
  create: string;
  available: string;
  lowStock: string;
  inventoryOut: string;
  unavailable: string;
  draft: string;
  hidden: string;
  remaining: string;
  units: string;
  someVariantsOut: string;
  minute: string;
  sku: string;
  skuHint: string;
  availableForSale: string;
  availableForSaleHint: string;
};

const COPY: Record<Lang, PageCopy> = {
  ar: {
    title: 'المنتجات والخدمات',
    subtitle: 'أضف معلومات العنصر مرة واحدة، ويتولى فوري حساب حالة المخزون واستخدامها في الكاشير والردود.',
    add: 'إضافة منتج أو خدمة',
    import: 'استيراد المنتجات',
    search: 'ابحث بالاسم أو القسم أو SKU أو الباركود...',
    all: 'الكل',
    products: 'المنتجات',
    services: 'الخدمات',
    product: 'منتج',
    service: 'خدمة',
    noItems: 'لا توجد عناصر بعد',
    noItemsHint: 'أضف أول منتج أو خدمة ليبدأ فوري باستخدام بيانات الكتالوج الموثوقة.',
    loading: 'جارٍ تحميل الكتالوج...',
    retry: 'إعادة المحاولة',
    loadFailed: 'تعذر تحميل الكتالوج من الخادم.',
    saveFailed: 'تعذر حفظ العنصر.',
    saved: 'تمت إضافة العنصر.',
    updated: 'تم تحديث العنصر.',
    deleted: 'تم حذف العنصر.',
    deleteConfirm: 'هل تريد حذف هذا العنصر؟',
    versionConflict: 'تم تعديل هذا العنصر من مكان آخر. حمّلنا أحدث نسخة؛ راجعها ثم احفظ مجددًا.',
    secureCrypto: 'تعذر إنشاء رمز آمن للعملية.',
    invalidName: 'أدخل اسمًا صحيحًا.',
    invalidPrice: 'راجع السعر الأساسي.',
    invalidQuantity: 'راجع كمية المخزون.',
    invalidForm: 'راجع حقول العنصر قبل الحفظ.',
    name: 'الاسم',
    namePlaceholder: 'اسم المنتج أو الخدمة',
    category: 'القسم',
    categoryPlaceholder: 'مثال: إلكترونيات، عناية، خدمات منزلية',
    basePrice: 'السعر الأساسي',
    basePriceHint: 'هذا هو السعر الطبيعي للعنصر. أنشئ الخصومات المؤقتة من تبويب العروض.',
    price: 'السعر',
    freePrice: 'مجاني',
    customPrice: 'حسب الطلب',
    quantity: 'المخزون',
    inventoryNotTracked: 'غير متابع',
    duration: 'المدة',
    booking: 'الحجز',
    bookingRequired: 'مطلوب',
    bookingOptional: 'غير مطلوب',
    description: 'الوصف',
    descriptionPlaceholder: 'معلومات واضحة يمكن لفوري الاعتماد عليها عند الرد على العميل.',
    descriptionMissing: 'لا يوجد وصف مضاف لهذا العنصر.',
    details: 'التفاصيل',
    detailsTitle: 'تفاصيل المنتج',
    variants: 'الأنواع',
    fawri: 'استخدام هذا العنصر في ردود فوري',
    fawriHint: 'عند الإيقاف يبقى العنصر في الكتالوج والكاشير، لكن فوري لا يستخدم معلوماته في الردود الآلية.',
    inventory: 'إدارة المخزون',
    inventorySet: 'تعيين',
    inventorySaved: 'تم تحديث المخزون.',
    inventoryFailed: 'تعذر تحديث المخزون.',
    inventoryDetails: 'تفاصيل المخزون',
    hideInventoryDetails: 'إخفاء المخزون',
    variantDetails: 'تفاصيل الأنواع',
    hideVariantDetails: 'إخفاء الأنواع',
    save: 'حفظ',
    saving: 'جارٍ الحفظ...',
    edit: 'تعديل المنتج أو الخدمة',
    create: 'إضافة منتج أو خدمة',
    available: 'متوفر',
    lowStock: 'مخزون منخفض',
    inventoryOut: 'نفد المخزون',
    unavailable: 'غير متوفر',
    draft: 'مسودة',
    hidden: 'مخفي عن فوري',
    remaining: 'بقي',
    units: 'قطعة',
    someVariantsOut: 'بعض الأنواع نفدت',
    minute: 'دقيقة',
    sku: 'رمز العنصر (SKU)',
    skuHint: 'يولّد فوري رمزًا فريدًا تلقائيًا. يمكنك تغييره قبل الحفظ.',
    availableForSale: 'متاح للبيع',
    availableForSaleHint: 'يظهر هذا الخيار فقط عندما لا يعتمد توفر العنصر على كمية مخزون مسجلة.',
  },
  ku: {
    title: 'بەرهەم و خزمەتگوزارییەکان',
    subtitle: 'زانیاریی بابەتەکە جارێک زیاد بکە؛ فەوری دۆخی کۆگا خۆکار هەژمار دەکات و لە کاشێر و وەڵامەکان بەکاری دەهێنێت.',
    add: 'زیادکردنی بەرهەم یان خزمەتگوزاری',
    import: 'هاوردەکردنی بەرهەم',
    search: 'گەڕان بە ناو، بەش، SKU یان بارکۆد...',
    all: 'هەموو',
    products: 'بەرهەمەکان',
    services: 'خزمەتگوزارییەکان',
    product: 'بەرهەم',
    service: 'خزمەتگوزاری',
    noItems: 'هیچ بابەتێک نییە',
    noItemsHint: 'یەکەم بەرهەم یان خزمەتگوزاری زیاد بکە.',
    loading: 'کەتەلۆگ بار دەکرێت...',
    retry: 'دووبارە هەوڵدانەوە',
    loadFailed: 'بارکردنی کەتەلۆگ سەرکەوتوو نەبوو.',
    saveFailed: 'پاشەکەوتکردنی بابەت سەرکەوتوو نەبوو.',
    saved: 'بابەت زیادکرا.',
    updated: 'بابەت نوێکرایەوە.',
    deleted: 'بابەت سڕایەوە.',
    deleteConfirm: 'دەتەوێت ئەم بابەتە بسڕیتەوە؟',
    versionConflict: 'ئەم بابەتە لە شوێنێکی تر گۆڕدراوە. نوێترین وەشان بارکرا.',
    secureCrypto: 'دروستکردنی ناسنامەی پارێزراو سەرکەوتوو نەبوو.',
    invalidName: 'ناوێکی دروست بنووسە.',
    invalidPrice: 'نرخی بنەڕەتی بپشکنە.',
    invalidQuantity: 'بڕی کۆگا بپشکنە.',
    invalidForm: 'خانەکان پێش پاشەکەوتکردن بپشکنە.',
    name: 'ناو',
    namePlaceholder: 'ناوی بەرهەم یان خزمەتگوزاری',
    category: 'بەش',
    categoryPlaceholder: 'نموونە: ئەلیکترۆنیات، خزمەتگوزاری',
    basePrice: 'نرخی بنەڕەتی',
    basePriceHint: 'ئەمە نرخی ئاسایی بابەتەکەیە. داشکاندنی کاتی لە بەشی ئۆفەرەکان دروست بکە.',
    price: 'نرخ',
    freePrice: 'بەخۆڕایی',
    customPrice: 'بەپێی داواکاری',
    quantity: 'کۆگا',
    inventoryNotTracked: 'بەدواداچوون ناکرێت',
    duration: 'ماوە',
    booking: 'حجز',
    bookingRequired: 'پێویستە',
    bookingOptional: 'پێویست نییە',
    description: 'وەسف',
    descriptionPlaceholder: 'زانیارییەکی ڕوون کە فەوری بتوانێت پشتی پێ ببەستێت.',
    descriptionMissing: 'هیچ وەسفێک بۆ ئەم بابەتە زیاد نەکراوە.',
    details: 'وردەکاری',
    detailsTitle: 'وردەکاری بەرهەم',
    variants: 'جۆرەکان',
    fawri: 'بەکارهێنانی ئەم بابەتە لە وەڵامەکانی فەوری',
    fawriHint: 'کاتێک ناچالاکە، بابەتەکە لە کەتەلۆگ و کاشێر دەمێنێتەوە بەڵام فەوری لە وەڵامە ئۆتۆماتیکییەکان بەکاری ناهێنێت.',
    inventory: 'بەڕێوەبردنی کۆگا',
    inventorySet: 'دانان',
    inventorySaved: 'کۆگا نوێکرایەوە.',
    inventoryFailed: 'نوێکردنەوەی کۆگا سەرکەوتوو نەبوو.',
    inventoryDetails: 'وردەکاری کۆگا',
    hideInventoryDetails: 'شاردنەوەی کۆگا',
    variantDetails: 'وردەکاری جۆرەکان',
    hideVariantDetails: 'شاردنەوەی جۆرەکان',
    save: 'پاشەکەوتکردن',
    saving: 'پاشەکەوت دەکرێت...',
    edit: 'دەستکاری بەرهەم یان خزمەتگوزاری',
    create: 'زیادکردنی بەرهەم یان خزمەتگوزاری',
    available: 'بەردەست',
    lowStock: 'کۆگای کەم',
    inventoryOut: 'کۆگا تەواو بوو',
    unavailable: 'بەردەست نییە',
    draft: 'ڕەشنووس',
    hidden: 'لە فەوری شاردراوەتەوە',
    remaining: 'ماوە',
    units: 'دانە',
    someVariantsOut: 'هەندێک جۆر تەواو بوون',
    minute: 'خولەک',
    sku: 'کۆدی بابەت (SKU)',
    skuHint: 'فەوری کۆدێکی تاک خۆکار دروست دەکات. پێش پاشەکەوتکردن دەتوانیت بیگۆڕیت.',
    availableForSale: 'بۆ فرۆشتن بەردەستە',
    availableForSaleHint: 'تەنها کاتێک دەردەکەوێت کە بەردەستبوون بە بڕی کۆگای تۆمارکراو نەبەستراوە.',
  },
  en: {
    title: 'Products & Services',
    subtitle: 'Enter item details once; Fawri calculates inventory status automatically and uses it across cashier and replies.',
    add: 'Add product or service',
    import: 'Import products',
    search: 'Search by name, category, SKU, or barcode...',
    all: 'All',
    products: 'Products',
    services: 'Services',
    product: 'Product',
    service: 'Service',
    noItems: 'No catalog items yet',
    noItemsHint: 'Add your first product or service so Fawri can use trusted catalog facts.',
    loading: 'Loading catalog...',
    retry: 'Retry',
    loadFailed: 'Could not load the catalog from the server.',
    saveFailed: 'Could not save the item.',
    saved: 'Item added.',
    updated: 'Item updated.',
    deleted: 'Item deleted.',
    deleteConfirm: 'Delete this catalog item?',
    versionConflict: 'This item changed elsewhere. The latest server version was loaded; review it and save again.',
    secureCrypto: 'Could not create a secure operation identifier.',
    invalidName: 'Enter a valid name.',
    invalidPrice: 'Review the base price.',
    invalidQuantity: 'Review inventory quantity.',
    invalidForm: 'Review the item fields before saving.',
    name: 'Name',
    namePlaceholder: 'Product or service name',
    category: 'Category',
    categoryPlaceholder: 'e.g. Electronics, Beauty, Home services',
    basePrice: 'Base price',
    basePriceHint: 'This is the normal item price. Create temporary discounts from the Promotions tab.',
    price: 'Price',
    freePrice: 'Free',
    customPrice: 'On request',
    quantity: 'Inventory',
    inventoryNotTracked: 'Not tracked',
    duration: 'Duration',
    booking: 'Booking',
    bookingRequired: 'Required',
    bookingOptional: 'Not required',
    description: 'Description',
    descriptionPlaceholder: 'Clear information Fawri can rely on when answering customers.',
    descriptionMissing: 'No description has been added for this item.',
    details: 'Details',
    detailsTitle: 'Product details',
    variants: 'Variants',
    fawri: 'Use this item in Fawri replies',
    fawriHint: 'When disabled, the item stays in catalog and cashier, but Fawri will not use it in automated replies.',
    inventory: 'Inventory management',
    inventorySet: 'Set',
    inventorySaved: 'Inventory updated.',
    inventoryFailed: 'Could not update inventory.',
    inventoryDetails: 'Inventory details',
    hideInventoryDetails: 'Hide inventory',
    variantDetails: 'Variant details',
    hideVariantDetails: 'Hide variants',
    save: 'Save',
    saving: 'Saving...',
    edit: 'Edit product or service',
    create: 'Add product or service',
    available: 'Available',
    lowStock: 'Low stock',
    inventoryOut: 'Out of stock',
    unavailable: 'Unavailable',
    draft: 'Draft',
    hidden: 'Hidden from Fawri',
    remaining: 'left',
    units: 'units',
    someVariantsOut: 'Some variants are out',
    minute: 'min',
    sku: 'Item code (SKU)',
    skuHint: 'Fawri creates a unique code automatically. You can change it before saving.',
    availableForSale: 'Available for sale',
    availableForSaleHint: 'Shown only when availability is not driven by a tracked inventory quantity.',
  },
};

function statusClass(status: ProductStatus): string {
  if (status === 'available') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'low_stock') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'out_of_stock') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'draft') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-zinc-200 bg-zinc-50 text-zinc-700';
}

function itemType(product: CatalogProduct): 'product' | 'service' {
  return product.item_type === 'service' ? 'service' : 'product';
}

function tracksInventory(product: CatalogProduct): boolean {
  return itemType(product) === 'product' && product.track_inventory !== false;
}

function inventoryKey(productId: string, variantId?: string): string {
  return `${productId}:${variantId || 'product'}`;
}

function upsert(items: CatalogProduct[], product: CatalogProduct): CatalogProduct[] {
  const found = items.some(item => item.id === product.id);
  return found ? items.map(item => (item.id === product.id ? product : item)) : [product, ...items];
}

function automaticSku(): string {
  const secureKey = createStrongIdempotencyKey('catalog-sku');
  const token = secureKey.slice('catalog-sku-'.length).replaceAll('-', '').toUpperCase();
  return `FWR-${token}`;
}

function itemStatusLabel(product: CatalogProduct, copy: PageCopy): string {
  if (product.status === 'draft') return copy.draft;
  if (product.status === 'hidden_from_fawri') return copy.hidden;
  if (!tracksInventory(product)) {
    return product.status === 'out_of_stock' ? copy.unavailable : copy.available;
  }
  if (product.status === 'out_of_stock') return copy.inventoryOut;
  if (product.status === 'low_stock') {
    return `${copy.lowStock} · ${copy.remaining} ${product.stock_quantity.toLocaleString('en-US')} ${copy.units}`;
  }
  return `${copy.available} · ${product.stock_quantity.toLocaleString('en-US')} ${copy.units}`;
}

function itemStatusShortLabel(product: CatalogProduct, copy: PageCopy): string {
  if (product.status === 'draft') return copy.draft;
  if (product.status === 'hidden_from_fawri') return copy.hidden;
  if (!tracksInventory(product)) return product.status === 'out_of_stock' ? copy.unavailable : copy.available;
  if (product.status === 'out_of_stock') return copy.inventoryOut;
  if (product.status === 'low_stock') return copy.lowStock;
  return copy.available;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-zinc-300'}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[inset] ${checked ? 'end-1' : 'start-1'}`} />
    </button>
  );
}

function InventoryControl({ copy, product, variant, value, busy, onValue, onSet, onAdjust }: {
  copy: PageCopy;
  product: CatalogProduct;
  variant?: CatalogVariant;
  value: string;
  busy: boolean;
  onValue: (value: string) => void;
  onSet: () => void;
  onAdjust: (delta: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold">{variant?.name || product.name}</p>
          {variant && variantOptionSummary(variant) && <p className="text-xs text-muted-foreground" dir="auto">{variantOptionSummary(variant)}</p>}
        </div>
        <Badge variant="outline" className="rounded-full">{variant?.stock_quantity ?? product.stock_quantity}</Badge>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2">
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-xl" disabled={busy} onClick={() => onAdjust(-1)}><Minus className="h-4 w-4" /></Button>
        <Input type="number" min={0} dir="ltr" value={value} disabled={busy} onChange={event => onValue(event.target.value)} className="h-10 rounded-xl" />
        <Button type="button" variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={onSet}>{copy.inventorySet}</Button>
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-xl" disabled={busy} onClick={() => onAdjust(1)}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export default function CommerceCatalogSimplifiedPage() {
  const { lang, dir, isRTL } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const fawriBrand = lang === 'ar' ? 'فوري' : lang === 'ku' ? 'فەوری' : 'Fawri';

  const createAttempt = useRef<CatalogIdempotencyAttempt | null>(null);
  const inventoryAttempt = useRef<CatalogIdempotencyAttempt | null>(null);
  const pendingCashierRefresh = useRef(false);
  const loadedOnce = useRef(false);
  const loadFailedRef = useRef(copy.loadFailed);
  loadFailedRef.current = copy.loadFailed;

  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [commerceContext, setCommerceContext] = useState<CatalogCommerceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorityReady, setAuthorityReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'product' | 'service'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CatalogProductFormState>(() => createEmptyCatalogProductForm());
  const [saving, setSaving] = useState(false);
  const [inventoryValues, setInventoryValues] = useState<Record<string, string>>({});
  const [inventoryBusy, setInventoryBusy] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailsProductId, setDetailsProductId] = useState<string | null>(null);
  const mutationBusy = saving || inventoryBusy !== null || deletingId !== null;

  const fractionDigits = commerceContext?.currency_fraction_digits ?? 0;
  const moneyStep = catalogCurrencyStep(fractionDigits);
  const priceExample = fractionDigits > 0
    ? (lang === 'ar' ? 'مثال: 19.99' : lang === 'ku' ? 'نموونە: 19.99' : 'e.g. 19.99')
    : (lang === 'ar' ? 'مثال: 15000' : lang === 'ku' ? 'نموونە: 15000' : 'e.g. 15000');

  const syncInventory = (product: CatalogProduct) => {
    if (!tracksInventory(product)) return;
    setInventoryValues(current => {
      const next = { ...current };
      if (product.variants.length > 0) {
        for (const variant of product.variants) next[inventoryKey(product.id, variant.id)] = String(variant.stock_quantity);
        delete next[inventoryKey(product.id)];
      } else {
        next[inventoryKey(product.id)] = String(product.stock_quantity);
      }
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    async function load() {
      setAuthorityReady(false);
      if (!loadedOnce.current) setLoading(true);
      setLoadError(false);
      try {
        const [loaded, context] = await Promise.all([
          listCatalogProducts(),
          getCatalogCommerceContext(),
        ]);
        if (!active) return;
        setItems(loaded);
        setCommerceContext(context);
        const drafts: Record<string, string> = {};
        for (const product of loaded) {
          if (!tracksInventory(product)) continue;
          if (product.variants.length > 0) {
            for (const variant of product.variants) drafts[inventoryKey(product.id, variant.id)] = String(variant.stock_quantity);
          } else {
            drafts[inventoryKey(product.id)] = String(product.stock_quantity);
          }
        }
        setInventoryValues(drafts);
        setAuthorityReady(true);
      } catch (error) {
        console.error('Catalog load failed:', error);
        if (active) {
          setAuthorityReady(false);
          setCommerceContext(null);
          setLoadError(true);
          toast.error(loadFailedRef.current);
        }
      } finally {
        if (active) {
          loadedOnce.current = true;
          setLoading(false);
        }
      }
    }
    void load();
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    return subscribeCashierDashboardRefresh(() => {
      if (formOpen || mutationBusy || !authorityReady) {
        pendingCashierRefresh.current = true;
        return;
      }
      setReload(value => value + 1);
    });
  }, [formOpen, mutationBusy, authorityReady]);

  useEffect(() => {
    if (formOpen || mutationBusy || !authorityReady || !pendingCashierRefresh.current) return;
    pendingCashierRefresh.current = false;
    setReload(value => value + 1);
  }, [formOpen, mutationBusy, authorityReady]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter(product => {
      const type = itemType(product);
      if (filter !== 'all' && type !== filter) return false;
      if (!needle) return true;
      const values = [
        product.name,
        product.category,
        product.external_ref,
        product.sku,
        product.barcode,
        ...product.variants.flatMap(variant => [
          variant.name,
          variant.sku,
          variant.barcode,
          ...Object.values(variant.options),
        ]),
      ];
      return values.filter(Boolean).some(value => String(value).toLocaleLowerCase().includes(needle));
    });
  }, [items, filter, query]);

  const detailsProduct = detailsProductId
    ? items.find(product => product.id === detailsProductId) ?? null
    : null;

  const freshForm = (): CatalogProductFormState => {
    const next = createEmptyCatalogProductForm();
    next.sku = automaticSku();
    next.original_price = '';
    next.status = 'available';
    return next;
  };

  const normalizeEditorForm = (product: CatalogProduct): CatalogProductFormState => {
    if (!commerceContext) return catalogProductFormFromProduct(product);
    const next = catalogMoneyFormForDisplay(
      catalogProductFormFromProduct(product),
      commerceContext.currency_fraction_digits,
    );
    next.original_price = '';
    if (!next.sku.trim()) next.sku = automaticSku();
    if (next.status === 'hidden_from_fawri') {
      next.allow_fawri_reply = false;
      next.status = 'available';
    } else if (next.status === 'draft') {
      next.status = 'available';
    }
    if (next.item_type === 'service' && next.status === 'low_stock') next.status = 'available';
    return next;
  };

  const openCreate = () => {
    if (!authorityReady || !commerceContext) {
      toast.error(copy.loadFailed);
      return;
    }
    if (mutationBusy) return;
    createAttempt.current = null;
    setEditingId(null);
    try {
      setForm(freshForm());
      setFormOpen(true);
    } catch {
      toast.error(copy.secureCrypto);
    }
  };

  const openEdit = (product: CatalogProduct) => {
    if (!authorityReady || !commerceContext) {
      toast.error(copy.loadFailed);
      return;
    }
    if (mutationBusy) return;
    createAttempt.current = null;
    setEditingId(product.id);
    try {
      setForm(normalizeEditorForm(product));
      setFormOpen(true);
    } catch {
      toast.error(copy.secureCrypto);
    }
  };

  const closeForm = (force = false) => {
    if (saving && !force) return;
    createAttempt.current = null;
    setEditingId(null);
    setForm(createEmptyCatalogProductForm());
    setFormOpen(false);
  };

  const patchForm = (patch: Partial<CatalogProductFormState>) => setForm(current => ({ ...current, ...patch }));

  const validate = (): CatalogProductFormState | null => {
    if (!authorityReady || !commerceContext) {
      toast.error(copy.loadFailed);
      return null;
    }

    let resolvedSku = form.sku.trim();
    if (!resolvedSku) {
      try {
        resolvedSku = automaticSku();
      } catch {
        toast.error(copy.secureCrypto);
        return null;
      }
    }

    const simplifiedStatus: ProductStatus =
      form.item_type === 'product' && form.track_inventory
        ? 'available'
        : form.status === 'out_of_stock'
          ? 'out_of_stock'
          : 'available';

    const simplifiedForm: CatalogProductFormState = {
      ...form,
      sku: resolvedSku,
      original_price: '',
      status: simplifiedStatus,
    };

    const moneyCode = validateCatalogMoneyForm(simplifiedForm, commerceContext.currency_fraction_digits);
    if (moneyCode) {
      if (moneyCode === 'price' || moneyCode === 'variant_price') toast.error(copy.invalidPrice);
      else toast.error(copy.invalidForm);
      return null;
    }

    const authorityForm = catalogMoneyFormForAuthority(
      simplifiedForm,
      commerceContext.currency_fraction_digits,
    );
    if (!authorityForm) {
      toast.error(copy.invalidPrice);
      return null;
    }

    const code = validateCatalogProductForm(authorityForm);
    if (!code) return authorityForm;
    if (code === 'name') toast.error(copy.invalidName);
    else if (code === 'price') toast.error(copy.invalidPrice);
    else if (code === 'quantity' || code === 'variant_quantity') toast.error(copy.invalidQuantity);
    else toast.error(copy.invalidForm);
    return null;
  };

  const loadConflict = async (productId: string, error: unknown) => {
    if (!(error instanceof CatalogApiError) || error.code !== 'CATALOG_VERSION_CONFLICT') return false;
    try {
      const latest = await getCatalogProduct(productId);
      setItems(current => upsert(current, latest));
      syncInventory(latest);
      if (editingId === productId && commerceContext) setForm(normalizeEditorForm(latest));
      setAuthorityReady(true);
    } catch (reloadError) {
      console.error('Catalog conflict reload failed:', reloadError);
      setAuthorityReady(false);
      setCommerceContext(null);
      setLoadError(true);
      toast.error(loadFailedRef.current);
    }
    toast.error(copy.versionConflict);
    return true;
  };

  const save = async () => {
    if (!authorityReady) {
      toast.error(copy.loadFailed);
      return;
    }
    if (mutationBusy) return;
    const authorityForm = validate();
    if (!authorityForm) return;
    setSaving(true);
    try {
      const existing = editingId ? items.find(item => item.id === editingId) : undefined;
      const input: CatalogProductInput = catalogProductInputFromForm(authorityForm, existing);
      input.sku = authorityForm.sku.trim();
      input.compare_at_price_iqd = null;

      if (editingId) {
        const current = existing;
        if (!current) throw new Error('catalog item missing');
        try {
          const updated = await updateCatalogProduct(current.id, current.version, input);
          setItems(currentItems => upsert(currentItems, updated));
          syncInventory(updated);
          toast.success(copy.updated);
          closeForm(true);
        } catch (error) {
          if (await loadConflict(current.id, error)) return;
          throw error;
        }
      } else {
        let attempt: CatalogIdempotencyAttempt;
        try {
          attempt = idempotencyAttemptForRequest(createAttempt.current, 'catalog-create', input);
        } catch {
          toast.error(copy.secureCrypto);
          return;
        }
        createAttempt.current = attempt;
        const created = await createCatalogProduct(input, attempt.key);
        createAttempt.current = null;
        setItems(currentItems => upsert(currentItems, created));
        syncInventory(created);
        toast.success(copy.saved);
        closeForm(true);
      }
    } catch (error) {
      console.error('Catalog save failed:', error);
      toast.error(error instanceof CatalogApiError ? `${copy.saveFailed} (${error.code})` : copy.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (product: CatalogProduct) => {
    if (!authorityReady) {
      toast.error(copy.loadFailed);
      return;
    }
    if (mutationBusy) return;
    if (!window.confirm(copy.deleteConfirm)) return;
    setDeletingId(product.id);
    try {
      await deleteCatalogProduct(product.id, product.version);
      setItems(current => current.filter(item => item.id !== product.id));
      if (detailsProductId === product.id) setDetailsProductId(null);
      toast.success(copy.deleted);
    } catch (error) {
      if (await loadConflict(product.id, error)) return;
      toast.error(copy.saveFailed);
    } finally {
      setDeletingId(null);
    }
  };

  const parseQuantity = (raw: string): number | null => {
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };

  const setInventory = async (product: CatalogProduct, variant?: CatalogVariant) => {
    if (!authorityReady) {
      toast.error(copy.loadFailed);
      return;
    }
    if (mutationBusy) return;
    const key = inventoryKey(product.id, variant?.id);
    const quantity = parseQuantity(inventoryValues[key] ?? '');
    if (quantity === null) {
      toast.error(copy.invalidQuantity);
      return;
    }
    setInventoryBusy(key);
    try {
      const updated = await setCatalogInventory({
        productId: product.id,
        expectedVersion: product.version,
        quantity,
        ...(variant ? { variantId: variant.id } : {}),
      });
      setItems(current => upsert(current, updated));
      syncInventory(updated);
      toast.success(copy.inventorySaved);
    } catch (error) {
      if (await loadConflict(product.id, error)) return;
      toast.error(copy.inventoryFailed);
    } finally {
      setInventoryBusy(null);
    }
  };

  const adjustInventory = async (product: CatalogProduct, delta: number, variant?: CatalogVariant) => {
    if (!authorityReady) {
      toast.error(copy.loadFailed);
      return;
    }
    if (mutationBusy) return;
    const key = inventoryKey(product.id, variant?.id);
    const request = {
      productId: product.id,
      expectedVersion: product.version,
      delta,
      ...(variant ? { variantId: variant.id } : {}),
      reason: 'merchant commerce catalog inventory UX',
    };
    let attempt: CatalogIdempotencyAttempt;
    try {
      attempt = idempotencyAttemptForRequest(inventoryAttempt.current, 'catalog-inventory-adjust', request);
    } catch {
      toast.error(copy.secureCrypto);
      return;
    }
    inventoryAttempt.current = attempt;
    setInventoryBusy(key);
    try {
      const updated = await adjustCatalogInventory(request, attempt.key);
      inventoryAttempt.current = null;
      setItems(current => upsert(current, updated));
      syncInventory(updated);
      toast.success(copy.inventorySaved);
    } catch (error) {
      if (await loadConflict(product.id, error)) return;
      toast.error(copy.inventoryFailed);
    } finally {
      setInventoryBusy(null);
    }
  };

  const formatPrice = (product: CatalogProduct) => {
    const service = product.service_details;
    if (service?.price_type === 'custom') return copy.customPrice;
    if (service?.price_type === 'free') return copy.freePrice;
    return commerceContext
      ? formatMerchantMoneyMinor(
          product.price_iqd,
          commerceContext.currency_code,
          commerceContext.currency_fraction_digits,
          lang,
        )
      : '—';
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <header className="mb-5 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className={isRTL ? 'text-right' : 'text-left'}>
            <h1 className="text-3xl font-extrabold tracking-tight">{copy.title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={openCreate} disabled={!authorityReady || !commerceContext || loading || mutationBusy} className="h-11 rounded-xl bg-orange-500 px-4 font-bold text-white hover:bg-orange-600"><Plus className={isRTL ? 'ml-2 h-4 w-4' : 'mr-2 h-4 w-4'} />{copy.add}</Button>
            <Button type="button" variant="outline" onClick={() => { window.location.href = '/dashboard/products/import'; }} className="h-11 rounded-xl px-4 font-bold"><Upload className={isRTL ? 'ml-2 h-4 w-4' : 'mr-2 h-4 w-4'} />{copy.import}</Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.search} className={`h-12 rounded-2xl ${isRTL ? 'pr-10' : 'pl-10'}`} />
          </div>
          <div className="flex rounded-2xl border bg-card p-1">
            {([['all', copy.all], ['product', copy.products], ['service', copy.services]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${filter === value ? 'bg-orange-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm"><Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" /><p className="text-lg text-muted-foreground">{copy.loading}</p></div>
      ) : loadError ? (
        <div className="rounded-3xl border border-destructive/30 bg-card p-10 text-center shadow-sm"><p className="font-semibold text-destructive">{copy.loadFailed}</p><Button type="button" variant="outline" className="mt-4 rounded-xl" onClick={() => setReload(value => value + 1)}><RefreshCw className="mr-2 h-4 w-4" />{copy.retry}</Button></div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm"><Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" /><p className="text-lg font-semibold text-muted-foreground">{copy.noItems}</p><p className="mt-2 text-sm text-muted-foreground">{copy.noItemsHint}</p></div>
      ) : (
        <div className="grid auto-rows-fr gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visible.map(product => {
            const type = itemType(product);
            const service = product.service_details;
            const hasVariants = product.variants.length > 0;
            const soldOutVariants = hasVariants ? product.variants.filter(variant => variant.stock_quantity === 0).length : 0;
            const partialVariantOutage = tracksInventory(product) && soldOutVariants > 0 && soldOutVariants < product.variants.length;

            return (
              <div
                key={product.id}
                data-catalog-summary-card="true"
                dir="ltr"
                className="flex h-full min-h-[17rem] overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative w-32 shrink-0 overflow-hidden border-r bg-muted/20 sm:w-36">
                  {product.image_refs[0] ? (
                    <CatalogProtectedImage
                      image={product.image_refs[0]}
                      alt={product.image_refs[0]?.alt || product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[17rem] items-center justify-center bg-gradient-to-br from-muted/50 to-muted/10">
                      <ImageIcon className="h-10 w-10 text-muted-foreground/25" />
                    </div>
                  )}
                </div>

                <div dir={dir} className={`flex min-w-0 flex-1 flex-col p-4 ${isRTL ? 'text-right' : 'text-left'}`}>
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 min-h-12 text-lg font-extrabold leading-6">{product.name}</h2>
                    {product.category && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{product.category}</p>}
                    {product.sku && <p className="mt-1 truncate text-xs font-medium text-muted-foreground" dir="ltr">SKU: {product.sku}</p>}
                  </div>

                  <div className="mt-3 flex min-h-7 flex-wrap content-start gap-1.5">
                    <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px]">
                      {type === 'service' ? <BriefcaseBusiness className="me-1 h-3 w-3" /> : <Package className="me-1 h-3 w-3" />}
                      {type === 'service' ? copy.service : copy.product}
                    </Badge>
                    <Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass(product.status)}`}>{itemStatusShortLabel(product, copy)}</Badge>
                    {partialVariantOutage && (
                      <Badge variant="outline" title={copy.someVariantsOut} className="rounded-full border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                        <Boxes className="me-1 h-3 w-3" />{soldOutVariants}/{product.variants.length}
                      </Badge>
                    )}
                    {product.allow_fawri_reply && (
                      <Badge variant="outline" className="rounded-full border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] text-orange-700"><Bot className="me-1 h-3 w-3" />{fawriBrand}</Badge>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/35 p-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Tag className="h-3.5 w-3.5" />{copy.price}</div>
                      <p className="mt-1 truncate text-base font-extrabold" dir="ltr">{formatPrice(product)}</p>
                    </div>
                    <div className="rounded-xl bg-muted/35 p-2.5">
                      {type === 'service' ? (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{copy.duration}</div>
                          <p className="mt-1 truncate text-base font-extrabold">{service?.duration_minutes ? `${service.duration_minutes} ${copy.minute}` : '—'}</p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Boxes className="h-3.5 w-3.5" />{copy.quantity}</div>
                          <p className="mt-1 truncate text-base font-extrabold">{tracksInventory(product) ? product.stock_quantity.toLocaleString('en-US') : copy.inventoryNotTracked}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 min-h-5 truncate text-xs text-muted-foreground">
                    {type === 'service'
                      ? `${copy.booking}: ${service?.booking_required === false ? copy.bookingOptional : copy.bookingRequired}`
                      : hasVariants
                        ? `${copy.variants}: ${product.variants.length}`
                        : '\u00a0'}
                  </p>

                  <div className="mt-auto flex items-center gap-2 border-t pt-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 flex-1 rounded-xl px-3 text-xs font-bold"
                      onClick={() => setDetailsProductId(product.id)}
                    >
                      <Eye className="me-1.5 h-4 w-4" />
                      {copy.details}
                    </Button>
                    <Button type="button" variant="outline" size="icon" title={copy.edit} className="h-9 w-9 rounded-xl" disabled={!authorityReady || mutationBusy} onClick={() => openEdit(product)}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" title={copy.deleteConfirm} className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={!authorityReady || mutationBusy} onClick={() => void remove(product)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(detailsProduct)} onOpenChange={open => { if (!open) setDetailsProductId(null); }}>
        {detailsProduct && (
          <DialogContent dir={dir} className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-4xl overflow-y-auto rounded-3xl p-5 sm:p-6" closeButtonClassName={isRTL ? 'left-4 right-auto' : undefined}>
            <DialogHeader className={isRTL ? 'pe-12 text-right sm:text-right' : 'pe-12 text-left sm:text-left'}>
              <DialogTitle className="text-xl font-extrabold">{copy.detailsTitle}</DialogTitle>
              <DialogDescription>{detailsProduct.name}</DialogDescription>
            </DialogHeader>

            <div dir="ltr" className="flex flex-col gap-5 sm:flex-row">
              <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl border bg-muted/20 sm:w-48">
                {detailsProduct.image_refs[0] ? (
                  <CatalogProtectedImage
                    image={detailsProduct.image_refs[0]}
                    alt={detailsProduct.image_refs[0]?.alt || detailsProduct.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center"><ImageIcon className="h-12 w-12 text-muted-foreground/25" /></div>
                )}
              </div>

              <div dir={dir} className={`min-w-0 flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full">{itemType(detailsProduct) === 'service' ? copy.service : copy.product}</Badge>
                  <Badge variant="outline" className={`rounded-full ${statusClass(detailsProduct.status)}`}>{itemStatusLabel(detailsProduct, copy)}</Badge>
                  {detailsProduct.allow_fawri_reply && <Badge variant="outline" className="rounded-full border-orange-200 bg-orange-50 text-orange-700"><Bot className="me-1 h-3 w-3" />{fawriBrand}</Badge>}
                  {detailsProduct.image_refs.length > 0 && <Badge variant="outline" className="rounded-full"><ImageIcon className="me-1 h-3 w-3" />{detailsProduct.image_refs.length}</Badge>}
                </div>
                <h3 className="mt-3 text-2xl font-extrabold leading-8">{detailsProduct.name}</h3>
                {detailsProduct.category && <p className="mt-1 text-sm text-muted-foreground">{detailsProduct.category}</p>}
                {detailsProduct.sku && <p className="mt-2 text-xs font-medium text-muted-foreground" dir="ltr">SKU: {detailsProduct.sku}</p>}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-muted/35 p-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Tag className="h-4 w-4" />{copy.price}</div>
                    <p className="mt-1 text-xl font-extrabold" dir="ltr">{formatPrice(detailsProduct)}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/35 p-3">
                    {itemType(detailsProduct) === 'service' ? (
                      <>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />{copy.duration}</div>
                        <p className="mt-1 text-xl font-extrabold">{detailsProduct.service_details?.duration_minutes ? `${detailsProduct.service_details.duration_minutes} ${copy.minute}` : '—'}</p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Boxes className="h-4 w-4" />{copy.quantity}</div>
                        <p className="mt-1 text-xl font-extrabold">{tracksInventory(detailsProduct) ? detailsProduct.stock_quantity.toLocaleString('en-US') : copy.inventoryNotTracked}</p>
                      </>
                    )}
                  </div>
                </div>

                {itemType(detailsProduct) === 'service' && (
                  <div className="mt-3 rounded-2xl border bg-muted/15 p-3 text-sm">
                    <span className="font-bold">{copy.booking}: </span>
                    <span className="text-muted-foreground">{detailsProduct.service_details?.booking_required === false ? copy.bookingOptional : copy.bookingRequired}</span>
                  </div>
                )}
              </div>
            </div>

            <section className="rounded-2xl border bg-card p-4">
              <h4 className="text-sm font-extrabold">{copy.description}</h4>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground" dir="auto">{detailsProduct.description || copy.descriptionMissing}</p>
            </section>

            {tracksInventory(detailsProduct) && (
              <section className="rounded-2xl border bg-muted/10 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-extrabold">{detailsProduct.variants.length > 0 ? copy.variantDetails : copy.inventoryDetails}</h4>
                  {detailsProduct.variants.length > 0 && <Badge variant="outline" className="rounded-full bg-background">{detailsProduct.variants.length}</Badge>}
                </div>
                <div className="space-y-2">
                  {detailsProduct.variants.length > 0 ? detailsProduct.variants.map(variant => {
                    const key = inventoryKey(detailsProduct.id, variant.id);
                    return (
                      <InventoryControl
                        key={variant.id}
                        copy={copy}
                        product={detailsProduct}
                        variant={variant}
                        value={inventoryValues[key] ?? String(variant.stock_quantity)}
                        busy={mutationBusy || !authorityReady}
                        onValue={value => setInventoryValues(current => ({ ...current, [key]: value }))}
                        onSet={() => void setInventory(detailsProduct, variant)}
                        onAdjust={delta => void adjustInventory(detailsProduct, delta, variant)}
                      />
                    );
                  }) : (() => {
                    const key = inventoryKey(detailsProduct.id);
                    return (
                      <InventoryControl
                        copy={copy}
                        product={detailsProduct}
                        value={inventoryValues[key] ?? String(detailsProduct.stock_quantity)}
                        busy={mutationBusy || !authorityReady}
                        onValue={value => setInventoryValues(current => ({ ...current, [key]: value }))}
                        onSet={() => void setInventory(detailsProduct)}
                        onAdjust={delta => void adjustInventory(detailsProduct, delta)}
                      />
                    );
                  })()}
                </div>
              </section>
            )}

            <div className="flex justify-end border-t pt-4">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl px-4 font-bold"
                disabled={!authorityReady || mutationBusy}
                onClick={() => {
                  const product = detailsProduct;
                  setDetailsProductId(null);
                  openEdit(product);
                }}
              >
                <Pencil className="me-2 h-4 w-4" />
                {copy.edit}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {formOpen && (
        <CatalogEditorShell
          lang={lang}
          form={form}
          title={editingId ? copy.edit : copy.create}
          subtitle={copy.subtitle}
          saveLabel={copy.save}
          savingLabel={copy.saving}
          saving={saving}
          onClose={() => closeForm(true)}
          onSave={() => void save()}
        >
          <CatalogItemTypeEditor lang={lang} form={form} onChange={patchForm} />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.name}</span>
              <Input data-catalog-primary-input="true" value={form.name} onChange={event => patchForm({ name: event.target.value })} placeholder={copy.namePlaceholder} className="h-11 rounded-xl" />
            </label>

            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.category}</span>
              <Input value={form.category} onChange={event => patchForm({ category: event.target.value })} placeholder={copy.categoryPlaceholder} className="h-11 rounded-xl" />
            </label>
          </div>

          <label className="space-y-1 text-sm font-semibold">
            <span>{copy.basePrice}</span>
            <Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={form.current_price} onChange={event => patchForm({ current_price: event.target.value })} disabled={form.item_type === 'service' && (form.service_price_type === 'free' || form.service_price_type === 'custom')} placeholder={priceExample} className="h-11 rounded-xl" />
            <span className="block text-xs font-normal leading-5 text-muted-foreground">{copy.basePriceHint}</span>
          </label>

          {form.item_type === 'service' && (
            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.sku}</span>
              <Input dir="ltr" value={form.sku} onChange={event => patchForm({ sku: event.target.value })} className="h-11 rounded-xl" />
              <span className="block text-xs font-normal leading-5 text-muted-foreground">{copy.skuHint}</span>
            </label>
          )}

          {(form.item_type === 'service' || !form.track_inventory) && (
            <div className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/10 p-4">
              <div>
                <p className="text-sm font-bold">{copy.availableForSale}</p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{copy.availableForSaleHint}</p>
              </div>
              <Toggle checked={form.status !== 'out_of_stock'} onChange={available => patchForm({ status: available ? 'available' : 'out_of_stock' })} />
            </div>
          )}

          <label className="catalog-editor-description-field space-y-2 text-sm font-semibold">
            <span>{copy.description}</span>
            <Textarea value={form.description} onChange={event => patchForm({ description: event.target.value })} placeholder={copy.descriptionPlaceholder} rows={4} className="min-h-[7rem] flex-1 rounded-xl" />
          </label>

          <CatalogImageUploadEditor images={form.image_refs} onChange={image_refs => patchForm({ image_refs })} maxImages={20} />

          <CatalogProductDetailsEditor lang={lang} form={form} editing={Boolean(editingId)} moneyStep={moneyStep} onChange={patchForm} />

          <div className="catalog-editor-fawri-field space-y-2 text-sm font-semibold">
            <span className="catalog-editor-fawri-label">{copy.fawri}</span>
            <div className="catalog-editor-fawri-control flex min-h-[7rem] flex-1 items-center justify-between gap-4 rounded-xl border border-input bg-background px-4 py-4">
              <p className="max-w-md text-xs font-normal leading-5 text-muted-foreground">{copy.fawriHint}</p>
              <Toggle checked={form.allow_fawri_reply} onChange={allow_fawri_reply => patchForm({ allow_fawri_reply })} />
            </div>
          </div>
        </CatalogEditorShell>
      )}
    </div>
  );
}
