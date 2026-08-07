import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Boxes,
  Image as ImageIcon,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

type LanguageCode = 'ar' | 'ku' | 'en';
type ProductStatus =
  | 'available'
  | 'low_stock'
  | 'out_of_stock'
  | 'draft'
  | 'hidden_from_fawri';

type ImageReference = {
  id: string;
  url?: string;
  storage_key?: string;
  alt?: string;
};

type CatalogVariant = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price_iqd?: number;
  stock_quantity: number;
  options: Record<string, string>;
  image_refs: ImageReference[];
  created_at: string;
  updated_at: string;
};

type CatalogProduct = {
  id: string;
  merchant_id: string;
  external_ref?: string;
  name: string;
  description?: string;
  category?: string;
  sku?: string;
  barcode?: string;
  price_iqd: number;
  compare_at_price_iqd?: number;
  stock_quantity: number;
  low_stock_threshold: number;
  status: ProductStatus;
  allow_fawri_reply: boolean;
  image_refs: ImageReference[];
  variants: CatalogVariant[];
  created_at: string;
  updated_at: string;
  version: number;
};

type VariantDraft = {
  id?: string;
  name: string;
  sku: string;
  barcode: string;
  price_iqd: string;
  stock_quantity: string;
  options: string;
};

type ProductDraft = {
  external_ref: string;
  name: string;
  description: string;
  category: string;
  sku: string;
  barcode: string;
  price_iqd: string;
  compare_at_price_iqd: string;
  stock_quantity: string;
  low_stock_threshold: string;
  status: 'available' | 'draft' | 'hidden_from_fawri';
  allow_fawri_reply: boolean;
  image_refs: string;
  variants: VariantDraft[];
};

type PendingImport = {
  fileName: string;
  products: unknown[];
  idempotencyKey: string;
};

type Labels = {
  title: string;
  subtitle: string;
  add: string;
  import: string;
  retryImport: string;
  refresh: string;
  search: string;
  loading: string;
  empty: string;
  name: string;
  externalRef: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  price: string;
  comparePrice: string;
  stock: string;
  threshold: string;
  status: string;
  allowFawri: string;
  images: string;
  imageHint: string;
  variants: string;
  addVariant: string;
  variantName: string;
  options: string;
  optionsHint: string;
  save: string;
  cancel: string;
  edit: string;
  remove: string;
  deleteConfirm: string;
  loadFailed: string;
  saveFailed: string;
  saved: string;
  deleted: string;
  importFailed: string;
  imported: string;
  conflict: string;
  invalidJson: string;
  invalidFile: string;
  requiredName: string;
  invalidNumber: string;
  inventoryFailed: string;
  version: string;
  noSku: string;
  statuses: Record<ProductStatus, string>;
};

const LABELS: Record<LanguageCode, Labels> = {
  ar: {
    title: 'المنتجات والمخزون',
    subtitle: 'إدارة خادمية مباشرة بلا تخزين محلي تشغيلي',
    add: 'إضافة منتج',
    import: 'استيراد JSON',
    retryImport: 'إعادة محاولة الاستيراد',
    refresh: 'تحديث',
    search: 'ابحث بالاسم أو SKU أو الباركود',
    loading: 'جاري تحميل المنتجات…',
    empty: 'لا توجد منتجات حالياً',
    name: 'اسم المنتج',
    externalRef: 'المرجع الخارجي',
    sku: 'SKU',
    barcode: 'الباركود',
    category: 'القسم',
    description: 'الوصف',
    price: 'السعر (د.ع)',
    comparePrice: 'السعر قبل الخصم (د.ع)',
    stock: 'المخزون',
    threshold: 'حد المخزون المنخفض',
    status: 'الحالة',
    allowFawri: 'السماح لفوري باستخدام المنتج في الردود',
    images: 'مراجع الصور',
    imageHint: 'رابط HTTPS أو مسار asset واحد بكل سطر. لا تُقبل صور base64.',
    variants: 'المتغيرات',
    addVariant: 'إضافة متغير',
    variantName: 'اسم المتغير',
    options: 'الخيارات',
    optionsHint: 'مثال: اللون=أسود, القياس=M',
    save: 'حفظ',
    cancel: 'إلغاء',
    edit: 'تعديل',
    remove: 'حذف',
    deleteConfirm: 'هل تريد حذف هذا المنتج نهائيًا؟',
    loadFailed: 'تعذر تحميل المنتجات من الخادم',
    saveFailed: 'تعذر حفظ المنتج',
    saved: 'تم حفظ المنتج',
    deleted: 'تم حذف المنتج',
    importFailed: 'تعذر استيراد المنتجات',
    imported: 'تم استيراد المنتجات',
    conflict: 'عُدّل المنتج من جهاز آخر، وتم تحميل النسخة الأحدث.',
    invalidJson: 'ملف JSON غير صالح',
    invalidFile: 'اختر ملف JSON صالحًا وبحجم معقول',
    requiredName: 'اسم المنتج مطلوب',
    invalidNumber: 'تحقق من الأسعار والكميات',
    inventoryFailed: 'تعذر تحديث المخزون',
    version: 'نسخة',
    noSku: 'بلا SKU',
    statuses: {
      available: 'متوفر',
      low_stock: 'مخزون منخفض',
      out_of_stock: 'نفد المخزون',
      draft: 'مسودة',
      hidden_from_fawri: 'مخفي عن فوري',
    },
  },
  ku: {
    title: 'بەرهەم و کۆگا',
    subtitle: 'بەڕێوەبردنی ڕاستەوخۆ لە ڕاژەکارەوە، بەبێ هەڵگرتنی ناوخۆیی',
    add: 'زیادکردنی بەرهەم',
    import: 'هاوردەکردنی JSON',
    retryImport: 'دووبارە هەوڵدانەوەی هاوردەکردن',
    refresh: 'نوێکردنەوە',
    search: 'بە ناو، SKU یان بارکۆد بگەڕێ',
    loading: 'بەرهەمەکان بار دەکرێن…',
    empty: 'هیچ بەرهەمێک نییە',
    name: 'ناوی بەرهەم',
    externalRef: 'سەرچاوەی دەرەکی',
    sku: 'SKU',
    barcode: 'بارکۆد',
    category: 'بەش',
    description: 'وەسف',
    price: 'نرخ (د.ع)',
    comparePrice: 'نرخی پێش داشکاندن (د.ع)',
    stock: 'کۆگا',
    threshold: 'سنووری کۆگای کەم',
    status: 'دۆخ',
    allowFawri: 'ڕێگەدان بە فەوری بۆ بەکارهێنانی بەرهەم لە وەڵامەکان',
    images: 'سەرچاوەکانی وێنە',
    imageHint: 'لینکی HTTPS یان asset، هەر یەک لە هێڵێک. base64 قبوڵ ناکرێت.',
    variants: 'جۆرەکان',
    addVariant: 'زیادکردنی جۆر',
    variantName: 'ناوی جۆر',
    options: 'هەڵبژاردەکان',
    optionsHint: 'نموونە: ڕەنگ=ڕەش, قەبارە=M',
    save: 'پاشەکەوتکردن',
    cancel: 'پاشگەزبوونەوە',
    edit: 'دەستکاری',
    remove: 'سڕینەوە',
    deleteConfirm: 'دڵنیایت لە سڕینەوەی ئەم بەرهەمە؟',
    loadFailed: 'نەتوانرا بەرهەمەکان باربکرێن',
    saveFailed: 'نەتوانرا بەرهەمەکە پاشەکەوت بکرێت',
    saved: 'بەرهەمەکە پاشەکەوت کرا',
    deleted: 'بەرهەمەکە سڕایەوە',
    importFailed: 'هاوردەکردن سەرکەوتوو نەبوو',
    imported: 'بەرهەمەکان هاوردە کران',
    conflict: 'بەرهەمەکە لە ئامێرێکی تر گۆڕدرا؛ نوێترین وەشان بارکرا.',
    invalidJson: 'فایلی JSON دروست نییە',
    invalidFile: 'فایلێکی JSONی دروست و بە قەبارەی گونجاو هەڵبژێرە',
    requiredName: 'ناوی بەرهەم پێویستە',
    invalidNumber: 'نرخ و بڕەکان بپشکنە',
    inventoryFailed: 'نەتوانرا کۆگا نوێبکرێتەوە',
    version: 'وەشان',
    noSku: 'بێ SKU',
    statuses: {
      available: 'بەردەستە',
      low_stock: 'کۆگا کەمە',
      out_of_stock: 'کۆگا نەماوە',
      draft: 'ڕەشنووس',
      hidden_from_fawri: 'لە فەوری شاردراوەتەوە',
    },
  },
  en: {
    title: 'Products & inventory',
    subtitle: 'Server-authoritative catalog management without operational browser storage',
    add: 'Add product',
    import: 'Import JSON',
    retryImport: 'Retry import',
    refresh: 'Refresh',
    search: 'Search by name, SKU, or barcode',
    loading: 'Loading products…',
    empty: 'No products yet',
    name: 'Product name',
    externalRef: 'External reference',
    sku: 'SKU',
    barcode: 'Barcode',
    category: 'Category',
    description: 'Description',
    price: 'Price (IQD)',
    comparePrice: 'Compare-at price (IQD)',
    stock: 'Stock',
    threshold: 'Low-stock threshold',
    status: 'Status',
    allowFawri: 'Allow Fawri to use this product in replies',
    images: 'Image references',
    imageHint: 'One HTTPS URL or asset path per line. Base64 images are rejected.',
    variants: 'Variants',
    addVariant: 'Add variant',
    variantName: 'Variant name',
    options: 'Options',
    optionsHint: 'Example: color=Black, size=M',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    remove: 'Remove',
    deleteConfirm: 'Permanently delete this product?',
    loadFailed: 'Could not load products from the server',
    saveFailed: 'Could not save the product',
    saved: 'Product saved',
    deleted: 'Product deleted',
    importFailed: 'Could not import products',
    imported: 'Products imported',
    conflict: 'This product changed on another device. The latest version was loaded.',
    invalidJson: 'The JSON file is invalid',
    invalidFile: 'Choose a valid, reasonably sized JSON file',
    requiredName: 'Product name is required',
    invalidNumber: 'Check prices and quantities',
    inventoryFailed: 'Could not update inventory',
    version: 'Version',
    noSku: 'No SKU',
    statuses: {
      available: 'Available',
      low_stock: 'Low stock',
      out_of_stock: 'Out of stock',
      draft: 'Draft',
      hidden_from_fawri: 'Hidden from Fawri',
    },
  },
};

const EMPTY_DRAFT: ProductDraft = {
  external_ref: '',
  name: '',
  description: '',
  category: '',
  sku: '',
  barcode: '',
  price_iqd: '',
  compare_at_price_iqd: '',
  stock_quantity: '0',
  low_stock_threshold: '5',
  status: 'available',
  allow_fawri_reply: true,
  image_refs: '',
  variants: [],
};

function languageFromI18n(i18n: ReturnType<typeof useI18n>): LanguageCode {
  const value = String((i18n as unknown as { lang?: string }).lang || '');
  return value === 'ku' || value === 'en' ? value : 'ar';
}

function idempotencyKey(prefix: string): string {
  return `${prefix}-${window.crypto.randomUUID()}`;
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseOptions(value: string): Record<string, string> {
  const options: Record<string, string> = {};
  for (const pair of value.split(',')) {
    const [rawName, ...rawValue] = pair.split('=');
    const name = rawName?.trim();
    const optionValue = rawValue.join('=').trim();
    if (name && optionValue) options[name] = optionValue;
  }
  return options;
}

function optionsText(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');
}

function draftFromProduct(product: CatalogProduct): ProductDraft {
  return {
    external_ref: product.external_ref || '',
    name: product.name,
    description: product.description || '',
    category: product.category || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    price_iqd: String(product.price_iqd),
    compare_at_price_iqd:
      product.compare_at_price_iqd === undefined
        ? ''
        : String(product.compare_at_price_iqd),
    stock_quantity: String(product.stock_quantity),
    low_stock_threshold: String(product.low_stock_threshold),
    status:
      product.status === 'draft' || product.status === 'hidden_from_fawri'
        ? product.status
        : 'available',
    allow_fawri_reply: product.allow_fawri_reply,
    image_refs: product.image_refs
      .map(reference => reference.url || reference.storage_key || '')
      .filter(Boolean)
      .join('\n'),
    variants: product.variants.map(variant => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku || '',
      barcode: variant.barcode || '',
      price_iqd: variant.price_iqd === undefined ? '' : String(variant.price_iqd),
      stock_quantity: String(variant.stock_quantity),
      options: optionsText(variant.options),
    })),
  };
}

function statusVariant(status: ProductStatus) {
  if (status === 'available') return 'default' as const;
  if (status === 'out_of_stock') return 'destructive' as const;
  return 'secondary' as const;
}

export default function ServerProductsPage() {
  const i18n = useI18n();
  const language = languageFromI18n(i18n);
  const labels = LABELS[language];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createKeyRef = useRef<string | null>(null);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [inventoryBusy, setInventoryBusy] = useState<string | null>(null);

  const replaceProduct = (product: CatalogProduct) => {
    setProducts(current => {
      const exists = current.some(item => item.id === product.id);
      const next = exists
        ? current.map(item => (item.id === product.id ? product : item))
        : [product, ...current];
      return next.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    });
    setEditingProduct(current => (current?.id === product.id ? product : current));
  };

  const loadProducts = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/catalog/products', {
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.products)) {
        throw new Error(data?.error || labels.loadFailed);
      }
      setProducts(data.products as CatalogProduct[]);
      setLoadError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : labels.loadFailed;
      setLoadError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, [language]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(product =>
      [
        product.name,
        product.sku,
        product.barcode,
        product.external_ref,
        product.category,
        ...product.variants.flatMap(variant => [variant.name, variant.sku, variant.barcode]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [products, search]);

  const changeDraft = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => {
    createKeyRef.current = null;
    setDraft(current => ({ ...current, [key]: value }));
  };

  const openCreate = () => {
    setEditingProduct(null);
    setDraft(EMPTY_DRAFT);
    createKeyRef.current = null;
    setFormOpen(true);
  };

  const openEdit = (product: CatalogProduct) => {
    setEditingProduct(product);
    setDraft(draftFromProduct(product));
    createKeyRef.current = null;
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingProduct(null);
    setDraft(EMPTY_DRAFT);
    createKeyRef.current = null;
  };

  const updateVariant = (index: number, patch: Partial<VariantDraft>) => {
    createKeyRef.current = null;
    setDraft(current => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...patch } : variant,
      ),
    }));
  };

  const addVariant = () => {
    changeDraft('variants', [
      ...draft.variants,
      {
        name: '',
        sku: '',
        barcode: '',
        price_iqd: '',
        stock_quantity: '0',
        options: '',
      },
    ]);
  };

  const removeVariant = (index: number) => {
    changeDraft(
      'variants',
      draft.variants.filter((_, variantIndex) => variantIndex !== index),
    );
  };

  const buildPayload = () => {
    const price = numberOrUndefined(draft.price_iqd);
    const comparePrice = numberOrUndefined(draft.compare_at_price_iqd);
    const stock = numberOrUndefined(draft.stock_quantity);
    const threshold = numberOrUndefined(draft.low_stock_threshold);
    if (!draft.name.trim()) throw new Error(labels.requiredName);
    if (price === undefined || threshold === undefined) throw new Error(labels.invalidNumber);
    if (draft.variants.length === 0 && stock === undefined) {
      throw new Error(labels.invalidNumber);
    }

    const variants = draft.variants.map(variant => {
      const variantStock = numberOrUndefined(variant.stock_quantity);
      const variantPrice = numberOrUndefined(variant.price_iqd);
      if (variantStock === undefined || (variant.price_iqd.trim() && variantPrice === undefined)) {
        throw new Error(labels.invalidNumber);
      }
      return {
        ...(variant.id ? { id: variant.id } : {}),
        name: variant.name.trim(),
        sku: variant.sku.trim(),
        barcode: variant.barcode.trim(),
        ...(variantPrice === undefined ? {} : { price_iqd: variantPrice }),
        stock_quantity: variantStock,
        options: parseOptions(variant.options),
      };
    });
    const aggregateStock = variants.reduce(
      (total, variant) => total + variant.stock_quantity,
      0,
    );

    return {
      external_ref: draft.external_ref.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      category: draft.category.trim(),
      sku: draft.sku.trim(),
      barcode: draft.barcode.trim(),
      price_iqd: price,
      ...(comparePrice === undefined ? {} : { compare_at_price_iqd: comparePrice }),
      stock_quantity: variants.length > 0 ? aggregateStock : stock,
      low_stock_threshold: threshold,
      status: draft.status,
      allow_fawri_reply: draft.allow_fawri_reply,
      image_refs: draft.image_refs
        .split(/\r?\n/)
        .map(value => value.trim())
        .filter(Boolean)
        .map(value =>
          value.startsWith('http') || value.startsWith('/') || value.startsWith('asset://')
            ? { url: value }
            : { storage_key: value },
        ),
      variants,
    };
  };

  const saveProduct = async () => {
    if (saving) return;
    let payload: ReturnType<typeof buildPayload>;
    try {
      payload = buildPayload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.saveFailed);
      return;
    }

    setSaving(true);
    try {
      const creating = !editingProduct;
      if (creating && !createKeyRef.current) {
        createKeyRef.current = idempotencyKey('catalog-create');
      }
      const response = await fetch(
        creating
          ? '/api/catalog/products'
          : `/api/catalog/products/${encodeURIComponent(editingProduct.id)}`,
        {
          method: creating ? 'POST' : 'PATCH',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(creating && createKeyRef.current
              ? { 'Idempotency-Key': createKeyRef.current }
              : {}),
          },
          body: JSON.stringify({
            ...(creating ? {} : { expected_version: editingProduct.version }),
            product: payload,
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.product) {
        if (data?.code === 'CATALOG_VERSION_CONFLICT' && data.current_product) {
          replaceProduct(data.current_product as CatalogProduct);
          setDraft(draftFromProduct(data.current_product as CatalogProduct));
          toast.error(labels.conflict);
          return;
        }
        if (data?.code === 'CATALOG_IDEMPOTENCY_CONFLICT') createKeyRef.current = null;
        throw new Error(data?.error || labels.saveFailed);
      }
      replaceProduct(data.product as CatalogProduct);
      createKeyRef.current = null;
      setFormOpen(false);
      setEditingProduct(null);
      setDraft(EMPTY_DRAFT);
      toast.success(labels.saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = async (product: CatalogProduct) => {
    if (!window.confirm(labels.deleteConfirm)) return;
    setInventoryBusy(product.id);
    try {
      const response = await fetch(
        `/api/catalog/products/${encodeURIComponent(product.id)}`,
        {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expected_version: product.version }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        if (data?.code === 'CATALOG_VERSION_CONFLICT' && data.current_product) {
          replaceProduct(data.current_product as CatalogProduct);
          toast.error(labels.conflict);
          return;
        }
        throw new Error(data?.error || labels.saveFailed);
      }
      setProducts(current => current.filter(item => item.id !== product.id));
      if (editingProduct?.id === product.id) closeForm();
      toast.success(labels.deleted);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.saveFailed);
    } finally {
      setInventoryBusy(null);
    }
  };

  const adjustInventory = async (
    product: CatalogProduct,
    delta: number,
    variantId?: string,
  ) => {
    const busyKey = `${product.id}:${variantId || 'base'}`;
    if (inventoryBusy) return;
    setInventoryBusy(busyKey);
    try {
      const response = await fetch(
        `/api/inventory/products/${encodeURIComponent(product.id)}/adjust`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey('inventory-adjust'),
          },
          body: JSON.stringify({
            expected_version: product.version,
            ...(variantId ? { variant_id: variantId } : {}),
            delta,
            reason: 'merchant_dashboard_adjustment',
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.product) {
        if (data?.code === 'CATALOG_VERSION_CONFLICT' && data.current_product) {
          replaceProduct(data.current_product as CatalogProduct);
          toast.error(labels.conflict);
          return;
        }
        throw new Error(data?.error || labels.inventoryFailed);
      }
      replaceProduct(data.product as CatalogProduct);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.inventoryFailed);
    } finally {
      setInventoryBusy(null);
    }
  };

  const sendImport = async (pending: PendingImport) => {
    setSaving(true);
    try {
      const response = await fetch('/api/catalog/products/import', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': pending.idempotencyKey,
        },
        body: JSON.stringify({ products: pending.products }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.products)) {
        throw new Error(data?.error || labels.importFailed);
      }
      const imported = data.products as CatalogProduct[];
      setProducts(current => {
        const byId = new Map(current.map(product => [product.id, product]));
        for (const product of imported) byId.set(product.id, product);
        return Array.from(byId.values()).sort((left, right) =>
          right.updated_at.localeCompare(left.updated_at),
        );
      });
      setPendingImport(null);
      toast.success(`${labels.imported}: ${data.created_count ?? imported.length}`);
    } catch (error) {
      setPendingImport(pending);
      toast.error(error instanceof Error ? error.message : labels.importFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || file.size > 2_000_000 || !file.name.toLowerCase().endsWith('.json')) {
      toast.error(labels.invalidFile);
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const products = Array.isArray(parsed) ? parsed : parsed?.products;
      if (!Array.isArray(products) || products.length === 0) {
        throw new Error(labels.invalidJson);
      }
      const pending = {
        fileName: file.name,
        products,
        idempotencyKey: idempotencyKey('catalog-import'),
      };
      setPendingImport(pending);
      await sendImport(pending);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.invalidJson);
    }
  };

  const formatMoney = (value: number) =>
    `${new Intl.NumberFormat(language === 'en' ? 'en-US' : 'ar-IQ').format(value)} IQD`;

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={i18n.dir}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{labels.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{labels.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadProducts()} disabled={loading || saving}>
              {loading ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="me-2 h-4 w-4" />
              )}
              {labels.refresh}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              <Upload className="me-2 h-4 w-4" />
              {labels.import}
            </Button>
            <Button onClick={openCreate} disabled={saving}>
              <Plus className="me-2 h-4 w-4" />
              {labels.add}
            </Button>
          </div>
        </div>

        {pendingImport ? (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{pendingImport.fileName}: {labels.importFailed}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void sendImport(pendingImport)}
              disabled={saving}
            >
              {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {labels.retryImport}
            </Button>
          </div>
        ) : null}

        {loadError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={labels.search}
            className="ps-9"
          />
        </div>

        {formOpen ? (
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">
                {editingProduct ? labels.edit : labels.add}
              </h2>
              <Button variant="ghost" size="icon" onClick={closeForm} disabled={saving}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.name}</span>
                <Input value={draft.name} onChange={event => changeDraft('name', event.target.value)} />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.externalRef}</span>
                <Input
                  value={draft.external_ref}
                  onChange={event => changeDraft('external_ref', event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.category}</span>
                <Input
                  value={draft.category}
                  onChange={event => changeDraft('category', event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.sku}</span>
                <Input value={draft.sku} onChange={event => changeDraft('sku', event.target.value)} />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.barcode}</span>
                <Input
                  value={draft.barcode}
                  onChange={event => changeDraft('barcode', event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.status}</span>
                <select
                  value={draft.status}
                  onChange={event =>
                    changeDraft(
                      'status',
                      event.target.value as ProductDraft['status'],
                    )
                  }
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="available">{labels.statuses.available}</option>
                  <option value="draft">{labels.statuses.draft}</option>
                  <option value="hidden_from_fawri">
                    {labels.statuses.hidden_from_fawri}
                  </option>
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.price}</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.price_iqd}
                  onChange={event => changeDraft('price_iqd', event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.comparePrice}</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.compare_at_price_iqd}
                  onChange={event => changeDraft('compare_at_price_iqd', event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.stock}</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.stock_quantity}
                  disabled={draft.variants.length > 0}
                  onChange={event => changeDraft('stock_quantity', event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>{labels.threshold}</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.low_stock_threshold}
                  onChange={event => changeDraft('low_stock_threshold', event.target.value)}
                />
              </label>
              <label className="space-y-2 text-sm font-medium md:col-span-2 xl:col-span-3">
                <span>{labels.description}</span>
                <Textarea
                  value={draft.description}
                  onChange={event => changeDraft('description', event.target.value)}
                  rows={3}
                />
              </label>
              <label className="space-y-2 text-sm font-medium md:col-span-2 xl:col-span-3">
                <span className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" /> {labels.images}
                </span>
                <Textarea
                  value={draft.image_refs}
                  onChange={event => changeDraft('image_refs', event.target.value)}
                  rows={3}
                  placeholder={labels.imageHint}
                />
                <span className="block text-xs font-normal text-muted-foreground">
                  {labels.imageHint}
                </span>
              </label>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-xl border p-3 text-sm font-medium">
              <input
                type="checkbox"
                checked={draft.allow_fawri_reply}
                onChange={event => changeDraft('allow_fawri_reply', event.target.checked)}
                className="h-4 w-4"
              />
              {labels.allowFawri}
            </label>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 font-bold">
                  <Boxes className="h-4 w-4" /> {labels.variants}
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                  <Plus className="me-2 h-4 w-4" />
                  {labels.addVariant}
                </Button>
              </div>

              {draft.variants.map((variant, index) => (
                <div key={variant.id || index} className="rounded-xl border p-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <label className="space-y-1 text-xs font-medium">
                      <span>{labels.variantName}</span>
                      <Input
                        value={variant.name}
                        onChange={event => updateVariant(index, { name: event.target.value })}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      <span>{labels.sku}</span>
                      <Input
                        value={variant.sku}
                        onChange={event => updateVariant(index, { sku: event.target.value })}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      <span>{labels.barcode}</span>
                      <Input
                        value={variant.barcode}
                        onChange={event => updateVariant(index, { barcode: event.target.value })}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      <span>{labels.price}</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={variant.price_iqd}
                        onChange={event => updateVariant(index, { price_iqd: event.target.value })}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-medium">
                      <span>{labels.stock}</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={variant.stock_quantity}
                        onChange={event =>
                          updateVariant(index, { stock_quantity: event.target.value })
                        }
                      />
                    </label>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full"
                        onClick={() => removeVariant(index)}
                      >
                        <Trash2 className="me-2 h-4 w-4" />
                        {labels.remove}
                      </Button>
                    </div>
                    <label className="space-y-1 text-xs font-medium md:col-span-2 xl:col-span-6">
                      <span>{labels.options}</span>
                      <Input
                        value={variant.options}
                        placeholder={labels.optionsHint}
                        onChange={event => updateVariant(index, { options: event.target.value })}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={closeForm} disabled={saving}>
                {labels.cancel}
              </Button>
              <Button onClick={() => void saveProduct()} disabled={saving}>
                {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {labels.save}
              </Button>
            </div>
          </section>
        ) : null}

        {loading && products.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center gap-2 rounded-2xl border bg-card text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {labels.loading}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border bg-card text-center text-muted-foreground">
            <Package className="mb-3 h-12 w-12 opacity-30" />
            <span>{labels.empty}</span>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredProducts.map(product => (
              <article key={product.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold">{product.name}</h2>
                      <Badge variant={statusVariant(product.status)}>
                        {labels.statuses[product.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {product.sku || labels.noSku} · {labels.version} {product.version}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(product)}
                      disabled={Boolean(inventoryBusy)}
                      title={labels.edit}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void removeProduct(product)}
                      disabled={Boolean(inventoryBusy)}
                      title={labels.remove}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">{labels.price}</p>
                    <p className="mt-1 font-extrabold">{formatMoney(product.price_iqd)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">{labels.stock}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-extrabold">{product.stock_quantity}</span>
                      {product.variants.length === 0 ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void adjustInventory(product, -1)}
                            disabled={
                              Boolean(inventoryBusy) || product.stock_quantity === 0
                            }
                          >
                            −
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void adjustInventory(product, 1)}
                            disabled={Boolean(inventoryBusy)}
                          >
                            +
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {product.description ? (
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                    {product.description}
                  </p>
                ) : null}

                {product.variants.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <h3 className="text-sm font-bold">{labels.variants}</h3>
                    {product.variants.map(variant => {
                      const busyKey = `${product.id}:${variant.id}`;
                      return (
                        <div
                          key={variant.id}
                          className="flex items-center justify-between gap-3 rounded-xl border p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{variant.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {variant.sku || labels.noSku} · {optionsText(variant.options)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="min-w-8 text-center font-bold">
                              {variant.stock_quantity}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void adjustInventory(product, -1, variant.id)}
                              disabled={
                                Boolean(inventoryBusy) || variant.stock_quantity === 0
                              }
                            >
                              {inventoryBusy === busyKey ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                '−'
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void adjustInventory(product, 1, variant.id)}
                              disabled={Boolean(inventoryBusy)}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
