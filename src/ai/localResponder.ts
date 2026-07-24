import {
  AgentReplyResult,
  ConversationState,
  ProductRecord,
  StorePolicy,
} from "./agentTypes";
import {
  findProductByMessage,
  formatProductPrice,
  getMerchantProducts,
  getProductDisplayName,
  getStorePolicy,
  isProductAvailable,
} from "./catalogProvider";
import { LocalIntentResult } from "./localIntentEngine";

export type LocalResponderInput = {
  merchantId: string;
  customerMessage: string;
  intentResult: LocalIntentResult;
  state: ConversationState;
};

export async function tryLocalReply(
  input: LocalResponderInput,
): Promise<AgentReplyResult | null> {
  const policy = await getStorePolicy(input.merchantId);

  const productMatch = await findProductByMessage({
    merchantId: input.merchantId,
    message: input.customerMessage,
    preferLastMention: input.intentResult.intent === "product_switch",
    excludeProductIds:
      input.intentResult.intent === "product_switch" &&
      input.state.activeProductId
        ? [input.state.activeProductId]
        : [],
  });

  const activeProduct = await getActiveProduct({
    merchantId: input.merchantId,
    state: input.state,
  });

  const product = productMatch.product ?? activeProduct;

  switch (input.intentResult.intent) {
    case "greeting":
      return makeResult({
        reply: greetingReply(input.intentResult.language, policy),
        intent: "greeting",
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "price_ask":
      return replyForPrice({
        product,
        policy,
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "availability_ask":
      return replyForAvailability({
        product,
        policy,
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "product_details":
      return replyForProductDetails({
        product,
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "delivery_info":
      return makeResult({
        reply: policy.deliveryInfo
          ? `${policy.deliveryInfo}`
          : "التوصيل يعتمد على منطقتك. ممكن تذكرلي منطقتك حتى أتأكدلك؟",
        intent: "delivery_info",
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "payment_methods":
      return makeResult({
        reply: policy.paymentInfo
          ? `${policy.paymentInfo}`
          : "طرق الدفع تعتمد على إعدادات المتجر. حتى ما أعطيك معلومة غلط، راح أتأكدلك.",
        intent: "payment_methods",
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "order_create":
      return replyForOrderCreate({
        product,
        state: input.state,
        policy,
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "order_cancel":
      return makeResult({
        reply:
          "تم، راح نوقف الطلب الحالي. إذا تحب تختار منتج ثاني آني بالخدمة.",
        intent: "order_cancel",
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "product_switch":
      return replyForProductSwitch({
        product: productMatch.product,
        previousProductName: input.state.activeProductName,
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
      });

    case "complaint":
      return makeResult({
        reply:
          "نعتذر منك جداً على الإزعاج، حقك علينا. ممكن ترسل رقم الطلب وتوضحلي شنو صار حتى نحول الموضوع للموظف المختص؟",
        intent: "complaint",
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
        shouldHandoff: true,
      });

    case "exchange_return":
      return makeResult({
        reply:
          "نعتذر إذا صار أي إزعاج. حتى نتابع الاستبدال أو الاسترجاع، ممكن ترسل رقم الطلب وسبب الطلب؟",
        intent: "exchange_return",
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
        shouldHandoff: true,
      });

    case "handoff":
      return makeResult({
        reply:
          policy.humanHandoffText ||
          "حتى نساعدك بشكل أدق، راح أحوّل طلبك للفريق المختص.",
        intent: "handoff",
        language: input.intentResult.language,
        confidence: input.intentResult.confidence,
        shouldHandoff: true,
      });

    case "business_hours":
      return makeResult({
        reply:
          "حالياً ما عندي وقت دوام مؤكد داخل النظام. حتى ما أعطيك معلومة غلط، راح أتأكدلك من الفريق.",
        intent: "business_hours",
        language: input.intentResult.language,
        confidence: 0.55,
        shouldHandoff: false,
      });

    case "location":
      return makeResult({
        reply:
          "ممكن تحددلي المدينة أو الفرع المطلوب؟ حتى أعطيك العنوان الصحيح.",
        intent: "location",
        language: input.intentResult.language,
        confidence: 0.6,
      });

    case "promotion":
      return makeResult({
        reply:
          "حتى أتأكدلك من العروض المتوفرة، ممكن تذكرلي نوع المنتج اللي تريده؟",
        intent: "promotion",
        language: input.intentResult.language,
        confidence: 0.6,
      });

    default:
      return null;
  }
}

async function getActiveProduct(input: {
  merchantId: string;
  state: ConversationState;
}): Promise<ProductRecord | null> {
  if (!input.state.activeProductId && !input.state.activeProductName) {
    return null;
  }

  const products = await getMerchantProducts(input.merchantId);

  return (
    products.find((product) => {
      return (
        product.id === input.state.activeProductId ||
        product.name === input.state.activeProductName
      );
    }) ?? null
  );
}

function replyForPrice(input: {
  product: ProductRecord | null;
  policy: StorePolicy;
  language: string;
  confidence: number;
}): AgentReplyResult | null {
  if (!input.product) {
    return makeResult({
      reply: "أكيد، ممكن ترسل اسم المنتج أو صورته حتى أعطيك السعر الصحيح؟",
      intent: "price_ask",
      language: input.language,
      confidence: 0.75,
    });
  }

  const price = formatProductPrice(input.product);

  if (!price) {
    return makeResult({
      reply:
        "حالياً ما عندي سعر مؤكد لهذا المنتج. حتى ما أعطيك معلومة غلط، راح أحوّل الطلب للفريق يتأكدلك.",
      intent: "price_ask",
      language: input.language,
      confidence: 0.7,
      shouldHandoff: true,
    });
  }

  return makeResult({
    reply: `سعر ${getProductDisplayName(input.product)} هو ${price}. تحب أثبته لك؟`,
    intent: "price_ask",
    language: input.language,
    confidence: input.confidence,
  });
}

function replyForAvailability(input: {
  product: ProductRecord | null;
  policy: StorePolicy;
  language: string;
  confidence: number;
}): AgentReplyResult | null {
  if (!input.product) {
    return makeResult({
      reply: "حاضر، ممكن ترسل اسم المنتج أو صورته حتى أتأكدلك من التوفر؟",
      intent: "availability_ask",
      language: input.language,
      confidence: 0.75,
    });
  }

  const available = isProductAvailable(input.product);
  const productName = getProductDisplayName(input.product);

  if (available === true) {
    return makeResult({
      reply: `نعم، ${productName} متوفر حالياً. تحب نثبت الطلب؟`,
      intent: "availability_ask",
      language: input.language,
      confidence: input.confidence,
    });
  }

  if (available === false) {
    return makeResult({
      reply: `للأسف ${productName} غير متوفر حالياً. أگدر أقترحلك بديل قريب إذا تحب.`,
      intent: "availability_ask",
      language: input.language,
      confidence: input.confidence,
    });
  }

  return makeResult({
    reply:
      "حتى ما أعطيك معلومة غلط، التوفر يحتاج تأكيد من المخزون. راح أتأكدلك من الفريق.",
    intent: "availability_ask",
    language: input.language,
    confidence: 0.65,
    shouldHandoff: true,
  });
}

function replyForProductDetails(input: {
  product: ProductRecord | null;
  language: string;
  confidence: number;
}): AgentReplyResult | null {
  if (!input.product) {
    return makeResult({
      reply: "أكيد، ممكن ترسل اسم المنتج أو صورته حتى أعطيك التفاصيل الصحيحة؟",
      intent: "product_details",
      language: input.language,
      confidence: 0.7,
    });
  }

  const product = input.product;
  const parts: string[] = [];

  if (product.description) {
    parts.push(product.description);
  }

  if (product.colors?.length) {
    parts.push(`الألوان: ${product.colors.join("، ")}`);
  }

  if (product.sizes?.length) {
    parts.push(`المقاسات: ${product.sizes.join("، ")}`);
  }

  if (parts.length === 0) {
    return makeResult({
      reply:
        "ما عندي تفاصيل كافية عن هذا المنتج حالياً. حتى ما أعطيك معلومة غلط، راح أتأكدلك من الفريق.",
      intent: "product_details",
      language: input.language,
      confidence: 0.65,
      shouldHandoff: true,
    });
  }

  return makeResult({
    reply: `${getProductDisplayName(product)}: ${parts.join(". ")}. تحب تعرف السعر أو التوفر؟`,
    intent: "product_details",
    language: input.language,
    confidence: input.confidence,
  });
}

function replyForOrderCreate(input: {
  product: ProductRecord | null;
  state: ConversationState;
  policy: StorePolicy;
  language: string;
  confidence: number;
}): AgentReplyResult | null {
  const productName =
    input.product?.name ||
    input.state.activeProductName ||
    input.state.orderDraft?.productName ||
    null;

  if (!productName) {
    return makeResult({
      reply: "أكيد، شنو المنتج اللي تحب تطلبه؟ ممكن ترسل اسمه أو صورته.",
      intent: "order_create",
      language: input.language,
      confidence: 0.75,
    });
  }

  const missing: string[] = [];

  const draft = input.state.orderDraft;

  if (!draft?.phone) {
    missing.push("رقم الهاتف");
  }

  if (!draft?.address) {
    missing.push("العنوان أو المنطقة");
  }

  if (!draft?.quantity) {
    missing.push("الكمية");
  }

  if (missing.length === 0) {
    return makeResult({
      reply: `تمام، بيانات طلب ${productName} شبه مكتملة. راح يتم مراجعته وتأكيده وياك.`,
      intent: "order_create",
      language: input.language,
      confidence: input.confidence,
    });
  }

  return makeResult({
    reply: `تمام، حتى نثبت طلب ${productName} أحتاج ${missing.join(" و ")}.`,
    intent: "order_create",
    language: input.language,
    confidence: input.confidence,
  });
}

function replyForProductSwitch(input: {
  product: ProductRecord | null;
  previousProductName?: string | null;
  language: string;
  confidence: number;
}): AgentReplyResult | null {
  if (!input.product) {
    return makeResult({
      reply:
        "أكيد، نترك الاختيار السابق. ممكن ترسل اسم المنتج الجديد أو صورته حتى أتأكدلك؟",
      intent: "product_switch",
      language: input.language,
      confidence: 0.72,
    });
  }

  const newProductName = getProductDisplayName(input.product);

  const price = formatProductPrice(input.product);
  const available = isProductAvailable(input.product);

  const details: string[] = [];

  if (available === true) {
    details.push("متوفر حالياً");
  }

  if (available === false) {
    details.push("غير متوفر حالياً");
  }

  if (price) {
    details.push(`سعره ${price}`);
  }

  const prefix = input.previousProductName
    ? `أكيد، نترك ${input.previousProductName}.`
    : "أكيد، نترك الاختيار السابق.";

  const body =
    details.length > 0
      ? `${newProductName} ${details.join(" و ")}.`
      : `${newProductName} موجود عندنا، لكن أحتاج أتأكد من التفاصيل.`;

  return makeResult({
    reply: `${prefix} ${body} تحب أثبته لك؟`,
    intent: "product_switch",
    language: input.language,
    confidence: input.confidence,
  });
}

function greetingReply(language: string, policy: StorePolicy): string {
  if (language === "en") {
    return `Hello! Welcome to ${policy.merchantName}. How can I help you today?`;
  }

  if (language === "ku_sorani") {
    return "ساڵو، بەخێربێیت. چۆن دەتوانم یارمەتیت بدەم؟";
  }

  return `أهلاً وسهلاً بيك في ${policy.merchantName}. شلون أگدر أساعدك؟`;
}

function makeResult(input: {
  reply: string;
  intent: AgentReplyResult["intent"];
  language: string;
  confidence: number;
  shouldHandoff?: boolean;
}): AgentReplyResult {
  return {
    reply: input.reply,
    shouldSend: true,

    usedOpenAI: false,
    usedLocalKnowledge: true,
    createdTrainingRequest: false,

    intent: input.intent,
    language:
      input.language === "ar_iq" ||
      input.language === "ku_sorani" ||
      input.language === "en"
        ? input.language
        : "unknown",

    confidence: input.confidence,

    shouldHandoff: input.shouldHandoff ?? false,
    internalNote: "local_responder",
  };
}