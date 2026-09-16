import { Router, type IRouter, type Request, type Response } from "express";
import fs from "node:fs";
import { getFawriDataDir, getFawriDataFilePath } from "../lib/dataPaths";
import healthRouter from "./health";
import botTrainingRouter from "./bot-training";
import {
  formatDeliveryQuoteText,
  type DeliveryQuote,
} from "../services/deliveryPricing";
import { getMerchantDeliveryQuote } from "../services/merchantSettingsRuntime";
import { registerMerchantRuntimeDeletion } from "../services/merchantRuntime";
import {
  connectMetaChannel,
  readMetaChannelCredential,
} from "../services/metaChannelRuntime";
import {
  connectMetaChannelAuthoritative,
  listMetaChannelsAuthoritative,
} from "../services/postgresMetaChannelAuthority";
import {
  getMerchantOperationalDecisionAuthoritative,
} from "../services/merchantOperationalAccess";
import { operationalPostgresAuthorityRequired } from "../services/operationalPostgresAuthority";
import {
  BotCatalogAuthorityError,
  readBotCatalogProducts,
  type BotCatalogProduct,
} from "../services/botCatalogAuthority";
import authRouter, {
  createMerchantOAuthState,
  getMerchantIdFromSession,
  merchantSessionAccountExists,
  notifyMerchantNewCustomerMessage,
  notifyMerchantNewOrder,
  requireMerchantSession,
  verifyMerchantOAuthState,
} from "./auth";
import savedAnswersRouter from "./saved-answers";
import { getMetaWebhookEventId } from "../middleware/metaWebhookSecurity";

export const router: IRouter = Router();

router.use(healthRouter);

router.use("/auth", authRouter);

export const GRAPH_VERSION = "v22.0";

export const META_REDIRECT_URI = String(process.env.META_REDIRECT_URI || "").trim();

export const DB_DIR = getFawriDataDir();

export const DB_PATH = getFawriDataFilePath("fawri-runtime-db.json");

export const DRAFT_TTL_MINUTES = Number(process.env.BOT_DRAFT_TTL_MINUTES || 60);

export const INTENT_MIN_CONFIDENCE = Number(
  process.env.BOT_INTENT_CONFIDENCE_MIN || 0.72,
);

export const BOT_DEBUG =
  process.env.BOT_DEBUG === "true" || process.env.NODE_ENV !== "production";

export type Product = BotCatalogProduct;

export type LegacyProduct = {
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

export type BotMessage = {
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

export type BotConversation = {
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

export type MetaPageConnection = {
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

export type BusinessContext = {
  merchantId: string;
  businessName: string;
  products: Product[];
  debug?: { pageId?: string; resolvedBy?: string; originalMerchantId?: string };
};

export type Order = {
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
  subtotal_iqd: number;
  delivery_fee_iqd: number;
  total_iqd: number;
  total_price: number;
  delivery_pricing_mode: "flat" | "per_area";
  delivery_settings_version: number;
  delivery_area_rate_id?: string;
  status: "new" | "pending_confirmation" | "confirmed" | "cancelled";
  source_channel: "messenger";
  notes?: string;
  created_at: string;
  updated_at: string;
};

export type OrderDraft = {
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

export type RuntimeDb = {
  productsByMerchant: Record<string, LegacyProduct[]>;
  conversationsByMerchant: Record<string, BotConversation[]>;
  metaPagesByPageId: Record<string, MetaPageConnection>;
  ordersByMerchant: Record<string, Order[]>;
  orderDraftsByConversation: Record<string, OrderDraft>;
  lastSyncedMerchantId: string | null;
};

export type LanguageCode = "ar_iq" | "ku_sorani" | "en" | "unknown";

export type IntentId =
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

export type IntentResult = {
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

export type BotReplyResult = {
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

export const quarantinedLegacyProductsByMerchant = new Map<string, LegacyProduct[]>();

export const conversationsByMerchant = new Map<string, BotConversation[]>();

export const metaPagesByPageId = new Map<string, MetaPageConnection>();

export const ordersByMerchant = new Map<string, Order[]>();

export const orderDraftsByConversation = new Map<string, OrderDraft>();

export let lastSyncedMerchantId: string | null = null;

export function ensureDbFile() {
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

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeQuarantinedLegacyProducts(products: LegacyProduct[]) {
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

export const META_PAGE_METADATA_KEYS = new Set([
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

export function normalizeMetaPageConnection(
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

export function loadRuntimeDb() {
  if (operationalPostgresAuthorityRequired()) return;
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

export function saveRuntimeDb() {
  if (operationalPostgresAuthorityRequired()) return;
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

export function getQueryString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "");
  if (typeof value === "string") return value;
  return "";
}

export function getParamString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || "");
  if (typeof value === "string") return value;
  return "";
}

export function rejectCrossMerchantPath(
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

export function readBotProductsForHttp(
  res: Response,
  merchantId: string,
): Product[] | null {
  if (operationalPostgresAuthorityRequired()) {
    res.setHeader("Cache-Control", "no-store");
    res.status(410).json({
      ok: false,
      merchant_id: merchantId,
      code: "LEGACY_RUNTIME_AUTHORITY_DISABLED",
      error: "legacy bot runtime is disabled; use the PostgreSQL operational APIs",
    });
    return null;
  }
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

export function sendLegacyProductAuthorityDisabled(
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

export function resolveMerchantIdForWebhookPage(pageId: string) {
  const connection = metaPagesByPageId.get(pageId);
  if (connection?.merchant_id) return connection.merchant_id;

  // عزل صارم للبيانات:
  // إذا الصفحة غير مربوطة بتاجر، لا نستخدم آخر تاجر تمت مزامنته ولا merchant-demo.
  // في التطوير يمكن تحديد تاجر اختباري صريح عبر DEFAULT_MERCHANT_ID فقط.
  if (process.env.DEFAULT_MERCHANT_ID) return process.env.DEFAULT_MERCHANT_ID;

  return "";
}

export async function getBusinessContextForPage(
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

export function safeErrorCode(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code || "").trim();
    if (code) return code;
  }
  return fallback;
}

export async function getPageAccessTokenForPage(
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

export async function sendMessengerText(
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

export function saveMessengerConversation(params: {
  merchantId: string;
  customerId: string;
  userText: string;
  botReply: string;
  externalMessageId?: string;
  sourceEventId?: string;
  replyStatus: "sent" | "failed";
  replyType?: "ai" | "database" | "fallback";
  needsTraining?: boolean;
  assignedToHuman?: boolean;
}) {
  if (operationalPostgresAuthorityRequired()) {
    throw Object.assign(new Error("legacy Messenger conversation persistence is disabled"), {
      code: "LEGACY_RUNTIME_AUTHORITY_DISABLED",
    });
  }
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
  notifyMerchantNewCustomerMessage({
    merchantId: params.merchantId,
    conversationId,
    sourceEventId:
      params.sourceEventId || params.externalMessageId || customerMessage.id,
    createdAt: now,
  });
  return updated.find((c) => c.id === conversationId);
}

export /* ─────────────────────────────────────────────────────────────
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

export function normalizeArabicText(value: string) {
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

export function hasAny(text: string, keywords: string[]) {
  const normalizedText = normalizeArabicText(text);
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeArabicText(keyword);
    return !!normalizedKeyword && normalizedText.includes(normalizedKeyword);
  });
}
