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
  adjustCatalogLocationInventory,
  CatalogApiError,
  createCatalogProduct,
  createStrongIdempotencyKey,
  deleteCatalogProduct,
  getCatalogProduct,
  getCatalogProductLocationInventory,
  idempotencyAttemptForRequest,
  listCatalogProducts,
  setCatalogLocationInventory,
  updateCatalogProduct,
  type CatalogIdempotencyAttempt,
  type CatalogProduct,
  type CatalogProductInput,
  type CatalogProductLocationInventory,
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
import { catalogEffectivePriceRange } from '@/lib/catalogPriceRange';
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
import { COMMERCE_CATALOG_COPY, type CommerceCatalogPageCopy } from '@/lib/translations/features/catalog/catalogEditorCopy';
import { formatMerchantNumber, merchantCurrencyLabel } from '@/lib/moneyUi';
import type { ProductStatus } from '@/lib/types';


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

function locationInventoryKey(
  locationId: string,
  productId: string,
  variantId?: string,
): string {
  return `${locationId}:${inventoryKey(productId, variantId)}`;
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

function itemStatusLabel(product: CatalogProduct, copy: CommerceCatalogPageCopy): string {
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

function itemStatusShortLabel(product: CatalogProduct, copy: CommerceCatalogPageCopy): string {
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

function InventoryControl({ copy, product, variant, currentQuantity, value, busy, onValue, onSet, onAdjust, compact = false }: {
  copy: CommerceCatalogPageCopy;
  product: CatalogProduct;
  variant?: CatalogVariant;
  currentQuantity?: number;
  value: string;
  busy: boolean;
  onValue: (value: string) => void;
  onSet: () => void;
  onAdjust: (delta: number) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'rounded-lg border bg-background px-2.5 py-2' : 'rounded-xl border bg-background p-3'}>
      <div className={compact ? 'mb-1.5 flex items-start justify-between gap-2' : 'mb-2 flex items-start justify-between gap-3'}>
        <div className="min-w-0">
          <p className={compact ? 'text-sm font-bold leading-5' : 'text-sm font-bold'}>{variant?.name || product.name}</p>
          {variant && variantOptionSummary(variant) && <p className={compact ? 'text-[11px] leading-4 text-muted-foreground' : 'text-xs text-muted-foreground'} dir="auto">{variantOptionSummary(variant)}</p>}
        </div>
        <Badge variant="outline" className={compact ? 'rounded-full px-2 py-0.5 text-xs' : 'rounded-full'}>{currentQuantity ?? variant?.stock_quantity ?? product.stock_quantity}</Badge>
      </div>
      <div className={compact ? 'grid grid-cols-[auto_1fr_auto_auto] gap-1.5' : 'grid grid-cols-[auto_1fr_auto_auto] gap-2'}>
        <Button type="button" variant="outline" size="icon" className={compact ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl'} disabled={busy} onClick={() => onAdjust(-1)}><Minus className="h-4 w-4" /></Button>
        <Input type="number" min={0} dir="ltr" value={value} disabled={busy} onChange={event => onValue(event.target.value)} className={compact ? 'h-9 rounded-lg' : 'h-10 rounded-xl'} />
        <Button type="button" variant="outline" className={compact ? 'h-9 rounded-lg px-2.5 text-xs' : 'h-10 rounded-xl'} disabled={busy} onClick={onSet}>{copy.inventorySet}</Button>
        <Button type="button" variant="outline" size="icon" className={compact ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl'} disabled={busy} onClick={() => onAdjust(1)}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export default function CommerceCatalogSimplifiedPage() {
  const { lang, dir, isRTL } = useI18n();
  const copy = COMMERCE_CATALOG_COPY[lang] || COMMERCE_CATALOG_COPY.en;
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
  const [locationInventory, setLocationInventory] = useState<CatalogProductLocationInventory | null>(null);
  const [locationInventoryLoading, setLocationInventoryLoading] = useState(false);
  const [locationInventoryError, setLocationInventoryError] = useState(false);
  const [locationInventoryReload, setLocationInventoryReload] = useState(0);
  const mutationBusy = saving || inventoryBusy !== null || deletingId !== null;

  const fractionDigits = commerceContext?.currency_fraction_digits ?? 0;
  const moneyStep = catalogCurrencyStep(fractionDigits);
  const priceExample = copy.priceExample(fractionDigits > 0 ? '19.99' : '15000');

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

  const syncLocationInventory = (snapshot: CatalogProductLocationInventory) => {
    setLocationInventory(snapshot);
    setInventoryValues(current => {
      const next = { ...current };
      for (const location of snapshot.locations) {
        for (const level of location.levels) {
          next[locationInventoryKey(
            location.id,
            snapshot.product_id,
            level.variant_id,
          )] = String(level.on_hand_quantity);
        }
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

  useEffect(() => {
    let active = true;
    if (!detailsProductId || !detailsProduct || !tracksInventory(detailsProduct)) {
      setLocationInventory(null);
      setLocationInventoryLoading(false);
      setLocationInventoryError(false);
      return () => {
        active = false;
      };
    }

    setLocationInventoryLoading(true);
    setLocationInventoryError(false);
    void getCatalogProductLocationInventory(detailsProductId)
      .then(snapshot => {
        if (!active) return;
        syncLocationInventory(snapshot);
      })
      .catch(error => {
        console.error('Location inventory load failed:', error);
        if (!active) return;
        setLocationInventory(null);
        setLocationInventoryError(true);
      })
      .finally(() => {
        if (active) setLocationInventoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [detailsProductId, detailsProduct?.version, locationInventoryReload]);

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
      if (tracksInventory(latest) && detailsProductId === productId) {
        const snapshot = await getCatalogProductLocationInventory(productId);
        syncLocationInventory(snapshot);
      }
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

  const setInventory = async (
    product: CatalogProduct,
    locationId: string,
    variant?: CatalogVariant,
  ) => {
    if (!authorityReady) {
      toast.error(copy.loadFailed);
      return;
    }
    if (mutationBusy) return;
    const key = locationInventoryKey(locationId, product.id, variant?.id);
    const quantity = parseQuantity(inventoryValues[key] ?? '');
    if (quantity === null) {
      toast.error(copy.invalidQuantity);
      return;
    }
    setInventoryBusy(key);
    try {
      const result = await setCatalogLocationInventory({
        productId: product.id,
        locationId,
        expectedVersion: product.version,
        quantity,
        ...(variant ? { variantId: variant.id } : {}),
      });
      setItems(current => upsert(current, result.product));
      syncInventory(result.product);
      syncLocationInventory(result.inventory);
      toast.success(copy.inventorySaved);
    } catch (error) {
      if (await loadConflict(product.id, error)) return;
      toast.error(copy.inventoryFailed);
    } finally {
      setInventoryBusy(null);
    }
  };

  const adjustInventory = async (
    product: CatalogProduct,
    locationId: string,
    delta: number,
    variant?: CatalogVariant,
  ) => {
    if (!authorityReady) {
      toast.error(copy.loadFailed);
      return;
    }
    if (mutationBusy) return;
    const key = locationInventoryKey(locationId, product.id, variant?.id);
    const request = {
      productId: product.id,
      locationId,
      expectedVersion: product.version,
      delta,
      ...(variant ? { variantId: variant.id } : {}),
      reason: 'merchant commerce catalog location inventory UX',
    };
    let attempt: CatalogIdempotencyAttempt;
    try {
      attempt = idempotencyAttemptForRequest(
        inventoryAttempt.current,
        'catalog-location-inventory-adjust',
        request,
      );
    } catch {
      toast.error(copy.secureCrypto);
      return;
    }
    inventoryAttempt.current = attempt;
    setInventoryBusy(key);
    try {
      const result = await adjustCatalogLocationInventory(request, attempt.key);
      inventoryAttempt.current = null;
      setItems(current => upsert(current, result.product));
      syncInventory(result.product);
      syncLocationInventory(result.inventory);
      toast.success(copy.inventorySaved);
    } catch (error) {
      if (await loadConflict(product.id, error)) return;
      toast.error(copy.inventoryFailed);
    } finally {
      setInventoryBusy(null);
    }
  };

  const formatPrice = (product: CatalogProduct, compact = false) => {
    const service = product.service_details;
    if (service?.price_type === 'custom') return copy.customPrice;
    if (service?.price_type === 'free') return copy.freePrice;
    if (!commerceContext) return '—';

    const digits = commerceContext.currency_fraction_digits;
    const currencyCode = String(commerceContext.currency_code || '').trim().toUpperCase();
    const currency = merchantCurrencyLabel(currencyCode, lang);
    const { minimum_iqd: minimumMinor, maximum_iqd: maximumMinor } = catalogEffectivePriceRange(product);

    const formatMinorAmount = (amountMinor: number) => {
      const amount = amountMinor / (10 ** digits);
      return formatMerchantNumber(amount, digits, true);
    };

    const minimum = formatMinorAmount(minimumMinor);
    const maximum = formatMinorAmount(maximumMinor);
    const hasRange = minimumMinor !== maximumMinor;
    const range = hasRange ? `${minimum} - ${maximum}` : minimum;
    return (
      <span
        className={`inline-flex max-w-full items-baseline gap-1 whitespace-nowrap ${compact && hasRange ? (lang === 'en' ? 'text-[clamp(8px,8cqi,12px)] tracking-tight' : 'text-xs') : ''}`}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <bdi dir="ltr" style={{ unicodeBidi: 'isolate-override' }}>{range}</bdi>
        <bdi dir={isRTL ? 'rtl' : 'ltr'} style={{ unicodeBidi: 'isolate' }}>{currency}</bdi>
      </span>
    );
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
                    {type === 'service' ? (
                      <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground">
                        <CalendarClock className="me-1 h-3 w-3" />
                        {copy.booking}: {service?.booking_required === false ? copy.bookingOptional : copy.bookingRequired}
                      </Badge>
                    ) : hasVariants ? (
                      <Badge variant="outline" className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground">
                        <Boxes className="me-1 h-3 w-3" />
                        {copy.variants}: {product.variants.length}
                      </Badge>
                    ) : null}
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
                      <p className="mt-1 min-w-0 whitespace-nowrap text-base font-extrabold [container-type:inline-size]" dir="ltr">{formatPrice(product, true)}</p>
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
                    className="h-full w-full object-contain object-center"
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
                <div className="mb-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-extrabold">{copy.inventoryByLocation}</h4>
                    {locationInventory && (
                      <Badge variant="outline" className="rounded-full bg-background">
                        {locationInventory.locations.length}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {copy.inventoryLocationHint}
                  </p>
                </div>

                {locationInventoryLoading ? (
                  <div className="flex min-h-24 items-center justify-center rounded-xl border bg-background text-sm text-muted-foreground">
                    <RefreshCw className="me-2 h-4 w-4 animate-spin" />
                    {copy.inventoryLoading}
                  </div>
                ) : locationInventoryError ? (
                  <div className="rounded-xl border border-destructive/30 bg-background p-4 text-center">
                    <p className="text-sm font-semibold text-destructive">{copy.inventoryFailed}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 rounded-xl"
                      onClick={() => setLocationInventoryReload(value => value + 1)}
                    >
                      <RefreshCw className="me-2 h-4 w-4" />
                      {copy.inventoryRetry}
                    </Button>
                  </div>
                ) : locationInventory ? (
                  <div className="space-y-3">
                    {locationInventory.locations.map(location => (
                      <div key={location.id} className="rounded-xl border bg-background p-3">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <p className="font-bold">{location.name}</p>
                          {location.is_default && (
                            <Badge variant="outline" className="rounded-full text-[11px]">
                              {copy.defaultLocation}
                            </Badge>
                          )}
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          {detailsProduct.variants.length > 0
                            ? detailsProduct.variants.map(variant => {
                                const level = location.levels.find(
                                  item => item.variant_id === variant.id,
                                );
                                const currentQuantity = level?.on_hand_quantity ?? 0;
                                const key = locationInventoryKey(
                                  location.id,
                                  detailsProduct.id,
                                  variant.id,
                                );
                                return (
                                  <InventoryControl
                                    key={`${location.id}:${variant.id}`}
                                    copy={copy}
                                    product={detailsProduct}
                                    variant={variant}
                                    currentQuantity={currentQuantity}
                                    compact
                                    value={inventoryValues[key] ?? String(currentQuantity)}
                                    busy={mutationBusy || !authorityReady || locationInventoryLoading}
                                    onValue={value =>
                                      setInventoryValues(current => ({
                                        ...current,
                                        [key]: value,
                                      }))
                                    }
                                    onSet={() =>
                                      void setInventory(
                                        detailsProduct,
                                        location.id,
                                        variant,
                                      )
                                    }
                                    onAdjust={delta =>
                                      void adjustInventory(
                                        detailsProduct,
                                        location.id,
                                        delta,
                                        variant,
                                      )
                                    }
                                  />
                                );
                              })
                            : (() => {
                                const level = location.levels.find(
                                  item => !item.variant_id,
                                );
                                const currentQuantity = level?.on_hand_quantity ?? 0;
                                const key = locationInventoryKey(
                                  location.id,
                                  detailsProduct.id,
                                );
                                return (
                                  <InventoryControl
                                    key={`${location.id}:product`}
                                    copy={copy}
                                    product={detailsProduct}
                                    currentQuantity={currentQuantity}
                                    compact
                                    value={inventoryValues[key] ?? String(currentQuantity)}
                                    busy={mutationBusy || !authorityReady || locationInventoryLoading}
                                    onValue={value =>
                                      setInventoryValues(current => ({
                                        ...current,
                                        [key]: value,
                                      }))
                                    }
                                    onSet={() =>
                                      void setInventory(
                                        detailsProduct,
                                        location.id,
                                      )
                                    }
                                    onAdjust={delta =>
                                      void adjustInventory(
                                        detailsProduct,
                                        location.id,
                                        delta,
                                      )
                                    }
                                  />
                                );
                              })()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
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

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.name}</span>
              <Input data-catalog-primary-input="true" value={form.name} onChange={event => patchForm({ name: event.target.value })} placeholder={copy.namePlaceholder} className="h-10 rounded-xl" />
            </label>

            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.category}</span>
              <Input value={form.category} onChange={event => patchForm({ category: event.target.value })} placeholder={copy.categoryPlaceholder} className="h-10 rounded-xl" />
            </label>

            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.basePrice}</span>
              <Input type="number" min={0} step={moneyStep} inputMode="decimal" dir="ltr" value={form.current_price} onChange={event => patchForm({ current_price: event.target.value })} disabled={form.item_type === 'service' && (form.service_price_type === 'free' || form.service_price_type === 'custom')} placeholder={priceExample} className="h-10 rounded-xl" />
            </label>
          </div>

          {form.item_type === 'service' && (
            <label className="space-y-1 text-sm font-semibold">
              <span>{copy.sku}</span>
              <Input dir="ltr" value={form.sku} onChange={event => patchForm({ sku: event.target.value })} className="h-11 rounded-xl" />
              <span className="block text-xs font-normal leading-5 text-muted-foreground">{copy.skuHint}</span>
            </label>
          )}

          {(form.item_type === 'service' || !form.track_inventory) && (
            <div className="flex items-start gap-3 rounded-2xl border bg-muted/10 p-4">
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

        </CatalogEditorShell>
      )}
    </div>
  );
}