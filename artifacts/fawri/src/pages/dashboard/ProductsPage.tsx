import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant } from '@/lib/store';
import type { Lang, ProductStatus } from '@/lib/types';
import {
  CatalogApiError,
  currentProductFromConflict,
  createCatalogProduct,
  deleteCatalogProduct,
  getCatalogProduct,
  idempotencyAttemptForRequest,
  importCatalogProducts,
  listCatalogProducts,
  updateCatalogProduct,
  type CatalogIdempotencyAttempt,
  type CatalogImageInput,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogVariantInput,
} from '@/lib/catalogUiApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  Plus,
  Upload,
  X,
  Trash2,
  Pencil,
  Search,
  Bot,
  Tag,
  Boxes,
} from 'lucide-react';
import { toast } from 'sonner';

type ProductFormState = {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  original_price: string;
  current_price: string;
  quantity: string;
  status: ProductStatus;
  allow_fawri_reply: boolean;
};

type UiMessageKey =
  | 'loadFailed'
  | 'saveFailed'
  | 'deleteFailed'
  | 'versionConflict'
  | 'importValidation'
  | 'secureCryptoRequired'
  | 'variantQuantityLocked';

const messages: Record<UiMessageKey, Record<Lang, string>> = {
  loadFailed: {
    ar: 'تعذر تحميل المنتجات من الخادم.',
    ku: 'بارکردنی بەرهەمەکان لە سێرڤەر سەرکەوتوو نەبوو.',
    en: 'Could not load products from the server.',
  },
  saveFailed: {
    ar: 'لم يتم حفظ المنتج لأن الخادم رفض العملية.',
    ku: 'بەرهەمەکە پاشەکەوت نەکرا چونکە سێرڤەر داواکارییەکەی ڕەتکردەوە.',
    en: 'The product was not saved because the server rejected the request.',
  },
  deleteFailed: {
    ar: 'لم يتم حذف المنتج لأن الخادم رفض العملية.',
    ku: 'بەرهەمەکە نەسڕایەوە چونکە سێرڤەر داواکارییەکەی ڕەتکردەوە.',
    en: 'The product was not deleted because the server rejected the request.',
  },
  versionConflict: {
    ar: 'تم تعديل هذا المنتج من مكان آخر. تم تحميل أحدث نسخة من الخادم؛ راجعها وحاول مجددًا.',
    ku: 'ئەم بەرهەمە لە شوێنێکی تر گۆڕدراوە. نوێترین وەشانی سێرڤەر بارکرا؛ پێداچوونەوە بکە و دووبارە هەوڵ بدە.',
    en: 'This product changed elsewhere. The latest server version was loaded; review it and try again.',
  },
  importValidation: {
    ar: 'لم يبدأ الاستيراد بسبب أخطاء في الصفوف:',
    ku: 'هاوردەکردن دەستپێنەکرد چونکە هەڵە لە ڕیزەکان هەیە:',
    en: 'Import was not started because some rows are invalid:',
  },
  secureCryptoRequired: {
    ar: 'تعذر إنشاء مفتاح أمان للعملية. لم يتم الحفظ.',
    ku: 'دروستکردنی کلیلی پاراستن بۆ کردارەکە سەرکەوتوو نەبوو. پاشەکەوت نەکرا.',
    en: 'A secure request key could not be created. Nothing was saved.',
  },
  variantQuantityLocked: {
    ar: 'كمية المنتج ذي المتغيرات تُدار من مخزون المتغيرات.',
    ku: 'بڕی بەرهەمی خاوەن جۆراوجۆری لە کۆگای جۆراوجۆرییەکان بەڕێوەدەبرێت.',
    en: 'Quantity for products with variants is managed by variant inventory.',
  },
};

const validStatuses = new Set<ProductStatus>([
  'available',
  'low_stock',
  'out_of_stock',
  'draft',
  'hidden_from_fawri',
]);

const emptyForm: ProductFormState = {
  name: '',
  sku: '',
  barcode: '',
  category: '',
  description: '',
  original_price: '',
  current_price: '',
  quantity: '',
  status: 'available',
  allow_fawri_reply: true,
};

function localMessage(lang: Lang, key: UiMessageKey): string {
  return messages[key][lang] || messages[key].en;
}

function getStatusClass(status: ProductStatus) {
  switch (status) {
    case 'available':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'low_stock':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'out_of_stock':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'draft':
      return 'border-slate-200 bg-slate-50 text-slate-700';
    case 'hidden_from_fawri':
      return 'border-zinc-200 bg-zinc-50 text-zinc-700';
  }
}

function productCode(product: CatalogProduct): string {
  return product.external_ref || product.sku || product.barcode || product.id;
}

function formFromProduct(product: CatalogProduct): ProductFormState {
  return {
    name: product.name || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    category: product.category || '',
    description: product.description || '',
    original_price:
      product.compare_at_price_iqd === undefined
        ? ''
        : String(product.compare_at_price_iqd),
    current_price: String(product.price_iqd),
    quantity: String(product.stock_quantity),
    status: product.status,
    allow_fawri_reply: product.allow_fawri_reply,
  };
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeDigits(value: unknown): string {
  return cleanText(value)
    .replace(/[,\s]/g, '')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function parseNonNegativeInteger(value: unknown): number | null {
  const normalized = normalizeDigits(value);
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function optionalText(value: unknown): string | undefined {
  const normalized = cleanText(value);
  return normalized || undefined;
}

function booleanValue(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = cleanText(value).toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
}

function importVariant(
  rawValue: unknown,
  index: number,
  productSku?: string,
): CatalogVariantInput {
  const raw = objectRecord(rawValue);
  const rawOptions = objectRecord(raw.options);
  const color = optionalText(raw.color);
  const size = optionalText(raw.size);
  const options: Record<string, string> = Object.fromEntries(
    Object.entries(rawOptions)
      .map(([name, value]) => [cleanText(name), cleanText(value)] as const)
      .filter(([name, value]) => Boolean(name && value)),
  );
  if (color && !Object.keys(options).some(name => name.toLowerCase() === 'color')) {
    options.Color = color;
  }
  if (size && !Object.keys(options).some(name => name.toLowerCase() === 'size')) {
    options.Size = size;
  }

  const quantity = parseNonNegativeInteger(raw.stock_quantity ?? raw.quantity);
  const variantSku = optionalText(raw.sku);
  const variantImages = Array.isArray(raw.image_refs)
    ? (raw.image_refs as CatalogImageInput[])
    : Array.isArray(raw.images)
      ? (raw.images as CatalogImageInput[])
      : [];

  return {
    ...(optionalText(raw.id) ? { id: optionalText(raw.id) } : {}),
    name:
      optionalText(raw.name) ||
      Object.values(options).join(' / ') ||
      variantSku ||
      `Variant ${index + 1}`,
    ...(variantSku && variantSku !== productSku ? { sku: variantSku } : {}),
    ...(optionalText(raw.barcode) ? { barcode: optionalText(raw.barcode) } : {}),
    ...(parseNonNegativeInteger(raw.price_iqd ?? raw.price_override) !== null &&
    cleanText(raw.price_iqd ?? raw.price_override)
      ? {
          price_iqd: parseNonNegativeInteger(raw.price_iqd ?? raw.price_override) ?? 0,
        }
      : {}),
    stock_quantity: quantity ?? 0,
    options,
    image_refs: variantImages,
  };
}

function importInputFromRecord(
  rawValue: unknown,
  rowNumber: number,
): { input?: CatalogProductInput; errors: string[] } {
  const raw = objectRecord(rawValue);
  const errors: string[] = [];
  const name = optionalText(raw.name ?? raw.product ?? raw.title ?? raw['اسم المنتج']);
  const externalRef = optionalText(raw.external_ref ?? raw.code ?? raw['الكود']);
  const sku = optionalText(raw.sku);
  const barcode = optionalText(raw.barcode);
  const price = parseNonNegativeInteger(
    raw.price_iqd ?? raw.current_price ?? raw.price ?? raw['السعر'],
  );
  const comparePriceRaw =
    raw.compare_at_price_iqd ?? raw.original_price ?? raw['السعر الأصلي'];
  const comparePrice = cleanText(comparePriceRaw)
    ? parseNonNegativeInteger(comparePriceRaw)
    : undefined;
  const quantity = parseNonNegativeInteger(
    raw.stock_quantity ?? raw.quantity ?? raw['الكمية'],
  );
  const requestedStatus = optionalText(raw.status) || 'available';

  if (!name) errors.push(`row ${rowNumber}: name is required`);
  if (!externalRef && !sku && !barcode) {
    errors.push(`row ${rowNumber}: external_ref, SKU or barcode is required`);
  }
  if (price === null) errors.push(`row ${rowNumber}: price must be a non-negative integer`);
  if (comparePrice === null) {
    errors.push(`row ${rowNumber}: original price must be a non-negative integer`);
  }
  if (
    price !== null &&
    comparePrice !== undefined &&
    comparePrice !== null &&
    comparePrice < price
  ) {
    errors.push(`row ${rowNumber}: original price cannot be lower than current price`);
  }
  if (quantity === null) {
    errors.push(`row ${rowNumber}: quantity must be a non-negative integer`);
  }
  if (!validStatuses.has(requestedStatus as ProductStatus)) {
    errors.push(`row ${rowNumber}: status is invalid`);
  }

  if (errors.length > 0 || !name || price === null || quantity === null) {
    return { errors };
  }

  const variants = Array.isArray(raw.variants)
    ? raw.variants.map((variant, index) => importVariant(variant, index, sku))
    : [];
  const imageRefs = Array.isArray(raw.image_refs)
    ? (raw.image_refs as CatalogImageInput[])
    : Array.isArray(raw.images)
      ? (raw.images as CatalogImageInput[])
      : [];

  const input = {
    ...(externalRef ? { external_ref: externalRef } : {}),
    name,
    description: cleanText(raw.description ?? raw['الوصف']),
    category: cleanText(raw.category ?? raw['القسم']),
    ...(sku ? { sku } : {}),
    ...(barcode ? { barcode } : {}),
    price_iqd: price,
    ...(comparePrice !== undefined && comparePrice !== null
      ? { compare_at_price_iqd: comparePrice }
      : {}),
    ...(variants.length === 0 ? { stock_quantity: quantity } : {}),
    status: requestedStatus as ProductStatus,
    allow_fawri_reply: booleanValue(raw.allow_fawri_reply, true),
    image_refs: imageRefs,
    variants,
  } as CatalogProductInput;

  return { input, errors: [] };
}

function parseCsvRecords(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(header => header.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(value => value.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

function formatCatalogError(lang: Lang, prefix: UiMessageKey, error: unknown): string {
  if (error instanceof CatalogApiError) {
    return `${localMessage(lang, prefix)} (${error.code})`;
  }
  return localMessage(lang, prefix);
}

function productInputFromForm(
  form: ProductFormState,
  existing?: CatalogProduct,
): CatalogProductInput {
  const currentPrice = Number(form.current_price || form.original_price || 0);
  const comparePrice = form.original_price.trim()
    ? Number(form.original_price)
    : existing?.compare_at_price_iqd;
  const quantity = Number(form.quantity || 0);
  const hasVariants = Boolean(existing?.variants.length);

  return {
    name: form.name.trim(),
    description: form.description.trim(),
    category: form.category.trim(),
    sku: form.sku.trim(),
    barcode: form.barcode.trim(),
    price_iqd: currentPrice,
    ...(comparePrice !== undefined ? { compare_at_price_iqd: comparePrice } : {}),
    ...(!hasVariants ? { stock_quantity: quantity } : {}),
    ...(existing ? { low_stock_threshold: existing.low_stock_threshold } : {}),
    status: form.status,
    allow_fawri_reply: form.allow_fawri_reply,
  } as CatalogProductInput;
}

function upsertServerProduct(
  products: CatalogProduct[],
  product: CatalogProduct,
): CatalogProduct[] {
  const index = products.findIndex(item => item.id === product.id);
  if (index < 0) return [product, ...products];
  return products.map(item => (item.id === product.id ? product : item));
}

function FawriToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-orange-500' : 'bg-zinc-300'
      }`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-200 ${
          checked ? 'right-7' : 'right-1'
        }`}
      />
    </button>
  );
}

export default function ProductsPage() {
  const { t, lang, dir, isRTL } = useI18n();
  const merchant = getCurrentMerchant();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createAttemptRef = useRef<CatalogIdempotencyAttempt | null>(null);
  const importAttemptRef = useRef<CatalogIdempotencyAttempt | null>(null);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const statusOptions = useMemo<Array<{ value: ProductStatus; label: string }>>(
    () => [
      { value: 'available', label: t.products_available },
      { value: 'low_stock', label: t.products_low_stock },
      { value: 'out_of_stock', label: t.products_out_of_stock },
      { value: 'draft', label: t.products_draft },
      { value: 'hidden_from_fawri', label: t.products_hidden_from_fawri },
    ],
    [t],
  );

  const statusLabels = useMemo<Record<ProductStatus, string>>(
    () =>
      Object.fromEntries(statusOptions.map(option => [option.value, option.label])) as Record<
        ProductStatus,
        string
      >,
    [statusOptions],
  );

  const editingProduct = useMemo(
    () => products.find(product => product.id === editingProductId),
    [editingProductId, products],
  );

  const numberLocale = {
    ar: 'ar-IQ',
    ku: 'ckb-IQ',
    en: 'en-IQ',
  }[lang];

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      if (!merchant) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const serverProducts = await listCatalogProducts();
        if (isMounted) setProducts(serverProducts);
      } catch (error) {
        console.error('Failed to load canonical catalog products:', error);
        if (isMounted) {
          setProducts([]);
          toast.error(formatCatalogError(lang, 'loadFailed', error));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadProducts();
    return () => {
      isMounted = false;
    };
  }, [merchant?.id, lang]);

  const filteredProducts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return products;

    return products.filter(product =>
      [
        product.name,
        product.external_ref,
        product.sku,
        product.barcode,
        product.category,
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(search)),
    );
  }, [products, searchTerm]);

  if (!merchant) return null;

  const replaceConflictProduct = async (
    productId: string,
    error: unknown,
    replaceForm = false,
  ): Promise<boolean> => {
    if (!(error instanceof CatalogApiError) || error.code !== 'CATALOG_VERSION_CONFLICT') {
      return false;
    }

    let current = currentProductFromConflict(error);
    if (!current) {
      try {
        current = await getCatalogProduct(productId);
      } catch (reloadError) {
        console.error('Failed to reload product after catalog version conflict:', reloadError);
      }
    }

    if (current) {
      setProducts(existing => upsertServerProduct(existing, current as CatalogProduct));
      if (replaceForm) setForm(formFromProduct(current));
    }
    toast.error(localMessage(lang, 'versionConflict'));
    return true;
  };

  const openAddForm = () => {
    createAttemptRef.current = null;
    setForm(emptyForm);
    setEditingProductId(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    createAttemptRef.current = null;
    setIsFormOpen(false);
    setEditingProductId(null);
    setForm(emptyForm);
  };

  const updateForm = (field: keyof ProductFormState, value: string | boolean) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportProducts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const fileText = await file.text();
      let rawRows: unknown[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(fileText);
        const record = objectRecord(parsed);
        rawRows = Array.isArray(parsed)
          ? parsed
          : Array.isArray(record.products)
            ? (record.products as unknown[])
            : [];
      } else {
        rawRows = parseCsvRecords(fileText);
      }

      if (rawRows.length === 0) {
        toast.error(t.products_noImportProducts);
        return;
      }

      const inputs: CatalogProductInput[] = [];
      const errors: string[] = [];
      rawRows.forEach((row, index) => {
        const result = importInputFromRecord(row, index + 2);
        if (result.input) inputs.push(result.input);
        errors.push(...result.errors);
      });

      if (errors.length > 0) {
        toast.error(`${localMessage(lang, 'importValidation')} ${errors.slice(0, 3).join('; ')}`);
        return;
      }

      let attempt: CatalogIdempotencyAttempt;
      try {
        attempt = idempotencyAttemptForRequest(
          importAttemptRef.current,
          'catalog-import',
          { products: inputs },
        );
      } catch (error) {
        console.error('Secure catalog import key generation failed:', error);
        toast.error(localMessage(lang, 'secureCryptoRequired'));
        return;
      }
      importAttemptRef.current = attempt;

      const created = await importCatalogProducts(inputs, attempt.key);
      importAttemptRef.current = null;
      setProducts(existing => {
        let next = existing;
        for (const product of created) next = upsertServerProduct(next, product);
        return next;
      });
      toast.success(`${t.products_imported} ${created.length} ${t.products_productWord}`);
    } catch (error) {
      console.error('Catalog import failed:', error);
      toast.error(formatCatalogError(lang, 'saveFailed', error));
    }
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      toast.error(t.products_enterName);
      return false;
    }

    const originalPrice = form.original_price.trim()
      ? Number(form.original_price)
      : undefined;
    const currentPrice = Number(form.current_price || form.original_price || 0);
    const quantity = Number(form.quantity || 0);

    if (
      originalPrice !== undefined &&
      (!Number.isSafeInteger(originalPrice) || originalPrice < 0)
    ) {
      toast.error(t.products_enterValidPrice);
      return false;
    }
    if (!Number.isSafeInteger(currentPrice) || currentPrice < 0) {
      toast.error(t.products_enterValidSalePrice);
      return false;
    }
    if (originalPrice !== undefined && originalPrice < currentPrice) {
      toast.error(t.products_enterValidPrice);
      return false;
    }
    if (!editingProduct?.variants.length && (!Number.isSafeInteger(quantity) || quantity < 0)) {
      toast.error(t.products_enterValidQuantity);
      return false;
    }
    return true;
  };

  const handleSaveProduct = async () => {
    if (isSaving || !validateForm()) return;
    setIsSaving(true);

    try {
      if (editingProductId) {
        const current = products.find(product => product.id === editingProductId);
        if (!current) {
          toast.error(localMessage(lang, 'saveFailed'));
          return;
        }

        const input = productInputFromForm(form, current);
        try {
          const updated = await updateCatalogProduct(
            current.id,
            current.version,
            input,
          );
          setProducts(existing => upsertServerProduct(existing, updated));
          toast.success(t.products_updated);
          setIsFormOpen(false);
          setEditingProductId(null);
          setForm(emptyForm);
        } catch (error) {
          if (await replaceConflictProduct(current.id, error, true)) return;
          throw error;
        }
      } else {
        const input = productInputFromForm(form);
        let attempt: CatalogIdempotencyAttempt;
        try {
          attempt = idempotencyAttemptForRequest(
            createAttemptRef.current,
            'catalog-create',
            input,
          );
        } catch (error) {
          console.error('Secure catalog create key generation failed:', error);
          toast.error(localMessage(lang, 'secureCryptoRequired'));
          return;
        }
        createAttemptRef.current = attempt;

        const created = await createCatalogProduct(input, attempt.key);
        createAttemptRef.current = null;
        setProducts(existing => upsertServerProduct(existing, created));
        toast.success(t.products_added);
        setIsFormOpen(false);
        setEditingProductId(null);
        setForm(emptyForm);
      }
    } catch (error) {
      console.error('Canonical catalog save failed:', error);
      toast.error(formatCatalogError(lang, 'saveFailed', error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditProduct = (product: CatalogProduct) => {
    createAttemptRef.current = null;
    setEditingProductId(product.id);
    setForm(formFromProduct(product));
    setIsFormOpen(true);
  };

  const handleDeleteProduct = async (product: CatalogProduct) => {
    const confirmed = window.confirm(t.products_deleteConfirm);
    if (!confirmed) return;

    try {
      await deleteCatalogProduct(product.id, product.version);
      setProducts(existing => existing.filter(item => item.id !== product.id));
      toast.success(t.products_deleted);
    } catch (error) {
      if (await replaceConflictProduct(product.id, error)) return;
      console.error('Canonical catalog delete failed:', error);
      toast.error(formatCatalogError(lang, 'deleteFailed', error));
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json"
        className="hidden"
        onChange={handleImportProducts}
      />

      <div className="mb-5 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className={isRTL ? 'text-right' : 'text-left'}>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              {t.products_title}
            </h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t.products_subtitle}
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={openAddForm}
              className="h-11 rounded-xl bg-orange-500 px-4 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:bg-orange-600 active:scale-95"
            >
              <Plus className={isRTL ? 'ml-2 h-4 w-4' : 'mr-2 h-4 w-4'} />
              {t.products_addProduct}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleImportClick}
              className="h-11 rounded-xl px-4 text-sm font-bold active:scale-95"
            >
              <Upload className={isRTL ? 'ml-2 h-4 w-4' : 'mr-2 h-4 w-4'} />
              {t.products_importProducts}
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search
            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ${
              isRTL ? 'right-3' : 'left-3'
            }`}
          />
          <Input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder={t.products_search}
            className={`h-12 rounded-2xl ${isRTL ? 'pr-10' : 'pl-10'}`}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
          <Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
          <p className="text-lg text-muted-foreground">{t.products_loading}</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
          <Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
          <p className="text-lg font-semibold text-muted-foreground">
            {t.products_noProducts}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.products_noProductsDesc}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map(product => {
            const price = product.price_iqd;
            const quantity = product.stock_quantity;
            const status = product.status;
            const canReply = product.allow_fawri_reply;

            return (
              <div
                key={product.id}
                className="overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3 border-b p-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(status)}`}
                      >
                        {statusLabels[status]}
                      </Badge>

                      {canReply ? (
                        <Badge
                          variant="outline"
                          className="rounded-full border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700"
                        >
                          <Bot className={isRTL ? 'ml-1 h-3 w-3' : 'mr-1 h-3 w-3'} />
                          {t.products_fawriEnabled}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="rounded-full border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600"
                        >
                          {t.products_fawriDisabled}
                        </Badge>
                      )}
                    </div>

                    <h2 className="line-clamp-2 text-xl font-extrabold leading-snug">
                      {product.name}
                    </h2>

                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <p>
                        {t.products_code}: {productCode(product)}
                      </p>
                      {product.category && (
                        <p>
                          {t.products_category}: {product.category}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl"
                      onClick={() => handleEditProduct(product)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-10 w-10 rounded-xl"
                      onClick={() => void handleDeleteProduct(product)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-4">
                  <div className="rounded-2xl bg-muted/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Tag className="h-4 w-4" />
                      {t.products_price}
                    </div>
                    <p className="text-xl font-extrabold">
                      {price.toLocaleString(numberLocale)} {t.products_currency}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-muted/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                      <Boxes className="h-4 w-4" />
                      {t.products_quantity}
                    </div>
                    <p className="text-xl font-extrabold">
                      {quantity.toLocaleString(numberLocale)}
                    </p>
                  </div>
                </div>

                {product.description && (
                  <div className="px-4 pb-4">
                    <p className="rounded-2xl bg-muted/30 p-3 text-sm leading-7 text-muted-foreground">
                      {product.description}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-6 backdrop-blur-[2px] md:items-center md:px-4 md:py-6">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] bg-background shadow-2xl md:max-h-[calc(100dvh-4rem)]">
            <div className="shrink-0 border-b bg-background px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-extrabold">
                    {editingProductId ? t.products_editProduct : t.products_addProduct}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t.products_modalDesc}
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-2xl border bg-card text-muted-foreground shadow-sm transition hover:bg-muted"
                  onClick={closeForm}
                  disabled={isSaving}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div>
                <label className="mb-1 block text-sm font-semibold">
                  {t.products_productName}
                </label>
                <Input
                  value={form.name}
                  onChange={event => updateForm('name', event.target.value)}
                  placeholder={t.products_productNamePlaceholder}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    {t.products_originalPrice}
                  </label>
                  <Input
                    type="number"
                    dir="ltr"
                    value={form.original_price}
                    onChange={event => updateForm('original_price', event.target.value)}
                    placeholder="15000"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    {t.products_salePrice}
                  </label>
                  <Input
                    type="number"
                    dir="ltr"
                    value={form.current_price}
                    onChange={event => updateForm('current_price', event.target.value)}
                    placeholder="15000"
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  {t.products_quantity}
                </label>
                <Input
                  type="number"
                  dir="ltr"
                  value={form.quantity}
                  onChange={event => updateForm('quantity', event.target.value)}
                  placeholder="5"
                  className="h-11 rounded-xl"
                  disabled={Boolean(editingProduct?.variants.length)}
                  title={
                    editingProduct?.variants.length
                      ? localMessage(lang, 'variantQuantityLocked')
                      : undefined
                  }
                />
                {Boolean(editingProduct?.variants.length) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {localMessage(lang, 'variantQuantityLocked')}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  {t.products_category}
                </label>
                <Input
                  value={form.category}
                  onChange={event => updateForm('category', event.target.value)}
                  placeholder={t.products_categoryPlaceholder}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    {t.products_sku}
                  </label>
                  <Input
                    dir="ltr"
                    value={form.sku}
                    onChange={event => updateForm('sku', event.target.value)}
                    placeholder="SKU-001"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold">
                    {t.products_barcode}
                  </label>
                  <Input
                    dir="ltr"
                    value={form.barcode}
                    onChange={event => updateForm('barcode', event.target.value)}
                    placeholder="123456789"
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  {t.products_status}
                </label>
                <select
                  value={form.status}
                  onChange={event => updateForm('status', event.target.value as ProductStatus)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                >
                  {statusOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold">
                  {t.products_description}
                </label>
                <Textarea
                  value={form.description}
                  onChange={event => updateForm('description', event.target.value)}
                  placeholder={t.products_descriptionPlaceholder}
                  rows={3}
                  className="rounded-xl"
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-bold">{t.products_allowFawri}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t.products_allowFawriDesc}
                  </p>
                </div>

                <FawriToggle
                  checked={form.allow_fawri_reply}
                  onChange={checked => updateForm('allow_fawri_reply', checked)}
                />
              </div>
            </div>

            <div className="shrink-0 border-t bg-background px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Button
                type="button"
                onClick={() => void handleSaveProduct()}
                disabled={isSaving}
                className="h-12 w-full rounded-2xl bg-orange-500 text-base font-bold text-white hover:bg-orange-600 disabled:opacity-60"
              >
                {isSaving
                  ? t.products_saving
                  : editingProductId
                    ? t.products_saveChanges
                    : t.products_saveProduct}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
