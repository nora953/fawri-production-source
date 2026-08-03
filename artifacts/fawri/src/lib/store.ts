import { Merchant, Product, Conversation, Order, SavedAnswer, Subscription, AdminLog } from './types';

const now = () => new Date().toISOString();

const safeParse = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const save = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const getSession = (): string | null =>
  localStorage.getItem('fawri_session');

export const setSession = (id: string) =>
  localStorage.setItem('fawri_session', id);

const ADMIN_SESSION_TOKEN_KEY = 'fawri_admin_session_token';
const ADMIN_DEVICE_ID_KEY = 'fawri_admin_device_id';

function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `device-${crypto.randomUUID()}`;
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export const getAdminDeviceId = (): string => {
  let deviceId = localStorage.getItem(ADMIN_DEVICE_ID_KEY) || '';
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(deviceId)) {
    deviceId = createDeviceId().slice(0, 128);
    localStorage.setItem(ADMIN_DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

export const getAdminDeviceLabel = (): string => {
  const userAgent = navigator.userAgent;
  const platform = /Android/i.test(userAgent)
    ? 'Android phone'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'Apple mobile device'
      : /Windows/i.test(userAgent)
        ? 'Windows computer'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'Mac computer'
          : /Linux/i.test(userAgent)
            ? 'Linux computer'
            : 'Browser device';
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Firefox\//i.test(userAgent)
      ? 'Firefox'
      : /Chrome\//i.test(userAgent)
        ? 'Chrome'
        : /Safari\//i.test(userAgent)
          ? 'Safari'
          : 'Browser';
  return `${platform} / ${browser}`;
};

export const getAdminSessionToken = (): string | null =>
  sessionStorage.getItem(ADMIN_SESSION_TOKEN_KEY);

export const setAdminSessionToken = (token: string) =>
  sessionStorage.setItem(ADMIN_SESSION_TOKEN_KEY, token);

export const clearAdminSessionToken = () =>
  sessionStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);

export const getAdminAuthHeaders = (): Record<string, string> => {
  const token = getAdminSessionToken();

  return token
    ? {
        Authorization: `Bearer ${token}`,
        'X-Fawri-Device-Id': getAdminDeviceId(),
      }
    : {};
};

export const clearSession = () => {
  const hadSession = Boolean(localStorage.getItem('fawri_session'));
  const adminToken = getAdminSessionToken();
  const adminHeaders = adminToken ? getAdminAuthHeaders() : {};

  localStorage.removeItem('fawri_session');
  clearAdminSessionToken();

  if (adminToken) {
    void fetch('/api/auth/admin/session/logout', {
      method: 'POST',
      headers: adminHeaders,
      keepalive: true,
    }).catch(() => undefined);
  } else if (hadSession) {
    void fetch('/api/auth/logout', {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  }
};

const currentMerchantId = () => getSession() || '';

const syncProductsWithBotServer = (merchantId: string, products: Product[]) => {
  if (!merchantId) return;

  fetch('/api/bot/products/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: merchantId,
      products: products.map(product => ({
        ...product,
        merchant_id: merchantId,
      })),
    }),
  }).catch(error => {
    console.error('Products sync request failed:', error);
  });
};

export const initStore = () => {
  const merchants = safeParse<Merchant[]>('fawri_merchants', []);
  const cleanedMerchants = merchants.filter(
    merchant =>
      merchant.id !== 'merchant-demo' &&
      !(merchant.is_admin === true && merchant.phone === '07800000001')
  );

  if (
    !localStorage.getItem('fawri_merchants') ||
    cleanedMerchants.length !== merchants.length
  ) {
    save('fawri_merchants', cleanedMerchants);
  }

  const subscriptions = safeParse<Subscription[]>('fawri_subscriptions', []);
  const cleanedSubscriptions = subscriptions.filter(
    subscription =>
      subscription.id !== 'sub-demo' &&
      subscription.merchant_id !== 'merchant-demo'
  );

  if (
    !localStorage.getItem('fawri_subscriptions') ||
    cleanedSubscriptions.length !== subscriptions.length
  ) {
    save('fawri_subscriptions', cleanedSubscriptions);
  }

  if (!localStorage.getItem('fawri_products')) save('fawri_products', []);
  if (!localStorage.getItem('fawri_conversations')) save('fawri_conversations', []);
  if (!localStorage.getItem('fawri_orders')) save('fawri_orders', []);
  if (!localStorage.getItem('fawri_saved_answers')) save('fawri_saved_answers', []);
  if (!localStorage.getItem('fawri_admin_logs')) save('fawri_admin_logs', []);
  if (!localStorage.getItem('fawri_admin_notes')) save('fawri_admin_notes', {});
  if (!localStorage.getItem('fawri_channel_overrides')) save('fawri_channel_overrides', {});
};

export const getMerchants = (): Merchant[] =>
  safeParse<Merchant[]>('fawri_merchants', []);

export const saveMerchants = (merchants: Merchant[]) =>
  save('fawri_merchants', merchants);

export const getCurrentMerchant = (): Merchant | undefined => {
  const id = getSession();
  if (!id) return undefined;
  return getMerchants().find(merchant => merchant.id === id);
};

export const refreshCurrentMerchantFromApi = async (): Promise<Merchant | undefined> => {
  const merchantId = getSession();
  if (!merchantId) return undefined;

  const response = await fetch('/api/auth/me');
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok || !result.merchant) {
    throw new Error(result?.error || 'Could not refresh merchant from API');
  }

  const apiMerchant = result.merchant as Merchant;
  setSession(apiMerchant.id);

  const merchants = getMerchants();
  const exists = merchants.some(merchant => merchant.id === apiMerchant.id);

  saveMerchants(
    exists
      ? merchants.map(merchant =>
          merchant.id === apiMerchant.id
            ? { ...merchant, ...apiMerchant }
            : merchant
        )
      : [...merchants, apiMerchant]
  );

  return apiMerchant;
};

export const getSubscriptions = (): Subscription[] =>
  safeParse<Subscription[]>('fawri_subscriptions', []);

export const saveSubscriptions = (subscriptions: Subscription[]) =>
  save('fawri_subscriptions', subscriptions);

export const createDemoSubscription = (merchantId: string) => {
  createSubscriptionForPlan(merchantId, 'gold');
};

export const createSubscriptionForPlan = (
  merchantId: string,
  plan: 'silver' | 'gold' | 'diamond'
) => {
  const planMap = {
    silver: { price_iqd: 25000, reply_limit: 4000, emergency_credit_amount: 400 },
    gold: { price_iqd: 49000, reply_limit: 8000, emergency_credit_amount: 800 },
    diamond: { price_iqd: 75000, reply_limit: 14000, emergency_credit_amount: 1400 },
  };

  const selectedPlan = planMap[plan];
  const newSubscription: Subscription = {
    id: `sub-${merchantId}-${Date.now()}`,
    merchant_id: merchantId,
    plan_name: plan,
    price_iqd: selectedPlan.price_iqd,
    reply_limit: selectedPlan.reply_limit,
    replies_used: 0,
    replies_remaining: selectedPlan.reply_limit,
    start_date: now(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    auto_reply_enabled: true,
    emergency_credit_amount: selectedPlan.emergency_credit_amount,
    emergency_credit_used: 0,
    emergency_credit_remaining: selectedPlan.emergency_credit_amount,
    emergency_credit_activated: false,
    pending_next_cycle_deduction: 0,
  };

  return newSubscription;
};

export const getProducts = (merchantId: string): Product[] => {
  if (!merchantId) return [];
  const allProducts = safeParse<Product[]>('fawri_products', []);
  return allProducts.filter(product => product.merchant_id === merchantId);
};

export const saveProducts = (products: Product[], merchantIdArg?: string) => {
  const merchantId = merchantIdArg || products[0]?.merchant_id || currentMerchantId();
  if (!merchantId) return;

  const cleanProducts = products.map(product => ({
    ...product,
    merchant_id: merchantId,
  }));

  const currentProducts = safeParse<Product[]>('fawri_products', []);
  const otherMerchantsProducts = currentProducts.filter(
    product => product.merchant_id !== merchantId
  );

  save('fawri_products', [...otherMerchantsProducts, ...cleanProducts]);
  syncProductsWithBotServer(merchantId, cleanProducts);
};

export const getConversations = (merchantId: string): Conversation[] => {
  if (!merchantId) return [];
  const allConversations = safeParse<Conversation[]>('fawri_conversations', []);
  return allConversations.filter(conversation => conversation.merchant_id === merchantId);
};

export const saveConversations = (
  conversations: Conversation[],
  merchantIdArg?: string
) => {
  const merchantId =
    merchantIdArg || conversations[0]?.merchant_id || currentMerchantId();

  if (!merchantId) return;

  const cleanConversations = conversations.map(conversation => ({
    ...conversation,
    merchant_id: merchantId,
  }));

  const currentConversations = safeParse<Conversation[]>('fawri_conversations', []);
  const otherMerchantsConversations = currentConversations.filter(
    conversation => conversation.merchant_id !== merchantId
  );

  save('fawri_conversations', [
    ...otherMerchantsConversations,
    ...cleanConversations,
  ]);
};

export const getOrders = (merchantId: string): Order[] => {
  if (!merchantId) return [];
  const allOrders = safeParse<Order[]>('fawri_orders', []);
  return allOrders.filter(order => order.merchant_id === merchantId);
};

export const saveOrders = (orders: Order[], merchantIdArg?: string) => {
  const merchantId = merchantIdArg || orders[0]?.merchant_id || currentMerchantId();
  if (!merchantId) return;

  const cleanOrders = orders.map(order => ({
    ...order,
    merchant_id: merchantId,
  }));

  const currentOrders = safeParse<Order[]>('fawri_orders', []);
  const otherMerchantsOrders = currentOrders.filter(
    order => order.merchant_id !== merchantId
  );

  save('fawri_orders', [...otherMerchantsOrders, ...cleanOrders]);
};

export const getSavedAnswers = (merchantId: string): SavedAnswer[] => {
  if (!merchantId) return [];
  const allAnswers = safeParse<SavedAnswer[]>('fawri_saved_answers', []);
  return allAnswers.filter(answer => answer.merchant_id === merchantId);
};

export const saveSavedAnswers = (
  answers: SavedAnswer[],
  merchantIdArg?: string
) => {
  const merchantId = merchantIdArg || answers[0]?.merchant_id || currentMerchantId();
  if (!merchantId) return;

  const cleanAnswers = answers.map(answer => ({
    ...answer,
    merchant_id: merchantId,
  }));

  const currentAnswers = safeParse<SavedAnswer[]>('fawri_saved_answers', []);
  const otherMerchantsAnswers = currentAnswers.filter(
    answer => answer.merchant_id !== merchantId
  );

  save('fawri_saved_answers', [...otherMerchantsAnswers, ...cleanAnswers]);
};

export const getAdminLogs = (): AdminLog[] =>
  safeParse<AdminLog[]>('fawri_admin_logs', []);

export const saveAdminLogs = (logs: AdminLog[]) =>
  save('fawri_admin_logs', logs);

export const addAdminLog = (entry: Omit<AdminLog, 'id' | 'created_at'>) => {
  const logs = getAdminLogs();

  const newLog: AdminLog = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: now(),
  };

  saveAdminLogs([newLog, ...logs]);
};

export const getAdminNotes = (): Record<string, string> =>
  safeParse<Record<string, string>>('fawri_admin_notes', {});

export const saveAdminNotes = (notes: Record<string, string>) =>
  save('fawri_admin_notes', notes);

export const getChannelOverrides = (): Record<string, Record<string, string>> =>
  safeParse<Record<string, Record<string, string>>>('fawri_channel_overrides', {});

export const saveChannelOverrides = (
  overrides: Record<string, Record<string, string>>
) => save('fawri_channel_overrides', overrides);
