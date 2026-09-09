import { SERVER_ORDERS_PAGE_STATUS_LABELS, SERVER_ORDERS_PAGE_PAYMENT_LABELS } from '@/lib/translations/features/pages/dashboard/ServerOrdersPage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Order, OrderStatus, PaymentStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  Package,
  RefreshCw,
  Search,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatMerchantMoneyMinor } from '@/lib/moneyUi';
import { subscribeCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';
import {
  getMerchantRegionalContext,
  type MerchantRegionalContext,
} from '@/lib/merchantRegionalUiApi';

type ServerOrder = Order & {
  version: number;
  updated_at: string;
  source_channel?: string;
  total_price?: number;
  last_payment_decision?: {
    operation: 'confirm' | 'reject';
    outcome: 'paid' | 'failed';
    actor_id: string;
    decided_at: string;
    reason?: string;
    confirmation_source?: 'merchant_confirmed' | 'provider_verified';
  };
};

type LanguageCode = 'ar' | 'ku' | 'en';

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_confirmation: [
    'pending_confirmation',
    'confirmed',
    'cancelled',
    'out_of_stock',
    'waiting_customer_approval',
  ],
  confirmed: ['confirmed', 'preparing', 'cancelled'],
  preparing: ['preparing', 'shipped', 'cancelled'],
  shipped: ['shipped', 'delivered'],
  delivered: ['delivered'],
  cancelled: ['cancelled'],
  out_of_stock: [
    'out_of_stock',
    'pending_confirmation',
    'waiting_customer_approval',
    'cancelled',
  ],
  waiting_customer_approval: [
    'waiting_customer_approval',
    'pending_confirmation',
    'confirmed',
    'out_of_stock',
    'cancelled',
  ],
};

const STATUS_LABELS: Record<LanguageCode, Record<OrderStatus, string>> = SERVER_ORDERS_PAGE_STATUS_LABELS;

const PAYMENT_LABELS: Record<LanguageCode, Record<PaymentStatus, string>> = SERVER_ORDERS_PAGE_PAYMENT_LABELS;

function languageCode(i18n: ReturnType<typeof useI18n>): LanguageCode {
  const value = String(
    (i18n as unknown as { language?: string }).language || '',
  ).trim();
  if (value === 'ar' || value === 'ku' || value === 'en') return value;
  return i18n.isRTL ? 'ar' : 'en';
}

function textFor(language: LanguageCode) {
  if (language === 'ar') {
    return {
      title: 'الطلبات',
      subtitle: 'كل التغييرات محفوظة على السيرفر فقط',
      search: 'ابحث بالاسم أو الهاتف أو رقم الطلب',
      refresh: 'تحديث',
      loading: 'جاري تحميل الطلبات…',
      empty: 'لا توجد طلبات حالياً',
      select: 'اختر طلباً لعرض التفاصيل',
      phone: 'الهاتف',
      address: 'العنوان',
      items: 'المنتجات',
      total: 'المجموع',
      orderStatus: 'حالة الطلب',
      paymentStatus: 'حالة الدفع',
      markReview: 'إرسال إلى مراجعة يدوية',
      markPending: 'إرجاع إلى انتظار التحقق',
      confirm: 'تأكيد الدفع',
      confirmCash: 'تأكيد استلام النقد',
      reject: 'رفض الدفع',
      rejectionReason: 'اكتب سبب الرفض',
      conflict: 'تم تحديث الطلب من جهاز آخر. حُمّلت النسخة الأحدث.',
      loadFailed: 'تعذر تحميل الطلبات من السيرفر',
      updateFailed: 'تعذر تحديث الطلب',
      updated: 'تم تحديث الطلب',
      version: 'نسخة',
      paymentDecision: 'آخر قرار دفع',
      confirmationSource: 'مصدر تأكيد الدفع',
      merchantConfirmed: 'أكد التاجر يدويًا',
      providerVerified: 'تم التحقق من مزود الدفع',
      paymentConflictTitle: 'يوجد تعارض في معلومات الدفع',
      paymentConflictBody: 'تم إيقاف البوت لهذه المحادثة فقط. راجع العملية مع الزبون ثم سجل حل الخلاف.',
      resolutionNote: 'اكتب كيف تم حل الخلاف',
      resolveConflict: 'تم حل الخلاف',
      conflictResolved: 'تم تسجيل حل خلاف الدفع. يمكنك إعادة المحادثة إلى فوري من صفحة المحادثات.',
    };
  }
  if (language === 'ku') {
    return {
      title: 'داواکارییەکان',
      subtitle: 'هەموو گۆڕانکارییەکان تەنها لە ڕاژەکار هەڵدەگیرێن',
      search: 'بە ناو، تەلەفۆن یان ژمارەی داواکاری بگەڕێ',
      refresh: 'نوێکردنەوە',
      loading: 'داواکارییەکان بار دەکرێن…',
      empty: 'هیچ داواکارییەک نییە',
      select: 'داواکارییەک هەڵبژێرە',
      phone: 'تەلەفۆن',
      address: 'ناونیشان',
      items: 'بەرهەمەکان',
      total: 'کۆی گشتی',
      orderStatus: 'دۆخی داواکاری',
      paymentStatus: 'دۆخی پارەدان',
      markReview: 'ناردن بۆ پشکنینی دەستی',
      markPending: 'گەڕاندنەوە بۆ چاوەڕوانی',
      confirm: 'پشتڕاستکردنەوەی پارەدان',
      confirmCash: 'پشتڕاستکردنەوەی پارەی نەقد',
      reject: 'ڕەتکردنەوەی پارەدان',
      rejectionReason: 'هۆکاری ڕەتکردنەوە بنووسە',
      conflict: 'لە ئامێرێکی تر نوێکرایەوە. نوێترین وەشان بارکرا.',
      loadFailed: 'نەتوانرا داواکارییەکان لە ڕاژەکارەوە باربکرێن',
      updateFailed: 'نەتوانرا داواکارییەکە نوێبکرێتەوە',
      updated: 'داواکارییەکە نوێکرایەوە',
      version: 'وەشان',
      paymentDecision: 'دوایین بڕیاری پارەدان',
      confirmationSource: 'سەرچاوەی پشتڕاستکردنەوەی پارەدان',
      merchantConfirmed: 'فرۆشیار بە دەستی پشتڕاستی کردەوە',
      providerVerified: 'دابینکەری پارەدان پشتڕاستی کردەوە',
      paymentConflictTitle: 'ناکۆکی لە زانیاری پارەدان هەیە',
      paymentConflictBody: 'بۆتی تەنها بۆ ئەم گفتوگۆیە وەستاوە. مامەڵەکە پشکنین بکە و چارەسەرەکە تۆمار بکە.',
      resolutionNote: 'چۆنیەتی چارەسەرکردنی ناکۆکی بنووسە',
      resolveConflict: 'ناکۆکی چارەسەر کرا',
      conflictResolved: 'چارەسەری ناکۆکی پارەدان تۆمار کرا. دەتوانیت گفتوگۆکە بگەڕێنیتەوە بۆ فەوری.',
    };
  }
  return {
    title: 'Orders',
    subtitle: 'All operational changes are stored only on the server',
    search: 'Search by customer, phone, or order ID',
    refresh: 'Refresh',
    loading: 'Loading orders…',
    empty: 'No orders yet',
    select: 'Select an order to view details',
    phone: 'Phone',
    address: 'Address',
    items: 'Items',
    total: 'Total',
    orderStatus: 'Order status',
    paymentStatus: 'Payment status',
    markReview: 'Send to manual review',
    markPending: 'Return to pending verification',
    confirm: 'Confirm payment',
    confirmCash: 'Confirm cash received',
    reject: 'Reject payment',
    rejectionReason: 'Enter the rejection reason',
    conflict: 'This order changed on another device. The latest version was loaded.',
    loadFailed: 'Could not load orders from the server',
    updateFailed: 'Could not update the order',
    updated: 'Order updated',
    version: 'Version',
    paymentDecision: 'Last payment decision',
    confirmationSource: 'Payment confirmation source',
    merchantConfirmed: 'Merchant confirmed manually',
    providerVerified: 'Verified by payment provider',
    paymentConflictTitle: 'Payment information conflict',
    paymentConflictBody: 'Fawri paused only this conversation. Review the payment with the customer, then record how the conflict was resolved.',
    resolutionNote: 'Describe how the conflict was resolved',
    resolveConflict: 'Mark conflict resolved',
    conflictResolved: 'Payment conflict resolution recorded. You can return the conversation to Fawri from Conversations.',
  };
}

function orderTotal(order: ServerOrder): number {
  if (Number.isFinite(order.total_price)) return Number(order.total_price);
  return order.items.reduce(
    (total, item) =>
      total + Number(item.price || 0) * Number(item.quantity || 0),
    0,
  );
}

function money(
  value: number,
  language: LanguageCode,
  regional: MerchantRegionalContext | null,
): string {
  if (!regional) return '—';
  return formatMerchantMoneyMinor(
    value,
    regional.currency_code,
    regional.currency_fraction_digits,
    language,
  );
}

function statusVariant(status: OrderStatus) {
  if (status === 'delivered' || status === 'confirmed') return 'default' as const;
  if (status === 'cancelled' || status === 'out_of_stock') {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

function requestedOrderId(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('order')?.trim() || '';
}

export default function ServerOrdersPage() {
  const i18n = useI18n();
  const language = languageCode(i18n);
  const labels = textFor(language);
  const [orders, setOrders] = useState<ServerOrder[]>([]);
  const [regional, setRegional] = useState<MerchantRegionalContext | null>(null);
  const linkedOrderIdRef = useRef(requestedOrderId());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [conflictResolutionNote, setConflictResolutionNote] = useState('');

  const replaceOrder = (order: ServerOrder) => {
    setOrders(current =>
      current.map(item => (item.id === order.id ? order : item)),
    );
  };

  const loadOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [response, regionalContext] = await Promise.all([
        fetch('/api/orders', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        }),
        getMerchantRegionalContext(),
      ]);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !Array.isArray(data.orders)) {
        throw new Error(data?.error || labels.loadFailed);
      }
      const nextOrders = data.orders as ServerOrder[];
      setRegional(regionalContext);
      setOrders(nextOrders);
      setLoadError('');
      setSelectedOrderId(current => {
        const linkedOrderId = linkedOrderIdRef.current;
        linkedOrderIdRef.current = '';
        if (linkedOrderId && nextOrders.some(order => order.id === linkedOrderId)) {
          return linkedOrderId;
        }
        return current && nextOrders.some(order => order.id === current)
          ? current
          : nextOrders[0]?.id || null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : labels.loadFailed;
      setLoadError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
    const interval = window.setInterval(() => {
      if (!pendingOrderId) void loadOrders(true);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [pendingOrderId, language]);

  useEffect(() => {
    return subscribeCashierDashboardRefresh(() => {
      if (!pendingOrderId) void loadOrders(true);
    });
  }, [pendingOrderId, language]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter(order =>
      [order.id, order.customer_name, order.phone]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [orders, search]);

  const selectedOrder = useMemo(
    () => orders.find(order => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  const mutateOrder = async (
    order: ServerOrder,
    endpoint: string,
    body: Record<string, unknown>,
    method: 'PATCH' | 'POST',
  ) => {
    if (pendingOrderId) return;
    setPendingOrderId(order.id);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expected_version: order.version, ...body }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.order) {
        if (data?.code === 'ORDER_VERSION_CONFLICT' && data.current_order) {
          replaceOrder(data.current_order as ServerOrder);
          toast.error(labels.conflict);
          return;
        }
        throw new Error(data?.error || labels.updateFailed);
      }
      replaceOrder(data.order as ServerOrder);
      setRejectionReason('');
      setConflictResolutionNote('');
      toast.success(labels.updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : labels.updateFailed);
      await loadOrders(true);
    } finally {
      setPendingOrderId(null);
    }
  };

  const updateOrderStatus = (order: ServerOrder, status: OrderStatus) =>
    void mutateOrder(
      order,
      `/api/orders/${encodeURIComponent(order.id)}/status`,
      { status },
      'PATCH',
    );

  const updateNonTerminalPaymentStatus = (
    order: ServerOrder,
    paymentStatus: 'electronic_pending' | 'manual_review',
  ) =>
    void mutateOrder(
      order,
      `/api/orders/${encodeURIComponent(order.id)}/payment-status`,
      { payment_status: paymentStatus },
      'PATCH',
    );

  const confirmPayment = (order: ServerOrder) =>
    void mutateOrder(
      order,
      `/api/orders/${encodeURIComponent(order.id)}/payment/confirm`,
      {},
      'POST',
    );

  const resolvePaymentConflict = (order: ServerOrder) => {
    const note = conflictResolutionNote.trim();
    if (!note) {
      toast.error(labels.resolutionNote);
      return;
    }
    void mutateOrder(
      order,
      `/api/orders/${encodeURIComponent(order.id)}/payment/conflict/resolve`,
      { resolution_note: note },
      'POST',
    );
  };

  const rejectPayment = (order: ServerOrder) => {
    const reason = rejectionReason.trim();
    if (!reason) {
      toast.error(labels.rejectionReason);
      return;
    }
    void mutateOrder(
      order,
      `/api/orders/${encodeURIComponent(order.id)}/payment/reject`,
      { reason },
      'POST',
    );
  };

  const busy = selectedOrder ? pendingOrderId === selectedOrder.id : false;
  const electronicPending =
    selectedOrder?.payment_method !== 'cash_on_delivery' &&
    (selectedOrder?.payment_status === 'electronic_pending' ||
      selectedOrder?.payment_status === 'manual_review');
  const paymentConflictActive =
    selectedOrder?.payment_reconciliation_status === 'reconciliation_required';
  const cashCanConfirm =
    selectedOrder?.payment_method === 'cash_on_delivery' &&
    selectedOrder.payment_status === 'cash_on_delivery' &&
    selectedOrder.status === 'delivered';

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={i18n.dir}>
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {labels.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {labels.subtitle}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadOrders()}
            disabled={loading || Boolean(pendingOrderId)}
          >
            {loading ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="me-2 h-4 w-4" />
            )}
            {labels.refresh}
          </Button>
        </div>

        {loadError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {loadError}
          </div>
        ) : null}

        <div className="grid min-h-[65vh] gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="space-y-3 border-b p-4">
              <CardTitle className="text-base">{labels.title}</CardTitle>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={labels.search}
                  className="ps-9"
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-[68vh] overflow-y-auto p-0">
              {loading && orders.length === 0 ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {labels.loading}
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center p-8 text-center text-muted-foreground">
                  <Package className="mb-3 h-10 w-10 opacity-30" />
                  <span className="text-sm">{labels.empty}</span>
                </div>
              ) : (
                filteredOrders.map(order => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(order.id);
                      setRejectionReason('');
                    }}
                    className={`w-full border-b p-4 text-start transition-colors hover:bg-accent ${
                      selectedOrderId === order.id ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {order.customer_name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          #{order.id}
                        </p>
                      </div>
                      <Badge variant={statusVariant(order.status)}>
                        {STATUS_LABELS[language][order.status]}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {PAYMENT_LABELS[language][order.payment_status]}
                      </span>
                      <span className="font-bold">
                        {money(orderTotal(order), language, regional)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {selectedOrder ? (
            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>{selectedOrder.customer_name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      #{selectedOrder.id} · {labels.version} {selectedOrder.version}
                    </p>
                  </div>
                  <Badge variant={statusVariant(selectedOrder.status)}>
                    {STATUS_LABELS[language][selectedOrder.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">
                      {labels.phone}
                    </p>
                    <p className="mt-1 font-medium">
                      {selectedOrder.phone || '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      {labels.address}
                    </p>
                    <p className="mt-1 font-medium">
                      {selectedOrder.address || '—'}
                    </p>
                  </div>
                </div>

                <div>
                  <h2 className="mb-3 font-bold">{labels.items}</h2>
                  <div className="space-y-2">
                    {selectedOrder.items.map((item, index) => (
                      <div
                        key={`${item.product_id || item.product_name}-${index}`}
                        className="flex items-center justify-between rounded-xl border p-3"
                      >
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            × {item.quantity}
                          </p>
                        </div>
                        <p className="font-bold">
                          {money(
                            Number(item.price || 0) * Number(item.quantity || 0),
                            language,
                            regional,
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between rounded-xl bg-primary/5 p-4 text-lg font-extrabold">
                    <span>{labels.total}</span>
                    <span>{money(orderTotal(selectedOrder), language, regional)}</span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium">
                    <span>{labels.orderStatus}</span>
                    <select
                      value={selectedOrder.status}
                      onChange={event =>
                        updateOrderStatus(
                          selectedOrder,
                          event.target.value as OrderStatus,
                        )
                      }
                      disabled={busy}
                      className="h-11 w-full rounded-md border bg-background px-3"
                    >
                      {ORDER_TRANSITIONS[selectedOrder.status].map(status => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[language][status]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="space-y-2 text-sm font-medium">
                    <span>{labels.paymentStatus}</span>
                    <div className="flex min-h-11 items-center rounded-md border bg-muted/20 px-3">
                      {PAYMENT_LABELS[language][selectedOrder.payment_status]}
                    </div>
                  </div>
                </div>

                {selectedOrder.payment_status === 'paid' &&
                selectedOrder.payment_confirmation_source ? (
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <p className="font-semibold">{labels.confirmationSource}</p>
                    <p className="mt-1 text-muted-foreground">
                      {selectedOrder.payment_confirmation_source === 'provider_verified'
                        ? labels.providerVerified
                        : labels.merchantConfirmed}
                      {selectedOrder.payment_provider
                        ? ` · ${selectedOrder.payment_provider}`
                        : ''}
                    </p>
                  </div>
                ) : null}

                {paymentConflictActive ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                    <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-5 w-5" />
                      {labels.paymentConflictTitle}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground/80">
                      {labels.paymentConflictBody}
                    </p>
                    {selectedOrder.payment_conflict_code ? (
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {selectedOrder.payment_conflict_code}
                      </p>
                    ) : null}
                    <Input
                      value={conflictResolutionNote}
                      onChange={event => setConflictResolutionNote(event.target.value)}
                      placeholder={labels.resolutionNote}
                      maxLength={500}
                      disabled={busy}
                      className="mt-3"
                    />
                    <Button
                      className="mt-3"
                      variant="outline"
                      disabled={busy || !conflictResolutionNote.trim()}
                      onClick={() => resolvePaymentConflict(selectedOrder)}
                    >
                      {labels.resolveConflict}
                    </Button>
                  </div>
                ) : selectedOrder.payment_reconciliation_status === 'resolved' ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                    {labels.conflictResolved}
                  </div>
                ) : null}

                {electronicPending ? (
                  <div className="rounded-xl border p-4">
                    <div className="mb-3 flex items-center gap-2 font-bold">
                      <CreditCard className="h-4 w-4 text-primary" />
                      {labels.paymentStatus}
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {selectedOrder.payment_status === 'electronic_pending' ? (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            updateNonTerminalPaymentStatus(
                              selectedOrder,
                              'manual_review',
                            )
                          }
                        >
                          {labels.markReview}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            updateNonTerminalPaymentStatus(
                              selectedOrder,
                              'electronic_pending',
                            )
                          }
                        >
                          {labels.markPending}
                        </Button>
                      )}
                    </div>
                    <Input
                      value={rejectionReason}
                      onChange={event => setRejectionReason(event.target.value)}
                      placeholder={labels.rejectionReason}
                      maxLength={500}
                      disabled={busy}
                    />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button
                        onClick={() => confirmPayment(selectedOrder)}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="me-2 h-4 w-4" />
                        )}
                        {labels.confirm}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => rejectPayment(selectedOrder)}
                        disabled={busy || !rejectionReason.trim()}
                      >
                        <XCircle className="me-2 h-4 w-4" />
                        {labels.reject}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {cashCanConfirm ? (
                  <Button
                    onClick={() => confirmPayment(selectedOrder)}
                    disabled={busy}
                  >
                    <CheckCircle2 className="me-2 h-4 w-4" />
                    {labels.confirmCash}
                  </Button>
                ) : null}

                {selectedOrder.last_payment_decision ? (
                  <div className="rounded-xl bg-muted/40 p-4 text-sm">
                    <p className="font-semibold">{labels.paymentDecision}</p>
                    <p className="mt-1 text-muted-foreground">
                      {selectedOrder.last_payment_decision.outcome} ·{' '}
                      {new Date(
                        selectedOrder.last_payment_decision.decided_at,
                      ).toLocaleString()}
                    </p>
                    {selectedOrder.last_payment_decision.reason ? (
                      <p className="mt-2">
                        {selectedOrder.last_payment_decision.reason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card className="flex min-h-[28rem] items-center justify-center">
              <CardContent className="flex flex-col items-center p-8 text-center text-muted-foreground">
                <Package className="mb-3 h-12 w-12 opacity-30" />
                <p>{labels.select}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
