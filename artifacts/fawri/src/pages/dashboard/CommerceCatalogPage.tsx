import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  ChevronDown,
  ChevronUp,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  adjustCatalogInventory,
  CatalogApiError,
  createCatalogProduct,
  deleteCatalogProduct,
  getCatalogProduct,
  idempotencyAttemptForRequest,
  listCatalogProducts,
  setCatalogInventory,
  updateCatalogProduct,
  type CatalogIdempotencyAttempt,
  type CatalogProduct,
  type CatalogVariant,
} from '@/lib/catalogUiApi';
import { catalogImagePreviewUrl } from '@/lib/catalogMediaUiApi';
import {
  catalogProductFormFromProduct,
  catalogProductInputFromForm,
  createEmptyCatalogProductForm,
  validateCatalogProductForm,
  variantOptionSummary,
  type CatalogProductFormState,
} from '@/lib/catalogProductEditor';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant } from '@/lib/store';
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
  salePrice: string;
  originalPrice: string;
  price: string;
  currency: string;
  freePrice: string;
  customPrice: string;
  quantity: string;
  inventoryNotTracked: string;
  duration: string;
  booking: string;
  bookingRequired: string;
  bookingOptional: string;
  status: string;
  description: string;
  descriptionPlaceholder: string;
  fawri: string;
  fawriHint: string;
  images: string;
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
  unavailable: string;
  draft: string;
  hidden: string;
  minute: string;
};

const COPY: Record<Lang, PageCopy> = {
  ar: {
    title: 'المنتجات والخدمات',
    subtitle: 'مصدر فوري الموحد لبيانات المنتجات والخدمات والمخزون التي يعتمد عليها عند الرد على العملاء.',
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
    secureCrypto: 'تعذر إنشاء مفتاح أمان للعملية.',
    invalidName: 'أدخل اسمًا صحيحًا.',
    invalidPrice: 'راجع السعر الحالي والسعر السابق.',
    invalidQuantity: 'راجع كمية المخزون.',
    invalidForm: 'راجع حقول العنصر قبل الحفظ.',
    name: 'الاسم',
    namePlaceholder: 'اسم المنتج أو الخدمة',
    category: 'القسم',
    categoryPlaceholder: 'مثال: إلكترونيات، عناية، خدمات منزلية',
    salePrice: 'السعر',
    originalPrice: 'السعر السابق / للمقارنة',
    price: 'السعر',
    currency: 'د.ع',
    freePrice: 'مجاني',
    customPrice: 'حسب الطلب',
    quantity: 'المخزون',
    inventoryNotTracked: 'غير متابع',
    duration: 'المدة',
    booking: 'الحجز',
    bookingRequired: 'مطلوب',
    bookingOptional: 'غير مطلوب',
    status: 'الحالة',
    description: 'الوصف',
    descriptionPlaceholder: 'معلومات واضحة يمكن لفوري الاعتماد عليها عند الرد على العميل.',
    fawri: 'السماح لفوري باستخدام هذا العنصر',
    fawriHint: 'عند الإيقاف لن يستخدم فوري هذا المنتج أو الخدمة في الردود الآلية.',
    images: 'الصور',
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
    unavailable: 'غير متوفر',
    draft: 'مسودة',
    hidden: 'مخفي عن فوري',
    minute: 'دقيقة',
  },
  ku: {
    title: 'بەرهەم و خزمەتگوزارییەکان',
    subtitle: 'سەرچاوەی یەکگرتووی فەوری بۆ زانیاریی بەرهەم و خزمەتگوزاری و کۆگا کە لە وەڵامدانەوە بە کڕیار پشت پێ دەبەستێت.',
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
    secureCrypto: 'دروستکردنی کلیلی پاراستن سەرکەوتوو نەبوو.',
    invalidName: 'ناوێکی دروست بنووسە.',
    invalidPrice: 'نرخەکان بپشکنە.',
    invalidQuantity: 'بڕی کۆگا بپشکنە.',
    invalidForm: 'خانەکان پێش پاشەکەوتکردن بپشکنە.',
    name: 'ناو',
    namePlaceholder: 'ناوی بەرهەم یان خزمەتگوزاری',
    category: 'بەش',
    categoryPlaceholder: 'نموونە: ئەلیکترۆنیات، خزمەتگوزاری',
    salePrice: 'نرخ',
    originalPrice: 'نرخی پێشوو / بەراورد',
    price: 'نرخ',
    currency: 'د.ع',
    freePrice: 'بەخۆڕایی',
    customPrice: 'بەپێی داواکاری',
    quantity: 'کۆگا',
    inventoryNotTracked: 'بەدواداچوون ناکرێت',
    duration: 'ماوە',
    booking: 'حجز',
    bookingRequired: 'پێویستە',
    bookingOptional: 'پێویست نییە',
    status: 'دۆخ',
    description: 'وەسف',
    descriptionPlaceholder: 'زانیارییەکی ڕوون کە فەوری بتوانێت پشتی پێ ببەستێت.',
    fawri: 'ڕێگە بدە فەوری ئەم بابەتە بەکاربهێنێت',
    fawriHint: 'کاتێک ناچالاکە فەوری لە وەڵامە ئۆتۆماتیکییەکان بەکاری ناهێنێت.',
    images: 'وێنەکان',
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
    unavailable: 'بەردەست نییە',
    draft: 'ڕەشنووس',
    hidden: 'لە فەوری شاردراوەتەوە',
    minute: 'خولەک',
  },
  en: {
    title: 'Products & Services',
    subtitle: 'Fawri’s canonical source for trusted product, service, and inventory facts used in customer replies.',
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
    secureCrypto: 'Could not create a secure request key.',
    invalidName: 'Enter a valid name.',
    invalidPrice: 'Review current and comparison prices.',
    invalidQuantity: 'Review inventory quantity.',
    invalidForm: 'Review the item fields before saving.',
    name: 'Name',
    namePlaceholder: 'Product or service name',
    category: 'Category',
    categoryPlaceholder: 'e.g. Electronics, Beauty, Home services',
    salePrice: 'Price',
    originalPrice: 'Previous / compare price',
    price: 'Price',
    currency: 'IQD',
    freePrice: 'Free',
    customPrice: 'On request',
    quantity: 'Inventory',
    inventoryNotTracked: 'Not tracked',
    duration: 'Duration',
    booking: 'Booking',
    bookingRequired: 'Required',
    bookingOptional: 'Not required',
    status: 'Status',
    description: 'Description',
    descriptionPlaceholder: 'Clear information Fawri can rely on when answering customers.',
    fawri: 'Allow Fawri to use this item',
    fawriHint: 'When disabled, Fawri will not use this product or service in automated replies.',
    images: 'Images',
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
    unavailable: 'Unavailable',
    draft: 'Draft',
    hidden: 'Hidden from Fawri',
    minute: 'min',
  },
};

function statusClass(status: ProductStatus): string {
  if (status === 'available') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'low_stock') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'out_of_stock') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'draft') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-zinc-200 bg-zinc-50 text-zinc-700';
}

function imageUrl(product: CatalogProduct): string | null {
  const primary = product.image_refs[0];
  if (!primary) return null;
  if (primary.url?.trim()) return primary.url.trim();
  if (primary.storage_key?.trim()) return catalogImagePreviewUrl(primary.storage_key);
  return null;
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

function FawriToggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" aria-pressed={checked} onClick={() => onChange(!checked)} className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-orange-500' : 'bg-zinc-300'}`}>
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
        <Input type="number" min={0} dir="ltr" value={value} onChange={event => onValue(event.target.value)} className="h-10 rounded-xl" />
        <Button type="button" variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={onSet}>{copy.inventorySet}</Button>
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-xl" disabled={busy} onClick={() => onAdjust(1)}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export default function CommerceCatalogPage() {
  const { lang, dir, isRTL } = useI18n();
  const copy = COPY[lang] || COPY.en;
  const merchant = getCurrentMerchant();
  const fawriBrand = lang === 'ar' ? 'فوري' : lang === 'ku' ? 'فەوری' : 'Fawri';
  const priceExample = lang === 'ar' ? 'مثال: 15000' : lang === 'ku' ? 'نموونە: 15000' : 'e.g. 15000';
  const comparePriceExample = lang === 'ar' ? 'مثال: 20000' : lang === 'ku' ? 'نموونە: 20000' : 'e.g. 20000';

  const createAttempt = useRef<CatalogIdempotencyAttempt | null>(null);
  const inventoryAttempt = useRef<CatalogIdempotencyAttempt | null>(null);

  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [expandedInventoryProducts, setExpandedInventoryProducts] = useState<Record<string, boolean>>({});

  const statusOptions = useMemo(() => [
    { value: 'available' as const, label: copy.available },
    { value: 'low_stock' as const, label: copy.lowStock },
    { value: 'out_of_stock' as const, label: copy.unavailable },
    { value: 'draft' as const, label: copy.draft },
    { value: 'hidden_from_fawri' as const, label: copy.hidden },
  ], [copy]);

  const statusLabels = useMemo(() => Object.fromEntries(statusOptions.map(option => [option.value, option.label])) as Record<ProductStatus, string>, [statusOptions]);
  const editorStatusOptions = useMemo(() => form.item_type === 'service' ? statusOptions.filter(option => option.value !== 'low_stock') : statusOptions, [form.item_type, statusOptions]);

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
      if (!merchant) {
        if (active) setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(false);
      try {
        const loaded = await listCatalogProducts();
        if (!active) return;
        setItems(loaded);
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
      } catch (error) {
        console.error('Catalog load failed:', error);
        if (active) {
          setLoadError(true);
          toast.error(copy.loadFailed);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [merchant?.id, reload, copy.loadFailed]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter(product => {
      const type = itemType(product);
      if (filter !== 'all' && type !== filter) return false;
      if (!needle) return true;
      const values = [product.name, product.category, product.external_ref, product.sku, product.barcode, ...product.variants.flatMap(variant => [variant.name, variant.sku, variant.barcode, ...Object.values(variant.options)])];
      return values.filter(Boolean).some(value => String(value).toLocaleLowerCase().includes(needle));
    });
  }, [items, filter, query]);

  if (!merchant) return null;

  const openCreate = () => {
    createAttempt.current = null;
    setEditingId(null);
    setForm(createEmptyCatalogProductForm());
    setFormOpen(true);
  };

  const openEdit = (product: CatalogProduct) => {
    createAttempt.current = null;
    setEditingId(product.id);
    const nextForm = catalogProductFormFromProduct(product);
    if (nextForm.item_type === 'service' && nextForm.status === 'low_stock') nextForm.status = 'available';
    setForm(nextForm);
    setFormOpen(true);
  };

  const closeForm = (force = false) => {
    if (saving && !force) return;
    createAttempt.current = null;
    setEditingId(null);
    setForm(createEmptyCatalogProductForm());
    setFormOpen(false);
  };

  const patchForm = (patch: Partial<CatalogProductFormState>) => setForm(current => ({ ...current, ...patch }));

  const toggleInventoryDetails = (productId: string) => {
    setExpandedInventoryProducts(current => ({ ...current, [productId]: !current[productId] }));
  };

  const validate = () => {
    const code = validateCatalogProductForm(form);
    if (!code) return true;
    if (code === 'name') toast.error(copy.invalidName);
    else if (code === 'price' || code === 'compare_price') toast.error(copy.invalidPrice);
    else if (code === 'quantity' || code === 'variant_quantity') toast.error(copy.invalidQuantity);
    else toast.error(copy.invalidForm);
    return false;
  };

  const loadConflict = async (productId: string, error: unknown) => {
    if (!(error instanceof CatalogApiError) || error.code !== 'CATALOG_VERSION_CONFLICT') return false;
    try {
      const latest = await getCatalogProduct(productId);
      setItems(current => upsert(current, latest));
      syncInventory(latest);
      if (editingId === productId) setForm(catalogProductFormFromProduct(latest));
    } catch (reloadError) {
      console.error('Catalog conflict reload failed:', reloadError);
    }
    toast.error(copy.versionConflict);
    return true;
  };

  const save = async () => {
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const input = catalogProductInputFromForm(form, editingId ? items.find(item => item.id === editingId) : undefined);
      if (editingId) {
        const current = items.find(item => item.id === editingId);
        if (!current) throw new Error('catalog item missing');
        try {
          const updated = await updateCatalogProduct(current.id, current.version, input);
          setItems(existing => upsert(existing, updated));
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
        setItems(existing => upsert(existing, created));
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
    if (!window.confirm(copy.deleteConfirm)) return;
    try {
      await deleteCatalogProduct(product.id, product.version);
      setItems(current => current.filter(item => item.id !== product.id));
      setExpandedInventoryProducts(current => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      toast.success(copy.deleted);
    } catch (error) {
      if (await loadConflict(product.id, error)) return;
      toast.error(copy.saveFailed);
    }
  };

  const parseQuantity = (raw: string): number | null => {
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };

  const setInventory = async (product: CatalogProduct, variant?: CatalogVariant) => {
    const key = inventoryKey(product.id, variant?.id);
    const quantity = parseQuantity(inventoryValues[key] ?? '');
    if (quantity === null) {
      toast.error(copy.invalidQuantity);
      return;
    }
    setInventoryBusy(key);
    try {
      const updated = await setCatalogInventory({ productId: product.id, expectedVersion: product.version, quantity, ...(variant ? { variantId: variant.id } : {}) });
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
    const key = inventoryKey(product.id, variant?.id);
    const request = { productId: product.id, expectedVersion: product.version, delta, ...(variant ? { variantId: variant.id } : {}), reason: 'merchant commerce catalog inventory UX' };
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

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <header className="mb-5 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className={isRTL ? 'text-right' : 'text-left'}>
            <h1 className="text-3xl font-extrabold tracking-tight">{copy.title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={openCreate} className="h-11 rounded-xl bg-orange-500 px-4 font-bold text-white hover:bg-orange-600"><Plus className={isRTL ? 'ml-2 h-4 w-4' : 'mr-2 h-4 w-4'} />{copy.add}</Button>
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
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visible.map(product => {
            const type = itemType(product);
            const primary = imageUrl(product);
            const service = product.service_details;
            const hasVariants = product.variants.length > 0;
            const inventoryExpanded = Boolean(expandedInventoryProducts[product.id]);
            const inventoryPanelId = `catalog-inventory-${product.id}`;
            return (
              <article key={product.id} className="overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:shadow-md">
                {primary && <div className="h-44 overflow-hidden border-b bg-muted/20"><img src={primary} alt={product.image_refs[0]?.alt || product.name} className="h-full w-full object-cover" /></div>}
                <div className="border-b p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <Badge variant="outline" className="rounded-full">{type === 'service' ? <BriefcaseBusiness className="mr-1 h-3 w-3" /> : <Package className="mr-1 h-3 w-3" />}{type === 'service' ? copy.service : copy.product}</Badge>
                        <Badge variant="outline" className={`rounded-full ${statusClass(product.status)}`}>{statusLabels[product.status]}</Badge>
                        {product.allow_fawri_reply && <Badge variant="outline" className="rounded-full border-orange-200 bg-orange-50 text-orange-700"><Bot className="mr-1 h-3 w-3" />{fawriBrand}</Badge>}
                        {product.image_refs.length > 0 && <Badge variant="outline" className="rounded-full"><ImageIcon className="mr-1 h-3 w-3" />{product.image_refs.length}</Badge>}
                      </div>
                      <h2 className="line-clamp-2 text-xl font-extrabold">{product.name}</h2>
                      {product.category && <p className="mt-1 text-sm text-muted-foreground">{product.category}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={() => openEdit(product)}><Pencil className="h-4 w-4" /></Button>
                      <Button type="button" variant="destructive" size="icon" className="h-10 w-10 rounded-xl" onClick={() => void remove(product)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-4">
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Tag className="h-4 w-4" />{copy.price}</div>
                    <p className="text-xl font-extrabold">{service?.price_type === 'custom' ? copy.customPrice : service?.price_type === 'free' ? copy.freePrice : `${product.price_iqd.toLocaleString(lang === 'en' ? 'en-US' : 'ar-IQ')} ${copy.currency}`}</p>
                  </div>
                  <div className="rounded-2xl bg-muted/40 p-3">
                    {type === 'service' ? <><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock className="h-4 w-4" />{copy.duration}</div><p className="text-xl font-extrabold">{service?.duration_minutes ? `${service.duration_minutes} ${copy.minute}` : '—'}</p></> : <><div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><Boxes className="h-4 w-4" />{copy.quantity}</div><p className="text-xl font-extrabold">{tracksInventory(product) ? product.stock_quantity.toLocaleString() : copy.inventoryNotTracked}</p></>}
                  </div>
                </div>

                {type === 'service' && <div className="px-4 pb-4"><div className="rounded-2xl bg-muted/20 p-3 text-sm"><span className="font-bold">{copy.booking}: </span><span className="text-muted-foreground">{service?.booking_required === false ? copy.bookingOptional : copy.bookingRequired}</span></div></div>}

                {tracksInventory(product) && (
                  <div className="px-4 pb-4">
                    <div className="rounded-2xl bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold">{copy.inventory}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-xl px-3 text-xs font-bold"
                          aria-expanded={inventoryExpanded}
                          aria-controls={inventoryPanelId}
                          onClick={() => toggleInventoryDetails(product.id)}
                        >
                          {hasVariants
                            ? (inventoryExpanded ? copy.hideVariantDetails : copy.variantDetails)
                            : (inventoryExpanded ? copy.hideInventoryDetails : copy.inventoryDetails)}
                          {hasVariants && <Badge variant="outline" className="mx-2 rounded-full bg-background">{product.variants.length}</Badge>}
                          {inventoryExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      </div>

                      {inventoryExpanded && (
                        <div id={inventoryPanelId} className="mt-3 space-y-2">
                          {hasVariants ? product.variants.map(variant => {
                            const key = inventoryKey(product.id, variant.id);
                            return <InventoryControl key={variant.id} copy={copy} product={product} variant={variant} value={inventoryValues[key] ?? String(variant.stock_quantity)} busy={inventoryBusy === key} onValue={value => setInventoryValues(current => ({ ...current, [key]: value }))} onSet={() => void setInventory(product, variant)} onAdjust={delta => void adjustInventory(product, delta, variant)} />;
                          }) : (() => {
                            const key = inventoryKey(product.id);
                            return <InventoryControl copy={copy} product={product} value={inventoryValues[key] ?? String(product.stock_quantity)} busy={inventoryBusy === key} onValue={value => setInventoryValues(current => ({ ...current, [key]: value }))} onSet={() => void setInventory(product)} onAdjust={delta => void adjustInventory(product, delta)} />;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {product.description && <div className="px-4 pb-4"><p className="rounded-2xl bg-muted/30 p-3 text-sm leading-7 text-muted-foreground">{product.description}</p></div>}
              </article>
            );
          })}
        </div>
      )}

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

          <label className="space-y-1 text-sm font-semibold">
            <span>{copy.name}</span>
            <Input data-catalog-primary-input="true" value={form.name} onChange={event => patchForm({ name: event.target.value })} placeholder={copy.namePlaceholder} className="h-11 rounded-xl" />
          </label>

          <label className="space-y-1 text-sm font-semibold">
            <span>{copy.category}</span>
            <Input value={form.category} onChange={event => patchForm({ category: event.target.value })} placeholder={copy.categoryPlaceholder} className="h-11 rounded-xl" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.salePrice}</span>
              <div className="relative">
                <Input type="number" min={0} dir="ltr" value={form.current_price} onChange={event => patchForm({ current_price: event.target.value })} disabled={form.item_type === 'service' && (form.service_price_type === 'free' || form.service_price_type === 'custom')} placeholder={priceExample} className="h-11 rounded-xl pe-14" />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{copy.currency}</span>
              </div>
            </label>
            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.originalPrice}</span>
              <div className="relative">
                <Input type="number" min={0} dir="ltr" value={form.original_price} onChange={event => patchForm({ original_price: event.target.value })} placeholder={comparePriceExample} className="h-11 rounded-xl pe-14" />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{copy.currency}</span>
              </div>
            </label>
          </div>

          <CatalogProductDetailsEditor lang={lang} form={form} editing={Boolean(editingId)} onChange={patchForm} />
          <CatalogImageUploadEditor images={form.image_refs} onChange={image_refs => patchForm({ image_refs })} maxImages={20} />

          <label className="space-y-1 text-sm font-semibold rounded-2xl border bg-muted/10 p-4">
            <span>{copy.status}</span>
            <select value={form.status} onChange={event => patchForm({ status: event.target.value as ProductStatus })} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20">
              {editorStatusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label className="catalog-editor-description-field space-y-2 text-sm font-semibold">
            <span>{copy.description}</span>
            <Textarea value={form.description} onChange={event => patchForm({ description: event.target.value })} placeholder={copy.descriptionPlaceholder} rows={5} className="min-h-[8.5rem] flex-1 rounded-xl" />
          </label>

          <div className="catalog-editor-fawri-field space-y-2 text-sm font-semibold">
            <span className="catalog-editor-fawri-label">{copy.fawri}</span>
            <div className="catalog-editor-fawri-control flex min-h-[8.5rem] flex-1 items-center justify-between gap-4 rounded-xl border border-input bg-background px-4 py-4">
              <p className="max-w-sm text-xs font-normal leading-5 text-muted-foreground">{copy.fawriHint}</p>
              <FawriToggle checked={form.allow_fawri_reply} onChange={allow_fawri_reply => patchForm({ allow_fawri_reply })} />
            </div>
          </div>
        </CatalogEditorShell>
      )}
    </div>
  );
}
