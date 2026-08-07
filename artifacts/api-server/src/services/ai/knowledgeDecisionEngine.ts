import { ConstrainedOpenAiProvider } from "./constrainedOpenAiProvider.js";
import {
  boundedText,
  detectKnowledgeLanguage,
  digestCustomerText,
} from "../knowledge/normalization.js";
import {
  inspectPromptInjection,
  KNOWLEDGE_SYSTEM_RULES,
} from "../knowledge/promptInjection.js";
import { getKnowledgeRepository, type KnowledgeRepository } from "../knowledge/knowledgeRepository.js";
import { retrieveSemanticMatch } from "../knowledge/semanticRetriever.js";
import type {
  AiFallbackProvider,
  KnowledgeDecisionInput,
  KnowledgeDecisionResult,
  KnowledgeFactResolver,
  KnowledgeLanguage,
  MerchantPolicyContext,
} from "../knowledge/types.js";

const DEFAULT_HANDOFF: Record<KnowledgeLanguage, string> = {
  ar: "أحتاج أحوّل سؤالك إلى موظف حتى تحصل على إجابة دقيقة.",
  ku: "پێویستە پرسیارەکەت بۆ کارمەندێک بنێرم بۆ وەڵامێکی ورد.",
  en: "I need to hand this question to a team member so you receive an accurate answer.",
};

class NoopFactResolver implements KnowledgeFactResolver {
  async resolve(): Promise<null> {
    return null;
  }
}

export type KnowledgeDecisionEngineOptions = {
  repository?: KnowledgeRepository;
  factResolver?: KnowledgeFactResolver;
  aiProvider?: AiFallbackProvider;
  semanticThreshold?: number;
  minimumFactConfidence?: number;
  minimumAiConfidence?: number;
  allowGeneratedAutoReply?: boolean;
};

export class KnowledgeDecisionEngine {
  readonly engineId = "fawri_knowledge_decision_engine_v1";
  private readonly repository: KnowledgeRepository;
  private readonly factResolver: KnowledgeFactResolver;
  private readonly aiProvider: AiFallbackProvider;
  private readonly semanticThreshold: number;
  private readonly minimumFactConfidence: number;
  private readonly minimumAiConfidence: number;
  private readonly allowGeneratedAutoReply: boolean;

  constructor(options: KnowledgeDecisionEngineOptions = {}) {
    this.repository = options.repository || getKnowledgeRepository();
    this.factResolver = options.factResolver || new NoopFactResolver();
    this.aiProvider = options.aiProvider || new ConstrainedOpenAiProvider();
    this.semanticThreshold = options.semanticThreshold ?? 0.58;
    this.minimumFactConfidence = options.minimumFactConfidence ?? 0.9;
    this.minimumAiConfidence = options.minimumAiConfidence ?? 0.82;
    this.allowGeneratedAutoReply =
      options.allowGeneratedAutoReply ??
      String(process.env.FAWRI_ALLOW_GENERATED_AUTO_REPLY || "").toLowerCase() === "true";
  }

  private handoffText(
    language: KnowledgeLanguage,
    policy: MerchantPolicyContext,
  ): string {
    return boundedText(policy.handoffMessage?.[language], 500) || DEFAULT_HANDOFF[language];
  }

  private recordDecisionAudit(params: {
    input: KnowledgeDecisionInput;
    result: KnowledgeDecisionResult;
  }): void {
    this.repository.appendAudit({
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
      },
    });
  }

  async decide(input: KnowledgeDecisionInput): Promise<KnowledgeDecisionResult> {
    const merchantId = boundedText(input.merchantId, 120);
    const customerText = boundedText(input.customerText, 2_000);
    const language = input.languageHint || detectKnowledgeLanguage(customerText);
    const merchantPolicy = input.merchantPolicy || {};

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
      if (merchantId) this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
      return result;
    }

    const injection = inspectPromptInjection(customerText);
    if (injection.suspicious) {
      const training = this.repository.createTrainingRequest({
        merchantId,
        customerText,
        detectedLanguage: language,
        detectedIntent: "prompt_injection",
        reason: "prompt_injection_detected",
      });
      const result: KnowledgeDecisionResult = {
        action: "handoff",
        stage: "handoff",
        answerText: this.handoffText(language, merchantPolicy),
        language,
        source: null,
        confidence: 1,
        requiresMerchantApproval: false,
        trainingRequestId: training.id,
        matchedRecordId: null,
        reasonCode: "PROMPT_INJECTION_BLOCKED",
        injectionSignals: injection.signals,
      };
      this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
      return result;
    }

    const fact = await this.factResolver.resolve({ merchantId, customerText, language });
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
      this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
      return result;
    }

    const savedAnswer = this.repository.findApprovedSavedAnswer({
      merchantId,
      customerText,
      language,
    });
    if (savedAnswer) {
      const result: KnowledgeDecisionResult = {
        action: "reply",
        stage: "approved_saved_answer",
        answerText: savedAnswer.answerText,
        language: savedAnswer.language,
        source: "merchant_approved",
        confidence: 1,
        requiresMerchantApproval: false,
        trainingRequestId: null,
        matchedRecordId: savedAnswer.id,
        reasonCode: "MERCHANT_APPROVED_SAVED_ANSWER",
        injectionSignals: [],
      };
      this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
      return result;
    }

    const documents = this.repository.listApprovedSemanticDocuments(merchantId);
    const semantic = retrieveSemanticMatch({
      merchantId,
      query: customerText,
      language,
      documents,
      threshold: this.semanticThreshold,
    });
    if (semantic) {
      const result: KnowledgeDecisionResult = {
        action: "reply",
        stage: "semantic_retrieval",
        answerText: semantic.document.answer,
        language: semantic.document.language,
        source: "merchant_approved",
        confidence: semantic.score,
        requiresMerchantApproval: false,
        trainingRequestId: null,
        matchedRecordId: semantic.document.id,
        reasonCode: "MERCHANT_APPROVED_SEMANTIC_MATCH",
        injectionSignals: [],
      };
      this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
      return result;
    }

    const uniqueApprovedKnowledge = Array.from(
      new Map(
        documents.map((document) => [
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
      injectionSignals: [],
    });

    if (aiCandidate?.canAnswer && aiCandidate.answerText) {
      const recorded = this.repository.recordGeneratedCandidate({
        merchantId,
        customerText,
        language: aiCandidate.language,
        intent: "ai_fallback",
        answerText: aiCandidate.answerText,
        confidence: aiCandidate.confidence,
        reason: aiCandidate.reason,
      });

      const policyAllowsGenerated =
        merchantPolicy.allowGeneratedAutoReply === true || this.allowGeneratedAutoReply;
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
      this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
      return result;
    }

    const training = this.repository.createTrainingRequest({
      merchantId,
      customerText,
      detectedLanguage: language,
      detectedIntent: "knowledge_gap",
      reason: "no_trusted_answer",
    });
    const result: KnowledgeDecisionResult = {
      action: "handoff",
      stage: "handoff",
      answerText: this.handoffText(language, merchantPolicy),
      language,
      source: null,
      confidence: 0,
      requiresMerchantApproval: false,
      trainingRequestId: training.id,
      matchedRecordId: null,
      reasonCode: "NO_TRUSTED_ANSWER",
      injectionSignals: [],
    };
    this.recordDecisionAudit({ input: { ...input, merchantId, customerText }, result });
    return result;
  }
}

let singleton: KnowledgeDecisionEngine | null = null;

export function getKnowledgeDecisionEngine(): KnowledgeDecisionEngine {
  if (!singleton) singleton = new KnowledgeDecisionEngine();
  return singleton;
}

export function resetKnowledgeDecisionEngineForTests(): void {
  singleton = null;
}
