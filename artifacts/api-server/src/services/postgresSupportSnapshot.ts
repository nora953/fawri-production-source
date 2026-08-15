import {
  operationalPostgresAuthorityRequired,
  withMerchantOperationalTransaction,
} from "./operationalPostgresAuthority";
import { SupportPostgresError } from "./postgresSupportAuthority";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

export type SupportPreviewSnapshotSession = {
  id: string;
  merchant_name: string;
  admin_name: string;
  started_at: string;
  expires_at: string;
  status: string;
};

export type SupportPreviewSnapshotTicket = {
  id: string;
  subject: string;
  status: string;
};

export async function buildSupportPreviewSnapshotPostgres(input: {
  merchantId: string;
  session: SupportPreviewSnapshotSession;
  ticket: SupportPreviewSnapshotTicket;
}) {
  if (!operationalPostgresAuthorityRequired()) {
    throw new SupportPostgresError(
      "SUPPORT_POSTGRES_AUTHORITY_REQUIRED",
      "PostgreSQL support authority is not required",
      503,
    );
  }
  const merchantId = text(input.merchantId);
  if (!merchantId) {
    throw new SupportPostgresError("MERCHANT_NOT_FOUND", "merchant account not found", 404);
  }

  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const merchantResult = await client.query<{
      id: string;
      owner_name: string;
      store_name: string;
      phone: string | null;
      activity_type: string;
      status: string;
      language: string;
      created_at: Date | string;
      account_status: string;
      onboarding_status: string;
      trial_status: string;
      signup_source: string;
      requested_plan: string | null;
      approved_at: Date | string | null;
      warning_stage: number;
      retention_status: string | null;
      eligible_for_deletion_at: Date | string | null;
      grace_period_ends_at: Date | string | null;
    }>(
      `SELECT m.id, m.owner_name, m.store_name, a.phone, m.activity_type,
              m.status, a.language, m.created_at, m.account_status,
              m.onboarding_status, m.trial_status, m.signup_source,
              m.requested_plan, m.approved_at, m.warning_stage,
              m.retention_status, m.eligible_for_deletion_at,
              m.grace_period_ends_at
         FROM merchants m
         JOIN accounts a ON a.id = m.account_id
        WHERE m.id = $1
        LIMIT 1`,
      [merchantId],
    );
    const merchant = merchantResult.rows[0];
    if (!merchant) {
      throw new SupportPostgresError("MERCHANT_NOT_FOUND", "merchant account not found", 404);
    }

    const subscriptionResult = await client.query<{
      plan_name: string;
      status: string;
      price_iqd: number;
      starts_at: Date | string;
      expires_at: Date | string;
      base_reply_limit: number;
      base_replies_used: number;
      base_replies_remaining: number;
      addon_replies_remaining: number;
      emergency_debt: number;
      auto_reply_enabled: boolean;
    }>(
      `SELECT plan_name, status, price_iqd, starts_at, expires_at,
              base_reply_limit, base_replies_used, base_replies_remaining,
              addon_replies_remaining, emergency_debt, auto_reply_enabled
         FROM subscriptions
        WHERE merchant_id = $1
        LIMIT 1`,
      [merchantId],
    );
    const subscriptionRow = subscriptionResult.rows[0] || null;

    const productsResult = await client.query<Record<string, unknown>>(
      `SELECT id, external_ref, code, name, sku, barcode, category, description,
              original_price_iqd, current_price_iqd, compare_at_price_iqd,
              quantity, low_stock_threshold, weight_g, length_mm, width_mm,
              height_mm, variant_stock_mode, status, allow_fawri_reply,
              image_url, created_at, updated_at
         FROM products
        WHERE merchant_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC, id DESC
        LIMIT 500`,
      [merchantId],
    );

    const ordersResult = await client.query<Record<string, unknown>>(
      `SELECT id, conversation_id, customer_name, customer_phone,
              customer_address, customer_area, status, payment_method,
              payment_status, subtotal_iqd, delivery_fee_iqd, total_iqd,
              source_channel, notes, confirmed_at, cancelled_at, delivered_at,
              created_at, updated_at
         FROM orders
        WHERE merchant_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 500`,
      [merchantId],
    );

    const conversationsResult = await client.query<Record<string, unknown>>(
      `SELECT id, channel_id, customer_name, customer_handle, status,
              assigned_to_human, needs_training, last_message_at, closed_at,
              created_at, updated_at
         FROM conversations
        WHERE merchant_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 500`,
      [merchantId],
    );

    const savedAnswersResult = await client.query<Record<string, unknown>>(
      `SELECT id, category, question_pattern, answer_text, language, source,
              active, version, created_at, updated_at
         FROM saved_answers
        WHERE merchant_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 500`,
      [merchantId],
    );

    const trainingRequestsResult = await client.query<Record<string, unknown>>(
      `SELECT id, customer_text_preview, customer_text_length, detected_intent,
              detected_language, reason, suggested_reply,
              suggested_reply_source, status, rejection_reason, reviewed_at,
              version, created_at, updated_at
         FROM training_requests
        WHERE merchant_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 500`,
      [merchantId],
    );

    const learnedAnswersResult = await client.query<Record<string, unknown>>(
      `SELECT id, training_request_id, intent, language, examples, keywords,
              answer_text, source, approval_status, confidence,
              safe_to_auto_reply, version, created_at, updated_at
         FROM learned_answers
        WHERE merchant_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 500`,
      [merchantId],
    );

    const channelsResult = await client.query<Record<string, unknown>>(
      `SELECT id, platform, status, external_account_id, external_account_name,
              page_id, page_name, instagram_account_id, instagram_username,
              webhook_subscribed_at, last_webhook_at, last_error_code,
              last_error_at, connected_at, disconnected_at, created_at,
              updated_at
         FROM merchant_channels
        WHERE merchant_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 100`,
      [merchantId],
    );

    const subscription = subscriptionRow
      ? compact({
          plan_name: subscriptionRow.plan_name,
          status: subscriptionRow.status,
          price_iqd: Number(subscriptionRow.price_iqd),
          start_date: iso(subscriptionRow.starts_at),
          expires_at: iso(subscriptionRow.expires_at),
          reply_limit: Number(subscriptionRow.base_reply_limit),
          replies_used: Number(subscriptionRow.base_replies_used),
          replies_remaining:
            Number(subscriptionRow.base_replies_remaining) +
            Number(subscriptionRow.addon_replies_remaining),
          base_reply_limit: Number(subscriptionRow.base_reply_limit),
          base_replies_used: Number(subscriptionRow.base_replies_used),
          base_replies_remaining: Number(subscriptionRow.base_replies_remaining),
          addon_replies_remaining: Number(subscriptionRow.addon_replies_remaining),
          emergency_debt: Number(subscriptionRow.emergency_debt),
          auto_reply_enabled: Boolean(subscriptionRow.auto_reply_enabled),
        })
      : null;

    const products = productsResult.rows;
    const orders = ordersResult.rows;
    const conversations = conversationsResult.rows;
    const savedAnswers = savedAnswersResult.rows;
    const trainingRequests = trainingRequestsResult.rows;
    const learnedAnswers = learnedAnswersResult.rows;
    const channels = channelsResult.rows;

    return {
      session: input.session,
      ticket: input.ticket,
      merchant: compact({
        id: merchant.id,
        owner_name: merchant.owner_name,
        store_name: merchant.store_name,
        phone: merchant.phone || undefined,
        activity_type: merchant.activity_type,
        status: merchant.status,
        language: merchant.language,
        created_at: iso(merchant.created_at),
        account_status: merchant.account_status,
        onboarding_status: merchant.onboarding_status,
        trial_status: merchant.trial_status,
        signup_source: merchant.signup_source,
        requested_plan: merchant.requested_plan || undefined,
        approved_at: iso(merchant.approved_at),
        warning_stage: Number(merchant.warning_stage),
        retention_status: merchant.retention_status || undefined,
        eligible_for_deletion_at: iso(merchant.eligible_for_deletion_at),
        grace_period_ends_at: iso(merchant.grace_period_ends_at),
      }),
      subscription,
      products,
      orders,
      conversations,
      saved_answers: savedAnswers,
      training_requests: trainingRequests,
      learned_answers: learnedAnswers,
      channels,
      counts: {
        products: products.length,
        orders: orders.length,
        conversations: conversations.length,
        saved_answers: savedAnswers.length,
        training_requests: trainingRequests.length,
        learned_answers: learnedAnswers.length,
        channels: channels.length,
      },
      generated_at: new Date().toISOString(),
    };
  });
}
