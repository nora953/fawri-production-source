import { AgentIntent, LanguageCode } from "./agentTypes";
import {
  detectLanguage,
  isCancelOrChangeMessage,
  normalizeText,
} from "./textUtils";

export type LocalIntentResult = {
  intent: AgentIntent;
  language: LanguageCode;
  confidence: number;
  shouldHandoff: boolean;
  reason: string;
  matchedKeywords: string[];
};

type IntentRule = {
  intent: AgentIntent;
  keywords: string[];
  strongKeywords?: string[];
  handoff?: boolean;
};

const intentRules: IntentRule[] = [
  {
    intent: "greeting",
    keywords: [
      "السلام عليكم",
      "سلام عليكم",
      "مرحبا",
      "هلو",
      "هاي",
      "hello",
      "hi",
      "سلاو",
      "ساڵو",
    ],
    strongKeywords: ["السلام عليكم", "مرحبا", "هلو", "hello", "hi"],
  },
  {
    intent: "price_ask",
    keywords: [
      "بيش",
      "شكد",
      "كم السعر",
      "كم سعره",
      "سعر",
      "السعر",
      "نرخ",
      "نرخی",
      "price",
      "how much",
    ],
    strongKeywords: [
      "بيش",
      "شكد",
      "كم السعر",
      "كم سعره",
      "السعر",
      "price",
      "how much",
    ],
  },
  {
    intent: "availability_ask",
    keywords: [
      "متوفر",
      "موجود",
      "اكو منه",
      "أكو منه",
      "عدكم",
      "باقي",
      "available",
      "بەردەست",
      "هەیە",
    ],
    strongKeywords: ["متوفر", "موجود", "عدكم", "available", "بەردەست"],
  },
  {
    intent: "product_details",
    keywords: [
      "مواصفات",
      "تفاصيل",
      "شنو حجمه",
      "شنو نوعه",
      "اللون",
      "القياس",
      "المقاس",
      "details",
      "size",
      "color",
    ],
    strongKeywords: ["مواصفات", "تفاصيل", "اللون", "القياس", "المقاس"],
  },
  {
    intent: "order_create",
    keywords: [
      "اريد اطلب",
      "اريد أطلب",
      "أريد أطلب",
      "احجزلي",
      "احجز لي",
      "ثبتلي",
      "ثبته",
      "اخذه",
      "أخذه",
      "اريده",
      "أريده",
      "order",
      "داواکاری",
    ],
    strongKeywords: [
      "اريد اطلب",
      "أريد أطلب",
      "احجزلي",
      "ثبتلي",
      "ثبته",
      "اخذه",
      "أخذه",
    ],
  },
  {
    intent: "order_cancel",
    keywords: [
      "الغي الطلب",
      "إلغاء الطلب",
      "الغاء الطلب",
      "اريد الغي",
      "أريد ألغي",
      "ما اريد الطلب",
      "cancel order",
      "cancel",
    ],
    strongKeywords: [
      "الغي الطلب",
      "إلغاء الطلب",
      "الغاء الطلب",
      "cancel order",
    ],
  },
  {
    intent: "delivery_info",
    keywords: [
      "توصيل",
      "توصلون",
      "يوصل",
      "كم يوم",
      "شكد توصيل",
      "delivery",
      "گەیاندن",
    ],
    strongKeywords: ["توصيل", "توصلون", "شكد توصيل", "delivery"],
  },
  {
    intent: "payment_methods",
    keywords: [
      "دفع",
      "كاش",
      "زين كاش",
      "بطاقه",
      "بطاقة",
      "عند الاستلام",
      "payment",
      "cash",
      "card",
    ],
    strongKeywords: [
      "دفع",
      "كاش",
      "زين كاش",
      "عند الاستلام",
      "payment",
      "cash",
    ],
  },
  {
    intent: "order_track",
    keywords: [
      "طلبي وين",
      "وين وصل",
      "تأخر الطلب",
      "تاخر الطلب",
      "رقم الطلب",
      "track",
      "where is my order",
    ],
    strongKeywords: ["طلبي وين", "وين وصل", "رقم الطلب", "track"],
  },
  {
    intent: "complaint",
    keywords: [
      "مشكله",
      "مشكلة",
      "خربان",
      "تالف",
      "وصلني غلط",
      "تاخرتم",
      "تأخرتم",
      "خدمتكم سيئه",
      "خدمتكم سيئة",
      "complaint",
      "bad service",
    ],
    strongKeywords: ["مشكلة", "خربان", "تالف", "وصلني غلط", "complaint"],
    handoff: true,
  },
  {
    intent: "exchange_return",
    keywords: [
      "استرجاع",
      "ارجع",
      "أرجع",
      "تبديل",
      "ابدال",
      "أبدل",
      "refund",
      "return",
      "exchange",
    ],
    strongKeywords: [
      "استرجاع",
      "أرجع",
      "تبديل",
      "refund",
      "return",
      "exchange",
    ],
    handoff: true,
  },
  {
    intent: "business_hours",
    keywords: [
      "دوام",
      "متى تفتحون",
      "اوقات العمل",
      "أوقات العمل",
      "working hours",
      "hours",
    ],
    strongKeywords: ["دوام", "متى تفتحون", "اوقات العمل", "working hours"],
  },
  {
    intent: "location",
    keywords: [
      "مكانكم",
      "وين مكانكم",
      "عنوانكم",
      "عندكم فرع",
      "location",
      "address",
    ],
    strongKeywords: ["مكانكم", "وين مكانكم", "عنوانكم", "location", "address"],
  },
  {
    intent: "promotion",
    keywords: ["عرض", "عروض", "تخفيض", "خصم", "discount", "promotion"],
    strongKeywords: ["عرض", "عروض", "تخفيض", "خصم", "discount"],
  },
  {
    intent: "handoff",
    keywords: [
      "اريد موظف",
      "أريد موظف",
      "موظف",
      "اكلم شخص",
      "أكلم شخص",
      "اكلم انسان",
      "أكلم إنسان",
      "مدير",
      "اتصلوا بي",
      "human",
      "agent",
      "support",
    ],
    strongKeywords: [
      "اريد موظف",
      "أريد موظف",
      "اكلم شخص",
      "موظف",
      "human",
      "agent",
    ],
    handoff: true,
  },
];

export function detectLocalIntent(message: string): LocalIntentResult {
  const normalizedMessage = normalizeText(message);
  const language = detectLanguage(message);

  if (!normalizedMessage) {
    return {
      intent: "unknown",
      language,
      confidence: 0,
      shouldHandoff: false,
      reason: "empty_message",
      matchedKeywords: [],
    };
  }

  if (isCancelOrChangeMessage(message)) {
    const isOrderCancel =
      normalizedMessage.includes(normalizeText("الغي الطلب")) ||
      normalizedMessage.includes(normalizeText("الغاء الطلب")) ||
      normalizedMessage.includes(normalizeText("إلغاء الطلب")) ||
      normalizedMessage.includes(normalizeText("cancel order"));

    return {
      intent: isOrderCancel ? "order_cancel" : "product_switch",
      language,
      confidence: 0.92,
      shouldHandoff: false,
      reason: isOrderCancel
        ? "customer_requested_order_cancel"
        : "customer_changed_or_cancelled_previous_choice",
      matchedKeywords: ["cancel_or_change"],
    };
  }

  const hasDeliveryWord =
    normalizedMessage.includes(normalizeText("توصيل")) ||
    normalizedMessage.includes(normalizeText("توصلون")) ||
    normalizedMessage.includes(normalizeText("يوصل")) ||
    normalizedMessage.includes(normalizeText("شكد توصيل")) ||
    normalizedMessage.includes(normalizeText("delivery")) ||
    normalizedMessage.includes(normalizeText("گەیاندن"));

  if (hasDeliveryWord) {
    return {
      intent: "delivery_info",
      language,
      confidence: 0.9,
      shouldHandoff: false,
      reason: "delivery_keyword_has_priority",
      matchedKeywords: ["delivery_priority"],
    };
  }

  let bestRule: IntentRule | null = null;
  let bestScore = 0;
  let bestMatchedKeywords: string[] = [];
  let bestReason = "no_local_intent_match";

  for (const rule of intentRules) {
    const match = scoreRule(message, rule);

    if (match.score > bestScore) {
      bestScore = match.score;
      bestRule = rule;
      bestMatchedKeywords = match.matchedKeywords;
      bestReason = match.reason;
    }
  }

  if (!bestRule || bestScore < 0.42) {
    return {
      intent: "unknown",
      language,
      confidence: bestScore,
      shouldHandoff: false,
      reason: "no_local_intent_match",
      matchedKeywords: bestMatchedKeywords,
    };
  }

  return {
    intent: bestRule.intent,
    language,
    confidence: Math.min(0.96, bestScore),
    shouldHandoff: bestRule.handoff === true,
    reason: bestReason,
    matchedKeywords: bestMatchedKeywords,
  };
}

function scoreRule(
  message: string,
  rule: IntentRule,
): {
  score: number;
  matchedKeywords: string[];
  reason: string;
} {
  const normalizedMessage = normalizeText(message);

  const matchedStrongKeywords = (rule.strongKeywords ?? []).filter((keyword) =>
    normalizedMessage.includes(normalizeText(keyword)),
  );

  if (matchedStrongKeywords.length > 0) {
    return {
      score: Math.min(0.95, 0.78 + matchedStrongKeywords.length * 0.06),
      matchedKeywords: matchedStrongKeywords,
      reason: "matched_strong_local_keyword",
    };
  }

  const matchedKeywords = rule.keywords.filter((keyword) =>
    normalizedMessage.includes(normalizeText(keyword)),
  );

  if (matchedKeywords.length > 0) {
    return {
      score: Math.min(0.88, 0.62 + matchedKeywords.length * 0.05),
      matchedKeywords,
      reason: "matched_local_keyword",
    };
  }

  return {
    score: 0,
    matchedKeywords: [],
    reason: "no_match",
  };
}

export function isHighRiskIntent(intent: AgentIntent): boolean {
  return (
    intent === "complaint" ||
    intent === "exchange_return" ||
    intent === "handoff"
  );
}
