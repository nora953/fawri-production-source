import { Router, type IRouter, type Request, type Response } from "express";
import fs from "node:fs";
import { getFawriDataDir, getFawriDataFilePath } from "../lib/dataPaths";
import healthRouter from "./health";
import botTrainingRouter from "./bot-training";
import { registerMerchantRuntimeDeletion } from "../services/merchantRuntime";
import {
  connectMetaChannel,
  readMetaChannelCredential,
} from "../services/metaChannelRuntime";
import {
  BotCatalogAuthorityError,
  readBotCatalogProducts,
  type BotCatalogProduct,
} from "../services/botCatalogAuthority";
import authRouter, {
  createMerchantOAuthState,
  getMerchantIdFromSession,
  merchantSessionAccountExists,
  requireMerchantSession,
  verifyMerchantOAuthState,
} from "./auth";
import savedAnswersRouter from "./saved-answers";
const router: IRouter = Router();
router.use(healthRouter);
router.use("/auth", authRouter);
const GRAPH_VERSION = "v22.0";
const META_REDIRECT_URI =
  process.env.META_REDIRECT_URI ||
  "https://7420821c-790f-40d9-9ded-46b56a9c6cba-00-1v3w7iufkjvhe.sisko.replit.dev/api/meta/callback";

const DB_DIR = getFawriDataDir();
const DB_PATH = getFawriDataFilePath("fawri-runtime-db.json");
const DRAFT_TTL_MINUTES = Number(process.env.BOT_DRAFT_TTL_MINUTES || 60);
const INTENT_MIN_CONFIDENCE = Number(
  process.env.BOT_INTENT_CONFIDENCE_MIN || 0.72,
);
const BOT_DEBUG =
  process.env.BOT_DEBUG === "true" || process.env.NODE_ENV !== "production";

type Product = BotCatalogProduct;

type LegacyProduct = {
  id?: string;
  merchant_id?: string;
  code?: string;
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  description?: string;
  original_price?: number;
  current_price?: number;
  quantity?: number;
  status?: string;
  allow_fawri_reply?: boolean;
  variants?: Array<{ color?: string; size?: string; quantity?: number }>;
};

type BotMessage = {
  id: string;
  external_message_id?: string;
  conversation_id: string;
  sender: "customer" | "fawri" | "merchant";
  text: string;
  created_at: string;
  counted_as_auto_reply: boolean;
  reply_type?: "ai" | "database" | "fallback";
  status?: "received" | "sent" | "failed";
};

type BotConversation = {
  id: string;
  merchant_id: string;
  platform: "messenger";
  customer_name: string;
  customer_handle: string;
  status: "auto_replying" | "needs_reply" | "manual";
  assigned_to_human: boolean;
  needs_training: boolean;
  updated_at: string;
  messages: BotMessage[];
};

type MetaPageConnection = {
  merchant_id: string;
  page_id: string;
  page_name: string;
  connected_at: string;
  platform: "messenger" | "instagram";
  webhook_subscribed?: boolean;
  webhook_subscription_error?: string;
  instagram_account_id?: string;
  instagram_username?: string;
  instagram_name?: string;
};

type BusinessContext = {
  merchantId: string;
  businessName: string;
  products: Product[];
  debug?: { pageId?: string; resolvedBy?: string; originalMerchantId?: string };
};

type Order = {
  id: string;
  merchant_id: string;
  conversation_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_area?: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: "new" | "pending_confirmation" | "confirmed" | "cancelled";
  source_channel: "messenger";
  notes?: string;
  created_at: string;
  updated_at: string;
};

type OrderDraft = {
  merchant_id: string;
  conversation_id: string;
  customer_id: string;
  awaiting: "product" | "customer_info";
  product_id?: string;
  product_name?: string;
  unit_price?: number;
  quantity?: number;
  started_at: string;
  updated_at: string;
};

type RuntimeDb = {
  productsByMerchant: Record<string, LegacyProduct[]>;
  conversationsByMerchant: Record<string, BotConversation[]>;
  metaPagesByPageId: Record<string, MetaPageConnection>;
  ordersByMerchant: Record<string, Order[]>;
  orderDraftsByConversation: Record<string, OrderDraft>;
  lastSyncedMerchantId: string | null;
};

type LanguageCode = "ar_iq" | "ku_sorani" | "en" | "unknown";

type IntentId =
  | "greeting"
  | "price_ask"
  | "availability_ask"
  | "details_product"
  | "products_compare"
  | "order_create"
  | "customer_info"
  | "info_delivery"
  | "methods_payment"
  | "order_track"
  | "order_cancel"
  | "exchange_return"
  | "complaint"
  | "customer_angry"
  | "hours_business"
  | "location"
  | "promotion"
  | "wholesale"
  | "request_job"
  | "handoff"
  | "unsupported";

type IntentResult = {
  language: LanguageCode;
  intent_id: IntentId;
  confidence: number;
  product_hint?: string;
  required_fields_missing: string[];
  should_handoff: boolean;
  cancel_active_draft?: boolean;
  source: "rules" | "ai" | "rules_ai_fallback";
  reason?: string;
};

type BotReplyResult = {
  text: string;
  replyType: "database" | "fallback" | "ai";
  needsTraining?: boolean;
  assignedToHuman?: boolean;
  debug?: {
    intent?: IntentResult;
    matchedProduct?: string;
    merchantId?: string;
    productsCount?: number;
  };
};

const quarantinedLegacyProductsByMerchant = new Map<string, LegacyProduct[]>();
const conversationsByMerchant = new Map<string, BotConversation[]>();
const metaPagesByPageId = new Map<string, MetaPageConnection>();
const ordersByMerchant = new Map<string, Order[]>();
const orderDraftsByConversation = new Map<string, OrderDraft>();
let lastSyncedMerchantId: string | null = null;

function ensureDbFile() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initialDb: RuntimeDb = {
      productsByMerchant: {},
      conversationsByMerchant: {},
      metaPagesByPageId: {},
      ordersByMerchant: {},
      orderDraftsByConversation: {},
      lastSyncedMerchantId: null,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), "utf8");
  }
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeQuarantinedLegacyProducts(products: LegacyProduct[]) {
  return products
    .filter((p) => p && p.name)
    .filter((p) => p.allow_fawri_reply !== false)
    .map((p) => ({
      id: p.id || makeId("product"),
      merchant_id: p.merchant_id,
      code: p.code,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      category: p.category,
      description: p.description,
      original_price: Number(p.original_price || 0),
      current_price: Number(p.current_price || 0),
      quantity: Number(p.quantity || 0),
      status: p.status || "available",
      allow_fawri_reply: p.allow_fawri_reply !== false,
      variants: Array.isArray(p.variants) ? p.variants : [],
    }));
}

const META_PAGE_METADATA_KEYS = new Set([
  "merchant_id",
  "page_id",
  "page_name",
  "connected_at",
  "platform",
  "webhook_subscribed",
  "webhook_subscription_error",
  "instagram_account_id",
  "instagram_username",
  "instagram_name",
]);

function normalizeMetaPageConnection(
  pageId: string,
  value: unknown,
): MetaPageConnection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const merchantId = String(record.merchant_id || "").trim();
  const normalizedPageId = String(record.page_id || pageId).trim();
  if (!merchantId || !normalizedPageId) return null;
  const normalized: MetaPageConnection = {
    merchant_id: merchantId,
    page_id: normalizedPageId,
    page_name: String(record.page_name || "Facebook Page"),
    connected_at: String(record.connected_at || ""),
    platform: record.platform === "instagram" ? "instagram" : "messenger",
  };
  if (typeof record.webhook_subscribed === "boolean") {
    normalized.webhook_subscribed = record.webhook_subscribed;
  }
  if (typeof record.webhook_subscription_error === "string") {
    normalized.webhook_subscription_error = record.webhook_subscription_error;
  }
  if (typeof record.instagram_account_id === "string") {
    normalized.instagram_account_id = record.instagram_account_id;
  }
  if (typeof record.instagram_username === "string") {
    normalized.instagram_username = record.instagram_username;
  }
  if (typeof record.instagram_name === "string") {
    normalized.instagram_name = record.instagram_name;
  }
  return normalized;
}

function loadRuntimeDb() {
  try {
    ensureDbFile();
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const db = JSON.parse(raw) as Partial<RuntimeDb>;

    quarantinedLegacyProductsByMerchant.clear();
    conversationsByMerchant.clear();
    metaPagesByPageId.clear();
    ordersByMerchant.clear();
    orderDraftsByConversation.clear();

    for (const [merchantId, products] of Object.entries(
      db.productsByMerchant || {},
    )) {
      quarantinedLegacyProductsByMerchant.set(
        merchantId,
        normalizeQuarantinedLegacyProducts(products || []),
      );
    }
    for (const [merchantId, conversations] of Object.entries(
      db.conversationsByMerchant || {},
    )) {
      conversationsByMerchant.set(merchantId, conversations);
    }
    let rewriteMetaPageMetadata = false;
    for (const [pageId, rawConnection] of Object.entries(
      db.metaPagesByPageId || {},
    )) {
      const connection = normalizeMetaPageConnection(pageId, rawConnection);
      if (!connection) {
        rewriteMetaPageMetadata = true;
        continue;
      }
      const rawKeys =
        rawConnection && typeof rawConnection === "object" && !Array.isArray(rawConnection)
          ? Object.keys(rawConnection as Record<string, unknown>)
          : [];
      if (rawKeys.some((key) => !META_PAGE_METADATA_KEYS.has(key))) {
        rewriteMetaPageMetadata = true;
      }
      metaPagesByPageId.set(pageId, connection);
    }
    for (const [merchantId, orders] of Object.entries(
      db.ordersByMerchant || {},
    )) {
      ordersByMerchant.set(merchantId, orders);
    }
    for (const [conversationId, draft] of Object.entries(
      db.orderDraftsByConversation || {},
    )) {
      orderDraftsByConversation.set(conversationId, draft);
    }
    lastSyncedMerchantId = db.lastSyncedMerchantId || null;
    if (rewriteMetaPageMetadata) saveRuntimeDb();
  } catch (error) {
    console.error("Failed to load runtime DB:", error);
  }
}

function saveRuntimeDb() {
  try {
    ensureDbFile();
    const db: RuntimeDb = {
      productsByMerchant: Object.fromEntries(
        quarantinedLegacyProductsByMerchant.entries(),
      ),
      conversationsByMerchant: Object.fromEntries(
        conversationsByMerchant.entries(),
      ),
      metaPagesByPageId: Object.fromEntries(metaPagesByPageId.entries()),
      ordersByMerchant: Object.fromEntries(ordersByMerchant.entries()),
      orderDraftsByConversation: Object.fromEntries(
        orderDraftsByConversation.entries(),
      ),
      lastSyncedMerchantId,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save runtime DB:", error);
  }
}

registerMerchantRuntimeDeletion((merchantId) => {
  const products =
    quarantinedLegacyProductsByMerchant.get(merchantId)?.length || 0;
  const conversations =
    conversationsByMerchant.get(merchantId)?.length || 0;
  const orders = ordersByMerchant.get(merchantId)?.length || 0;

  const draftEntries = Array.from(orderDraftsByConversation.entries()).filter(
    ([, draft]) => draft.merchant_id === merchantId,
  );

  const metaPageEntries = Array.from(metaPagesByPageId.entries()).filter(
    ([, connection]) => connection.merchant_id === merchantId,
  );

  quarantinedLegacyProductsByMerchant.delete(merchantId);
  conversationsByMerchant.delete(merchantId);
  ordersByMerchant.delete(merchantId);

  for (const [conversationId] of draftEntries) {
    orderDraftsByConversation.delete(conversationId);
  }

  for (const [pageId] of metaPageEntries) {
    metaPagesByPageId.delete(pageId);
  }

  if (lastSyncedMerchantId === merchantId) {
    lastSyncedMerchantId = null;
  }

  saveRuntimeDb();

  return {
    products,
    conversations,
    orders,
    orderDrafts: draftEntries.length,
    metaPages: metaPageEntries.length,
  };
});


loadRuntimeDb();

function getQueryString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "");
  if (typeof value === "string") return value;
  return "";
}

function getParamString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "");
  if (typeof value === "string") return value;
  return "";
}

function rejectCrossMerchantPath(
  req: Request,
  res: Response,
  merchantId: string,
): boolean {
  const requestedMerchantId = getParamString(req.params.merchantId).trim();

  if (requestedMerchantId && requestedMerchantId !== merchantId) {
    res.status(403).json({
      ok: false,
      error: "merchant access is forbidden",
      code: "MERCHANT_ACCESS_FORBIDDEN",
    });
    return true;
  }

  return false;
}

function readBotProductsForHttp(
  res: Response,
  merchantId: string,
): Product[] | null {
  try {
    return readBotCatalogProducts(merchantId);
  } catch (error) {
    const authorityError =
      error instanceof BotCatalogAuthorityError
        ? error
        : new BotCatalogAuthorityError(error);
    res.setHeader("Cache-Control", "no-store");
    res.status(authorityError.status).json({
      ok: false,
      code: authorityError.code,
      error: authorityError.message,
    });
    return null;
  }
}

function sendLegacyProductAuthorityDisabled(
  res: Response,
  merchantId: string,
) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(410).json({
    ok: false,
    merchant_id: merchantId,
    code: "LEGACY_PRODUCT_AUTHORITY_DISABLED",
    error: "legacy product writes are disabled; use the server catalog API",
  });
}

function resolveMerchantIdForWebhookPage(pageId: string) {
  const connection = metaPagesByPageId.get(pageId);
  if (connection?.merchant_id) return connection.merchant_id;

  // عزل صارم للبيانات:
  // إذا الصفحة غير مربوطة بتاجر، لا نستخدم آخر تاجر تمت مزامنته ولا merchant-demo.
  // في التطوير يمكن تحديد تاجر اختباري صريح عبر DEFAULT_MERCHANT_ID فقط.
  if (process.env.DEFAULT_MERCHANT_ID) return process.env.DEFAULT_MERCHANT_ID;

  return "";
}

async function getBusinessContextForPage(
  pageId: string,
): Promise<BusinessContext | null> {
  const merchantId = resolveMerchantIdForWebhookPage(pageId);
  if (!merchantId) return null;

  // عزل بيانات العملاء: كل صفحة Meta تقرأ server catalog للتاجر المرتبط بها فقط.
  // لا يوجد fallback إلى legacy JSON أو آخر تاجر ولا بحث داخل تجار آخرين.
  const products = readBotCatalogProducts(merchantId);
  const resolvedBy = metaPagesByPageId.has(pageId)
    ? "meta_page_mapping"
    : "fallback_merchant";

  return {
    merchantId,
    businessName: process.env.BUSINESS_NAME || "متجر العميل",
    products,
    debug: { pageId, resolvedBy, originalMerchantId: merchantId },
  };
}

function safeErrorCode(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code || "").trim();
    if (code) return code;
  }
  return fallback;
}

async function getPageAccessTokenForPage(
  pageId: string,
): Promise<string | null> {
  const connection = metaPagesByPageId.get(pageId);
  if (!connection) {
    console.error("Meta credential lookup failed:", {
      pageId,
      code: "META_PAGE_NOT_CONNECTED",
    });
    return null;
  }
  try {
    return readMetaChannelCredential({
      merchantId: connection.merchant_id,
      platform: connection.platform,
      pageId: connection.page_id,
    });
  } catch (error) {
    console.error("Meta credential lookup failed:", {
      pageId,
      code: safeErrorCode(error, "META_CHANNEL_CREDENTIAL_UNAVAILABLE"),
    });
    return null;
  }
}

async function sendMessengerText(
  recipientId: string,
  text: string,
  pageAccessToken: string,
) {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Meta Messenger send failed:", {
      status: response.status,
      code: String((result as any)?.error?.code || "") || undefined,
    });
    throw Object.assign(new Error("Failed to send Messenger message"), {
      code: "META_SEND_FAILED",
    });
  }
  return result;
}

function saveMessengerConversation(params: {
  merchantId: string;
  customerId: string;
  userText: string;
  botReply: string;
  externalMessageId?: string;
  replyStatus: "sent" | "failed";
  replyType?: "ai" | "database" | "fallback";
  needsTraining?: boolean;
  assignedToHuman?: boolean;
}) {
  const current = conversationsByMerchant.get(params.merchantId) || [];
  const conversationId = `messenger-${params.customerId}`;
  const now = new Date().toISOString();
  const existing = current.find((c) => c.id === conversationId);

  const alreadySaved =
    !!params.externalMessageId &&
    !!existing?.messages.some(
      (m) => m.external_message_id === params.externalMessageId,
    );
  if (alreadySaved) return existing;

  const customerMessage: BotMessage = {
    id: makeId("msg-customer"),
    external_message_id: params.externalMessageId,
    conversation_id: conversationId,
    sender: "customer",
    text: params.userText,
    created_at: now,
    counted_as_auto_reply: false,
    status: "received",
  };

  const botMessage: BotMessage = {
    id: makeId("msg-fawri"),
    conversation_id: conversationId,
    sender: "fawri",
    text: params.botReply,
    created_at: now,
    counted_as_auto_reply: params.replyStatus === "sent",
    reply_type: params.replyType || "database",
    status: params.replyStatus,
  };

  const conversationStatus: BotConversation["status"] = params.assignedToHuman
    ? "needs_reply"
    : "auto_replying";

  let updated: BotConversation[];
  if (existing) {
    updated = current.map((c) =>
      c.id === conversationId
        ? {
            ...c,
            status: conversationStatus,
            assigned_to_human: !!params.assignedToHuman,
            needs_training: !!params.needsTraining,
            updated_at: now,
            messages: [...c.messages, customerMessage, botMessage],
          }
        : c,
    );
  } else {
    updated = [
      {
        id: conversationId,
        merchant_id: params.merchantId,
        platform: "messenger",
        customer_name: "Messenger Customer",
        customer_handle: params.customerId,
        status: conversationStatus,
        assigned_to_human: !!params.assignedToHuman,
        needs_training: !!params.needsTraining,
        updated_at: now,
        messages: [customerMessage, botMessage],
      },
      ...current,
    ];
  }

  conversationsByMerchant.set(params.merchantId, updated);
  saveRuntimeDb();
  return updated.find((c) => c.id === conversationId);
}

/* ─────────────────────────────────────────────────────────────
   Fowri Intent Engine
   الموسوعة أولاً، قاعدة البيانات أولاً، OpenAI للتصنيف فقط عند ضعف الثقة.
───────────────────────────────────────────────────────────── */

function normalizeDigits(value: string) {
  const map: Record<string, string> = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
  };
  return String(value || "").replace(/[٠-٩۰-۹]/g, (d) => map[d] || d);
}

function normalizeArabicText(value: string) {
  return normalizeDigits(String(value || ""))
    .toLowerCase()
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[كکگ]/g, "ك")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/[؟?،,;:!]/g, " ")
    .replace(/[^\p{L}\p{N}\s#+._-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, keywords: string[]) {
  const normalizedText = normalizeArabicText(text);
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeArabicText(keyword);
    return !!normalizedKeyword && normalizedText.includes(normalizedKeyword);
  });
}

const INTENT_KEYWORDS: Record<IntentId, string[]> = {
  greeting: [
    "مرحبا",
    "هلا",
    "هلو",
    "السلام عليكم",
    "سلام عليكم",
    "سلام",
    "صباح الخير",
    "مساء الخير",
    "اهلا",
    "أهلا",
    "ساڵو",
    "سلاو",
    "hello",
    "hi",
    "hey",
  ],
  price_ask: [
    "بيش",
    "بكم",
    "شكد",
    "شگد",
    "كم السعر",
    "السعر",
    "سعر",
    "سعره",
    "سعرها",
    "اعرف سعر",
    "اريد اعرف سعر",
    "اريد معرفة سعر",
    "اريد معرفه سعر",
    "معرفة سعر",
    "معرفه سعر",
    "شنو السعر",
    "كم سعره",
    "كم سعر",
    "نرخ",
    "نرخی",
    "چەند",
    "price",
    "how much",
  ],
  availability_ask: [
    "متوفر",
    "موجود",
    "باقي",
    "عدكم منه",
    "اكو منه",
    "اكو",
    "متاح",
    "خلص",
    "نافذ",
    "بەردەستە",
    "available",
    "in stock",
    "stock",
  ],
  details_product: [
    "مواصفات",
    "تفاصيل",
    "شنو مواصفاته",
    "الحجم",
    "اللون",
    "قياس",
    "details",
    "size",
    "color",
  ],
  products_compare: [
    "الفرق",
    "فرق",
    "شنو الفرق",
    "قارن",
    "مقارنه",
    "مقارنة",
    "compare",
    "difference",
  ],
  order_create: [
    "اريد اطلب",
    "اريد اشتري",
    "اريد احجز",
    "ثبتلي",
    "احجزلي",
    "اريد هذا",
    "اطلب",
    "طلب",
    "اشتري",
    "حجز",
    "order",
    "buy",
  ],
  customer_info: [],
  info_delivery: [
    "توصيل",
    "توصلون",
    "كم يوم",
    "كم التوصيل",
    "للبيت",
    "للمحافظه",
    "لبغداد",
    "للاربيل",
    "delivery",
    "shipping",
    "گەیاندن",
  ],
  methods_payment: [
    "دفع",
    "كاش",
    "بطاقه",
    "بطاقة",
    "زين كاش",
    "ماستر",
    "فيزا",
    "عند الاستلام",
    "payment",
    "cash",
    "card",
  ],
  order_track: [
    "وين طلبي",
    "طلبي وين",
    "ما وصل",
    "تاخر الطلب",
    "تأخر الطلب",
    "رقم الطلب",
    "تتبع",
    "وصل طلبي",
    "track",
    "order status",
  ],
  order_cancel: [
    "الغاء",
    "الغي",
    "الغيه",
    "إلغاء",
    "اوقف الطلب",
    "لا اريد الطلب",
    "ما اريد الطلب",
    "cancel order",
  ],
  exchange_return: [
    "ارجع",
    "استرجاع",
    "تبديل",
    "ابدله",
    "ارجعه",
    "قياس غلط",
    "refund",
    "return",
    "exchange",
  ],
  complaint: [
    "مشكله",
    "مشكلة",
    "خربان",
    "غلط",
    "ما وصل",
    "تأخر",
    "تاخر",
    "منتج تالف",
    "service bad",
    "complaint",
    "bad",
  ],
  customer_angry: [
    "خدمه سيئه",
    "خدمة سيئة",
    "سيء",
    "اشتك",
    "اشتكي",
    "تعبتوني",
    "راح انشر",
    "نصب",
    "حراميه",
    "bad service",
    "angry",
  ],
  hours_business: [
    "دوام",
    "متى تفتحون",
    "اوقات العمل",
    "أوقات العمل",
    "working hours",
    "hours",
  ],
  location: [
    "مكانكم",
    "وين مكانكم",
    "عنوانكم",
    "فرع",
    "موقع",
    "location",
    "address",
  ],
  promotion: [
    "عرض",
    "عروض",
    "تخفيض",
    "خصم",
    "اكو عرض",
    "discount",
    "promotion",
  ],
  wholesale: ["جمله", "جملة", "كمية", "كميه", "wholesale", "bulk"],
  request_job: [
    "اشتغل وياكم",
    "وظيفه",
    "وظيفة",
    "توظيف",
    "job",
    "work with you",
  ],
  handoff: [
    "موظف",
    "شخص",
    "ادمن",
    "دعم",
    "مسؤول",
    "احد يرد",
    "human",
    "agent",
    "support",
  ],
  unsupported: [],
};

const STOP_WORDS = new Set([
  "بيش",
  "بكم",
  "شكد",
  "شگد",
  "كم",
  "السعر",
  "سعر",
  "سعره",
  "سعرها",
  "متوفر",
  "موجود",
  "باقي",
  "عدكم",
  "منه",
  "اكو",
  "متاح",
  "اريد",
  "اطلب",
  "اشتري",
  "ثبتلي",
  "احجزلي",
  "هذا",
  "هاي",
  "هاذا",
  "شنو",
  "هو",
  "هي",
  "من",
  "عن",
  "على",
  "الي",
  "اللي",
  "لو",
  "او",
  "و",
  "توصيل",
  "توصلون",
  "دفع",
  "كاش",
  "طلب",
  "حجز",
  "مرحبا",
  "هلو",
  "سلام",
  "عليكم",
  "اعرف",
  "معرفه",
  "معرفة",
  "بس",
  "فقط",
  "لا",
  "ما",
  "مو",
  "ليس",
  "price",
  "how",
  "much",
  "available",
  "order",
  "delivery",
  "the",
  "is",
  "a",
  "an",
]);

function getSearchTokens(value: string) {
  return normalizeArabicText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function getProductSearchText(product: Product) {
  return normalizeArabicText(
    [
      product.name,
      product.code,
      product.sku,
      product.barcode,
      product.category,
      product.description,
      ...product.catalog_search_terms,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function findMatchedProduct(text: string, products: Product[]) {
  const normalizedText = normalizeArabicText(text);
  if (!normalizedText || products.length === 0) return undefined;

  const directMatch = products.find((product) => {
    const name = normalizeArabicText(product.name || "");
    const code = normalizeArabicText(product.code || "");
    const sku = normalizeArabicText(product.sku || "");
    const barcode = normalizeArabicText(product.barcode || "");
    const catalogTerms = product.catalog_search_terms.map(normalizeArabicText);
    return (
      (!!name && normalizedText.includes(name)) ||
      (!!code && normalizedText.includes(code)) ||
      (!!sku && normalizedText.includes(sku)) ||
      (!!barcode && normalizedText.includes(barcode)) ||
      catalogTerms.some((term) => !!term && normalizedText.includes(term))
    );
  });
  if (directMatch) return directMatch;

  const userTokens = getSearchTokens(normalizedText);
  if (userTokens.length === 0) return undefined;

  const scored = products
    .map((product) => {
      const productText = getProductSearchText(product);
      const productTokens = getSearchTokens(productText);
      let score = 0;
      for (const token of userTokens) {
        if (productText.includes(token)) score += 2;
        else if (
          productTokens.some(
            (productToken) =>
              productToken.includes(token) || token.includes(productToken),
          )
        )
          score += 1;
      }
      if (userTokens.every((token) => productText.includes(token)))
        score += userTokens.length;
      return { product, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return undefined;
  if (scored[0].score >= 3) return scored[0].product;
  if (
    userTokens.length === 1 &&
    (!scored[1] || scored[0].score > scored[1].score)
  )
    return scored[0].product;
  return undefined;
}

function scoreProductMatch(text: string, product: Product) {
  const normalizedText = normalizeArabicText(text);
  const productText = getProductSearchText(product);
  const userTokens = getSearchTokens(normalizedText);
  const productName = normalizeArabicText(product.name || "");

  if (!normalizedText || !productText || userTokens.length === 0) return 0;

  let score = 0;

  if (productName && normalizedText.includes(productName)) score += 100;
  if (
    productName &&
    productName.includes(normalizedText) &&
    normalizedText.length >= 3
  )
    score += 35;

  for (const token of userTokens) {
    if (productText.includes(token)) score += 8;
    else if (token.length >= 3 && productText.includes(token.slice(0, -1)))
      score += 3;
  }

  const productTokens = getSearchTokens(productText);
  const matchedImportantTokens = userTokens.filter((token) =>
    productTokens.some(
      (productToken) =>
        productToken === token ||
        productToken.includes(token) ||
        token.includes(productToken),
    ),
  );

  if (userTokens.length >= 2 && matchedImportantTokens.length >= 2) score += 25;
  if (matchedImportantTokens.length === userTokens.length) score += 10;

  const code = normalizeArabicText(product.code || "");
  const sku = normalizeArabicText(product.sku || "");
  const barcode = normalizeArabicText(product.barcode || "");
  const catalogTerms = product.catalog_search_terms.map(normalizeArabicText);
  if (code && normalizedText.includes(code)) score += 60;
  if (sku && normalizedText.includes(sku)) score += 60;
  if (barcode && normalizedText.includes(barcode)) score += 60;
  if (catalogTerms.some((term) => !!term && normalizedText.includes(term)))
    score += 60;

  return score;
}

function findBestProductMatch(text: string, products: Product[]) {
  const scored = products
    .map((product) => ({ product, score: scoreProductMatch(text, product) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return undefined;

  const best = scored[0];
  const second = scored[1];

  // نحتاج ثقة واضحة حتى لا نخلط منتجات متشابهة.
  if (best.score >= 25 && (!second || best.score >= second.score + 8)) {
    return best;
  }

  // إذا ماكو غير منتج واحد مطابق ولو بدرجة متوسطة نسمح به.
  if (best.score >= 16 && !second) {
    return best;
  }

  return undefined;
}

function findProductFromTextOrHint(
  userText: string,
  productHint: string | undefined,
  products: Product[],
) {
  const byUserText =
    findBestProductMatch(userText, products)?.product ||
    findMatchedProduct(userText, products);
  if (byUserText) return byUserText;
  return productHint
    ? findBestProductMatch(productHint, products)?.product ||
        findMatchedProduct(productHint, products)
    : undefined;
}

function resolveBusinessContextForMessage(
  pageId: string,
  userText: string,
  baseContext: BusinessContext,
): BusinessContext {
  const currentProducts = baseContext.products || [];
  const currentMatch = findProductFromTextOrHint(
    userText,
    undefined,
    currentProducts,
  );

  // عزل بيانات العملاء: الرسالة لا تغيّر التاجر أبداً.
  // إذا المنتج غير موجود عند هذا التاجر، نسأل عن اسم المنتج أو نحوّله للموظف، لكن لا نفتش داخل منتجات تجار آخرين.
  if (currentMatch) {
    return {
      ...baseContext,
      debug: {
        ...baseContext.debug,
        pageId,
        resolvedBy: `${baseContext.debug?.resolvedBy || "base_context"}_matched_current_merchant_products`,
      },
    };
  }

  return {
    ...baseContext,
    debug: {
      ...baseContext.debug,
      pageId,
      resolvedBy: `${baseContext.debug?.resolvedBy || "base_context"}_current_merchant_only_no_product_match`,
    },
  };
}

function getProductPrice(product: Product) {
  return Number(product.current_price || product.original_price || 0);
}

function isProductAvailable(product: Product) {
  const status = normalizeArabicText(product.status || "available");
  const quantity = Number(product.quantity || 0);
  if (
    status.includes("unavailable") ||
    status.includes("out_of_stock") ||
    status.includes("sold_out") ||
    status.includes("غير متوفر") ||
    status.includes("نفذ") ||
    status.includes("نافذ")
  )
    return false;
  return quantity > 0;
}

function extractPhone(text: string) {
  const cleaned = normalizeDigits(text).replace(/[^\d+]/g, " ");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const found = parts.find((part) => {
    const digits = part.replace(/\D/g, "");
    return (
      digits.length >= 10 &&
      digits.length <= 14 &&
      (digits.startsWith("07") ||
        digits.startsWith("9647") ||
        digits.startsWith("009647"))
    );
  });
  return found ? found.replace(/[^\d+]/g, "") : "";
}

function extractCustomerName(text: string) {
  const normalized = normalizeArabicText(text);
  const nameMatch =
    normalized.match(
      /(?:اسمي|الاسم|اني|انا)\s+([a-zA-Z\u0600-\u06FF ]{2,30})/,
    ) || normalized.match(/(?:name)\s+([a-zA-Z\u0600-\u06FF ]{2,30})/);
  if (!nameMatch?.[1]) return "زبون Messenger";
  return (
    nameMatch[1]
      .replace(/رقم|هاتف|عنوان|منطقه|محافظه/g, "")
      .trim()
      .slice(0, 40) || "زبون Messenger"
  );
}

function extractAddress(text: string) {
  const normalized = normalizeArabicText(text);
  const addressMatch =
    normalized.match(
      /(?:العنوان|عنواني|منطقه|المنطقه|اسكن|ساكن)\s+(.{3,120})/,
    ) || normalized.match(/(?:address|area)\s+(.{3,120})/);
  if (addressMatch?.[1]) return addressMatch[1].trim().slice(0, 160);
  return normalizeDigits(text)
    .replace(/\+?\d[\d\s-]{8,15}/g, "")
    .trim()
    .slice(0, 160);
}

function detectLanguage(text: string): LanguageCode {
  if (/[a-z]/i.test(text) && !/[\u0600-\u06FF]/.test(text)) return "en";
  if (
    hasAny(text, [
      "ساڵو",
      "بەردەستە",
      "نرخ",
      "نرخی",
      "گەیاندن",
      "داواکاری",
      "سوپاس",
      "تکایە",
    ])
  )
    return "ku_sorani";
  if (/[\u0600-\u06FF]/.test(text)) return "ar_iq";
  return "unknown";
}

function extractProductHint(text: string) {
  return getSearchTokens(text).join(" ").trim();
}

function hasCancelDraftMeaning(text: string) {
  return hasAny(text, [
    "لا اريد حجز",
    "ما اريد حجز",
    "مو حجز",
    "ليس حجز",
    "لا اريد طلب",
    "ما اريد طلب",
    "بس السعر",
    "اريد السعر فقط",
    "اريد اعرف السعر",
    "اريد معرفة السعر",
    "لا اريد اشتري",
    "الغاء",
    "الغي",
    "cancel",
    "stop",
  ]);
}

function classifyIntentByRules(
  userText: string,
  hasDraft: boolean,
): IntentResult {
  const text = normalizeArabicText(userText);
  const language = detectLanguage(userText);
  const productHint = extractProductHint(userText);
  const phone = extractPhone(userText);

  const hasPrice = hasAny(text, INTENT_KEYWORDS.price_ask);
  const hasAvailability = hasAny(text, INTENT_KEYWORDS.availability_ask);
  const hasOrder = hasAny(text, INTENT_KEYWORDS.order_create);
  const hasCancel =
    hasAny(text, INTENT_KEYWORDS.order_cancel) || hasCancelDraftMeaning(text);
  const hasGreeting = hasAny(text, INTENT_KEYWORDS.greeting);

  const base = (
    intent_id: IntentId,
    confidence: number,
    reason: string,
    extra: Partial<IntentResult> = {},
  ): IntentResult => ({
    language,
    intent_id,
    confidence,
    product_hint: productHint,
    required_fields_missing: [],
    should_handoff: false,
    source: "rules",
    reason,
    ...extra,
  });

  if (hasDraft && phone)
    return base("customer_info", 0.95, "existing draft and phone detected");
  if (hasAny(text, INTENT_KEYWORDS.customer_angry))
    return base("customer_angry", 0.9, "angry words", { should_handoff: true });
  if (hasAny(text, INTENT_KEYWORDS.handoff))
    return base("handoff", 0.9, "human/support requested", {
      should_handoff: true,
    });
  if (hasPrice)
    return base(
      "price_ask",
      0.92,
      hasCancel ? "price asked with cancel draft meaning" : "price keywords",
      {
        required_fields_missing: productHint ? [] : ["product_name"],
        cancel_active_draft: hasCancel,
      },
    );
  if (hasCancel)
    return base("order_cancel", 0.9, "cancel keywords", {
      cancel_active_draft: true,
    });
  if (hasAvailability)
    return base("availability_ask", 0.88, "availability keywords", {
      required_fields_missing: productHint ? [] : ["product_name"],
    });
  if (hasAny(text, INTENT_KEYWORDS.complaint))
    return base("complaint", 0.86, "complaint keywords", {
      required_fields_missing: ["order_id_or_phone", "problem_details"],
      should_handoff: true,
    });
  if (hasAny(text, INTENT_KEYWORDS.exchange_return))
    return base("exchange_return", 0.86, "return/refund keywords", {
      required_fields_missing: ["order_id", "reason"],
      should_handoff: true,
    });
  if (hasAny(text, INTENT_KEYWORDS.order_track))
    return base("order_track", 0.86, "track keywords", {
      required_fields_missing: ["order_id_or_phone"],
    });
  if (hasAny(text, INTENT_KEYWORDS.info_delivery))
    return base("info_delivery", 0.84, "delivery keywords", {
      required_fields_missing: ["area"],
    });
  if (hasAny(text, INTENT_KEYWORDS.methods_payment))
    return base("methods_payment", 0.84, "payment keywords");
  if (hasAny(text, INTENT_KEYWORDS.details_product))
    return base("details_product", 0.82, "details keywords", {
      required_fields_missing: productHint ? [] : ["product_name"],
    });
  if (hasAny(text, INTENT_KEYWORDS.products_compare))
    return base("products_compare", 0.82, "compare keywords", {
      required_fields_missing: ["product_names"],
    });
  if (hasOrder)
    return base("order_create", 0.86, "order keywords", {
      required_fields_missing: productHint
        ? ["customer_name", "phone", "address"]
        : ["product_name"],
    });

  const otherIntents: IntentId[] = [
    "hours_business",
    "location",
    "promotion",
    "wholesale",
    "request_job",
  ];
  for (const intent of otherIntents) {
    if (hasAny(text, INTENT_KEYWORDS[intent]))
      return base(intent, 0.8, `${intent} keywords`, {
        should_handoff: intent === "request_job",
      });
  }

  if (hasGreeting) return base("greeting", 0.78, "greeting keywords");
  if (productHint)
    return base(
      "price_ask",
      0.68,
      "product-like message without explicit intent",
    );
  return base("unsupported", 0.35, "no confident rule match");
}

function extractOpenAIText(data: any): string | null {
  if (typeof data?.output_text === "string" && data.output_text.trim())
    return data.output_text.trim();
  const output = data?.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim())
        return part.text.trim();
    }
  }
  return null;
}

function parseJsonObjectFromText(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function coerceIntentId(value: unknown): IntentId {
  const valid: IntentId[] = [
    "greeting",
    "price_ask",
    "availability_ask",
    "details_product",
    "products_compare",
    "order_create",
    "customer_info",
    "info_delivery",
    "methods_payment",
    "order_track",
    "order_cancel",
    "exchange_return",
    "complaint",
    "customer_angry",
    "hours_business",
    "location",
    "promotion",
    "wholesale",
    "request_job",
    "handoff",
    "unsupported",
  ];
  const text = String(value || "unsupported").trim();
  return valid.includes(text as IntentId) ? (text as IntentId) : "unsupported";
}

async function classifyIntentWithAI(
  userText: string,
  ruleIntent: IntentResult,
): Promise<IntentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model =
    process.env.OPENAI_CLASSIFIER_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini";
  if (!apiKey) return null;

  const prompt = `Classify the customer message only. Do not answer the customer.
Return ONLY valid JSON.
Allowed intent_id values: greeting, price_ask, availability_ask, details_product, products_compare, order_create, info_delivery, methods_payment, order_track, order_cancel, exchange_return, complaint, customer_angry, hours_business, location, promotion, wholesale, request_job, handoff, unsupported.
Rules:
- Use price_ask for: بيش، شكد، شگد، بكم، أريد أعرف السعر.
- If customer says they do not want booking/order but asks price, use price_ask and cancel_active_draft true.
- Do not invent product data. Just classify and extract product_hint.
Return JSON with: language, intent_id, confidence, product_hint, required_fields_missing, should_handoff, cancel_active_draft, reason.
Customer message: ${JSON.stringify(userText)}
Rule guess: ${JSON.stringify(ruleIntent)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("OpenAI classifier error:", data);
      return null;
    }
    const text = extractOpenAIText(data);
    if (!text) return null;
    const parsed = parseJsonObjectFromText(text);
    if (!parsed) return null;

    return {
      language: ["ar_iq", "ku_sorani", "en", "unknown"].includes(
        parsed.language,
      )
        ? parsed.language
        : ruleIntent.language,
      intent_id: coerceIntentId(parsed.intent_id),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0))),
      product_hint: String(
        parsed.product_hint || ruleIntent.product_hint || "",
      ).trim(),
      required_fields_missing: Array.isArray(parsed.required_fields_missing)
        ? parsed.required_fields_missing.map(String)
        : [],
      should_handoff: !!parsed.should_handoff,
      cancel_active_draft: !!parsed.cancel_active_draft,
      source: "ai",
      reason: String(parsed.reason || "ai classification"),
    };
  } catch (error) {
    console.error("OpenAI classifier request failed:", error);
    return null;
  }
}

async function resolveIntent(
  userText: string,
  hasDraft: boolean,
): Promise<IntentResult> {
  const ruleIntent = classifyIntentByRules(userText, hasDraft);
  if (ruleIntent.confidence >= INTENT_MIN_CONFIDENCE) return ruleIntent;
  const aiIntent = await classifyIntentWithAI(userText, ruleIntent);
  if (aiIntent && aiIntent.confidence >= INTENT_MIN_CONFIDENCE) return aiIntent;
  return { ...ruleIntent, source: aiIntent ? "rules_ai_fallback" : "rules" };
}

function getActiveOrderDraft(conversationId: string) {
  const draft = orderDraftsByConversation.get(conversationId);
  if (!draft) return undefined;
  const updatedAtMs = Date.parse(draft.updated_at || draft.started_at || "");
  if (
    Number.isFinite(updatedAtMs) &&
    Date.now() - updatedAtMs > DRAFT_TTL_MINUTES * 60 * 1000
  ) {
    clearOrderDraft(conversationId);
    return undefined;
  }
  return draft;
}

function getDraftProduct(draft: OrderDraft | undefined, products: Product[]) {
  if (!draft) return undefined;
  return draft.product_id
    ? products.find((product) => product.id === draft.product_id)
    : draft.product_name
      ? findMatchedProduct(draft.product_name, products)
      : undefined;
}

function formatPrice(price: number, language: LanguageCode) {
  const formatted = price.toLocaleString("en-US");
  if (language === "en") return `${formatted} IQD`;
  if (language === "ku_sorani") return `${formatted} دینار عێراقی`;
  return `${formatted} دينار عراقي`;
}

function replyText(
  language: LanguageCode,
  key: string,
  vars: Record<string, string | number> = {},
) {
  const productName = String(vars.productName || "المنتج");
  const price = String(vars.price || "");
  const orderId = String(vars.orderId || "");

  const ar: Record<string, string> = {
    greeting: "وعليكم السلام 🌟 هلا بيك، شلون نكدر نساعدك؟",
    askProductForPrice:
      "أكيد، ممكن تذكرلي اسم المنتج أو ترسل صورته حتى أعطيك السعر الصحيح؟",
    askProductForAvailability:
      "حاضر، ممكن ترسل اسم المنتج أو صورته حتى أتأكدلك من التوفر؟",
    priceAvailable: `سعر ${productName} هو ${price}. متوفر حالياً. تحب نثبت الطلب؟`,
    priceUnavailable: `سعر ${productName} هو ${price}. للأسف غير متوفر حالياً.`,
    priceUnknown: `حتى ما أعطيك معلومة غلط، سعر ${productName} غير محدد حالياً. راح أحولك للفريق المختص.`,
    available: `نعم، ${productName} متوفر حالياً. تحب نثبت الطلب؟`,
    unavailable: `للأسف ${productName} غير متوفر حالياً. أگدر أقترحلك بديل قريب إذا تحب.`,
    orderAskProduct: "أكيد 🌟 شنو المنتج اللي تحب تطلبه؟",
    orderAskInfo: `تمام 🌟 حتى نكمل طلب ${productName}، أحتاج الاسم ورقم الهاتف والمنطقة/العنوان.`,
    orderConfirm: `تم تسجيل طلبك بنجاح 🌟 رقم الطلب هو ${orderId}. راح يتم التواصل وياك للتأكيد.`,
    askPhone: "حتى نكمل الطلب، ممكن ترسل رقم الهاتف؟ مثال: 0770xxxxxxx",
    askAddress: "ممكن ترسل المنطقة أو العنوان حتى نكمل الطلب؟",
    draftCancelled: "تمام، ألغيت خطوات الطلب الحالية. شلون أگدر أساعدك؟",
    delivery:
      "التوصيل يعتمد على منطقتك. ممكن تذكرلي المنطقة حتى أعطيك التفاصيل؟",
    payment: "طرق الدفع تختلف حسب المتجر. ممكن أتأكدلك من طرق الدفع المتوفرة.",
    track: "أكيد، ممكن ترسل رقم الطلب أو رقم الهاتف حتى أتابعلك الحالة؟",
    complaint:
      "نعتذر منك جداً على الإزعاج. ممكن ترسل رقم الطلب وتوضحلي شنو صار حتى نتابعها بسرعة؟",
    angry:
      "حقك علينا، نعتذر منك. راح أحول الموضوع لموظف مختص حتى يتابع وياك بدقة.",
    handoff: "طلبك يحتاج متابعة من موظف مختص. راح أحولك حتى يساعدك أكثر.",
    details: `ممكن تحددلي شنو تحب تعرف عن ${productName}: السعر، التوفر، اللون، أو القياس؟`,
    compare: "ممكن ترسل أسماء المنتجات اللي تريد تقارن بينها؟",
    hours:
      "حالياً أوقات الدوام غير مضبوطة داخل النظام. راح أحولك للفريق حتى يعطيك الوقت الصحيح.",
    location: "ممكن تذكر المدينة أو المنطقة حتى أعطيك أقرب تفاصيل متوفرة؟",
    promotion:
      "العروض تعتمد على المنتجات المتوفرة حالياً. ممكن تذكرلي نوع المنتج اللي تبحث عنه؟",
    wholesale:
      "أكيد، ممكن تذكرلي المنتج والكمية المطلوبة حتى نتابع طلب الجملة؟",
    job: "طلبات التوظيف تحتاج متابعة من الإدارة. راح أحولك للفريق المختص.",
    unsupported: "ممكن توضحلي أكثر شنو تقصد حتى أساعدك بشكل صحيح؟",
    noProducts:
      "حتى ما أعطيك معلومة غلط، ما ظاهرة عندي منتجات هذا المتجر حالياً. راح أحولك للفريق حتى يتأكدون.",
  };

  const ku: Record<string, string> = {
    greeting: "ساڵو 🌟 بەخێربێیت، چۆن دەتوانم یارمەتیت بدەم؟",
    askProductForPrice:
      "تکایە ناوی بەرهەمەکە یان وێنەکەی بنێرە تا نرخی دروستت پێ بڵێم.",
    askProductForAvailability:
      "تکایە ناوی بەرهەمەکە یان وێنەکەی بنێرە تا دڵنیا ببمەوە بەردەستە یان نا.",
    priceAvailable: `نرخی ${productName} بریتییە لە ${price}. ئێستا بەردەستە. دەتەوێت داواکارییەکە تۆمار بکەین؟`,
    priceUnavailable: `نرخی ${productName} بریتییە لە ${price}. بەداخەوە ئێستا بەردەست نییە.`,
    priceUnknown: `ئێستا نرخی دڵنیاکراو بۆ ${productName} نییە. بۆ ئەوەی زانیاری هەڵە نەدەم دەتگوازمەوە بۆ تیمەکە.`,
    available: `بەڵێ، ${productName} ئێستا بەردەستە. دەتەوێت داواکارییەکە تۆمار بکەین؟`,
    unavailable: `بەداخەوە ${productName} ئێستا بەردەست نییە.`,
    orderAskProduct: "باشە 🌟 چ بەرهەمێک دەتەوێت داوا بکەیت؟",
    orderAskInfo: `بۆ تەواوکردنی داواکاری ${productName}، پێویستم بە ناو، ژمارەی تەلەفۆن و ناوچە/ناونیشانە.`,
    orderConfirm: `داواکارییەکەت تۆمارکرا 🌟 ژمارەی داواکاری ${orderId}. بۆ دڵنیاکردنەوە پەیوەندیت پێوە دەکەین.`,
    askPhone: "تکایە ژمارەی تەلەفۆن بنێرە تا داواکارییەکە تەواو بکەین.",
    askAddress: "تکایە ناوچە یان ناونیشانەکەت بنێرە.",
    draftCancelled:
      "باشە، هەنگاوەکانی داواکارییەکە ڕاگیران. چۆن یارمەتیت بدەم؟",
    delivery: "گەیاندن بە ناوچەکەت پەیوەستە. تکایە ناوچەکەت بنێرە.",
    payment: "ڕێگاکانی پارەدان بە پێی فرۆشگا جیاوازن. دڵنیادەبمەوە بۆت.",
    track:
      "تکایە ژمارەی داواکاری یان ژمارەی تەلەفۆن بنێرە تا بەدواداچوونی بکەم.",
    complaint:
      "زۆر داوای لێبووردن دەکەین. تکایە ژمارەی داواکاری بنێرە و بابەتەکە ڕوون بکەوە.",
    angry: "داوای لێبووردن دەکەین. بابەتەکە دەگوازمەوە بۆ کارمەندێکی تایبەت.",
    handoff:
      "داواکارییەکەت پێویستی بە کارمەندێکی تایبەتە. دەتگوازمەوە تا زیاتر یارمەتیت بدات.",
    unsupported: "دەتوانیت زیاتر ڕوونی بکەیتەوە مەبەستت چییە؟",
    noProducts:
      "بۆ ئەوەی زانیاری هەڵە نەدەم، ئێستا بەرهەمەکانم بۆ ئەم فرۆشگایە دیار نییە. دەتگوازمەوە بۆ تیمەکە.",
  };

  const en: Record<string, string> = {
    greeting: "Hello! Welcome 🌟 How can I help you today?",
    askProductForPrice:
      "Sure, please send the product name or image so I can give you the correct price.",
    askProductForAvailability:
      "Please send the product name or image and I will check availability.",
    priceAvailable: `The price of ${productName} is ${price}. It is currently available. Would you like to place the order?`,
    priceUnavailable: `The price of ${productName} is ${price}. Unfortunately, it is not available right now.`,
    priceUnknown: `I do not have a confirmed price for ${productName}. I will transfer you to the team to avoid giving wrong information.`,
    available: `Yes, ${productName} is currently available. Would you like to confirm the order?`,
    unavailable: `Unfortunately, ${productName} is not available right now. I can suggest a similar alternative if you like.`,
    orderAskProduct: "Sure 🌟 Which product would you like to order?",
    orderAskInfo: `Great. To complete the order for ${productName}, I need your name, phone number, and area/address.`,
    orderConfirm: `Your order ${orderId} has been recorded. We will contact you to confirm it.`,
    askPhone: "To complete the order, please send your phone number.",
    askAddress: "Please send your area/address to complete the order.",
    draftCancelled:
      "Done, I cancelled the current order steps. How can I help you?",
    delivery:
      "Delivery depends on your area. Please send your area so I can give you the details.",
    payment:
      "Payment methods depend on the store. I can check the available methods for you.",
    track:
      "Please send your order number or phone number so I can check the status.",
    complaint:
      "We are very sorry for the inconvenience. Please send your order number and explain what happened so we can follow up quickly.",
    angry:
      "We apologize. I will transfer this to a team member who can follow up carefully.",
    handoff:
      "Your request needs a team member. I will transfer you so they can help further.",
    unsupported:
      "Could you please explain what you mean so I can help correctly?",
    noProducts:
      "To avoid giving incorrect information, I cannot see this store's products right now. I will transfer you to the team.",
  };

  if (language === "en") return en[key] || ar[key] || ar.unsupported;
  if (language === "ku_sorani") return ku[key] || ar[key] || ar.unsupported;
  return ar[key] || ar.unsupported;
}

function createOrder(params: {
  merchantId: string;
  conversationId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}) {
  const now = new Date().toISOString();
  const currentOrders = ordersByMerchant.get(params.merchantId) || [];
  const order: Order = {
    id: makeId("order"),
    merchant_id: params.merchantId,
    conversation_id: params.conversationId,
    customer_id: params.customerId,
    customer_name: params.customerName,
    customer_phone: params.customerPhone,
    customer_address: params.customerAddress,
    product_id: params.productId,
    product_name: params.productName,
    quantity: params.quantity,
    unit_price: params.unitPrice,
    total_price: params.unitPrice * params.quantity,
    status: "new",
    source_channel: "messenger",
    notes: params.notes,
    created_at: now,
    updated_at: now,
  };
  ordersByMerchant.set(params.merchantId, [order, ...currentOrders]);
  saveRuntimeDb();
  return order;
}

function setOrderDraft(draft: OrderDraft) {
  orderDraftsByConversation.set(draft.conversation_id, {
    ...draft,
    updated_at: new Date().toISOString(),
  });
  saveRuntimeDb();
}

function clearOrderDraft(conversationId: string) {
  orderDraftsByConversation.delete(conversationId);
  saveRuntimeDb();
}

function productReply(
  product: Product,
  intent: "price" | "availability" | "order",
  language: LanguageCode,
  context: BusinessContext,
  conversationId: string,
  customerId: string,
): BotReplyResult {
  const price = getProductPrice(product);
  const available = isProductAvailable(product);

  if (intent === "order") {
    if (!available)
      return {
        text: replyText(language, "unavailable", { productName: product.name }),
        replyType: "database",
      };

    setOrderDraft({
      merchant_id: context.merchantId,
      conversation_id: conversationId,
      customer_id: customerId,
      awaiting: "customer_info",
      product_id: product.id,
      product_name: product.name,
      unit_price: price,
      quantity: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return {
      text: replyText(language, "orderAskInfo", { productName: product.name }),
      replyType: "database",
    };
  }

  if (intent === "availability") {
    return {
      text: replyText(language, available ? "available" : "unavailable", {
        productName: product.name,
      }),
      replyType: "database",
    };
  }

  if (!price) {
    return {
      text: replyText(language, "priceUnknown", { productName: product.name }),
      replyType: "database",
      assignedToHuman: true,
    };
  }

  return {
    text: replyText(
      language,
      available ? "priceAvailable" : "priceUnavailable",
      { productName: product.name, price: formatPrice(price, language) },
    ),
    replyType: "database",
  };
}

async function generateTrainedBotReply(params: {
  userText: string;
  context: BusinessContext;
  customerId: string;
}): Promise<BotReplyResult> {
  const { userText, context, customerId } = params;
  const conversationId = `messenger-${customerId}`;
  const products = context.products;
  const existingDraft = getActiveOrderDraft(conversationId);
  const intent = await resolveIntent(userText, !!existingDraft);
  const language = intent.language === "unknown" ? "ar_iq" : intent.language;
  const matchedProduct = findProductFromTextOrHint(
    userText,
    intent.product_hint,
    products,
  );
  const draftProduct = getDraftProduct(existingDraft, products);
  const relatedProduct = matchedProduct || draftProduct;

  const withDebug = (reply: BotReplyResult): BotReplyResult => ({
    ...reply,
    debug: {
      intent,
      matchedProduct: relatedProduct?.name,
      merchantId: context.merchantId,
      productsCount: products.length,
    },
  });

  if (
    [
      "price_ask",
      "availability_ask",
      "details_product",
      "order_create",
    ].includes(intent.intent_id) &&
    products.length === 0
  ) {
    return withDebug({
      text: replyText(language, "noProducts"),
      replyType: "database",
      assignedToHuman: true,
      needsTraining: true,
    });
  }

  // هذه هي أهم حماية: الطلب القديم لا يسيطر على المحادثة.
  if (
    existingDraft &&
    (intent.cancel_active_draft ||
      [
        "price_ask",
        "availability_ask",
        "order_cancel",
        "complaint",
        "customer_angry",
        "handoff",
      ].includes(intent.intent_id))
  ) {
    clearOrderDraft(conversationId);
  }

  switch (intent.intent_id) {
    case "greeting":
      return withDebug({
        text: replyText(language, "greeting"),
        replyType: "database",
      });

    case "price_ask":
      if (!relatedProduct)
        return withDebug({
          text: replyText(language, "askProductForPrice"),
          replyType: "database",
          needsTraining: true,
        });
      return withDebug(
        productReply(
          relatedProduct,
          "price",
          language,
          context,
          conversationId,
          customerId,
        ),
      );

    case "availability_ask":
      if (!relatedProduct)
        return withDebug({
          text: replyText(language, "askProductForAvailability"),
          replyType: "database",
          needsTraining: true,
        });
      return withDebug(
        productReply(
          relatedProduct,
          "availability",
          language,
          context,
          conversationId,
          customerId,
        ),
      );

    case "details_product": {
      if (!relatedProduct)
        return withDebug({
          text: replyText(language, "askProductForPrice"),
          replyType: "database",
        });
      const details = [relatedProduct.description, relatedProduct.category]
        .filter(Boolean)
        .join(" - ");
      return withDebug({
        text: details
          ? `${relatedProduct.name}: ${details}. تحب تعرف السعر أو التوفر؟`
          : replyText(language, "details", {
              productName: relatedProduct.name,
            }),
        replyType: "database",
      });
    }

    case "order_create":
      if (!relatedProduct) {
        setOrderDraft({
          merchant_id: context.merchantId,
          conversation_id: conversationId,
          customer_id: customerId,
          awaiting: "product",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        return withDebug({
          text: replyText(language, "orderAskProduct"),
          replyType: "database",
        });
      }
      return withDebug(
        productReply(
          relatedProduct,
          "order",
          language,
          context,
          conversationId,
          customerId,
        ),
      );

    case "customer_info": {
      if (!existingDraft || existingDraft.awaiting !== "customer_info") {
        return withDebug({
          text: replyText(language, "unsupported"),
          replyType: "fallback",
          needsTraining: true,
        });
      }
      const phone = extractPhone(userText);
      const customerName = extractCustomerName(userText);
      const address = extractAddress(userText);
      if (!phone)
        return withDebug({
          text: replyText(language, "askPhone"),
          replyType: "database",
        });
      if (!address || address.length < 3)
        return withDebug({
          text: replyText(language, "askAddress"),
          replyType: "database",
        });

      const order = createOrder({
        merchantId: context.merchantId,
        conversationId,
        customerId,
        customerName,
        customerPhone: phone,
        customerAddress: address,
        productId: existingDraft.product_id,
        productName: existingDraft.product_name || "منتج غير محدد",
        quantity: existingDraft.quantity || 1,
        unitPrice: existingDraft.unit_price || 0,
        notes: userText,
      });
      clearOrderDraft(conversationId);
      return withDebug({
        text: replyText(language, "orderConfirm", { orderId: order.id }),
        replyType: "database",
      });
    }

    case "order_cancel":
      if (existingDraft) clearOrderDraft(conversationId);
      return withDebug({
        text: replyText(language, "draftCancelled"),
        replyType: "database",
      });

    case "info_delivery":
      return withDebug({
        text: replyText(language, "delivery"),
        replyType: "database",
      });
    case "methods_payment":
      return withDebug({
        text: replyText(language, "payment"),
        replyType: "database",
      });
    case "order_track":
      return withDebug({
        text: replyText(language, "track"),
        replyType: "database",
      });
    case "complaint":
      return withDebug({
        text: replyText(language, "complaint"),
        replyType: "database",
        assignedToHuman: true,
      });
    case "customer_angry":
      return withDebug({
        text: replyText(language, "angry"),
        replyType: "database",
        assignedToHuman: true,
      });
    case "handoff":
    case "exchange_return":
      return withDebug({
        text: replyText(language, "handoff"),
        replyType: "database",
        assignedToHuman: true,
      });
    case "products_compare":
      return withDebug({
        text: replyText(language, "compare"),
        replyType: "database",
      });
    case "hours_business":
      return withDebug({
        text: replyText(language, "hours"),
        replyType: "database",
        assignedToHuman: true,
      });
    case "location":
      return withDebug({
        text: replyText(language, "location"),
        replyType: "database",
      });
    case "promotion":
      return withDebug({
        text: replyText(language, "promotion"),
        replyType: "database",
      });
    case "wholesale":
      return withDebug({
        text: replyText(language, "wholesale"),
        replyType: "database",
      });
    case "request_job":
      return withDebug({
        text: replyText(language, "job"),
        replyType: "database",
        assignedToHuman: true,
      });
    default:
      return withDebug({
        text: replyText(language, "unsupported"),
        replyType: "fallback",
        needsTraining: true,
      });
  }
}

function getConversationsForMerchant(merchantId?: string) {
  if (!merchantId) return [];
  return conversationsByMerchant.get(merchantId) || [];
}

function getOrdersForMerchant(merchantId?: string) {
  if (!merchantId) return [];
  return ordersByMerchant.get(merchantId) || [];
}

router.post(
  "/bot/products/sync",
  requireMerchantSession,
  (_req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    return sendLegacyProductAuthorityDisabled(res, merchantId);
  },
);

router.get(
  "/bot/products/:merchantId",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    if (rejectCrossMerchantPath(req, res, merchantId)) return;
    const products = readBotProductsForHttp(res, merchantId);
    if (!products) return;
    return res.json({
      ok: true,
      authority: "server_catalog",
      merchant_id: merchantId,
      count: products.length,
      products,
    });
  },
);

router.get("/bot/debug", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const testText = getQueryString(req.query.text);
  const products = readBotProductsForHttp(res, merchantId);
  if (!products) return;
  const testMatch = testText
    ? findBestProductMatch(testText, products)
    : undefined;

  // Debug آمن: يعرض معلومات التاجر المطلوب فقط ولا يكشف منتجات التجار الآخرين.
  return res.json({
    ok: true,
    db_path: DB_PATH,
    product_authority: "server_catalog",
    merchant_id: merchantId,
    products_count: products.length,
    product_names: products.map((p) => p.name),
    test_text: testText || undefined,
    test_match: testMatch
      ? { product: testMatch.product.name, score: testMatch.score }
      : undefined,
    drafts_count: Array.from(orderDraftsByConversation.values()).filter(
      (draft) => draft.merchant_id === merchantId,
    ).length,
    drafts_for_merchant: Object.fromEntries(
      Array.from(orderDraftsByConversation.entries()).filter(
        ([, draft]) => draft.merchant_id === merchantId,
      ),
    ),
    meta_pages_for_merchant: Array.from(metaPagesByPageId.values())
      .filter((p) => p.merchant_id === merchantId)
      .map((p) => ({
        page_id: p.page_id,
        page_name: p.page_name,
        merchant_id: p.merchant_id,
        connected_at: p.connected_at,
      })),
  });
});

router.get("/bot/conversations/:merchantId", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  if (rejectCrossMerchantPath(req, res, merchantId)) return;
  const conversations = conversationsByMerchant.get(merchantId) || [];
  return res.json({
    ok: true,
    merchant_id: merchantId,
    count: conversations.length,
    conversations,
  });
});

router.get("/bot/orders/:merchantId", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  if (rejectCrossMerchantPath(req, res, merchantId)) return;
  const orders = ordersByMerchant.get(merchantId) || [];
  return res.json({
    ok: true,
    merchant_id: merchantId,
    count: orders.length,
    orders,
  });
});

router.get("/meta/pages", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const pages = Array.from(metaPagesByPageId.values())
    .filter((page) => page.merchant_id === merchantId)
    .map((page) => ({
      page_id: page.page_id,
      page_name: page.page_name,
      platform: page.platform,
      connected_at: page.connected_at,
    }));
  return res.json({ ok: true, merchant_id: merchantId, pages });
});

router.get("/conversations", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const conversations = getConversationsForMerchant(merchantId);
  return res.json({
    ok: true,
    merchant_id: merchantId,
    count: conversations.length,
    conversations,
  });
});

router.get("/conversations/:merchantId", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  if (rejectCrossMerchantPath(req, res, merchantId)) return;
  const conversations = getConversationsForMerchant(merchantId);
  return res.json({
    ok: true,
    merchant_id: merchantId,
    count: conversations.length,
    conversations,
  });
});

router.get("/conversation/:conversationId", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const conversationId = getParamString(req.params.conversationId);
  const conversation = getConversationsForMerchant(merchantId).find(
    (c) => c.id === conversationId,
  );
  if (!conversation)
    return res.status(404).json({ ok: false, error: "Conversation not found" });
  return res.json({ ok: true, conversation });
});

router.get("/orders", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const orders = getOrdersForMerchant(merchantId);
  return res.json({
    ok: true,
    merchant_id: merchantId,
    count: orders.length,
    orders,
  });
});

router.get("/orders/:merchantId", requireMerchantSession, (req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  if (rejectCrossMerchantPath(req, res, merchantId)) return;
  const orders = getOrdersForMerchant(merchantId);
  return res.json({
    ok: true,
    merchant_id: merchantId,
    count: orders.length,
    orders,
  });
});

router.get("/products", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const products = readBotProductsForHttp(res, merchantId);
  if (!products) return;
  return res.json({
    ok: true,
    authority: "server_catalog",
    merchant_id: merchantId,
    count: products.length,
    products,
  });
});

router.post("/products", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  return sendLegacyProductAuthorityDisabled(res, merchantId);
});

router.get("/meta/webhook", (req: Request, res: Response) => {
  const mode = getQueryString(req.query["hub.mode"]);
  const token = getQueryString(req.query["hub.verify_token"]);
  const challenge = getQueryString(req.query["hub.challenge"]);
  const verifyToken = process.env.META_VERIFY_TOKEN;
  if (!verifyToken)
    return res.status(500).send("META_VERIFY_TOKEN is not configured");
  if (mode === "subscribe" && token === verifyToken && challenge)
    return res.status(200).send(challenge);
  return res.sendStatus(403);
});

router.post("/meta/webhook", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body.object !== "page") return res.sendStatus(200);

    for (const entry of body.entry || []) {
      const pageId = entry.id;
      if (!pageId) continue;
      const pageAccessToken = await getPageAccessTokenForPage(pageId);
      if (!pageAccessToken) continue;
      const baseBusinessContext = await getBusinessContextForPage(pageId);
      if (!baseBusinessContext) {
        console.error("No merchant mapping found for page:", pageId);
        continue;
      }

      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        const messageText = event.message?.text;
        const messageId = event.message?.mid;
        if (event.message?.is_echo) continue;
        if (!senderId || !messageText) continue;

        const businessContext = resolveBusinessContextForMessage(
          pageId,
          messageText,
          baseBusinessContext,
        );
        const trainedReply = await generateTrainedBotReply({
          userText: messageText,
          context: businessContext,
          customerId: senderId,
        });
        const reply = trainedReply.text;

        if (BOT_DEBUG) {
          console.log(
            "[FAWRI_BOT_DEBUG]",
            JSON.stringify(
              {
                pageId,
                contextDebug: businessContext.debug,
                merchantId: businessContext.merchantId,
                productsCount: businessContext.products.length,
                productNames: businessContext.products
                  .slice(0, 20)
                  .map((p) => p.name),
                senderId,
                messageText,
                intent: trainedReply.debug?.intent,
                matchedProduct: trainedReply.debug?.matchedProduct,
                reply,
              },
              null,
              2,
            ),
          );
        }

        try {
          await sendMessengerText(senderId, reply, pageAccessToken);
          saveMessengerConversation({
            merchantId: businessContext.merchantId,
            customerId: senderId,
            userText: messageText,
            botReply: reply,
            externalMessageId: messageId,
            replyStatus: "sent",
            replyType: trainedReply.replyType,
            needsTraining: trainedReply.needsTraining,
            assignedToHuman: trainedReply.assignedToHuman,
          });
        } catch {
          console.error("Meta reply send failed", {
            pageId,
            code: "META_SEND_FAILED",
          });
          saveMessengerConversation({
            merchantId: businessContext.merchantId,
            customerId: senderId,
            userText: messageText,
            botReply: reply,
            externalMessageId: messageId,
            replyStatus: "failed",
            replyType: trainedReply.replyType,
            needsTraining: trainedReply.needsTraining,
            assignedToHuman: trainedReply.assignedToHuman,
          });
        }
      }
    }
    return res.sendStatus(200);
  } catch (error) {
    if (error instanceof BotCatalogAuthorityError) {
      console.error("Bot catalog authority unavailable:", error.code);
      res.setHeader("Cache-Control", "no-store");
      return res.status(error.status).json({
        ok: false,
        code: error.code,
        error: error.message,
      });
    }
    console.error("Webhook error:", error);
    return res.sendStatus(200);
  }
});

router.get(
  "/meta/login",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const appId = process.env.META_APP_ID;
    const configId = process.env.META_CONFIG_ID;
    const requestedPlatform =
      getQueryString(req.query.platform) || "messenger";
    const merchantId = getMerchantIdFromSession(res);

    if (
      requestedPlatform !== "messenger" &&
      requestedPlatform !== "instagram"
    ) {
      return res.status(400).send("Unsupported Meta platform");
    }
    if (!appId) return res.status(500).send("META_APP_ID is not configured");
    if (!configId)
      return res.status(500).send("META_CONFIG_ID is not configured");

    const state = createMerchantOAuthState(
      merchantId,
      requestedPlatform,
    );
    const loginUrl =
      `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}` +
      `&config_id=${encodeURIComponent(configId)}` +
      `&state=${encodeURIComponent(state)}` +
      `&response_type=code`;
    return res.redirect(loginUrl);
  },
);

router.get("/meta/callback", async (req: Request, res: Response) => {
  const code = getQueryString(req.query.code);
  const error = getQueryString(req.query.error);
  const errorDescription = getQueryString(req.query.error_description);
  const rawState = getQueryString(req.query.state);
  const state = verifyMerchantOAuthState(rawState);

  if (error)
    return res
      .status(400)
      .send(`Meta login error: ${errorDescription || error}`);
  if (!code) return res.status(400).send("Missing code from Meta");
  if (!state) return res.status(400).send("Invalid or expired Meta state");
  if (!merchantSessionAccountExists(state.merchantId)) {
    return res.status(401).send("Merchant account is unavailable");
  }

  const merchantId = state.merchantId;
  const platform = state.platform || "messenger";

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId) return res.status(500).send("META_APP_ID is not configured");
  if (!appSecret)
    return res.status(500).send("META_APP_SECRET is not configured");

  try {
    const tokenUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token` +
      `?client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}` +
      `&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}` +
      `&code=${encodeURIComponent(code)}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData: any = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenData?.access_token) {
      console.error("Meta token exchange failed:", {
        status: tokenResponse.status,
        code: String(tokenData?.error?.code || "") || undefined,
      });
      return res.status(400).send("Failed to exchange Meta OAuth code");
    }

    const accountsUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts` +
      `?fields=id,name,access_token` +
      `&access_token=${encodeURIComponent(tokenData.access_token)}`;
    const accountsResponse = await fetch(accountsUrl);
    const accountsData: any = await accountsResponse.json().catch(() => null);
    if (!accountsResponse.ok || !Array.isArray(accountsData?.data)) {
      console.error("Failed to fetch Meta pages:", {
        status: accountsResponse.status,
        code: String(accountsData?.error?.code || "") || undefined,
      });
      return res.status(400).send("Failed to fetch Meta pages");
    }

    const connectedPages: MetaPageConnection[] = [];

    for (const page of accountsData.data.filter(
      (item: any) => item?.id && item?.access_token,
    )) {
      const pageId = String(page.id);
      const pageAccessToken = String(page.access_token);

      const connection: MetaPageConnection = {
        merchant_id: merchantId,
        page_id: pageId,
        page_name: String(page.name || "Facebook Page"),
        connected_at: new Date().toISOString(),
        platform: platform === "instagram" ? "instagram" : "messenger",
      };

      // Install the app on this Page so Meta can deliver Page events
      // to the Webhook configured for the Fawri app.
      try {
        const subscribeUrl =
          `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}/subscribed_apps`;

        const subscribeBody = new URLSearchParams({
          subscribed_fields: [
            "messages",
            "messaging_postbacks",
            "message_deliveries",
            "message_reads",
            "feed",
          ].join(","),
          access_token: pageAccessToken,
        });

        const subscribeResponse = await fetch(subscribeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: subscribeBody,
        });

        const subscribeData: any = await subscribeResponse
          .json()
          .catch(() => null);

        connection.webhook_subscribed =
          subscribeResponse.ok && subscribeData?.success === true;

        if (!connection.webhook_subscribed) {
          connection.webhook_subscription_error = String(
            subscribeData?.error?.message ||
              `Meta subscription failed with status ${subscribeResponse.status}`,
          );

          console.error("Meta Page webhook subscription failed:", {
            pageId,
            status: subscribeResponse.status,
            code: String(subscribeData?.error?.code || "") || undefined,
          });
        }
      } catch (subscriptionError) {
        connection.webhook_subscribed = false;
        connection.webhook_subscription_error =
          "Meta Page webhook subscription request failed";
        console.error("Meta Page webhook subscription request failed:", {
          pageId,
          code: safeErrorCode(subscriptionError, "META_SUBSCRIPTION_FAILED"),
        });
      }

      // Discover the Instagram professional account connected to this Page.
      try {
        const pageDetailsUrl =
          `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}` +
          `?fields=instagram_business_account` +
          `&access_token=${encodeURIComponent(pageAccessToken)}`;

        const pageDetailsResponse = await fetch(pageDetailsUrl);
        const pageDetails: any = await pageDetailsResponse
          .json()
          .catch(() => null);

        const instagramAccountId = String(
          pageDetails?.instagram_business_account?.id || "",
        );

        if (pageDetailsResponse.ok && instagramAccountId) {
          const instagramDetailsUrl =
            `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(instagramAccountId)}` +
            `?fields=id,username,name` +
            `&access_token=${encodeURIComponent(pageAccessToken)}`;

          const instagramDetailsResponse = await fetch(instagramDetailsUrl);
          const instagramDetails: any = await instagramDetailsResponse
            .json()
            .catch(() => null);

          if (instagramDetailsResponse.ok && instagramDetails?.id) {
            connection.instagram_account_id = String(instagramDetails.id);
            connection.instagram_username = String(
              instagramDetails.username || "",
            );
            connection.instagram_name = String(instagramDetails.name || "");
          } else {
            console.error("Failed to fetch connected Instagram account:", {
              pageId,
              instagramAccountId,
              status: instagramDetailsResponse.status,
              code: String(instagramDetails?.error?.code || "") || undefined,
            });
          }
        }
      } catch (instagramError) {
        console.error("Connected Instagram account discovery failed:", {
          pageId,
          code: safeErrorCode(instagramError, "META_INSTAGRAM_DISCOVERY_FAILED"),
        });
      }

      connectMetaChannel({
        merchantId,
        platform: connection.platform,
        pageId: connection.page_id,
        pageName: connection.page_name,
        accessToken: pageAccessToken,
        webhookSubscribed: connection.webhook_subscribed,
        instagramAccountId: connection.instagram_account_id,
        instagramUsername: connection.instagram_username,
      });

      connectedPages.push(connection);
      metaPagesByPageId.set(connection.page_id, connection);
    }

    saveRuntimeDb();

    return res.send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding-top: 60px; direction: rtl;">
          <h2>تم ربط Meta بنجاح ✅</h2>
          <p>تم ربط ${connectedPages.length} صفحة بهذا التاجر.</p>
          <p>جاري الرجوع إلى لوحة التحكم...</p>
          <script>
            localStorage.setItem('fawri_${platform}_connected', 'true');
            setTimeout(function () { window.location.href = '/dashboard/channels'; }, 1200);
          </script>
        </body>
      </html>
    `);
  } catch (callbackError) {
    console.error("Meta callback failed:", {
      code: safeErrorCode(callbackError, "META_CALLBACK_FAILED"),
    });
    return res.status(500).send("Meta callback failed");
  }
});

router.use("/bot-training", botTrainingRouter);
router.use("/saved-answers", savedAnswersRouter);

export default router;