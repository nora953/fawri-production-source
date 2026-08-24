import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createCashierHistoryRuntime,
  type CashierHistoryRuntime,
} from '@/lib/cashierHistoryRuntime';
import type {
  CashierSaleLineSnapshot,
  CashierSaleSnapshot,
} from '@/lib/cashierLocalContracts';
import { publishCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';

type ConfirmAction = 'return' | 'void' | null;

function operationId(prefix: 'return' | 'void'): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function formatMoney(amountMinor: number, currencyCode: string, fractionDigits: number): string {
  const divisor = 10 ** fractionDigits;
  try {
    return new Intl.NumberFormat('ar-IQ', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amountMinor / divisor);
  } catch {
    return `${(amountMinor / divisor).toLocaleString('ar-IQ')} ${currencyCode}`;
  }
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('ar-IQ', {
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

function paymentMethodLabel(value: CashierSaleSnapshot['payment_method']): string {
  if (value === 'cash') return 'نقدي';
  if (value === 'card') return 'بطاقة';
  if (value === 'electronic') return 'إلكتروني';
  return 'أخرى';
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
  return Math.max(0, line.quantity - returnedQuantity(sale, line.line_id));
}

function totalReturnedQuantity(sale: CashierSaleSnapshot): number {
  return (sale.returns || []).reduce(
    (total, snapshot) => total + snapshot.lines.reduce((sum, line) => sum + line.quantity, 0),
    0,
  );
}

function saleState(sale: CashierSaleSnapshot): {
  label: string;
  className: string;
} {
  if (sale.status === 'voided' || sale.void) {
    return { label: 'ملغى', className: 'bg-red-50 text-red-700 border-red-200' };
  }
  const sold = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
  const returned = totalReturnedQuantity(sale);
  if (returned >= sold && sold > 0) {
    return { label: 'مرتجع بالكامل', className: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  if (returned > 0) {
    return { label: 'مرتجع جزئي', className: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  return { label: 'مكتمل', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

function saleOperationIds(sale: CashierSaleSnapshot): string[] {
  return [
    sale.operation_id,
    ...(sale.returns || []).map(item => item.operation_id),
    ...(sale.void ? [sale.void.operation_id] : []),
  ];
}

function syncErrorCode(error: unknown): string {
  return typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
}

export default function CashierHistoryPage() {
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
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

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
    void createCashierHistoryRuntime()
      .then(async created => {
        activeRuntime = created;
        if (stopped) return;
        setRuntime(created);
        await refresh(created);
      })
      .catch(() => {
        if (!stopped) setError('تعذر فتح سجل الكاشير على هذا الجهاز.');
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
      if (activeRuntime) void activeRuntime.close().catch(() => undefined);
    };
  }, [refresh]);

  useEffect(() => {
    if (!runtime) return;
    const updateOnline = () => setOnline(navigator.onLine);
    const refreshLocal = () => void refresh(runtime).catch(() => undefined);
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

  const canVoid = Boolean(
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
        if (syncErrorCode(cause) === 'CASHIER_OUTBOX_SESSION_REQUIRED') {
          setAuthRequired(true);
        }
        // The local operation is already durable. Any cloud failure leaves the
        // outbox untouched for the automatic retry loop.
      } finally {
        await refresh(activeRuntime).catch(() => undefined);
      }
    },
    [refresh],
  );

  const performReturn = useCallback(async () => {
    if (!runtime || !selectedSale || requestedReturnLines.length === 0) return;
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
      setNotice('تم الإرجاع.');
      await refresh(runtime);
      void syncAfterLocalChange(runtime);
    } catch {
      setConfirmAction(null);
      setError('تعذر الإرجاع. تحقق من الكمية وحاول مجددًا.');
    } finally {
      setBusy(false);
    }
  }, [refresh, requestedReturnLines, runtime, selectedSale, syncAfterLocalChange]);

  const performVoid = useCallback(async () => {
    if (!runtime || !selectedSale || !canVoid) return;
    setBusy(true);
    setError(null);
    try {
      await runtime.voidSale({
        operation_id: operationId('void'),
        sale_id: selectedSale.sale_id,
      });
      setConfirmAction(null);
      setNotice('تم إلغاء البيع.');
      await refresh(runtime);
      void syncAfterLocalChange(runtime);
    } catch {
      setConfirmAction(null);
      setError('تعذر إلغاء البيع.');
    } finally {
      setBusy(false);
    }
  }, [canVoid, refresh, runtime, selectedSale, syncAfterLocalChange]);

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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 lg:h-screen lg:overflow-hidden" dir="rtl">
      <div className="mx-auto flex min-h-screen max-w-[1450px] flex-col p-3 lg:h-screen lg:min-h-0 lg:p-5">
        <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <img src="/fawri-logo.svg" alt="Fawri" className="h-10 w-10 object-contain" />
            <div>
              <h1 className="text-xl font-bold">سجل الكاشير</h1>
              <p className="mt-0.5 text-xs text-slate-500">راجع المبيعات والإرجاعات والإلغاءات.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`rounded-full px-3 py-1.5 font-semibold ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
              {online ? 'متصل' : 'غير متصل'}
            </span>
            <a href="/cashier.html" className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 transition hover:bg-slate-50">
              العودة للكاشير
            </a>
          </div>
        </header>

        {authRequired ? (
          <div className="mb-3 shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div>
              <strong className="block">سجّل الدخول للمزامنة</strong>
              <span className="text-amber-800">عملياتك محفوظة وستتم مزامنتها بعد تسجيل الدخول.</span>
            </div>
            <a href="/login" className="rounded-xl bg-slate-900 px-4 py-2 font-bold text-white">تسجيل الدخول</a>
          </div>
        ) : null}

        {!online ? (
          <div className="mb-3 shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            غير متصل. يمكنك الاستمرار، وستتم المزامنة عند عودة الاتصال.
          </div>
        ) : null}

        {notice ? <div className="mb-3 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</div> : null}
        {error ? <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex lg:min-h-0 lg:flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="font-bold">المبيعات</h2>
                <p className="mt-0.5 text-xs text-slate-500">{sales.length} عملية</p>
              </div>
              {pendingIds.size > 0 ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{pendingIds.size} بانتظار المزامنة</span>
              ) : null}
            </div>

            <div className="p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {loading ? <div className="p-6 text-center text-sm text-slate-500">جارٍ تحميل السجل...</div> : null}
              {!loading && sales.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">لا توجد مبيعات بعد.</div>
              ) : null}
              {sales.map(sale => {
                const state = saleState(sale);
                const pending = saleOperationIds(sale).some(id => pendingIds.has(id));
                const active = sale.sale_id === selectedSaleId;
                return (
                  <button
                    key={sale.sale_id}
                    type="button"
                    onClick={() => setSelectedSaleId(sale.sale_id)}
                    className={`mb-1.5 w-full rounded-xl border px-3 py-2.5 text-right transition ${active ? 'border-orange-300 bg-orange-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-sm">عملية بيع #{saleReference(sale.sale_id)}</strong>
                        <span className="mt-0.5 block text-xs text-slate-500">{formatDate(sale.occurred_at)}</span>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${state.className}`}>{state.label}</span>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <strong>{formatMoney(sale.total_minor, sale.currency_code, sale.currency_fraction_digits)}</strong>
                      <span className={`text-xs font-semibold ${pending ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {pending ? (online ? 'بانتظار المزامنة' : 'محفوظ على الجهاز') : 'متزامن'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:min-h-0 lg:overflow-y-auto">
            {!selectedSale ? (
              <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-slate-500">اختر عملية لعرض التفاصيل.</div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">تفاصيل البيع</h2>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${saleState(selectedSale).className}`}>{saleState(selectedSale).label}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selectedPending ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                        {selectedPending ? (online ? 'بانتظار المزامنة' : 'محفوظ على الجهاز') : 'متزامن'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">عملية بيع #{saleReference(selectedSale.sale_id)}</p>
                  </div>
                  <div className="text-left">
                    <strong className="block text-xl">{formatMoney(selectedSale.total_minor, selectedSale.currency_code, selectedSale.currency_fraction_digits)}</strong>
                    <span className="text-xs text-slate-500">{formatDate(selectedSale.occurred_at)}</span>
                  </div>
                </div>

                <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="block text-xs text-slate-500">طريقة الدفع</span>
                    <strong className="mt-1 block text-sm">{paymentMethodLabel(selectedSale.payment_method)}</strong>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="block text-xs text-slate-500">حالة الدفع</span>
                    <strong className="mt-1 block text-sm">{selectedSale.payment_status === 'paid' ? 'مدفوع' : selectedSale.payment_status === 'pending' ? 'معلق' : 'فشل'}</strong>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="block text-xs text-slate-500">عدد العناصر</span>
                    <strong className="mt-1 block text-sm">{selectedSale.lines.reduce((sum, line) => sum + line.quantity, 0)}</strong>
                  </div>
                </div>

                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-bold">المنتجات</h3>
                    {returnableLines.length > 0 ? (
                      <button type="button" onClick={selectAllReturnable} className="text-xs font-bold text-orange-600 hover:text-orange-700">إرجاع الكل</button>
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
                                <span>مباع: {line.quantity}</span>
                                {returned > 0 ? <span>مرتجع: {returned}</span> : null}
                                <span>متاح للإرجاع: {remaining}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <strong>{formatMoney(line.line_total_minor, selectedSale.currency_code, selectedSale.currency_fraction_digits)}</strong>
                              {remaining > 0 && selectedSale.status === 'completed' && !selectedSale.void ? (
                                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
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
                      <strong>الإرجاعات السابقة</strong>
                      <div className="mt-2 space-y-1 text-xs">
                        {(selectedSale.returns || []).map(item => (
                          <div key={item.return_id} className="flex flex-wrap justify-between gap-2">
                            <span>{formatDate(item.occurred_at)}</span>
                            <strong>{formatMoney(item.refund_total_minor, item.currency_code, item.currency_fraction_digits)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedFullyReturned ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                      تم إرجاع البيع بالكامل.
                    </div>
                  ) : null}

                  {selectedSale.void ? (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <strong>تم إلغاء البيع</strong>
                      <span className="mt-1 block text-xs">{formatDate(selectedSale.void.occurred_at)} · {formatMoney(selectedSale.void.refund_total_minor, selectedSale.currency_code, selectedSale.currency_fraction_digits)}</span>
                    </div>
                  ) : null}

                  {selectedSale.status === 'completed' && !selectedSale.void && returnableLines.length > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <div>
                        {requestedReturnLines.length > 0 ? (
                          <span className="text-sm text-slate-600">قيمة الإرجاع: <strong className="text-slate-900">{formatMoney(returnTotal, selectedSale.currency_code, selectedSale.currency_fraction_digits)}</strong></span>
                        ) : (
                          <span className="text-xs text-slate-500">حدد الكمية للإرجاع.</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canVoid ? (
                          <button type="button" onClick={() => setConfirmAction('void')} disabled={busy} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50">إلغاء البيع</button>
                        ) : null}
                        <button type="button" onClick={() => setConfirmAction('return')} disabled={busy || requestedReturnLines.length === 0} className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40">إرجاع المحدد</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {confirmAction && selectedSale ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" dir="rtl">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold">{confirmAction === 'void' ? 'تأكيد الإلغاء' : 'تأكيد الإرجاع'}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {confirmAction === 'void'
                ? 'سيتم إلغاء البيع وإعادة الكمية إلى المخزون.'
                : `سيتم إرجاع المحدد بقيمة ${formatMoney(returnTotal, selectedSale.currency_code, selectedSale.currency_fraction_digits)}.`}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmAction(null)} disabled={busy} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">رجوع</button>
              <button
                type="button"
                onClick={() => void (confirmAction === 'void' ? performVoid() : performReturn())}
                disabled={busy}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${confirmAction === 'void' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                {busy ? 'جارٍ التنفيذ...' : confirmAction === 'void' ? 'تأكيد الإلغاء' : 'تأكيد الإرجاع'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}