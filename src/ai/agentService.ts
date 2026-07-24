import {
  AgentIntent,
  AgentReplyResult,
  ConversationState,
  IncomingCustomerMessage,
  OrderDraft,
} from "./agentTypes";
import {
  getConversationLockKey,
  withConversationLock,
} from "./conversationLocks";
import {
  getConversationState,
  updateConversationAfterReply,
  wasMessageProcessed,
  markMessageProcessed,
} from "./conversationStateStore";
import { detectLocalIntent, isHighRiskIntent } from "./localIntentEngine";
import { findBestLearnedAnswer } from "./learnedAnswersStore";
import { tryLocalReply } from "./localResponder";
import { askOpenAiFallback } from "./openAiFallback";
import {
  findProductByMessage,
  getMerchantProducts,
  getStorePolicy,
} from "./catalogProvider";
import { createTrainingRequest } from "./trainingRequestsStore";
import { normalizeText } from "./textUtils";

type ProductStatePatch = {
  activeProductId?: string | null;
  activeProductName?: string | null;
  orderDraftPatch?: OrderDraft | null;
};

export async function handleIncomingCustomerMessage(
  incoming: IncomingCustomerMessage,
): Promise<AgentReplyResult> {
  const lockKey = getConversationLockKey({
    merchantId: incoming.merchantId,
    customerId: incoming.customerId,
  });

  return withConversationLock(lockKey, async () => {
    return handleIncomingCustomerMessageUnsafe(incoming);
  });
}

async function handleIncomingCustomerMessageUnsafe(
  incoming: IncomingCustomerMessage,
): Promise<AgentReplyResult> {
  const state = await getConversationState(incoming);

  if (wasMessageProcessed(state, incoming.messageId)) {
    return {
      reply: "",
      shouldSend: false,

      usedOpenAI: false,
      usedLocalKnowledge: true,
      createdTrainingRequest: false,

      intent: state.lastIntent ?? "unknown",
      language: state.lastLanguage ?? "unknown",

      confidence: 1,

      shouldHandoff: false,
      internalNote: "duplicate_message_ignored",
    };
  }

  const customerMessage = extractTextFromIncomingMessage(incoming);

  if (!customerMessage) {
    const reply =
      incoming.kind === "audio"
        ? "وصلتني رسالة صوتية، لكن حالياً أحتاج أحولها لنص حتى أقدر أساعدك بدقة."
        : incoming.kind === "image"
          ? "وصلتني الصورة. ممكن تكتبلي شنو تحتاج بخصوصها حتى أساعدك بشكل أدق؟"
          : "وصلتني رسالتك، ممكن توضحلي شنو تحتاج بالضبط؟";

    await markMessageProcessed({
      state,
      messageId: incoming.messageId,
    });

    return {
      reply,
      shouldSend: true,

      usedOpenAI: false,
      usedLocalKnowledge: true,
      createdTrainingRequest: false,

      intent: "unknown",
      language: "unknown",

      confidence: 0.5,

      shouldHandoff: false,
      internalNote: "empty_or_media_without_text",
    };
  }

  const intentResult = detectLocalIntent(customerMessage);

  /*
    المرحلة 1:
    المواضيع الحساسة لا نسمح لها تتعلم أو ترد بشكل حر.
    الشكوى، الاسترجاع، التحويل لموظف = تعامل آمن.
  */
  if (isHighRiskIntent(intentResult.intent)) {
    const localHighRiskReply = await tryLocalReply({
      merchantId: incoming.merchantId,
      customerMessage,
      intentResult,
      state,
    });

    if (localHighRiskReply) {
      await persistReplyState({
        incoming,
        state,
        customerMessage,
        result: localHighRiskReply,
      });

      return localHighRiskReply;
    }
  }

  /*
    المرحلة 2:
    نبحث أولاً في الردود المتعلمة والمعتمدة.
    هذه تأتي من:
    - رد التاجر المثالي
    - رد OpenAI بعد موافقة التاجر
  */
  const learnedMatch = await findBestLearnedAnswer({
    merchantId: incoming.merchantId,
    message: customerMessage,
    language: intentResult.language,
    intent: intentResult.intent === "unknown" ? undefined : intentResult.intent,
    minScore: 0.68,
  });

  if (learnedMatch.answer) {
    const result: AgentReplyResult = {
      reply: learnedMatch.answer.reply,
      shouldSend: true,

      usedOpenAI: false,
      usedLocalKnowledge: true,
      createdTrainingRequest: false,

      intent: learnedMatch.answer.intent,
      language: learnedMatch.answer.language,

      confidence: Math.min(0.99, learnedMatch.score),

      shouldHandoff: learnedMatch.answer.intent === "handoff",
      internalNote: `learned_answer:${learnedMatch.answer.id}`,
    };

    await persistReplyState({
      incoming,
      state,
      customerMessage,
      result,
    });

    return result;
  }

  /*
    المرحلة 3:
    نحاول الرد المحلي من المنتجات والسياسات.
    هذا يشمل السعر، التوفر، التوصيل، الدفع، الطلب، التحية...
  */
  const localReply = await tryLocalReply({
    merchantId: incoming.merchantId,
    customerMessage,
    intentResult,
    state,
  });

  if (localReply && localReply.confidence >= 0.55) {
    await persistReplyState({
      incoming,
      state,
      customerMessage,
      result: localReply,
    });

    return localReply;
  }

  /*
    المرحلة 4:
    إذا لم نجد رد محلي قوي، نستخدم OpenAI كاحتياط فقط.
    الرد المقترح من OpenAI لا يصبح معرفة دائمة إلا بعد مراجعته.
  */
  const [products, policy] = await Promise.all([
    getMerchantProducts(incoming.merchantId),
    getStorePolicy(incoming.merchantId),
  ]);

  const openAiReply = await askOpenAiFallback({
    customerMessage,
    merchantId: incoming.merchantId,
    intent: intentResult.intent,
    language: intentResult.language,
    state,
    products,
    policy,
  });

  if (openAiReply && openAiReply.reply) {
    /*
      حماية مهمة:
      إذا كانت نية الرسالة unknown، لا نرسل رد OpenAI كما هو للعميل.
      نحفظ اقتراح OpenAI للمراجعة فقط، والعميل يستلم رد آمن.
    */
    if (intentResult.intent === "unknown") {
      await createTrainingRequest({
        merchantId: incoming.merchantId,
        customerId: incoming.customerId,
        customerMessage,
        detectedIntent: intentResult.intent,
        detectedLanguage: intentResult.language,
        reason: "openai_suggested_reply_for_unknown_intent_needs_review",
        suggestedReply: openAiReply.reply,
      });

      const safeReply =
        "حتى ما أعطيك معلومة غلط، راح أتأكد من الفريق وأرجعلك بجواب أدق.";

      const result: AgentReplyResult = {
        reply: safeReply,
        shouldSend: true,

        usedOpenAI: true,
        usedLocalKnowledge: false,
        createdTrainingRequest: true,

        intent: intentResult.intent,
        language: intentResult.language,

        confidence: 0.5,

        shouldHandoff: true,
        internalNote: "unknown_intent_openai_saved_for_review_only",
      };

      await persistReplyState({
        incoming,
        state,
        customerMessage,
        result,
      });

      return result;
    }

    const shouldCreateReviewRequest =
      !openAiReply.shouldHandoff &&
      openAiReply.confidence >= 0.55 &&
      !containsCommercialClaimWithoutSource(openAiReply.reply);

    let createdTrainingRequest = false;

    if (shouldCreateReviewRequest) {
      await createTrainingRequest({
        merchantId: incoming.merchantId,
        customerId: incoming.customerId,
        customerMessage,
        detectedIntent: openAiReply.intent,
        detectedLanguage: openAiReply.language,
        reason: "openai_suggested_reply_needs_merchant_review_before_reuse",
        suggestedReply: openAiReply.reply,
      });

      createdTrainingRequest = true;
    }

    const result: AgentReplyResult = {
      ...openAiReply,
      createdTrainingRequest,
    };

    await persistReplyState({
      incoming,
      state,
      customerMessage,
      result,
    });

    return result;
  }

  /*
    المرحلة 5:
    إذا لم يعرف النظام، لا يخترع.
    يسجل Training Request حتى التاجر يضيف الرد المثالي.
  */
  const trainingRequest = await createTrainingRequest({
    merchantId: incoming.merchantId,
    customerId: incoming.customerId,
    customerMessage,
    detectedIntent: intentResult.intent,
    detectedLanguage: intentResult.language,
    reason: `no_safe_answer_found:${intentResult.reason}`,
    suggestedReply: null,
  });

  const fallbackReply =
    "حتى ما أعطيك معلومة غلط، راح أتأكد من الفريق وأرجعلك بجواب أدق.";

  const result: AgentReplyResult = {
    reply: fallbackReply,
    shouldSend: true,

    usedOpenAI: false,
    usedLocalKnowledge: false,
    createdTrainingRequest: true,

    intent: intentResult.intent,
    language: intentResult.language,

    confidence: Math.max(0.25, intentResult.confidence),

    shouldHandoff: true,
    internalNote: `training_request_created:${trainingRequest.id}`,
  };

  await persistReplyState({
    incoming,
    state,
    customerMessage,
    result,
  });

  return result;
}

async function persistReplyState(input: {
  incoming: IncomingCustomerMessage;
  state: ConversationState;
  customerMessage: string;
  result: AgentReplyResult;
}): Promise<void> {
  const productPatch = await resolveProductStatePatch({
    merchantId: input.incoming.merchantId,
    state: input.state,
    customerMessage: input.customerMessage,
    intent: input.result.intent,
  });

  await updateConversationAfterReply({
    state: input.state,
    customerMessage: input.customerMessage,
    agentReply: input.result.reply,
    intent: input.result.intent,
    language: input.result.language,
    messageId: input.incoming.messageId,
    ...productPatch,
  });
}

async function resolveProductStatePatch(input: {
  merchantId: string;
  state: ConversationState;
  customerMessage: string;
  intent: AgentIntent;
}): Promise<ProductStatePatch> {
  if (!shouldTrackProductForIntent(input.intent)) {
    return {};
  }

  const productMatch = await findProductByMessage({
    merchantId: input.merchantId,
    message: input.customerMessage,
    preferLastMention: input.intent === "product_switch",
    excludeProductIds:
      input.intent === "product_switch" && input.state.activeProductId
        ? [input.state.activeProductId]
        : [],
  });

  /*
    إذا العميل غيّر المنتج ولم نعرف المنتج الجديد،
    reducer سيترك المنتج السابق ويمسح السياق.
  */
  if (!productMatch.product) {
    if (input.intent === "product_switch") {
      return {
        activeProductId: null,
        activeProductName: null,
        orderDraftPatch: null,
      };
    }

    return {};
  }

  const product = productMatch.product;

  if (input.intent === "order_create" || input.intent === "order_update") {
    return {
      activeProductId: product.id,
      activeProductName: product.name,
      orderDraftPatch: {
        productId: product.id,
        productName: product.name,
      },
    };
  }

  return {
    activeProductId: product.id,
    activeProductName: product.name,
  };
}

function shouldTrackProductForIntent(intent: AgentIntent): boolean {
  return (
    intent === "price_ask" ||
    intent === "availability_ask" ||
    intent === "product_details" ||
    intent === "product_switch" ||
    intent === "order_create" ||
    intent === "order_update"
  );
}

function extractTextFromIncomingMessage(
  incoming: IncomingCustomerMessage,
): string {
  if (incoming.text && incoming.text.trim()) {
    return incoming.text.trim();
  }

  /*
    لاحقاً سنربط هنا:
    - تحويل الصوت إلى نص
    - وصف الصورة أو ربطها بالمنتجات
  */
  return "";
}

function containsCommercialClaimWithoutSource(reply: string): boolean {
  const text = normalizeText(reply);

  const riskyPatterns = [
    "متوفر",
    "غير متوفر",
    "سعره",
    "السعر",
    "يوصل اليوم",
    "يوصل باجر",
    "استرجاع مبلغ",
    "خصم",
    "مجاني",
  ];

  /*
    هذا فلتر احتياطي:
    إذا OpenAI أعطى كلام تجاري حساس، لا نحفظه تلقائياً.
    ممكن يرسل للعميل كصياغة آمنة، لكن لا يصبح قاعدة معرفة إلا بعد مراجعة التاجر.
  */
  return riskyPatterns.some((pattern) => {
    return text.includes(normalizeText(pattern));
  });
}
