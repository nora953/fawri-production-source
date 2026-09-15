import { getFawriDataFilePath } from "../lib/dataPaths";
import {
  now,
  readJson,
  type AuthDb,
  type MerchantRecord,
} from "./supportPreviewSessions";

const runtimePath = getFawriDataFilePath("fawri-runtime-db.json");
const savedAnswersPath = getFawriDataFilePath("saved-answers.json");
const trainingRequestsPath = getFawriDataFilePath("training-requests.json");
const learnedAnswersPath = getFawriDataFilePath("learned-answers.json");

const SAFE_MERCHANT_FIELDS = [
  "id",
  "owner_name",
  "store_name",
  "phone",
  "activity_type",
  "status",
  "language",
  "theme_preference",
  "created_at",
  "account_status",
  "onboarding_status",
  "trial_status",
  "signup_source",
  "requested_plan",
  "approved_at",
  "warning_stage",
  "retention_status",
  "eligible_for_deletion_at",
  "grace_period_ends_at",
] as const;

const SAFE_SUBSCRIPTION_FIELDS = [
  "plan_name",
  "status",
  "price_iqd",
  "start_date",
  "expires_at",
  "reply_limit",
  "replies_used",
  "replies_remaining",
  "base_reply_limit",
  "base_replies_used",
  "base_replies_remaining",
  "addon_replies_remaining",
  "emergency_debt",
  "auto_reply_enabled",
] as const;

function pickFields(
  source: Record<string, unknown>,
  allowedFields: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    allowedFields.map((field) => [field, source[field]]),
  );
}

function safeMerchant(merchant: MerchantRecord): Record<string, unknown> {
  return pickFields(
    merchant as unknown as Record<string, unknown>,
    SAFE_MERCHANT_FIELDS,
  );
}

function safeSubscription(
  subscription: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!subscription) return null;
  return pickFields(subscription, SAFE_SUBSCRIPTION_FIELDS);
}

function merchantRuntimeRecords(
  runtime: Record<string, unknown>,
  key: string,
  merchantId: string,
): Record<string, unknown>[] {
  const source = runtime[key];
  if (!source || typeof source !== "object") return [];
  const value = (source as Record<string, unknown>)[merchantId];
  return Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : [];
}

export type MerchantReadOnlySnapshotContext = {
  authDb: AuthDb;
  merchant: MerchantRecord;
  session?: Record<string, unknown>;
  ticket?: {
    id: string;
    subject: string;
    category: string;
    status: string;
    assigned_admin_name?: string;
  };
  emergency_access?: {
    request_id: string;
    incident_reference: string;
    severity: "high" | "critical";
    reason: string;
    expires_at: string;
  };
};

export function buildMerchantReadOnlySnapshot(
  context: MerchantReadOnlySnapshotContext,
) {
  const runtime = readJson<Record<string, unknown>>(runtimePath, {});
  const merchantId = context.merchant.id;
  const products = merchantRuntimeRecords(
    runtime,
    "productsByMerchant",
    merchantId,
  );
  const orders = merchantRuntimeRecords(runtime, "ordersByMerchant", merchantId);
  const conversations = merchantRuntimeRecords(
    runtime,
    "conversationsByMerchant",
    merchantId,
  );

  const pages =
    runtime.metaPagesByPageId &&
    typeof runtime.metaPagesByPageId === "object"
      ? Object.values(
          runtime.metaPagesByPageId as Record<
            string,
            Record<string, unknown>
          >,
        )
      : [];
  const channels = pages
    .filter((page) => page.merchant_id === merchantId)
    .map((page) => ({
      page_id: page.page_id,
      page_name: page.page_name,
      platform: page.platform,
      connected_at: page.connected_at,
      webhook_subscribed: page.webhook_subscribed,
      instagram_account_id: page.instagram_account_id,
      instagram_username: page.instagram_username,
      instagram_name: page.instagram_name,
    }));

  const savedAnswers = (
    readJson<{ answers?: Record<string, unknown>[] }>(savedAnswersPath, {})
      .answers || []
  ).filter((item) => item.merchant_id === merchantId);
  const trainingRequests = (
    readJson<{ requests?: Record<string, unknown>[] }>(
      trainingRequestsPath,
      {},
    ).requests || []
  ).filter((item) => item.merchantId === merchantId);
  const learnedAnswers = (
    readJson<{ answers?: Record<string, unknown>[] }>(learnedAnswersPath, {})
      .answers || []
  ).filter((item) => item.merchantId === merchantId);

  const subscriptionRecord =
    context.authDb.subscriptions.find(
      (item) => item.merchant_id === merchantId,
    ) || null;

  return {
    ...(context.session ? { session: context.session } : {}),
    ...(context.ticket ? { ticket: context.ticket } : {}),
    ...(context.emergency_access
      ? { emergency_access: context.emergency_access }
      : {}),
    merchant: safeMerchant(context.merchant),
    subscription: safeSubscription(
      subscriptionRecord as unknown as Record<string, unknown> | null,
    ),
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
    generated_at: now(),
  };
}
