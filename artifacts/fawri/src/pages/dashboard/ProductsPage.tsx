import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant, getProducts, saveProducts } from '@/lib/store';
import { Product, ProductStatus } from '@/lib/types';
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

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function getPrice(product: Product) {
  return Number(
    (product as any).current_price ||
      (product as any).original_price ||
      (product as any).price ||
      0
  );
}

function getQuantity(product: Product) {
  return Number((product as any).quantity || 0);
}

function normalizeProducts(products: Product[], merchantId?: string, fallbackName = 'Unnamed Product') {
  return products.map((product, index) => ({
    ...product,
    id: product.id || (product as any).code || makeId(`product-${index}`),
    merchant_id: merchantId || product.merchant_id,
    name: product.name || fallbackName,
    code: (product as any).code || `B${index + 1001}`,
    sku: (product as any).sku || '',
    barcode: (product as any).barcode || '',
    category: (product as any).category || '',
    description: (product as any).description || '',
    original_price: Number((product as any).original_price || (product as any).price || 0),
    current_price: Number((product as any).current_price || (product as any).price || 0),
    quantity: Number((product as any).quantity || 0),
    status: ((product as any).status || 'available') as ProductStatus,
    allow_fawri_reply: (product as any).allow_fawri_reply !== false,
    images: Array.isArray((product as any).images) ? (product as any).images : [],
    variants: Array.isArray((product as any).variants) ? (product as any).variants : [],
    created_at: (product as any).created_at || new Date().toISOString(),
  })) as Product[];
}

function parseCsvProducts(text: string, merchantId: string, fallbackName: string): Product[] {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

  return lines.slice(1).map((line, index) => {
    const values = line.split(',').map(v => v.trim());
    const row: Record<string, string> = {};

    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });

    const name = row.name || row['اسم المنتج'] || row.product || row.title || '';

    return {
      id: makeId('product'),
      merchant_id: merchantId,
      code: row.code || row['الكود'] || `B${index + 1001}`,
      name: name || fallbackName,
      sku: row.sku || '',
      barcode: row.barcode || '',
      category: row.category || row['القسم'] || '',
      description: row.description || row['الوصف'] || '',
      original_price: Number(row.original_price || row.price || row['السعر'] || 0),
      current_price: Number(row.current_price || row.price || row['السعر'] || 0),
      quantity: Number(row.quantity || row['الكمية'] || 0),
      status: (row.status || 'available') as ProductStatus,
      allow_fawri_reply: true,
      images: [],
      variants: [],
      created_at: new Date().toISOString(),
    } as Product;
  });
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
  const merchantId = merchant?.id || '';
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const statusOptions = useMemo<
    Array<{ value: ProductStatus; label: string }>
  >(
    () => [
      { value: 'available', label: t.products_available },
      { value: 'low_stock', label: t.products_low_stock },
      { value: 'out_of_stock', label: t.products_out_of_stock },
      { value: 'draft', label: t.products_draft },
      { value: 'hidden_from_fawri', label: t.products_hidden_from_fawri },
    ],
    [t]
  );

  const statusLabels = useMemo<Record<ProductStatus, string>>(
    () =>
      Object.fromEntries(
        statusOptions.map(option => [option.value, option.label])
      ) as Record<ProductStatus, string>,
    [statusOptions]
  );

  const getStatusLabel = (status: ProductStatus) => statusLabels[status];

  const numberLocale = {
    ar: 'ar-IQ',
    ku: 'ckb-IQ',
    en: 'en-IQ',
  }[lang];

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      if (!merchantId) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const localProducts = getProducts(merchantId) || [];
        if (isMounted) setProducts(localProducts);

        const response = await fetch(
          `/api/products?merchantId=${encodeURIComponent(merchantId)}`
        );

        const data = await response.json().catch(() => null);

        if (data?.ok && Array.isArray(data.products)) {
          const cleanProducts = normalizeProducts(
            data.products as Product[],
            merchantId,
            t.products_unnamed
          );

          if (isMounted) {
            setProducts(cleanProducts);
            saveProducts(cleanProducts, merchantId);
          }
        }
      } catch (error) {
        console.error('Failed to load products:', error);
        if (isMounted) setProducts(getProducts(merchantId) || []);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, [merchantId, t.products_unnamed]);

  const filteredProducts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return products;

    return products.filter(product => {
      return (
        product.name?.toLowerCase().includes(search) ||
        ((product as any).code || '').toLowerCase().includes(search) ||
        ((product as any).sku || '').toLowerCase().includes(search) ||
        ((product as any).category || '').toLowerCase().includes(search)
      );
    });
  }, [products, searchTerm]);

  if (!merchant) return null;

  const openAddForm = () => {
    setForm(emptyForm);
    setEditingProductId(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingProductId(null);
    setForm(emptyForm);
  };

  const updateForm = (field: keyof ProductFormState, value: string | boolean) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const syncProductsToBot = async (nextProducts: Product[]) => {
    if (!merchantId) {
      console.error('Cannot sync products to bot: merchantId is missing');
      return false;
    }

    try {
      const response = await fetch('/api/bot/products/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId, products: nextProducts }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        console.error('Products sync to bot failed:', data);
        toast.error(t.products_bot_sync_rejected);
        return false;
      }

      console.log('Products synced to bot:', data);
      return true;
    } catch (error) {
      console.error('Failed to sync products to bot:', error);
      toast.error(t.products_bot_sync_failed);
      return false;
    }
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
      let importedProducts: Product[] = [];

      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(fileText);
        const rawProducts = Array.isArray(parsed) ? parsed : parsed.products;

        if (!Array.isArray(rawProducts)) {
          toast.error(t.products_jsonError);
          return;
        }

        importedProducts = normalizeProducts(
          rawProducts as Product[],
          merchantId,
          t.products_unnamed
        );
      } else {
        importedProducts = parseCsvProducts(fileText, merchantId, t.products_unnamed);
      }

      if (importedProducts.length === 0) {
        toast.error(t.products_noImportProducts);
        return;
      }

      const nextProducts = [...importedProducts, ...products];

      setProducts(nextProducts);
      saveProducts(nextProducts, merchantId);
      await syncProductsToBot(nextProducts);

      toast.success(`${t.products_imported} ${importedProducts.length} ${t.products_productWord}`);
    } catch (error) {
      console.error('Import products failed:', error);
      toast.error(t.products_importFailed);
    }
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      toast.error(t.products_enterName);
      return false;
    }

    const originalPrice = Number(form.original_price || 0);
    const currentPrice = Number(form.current_price || form.original_price || 0);
    const quantity = Number(form.quantity || 0);

    if (Number.isNaN(originalPrice) || originalPrice < 0) {
      toast.error(t.products_enterValidPrice);
      return false;
    }

    if (Number.isNaN(currentPrice) || currentPrice < 0) {
      toast.error(t.products_enterValidSalePrice);
      return false;
    }

    if (Number.isNaN(quantity) || quantity < 0) {
      toast.error(t.products_enterValidQuantity);
      return false;
    }

    return true;
  };

  const buildProduct = (apiProduct?: Product): Product => {
    const originalPrice = Number(form.original_price || 0);
    const currentPrice = Number(form.current_price || form.original_price || 0);
    const quantity = Number(form.quantity || 0);

    return {
      ...(apiProduct || {}),
      id: apiProduct?.id || editingProductId || makeId('product'),
      merchant_id: merchantId,
      code: (apiProduct as any)?.code || `B${products.length + 1001}`,
      name: form.name.trim(),
      sku: form.sku.trim(),
      barcode: form.barcode.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      original_price: originalPrice,
      current_price: currentPrice,
      quantity,
      status: form.status,
      allow_fawri_reply: form.allow_fawri_reply,
      images: Array.isArray((apiProduct as any)?.images) ? (apiProduct as any).images : [],
      variants: Array.isArray((apiProduct as any)?.variants) ? (apiProduct as any).variants : [],
      created_at: (apiProduct as any)?.created_at || new Date().toISOString(),
    } as Product;
  };

  const handleSaveProduct = async () => {
    if (isSaving) return;
    if (!validateForm()) return;

    setIsSaving(true);

    try {
      let savedProduct: Product | undefined;

      if (!editingProductId) {
        try {
          const response = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant_id: merchantId,
              name: form.name.trim(),
              sku: form.sku.trim(),
              barcode: form.barcode.trim(),
              category: form.category.trim(),
              description: form.description.trim(),
              original_price: Number(form.original_price || 0),
              current_price: Number(form.current_price || form.original_price || 0),
              price: Number(form.current_price || form.original_price || 0),
              quantity: Number(form.quantity || 0),
              status: form.status,
              allow_fawri_reply: form.allow_fawri_reply,
            }),
          });

          const data = await response.json().catch(() => null);

          if (response.ok && data?.ok && data.product) {
            savedProduct = data.product as Product;
          }
        } catch (apiError) {
          console.error('Create product API failed, saving locally:', apiError);
        }
      }

      const finalProduct = buildProduct(savedProduct);
      const nextProducts = editingProductId
        ? products.map(product =>
            product.id === editingProductId ? finalProduct : product
          )
        : [finalProduct, ...products];

      setProducts(nextProducts);
      saveProducts(nextProducts, merchantId);
      await syncProductsToBot(nextProducts);

      toast.success(editingProductId ? t.products_updated : t.products_added);

      setIsFormOpen(false);
      setEditingProductId(null);
      setForm(emptyForm);
    } catch (error) {
      console.error('Save product failed:', error);
      toast.error(t.products_saveError);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProductId(product.id || null);

    setForm({
      name: product.name || '',
      sku: (product as any).sku || '',
      barcode: (product as any).barcode || '',
      category: (product as any).category || '',
      description: (product as any).description || '',
      original_price: String((product as any).original_price || getPrice(product) || ''),
      current_price: String((product as any).current_price || getPrice(product) || ''),
      quantity: String((product as any).quantity || ''),
      status: ((product as any).status || 'available') as ProductStatus,
      allow_fawri_reply: (product as any).allow_fawri_reply !== false,
    });

    setIsFormOpen(true);
  };

  const handleDeleteProduct = async (productId?: string) => {
    if (!productId) return;

    const confirmed = window.confirm(t.products_deleteConfirm);
    if (!confirmed) return;

    const nextProducts = products.filter(product => product.id !== productId);

    setProducts(nextProducts);
    saveProducts(nextProducts, merchantId);
    await syncProductsToBot(nextProducts);

    toast.success(t.products_deleted);
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
          {filteredProducts.map((product, index) => {
            const price = getPrice(product);
            const quantity = getQuantity(product);
            const status = product.status;
            const canReply = product.allow_fawri_reply !== false;

            return (
              <div
                key={product.id || `${product.name}-${index}`}
                className="overflow-hidden rounded-3xl border bg-card shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3 border-b p-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(status)}`}
                      >
                        {getStatusLabel(status)}
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
                        {t.products_code}: {(product as any).code || '-'}
                      </p>
                      {(product as any).category && (
                        <p>
                          {t.products_category}: {(product as any).category}
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
                      onClick={() => handleDeleteProduct(product.id)}
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

                {(product as any).description && (
                  <div className="px-4 pb-4">
                    <p className="rounded-2xl bg-muted/30 p-3 text-sm leading-7 text-muted-foreground">
                      {(product as any).description}
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
                />
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
                  onChange={event =>
                    updateForm('status', event.target.value as ProductStatus)
                  }
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
                onClick={handleSaveProduct}
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