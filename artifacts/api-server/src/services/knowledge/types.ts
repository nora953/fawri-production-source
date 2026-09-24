export type KnowledgeLanguage = "ar" | "ku" | "en";

export const SAVED_ANSWER_CATEGORIES = [
  "delivery",
  "payment",
  "return_exchange",
  "product",
  "warranty",
  "custom",
] as const;

export type SavedAnswerCategory = (typeof SAVED_ANSWER_CATEGORIES)[number];

export function isSavedAnswerCategory(value: unknown): value is SavedAnswerCategory {
  return (
    typeof value === "string" &&
    (SAVED_ANSWER_CATEGORIES as readonly string[]).includes(value)
  );
}

export type KnowledgeSource =
  | "database_fact"
  | "merchant_approved"
  | "fawri_curated"
  | "openai_generated";

export type TrainingStatus =
  | "pending_merchant_reply"
  | "pending_review"
  | "approved"
  | "rejected";

export type SuggestedReplySource =
  | "merchant_draft"
  | "openai_generated";

export type KnowledgeDecisionStage =
  | "database_fact"
  | "approved_saved_answer"
  | "semantic_retrieval"
  | "fawri_encyclopedia"
  | "clarification"
  | "ai_fallback"
  | "handoff";

export type KnowledgeDecisionAction =
  | "reply"
  | "handoff"
  | "no_answer";

export type SavedAnswerRecord = {
  id: string;
  merchantId: string;
  category: SavedAnswerCategory;
  questionPattern: string;
  answerText: string;
  language: KnowledgeLanguage;
  source: "merchant_approved";
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type TrainingRequestRecord = {
  id: string;
  merchantId: string;
  customerTextPreview: string;
  customerTextHash: string;
  detectedIntent: string;
  detectedLanguage: KnowledgeLanguage;
  reason: string;
  suggestedReply: string | null;
  suggestedReplySource: SuggestedReplySource | null;
  status: TrainingStatus;
  rejectionReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type LearnedAnswerRecord = {
  id: string;
  merchantId: string;
  intent: string;
  language: KnowledgeLanguage;
  examples: string[];
  keywords: string[];
  answerText: string;
  source: "merchant_approved" | "openai_generated";
  approvalStatus: "pending_review" | "approved" | "rejected";
  confidence: number;
  safeToAutoReply: boolean;
  trainingRequestId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeAuditEvent = {
  id: string;
  merchantId: string;
  action: string;
  entityType: "saved_answer" | "training_request" | "learned_answer" | "decision";
  entityId: string | null;
  actor: "merchant" | "system" | "ai_provider";
  outcome: "success" | "conflict" | "rejected" | "handoff";
  customerTextHash?: string;
  customerTextLength?: number;
  injectionSignals?: string[];
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type KnowledgeRuntimeState = {
  schemaVersion: 1;
  savedAnswers: SavedAnswerRecord[];
  trainingRequests: TrainingRequestRecord[];
  learnedAnswers: LearnedAnswerRecord[];
  auditEvents: KnowledgeAuditEvent[];
};

export type MerchantResponseTone =
  | "professional"
  | "friendly"
  | "warm"
  | "direct";

export type MerchantResponseBrevity =
  | "concise"
  | "balanced"
  | "detailed";

export type MerchantResponseEmojiStyle =
  | "none"
  | "minimal"
  | "expressive";

export type MerchantResponseStyle = {
  version: number;
  tone: MerchantResponseTone;
  brevity: MerchantResponseBrevity;
  emojiStyle: MerchantResponseEmojiStyle;
  customInstructions: string;
  updatedAt: string | null;
};

export type MerchantPolicyContext = {
  businessName?: string;
  allowedTopics?: string[];
  prohibitedTopics?: string[];
  allowGeneratedAutoReply?: boolean;
  handoffMessage?: Partial<Record<KnowledgeLanguage, string>>;
  responseStyle?: MerchantResponseStyle;
};

export type DatabaseFactResult = {
  answerText: string;
  language: KnowledgeLanguage;
  confidence: number;
  factType: string;
  recordId?: string;
};

export type KnowledgeFactResolverInput = {
  merchantId: string;
  customerText: string;
  language: KnowledgeLanguage;
  /** Trusted server-side conversation identity; never take from browser input. */
  conversationId?: string;
  /** Trusted channel customer identity; never take from browser input. */
  customerExternalId?: string;
};

export interface KnowledgeFactResolver {
  resolve(input: KnowledgeFactResolverInput): Promise<DatabaseFactResult | null>;
}

export type FawriEncyclopediaScope = "global" | "activity";

export type FawriEncyclopediaMatch = {
  articleId: string;
  scope: FawriEncyclopediaScope;
  activityKey: string | null;
  answerText: string;
  language: KnowledgeLanguage;
  confidence: number;
};

export type FawriCuratedKnowledge = {
  id: string;
  scope: FawriEncyclopediaScope;
  activityKey: string | null;
  question: string;
  answer: string;
  language: KnowledgeLanguage;
  confidence: number;
};

export interface FawriEncyclopediaResolver {
  resolve(input: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
  }): Promise<FawriEncyclopediaMatch | null>;
  listRelevantContext?(input: {
    merchantId: string;
    customerText: string;
    language: KnowledgeLanguage;
    limit?: number;
  }): Promise<FawriCuratedKnowledge[]>;
}

export type AiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type KnowledgeConversationMessage = {
  sender: "customer" | "fawri" | "merchant";
  text: string;
  createdAt: string;
  matchedRecordId?: string;
  reasonCode?: string;
};

export type AiFallbackRequest = {
  merchantId: string;
  language: KnowledgeLanguage;
  systemRules: readonly string[];
  merchantPolicy: MerchantPolicyContext;
  approvedKnowledge: Array<{
    id: string;
    question: string;
    answer: string;
    language: KnowledgeLanguage;
  }>;
  curatedKnowledge?: FawriCuratedKnowledge[];
  customerText: string;
  conversationHistory?: KnowledgeConversationMessage[];
  injectionSignals: string[];
};

export type AiFallbackCandidate = {
  answerText: string;
  language: KnowledgeLanguage;
  confidence: number;
  risk: "low" | "medium" | "high";
  canAnswer: boolean;
  reason: string;
  source: "openai_generated";
  groundingRecordIds?: string[];
  usage?: AiTokenUsage;
  providerId?: string;
  model?: string;
  latencyMs?: number;
};

export type TrustedPresentationRewriteRequest = {
  merchantId: string;
  sourceId: string;
  sourceKind: "fawri_curated";
  sourceText: string;
  language: KnowledgeLanguage;
  responseStyle: MerchantResponseStyle;
};

export type TrustedPresentationRewriteResult = {
  answerText: string;
  language: KnowledgeLanguage;
  faithful: boolean;
  usage?: AiTokenUsage;
  latencyMs?: number;
};

export interface AiFallbackProvider {
  readonly providerId: string;
  generate(request: AiFallbackRequest): Promise<AiFallbackCandidate | null>;
  rewritePresentation?(
    request: TrustedPresentationRewriteRequest,
  ): Promise<TrustedPresentationRewriteResult | null>;
}

export type ApprovedKnowledgeTranslationRequest = {
  merchantId: string;
  recordId: string;
  sourceLanguage: KnowledgeLanguage;
  targetLanguage: KnowledgeLanguage;
  sourceText: string;
};

export type ApprovedKnowledgeTranslationResult = {
  answerText: string;
  language: KnowledgeLanguage;
  faithful: boolean;
  usage?: AiTokenUsage;
  latencyMs?: number;
};

export interface ApprovedKnowledgeTranslationProvider {
  readonly providerId: string;
  readonly model: string;
  translate(
    request: ApprovedKnowledgeTranslationRequest,
  ): Promise<ApprovedKnowledgeTranslationResult | null>;
}

export type KnowledgeDecisionInput = {
  merchantId: string;
  customerText: string;
  languageHint?: KnowledgeLanguage;
  merchantPolicy?: MerchantPolicyContext;
  requestId?: string;
  /** Trusted server-side conversation identity; required for customer-private facts. */
  conversationId?: string;
  /** Trusted channel customer identity; required for customer-private facts. */
  customerExternalId?: string;
  /** Bounded prior delivered/received messages loaded by the server messaging pipeline. */
  recentMessages?: KnowledgeConversationMessage[];
};

export type KnowledgeDecisionResult = {
  action: KnowledgeDecisionAction;
  stage: KnowledgeDecisionStage;
  answerText: string | null;
  language: KnowledgeLanguage;
  source: KnowledgeSource | null;
  confidence: number;
  requiresMerchantApproval: boolean;
  trainingRequestId: string | null;
  matchedRecordId: string | null;
  reasonCode: string;
  injectionSignals: string[];
  groundingRecordIds?: string[];
  aiUsage?: AiTokenUsage;
  aiProviderId?: string;
  aiModel?: string;
  aiLatencyMs?: number;
};

export type SemanticDocument = {
  id: string;
  merchantId: string;
  question: string;
  answer: string;
  language: KnowledgeLanguage;
  source: "merchant_approved";
  kind: "saved_answer" | "learned_answer";
};

export type SemanticMatch = {
  document: SemanticDocument;
  score: number;
};
