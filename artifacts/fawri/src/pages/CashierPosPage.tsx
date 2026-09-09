import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CashierCheckoutModal from '@/components/cashier/CashierCheckoutModal';
import {
  appendCashierScannerKey,
  completeCashierScannerBuffer,
  emptyCashierScannerBuffer,
  isCashierScannerTerminator,
  type CashierScannerBuffer,
} from '@/lib/cashierBarcodeScanner';
import type {
  CashierCatalogLookup,
  CashierPaymentMethod,
  CashierSaleLineInput,
} from '@/lib/cashierLocalContracts';
import { CASHIER_POS_ENHANCEMENT_COPY } from '@/lib/cashierPosEnhancementCopy';
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
  changeDueMinor?: number;
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

function normalizeCashDigits(value: string): string {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternArabic = '۰۱۲۳۴۵۶۷۸۹';
  return String(value || '')
    .split('')
    .map(character => {
      const arabicIndex = arabicIndic.indexOf(character);
      if (arabicIndex >= 0) return String(arabicIndex);
      const easternIndex = easternArabic.indexOf(character);
      if (easternIndex >= 0) return String(easternIndex);
      return character;
    })
    .join('')
    .replace(/[^0-9]/g, '')
    .replace(/^0+(?=\d)/, '');
}

function parseCashTenderMinor(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function runtimeErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
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
  const code = runtimeErrorCode(error);
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
  if (
    code === 'CASHIER_OFFLINE_INVENTORY_AUTHORITY_REQUIRED' ||
    message.includes('CASHIER_OFFLINE_INVENTORY_AUTHORITY_REQUIRED')
  ) {
    return labels.errorOfflineInventoryAuthorityRequired;
  }
  if (code.includes('CASH_TENDER') || code.includes('CASH_CHANGE')) {
    return labels.errorCashTenderInvalid;
  }
  return labels.errorSaleFailed;
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
  const extra = CASHIER_POS_ENHANCEMENT_COPY[lang];
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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CashierPaymentMethod>('cash');
  const [cashTenderText, setCashTenderText] = useState('');
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
  const scannerBufferRef = useRef<CashierScannerBuffer>(emptyCashierScannerBuffer());

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
      setCheckoutOpen(false);
      return;
    }
    if (!activeCartKey || !cart.some(line => itemKey(line.item) === activeCartKey)) {
      setActiveCartKey(itemKey(cart[cart.length - 1].item));
    }
  }, [activeCartKey, cart]);

  const saleLines = useMemo<CashierSaleLineInput[]>(
    () => cart.map(line => ({
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

  const cashTenderedMinor = useMemo(
    () => parseCashTenderMinor(cashTenderText),
    [cashTenderText],
  );

  const changeDueMinor = useMemo(() => {
    if (
      paymentMethod !== 'cash' ||
      !quote ||
      cashTenderedMinor === null ||
      cashTenderedMinor < quote.total_minor
    ) {
      return null;
    }
    const change = cashTenderedMinor - quote.total_minor;
    return Number.isSafeInteger(change) && change >= 0 ? change : null;
  }, [cashTenderedMinor, paymentMethod, quote]);

  const cashTenderReady =
    paymentMethod !== 'cash' ||
    Boolean(quote && cashTenderedMinor !== null && changeDueMinor !== null);

  const resetPaymentDraft = useCallback(() => {
    setCashTenderText('');
    setExternalConfirmed(false);
    setError(null);
  }, []);

  const addItem = useCallback((item: CashierCatalogLookup) => {
    const key = itemKey(item);
    setError(null);
    setSuccess(null);
    setCashTenderText('');
    setExternalConfirmed(false);
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
    setCashTenderText('');
    setExternalConfirmed(false);
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

  const scannerError = useCallback((cause: unknown): string => {
    const code = runtimeErrorCode(cause);
    if (code === 'CASHIER_BARCODE_AMBIGUOUS' || code === 'CASHIER_SKU_AMBIGUOUS') {
      return extra.scannerAmbiguous;
    }
    return errorMessage(cause, labels);
  }, [extra.scannerAmbiguous, labels]);

  const addExactCode = useCallback(async (value: string, source: 'scanner' | 'search') => {
    if (!runtime) return false;
    try {
      const exact = await runtime.lookupExact(value);
      if (!exact) {
        if (source === 'scanner') setError(extra.scannerNotFound);
        return false;
      }
      addItem(exact);
      setQuery('');
      await refreshCatalog(runtime, '', false);
      return true;
    } catch (cause) {
      setError(scannerError(cause));
      return false;
    }
  }, [addItem, extra.scannerNotFound, refreshCatalog, runtime, scannerError]);

  const performSearch = useCallback(async () => {
    if (!runtime) return;
    setError(null);
    const value = query.trim();
    if (value && await addExactCode(value, 'search')) {
      searchRef.current?.focus();
      return;
    }
    await refreshCatalog(runtime, value);
  }, [addExactCode, query, refreshCatalog, runtime]);

  useEffect(() => {
    scannerBufferRef.current = emptyCashierScannerBuffer();
    if (!runtime || checkoutOpen) return;

    const handleScannerKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      const atMs = event.timeStamp;

      if (isCashierScannerTerminator(event.key)) {
        const code = completeCashierScannerBuffer(scannerBufferRef.current, atMs);
        scannerBufferRef.current = emptyCashierScannerBuffer();
        if (!code) return;
        event.preventDefault();
        event.stopPropagation();
        setQuery('');
        void addExactCode(code, 'scanner');
        return;
      }

      if (event.key.length === 1) {
        scannerBufferRef.current = appendCashierScannerKey(
          scannerBufferRef.current,
          event.key,
          atMs,
        );
      }
    };

    window.addEventListener('keydown', handleScannerKey, true);
    return () => window.removeEventListener('keydown', handleScannerKey, true);
  }, [addExactCode, checkoutOpen, runtime]);

  const openCheckout = useCallback(() => {
    if (!quote || quoteError || cart.length === 0) return;
    setError(null);
    setCheckoutOpen(true);
  }, [cart.length, quote, quoteError]);

  const closeCheckout = useCallback(() => {
    if (committing) return;
    setError(null);
    setCheckoutOpen(false);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [committing]);

  const completeSale = useCallback(async () => {
    if (!runtime || cart.length === 0 || !quote || quoteError) return;
    if (paymentMethod === 'cash') {
      if (cashTenderedMinor === null || changeDueMinor === null) {
        setError(labels.errorCashTenderInvalid);
        return;
      }
    } else if (!externalConfirmed) {
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
        ...(paymentMethod === 'cash' && cashTenderedMinor !== null && changeDueMinor !== null
          ? {
              cash_tendered_minor: cashTenderedMinor,
              change_due_minor: changeDueMinor,
            }
          : {}),
        lines: saleLines,
      });

      setSuccess({
        saleId: result.sale.sale_id,
        totalMinor: result.sale.total_minor,
        currencyCode: result.sale.currency_code,
        fractionDigits: result.sale.currency_fraction_digits,
        ...(result.sale.change_due_minor !== undefined
          ? { changeDueMinor: result.sale.change_due_minor }
          : {}),
      });
      setCheckoutOpen(false);
      setCart([]);
      setActiveCartKey(null);
      setCompactPage(0);
      setPaymentMethod('cash');
      setCashTenderText('');
      setExternalConfirmed(false);
      await refreshCatalog(runtime, '', false);
      setQuery('');
      window.setTimeout(() => searchRef.current?.focus(), 0);
    } catch (cause) {
      setError(errorMessage(cause, labels));
      await refreshCatalog(runtime, query, false).catch(() => undefined);
    } finally {
      setCommitting(false);
    }
  }, [cart.length, cashTenderedMinor, changeDueMinor, externalConfirmed, labels, paymentMethod, query, quote, quoteError, refreshCatalog, runtime, saleLines]);

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
  const checkoutCanSubmit =
    cart.length > 0 &&
    Boolean(quote) &&
    !quoteError &&
    cashTenderReady &&
    (paymentMethod === 'cash' || externalConfirmed);

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

        {!checkoutOpen && error ? (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <strong>{labels.saleSuccess}</strong>
            <div className="flex flex-wrap items-center gap-3">
              <span dir="ltr">{formatMoney(success.totalMinor, success.currencyCode, success.fractionDigits, lang)}</span>
              {success.changeDueMinor !== undefined ? (
                <strong>
                  {labels.changeDue}: <span dir="ltr">{formatMoney(success.changeDueMinor, success.currencyCode, success.fractionDigits, lang)}</span>
                </strong>
              ) : null}
            </div>
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
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                <span aria-hidden="true">▣</span>
                <span>{extra.scannerReady}</span>
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
                          <span className="min-w-0 truncate" dir="ltr">{item.sku || item.barcode || labels.noCode}</span>
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
              {cart.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    resetPaymentDraft();
                  }}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  {labels.clearCart}
                </button>
              ) : null}
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

              <button
                type="button"
                onClick={openCheckout}
                disabled={cart.length === 0 || !quote || Boolean(quoteError) || committing}
                className="mt-3 h-12 w-full rounded-xl bg-orange-600 text-base font-black text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {extra.checkout}
              </button>
            </div>
          </aside>
        </div>
      </div>

      <CashierCheckoutModal
        open={checkoutOpen}
        lang={lang}
        dir={dir}
        labels={labels}
        quote={quote}
        error={error}
        paymentMethod={paymentMethod}
        cashTenderText={cashTenderText}
        cashTenderedMinor={cashTenderedMinor}
        changeDueMinor={changeDueMinor}
        externalConfirmed={externalConfirmed}
        committing={committing}
        canSubmit={checkoutCanSubmit}
        onPaymentMethodChange={method => {
          setPaymentMethod(method);
          setCashTenderText('');
          setExternalConfirmed(false);
          setError(null);
        }}
        onCashTenderChange={value => {
          setCashTenderText(normalizeCashDigits(value));
          setError(null);
        }}
        onExactCash={() => {
          if (quote) setCashTenderText(String(quote.total_minor));
          setError(null);
        }}
        onExternalConfirmedChange={confirmed => {
          setExternalConfirmed(confirmed);
          setError(null);
        }}
        onClose={closeCheckout}
        onSubmit={() => void completeSale()}
      />
    </main>
  );
}
