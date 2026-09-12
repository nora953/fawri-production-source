import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import {
  CASHIER_POS_ENHANCEMENT_COPY,
  formatCashierMinorMoney,
  itemKey,
  type CashierCatalogLookup,
  type CashierResolvedSalePricing,
  type CashierSaleLineInput,
  type CashierSaleSnapshot,
} from '@/lib/cashierPosUi';
import {
  createCashierPosRuntime,
  type CashierPosRuntime,
} from '@/lib/cashierOperatorPosRuntime';
import {
  emptyCashierScannerBuffer,
  appendCashierScannerKey,
  completeCashierScannerBuffer,
  isCashierScannerTerminator,
} from '@/lib/cashierBarcodeScanner';
import {
  subscribeCashierCatalogRefresh,
} from '@/lib/cashierCatalogRefresh';
import {
  publishCashierOperatorSessionInvalidated,
  isCashierOperatorSessionEnded,
} from '@/lib/cashierOperatorSessionEvents';
import {
  subscribeCashierSyncUiState,
  requestCashierSync,
  type CashierSyncUiState,
} from '@/lib/cashierSyncUiState';
import {
  readCashierReceiptPrintSettings,
  writeCashierReceiptPrintSettings,
  type CashierReceiptPaperWidthMm,
} from '@/lib/cashierReceiptPrintSettings';
import {
  printCashierReceipt,
} from '@/lib/cashierReceiptPrinter';
import {
  CASHIER_RECEIPT_COPY,
} from '@/lib/cashierReceiptCopy';
import {
  useCashierManualDiscountCheckout,
} from '@/lib/useCashierManualDiscountCheckout';
import CashierCheckoutModal from '@/components/cashier/CashierCheckoutModal';

const COMPACT_ITEMS_PER_PAGE = 4;

const LOCAL_COPY: Record<Lang, {
  catalogOpenFailed: string;
  scannerAmbiguous: string;
  scannerNotFound: string;
  searchFailed: string;
  discountNeedsManager: string;
  discountPolicyUnavailable: string;
}> = {
  ar: {
    catalogOpenFailed: 'تعذر فتح كتالوج الكاشير.',
    scannerAmbiguous: 'الباركود أو SKU يطابق أكثر من منتج. صحح البيانات من لوحة التاجر.',
    scannerNotFound: 'لم يتم العثور على منتج مطابق للباركود.',
    searchFailed: 'تعذر تنفيذ البحث.',
    discountNeedsManager: 'هذا الخصم يحتاج موافقة مدير.',
    discountPolicyUnavailable: 'تعذر التحقق من سياسة الخصم. حاول مرة أخرى.',
  },
  ku: {
    catalogOpenFailed: 'کردنەوەی کاتالۆگی کاشێر سەرکەوتوو نەبوو.',
    scannerAmbiguous: 'بارکۆد یان SKU زیاتر لە یەک بەرهەم دەگونجێت.',
    scannerNotFound: 'هیچ بەرهەمێک بۆ ئەم بارکۆدە نەدۆزرایەوە.',
    searchFailed: 'گەڕان سەرکەوتوو نەبوو.',
    discountNeedsManager: 'ئەم داشکاندنە پێویستی بە پەسەندی بەڕێوەبەر هەیە.',
    discountPolicyUnavailable: 'پشکنینی یاسای داشکاندن سەرکەوتوو نەبوو.',
  },
  en: {
    catalogOpenFailed: 'Could not open the cashier catalog.',
    scannerAmbiguous: 'The barcode or SKU matches more than one item. Fix the catalog data first.',
    scannerNotFound: 'No item matched that barcode.',
    searchFailed: 'Search failed.',
    discountNeedsManager: 'This discount requires manager approval.',
    discountPolicyUnavailable: 'Could not verify the discount policy. Try again.',
  },
};

function formatMoney(
  minor: number,
  currencyCode: string,
  fractionDigits: number,
  lang: Lang,
): string {
  return formatCashierMinorMoney(minor, currencyCode, fractionDigits, lang);
}

function runtimeErrorCode(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return String((cause as { code?: unknown }).code || '');
  }
  return '';
}

function errorMessage(
  cause: unknown,
  labels: (typeof CASHIER_POS_ENHANCEMENT_COPY)[Lang],
): string {
  const code = runtimeErrorCode(cause);
  if (code === 'CASHIER_BARCODE_AMBIGUOUS' || code === 'CASHIER_SKU_AMBIGUOUS') return labels.errorBarcodeAmbiguous;
  if (code === 'CASHIER_NO_STOCK') return labels.errorNoStock;
  if (code === 'CASHIER_QUANTITY_EXCEEDS_STOCK') return labels.errorQuantityExceedsStock;
  if (cause instanceof Error && cause.message) return cause.message;
  return labels.errorGeneric;
}

function syncButtonClassName(state: CashierSyncUiState): string {
  if (state.status === 'needs_attention') {
    return 'rounded-lg border border-amber-300 bg-amber-500 px-3 py-1.5 font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50';
  }
  return 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
}

function syncButtonLabel(
  state: CashierSyncUiState,
  labels: (typeof CASHIER_POS_ENHANCEMENT_COPY)[Lang],
): string {
  if (state.status === 'syncing') return labels.syncing;
  if (state.status === 'needs_attention') return labels.syncNeeded;
  return labels.sync;
}

function syncAttentionMessage(
  state: CashierSyncUiState,
  labels: (typeof CASHIER_POS_ENHANCEMENT_COPY)[Lang],
): string {
  return state.message || labels.syncAttention;
}

function normalizeCashDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, character => String('٠١٢٣٤٥٦٧٨٩'.indexOf(character)))
    .replace(/[۰-۹]/g, character => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(character)))
    .replace(/[^0-9]/g, '');
}

function parseCashTenderMinor(value: string): number | null {
  const normalized = normalizeCashDigits(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function newSaleOperationId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return `cashier-sale-${cryptoObject.randomUUID()}`;
  }
  return `cashier-sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CashierPosPage({ demoMode = false }: { demoMode?: boolean }) {
  const { lang, dir } = useI18n();
  const labels = CASHIER_POS_ENHANCEMENT_COPY[lang] || CASHIER_POS_ENHANCEMENT_COPY.en;
  const extra = LOCAL_COPY[lang] || LOCAL_COPY.en;
  const receiptLabels = CASHIER_RECEIPT_COPY[lang] || CASHIER_RECEIPT_COPY.en;
  const [runtime, setRuntime] = useState<CashierPosRuntime | null>(null);
  const [catalog, setCatalog] = useState<CashierCatalogLookup[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Array<{ item: CashierCatalogLookup; quantity: number }>>([]);
  const [activeCartKey, setActiveCartKey] = useState<string | null>(null);
  const [compactPage, setCompactPage] = useState(0);
  const [quote, setQuote] = useState<CashierResolvedSalePricing | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutOperationId, setCheckoutOperationId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'electronic' | 'other'>('cash');
  const [cashTenderText, setCashTenderText] = useState('');
  const [externalConfirmed, setExternalConfirmed] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    saleId: string;
    totalMinor: number;
    currencyCode: string;
    fractionDigits: number;
    changeDueMinor?: number;
    receipt: CashierSaleSnapshot;
  } | null>(null);
  const [receiptPrintError, setReceiptPrintError] = useState<string | null>(null);
  const [receiptAutoPrint, setReceiptAutoPrint] = useState(false);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<CashierReceiptPaperWidthMm>(80);
  const [syncUiState, setSyncUiState] = useState<CashierSyncUiState>({ status: 'idle' });
  const searchRef = useRef<HTMLInputElement | null>(null);
  const scannerBufferRef = useRef(emptyCashierScannerBuffer());
  const discountCheckout = useCashierManualDiscountCheckout({
    online,
    operationId: checkoutOperationId,
    quote,
  });
  const finalTotalMinor = discountCheckout.resolution?.finalTotalMinor ?? quote?.total_minor ?? null;

  const refreshCatalog = useCallback(async (
    currentRuntime: CashierPosRuntime,
    value: string,
    visible = true,
  ) => {
    if (visible) setSearching(true);
    try {
      const next = await currentRuntime.search(value);
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
        if (stopped) return;
        if (isCashierOperatorSessionEnded(cause)) {
          publishCashierOperatorSessionInvalidated();
          return;
        }
        setError(extra.catalogOpenFailed);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
      if (activeRuntime) void activeRuntime.close().catch(() => undefined);
    };
  }, [demoMode, extra.catalogOpenFailed, refreshCatalog]);

  useEffect(() => {
    if (!runtime) {
      setReceiptAutoPrint(false);
      setReceiptPaperWidth(80);
      return;
    }
    const settings = readCashierReceiptPrintSettings(runtime.deviceId);
    setReceiptAutoPrint(settings.auto_print);
    setReceiptPaperWidth(settings.paper_width_mm);
  }, [runtime]);

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
      setCheckoutOperationId(null);
      discountCheckout.reset();
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
      finalTotalMinor === null ||
      cashTenderedMinor === null ||
      cashTenderedMinor < finalTotalMinor
    ) {
      return null;
    }
    const change = cashTenderedMinor - finalTotalMinor;
    return Number.isSafeInteger(change) && change >= 0 ? change : null;
  }, [cashTenderedMinor, finalTotalMinor, paymentMethod]);

  const cashTenderReady =
    paymentMethod !== 'cash' ||
    Boolean(finalTotalMinor !== null && cashTenderedMinor !== null && changeDueMinor !== null);

  const resetPaymentDraft = useCallback(() => {
    setCashTenderText('');
    setExternalConfirmed(false);
    discountCheckout.remove();
    setError(null);
  }, [discountCheckout]);

  const printReceipt = useCallback((sale: CashierSaleSnapshot) => {
    setReceiptPrintError(null);
    void printCashierReceipt({ sale, lang }).catch(() => {
      setReceiptPrintError(receiptLabels.printFailed);
    });
  }, [lang, receiptLabels.printFailed]);

  const toggleReceiptAutoPrint = useCallback(() => {
    if (!runtime) return;
    const next = !receiptAutoPrint;
    const saved = writeCashierReceiptPrintSettings(runtime.deviceId, {
      auto_print: next,
    });
    if (!saved) {
      setReceiptPrintError(receiptLabels.settingsUnavailable);
      return;
    }
    setReceiptAutoPrint(next);
    setReceiptPrintError(null);
  }, [receiptAutoPrint, receiptLabels.settingsUnavailable, runtime]);

  const updateReceiptPaperWidth = useCallback((width: CashierReceiptPaperWidthMm) => {
    if (!runtime) return;
    const saved = writeCashierReceiptPrintSettings(runtime.deviceId, {
      paper_width_mm: width,
    });
    if (!saved) {
      setReceiptPrintError(receiptLabels.settingsUnavailable);
      return;
    }
    setReceiptPaperWidth(width);
    setReceiptPrintError(null);
  }, [receiptLabels.settingsUnavailable, runtime]);

  const addItem = useCallback((item: CashierCatalogLookup) => {
    const key = itemKey(item);
    setError(null);
    setSuccess(null);
    setReceiptPrintError(null);
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
      if (source === 'search') throw cause;
      setError(scannerError(cause));
      return false;
    }
  }, [addItem, extra.scannerNotFound, refreshCatalog, runtime, scannerError]);

  const performSearch = useCallback(async () => {
    if (!runtime) return;
    setError(null);
    const value = query.trim();
    try {
      if (value && await addExactCode(value, 'search')) {
        searchRef.current?.focus();
        return;
      }
      await refreshCatalog(runtime, value);
    } catch (cause) {
      const code = runtimeErrorCode(cause);
      setError(
        code === 'CASHIER_BARCODE_AMBIGUOUS' || code === 'CASHIER_SKU_AMBIGUOUS'
          ? extra.scannerAmbiguous
          : extra.searchFailed,
      );
      searchRef.current?.focus();
    }
  }, [addExactCode, extra.scannerAmbiguous, extra.searchFailed, query, refreshCatalog, runtime]);

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
    setCheckoutOperationId(newSaleOperationId());
    setCheckoutOpen(true);
    void discountCheckout.refreshPolicy();
  }, [cart.length, discountCheckout, quote, quoteError]);

  const closeCheckout = useCallback(() => {
    if (committing || discountCheckout.overrideApprovalLoading) return;
    setError(null);
    setCheckoutOpen(false);
    setCheckoutOperationId(null);
    discountCheckout.remove();
    setCashTenderText('');
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [committing, discountCheckout]);

  const completeSale = useCallback(async () => {
    if (
      !runtime ||
      cart.length === 0 ||
      !quote ||
      quoteError ||
      !checkoutOperationId ||
      !discountCheckout.canSubmit
    ) return;
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
    setReceiptPrintError(null);
    try {
      const manualDiscountMinor = discountCheckout.manualDiscountMinor;
      const manualDiscountReason = discountCheckout.reason.normalize('NFKC').trim();
      const result = await runtime.commitSale({
        operation_id: checkoutOperationId,
        payment_method: paymentMethod,
        payment_status: 'paid',
        ...(manualDiscountMinor > 0
          ? {
              manual_discount_minor: manualDiscountMinor,
              manual_discount_reason: manualDiscountReason,
              ...(discountCheckout.overrideApproval
                ? {
                    manual_discount_override_approval_id:
                      discountCheckout.overrideApproval.approval_id,
                  }
                : {}),
            }
          : {}),
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
        receipt: result.sale,
      });
      if (receiptAutoPrint) printReceipt(result.sale);
      setCheckoutOpen(false);
      setCheckoutOperationId(null);
      setCart([]);
      setActiveCartKey(null);
      setCompactPage(0);
      setPaymentMethod('cash');
      setCashTenderText('');
      setExternalConfirmed(false);
      discountCheckout.reset();
      await refreshCatalog(runtime, '', false);
      setQuery('');
      window.setTimeout(() => searchRef.current?.focus(), 0);
    } catch (cause) {
      if (isCashierOperatorSessionEnded(cause)) {
        setCheckoutOpen(false);
        setCheckoutOperationId(null);
        publishCashierOperatorSessionInvalidated();
        return;
      }
      const code = runtimeErrorCode(cause);
      if (code === 'CASHIER_MANUAL_DISCOUNT_OVERRIDE_REQUIRED') {
        setError(extra.discountNeedsManager);
      } else if (code.includes('MANUAL_DISCOUNT') || code.includes('DISCOUNT_OVERRIDE')) {
        setError(extra.discountPolicyUnavailable);
      } else {
        setError(errorMessage(cause, labels));
      }
      await refreshCatalog(runtime, query, false).catch(() => undefined);
    } finally {
      setCommitting(false);
    }
  }, [cart.length, cashTenderedMinor, changeDueMinor, checkoutOperationId, discountCheckout, externalConfirmed, extra.discountNeedsManager, extra.discountPolicyUnavailable, labels, paymentMethod, printReceipt, query, quote, quoteError, receiptAutoPrint, refreshCatalog, runtime, saleLines]);

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
    finalTotalMinor !== null &&
    !quoteError &&
    Boolean(checkoutOperationId) &&
    discountCheckout.canSubmit &&
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
            <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
              <span className={`rounded-full px-3 py-1.5 font-semibold ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                {online ? labels.online : labels.offline}
              </span>
              <button
                type="button"
                onClick={toggleReceiptAutoPrint}
                disabled={!runtime}
                aria-pressed={receiptAutoPrint}
                title={receiptLabels.autoPrintHint}
                className={`rounded-lg border px-3 py-1.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${receiptAutoPrint ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {receiptAutoPrint ? receiptLabels.autoPrintOn : receiptLabels.autoPrintOff}
              </button>
              <label
                title={receiptLabels.paperWidthHint}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              >
                <span>{receiptLabels.paperWidthLabel}</span>
                <select
                  value={receiptPaperWidth}
                  onChange={event => updateReceiptPaperWidth(Number(event.target.value) === 58 ? 58 : 80)}
                  disabled={!runtime}
                  aria-label={receiptLabels.paperWidthLabel}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-bold outline-none focus:border-orange-400"
                  dir="ltr"
                >
                  <option value={80}>{receiptLabels.paper80}</option>
                  <option value={58}>{receiptLabels.paper58}</option>
                </select>
              </label>
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
          <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <strong>{labels.saleSuccess}</strong>
            <div className="flex flex-wrap items-center gap-3">
              <span dir="ltr">{formatMoney(success.totalMinor, success.currencyCode, success.fractionDigits, lang)}</span>
              {success.changeDueMinor !== undefined ? (
                <strong>
                  {labels.changeDue}: <span dir="ltr">{formatMoney(success.changeDueMinor, success.currencyCode, success.fractionDigits, lang)}</span>
                </strong>
              ) : null}
              <button
                type="button"
                onClick={() => printReceipt(success.receipt)}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-bold text-emerald-800 transition hover:bg-emerald-100"
              >
                {receiptLabels.printReceipt} <span dir="ltr">({receiptLabels.printShortcut})</span>
              </button>
            </div>
          </div>
        ) : null}
        {receiptPrintError ? (
          <div role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
            {receiptPrintError}
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
                      <div className="cashier-cart-compact-panel shrink-0 rounded-xl border border-slate-100 bg-slate-50/70 p-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-slate-500">{labels.otherItems}</span>
                          {compactPageCount > 1 ? <span className="text-[11px] text-slate-400">{compactPage + 1}/{compactPageCount}</span> : null}
                        </div>
                        <div className="flex items-stretch gap-1.5">
                          {compactPageCount > 1 ? (
                            <button type="button" onClick={() => setCompactPage(page => (page - 1 + compactPageCount) % compactPageCount)} className="w-7 shrink-0 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-500 hover:bg-slate-100">‹</button>
                          ) : null}
                          <div className="cashier-cart-compact-grid grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4">
                            {visibleCompactLines.map(line => {
                              const key = itemKey(line.item);
                              const priced = quoteByKey.get(key);
                              const unit = priced?.effective_unit_price_minor ?? line.item.base_unit_price_minor;
                              const total = priced?.line_total_minor ?? unit * line.quantity;
                              return (
                                <button type="button" key={key} onClick={() => setActiveCartKey(key)} className="cashier-cart-compact-card min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-start transition hover:border-orange-300 hover:bg-orange-50">
                                  <p className="cashier-cart-compact-name text-[11px] font-bold">{line.item.name}</p>
                                  <div className="cashier-cart-compact-meta mt-0.5 text-[10px] text-slate-500">
                                    <span className="cashier-cart-compact-qty">×{line.quantity}</span>
                                    <span className="cashier-cart-compact-price" dir="ltr">{formatMoney(total, line.item.currency_code, line.item.currency_fraction_digits, lang)}</span>
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
        online={online}
        lang={lang}
        dir={dir}
        labels={labels}
        quote={quote}
        finalTotalMinor={finalTotalMinor}
        error={error || (discountCheckout.policyError ? extra.discountPolicyUnavailable : null)}
        paymentMethod={paymentMethod}
        cashTenderText={cashTenderText}
        cashTenderedMinor={cashTenderedMinor}
        changeDueMinor={changeDueMinor}
        externalConfirmed={externalConfirmed}
        committing={committing}
        canSubmit={checkoutCanSubmit}
        discountPolicyLoading={discountCheckout.policyLoading}
        discountPolicy={discountCheckout.policy}
        manualDiscountOpen={discountCheckout.editorOpen}
        manualDiscountKind={discountCheckout.kind}
        manualDiscountValueText={discountCheckout.valueText}
        manualDiscountReason={discountCheckout.reason}
        manualDiscountResolution={discountCheckout.resolution}
        manualDiscountInvalid={discountCheckout.invalid}
        overrideNeeded={discountCheckout.overrideNeeded}
        overrideApprovers={discountCheckout.overrideApprovers}
        overrideApproversLoading={discountCheckout.overrideApproversLoading}
        overrideSelectedApproverId={discountCheckout.overrideSelectedApproverId}
        overridePin={discountCheckout.overridePin}
        overrideApproval={discountCheckout.overrideApproval}
        overrideApprovalLoading={discountCheckout.overrideApprovalLoading}
        overrideErrorCode={discountCheckout.overrideErrorCode}
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
          if (finalTotalMinor !== null) setCashTenderText(String(finalTotalMinor));
          setError(null);
        }}
        onExternalConfirmedChange={confirmed => {
          setExternalConfirmed(confirmed);
          setError(null);
        }}
        onManualDiscountOpen={() => {
          discountCheckout.openEditor();
          setCashTenderText('');
          setError(null);
        }}
        onManualDiscountRemove={() => {
          discountCheckout.remove();
          setCashTenderText('');
          setError(null);
        }}
        onManualDiscountKindChange={kind => {
          discountCheckout.setKind(kind);
          setCashTenderText('');
          setError(null);
        }}
        onManualDiscountValueChange={value => {
          discountCheckout.setValueText(value);
          setCashTenderText('');
          setError(null);
        }}
        onManualDiscountReasonChange={reason => {
          discountCheckout.setReason(reason);
          setError(null);
        }}
        onOverrideApproverChange={staffId => {
          discountCheckout.setOverrideSelectedApproverId(staffId);
          setError(null);
        }}
        onOverridePinChange={pin => {
          discountCheckout.setOverridePin(pin);
          setError(null);
        }}
        onOverrideApprove={() => {
          void discountCheckout.approveOverride();
          setError(null);
        }}
        onClose={closeCheckout}
        onSubmit={() => void completeSale()}
      />
    </main>
  );
}

function catalogMatches(a: CashierCatalogLookup[], b: CashierCatalogLookup[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.product_id !== right.product_id ||
      left.variant_id !== right.variant_id ||
      left.name !== right.name ||
      left.variant_name !== right.variant_name ||
      left.base_unit_price_minor !== right.base_unit_price_minor ||
      left.currency_code !== right.currency_code ||
      left.currency_fraction_digits !== right.currency_fraction_digits ||
      left.sku !== right.sku ||
      left.barcode !== right.barcode ||
      left.track_inventory !== right.track_inventory ||
      left.stock_quantity !== right.stock_quantity
    ) return false;
  }
  return true;
}
