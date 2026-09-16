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
import './indexModulePart2';
import { DB_PATH, DRAFT_TTL_MINUTES, conversationsByMerchant, getParamString, getQueryString, makeId, metaPagesByPageId, orderDraftsByConversation, ordersByMerchant, readBotProductsForHttp, rejectCrossMerchantPath, router, saveRuntimeDb, sendLegacyProductAuthorityDisabled } from './indexModulePart1';
import type { BotReplyResult, BusinessContext, LanguageCode, Order, OrderDraft, Product } from './indexModulePart1';
import { extractAddress, extractCustomerName, extractPhone, findBestProductMatch, findMatchedProduct, findProductFromTextOrHint, getProductPrice, isProductAvailable, resolveIntent } from './indexModulePart2';

export function getActiveOrderDraft(conversationId: string) {
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

export function getDraftProduct(draft: OrderDraft | undefined, products: Product[]) {
  if (!draft) return undefined;
  return draft.product_id
    ? products.find((product) => product.id === draft.product_id)
    : draft.product_name
      ? findMatchedProduct(draft.product_name, products)
      : undefined;
}

export function formatPrice(price: number, language: LanguageCode) {
  const formatted = price.toLocaleString("en-US");
  if (language === "en") return `${formatted} IQD`;
  if (language === "ku_sorani") return `${formatted} دینار عێراقی`;
  return `${formatted} دينار عراقي`;
}

export function deliveryLanguage(language: LanguageCode): "ar" | "ku" | "en" {
  if (language === "en") return "en";
  if (language === "ku_sorani") return "ku";
  return "ar";
}

export function deliveryQuoteFromError(error: unknown): DeliveryQuote | null {
  if (!error || typeof error !== "object") return null;
  const quote = (error as { deliveryQuote?: unknown }).deliveryQuote;
  return quote && typeof quote === "object" ? (quote as DeliveryQuote) : null;
}

export function replyText(
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

export function createOrder(params: {
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
  const subtotal = params.unitPrice * params.quantity;
  const deliveryQuote = getMerchantDeliveryQuote({
    merchantId: params.merchantId,
    area: params.customerAddress,
    subtotalIqd: subtotal,
  });
  if (!deliveryQuote.available) {
    throw Object.assign(
      new Error("delivery quote is required before order creation"),
      {
        code: "ORDER_DELIVERY_QUOTE_REQUIRED",
        status: 409,
        deliveryQuote,
      },
    );
  }
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
    customer_area: deliveryQuote.matched_area || params.customerAddress,
    product_id: params.productId,
    product_name: params.productName,
    quantity: params.quantity,
    unit_price: params.unitPrice,
    subtotal_iqd: subtotal,
    delivery_fee_iqd: deliveryQuote.effective_fee_iqd,
    total_iqd: deliveryQuote.total_iqd,
    total_price: deliveryQuote.total_iqd,
    delivery_pricing_mode: deliveryQuote.pricing_mode,
    delivery_settings_version: deliveryQuote.settings_version,
    ...(deliveryQuote.area_rate_id
      ? { delivery_area_rate_id: deliveryQuote.area_rate_id }
      : {}),
    status: "new",
    source_channel: "messenger",
    notes: params.notes,
    created_at: now,
    updated_at: now,
  };
  ordersByMerchant.set(params.merchantId, [order, ...currentOrders]);
  saveRuntimeDb();
  notifyMerchantNewOrder({
    merchantId: params.merchantId,
    orderId: order.id,
    conversationId: order.conversation_id,
    createdAt: order.created_at,
  });
  return order;
}

export function setOrderDraft(draft: OrderDraft) {
  orderDraftsByConversation.set(draft.conversation_id, {
    ...draft,
    updated_at: new Date().toISOString(),
  });
  saveRuntimeDb();
}

export function clearOrderDraft(conversationId: string) {
  orderDraftsByConversation.delete(conversationId);
  saveRuntimeDb();
}

export function productReply(
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

export async function generateTrainedBotReply(params: {
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

      try {
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
      } catch (error) {
        const quote = deliveryQuoteFromError(error);
        if (quote) {
          return withDebug({
            text: formatDeliveryQuoteText(quote, deliveryLanguage(language)),
            replyType: "database",
          });
        }
        throw error;
      }
    }

    case "order_cancel":
      if (existingDraft) clearOrderDraft(conversationId);
      return withDebug({
        text: replyText(language, "draftCancelled"),
        replyType: "database",
      });

    case "info_delivery": {
      const quote = getMerchantDeliveryQuote({
        merchantId: context.merchantId,
        area: userText,
        subtotalIqd: 0,
      });
      return withDebug({
        text: formatDeliveryQuoteText(quote, deliveryLanguage(language)),
        replyType: "database",
      });
    }
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

export function getConversationsForMerchant(merchantId?: string) {
  if (!merchantId) return [];
  return conversationsByMerchant.get(merchantId) || [];
}

export function getOrdersForMerchant(merchantId?: string) {
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
  if (operationalPostgresAuthorityRequired()) {
    return res.status(410).json({ ok: false, code: "LEGACY_RUNTIME_AUTHORITY_DISABLED", error: "legacy bot conversation runtime is disabled" });
  }
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
  if (operationalPostgresAuthorityRequired()) {
    return res.status(410).json({ ok: false, code: "LEGACY_RUNTIME_AUTHORITY_DISABLED", error: "legacy bot order runtime is disabled" });
  }
  if (rejectCrossMerchantPath(req, res, merchantId)) return;
  const orders = ordersByMerchant.get(merchantId) || [];
  return res.json({
    ok: true,
    merchant_id: merchantId,
    count: orders.length,
    orders,
  });
});

router.get("/meta/pages", requireMerchantSession, async (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  if (operationalPostgresAuthorityRequired()) {
    const channels = await listMetaChannelsAuthoritative(merchantId);
    const pages = channels
      .filter((channel) => channel.page_id)
      .map((channel) => ({
        page_id: channel.page_id,
        page_name: channel.page_name,
        platform: channel.platform,
        connected_at: channel.connected_at,
      }));
    return res.json({ ok: true, merchant_id: merchantId, pages });
  }
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
