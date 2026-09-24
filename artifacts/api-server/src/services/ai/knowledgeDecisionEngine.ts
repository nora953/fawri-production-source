import {
  boundedText,
  detectKnowledgeLanguage,
  digestCustomerText,
} from "../knowledge/normalization.js";
import {
  inspectPromptInjection,
  KNOWLEDGE_SYSTEM_RULES,
} from "../knowledge/promptInjection.js";
import type { KnowledgeRepository } from "../knowledge/knowledgeRepository.js";
import { retrieveSemanticMatch } from "../knowledge/semanticRetriever.js";
import { PostgresOperationalFactResolver } from "../knowledge/postgresOperationalFactResolver.js";
import {
  isAuthoritativeFactQuestion,
  KnowledgeRuntimeGateError,
  PostgresKnowledgeRuntime,
  PostgresMerchantKnowledgePolicyResolver,
  type KnowledgeEmbeddingProvider,
  type MerchantKnowledgePolicyResolver,
} from "../knowledge/postgresKnowledgeRuntime.js";
import type {
  AiFallbackProvider,
  ApprovedKnowledgeTranslationProvider,
  ApprovedKnowledgeTranslationResult,
  KnowledgeAuditEvent,
  KnowledgeDecisionInput,
  KnowledgeDecisionResult,
  KnowledgeFactResolver,
  KnowledgeLanguage,
  KnowledgeConversationMessage,
  LearnedAnswerRecord,
  MerchantPolicyContext,
  SavedAnswerRecord,
  SemanticDocument,
  SemanticMatch,
  TrainingRequestRecord,
} from "../knowledge/types.js";

const DEFAULT_HANDOFF: Record<KnowledgeLanguage, string> = {
  ar: "أحتاج أحوّل سؤالك إلى موظف حتى تحصل على إجابة دقيقة.",
  ku: "پێویستە پرسیارەکەت بۆ کارمەندێک بنێرم بۆ وەڵامێکی ورد.",
  en: "I need to hand this question to a team member so you receive an accurate answer.",
};

const MAX_CONVERSATION_CONTEXT_MESSAGES = 8;

const CLARIFICATION_REASON_CODES = [
  "KNOWLEDGE_VARIANT_REQUIRED",
  "KNOWLEDGE_VARIANT_AMBIGUOUS",
  "KNOWLEDGE_PRODUCT_AMBIGUOUS",
  "KNOWLEDGE_LOCATION_CONTEXT_REQUIRED",
] as const;

type ClarificationReasonCode = (typeof CLARIFICATION_REASON_CODES)[number];

const CLARIFICATION_COPY: Record<
  ClarificationReasonCode,
  Record<KnowledgeLanguage, string>
> = {
  KNOWLEDGE_VARIANT_REQUIRED: {
    ar: "أي لون أو حجم أو خيار تقصد بالضبط؟",
    ku: "کام ڕەنگ، قەبارە یان هەڵبژاردە مەبەستتە؟",
    en: "Which color, size, or variant do you mean? Please specify the option.",
  },
  KNOWLEDGE_VARIANT_AMBIGUOUS: {
    ar: "أي لون أو حجم أو خيار تقصد بالضبط؟",
    ku: "کام ڕەنگ، قەبارە یان هەڵبژاردە مەبەستتە؟",
    en: "Which color, size, or variant do you mean? Please specify the option.",
  },
  KNOWLEDGE_PRODUCT_AMBIGUOUS: {
    ar: "أي منتج تقصد؟ اكتب اسم المنتج كاملًا أو الكود أو SKU.",
    ku: "کام بەرهەم مەبەستتە؟ تکایە ناوی تەواوی بەرهەم یان کۆد یان SKU بنووسە.",
    en: "Which product do you mean? Please provide the full product name, code, or SKU.",
  },
  KNOWLEDGE_LOCATION_CONTEXT_REQUIRED: {
    ar: "بأي منطقة أنت حتى أتحقق من توفره في الفرع المناسب؟",
    ku: "لە کام ناوچەیت تا بەردەستبوونی لە لقە گونجاوەکە بپشکنم؟",
    en: "Which area are you in so I can check availability at the appropriate location?",
  },
};

function clarificationReasonCode(value: unknown): ClarificationReasonCode | null {
  return (CLARIFICATION_REASON_CODES as readonly string[]).includes(String(value ?? ""))
    ? (String(value) as ClarificationReasonCode)
    : null;
}

function activeClarificationContext(
  history: KnowledgeConversationMessage[],
): { reasonCode: ClarificationReasonCode; previousCustomerText: string } | null {
  const latest = history.at(-1);
  const reasonCode =
    latest?.sender === "fawri"
      ? clarificationReasonCode(latest.reasonCode)
      : null;
  if (!reasonCode) return null;

  for (let index = history.length - 2; index >= 0; index -= 1) {
    const candidate = history[index];
    if (candidate.sender === "customer" && candidate.text) {
      return { reasonCode, previousCustomerText: candidate.text };
    }
  }
  return null;
}

function clarificationFactText(
  currentCustomerText: string,
  context: { reasonCode: ClarificationReasonCode; previousCustomerText: string } | null,
): string {
  if (!context || isAuthoritativeFactQuestion(currentCustomerText)) {
    return currentCustomerText;
  }
  const previous = boundedText(context.previousCustomerText, 900);
  const followUp = boundedText(currentCustomerText, 1_000);
  return boundedText(`${previous}\n${followUp}`, 2_000);
}

function boundedConversationHistory(
  value: KnowledgeConversationMessage[] | undefined,
): KnowledgeConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_CONVERSATION_CONTEXT_MESSAGES)
    .map((message) => {
      const sender =
        message?.sender === "customer" ||
        message?.sender === "fawri" ||
        message?.sender === "merchant"
          ? message.sender
          : null;
      const text = boundedText(message?.text, 2_000);
      const createdAt = boundedText(message?.createdAt, 80);
      if (!sender || !text || !createdAt) return null;
      const matchedRecordId = boundedText(message?.matchedRecordId, 200);
      const reasonCode = boundedText(message?.reasonCode, 100);
      return {
        sender,
        text,
        createdAt,
        ...(matchedRecordId ? { matchedRecordId } : {}),
        ...(reasonCode ? { reasonCode } : {}),
      };
    })
    .filter((message): message is KnowledgeConversationMessage => Boolean(message));
}

class NoopFactResolver implements KnowledgeFactResolver {
  async resolve(): Promise<null> {
    return null;
  }
}

class DisabledAiFallbackProvider implements AiFallbackProvider {
  readonly providerId = "disabled_ai_fallback_provider";

  async generate(): Promise<null> {
    return null;
  }
}

class DisabledApprovedKnowledgeTranslationProvider
  implements ApprovedKnowledgeTranslationProvider
{
  readonly providerId = "disabled_approved_translation_provider";
  readonly model = "disabled";

  async translate(): Promise<null> {
    return null;
  }
}

type Awaitable<T> = T | Promise<T>;

type TrainingRequestInput = {
  merchantId: string;
  customerText: string;
  detectedIntent?: string;
  detectedLanguage?: KnowledgeLanguage;
  reason: string;
  suggestedReply?: string | null;
  suggestedReplySource?: "merchant_draft" | "openai_generated" | null;
};

type GeneratedCandidateInput = {
  merchantId: string;
  customerText: string;
  language: KnowledgeLanguage;
  intent: string;
  answerText: string;
  confidence: number;
  reason: string;
};

export interface KnowledgeDecisionRuntime {
  readonly authorityId?: string;
  readonly legacyFallbackEnabled?: boolean;
  findApprovedSavedAnswer(params: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
  }): Awaitable<SavedAnswerRecord | null>;
  listApprovedSemanticDocuments(merchantId: string): Awaitable<SemanticDocument[]>;
  retrieveSemanticMatch?(params: {
    merchantId: string;
    query: string;
    language: KnowledgeLanguage;
    threshold?: number;
  }): Awaitable<SemanticMatch | null>;
  createTrainingRequest(input: TrainingRequestInput): Awaitable<TrainingRequestRecord>;
  recordGeneratedCandidate(
    input: GeneratedCandidateInput,
  ): Awaitable<{ trainingRequest: TrainingRequestRecord; learnedAnswer: LearnedAnswerRecord }>;
  appendAudit(
    event: Omit<KnowledgeAuditEvent, "id" | "createdAt">,
  ): Awaitable<unknown>;
}

export type KnowledgeDecisionEngineOptions = {
  /** Explicit JSON repository support exists only for historical isolated tests. */
  repository?: KnowledgeRepository;
  runtime?: KnowledgeDecisionRuntime;
  embeddingProvider?: KnowledgeEmbeddingProvider;
  factResolver?: KnowledgeFactResolver;
  policyResolver?: MerchantKnowledgePolicyResolver | null;
  aiProvider?: AiFallbackProvider;
  translationProvider?: ApprovedKnowledgeTranslationProvider;
  semanticThreshold?: number;
  minimumFactConfidence?: number;
  minimumAiConfidence?: number;
  allowGeneratedAutoReply?: boolean;
};

export class KnowledgeDecisionEngine {
  readonly engineId = "fawri_knowledge_decision_engine_v1";
  readonly authorityId: string;
  readonly legacyFallbackEnabled: boolean;
  readonly liveAiTransportEnabled: boolean;
  private readonly runtime: KnowledgeDecisionRuntime;
  private readonly factResolver: KnowledgeFactResolver;
  private readonly policyResolver: MerchantKnowledgePolicyResolver | null;
  private readonly aiProvider: AiFallbackProvider;
  private readonly translationProvider: ApprovedKnowledgeTranslationProvider;
  private readonly semanticThreshold: number;
  private readonly minimumFactConfidence: number;
  private readonly minimumAiConfidence: number;
  private readonly allowGeneratedAutoReply: boolean;
  private readonly useLegacyLexicalSemantic: boolean;

  constructor(options: KnowledgeDecisionEngineOptions = {}) {
    const explicitLegacyRepository = Boolean(options.repository && !options.runtime);
    this.runtime =
      options.runtime ||
      options.repository ||
      new PostgresKnowledgeRuntime({ embeddingProvider: options.embeddingProvider });
    this.factResolver =
      options.factResolver ||
      (explicitLegacyRepository
        ? new NoopFactResolver()
        : new PostgresOperationalFactResolver());
    this.policyResolver =
      options.policyResolver === undefined
        ? explicitLegacyRepository
          ? null
          : new PostgresMerchantKnowledgePolicyResolver()
        : options.policyResolver;
    this.aiProvider = options.aiProvider || new DisabledAiFallbackProvider();
    this.translationProvider =
      options.translationProvider || new DisabledApprovedKnowledgeTranslationProvider();
    this.semanticThreshold = options.semanticThreshold ?? 0.58;
    this.minimumFactConfidence = options.minimumFactConfidence ?? 0.9;
    this.minimumAiConfidence = options.minimumAiConfidence ?? 0.82;
    // Generated auto reply cannot be activated by environment or browser input.
    this.allowGeneratedAutoReply = options.allowGeneratedAutoReply === true;
    this.useLegacyLexicalSemantic = explicitLegacyRepository;
    this.authorityId =
      this.runtime.authorityId ||
      (explicitLegacyRepository ? "isolated_test_repository" : "unknown_runtime");
    this.legacyFallbackEnabled =
      this.runtime.legacyFallbackEnabled === true || explicitLegacyRepository;
    this.liveAiTransportEnabled =
      this.translationProvider.providerId !== "disabled_approved_translation_provider" ||
      this.aiProvider.providerId !== "disabled_ai_fallback_provider";
  }

  private async translatedApprovedAnswer(params: {
    merchantId: string;
    recordId: string;
    sourceLanguage: KnowledgeLanguage;
    targetLanguage: KnowledgeLanguage;
    sourceText: string;
  }): Promise<ApprovedKnowledgeTranslationResult | null> {
    const sourceText = boundedText(params.sourceText, 2_000);
    if (!sourceText) return null;
    if (params.sourceLanguage === params.targetLanguage) {
      return {
        answerText: sourceText,
        language: params.targetLanguage,
        faithful: true,
      };
    }
    const translated = await this.translationProvider.translate({
      merchantId: params.merchantId,
      recordId: boundedText(params.recordId, 200),
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      sourceText,
    });
    if (
      !translated ||
      translated.faithful !== true ||
      translated.language !== params.targetLanguage ||
      !boundedText(translated.answerText, 2_000)
    ) return null;
    return { ...translated, answerText: boundedText(translated.answerText, 2_000) };
  }

  private handoffText(
    language: KnowledgeLanguage,
    policy: MerchantPolicyContext,
  ): string {
    return boundedText(policy.handoffMessage?.[language], 500) || DEFAULT_HANDOFF[language];
  }

  private clarificationResult(
    language: KnowledgeLanguage,
    reasonCode: ClarificationReasonCode,
  ): KnowledgeDecisionResult {
    return {
      action: "reply",
      stage: "clarification",
      answerText: CLARIFICATION_COPY[reasonCode][language],
      language,
      source: null,
      confidence: 1,
      requiresMerchantApproval: false,
      trainingRequestId: null,
      matchedRecordId: null,
      reasonCode,
      injectionSignals: [],
    };
  }

  private async recordDecisionAudit(params: {
    input: KnowledgeDecisionInput;
    result: KnowledgeDecisionResult;
  }): Promise<void> {
    await this.runtime.appendAudit({
      merchantId: params.input.merchantId,
      action: "knowledge_decision",
      entityType: "decision",
      entityId: params.input.requestId || null,
      actor: "system",
      outcome:
        params.result.action === "reply"
          ? "success"
          : params.result.action === "handoff"
            ? "handoff"
            : "rejected",
      customerTextHash: digestCustomerText(params.input.customerText),
      customerTextLength: params.input.customerText.length,
      injectionSignals: params.result.injectionSignals,
      metadata: {
        engineId: this.engineId,
        stage: params.result.stage,
        source: params.result.source,
        confidence: params.result.confidence,
        reasonCode: params.result.reasonCode,
        requiresMerchantApproval: params.result.requiresMerchantApproval,
        conversationContextMessages: Math.min(
          Array.isArray(params.input.recentMessages) ? params.input.recentMessages.length : 0,
          MAX_CONVERSATION_CONTEXT_MESSAGES,
        ),
      },
    });
  }

  private handoffResult(params: {
    language: KnowledgeLanguage;
    policy: MerchantPolicyContext;
    reasonCode: string;
    trainingRequestId?: string | null;
    confidence?: number;
    injectionSignals?: string[];
  }): KnowledgeDecisionResult {
    return {
      action: "handoff",
      stage: "handoff",
      answerText: this.handoffText(params.language, params.policy),
      language: params.language,
      source: null,
      confidence: params.confidence ?? 0,
      requiresMerchantApproval: false,
      trainingRequestId: params.trainingRequestId ?? null,
      matchedRecordId: null,
      reasonCode: params.reasonCode,
      injectionSignals: params.injectionSignals || [],
    };
  }

  async decide(input: KnowledgeDecisionInput): Promise<KnowledgeDecisionResult> {
    const merchantId = boundedText(input.merchantId, 120);
    const customerText = boundedText(input.customerText, 2_000);
    const language = input.languageHint || detectKnowledgeLanguage(customerText);
    const conversationHistory = boundedConversationHistory(input.recentMessages);
    const clarificationContext = activeClarificationContext(conversationHistory);
    const factCustomerText = clarificationFactText(customerText, clarificationContext);
    const usingClarificationContext =
      Boolean(clarificationContext) && factCustomerText !== customerText;
    let merchantPolicy = input.merchantPolicy || {};

    if (!merchantId || !customerText) {
      const result: KnowledgeDecisionResult = {
        action: "no_answer",
        stage: "handoff",
        answerText: null,
        language,
        source: null,
        confidence: 0,
        requiresMerchantApproval: false,
        trainingRequestId: null,
        matchedRecordId: null,
        reasonCode: "INVALID_DECISION_INPUT",
        injectionSignals: [],
      };
      if (merchantId) {
        await this.recordDecisionAudit({
          input: { ...input, merchantId, customerText },
          result,
        });
      }
      return result;
    }

    // Production merchant policy comes only from the server-side PostgreSQL resolver.
    // Browser policy input cannot relax this policy because the production singleton
    // always has a resolver and overwrites input.merchantPolicy here.
    if (this.policyResolver) {
      const policyResolution = await this.policyResolver.resolve(merchantId);
      if (policyResolution.merchantId !== merchantId) {
        throw new KnowledgeRuntimeGateError(
          "KNOWLEDGE_TENANT_VIOLATION",
          "knowledge tenant boundary violation",
        );
      }
      merchantPolicy = policyResolution.policy;
      if (!policyResolution.allowKnowledgeUse) {
        const result = this.handoffResult({
          language,
          policy: merchantPolicy,
          reasonCode: "MERCHANT_AUTO_REPLY_DISABLED",
          confidence: 1,
        });
        await this.recordDecisionAudit({
          input: { ...input, merchantId, customerText },
          result,
        });
        return result;
      }
    }

    const injection = inspectPromptInjection(customerText);
    if (injection.suspicious) {
      const training = await this.runtime.createTrainingRequest({
        merchantId,
        customerText,
        detectedLanguage: language,
        detectedIntent: "prompt_injection",
        reason: "prompt_injection_detected",
      });
      const result = this.handoffResult({
        language,
        policy: merchantPolicy,
        reasonCode: "PROMPT_INJECTION_BLOCKED",
        trainingRequestId: training.id,
        confidence: 1,
        injectionSignals: injection.signals,
      });
      await this.recordDecisionAudit({
        input: { ...input, merchantId, customerText },
        result,
      });
      return result;
    }

    let fact;
    try {
      fact = await this.factResolver.resolve({
        merchantId,
        customerText: factCustomerText,
        language,
        conversationId: boundedText(input.conversationId, 160) || undefined,
        customerExternalId: boundedText(input.customerExternalId, 200) || undefined,
      });
    } catch (error) {
      const reasonCode =
        error instanceof KnowledgeRuntimeGateError
          ? clarificationReasonCode(error.code)
          : null;
      if (!reasonCode) throw error;

      const result = this.clarificationResult(language, reasonCode);
      await this.recordDecisionAudit({
        input: { ...input, merchantId, customerText },
        result,
      });
      return result;
    }
    if (fact && fact.confidence >= this.minimumFactConfidence && fact.answerText.trim()) {
      const result: KnowledgeDecisionResult = {
        action: "reply",
        stage: "database_fact",
        answerText: boundedText(fact.answerText, 2_000),
        language: fact.language,
        source: "database_fact",
        confidence: fact.confidence,
        requiresMerchantApproval: false,
        trainingRequestId: null,
        matchedRecordId: fact.recordId || null,
        reasonCode: `DATABASE_FACT_${fact.factType.toUpperCase()}`,
        injectionSignals: [],
      };
      await this.recordDecisionAudit({
        input: { ...input, merchantId, customerText },
        result,
      });
      return result;
    }

    if (usingClarificationContext && clarificationContext) {
      const result = this.clarificationResult(language, clarificationContext.reasonCode);
      await this.recordDecisionAudit({
        input: { ...input, merchantId, customerText },
        result,
      });
      return result;
    }

    // Current operational facts must never fall through to generated or stale
    // knowledge in production. Explicit JSON repositories exist only for old
    // isolated tests and do not participate in the production singleton.
    if (!this.useLegacyLexicalSemantic && isAuthoritativeFactQuestion(customerText)) {
      const training = await this.runtime.createTrainingRequest({
        merchantId,
        customerText,
        detectedLanguage: language,
        detectedIntent: "authoritative_fact_unavailable",
        reason: "authoritative_fact_unavailable",
      });
      const result = this.handoffResult({
        language,
        policy: merchantPolicy,
        reasonCode: "AUTHORITATIVE_FACT_UNAVAILABLE",
        trainingRequestId: training.id,
      });
      await this.recordDecisionAudit({
        input: { ...input, merchantId, customerText },
        result,
      });
      return result;
    }

    const savedAnswer = await this.runtime.findApprovedSavedAnswer({
      merchantId,
      customerText,
      language,
    });
    if (savedAnswer) {
      const translated = await this.translatedApprovedAnswer({
        merchantId,
        recordId: savedAnswer.id,
        sourceLanguage: savedAnswer.language,
        targetLanguage: language,
        sourceText: savedAnswer.answerText,
      });
      if (!translated) {
        const result = this.handoffResult({
          language,
          policy: merchantPolicy,
          reasonCode: "APPROVED_TRANSLATION_UNAVAILABLE",
          confidence: 1,
        });
        await this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
        return result;
      }
      const translatedAcrossLanguages = savedAnswer.language !== language;
      const result: KnowledgeDecisionResult = {
        action: "reply",
        stage: "approved_saved_answer",
        answerText: translated.answerText,
        language,
        source: "merchant_approved",
        confidence: 1,
        requiresMerchantApproval: false,
        trainingRequestId: null,
        matchedRecordId: savedAnswer.id,
        reasonCode: translatedAcrossLanguages
          ? "MERCHANT_APPROVED_TRANSLATED_SAVED_ANSWER"
          : "MERCHANT_APPROVED_SAVED_ANSWER",
        injectionSignals: [],
        ...(translated.usage ? { aiUsage: translated.usage } : {}),
        ...(translated.latencyMs !== undefined ? { aiLatencyMs: translated.latencyMs } : {}),
        ...(translatedAcrossLanguages
          ? { aiProviderId: this.translationProvider.providerId, aiModel: this.translationProvider.model }
          : {}),
      };
      await this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
      return result;
    }

    let approvedDocuments: SemanticDocument[] | null = null;
    let semantic: SemanticMatch | null = null;
    if (this.runtime.retrieveSemanticMatch && !this.useLegacyLexicalSemantic) {
      semantic = await this.runtime.retrieveSemanticMatch({
        merchantId,
        query: customerText,
        language,
        threshold: this.semanticThreshold,
      });
    } else {
      // Kept only for explicit historical repository tests. The production singleton
      // cannot reach this lexical/JSON path.
      approvedDocuments = await this.runtime.listApprovedSemanticDocuments(merchantId);
      semantic = retrieveSemanticMatch({
        merchantId,
        query: customerText,
        language,
        documents: approvedDocuments,
        threshold: this.semanticThreshold,
      });
    }

    if (semantic) {
      const translated = await this.translatedApprovedAnswer({
        merchantId,
        recordId: semantic.document.id,
        sourceLanguage: semantic.document.language,
        targetLanguage: language,
        sourceText: semantic.document.answer,
      });
      if (!translated) {
        const result = this.handoffResult({
          language,
          policy: merchantPolicy,
          reasonCode: "APPROVED_TRANSLATION_UNAVAILABLE",
          confidence: semantic.score,
        });
        await this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
        return result;
      }
      const translatedAcrossLanguages = semantic.document.language !== language;
      const result: KnowledgeDecisionResult = {
        action: "reply",
        stage: "semantic_retrieval",
        answerText: translated.answerText,
        language,
        source: "merchant_approved",
        confidence: semantic.score,
        requiresMerchantApproval: false,
        trainingRequestId: null,
        matchedRecordId: semantic.document.id,
        reasonCode: translatedAcrossLanguages
          ? "MERCHANT_APPROVED_TRANSLATED_SEMANTIC_MATCH"
          : "MERCHANT_APPROVED_SEMANTIC_MATCH",
        injectionSignals: [],
        ...(translated.usage ? { aiUsage: translated.usage } : {}),
        ...(translated.latencyMs !== undefined ? { aiLatencyMs: translated.latencyMs } : {}),
        ...(translatedAcrossLanguages
          ? { aiProviderId: this.translationProvider.providerId, aiModel: this.translationProvider.model }
          : {}),
      };
      await this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
      return result;
    }

    if (!approvedDocuments) {
      approvedDocuments = await this.runtime.listApprovedSemanticDocuments(merchantId);
    }
    const uniqueApprovedKnowledge = Array.from(
      new Map(
        approvedDocuments.map((document) => [
          document.id,
          {
            id: document.id,
            question: document.question,
            answer: document.answer,
            language: document.language,
          },
        ]),
      ).values(),
    );

    const aiCandidate = await this.aiProvider.generate({
      merchantId,
      language,
      systemRules: KNOWLEDGE_SYSTEM_RULES,
      merchantPolicy,
      approvedKnowledge: uniqueApprovedKnowledge,
      customerText,
      conversationHistory,
      injectionSignals: [],
    });

    if (aiCandidate?.canAnswer && aiCandidate.answerText) {
      const recorded = await this.runtime.recordGeneratedCandidate({
        merchantId,
        customerText,
        language: aiCandidate.language,
        intent: "ai_fallback",
        answerText: aiCandidate.answerText,
        confidence: aiCandidate.confidence,
        reason: aiCandidate.reason,
      });

      const policyAllowsGenerated =
        merchantPolicy.allowGeneratedAutoReply === true && this.allowGeneratedAutoReply;
      const eligibleForReply =
        policyAllowsGenerated &&
        aiCandidate.risk === "low" &&
        aiCandidate.confidence >= this.minimumAiConfidence;

      const result: KnowledgeDecisionResult = eligibleForReply
        ? {
            action: "reply",
            stage: "ai_fallback",
            answerText: aiCandidate.answerText,
            language: aiCandidate.language,
            source: "openai_generated",
            confidence: aiCandidate.confidence,
            requiresMerchantApproval: true,
            trainingRequestId: recorded.trainingRequest.id,
            matchedRecordId: recorded.learnedAnswer.id,
            reasonCode: "CONSTRAINED_AI_LOW_RISK_REPLY_PENDING_APPROVAL",
            injectionSignals: [],
          }
        : {
            action: "handoff",
            stage: "ai_fallback",
            answerText: this.handoffText(language, merchantPolicy),
            language,
            source: "openai_generated",
            confidence: aiCandidate.confidence,
            requiresMerchantApproval: true,
            trainingRequestId: recorded.trainingRequest.id,
            matchedRecordId: recorded.learnedAnswer.id,
            reasonCode: "AI_CANDIDATE_REQUIRES_MERCHANT_APPROVAL",
            injectionSignals: [],
          };
      await this.recordDecisionAudit({
        input: { ...input, merchantId, customerText },
        result,
      });
      return result;
    }

    const training = await this.runtime.createTrainingRequest({
      merchantId,
      customerText,
      detectedLanguage: language,
      detectedIntent: "knowledge_gap",
      reason: "no_trusted_answer",
    });
    const result = this.handoffResult({
      language,
      policy: merchantPolicy,
      reasonCode: "NO_TRUSTED_ANSWER",
      trainingRequestId: training.id,
    });
    await this.recordDecisionAudit({
      input: { ...input, merchantId, customerText },
      result,
    });
    return result;
  }
}

export type KnowledgeEmbeddingActivationReadiness = {
  ready: boolean;
  providerId: string | null;
  model: string | null;
  dimensions: number | null;
  reasonCode: "KNOWLEDGE_VECTOR_UNAVAILABLE" | "KNOWLEDGE_VECTOR_CONFIG_INVALID" | null;
};

let singleton: KnowledgeDecisionEngine | null = null;
let configuredEmbeddingProvider: KnowledgeEmbeddingProvider | null = null;
let configuredTranslationProvider: ApprovedKnowledgeTranslationProvider | null = null;
let configuredAiProvider: AiFallbackProvider | null = null;

function inspectEmbeddingProvider(
  provider: KnowledgeEmbeddingProvider | null,
): KnowledgeEmbeddingActivationReadiness {
  if (!provider) {
    return {
      ready: false,
      providerId: null,
      model: null,
      dimensions: null,
      reasonCode: "KNOWLEDGE_VECTOR_UNAVAILABLE",
    };
  }

  const providerId = String(provider.providerId ?? "").trim();
  const model = String(provider.model ?? "").trim();
  const dimensions = Number(provider.dimensions);
  const valid =
    providerId.length > 0 &&
    providerId.length <= 160 &&
    model.length > 0 &&
    model.length <= 160 &&
    model !== "disabled" &&
    Number.isInteger(dimensions) &&
    dimensions >= 1 &&
    dimensions <= 4_096 &&
    typeof provider.embed === "function";

  return {
    ready: valid,
    providerId: providerId || null,
    model: model || null,
    dimensions: Number.isFinite(dimensions) ? dimensions : null,
    reasonCode: valid ? null : "KNOWLEDGE_VECTOR_CONFIG_INVALID",
  };
}

export type KnowledgeAiActivationReadiness = {
  ready: boolean;
  providerId: string | null;
  model: string | null;
  reasonCode: "KNOWLEDGE_AI_UNAVAILABLE" | "KNOWLEDGE_AI_CONFIG_INVALID" | null;
};

function inspectAiProvider(
  provider: AiFallbackProvider | null,
): KnowledgeAiActivationReadiness {
  if (!provider) {
    return {
      ready: false,
      providerId: null,
      model: null,
      reasonCode: "KNOWLEDGE_AI_UNAVAILABLE",
    };
  }
  const providerId = String(provider.providerId ?? "").trim();
  const model = String((provider as { model?: unknown }).model ?? "").trim();
  const valid =
    providerId.length > 0 &&
    providerId.length <= 160 &&
    model.length > 0 &&
    model.length <= 160 &&
    model !== "disabled" &&
    typeof provider.generate === "function";
  return {
    ready: valid,
    providerId: providerId || null,
    model: model || null,
    reasonCode: valid ? null : "KNOWLEDGE_AI_CONFIG_INVALID",
  };
}

export type KnowledgeTranslationActivationReadiness = {
  ready: boolean;
  providerId: string | null;
  model: string | null;
  reasonCode:
    | "KNOWLEDGE_TRANSLATION_UNAVAILABLE"
    | "KNOWLEDGE_TRANSLATION_CONFIG_INVALID"
    | null;
};

function inspectTranslationProvider(
  provider: ApprovedKnowledgeTranslationProvider | null,
): KnowledgeTranslationActivationReadiness {
  if (!provider) {
    return { ready: false, providerId: null, model: null, reasonCode: "KNOWLEDGE_TRANSLATION_UNAVAILABLE" };
  }
  const providerId = String(provider.providerId ?? "").trim();
  const model = String(provider.model ?? "").trim();
  const valid =
    providerId.length > 0 && providerId.length <= 160 &&
    model.length > 0 && model.length <= 160 && model !== "disabled" &&
    typeof provider.translate === "function";
  return {
    ready: valid,
    providerId: providerId || null,
    model: model || null,
    reasonCode: valid ? null : "KNOWLEDGE_TRANSLATION_CONFIG_INVALID",
  };
}

export function getKnowledgeEmbeddingActivationReadiness(): KnowledgeEmbeddingActivationReadiness {
  return inspectEmbeddingProvider(configuredEmbeddingProvider);
}

export function getKnowledgeAiActivationReadiness(): KnowledgeAiActivationReadiness {
  return inspectAiProvider(configuredAiProvider);
}

export function getKnowledgeTranslationActivationReadiness(): KnowledgeTranslationActivationReadiness {
  return inspectTranslationProvider(configuredTranslationProvider);
}

export function configureKnowledgeEmbeddingProvider(
  provider: KnowledgeEmbeddingProvider,
): void {
  if (singleton || configuredEmbeddingProvider) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_VECTOR_ACTIVATION_LOCKED",
      "knowledge vector provider activation is locked for this process",
      409,
    );
  }

  const readiness = inspectEmbeddingProvider(provider);
  if (!readiness.ready) {
    throw new KnowledgeRuntimeGateError(
      readiness.reasonCode || "KNOWLEDGE_VECTOR_CONFIG_INVALID",
      "knowledge vector provider configuration is invalid",
    );
  }
  configuredEmbeddingProvider = provider;
}

export function configureKnowledgeAiProvider(
  provider: AiFallbackProvider,
): void {
  if (singleton || configuredAiProvider) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_AI_ACTIVATION_LOCKED",
      "knowledge AI provider activation is locked for this process",
      409,
    );
  }
  const readiness = inspectAiProvider(provider);
  if (!readiness.ready) {
    throw new KnowledgeRuntimeGateError(
      readiness.reasonCode || "KNOWLEDGE_AI_CONFIG_INVALID",
      "knowledge AI provider configuration is invalid",
    );
  }
  configuredAiProvider = provider;
}

export function configureKnowledgeTranslationProvider(
  provider: ApprovedKnowledgeTranslationProvider,
): void {
  if (singleton || configuredTranslationProvider) {
    throw new KnowledgeRuntimeGateError(
      "KNOWLEDGE_TRANSLATION_ACTIVATION_LOCKED",
      "knowledge translation provider activation is locked for this process",
      409,
    );
  }
  const readiness = inspectTranslationProvider(provider);
  if (!readiness.ready) {
    throw new KnowledgeRuntimeGateError(
      readiness.reasonCode || "KNOWLEDGE_TRANSLATION_CONFIG_INVALID",
      "knowledge translation provider configuration is invalid",
    );
  }
  configuredTranslationProvider = provider;
}

export function getKnowledgeDecisionEngine(): KnowledgeDecisionEngine {
  if (!singleton) {
    singleton = new KnowledgeDecisionEngine({
      embeddingProvider: configuredEmbeddingProvider || undefined,
      translationProvider: configuredTranslationProvider || undefined,
      aiProvider: configuredAiProvider || undefined,
    });
  }
  return singleton;
}

export function resetKnowledgeDecisionEngineForTests(): void {
  singleton = null;
  configuredEmbeddingProvider = null;
  configuredTranslationProvider = null;
  configuredAiProvider = null;
}
