import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CashierCatalogLookup,
  CashierPaymentMethod,
  CashierSaleLineInput,
} from '@/lib/cashierLocalContracts';
import type { CashierResolvedSalePricing } from '@/lib/cashierSalePricingRuntime';
import {
  createCashierPosRuntime,
  type CashierPosRuntime,
} from '@/lib/cashierPosRuntime';
import { subscribeCashierCatalogRefresh } from '@/lib/cashierCatalogRefresh';
import {
  getCashierSyncUiState,
  requestCashierSync,
  subscribeCashierSyncUiState,
  type CashierSyncUiState,
} from '@/lib/cashierSyncUiState';
import { CASHIER_UI_COPY } from '@/lib/cashierUiCopy';
import { useI18n } from '@/lib/i18n';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import type { Lang } from '@/lib/types';

type CartLine = { item: CashierCatalogLookup; quantity: number };
type SaleSuccess = {
  saleId: string;
  totalMinor: number;
  currencyCode: string;
  fractionDigits: number;
};

type PosLabels = (typeof CASHIER_UI_COPY)[Lang]['pos'];

const COMPACT_ITEMS_PER_PAGE = 100;

function itemKey(item: { product_id: string; variant_id?: string }): string {
  return `${item.product_id}\u0000${item.variant_id || ''}`;
}

function formatMoney(
  amountMinor: number,
  currencyCode: string,
  fractionDigits: number,
  lang: Lang,
): string {
  return formatMerchantMoneyMinor(amountMinor, currencyCode, fractionDigits, lang);
}

function catalogMatches(
  current: CashierCatalogLookup[],
  next: CashierCatalogLookup[],
): boolean {
  if (current.length !== next.length) return false;
  return current.every((item, index) => {
    const candidate = next[index];
    return Boolean(candidate) &&
      itemKey(item) === itemKey(candidate) &&
      item.name === candidate.name &&
      item.variant_name === candidate.variant_name &&
      item.sku === candidate.sku &&
      item.barcode === candidate.barcode &&
      item.item_type === candidate.item_type &&
      item.track_inventory === candidate.track_inventory &&
      item.stock_quantity === candidate.stock_quantity &&
      item.base_unit_price_minor === candidate.base_unit_price_minor &&
      item.currency_code === candidate.currency_code &&
      item.currency_fraction_digits === candidate.currency_fraction_digits &&
      item.catalog_version === candidate.catalog_version;
  });
}

function errorMessage(error: unknown, labels: PosLabels): string {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const message = error instanceof Error ? error.message : String(error || '');
  if (code === 'CASHIER_OUT_OF_STOCK' || message.includes('CASHIER_OUT_OF_STOCK')) {
    return labels.errorOutOfStock;
  }
  if (code === 'CASHIER_PROMOTION_CONFLICT' || message.includes('PROMOTION_CONFLICT')) {
    return labels.errorPromotionConflict;
  }
  if (code.includes('CURRENCY') || message.includes('CURRENCY')) {
    return labels.errorCurrencyConflict;
  }
  if (message.includes('ITEM_NOT_FOUND')) {
    return labels.errorItemNotFound;
  }
  return labels.errorSaleFailed;
}

function searchErrorMessage(lang: Lang): string {
  if (lang === 'ar') return 'تعذر البحث في كتالوج الكاشير. حاول مرة أخرى.';
  if (lang === 'ku') return 'گەڕان لە کاتەلۆگی کاشێر سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.';
  return 'Cashier catalog search failed. Try again.';
}

function isSyncSessionRequired(code?: string): boolean {
  return (
    code === 'CASHIER_OUTBOX_SESSION_REQUIRED' ||
    code === 'CASHIER_CLOUD_SESSION_REQUIRED'
  );
}

function syncButtonLabel(state: CashierSyncUiState, labels: PosLabels): string {
  if (state.status === 'syncing') return labels.syncing;
  if (state.status === 'synced') return labels.synced;
  if (state.status === 'needs_attention') {
    return isSyncSessionRequired(state.code)
      ? labels.loginRequired
      : labels.syncRequired;
  }
  return labels.sync;
}

function syncAttentionMessage(state: CashierSyncUiState, labels: PosLabels): string {
  return isSyncSessionRequired(state.code)
    ? labels.syncSessionMessage
    : labels.syncRetryMessage;
}

function syncButtonClassName(state: CashierSyncUiState): string {
  const base =
    'rounded-lg border px-3 py-1.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';
  if (state.status === 'needs_attention') {
    return `${base} border-amber-500 bg-amber-500 text-white hover:bg-amber-600`;
  }
  if (state.status === 'syncing') {
    return `${base} border-slate-900 bg-slate-900 text-white`;
  }
  if (state.status === 'synced') {
    return `${base} border-emerald-300 bg-emerald-50 text-emerald-700`;
  }
  return `${base} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
}

export default function CashierPosPage() {
  const { lang, dir } = useI18n();
  const labels = CASHIER_UI_COPY[lang].pos;
  const demoMode =
    import.meta.env.VITE_CASHIER_SMOKE === '1' &&
    new URLSearchParams(window.location.search).get('demo') === '1';
  const [runtime, setRuntime] = useState<CashierPosRuntime | null>(null);
  const [catalog, setCatalog] = useState<CashierCatalogLookup[]>([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCartKey, setActiveCartKey] = useState<string | null>(null);
  const [compactPage, setCompactPage] = useState(0);
  const [quote, setQuote] = useState<CashierResolvedSalePricing | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<CashierPaymentMethod>('cash');
  const [externalConfirmed, setExternalConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncUiState, setSyncUiState] = useState<CashierSyncUiState>(() =>
    getCashierSyncUiState(),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SaleSuccess | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const refreshCatalog = useCallback(async (
    activeRuntime: CashierPosRuntime,
    nextQuery: string,
    visible = true,
  ) => {
    if (visible) setSearching(true);
    try {
      const next = await activeRuntime.searchCatalog(nextQuery, 50);
      setCatalog(current => catalogMatches(current, next) ? current : next);
    } finally {
      if (visible) setSearching(false);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let activeRuntime: CashierPosRuntime | null = null;
    void createCashierPosRuntime({ demoMode })
      .then(async created => {
        activeRuntime = created;
        if (stopped) return;
        setRuntime(created);
        await refreshCatalog(created, '');
      })
      .catch(cause => {
        if (!stopped) setError(errorMessage(cause, labels));
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
      if (activeRuntime) void activeRuntime.close().catch(() => undefined);
    };
  }, [demoMode, labels, refreshCatalog]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => subscribeCashierSyncUiState(setSyncUiState), []);

  useEffect(() => {
    if (!runtime) return;
    return subscribeCashierCatalogRefresh(() => {
      void refreshCatalog(runtime, query, false).catch(() => undefined);
    });
  }, [query, refreshCatalog, runtime]);

  useEffect(() => {
    if (cart.length === 0) {
      setActiveCartKey(null);
      setCompactPage(0);
      return;
    }
    if (!activeCartKey || !cart.some(line => itemKey(line.item) === activeCartKey)) {
      setActiveCartKey(itemKey(cart[cart.length - 1].item));
    }
  }, [activeCartKey, cart]);

  const saleLines = useMemo<CashierSaleLineInput[]>(
    () =>
      cart.map(line => ({
        product_id: line.item.product_id,
        ...(line.item.variant_id ? { variant_id: line.item.variant_id } : {}),
        quantity: line.quantity,
      })),
    [cart],
  );

  useEffect(() => {
    if (!runtime || saleLines.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let stopped = false;
    const timer = window.setTimeout(() => {
      void runtime.quote(saleLines)
        .then(result => {
          if (!stopped) {
            setQuote(result);
            setQuoteError(null);
          }
        })
        .catch(cause => {
          if (!stopped) {
            setQuote(null);
            setQuoteError(errorMessage(cause, labels));
          }
        });
    }, 80);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [labels, runtime, saleLines]);

  const addItem = useCallback((item: CashierCatalogLookup) => {
    const key = itemKey(item);
    setError(null);
    setSuccess(null);
    setActiveCartKey(key);
    setCompactPage(0);
    setCart(current => {
      const existing = current.find(line => itemKey(line.item) === key);
      const currentQuantity = existing?.quantity || 0;
      if (
        item.track_inventory &&
        typeof item.stock_quantity === 'number' &&
        currentQuantity >= item.stock_quantity
      ) {
        setError(labels.errorNoExtraStock);
        return current;
      }
      if (existing) {
        return current.map(line =>
          itemKey(line.item) === key ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { item, quantity: 1 }];
    });
  }, [labels]);

  const updateQuantity = useCallback((key: string, next: number) => {
    setError(null);
    setCart(current =>
      current.flatMap(line => {
        if (itemKey(line.item) !== key) return [line];
        if (next <= 0) return [];
        const max = line.item.track_inventory ? line.item.stock_quantity : undefined;
        if (typeof max === 'number' && next > max) {
          setError(labels.errorQuantityExceedsStock);
          return [line];
        }
        return [{ ...line, quantity: next }];
      }),
    );
  }, [labels]);

  const performSearch = useCallback(async () => {
    if (!runtime) return;
    setError(null);
    const value = query.trim();
    try {
      if (value) {
        const exact = await runtime.lookupExact(value).catch(() => null);
        if (exact) {
          addItem(exact);
          setQuery('');
          await refreshCatalog(runtime, '', false);
          searchRef.current?.focus();
          return;
        }
      }
      await refreshCatalog(runtime, value);
    } catch {
      setError(searchErrorMessage(lang));
      searchRef.current?.focus();
    }
  }, [addItem, lang, query, refreshCatalog, runtime]);

  const completeSale = useCallback(async () => {
    if (!runtime || cart.length === 0 || !quote || quoteError) return;
    if (paymentMethod !== 'cash' && !externalConfirmed) {
      setError(labels.errorConfirmExternalPayment);
      return;
    }
    setCommitting(true);
    setError(null);
    setSuccess(null);
    try {
      const operationId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await runtime.commitSale({
        operation_id: operationId,
        payment_method: paymentMethod,
        payment_status: 'paid',
        lines: saleLines,
      });
      setSuccess({
        saleId: result.sale.sale_id,
        totalMinor: result.sale.total_minor,
        currencyCode: result.sale.currency_code,
        fractionDigits: result.sale.currency_fraction_digits,
      });
      setCart([]);
      setActiveCartKey(null);
      setCompactPage(0);
      setPaymentMethod('cash');
      setExternalConfirmed(false);
      await refreshCatalog(runtime, query, false);
      searchRef.current?.focus();
    } catch (cause) {
      setError(errorMessage(cause, labels));
      await refreshCatalog(runtime, query, false).catch(() => undefined);
    } finally {
      setCommitting(false);
    }
  }, [cart.length, externalConfirmed, labels, paymentMethod, query, quote, quoteError, refreshCatalog, runtime, saleLines]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const quoteByKey = useMemo(() => {
    const map = new Map<string, CashierResolvedSalePricing['lines'][number]>();
    for (const line of quote?.lines || []) map.set(itemKey(line), line);
    return map;
  }, [quote]);

  const activeLine = useMemo(
    () => cart.find(line => itemKey(line.item) === activeCartKey) || cart[cart.length - 1] || null,
    [activeCartKey, cart],
  );
  const compactLines = useMemo(
    () => cart.filter(line => !activeLine || itemKey(line.item) !== itemKey(activeLine.item)),
    [activeLine, cart],
  );
  const compactPageCount = Math.max(1, Math.ceil(compactLines.length / COMPACT_ITEMS_PER_PAGE));

  useEffect(() => {
    if (compactPage >= compactPageCount) setCompactPage(compactPageCount - 1);
  }, [compactPage, compactPageCount]);

  const visibleCompactLines = compactLines.slice(
    compactPage * COMPACT_ITEMS_PER_PAGE,
    compactPage * COMPACT_ITEMS_PER_PAGE + COMPACT_ITEMS_PER_PAGE,
  );

  const syncDisabled = !online || syncUiState.status === 'syncing';
  const syncNeedsAttention = syncUiState.status === 'needs_attention';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:h-[100dvh] lg:overflow-hidden" dir={dir}>
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col p-3 lg:h-full lg:min-h-0 lg:p-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-10 w-10 object-contain" />
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{labels.title}</h1>
              {demoMode ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{labels.demoMode}</span> : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className={`rounded-full px-3 py-1.5 font-semibold ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                {online ? labels.online : labels.offline}
              </span>
              <a href="/cashier.html?history=1" className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50">
                {labels.history}
              </a>
              <a href="/cashier.html?reports=1" className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50">
                {labels.reports}
              </a>
              <button
                type="button"
                onClick={requestCashierSync}
                disabled={syncDisabled}
                aria-live="polite"
                aria-describedby={syncNeedsAttention ? 'cashier-sync-message' : undefined}
                className={syncButtonClassName(syncUiState)}
              >
                {syncButtonLabel(syncUiState, labels)}
              </button>
            </div>
            {syncNeedsAttention ? (
              <p
                id="cashier-sync-message"
                role="status"
                className="max-w-[430px] rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-start text-xs font-medium leading-5 text-amber-800"
              >
                {syncAttentionMessage(syncUiState, labels)}
              </p>
            ) : null}
          </div>
        </header>

        {error ? <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {success ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <strong>{labels.saleSuccess}</strong>
            <span dir="ltr">{formatMoney(success.totalMinor, success.currencyCode, success.fractionDigits, lang)}</span>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
          <section className="flex min-h-[520px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0">
            <div className="border-b border-slate-100 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold">{labels.productsServices}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{labels.searchHint}</p>
                </div>
                <span className="text-xs text-slate-500">{labels.resultCount(catalog.length)}</span>
              </div>
              <div className="flex gap-2">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') void performSearch(); }}
                  placeholder={labels.searchPlaceholder}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  autoFocus
                />
                <button type="button" onClick={() => void performSearch()} disabled={!runtime || searching} className="h-11 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                  {searching ? labels.searching : labels.search}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex h-full min-h-56 items-center justify-center text-sm text-slate-500">{labels.openingCatalog}</div>
              ) : catalog.length === 0 ? (
                <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <div className="mb-3 text-3xl">⌁</div>
                  <h3 className="font-bold">{labels.noProducts}</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{labels.noProductsHint}</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {catalog.map(item => {
                    const soldOut = item.track_inventory && Number(item.stock_quantity || 0) <= 0;
                    return (
                      <button type="button" key={itemKey(item)} onClick={() => addItem(item)} disabled={soldOut} className="rounded-2xl border border-slate-200 p-4 text-start transition hover:border-orange-300 hover:bg-orange-50/40 disabled:cursor-not-allowed disabled:opacity-50">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{item.item_type === 'service' ? labels.service : labels.product}</span>
                          <span className="text-base font-bold" dir="ltr">{formatMoney(item.base_unit_price_minor, item.currency_code, item.currency_fraction_digits, lang)}</span>
                        </div>
                        <h3 className="font-bold leading-6">{item.name}</h3>
                        {item.variant_name ? <p className="mt-1 text-xs text-slate-500">{item.variant_name}</p> : null}
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{item.sku || item.barcode || labels.noCode}</span>
                          <span className={soldOut ? 'font-bold text-red-600' : ''}>{item.track_inventory ? labels.stock(item.stock_quantity ?? 0) : labels.inventoryUntracked}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0 lg:max-h-full">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-4">
              <div>
                <h2 className="font-bold">{labels.cart}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{labels.cartCount(cartCount)}</p>
              </div>
              {cart.length > 0 ? <button type="button" onClick={() => setCart([])} className="text-xs font-semibold text-red-600 hover:underline">{labels.clearCart}</button> : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3">
              {!activeLine ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-500">
                  <div className="mb-2 text-3xl">🛒</div>
                  {labels.emptyCart}
                </div>
              ) : (() => {
                const activeKey = itemKey(activeLine.item);
                const activePrice = quoteByKey.get(activeKey);
                const activeUnit = activePrice?.effective_unit_price_minor ?? activeLine.item.base_unit_price_minor;
                const activeTotal = activePrice?.line_total_minor ?? activeUnit * activeLine.quantity;
                return (
                  <>
                    <div className="flex min-h-0 flex-1 flex-col justify-between rounded-2xl border-2 border-orange-200 bg-orange-50/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-bold">{activeLine.item.name}</p>
                          {activeLine.item.variant_name ? <p className="mt-0.5 truncate text-xs text-slate-500">{activeLine.item.variant_name}</p> : null}
                          {activePrice?.promotion ? <p className="mt-1 text-xs font-semibold text-emerald-700">{activePrice.promotion.promotion_name}</p> : null}
                        </div>
                        <strong className="whitespace-nowrap text-base" dir="ltr">{formatMoney(activeTotal, activeLine.item.currency_code, activeLine.item.currency_fraction_digits, lang)}</strong>
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] text-slate-500">{labels.unitPrice}</p>
                          <p className="text-sm font-semibold" dir="ltr">{formatMoney(activeUnit, activeLine.item.currency_code, activeLine.item.currency_fraction_digits, lang)}</p>
                        </div>
                        <div className="flex items-center overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm" dir="ltr">
                          <button type="button" onClick={() => updateQuantity(activeKey, activeLine.quantity - 1)} className="h-10 w-12 text-xl hover:bg-slate-50">−</button>
                          <span className="min-w-12 text-center text-base font-bold">{activeLine.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(activeKey, activeLine.quantity + 1)} className="h-10 w-12 text-xl hover:bg-slate-50">+</button>
                        </div>
                      </div>
                    </div>

                    {compactLines.length > 0 ? (
                      <div className="shrink-0 rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-500">{labels.otherItems}</span>
                          {compactPageCount > 1 ? <span className="text-[11px] text-slate-400">{compactPage + 1}/{compactPageCount}</span> : null}
                        </div>
                        <div className="flex items-stretch gap-1.5">
                          {compactPageCount > 1 ? (
                            <button type="button" onClick={() => setCompactPage(page => (page - 1 + compactPageCount) % compactPageCount)} className="w-7 shrink-0 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-500 hover:bg-slate-100">‹</button>
                          ) : null}
                          <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
                            {visibleCompactLines.map(line => {
                              const key = itemKey(line.item);
                              const priced = quoteByKey.get(key);
                              const unit = priced?.effective_unit_price_minor ?? line.item.base_unit_price_minor;
                              const total = priced?.line_total_minor ?? unit * line.quantity;
                              return (
                                <button type="button" key={key} onClick={() => setActiveCartKey(key)} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-start transition hover:border-orange-300 hover:bg-orange-50">
                                  <p className="truncate text-[11px] font-bold">{line.item.name}</p>
                                  <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] text-slate-500">
                                    <span>×{line.quantity}</span>
                                    <span className="truncate" dir="ltr">{formatMoney(total, line.item.currency_code, line.item.currency_fraction_digits, lang)}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {compactPageCount > 1 ? (
                            <button type="button" onClick={() => setCompactPage(page => (page + 1) % compactPageCount)} className="w-7 shrink-0 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-500 hover:bg-slate-100">›</button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white p-3">
              {quoteError ? <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{quoteError}</div> : null}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-500"><span>{labels.subtotal}</span><span dir="ltr">{quote ? formatMoney(quote.subtotal_minor, quote.currency_code, quote.currency_fraction_digits, lang) : '—'}</span></div>
                <div className="flex justify-between text-emerald-700"><span>{labels.discount}</span><span dir="ltr">{quote ? `− ${formatMoney(quote.discount_minor, quote.currency_code, quote.currency_fraction_digits, lang)}` : '—'}</span></div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-lg font-bold"><span>{labels.total}</span><span dir="ltr">{quote ? formatMoney(quote.total_minor, quote.currency_code, quote.currency_fraction_digits, lang) : '—'}</span></div>
              </div>

              <div className="mt-2.5">
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{labels.paymentMethod}</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    ['cash', labels.cash],
                    ['card', labels.card],
                    ['electronic', labels.electronic],
                    ['other', labels.other],
                  ] as Array<[CashierPaymentMethod, string]>).map(([method, label]) => (
                    <button type="button" key={method} onClick={() => { setPaymentMethod(method); setExternalConfirmed(false); }} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${paymentMethod === method ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
                  ))}
                </div>
              </div>

              {paymentMethod !== 'cash' ? (
                <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                  <input type="checkbox" checked={externalConfirmed} onChange={event => setExternalConfirmed(event.target.checked)} className="mt-1 h-4 w-4" />
                  <span>{labels.externalPaymentConfirmed}</span>
                </label>
              ) : null}

              <button type="button" onClick={() => void completeSale()} disabled={cart.length === 0 || !quote || Boolean(quoteError) || committing || (paymentMethod !== 'cash' && !externalConfirmed)} className="mt-2.5 h-11 w-full rounded-xl bg-orange-600 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {committing ? labels.completingSale : labels.completeSale}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
