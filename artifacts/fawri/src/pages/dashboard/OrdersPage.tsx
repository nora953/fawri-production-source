import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { getCurrentMerchant, getOrders, saveOrders } from '@/lib/store';
import { Order, OrderPaymentStatus, OrderStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ShoppingBag,
  User,
  CalendarDays,
  CreditCard,
  Package,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

type Lang = 'ar' | 'ku' | 'en';

type ServerOrder = {
  id: string;
  merchant_id?: string;
  conversation_id?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_area?: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  status?: string;
  source_channel?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};const statusOptions: OrderStatus[] = [
  'pending_confirmation',
  'confirmed',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
  'out_of_stock',
  'waiting_customer_approval',
];

function getOrderStatusColor(status: string) {
  switch (status) {
    case 'confirmed':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'preparing':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300';
    case 'shipped':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    case 'delivered':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'cancelled':
    case 'out_of_stock':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    default:
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
  }
}

function getPaymentStatusColor(status: string) {
  switch (status) {
    case 'paid':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'electronic_pending':
    case 'manual_review':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'cash_on_delivery':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}

function getOrderTotal(order: Order) {
  return order.items.reduce((acc, item) => acc + Number(item.price || 0) * Number(item.quantity || 0), 0);
}

function formatOrderId(id: string) {
  return id.slice(-6).toUpperCase();
}

function normalizeServerStatus(status?: string): OrderStatus {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'cancelled') return 'cancelled';
  return 'pending_confirmation';
}

function normalizeServerOrder(
  order: ServerOrder,
  unknownProduct: string,
  messengerCustomer: string,
): Order {
  const quantity = Number(order.quantity || 1);
  const unitPrice = Number(order.unit_price || order.total_price || 0);
  const productName = String(order.product_name || unknownProduct);

  return {
    id: String(order.id),
    merchant_id: String(order.merchant_id || ''),
    customer_name: String(order.customer_name || messengerCustomer),
    phone: String(order.customer_phone || ''),
    address: String(order.customer_address || order.customer_area || ''),
    items: [
      {
        product_id: order.product_id,
        product_name: productName,
        quantity,
        price: unitPrice,
      },
    ],
    payment_method: 'cash_on_delivery',
    payment_status: 'cash_on_delivery' as OrderPaymentStatus,
    status: normalizeServerStatus(order.status),
    created_at: String(order.created_at || new Date().toISOString()),
    updated_at: String(order.updated_at || order.created_at || new Date().toISOString()),
    source_channel: order.source_channel || 'messenger',
    notes: order.notes || '',
  } as Order;
}

function mergeApiOrdersWithLocal(apiOrders: Order[], localOrders: Order[]) {
  const localById = new Map(localOrders.map(order => [order.id, order]));

  const merged = apiOrders.map(apiOrder => {
    const localOrder = localById.get(apiOrder.id);
    if (!localOrder) return apiOrder;

    return {
      ...apiOrder,
      status: localOrder.status || apiOrder.status,
      payment_status: localOrder.payment_status || apiOrder.payment_status,
      payment_verified_at: (localOrder as any).payment_verified_at,
      payment_verified_by: (localOrder as any).payment_verified_by,
      payment_rejection_reason: (localOrder as any).payment_rejection_reason,
    } as Order;
  });

  const apiIds = new Set(apiOrders.map(order => order.id));
  const localOnlyOrders = localOrders.filter(order => !apiIds.has(order.id));

  return [...merged, ...localOnlyOrders];
}

export default function OrdersPage() {
  const { t, lang, dir } = useI18n();
  const currentLang = (lang || 'ar') as Lang;

  const merchant = getCurrentMerchant();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      if (!merchant?.id) {
        if (isMounted) setIsLoading(false);
        return;
      }

      const localOrders = getOrders(merchant.id) || [];
      if (isMounted) setOrders(localOrders);

      try {
        const response = await fetch(
          `/api/orders?merchantId=${encodeURIComponent(merchant.id)}`
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.ok || !Array.isArray(data.orders)) {
          throw new Error('Orders API did not return a valid orders list');
        }

        const apiOrders = data.orders.map((order: ServerOrder) =>
          normalizeServerOrder(order, t.unknownProduct, t.messengerCustomer)
        );

        const nextOrders = mergeApiOrdersWithLocal(apiOrders, localOrders);

        if (isMounted) {
          setOrders(nextOrders);
          saveOrders(nextOrders, merchant.id);
        }
      } catch (error) {
        console.error('Failed to load orders from API:', error);
        if (isMounted) setOrders(localOrders);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadOrders();

    return () => {
      isMounted = false;
    };
  }, [merchant?.id]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [orders]);

  if (!merchant) return null;

  const saveUpdatedOrders = (updated: Order[]) => {
    setOrders(updated);
    saveOrders(updated, merchant.id);
  };

  const handleStatusChange = (id: string, newStatus: OrderStatus) => {
    const updated = orders.map(order =>
      order.id === id ? { ...order, status: newStatus } : order
    );

    saveUpdatedOrders(updated);
  };

  const handlePaymentStatusChange = (id: string, newStatus: OrderPaymentStatus) => {
    const updated = orders.map(order =>
      order.id === id ? { ...order, payment_status: newStatus } : order
    );

    saveUpdatedOrders(updated);
  };

  const confirmPayment = (id: string) => {
    const updated = orders.map(order =>
      order.id === id
        ? {
            ...order,
            payment_status: 'paid' as OrderPaymentStatus,
            status: 'confirmed' as OrderStatus,
            payment_verified_at: new Date().toISOString(),
            payment_verified_by: merchant.id,
            payment_rejection_reason: undefined,
          }
        : order
    );

    saveUpdatedOrders(updated);
  };

  const rejectPayment = (id: string) => {
    const updated = orders.map(order =>
      order.id === id
        ? {
            ...order,
            payment_status: 'failed' as OrderPaymentStatus,
            status: 'pending_confirmation' as OrderStatus,
            payment_rejection_reason: 'Rejected by merchant',
          }
        : order
    );

    saveUpdatedOrders(updated);
  };

  const getLabel = (value: string) => {
    const labels: Record<string, string> = {
      cash_on_delivery: t.orders_label_cash_on_delivery,
      superqi: t.orders_label_superqi,
      fastpay: t.orders_label_fastpay,
      zaincash: t.orders_label_zaincash,
      other: t.orders_label_other,
      electronic_pending: t.orders_label_electronic_pending,
      paid: t.orders_label_paid,
      failed: t.orders_label_failed,
      manual_review: t.orders_label_manual_review,
      pending_confirmation: t.orders_label_pending_confirmation,
      confirmed: t.orders_label_confirmed,
      preparing: t.orders_label_preparing,
      shipped: t.orders_label_shipped,
      delivered: t.orders_label_delivered,
      cancelled: t.orders_label_cancelled,
      out_of_stock: t.orders_label_out_of_stock,
      waiting_customer_approval:
        t.orders_label_waiting_customer_approval,
    };

    return labels[value] || value.replace(/_/g, ' ');
  };

  const getPaymentStatusLabel = (value: string) => {
    if (value === 'cash_on_delivery') {
      return t.orders_label_pending_cash_payment;
    }

    return getLabel(value);
  };

  const renderPaymentReviewActions = (order: Order) => {
    const needsReview =
      order.payment_status === 'electronic_pending' ||
      order.payment_status === 'manual_review';

    if (!needsReview) return null;

    return (
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          onClick={() => confirmPayment(order.id)}
          className="h-10 rounded-xl bg-green-600 text-white hover:bg-green-700"
        >
          <CheckCircle2 className="ml-2 h-4 w-4" />
          {t.confirmPayment}
        </Button>

        <Button
          type="button"
          variant="destructive"
          onClick={() => rejectPayment(order.id)}
          className="h-10 rounded-xl"
        >
          <XCircle className="ml-2 h-4 w-4" />
          {t.rejectPayment}
        </Button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 pb-28" dir={dir}>
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          {t.orders}
        </h1>
      </div>

      {isLoading ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
          <ShoppingBag className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
          <p className="text-lg font-semibold text-muted-foreground">{t.loading}</p>
        </div>
      ) : sortedOrders.length === 0 ? (
        <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
          <ShoppingBag className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
          <p className="text-lg font-semibold text-muted-foreground">{t.noOrders}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t.noOrdersDesc}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:hidden">
            {sortedOrders.map(order => {
              const total = getOrderTotal(order);

              return (
                <div key={order.id} className="rounded-3xl border bg-card p-4 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t.orderId}</p>
                      <p className="mt-1 font-mono text-lg font-extrabold">
                        #{formatOrderId(order.id)}
                      </p>
                    </div>

                    <Badge className={getPaymentStatusColor(order.payment_status)}>
                      {getPaymentStatusLabel(order.payment_status)}
                    </Badge>
                  </div>

                  {order.payment_status === 'electronic_pending' && (
                    <div className="mb-3 flex items-start gap-2 rounded-2xl border border-yellow-200 bg-yellow-50 p-3 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="text-xs leading-5">{t.electronic_pending}</p>
                    </div>
                  )}

                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3 rounded-2xl bg-muted/30 p-3">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="font-bold">{order.customer_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                          {order.phone || '-'}
                        </p>
                        {(order as any).address && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {(order as any).address}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-muted/30 p-3">
                      <div className="mb-2 flex items-center gap-2 font-bold">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        {t.items}
                      </div>

                      <div className="space-y-1 text-muted-foreground">
                        {order.items.map((item, index) => (
                          <div key={index} className="flex justify-between gap-3">
                            <span className="line-clamp-1">{item.product_name}</span>
                            <span className="shrink-0" dir="ltr">
                              ×{item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-muted/30 p-3">
                        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <CreditCard className="h-4 w-4" />
                          {t.payment}
                        </div>
                        <p className="font-bold">{getLabel(order.payment_method)}</p>
                      </div>

                      <div className="rounded-2xl bg-muted/30 p-3">
                        <p className="mb-1 text-xs text-muted-foreground">{t.total}</p>
                        <p className="font-extrabold">
                          {total.toLocaleString()} {t.currency}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-muted/30 p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="h-4 w-4" />
                        {t.date}
                      </div>
                      <p className="font-medium">
                        {new Date(order.created_at).toLocaleDateString(
                          currentLang === 'en' ? 'en-US' : 'ar-IQ'
                        )}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                          {t.orderStatus}
                        </p>
                        <Select
                          value={order.status}
                          onValueChange={value =>
                            handleStatusChange(order.id, value as OrderStatus)
                          }
                        >
                          <SelectTrigger
                            className={`h-11 rounded-xl border-0 ${getOrderStatusColor(order.status)}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map(status => (
                              <SelectItem key={status} value={status}>
                                {getPaymentStatusLabel(status)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <p className="mb-1 text-xs text-muted-foreground">
                          {t.paymentStatus}
                        </p>
                        <Select
                          value={order.payment_status}
                          onValueChange={value =>
                            handlePaymentStatusChange(order.id, value as OrderPaymentStatus)
                          }
                        >
                          <SelectTrigger
                            className={`h-11 rounded-xl border-0 ${getPaymentStatusColor(order.payment_status)}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              'cash_on_delivery',
                              'electronic_pending',
                              'manual_review',
                              'paid',
                              'failed',
                            ].map(status => (
                              <SelectItem key={status} value={status}>
                                {getPaymentStatusLabel(status)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {renderPaymentReviewActions(order)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border bg-card shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 text-start">{t.orderId}</th>
                    <th className="px-6 py-4 text-start">{t.customer}</th>
                    <th className="px-6 py-4 text-start">{t.items}</th>
                    <th className="px-6 py-4 text-start">{t.total}</th>
                    <th className="px-6 py-4 text-start">{t.payment}</th>
                    <th className="px-6 py-4 text-start">{t.paymentStatus}</th>
                    <th className="px-6 py-4 text-start">{t.orderStatus}</th>
                    <th className="px-6 py-4 text-start">{t.date}</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {sortedOrders.map(order => {
                    const total = getOrderTotal(order);

                    return (
                      <tr key={order.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-6 py-4 font-mono font-medium">
                          #{formatOrderId(order.id)}
                        </td>

                        <td className="px-6 py-4">
                          <div className="font-medium">{order.customer_name}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">
                            {order.phone || '-'}
                          </div>
                          {(order as any).address && (
                            <div className="text-xs text-muted-foreground">
                              {(order as any).address}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-xs">
                          {order.items.map((item, index) => (
                            <div key={index}>
                              <span dir="ltr">×{item.quantity}</span> {item.product_name}
                            </div>
                          ))}
                        </td>

                        <td className="px-6 py-4 font-bold">
                          {total.toLocaleString()} {t.currency}
                        </td>

                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-[10px]">
                            {getLabel(order.payment_method)}
                          </Badge>
                        </td>

                        <td className="px-6 py-4">
                          <Select
                            value={order.payment_status}
                            onValueChange={value =>
                              handlePaymentStatusChange(order.id, value as OrderPaymentStatus)
                            }
                          >
                            <SelectTrigger
                              className={`h-8 min-w-[190px] border-0 ${getPaymentStatusColor(order.payment_status)}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[
                                'cash_on_delivery',
                                'electronic_pending',
                                'manual_review',
                                'paid',
                                'failed',
                              ].map(status => (
                                <SelectItem key={status} value={status}>
                                  {getPaymentStatusLabel(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {renderPaymentReviewActions(order)}
                        </td>

                        <td className="px-6 py-4">
                          <Select
                            value={order.status}
                            onValueChange={value =>
                              handleStatusChange(order.id, value as OrderStatus)
                            }
                          >
                            <SelectTrigger
                              className={`h-8 min-w-[160px] border-0 ${getOrderStatusColor(order.status)}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map(status => (
                                <SelectItem key={status} value={status}>
                                  {getPaymentStatusLabel(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        <td className="whitespace-nowrap px-6 py-4 text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString(
                            currentLang === 'en' ? 'en-US' : 'ar-IQ'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
