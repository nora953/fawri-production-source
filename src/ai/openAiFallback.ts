import OpenAI from "openai";
import {
  AgentIntent,
  AgentReplyResult,
  ConversationState,
  LanguageCode,
  ProductRecord,
  StorePolicy,
} from "./agentTypes";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function askOpenAiFallback(input: {
  customerMessage: string;
  merchantId: string;
  intent: AgentIntent;
  language: LanguageCode;
  state: ConversationState;
  products: ProductRecord[];
  policy: StorePolicy;
}): Promise<AgentReplyResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const safeProducts = input.products.slice(0, 40).map((product) => ({
    id: product.id,
    name: product.name,
    price: product.price ?? null,
    currency: product.currency ?? null,
    available:
      typeof product.available === "boolean" ? product.available : null,
    colors: product.colors ?? [],
    sizes: product.sizes ?? [],
    aliases: product.aliases ?? [],
    description: product.description ?? null,
  }));

  const systemMessage = `
أنت مساعد خدمة عملاء ومبيعات داخل نظام ردود تلقائية.

مهم جداً:
- لا تخترع السعر أو التوفر أو سياسة التوصيل.
- إذا السعر أو التوفر غير موجود في بيانات المنتجات، قل أنك ستتأكد أو حوّل للموظف.
- آخر رسالة من العميل لها الأولوية.
- لا تمسح السياق السابق إلا إذا العميل غيّر رأيه أو طلب إلغاء.
- رد باختصار ولباقة وكأنك موظف مبيعات خبير.
- لا تذكر أنك ذكاء اصطناعي.
- لا تعطي قرار مالي أو استرجاع نهائي.
- إذا الموضوع حساس: شكوى، دفع، استرجاع، تهديد، اجعل shouldHandoff = true.
- أرجع JSON فقط بدون شرح إضافي.
`;

  const userPayload = {
    customerMessage: input.customerMessage,
    detectedIntent: input.intent,
    detectedLanguage: input.language,
    conversationState: {
      activeProductId: input.state.activeProductId,
      activeProductName: input.state.activeProductName,
      orderDraft: input.state.orderDraft,
      lastIntent: input.state.lastIntent,
      lastCustomerMessage: input.state.lastCustomerMessage,
    },
    storePolicy: input.policy,
    products: safeProducts,
    requiredJsonShape: {
      reply: "string",
      intent: "AgentIntent",
      language: "ar_iq | ku_sorani | en | unknown",
      confidence: "number between 0 and 1",
      shouldHandoff: "boolean",
      safeToSaveForSimilarMessages: "boolean",
      reason: "short internal reason",
    },
  };

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: JSON.stringify(userPayload, null, 2),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return null;
    }

    const parsed = safeJsonParse(content);

    if (!parsed || typeof parsed.reply !== "string") {
      return null;
    }

    return {
      reply: parsed.reply.trim(),
      shouldSend: true,

      usedOpenAI: true,
      usedLocalKnowledge: false,
      createdTrainingRequest: false,

      intent: normalizeIntent(parsed.intent, input.intent),
      language: normalizeLanguage(parsed.language, input.language),

      confidence: normalizeConfidence(parsed.confidence),

      shouldHandoff: parsed.shouldHandoff === true,
      internalNote: `openai_fallback: ${String(parsed.reason || "no_reason")}`,
    };
  } catch (error) {
    console.error("OpenAI fallback failed:", error);
    return null;
  }
}

function safeJsonParse(input: string): any | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number") return 0.55;
  if (Number.isNaN(value)) return 0.55;
  return Math.max(0, Math.min(1, value));
}

function normalizeLanguage(
  value: unknown,
  fallback: LanguageCode,
): LanguageCode {
  if (value === "ar_iq" || value === "ku_sorani" || value === "en") {
    return value;
  }

  return fallback || "unknown";
}

function normalizeIntent(value: unknown, fallback: AgentIntent): AgentIntent {
  const allowed: AgentIntent[] = [
    "greeting",
    "price_ask",
    "availability_ask",
    "product_details",
    "product_switch",
    "order_create",
    "order_update",
    "order_cancel",
    "delivery_info",
    "payment_methods",
    "order_track",
    "complaint",
    "exchange_return",
    "business_hours",
    "location",
    "promotion",
    "handoff",
    "unknown",
  ];

  if (typeof value === "string" && allowed.includes(value as AgentIntent)) {
    return value as AgentIntent;
  }

  return fallback || "unknown";
}
