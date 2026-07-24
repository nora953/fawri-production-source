import { getOrders, saveOrders } from './store';
import type {
  Order,
  OrderItem,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
} from './types';

type CreateOrderInput = {
  merchant_id: string;
  customer_name: string;
  phone: string;
  address: string;
  items: OrderItem[];
  payment_method: PaymentMethod;
  payment_screenshot?: string;
  notes?: string;
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getInitialPaymentStatus(method: PaymentMethod): OrderPaymentStatus {
  if (method === 'superqi' || method === 'fastpay' || method === 'zaincash') {
    return 'electronic_pending';
  }

  return 'cash_on_delivery';
}

function getInitialOrderStatus(paymentStatus: OrderPaymentStatus): OrderStatus {
  if (paymentStatus === 'electronic_pending') {
    return 'pending_confirmation';
  }

  return 'confirmed';
}

export function createOrder(input: CreateOrderInput): Order {
  const paymentStatus = getInitialPaymentStatus(input.payment_method);
  const orderStatus = getInitialOrderStatus(paymentStatus);

  const order: Order = {
    id: makeId('order'),
    merchant_id: input.merchant_id,
    customer_name: input.customer_name.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    items: input.items,
    payment_method: input.payment_method,
    payment_status: paymentStatus,
    status: orderStatus,
    payment_screenshot: input.payment_screenshot,
    notes: input.notes?.trim(),
    created_at: new Date().toISOString(),
  };

  const currentOrders = getOrders(input.merchant_id);
  saveOrders([order, ...currentOrders], input.merchant_id);

  return order;
}

export function createCashOnDeliveryOrder(
  input: Omit<CreateOrderInput, 'payment_method' | 'payment_screenshot'>
): Order {
  return createOrder({
    ...input,
    payment_method: 'cash_on_delivery',
  });
}

export function createSuperQiPendingOrder(
  input: Omit<CreateOrderInput, 'payment_method'>
): Order {
  return createOrder({
    ...input,
    payment_method: 'superqi',
  });
}

export function confirmElectronicPayment(params: {
  merchant_id: string;
  order_id: string;
  verified_by: string;
}): Order | null {
  const orders = getOrders(params.merchant_id);
  let updatedOrder: Order | null = null;

  const updatedOrders: Order[] = orders.map(order => {
    if (order.id !== params.order_id) return order;

    const { payment_rejection_reason, ...orderWithoutRejection } = order;

    const nextOrder: Order = {
      ...orderWithoutRejection,
      payment_status: 'paid',
      status: 'confirmed',
      payment_verified_at: new Date().toISOString(),
      payment_verified_by: params.verified_by,
    };

    updatedOrder = nextOrder;
    return nextOrder;
  });

  saveOrders(updatedOrders, params.merchant_id);
  return updatedOrder;
}

export function rejectElectronicPayment(params: {
  merchant_id: string;
  order_id: string;
  reason?: string;
}): Order | null {
  const orders = getOrders(params.merchant_id);
  let updatedOrder: Order | null = null;

  const updatedOrders: Order[] = orders.map(order => {
    if (order.id !== params.order_id) return order;

    const nextOrder: Order = {
      ...order,
      payment_status: 'failed',
      status: 'pending_confirmation',
      payment_rejection_reason: params.reason || 'Rejected by merchant',
    };

    updatedOrder = nextOrder;
    return nextOrder;
  });

  saveOrders(updatedOrders, params.merchant_id);
  return updatedOrder;
}