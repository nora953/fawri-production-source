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
import './indexModulePart1';
import { INTENT_MIN_CONFIDENCE, hasAny, normalizeArabicText, normalizeDigits } from './indexModulePart1';
import type { BusinessContext, IntentId, IntentResult, LanguageCode, Product } from './indexModulePart1';

export const INTENT_KEYWORDS: Record<IntentId, string[]> = {
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

export const STOP_WORDS = new Set([
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

export function getSearchTokens(value: string) {
  return normalizeArabicText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function getProductSearchText(product: Product) {
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

export function findMatchedProduct(text: string, products: Product[]) {
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

export function scoreProductMatch(text: string, product: Product) {
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

export function findBestProductMatch(text: string, products: Product[]) {
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

export function findProductFromTextOrHint(
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

export function resolveBusinessContextForMessage(
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

export function getProductPrice(product: Product) {
  return Number(product.current_price || product.original_price || 0);
}

export function isProductAvailable(product: Product) {
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

export function extractPhone(text: string) {
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

export function extractCustomerName(text: string) {
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

export function extractAddress(text: string) {
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

export function detectLanguage(text: string): LanguageCode {
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

export function extractProductHint(text: string) {
  return getSearchTokens(text).join(" ").trim();
}

export function hasCancelDraftMeaning(text: string) {
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

export function classifyIntentByRules(
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

export function extractOpenAIText(data: any): string | null {
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

export function parseJsonObjectFromText(text: string): any | null {
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

export function coerceIntentId(value: unknown): IntentId {
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

export async function classifyIntentWithAI(
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

export async function resolveIntent(
  userText: string,
  hasDraft: boolean,
): Promise<IntentResult> {
  const ruleIntent = classifyIntentByRules(userText, hasDraft);
  if (ruleIntent.confidence >= INTENT_MIN_CONFIDENCE) return ruleIntent;
  const aiIntent = await classifyIntentWithAI(userText, ruleIntent);
  if (aiIntent && aiIntent.confidence >= INTENT_MIN_CONFIDENCE) return aiIntent;
  return { ...ruleIntent, source: aiIntent ? "rules_ai_fallback" : "rules" };
}
