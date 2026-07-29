export type MerchantStatus = 'pending_activation' | 'approved' | 'rejected' | 'suspended';
export type AccountStatus = 'pending_review' | 'approved' | 'rejected' | 'suspended';
export type OnboardingStatus =
  | 'pending_review'
  | 'awaiting_channel'
  | 'channel_connected'
  | 'activation_expired';
export type TrialStatus =
  | 'eligible'
  | 'not_started'
  | 'active'
  | 'expired'
  | 'already_used'
  | 'ineligible';
export type SignupSource = 'landing_trial' | 'landing_plan' | 'login' | 'direct';
export type RequestedPlan = 'silver' | 'gold' | 'diamond';
export type AdminRole = 'owner_admin' | 'assistant_admin';

export type AdminPermission =
  | 'view_merchants'
  | 'manage_merchant_status'
  | 'manage_subscriptions'
  | 'manage_channels'
  | 'view_logs'
  | 'inspect_merchant_sessions'
  | 'manage_support';

export type MerchantDeleteReason =
  | 'policy_violation'
  | 'retention_expired';

export type MerchantDeletionRequestStatus =
  | 'pending'
  | 'rejected'
  | 'completed';

export interface MerchantDeletionRequest {
  id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_phone: string;
  requested_by_admin_id: string;
  requested_by_admin_name: string;
  requested_by_admin_phone: string;
  reason: MerchantDeleteReason;
  details: string;
  status: MerchantDeletionRequestStatus;
  created_at: string;
  reviewed_by_admin_id?: string;
  reviewed_at?: string;
}

export type Lang = 'ar' | 'ku' | 'en';
export type ReplyLanguage = 'auto' | Lang;
export type ThemeMode = 'light' | 'dark' | 'auto';

export type PaymentMethod =
  | 'cash_on_delivery'
  | 'superqi'
  | 'fastpay'
  | 'zaincash'
  | 'other';

export type OrderPaymentStatus =
  | 'cash_on_delivery'
  | 'electronic_pending'
  | 'paid'
  | 'failed'
  | 'manual_review';

export interface Merchant {
  id: string;
  owner_name: string;
  store_name: string;
  phone: string;
  password: string;
  activity_type: string;
  instagram_link?: string;
  messenger_link?: string;
  telegram_link?: string;
  status: MerchantStatus;
  language: Lang;
  theme_preference: ThemeMode;
  created_at: string;
  is_admin?: boolean;
  admin_role?: AdminRole;
  permissions?: AdminPermission[];
  admin_enabled?: boolean;
  otp_verified?: boolean;
  account_status?: AccountStatus;
  onboarding_status?: OnboardingStatus;
  trial_status?: TrialStatus;
  signup_source?: SignupSource;
  requested_plan?: RequestedPlan | null;
  approved_at?: string;
  channel_activation_deadline?: string;
  first_channel_connected_at?: string;
  trial_started_at?: string;
  trial_expires_at?: string;

  subscription_started_at?: string;
  subscription_expires_at?: string;
  last_subscription_ended_at?: string;

  warning_stage?: 0 | 1 | 2 | 3 | 4;

  retention_status?:
    | "protected"
    | "warning_1"
    | "warning_2"
    | "warning_3"
    | "final_warning"
    | "eligible_for_deletion";

  grace_period_ends_at?: string;
  eligible_for_deletion_at?: string;


  cod_enabled?: boolean;
  superqi_enabled?: boolean;
  superqi_qr?: string;
  superqi_account_name?: string;
  delivery_zones?: DeliveryZone[];
  delivery_areas?: string;
  delivery_cost?: string;
  delivery_notes?: string;
  auto_reply_enabled?: boolean;
  reply_language?: ReplyLanguage;
}

export interface DeliveryZone {
  id: string;
  area: string;
  cost: string;
}

export interface Subscription {
  id: string;
  merchant_id: string;
  plan_name: 'silver' | 'gold' | 'diamond' | 'trial';
  price_iqd: number;
  reply_limit: number;
  replies_used: number;
  replies_remaining: number;
  base_reply_limit?: number;
  base_replies_used?: number;
  base_replies_remaining?: number;
  addon_replies_remaining?: number;
  addon_reply_batches?: Array<{
    id: string;
    purchased_at: string;
    expires_at: string;
    amount: number;
    remaining: number;
  }>;
  billing_anchor_day?: number;
  start_date: string;
  expires_at: string;
  status: 'pending_activation' | 'active' | 'expired' | 'replies_exhausted' | 'suspended';
  auto_reply_enabled: boolean;
  emergency_credit_used: number;
  emergency_credit_amount: number;
  emergency_credit_remaining: number;
  emergency_credit_activated: boolean;
  emergency_debt?: number;
  pending_next_cycle_deduction: number;
}

export interface MerchantBalanceNotification {
  id: string;
  merchant_id: string;
  type: 'subscription_balance_purchase';
  purchased_replies: number;
  emergency_debt_paid: number;
  addon_replies_added: number;
  emergency_debt_remaining: number;
  base_replies_remaining: number;
  emergency_replies_remaining: number;
  addon_replies_remaining: number;
  total_replies_available: number;
  created_at: string;
  read_at?: string;
}

export type ProductStatus =
  | 'available'
  | 'low_stock'
  | 'out_of_stock'
  | 'draft'
  | 'hidden_from_fawri';

export interface ProductVariant {
  color?: string;
  size?: string;
  quantity: number;
  sku?: string;
  price_override?: number;
}

export interface Product {
  id: string;
  merchant_id: string;
  name: string;
  code: string;
  sku: string;
  barcode?: string;
  category: string;
  description: string;
  original_price: number;
  current_price: number;
  quantity: number;
  status: ProductStatus;
  allow_fawri_reply: boolean;
  images: string[];
  variants: ProductVariant[];
  created_at: string;
}

export type ConversationStatus =
  | 'auto_replying'
  | 'manual'
  | 'needs_reply'
  | 'needs_training'
  | 'order_ready';

export type Platform = 'instagram' | 'messenger' | 'telegram';

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'customer' | 'fawri' | 'merchant';
  text: string;
  created_at: string;
  reply_type?: 'database' | 'saved_answer' | 'semantic_search' | 'ai_generated' | 'manual';
  counted_as_auto_reply: boolean;
}

export interface Conversation {
  id: string;
  merchant_id: string;
  platform: Platform;
  customer_name: string;
  customer_handle: string;
  status: ConversationStatus;
  detected_product_id?: string;
  messages: Message[];
  assigned_to_human: boolean;
  needs_training: boolean;
  updated_at: string;
}

export type OrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'preparing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'out_of_stock'
  | 'waiting_customer_approval';

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  merchant_id: string;
  customer_name: string;
  phone: string;
  address: string;
  items: OrderItem[];
  payment_method: PaymentMethod;
  payment_status: OrderPaymentStatus;
  status: OrderStatus;
  notes?: string;

  payment_screenshot?: string;
  payment_verified_at?: string;
  payment_verified_by?: string;
  payment_rejection_reason?: string;

  created_at: string;
}

export interface SavedAnswer {
  id: string;
  merchant_id: string;
  category: 'delivery' | 'payment' | 'return_exchange' | 'product' | 'warranty' | 'custom';
  question_pattern: string;
  answer_text: string;
  product_id?: string;
  language: Lang;
  approved: boolean;
  active: boolean;
  created_at: string;
}

export interface StoreSettings {
  merchant_id: string;
  payment_methods: {
    cash_on_delivery: boolean;
    superqi?: {
      enabled: boolean;
      account_name: string;
      qr_image: string;
      instructions: string;
    };
    fastpay?: {
      enabled: boolean;
      phone: string;
      name: string;
      instructions: string;
    };
    zaincash?: {
      enabled: boolean;
      phone: string;
      name: string;
      instructions: string;
    };
    other?: {
      enabled: boolean;
      name: string;
      instructions: string;
    };
  };
  show_electronic_payment_during_order: boolean;
  delivery_settings: {
    areas: string[];
    cost: number;
    notes: string;
  };
  auto_reply_enabled: boolean;
  reply_language: ReplyLanguage;
}

export type AdminLogPlan = 'silver' | 'gold' | 'diamond';

export interface AdminLogMeta {
  plan?: AdminLogPlan;
  amount?: number;
  limit?: number;
  emergency_deduction?: number;
  platform?: string;
  status?: string;
}

export interface AdminLog {
  id: string;
  admin_id?: string;
  admin_name?: string;
  admin_phone: string;
  admin_role?: AdminRole;
  action_type: string;
  merchant_id: string;
  merchant_name: string;
  details: string;
  meta?: AdminLogMeta;
  reason?: string;
  created_at: string;
}
