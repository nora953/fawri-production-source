export type Channel =
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "website"
  | "unknown";

export type MessageKind = "text" | "audio" | "image" | "file" | "unknown";

export type LanguageCode = "ar_iq" | "ku_sorani" | "en" | "unknown";

export type AgentIntent =
  | "greeting"
  | "price_ask"
  | "availability_ask"
  | "product_details"
  | "product_switch"
  | "order_create"
  | "order_update"
  | "order_cancel"
  | "delivery_info"
  | "payment_methods"
  | "order_track"
  | "complaint"
  | "exchange_return"
  | "business_hours"
  | "location"
  | "promotion"
  | "handoff"
  | "unknown";

export type KnowledgeSource =
  | "system_seed"
  | "merchant_approved"
  | "openai_generated"
  | "human_agent_reply"
  | "product_database"
  | "policy_database";

export type ProductRecord = {
  id: string;
  name: string;
  price?: number | string | null;
  currency?: string | null;
  description?: string | null;
  colors?: string[];
  sizes?: string[];
  available?: boolean;
  stockText?: string | null;
  category?: string | null;
  aliases?: string[];
};

export type StorePolicy = {
  merchantName: string;
  language?: LanguageCode | "mixed";
  tone?: string;
  deliveryInfo?: string;
  paymentInfo?: string;
  returnPolicy?: string;
  bookingPolicy?: string;
  requiredOrderFields?: string[];
  humanHandoffText?: string;
};

export type OrderDraft = {
  productId?: string | null;
  productName?: string | null;
  quantity?: number | null;
  color?: string | null;
  size?: string | null;
  customerName?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

export type ConversationState = {
  merchantId: string;
  customerId: string;
  channel: Channel;

  activeProductId?: string | null;
  activeProductName?: string | null;
  orderDraft?: OrderDraft | null;

  lastIntent?: AgentIntent | null;
  lastLanguage?: LanguageCode | null;
  lastCustomerMessage?: string | null;
  lastAgentReply?: string | null;

  processedMessageIds: string[];

  createdAt: string;
  updatedAt: string;
};

export type IncomingCustomerMessage = {
  merchantId: string;
  customerId: string;
  channel: Channel;
  kind: MessageKind;
  text?: string;
  messageId?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
};

export type LearnedAnswer = {
  id: string;
  merchantId: string;

  intent: AgentIntent;
  language: LanguageCode;

  examples: string[];
  keywords: string[];

  reply: string;

  source: KnowledgeSource;
  confidence: number;

  safeToAutoReply: boolean;
  requiresHumanApproval: boolean;

  conditions?: Record<string, string | number | boolean | null>;

  createdAt: string;
  updatedAt: string;
};

export type TrainingRequest = {
  id: string;
  merchantId: string;
  customerId: string;

  customerMessage: string;
  normalizedMessage: string;

  detectedIntent: AgentIntent;
  detectedLanguage: LanguageCode;

  reason: string;

  suggestedReply?: string | null;

  status: "pending_merchant_reply" | "pending_review" | "approved" | "rejected";

  createdAt: string;
  updatedAt: string;
};

export type AgentReplyResult = {
  reply: string;
  shouldSend: boolean;

  usedOpenAI: boolean;
  usedLocalKnowledge: boolean;
  createdTrainingRequest: boolean;

  intent: AgentIntent;
  language: LanguageCode;

  confidence: number;

  shouldHandoff: boolean;
  internalNote: string;
};
