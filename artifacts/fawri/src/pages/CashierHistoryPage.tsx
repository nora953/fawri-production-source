import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCashierHistoryRuntime,
  type CashierHistoryRuntime,
} from '@/lib/cashierHistoryRuntime';
import type {
  CashierSaleLineSnapshot,
  CashierSaleSnapshot,
} from '@/lib/cashierLocalContracts';
import {
  cashierOperatorCan,
  getCashierOperatorSession,
} from '@/lib/cashierOperatorSessionRuntime';
import {
  cashierOperatorSessionErrorCode,
  isCashierOperatorSessionEnded,
  publishCashierOperatorSessionInvalidated,
} from '@/lib/cashierOperatorSessionUi';
import { publishCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';
import {
  CASHIER_RECEIPT_COPY,
  printCashierReceipt,
  readCashierReceiptPrintSettings,
} from '@/lib/cashierReceiptPrinting';
import { readCachedCashierReceiptProfile } from '@/lib/cashierReceiptProfileClient';
import { CASHIER_UI_COPY, cashierLocale } from '@/lib/cashierUiCopy';
import { useI18n } from '@/lib/i18n';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import type { Lang } from '@/lib/types';

type ConfirmAction = 'return' | 'void' | null;
type HistoryLabels = (typeof CASHIER_UI_COPY)[Lang]['history'];

function operationId(prefix: 'return' | 'void'): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function formatMoney(
  amountMinor: number,
  currencyCode: string,
  fractionDigits: number,
  lang: Lang,
): string {
  return formatMerchantMoneyMinor(amountMinor, currencyCode, fractionDigits, lang);
}

function formatDate(value: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(cashierLocale(lang), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function saleReference(saleId: string): string {
  return saleId.replace(/^sale:/, '').slice(0, 8).toUpperCase();
}

function paymentMethodLabel(
  value: CashierSaleSnapshot['payment_method'],
  labels: HistoryLabels,
): string {
  if (value === 'cash') return labels.cash;
  if (value === 'card') return labels.card;
  if (value === 'electronic') return labels.electronic;
  return labels.other;
}

function paymentStatusLabel(
  value: CashierSaleSnapshot['payment_status'],
  labels: HistoryLabels,
): string {
  if (value === 'paid') return labels.paid;
  if (value === 'pending') return labels.pending;
  return labels.failed;
}

function returnedQuantity(sale: CashierSaleSnapshot, lineId: string): number {
  return (sale.returns || []).reduce(
    (total, snapshot) =>
      total +
      snapshot.lines
        .filter(line => line.original_line_id === lineId)
        .reduce((sum, line) => sum + line.quantity, 0),
    0,
  );
}

function remainingQuantity(sale: CashierSaleSnapshot, line: CashierSaleLineSnapshot): number {
  if (sale.status === 'voided' || sale.void) return 0;
  return Math.max(0, line.quantity - returnedQuantity(sale, line.line_id));
}

function totalReturnedQuantity(sale: CashierSaleSnapshot): number {
  return (sale.returns || []).reduce(
    (total, snapshot) => total + snapshot.lines.reduce((sum, line) => sum + line.quantity, 0),
    0,
  );
}

function saleState(sale: CashierSaleSnapshot, labels: HistoryLabels): {
  label: string;
  className: string;
} {
  if (sale.status === 'voided' || sale.void) {
    return { label: labels.stateVoided, className: 'bg-red-50 text-red-700 border-red-200' };
  }
  const sold = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
  const returned = totalReturnedQuantity(sale);
  if (returned >= sold && sold > 0) {
    return { label: labels.stateFullyReturned, className: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  if (returned > 0) {
    return { label: labels.statePartialReturn, className: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  return { label: labels.stateCompleted, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

function saleOperationIds(sale: CashierSaleSnapshot): string[] {
  return [
    sale.operation_id,
    ...(sale.returns || []).map(item => item.operation_id),
    ...(sale.void ? [sale.void.operation_id] : []),
  ];
}

function syncStateLabel(
  pending: boolean,
  online: boolean,
  labels: HistoryLabels,
): string {
  if (!pending) return labels.synced;
  return online ? labels.pendingSync : labels.savedOnDevice;
}

export default function CashierHistoryPage() {
  const { lang, dir } = useI18n();
  const labels = CASHIER_UI_COPY[lang].history;
  const receiptLabels = CASHIER_RECEIPT_COPY[lang];
  const [runtime, setRuntime] = useState<CashierHistoryRuntime | null>(null);
  const [sales, setSales] = useState<CashierSaleSnapshot[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [returnDraft, setReturnDraft] = useState<Record<string, number>>({});
  const [online, setOnline] = useState(() => navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptPrintError, setReceiptPrintError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [canReturnPermission, setCanReturnPermission] = useState(false);
  const [canVoidPermission, setCanVoidPermission] = useState(false);

  const refresh = useCallback(async (activeRuntime: CashierHistoryRuntime) => {
    const snapshot = await activeRuntime.snapshot(120);
    setSales(snapshot.sales);
    setPendingIds(new Set(snapshot.pending_operation_ids));
    setSelectedSaleId(current => {
      if (current && snapshot.sales.some(sale => sale.sale_id === current)) return current;
      return snapshot.sales[0]?.sale_id || null;
    });
  }, []);

  useEffect(() => {
    let stopped = false;
    let activeRuntime: CashierHistoryRuntime | null = null;
    void Promise.all([
      createCashierHistoryRuntime(),
      getCashierOperatorSession(),
    ])
      .then(async ([created, session]) => {
        activeRuntime = created;
        if (stopped) return;
        setCanReturnPermission(cashierOperatorCan(session, 'sale.return'));
        setCanVoidPermission(cashierOperatorCan(session, 'sale.void'));
        setRuntime(created);
        await refresh(created);
      })
      .catch(cause => {
        if (stopped) return;
        if (isCashierOperatorSessionEnded(cause)) {
          publishCashierOperatorSessionInvalidated();
          return;
        }
        setError(labels.historyFailed);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
      if (activeRuntime) void activeRuntime.close().catch(() => undefined);
    };
  }, [labels.historyFailed, refresh]);

  useEffect(() => {
    if (!runtime) return;
    const updateOnline = () => setOnline(navigator.onLine);
    const refreshLocal = () => void refresh(runtime).catch(cause => {
      if (isCashierOperatorSessionEnded(cause)) {
        publishCashierOperatorSessionInvalidated();
      }
    });
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('focus', refreshLocal);
    const interval = window.setInterval(refreshLocal, 2500);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('focus', refreshLocal);
    };
  }, [refresh, runtime]);

  const selectedSale = useMemo(
    () => sales.find(sale => sale.sale_id === selectedSaleId) || null,
    [sales, selectedSaleId],
  );

  useEffect(() => {
    setReturnDraft({});
    setConfirmAction(null);
    setNotice(null);
    setError(null);
    setReceiptPrintError(null);
  }, [selectedSaleId]);

  const selectedPending = useMemo(() => {
    if (!selectedSale) return false;
    return saleOperationIds(selectedSale).some(id => pendingIds.has(id));
  }, [pendingIds, selectedSale]);

  const returnableLines = useMemo(() => {
    if (!selectedSale || selectedSale.status === 'voided' || selectedSale.void) return [];
    return selectedSale.lines
      .map(line => ({ line, remaining: remainingQuantity(selectedSale, line) }))
      .filter(item => item.remaining > 0);
  }, [selectedSale]);

  const selectedFullyReturned = useMemo(() => {
    if (!selectedSale || selectedSale.status === 'voided' || selectedSale.void) return false;
    const sold = selectedSale.lines.reduce((sum, line) => sum + line.quantity, 0);
    return sold > 0 && totalReturnedQuantity(selectedSale) >= sold;
  }, [selectedSale]);

  const canVoidSale = Boolean(
    selectedSale &&
      selectedSale.status === 'completed' &&
      !selectedSale.void &&
      (selectedSale.returns || []).length === 0,
  );

  const returnTotal = useMemo(() => {
    if (!selectedSale) return 0;
    return selectedSale.lines.reduce((total, line) => {
      const quantity = Math.max(0, Math.trunc(returnDraft[line.line_id] || 0));
      return total + quantity * line.effective_unit_price_minor;
    }, 0);
  }, [returnDraft, selectedSale]);

  const requestedReturnLines = useMemo(
    () =>
      returnableLines
        .map(({ line, remaining }) => ({
          original_line_id: line.line_id,
          quantity: Math.min(remaining, Math.max(0, Math.trunc(returnDraft[line.line_id] || 0))),
        }))
        .filter(line => line.quantity > 0),
    [returnDraft, returnableLines],
  );

  const reprintSelectedReceipt = useCallback(() => {
    if (!runtime || !selectedSale || busy || confirmAction) return;
    const settings = readCashierReceiptPrintSettings(runtime.deviceId);
    const profile = readCachedCashierReceiptProfile(runtime.deviceId);
    setReceiptPrintError(null);
    void printCashierReceipt({
      sale: selectedSale,
      lang,
      paperWidthMm: settings.paper_width_mm,
      ...(profile?.store_name ? { storeName: profile.store_name } : {}),
      reprint: true,
    }).catch(() => {
      setReceiptPrintError(receiptLabels.reprintFailed);
    });
  }, [busy, confirmAction, lang, receiptLabels.reprintFailed, runtime, selectedSale]);

  useEffect(() => {
    if (!runtime || !selectedSale) return;
    const handleReprintShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        event.key !== 'F9' ||
        busy ||
        confirmAction
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      reprintSelectedReceipt();
    };
    window.addEventListener('keydown', handleReprintShortcut, true);
    return () => window.removeEventListener('keydown', handleReprintShortcut, true);
  }, [busy, confirmAction, reprintSelectedReceipt, runtime, selectedSale]);

  const syncAfterLocalChange = useCallback(
    async (activeRuntime: CashierHistoryRuntime) => {
      if (navigator.onLine === false) return;
      try {
        const result = await activeRuntime.syncPending();
        setAuthRequired(false);
        if (result.uploaded_operations > 0 || result.replayed_operations > 0) {
          publishCashierDashboardRefresh();
        }
      } catch (cause) {
        if (isCashierOperatorSessionEnded(cause)) {
          setAuthRequired(true);
          publishCashierOperatorSessionInvalidated();
          return;
        }
        if (cashierOperatorSessionErrorCode(cause) === 'CASHIER_OUTBOX_SESSION_REQUIRED') {
          setAuthRequired(true);
        }
      } finally {
        await refresh(activeRuntime).catch(cause => {
          if (isCashierOperatorSessionEnded(cause)) {
            publishCashierOperatorSessionInvalidated();
          }
        });
      }
    },
    [refresh],
  );

  const performReturn = useCallback(async () => {
    if (!canReturnPermission || !runtime || !selectedSale || requestedReturnLines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await runtime.returnSale({
        operation_id: operationId('return'),
        sale_id: selectedSale.sale_id,
        lines: requestedReturnLines,
      });
      setReturnDraft({});
      setConfirmAction(null);
      setNotice(labels.returnedNotice);
      await refresh(runtime);
      void syncAfterLocalChange(runtime);
    } catch (cause) {
      setConfirmAction(null);
      if (isCashierOperatorSessionEnded(cause)) {
        publishCashierOperatorSessionInvalidated();
        return;
      }
      setError(labels.returnFailed);
    } finally {
      setBusy(false);
    }
  }, [canReturnPermission, labels, refresh, requestedReturnLines, runtime, selectedSale, syncAfterLocalChange]);

  const performVoid = useCallback(async () => {
    if (!canVoidPermission || !runtime || !selectedSale || !canVoidSale) return;
    setBusy(true);
    setError(null);
    try {
      await runtime.voidSale({
        operation_id: operationId('void'),
        sale_id: selectedSale.sale_id,
      });
      setConfirmAction(null);
      setNotice(labels.voidedSaleNotice);
      await refresh(runtime);
      void syncAfterLocalChange(runtime);
    } catch (cause) {
      setConfirmAction(null);
      if (isCashierOperatorSessionEnded(cause)) {
        publishCashierOperatorSessionInvalidated();
        return;
      }
      setError(labels.voidFailed);
    } finally {
      setBusy(false);
    }
  }, [canVoidPermission, canVoidSale, labels, refresh, runtime, selectedSale, syncAfterLocalChange]);

  const chooseReturnQuantity = useCallback((lineId: string, next: number, max: number) => {
    setReturnDraft(current => ({
      ...current,
      [lineId]: Math.min(max, Math.max(0, Math.trunc(next))),
    }));
  }, []);

  const selectAllReturnable = useCallback(() => {
    setReturnDraft(
      Object.fromEntries(returnableLines.map(({ line, remaining }) => [line.line_id, remaining])),
    );
  }, [returnableLines]);

  const compensationControlsVisible = Boolean(
    selectedSale &&
      selectedSale.status === 'completed' &&
      !selectedSale.void &&
      ((canReturnPermission && returnableLines.length > 0) ||
        (canVoidPermission && canVoidSale)),
  );

  const confirmationAllowed =
    confirmAction === 'return'
      ? canReturnPermission
      : confirmAction === 'void'
        ? canVoidPermission
        : false;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:h-screen lg:overflow-hidden" dir={dir}>
      <div className="mx-auto flex min-h-screen max-w-[1450px] flex-col p-3 lg:h-screen lg:min-h-0 lg:p-5">
        <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-xl font-bold">{labels.title}</h1>
              <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`rounded-full px-3 py-1.5 font-semibold ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              {online ? labels.online : labels.offline}
            </span>
            <a href="/cashier.html" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50">
              {labels.back}
            </a>
          </div>
        </header>

        {authRequired ? (
          <div className="mb-3 shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div>
              <strong className="block">{labels.signInToSync}</strong>
              <span className="text-amber-800">{labels.savedUntilLogin}</span>
            </div>
            <a href="/login" className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white">{labels.signIn}</a>
          </div>
        ) : null}

        {!online ? (
          <div className="mb-3 shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {labels.offlineNotice}
          </div>
        ) : null}

        {notice ? <div className="mb-3 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div> : null}
        {error ? <div role="alert" className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
        {receiptPrintError ? <div role="status" className="mb-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{receiptPrintError}</div> : null}

        <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex lg:min-h-0 lg:flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-bold">{labels.sales}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{labels.operationCount(sales.length)}</p>
              </div>
              {pendingIds.size > 0 ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{labels.pendingCount(pendingIds.size)}</span>
              ) : null}
            </div>

            <div className="p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {loading ? <div className="p-6 text-center text-sm text-slate-500">{labels.loading}</div> : null}
              {!loading && sales.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">{labels.empty}</div>
              ) : null}
              {sales.map(sale => {
                const state = saleState(sale, labels);
                const pending = saleOperationIds(sale).some(id => pendingIds.has(id));
                const active = sale.sale_id === selectedSaleId;
                return (
                  <button
                    key={sale.sale_id}
                    type="button"
                    onClick={() => setSelectedSaleId(sale.sale_id)}
                    className={`mb-1.5 w-full rounded-xl border px-3 py-2.5 text-start transition ${active ? 'border-orange-300 bg-orange-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-sm">{labels.saleReference(saleReference(sale.sale_id))}</strong>
                        <span className="mt-0.5 block text-xs text-slate-500">{formatDate(sale.occurred_at, lang)}</span>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${state.className}`}>{state.label}</span>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <strong dir="ltr">{formatMoney(sale.total_minor, sale.currency_code, sale.currency_fraction_digits, lang)}</strong>
                      <span className={`text-xs font-semibold ${pending ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {syncStateLabel(pending, online, labels)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0 lg:overflow-y-auto">
            {!selectedSale ? (
              <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-slate-500">{labels.chooseSale}</div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{labels.saleDetails}</h2>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${saleState(selectedSale, labels).className}`}>{saleState(selectedSale, labels).label}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selectedPending ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                        {syncStateLabel(selectedPending, online, labels)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{labels.saleReference(saleReference(selectedSale.sale_id))}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-end">
                    <div>
                      <strong className="block text-xl" dir="ltr">{formatMoney(selectedSale.total_minor, selectedSale.currency_code, selectedSale.currency_fraction_digits, lang)}</strong>
                      <span className="text-xs text-slate-500">{formatDate(selectedSale.occurred_at, lang)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={reprintSelectedReceipt}
                      disabled={busy || Boolean(confirmAction)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {receiptLabels.reprintReceipt} <span dir="ltr">({receiptLabels.printShortcut})</span>
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="block text-xs text-slate-500">{labels.paymentMethod}</span>
                    <strong className="mt-1 block text-sm">{paymentMethodLabel(selectedSale.payment_method, labels)}</strong>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="block text-xs text-slate-500">{labels.paymentStatus}</span>
                    <strong className="mt-1 block text-sm">{paymentStatusLabel(selectedSale.payment_status, labels)}</strong>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="block text-xs text-slate-500">{labels.itemCount}</span>
                    <strong className="mt-1 block text-sm">{selectedSale.lines.reduce((sum, line) => sum + line.quantity, 0)}</strong>
                  </div>
                </div>

                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-bold">{labels.products}</h3>
                    {canReturnPermission && returnableLines.length > 0 ? (
                      <button type="button" onClick={selectAllReturnable} className="text-xs font-bold text-orange-600 hover:text-orange-700">{labels.returnAll}</button>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {selectedSale.lines.map(line => {
                      const returned = returnedQuantity(selectedSale, line.line_id);
                      const remaining = remainingQuantity(selectedSale, line);
                      const draft = Math.min(remaining, Math.max(0, returnDraft[line.line_id] || 0));
                      return (
                        <div key={line.line_id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <strong className="block text-sm">{line.product_name_snapshot}</strong>
                              {line.variant_name_snapshot ? <span className="text-xs text-slate-500">{line.variant_name_snapshot}</span> : null}
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span>{labels.sold(line.quantity)}</span>
                                {returned > 0 ? <span>{labels.returned(returned)}</span> : null}
                                {selectedSale.status !== 'voided' && !selectedSale.void ? <span>{labels.returnable(remaining)}</span> : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <strong dir="ltr">{formatMoney(line.line_total_minor, selectedSale.currency_code, selectedSale.currency_fraction_digits, lang)}</strong>
                              {canReturnPermission && remaining > 0 && selectedSale.status === 'completed' && !selectedSale.void ? (
                                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1" dir="ltr">
                                  <button type="button" onClick={() => chooseReturnQuantity(line.line_id, draft - 1, remaining)} className="h-8 w-8 rounded-lg text-lg font-bold hover:bg-slate-50">−</button>
                                  <span className="min-w-8 text-center text-sm font-bold">{draft}</span>
                                  <button type="button" onClick={() => chooseReturnQuantity(line.line_id, draft + 1, remaining)} className="h-8 w-8 rounded-lg text-lg font-bold hover:bg-slate-50">+</button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {(selectedSale.returns || []).length > 0 ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <strong>{labels.previousReturns}</strong>
                      <div className="mt-2 space-y-1 text-xs">
                        {(selectedSale.returns || []).map(item => (
                          <div key={item.return_id} className="flex flex-wrap justify-between gap-2">
                            <span>{formatDate(item.occurred_at, lang)}</span>
                            <strong dir="ltr">{formatMoney(item.refund_total_minor, item.currency_code, item.currency_fraction_digits, lang)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedFullyReturned ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                      {labels.fullyReturnedNotice}
                    </div>
                  ) : null}

                  {selectedSale.void ? (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <strong>{labels.voidedNotice}</strong>
                      <span className="mt-1 block text-xs">{formatDate(selectedSale.void.occurred_at, lang)} · <bdi dir="ltr">{formatMoney(selectedSale.void.refund_total_minor, selectedSale.currency_code, selectedSale.currency_fraction_digits, lang)}</bdi></span>
                    </div>
                  ) : null}

                  {compensationControlsVisible ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <div>
                        {canReturnPermission ? (
                          requestedReturnLines.length > 0 ? (
                            <span className="text-sm text-slate-600">{labels.returnValue} <strong className="text-slate-900" dir="ltr">{formatMoney(returnTotal, selectedSale.currency_code, selectedSale.currency_fraction_digits, lang)}</strong></span>
                          ) : (
                            <span className="text-xs text-slate-500">{labels.selectReturnQuantity}</span>
                          )
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canVoidPermission && canVoidSale ? (
                          <button type="button" onClick={() => setConfirmAction('void')} disabled={busy} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50">{labels.voidSale}</button>
                        ) : null}
                        {canReturnPermission ? (
                          <button type="button" onClick={() => setConfirmAction('return')} disabled={busy || requestedReturnLines.length === 0} className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40">{labels.returnSelected}</button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {confirmAction && selectedSale && confirmationAllowed ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" dir={dir}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold">{confirmAction === 'void' ? labels.confirmVoid : labels.confirmReturn}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {confirmAction === 'void'
                ? labels.voidConfirmText
                : <>{labels.returnConfirmPrefix} <bdi dir="ltr">{formatMoney(returnTotal, selectedSale.currency_code, selectedSale.currency_fraction_digits, lang)}</bdi>.</>}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmAction(null)} disabled={busy} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">{labels.backAction}</button>
              <button
                type="button"
                onClick={() => void (confirmAction === 'void' ? performVoid() : performReturn())}
                disabled={busy}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${confirmAction === 'void' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                {busy ? labels.executing : confirmAction === 'void' ? labels.confirmVoid : labels.confirmReturn}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
