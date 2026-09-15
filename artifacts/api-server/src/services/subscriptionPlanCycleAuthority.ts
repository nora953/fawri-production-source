import crypto from "node:crypto";
import { getSaasPlan, type SaasPaidPlan } from "./saasPlanCatalog";

export type SubscriptionPlanCycleOperation = "activate" | "change" | "renew";
export type SubscriptionPlanCycleSource = "manual_override" | "saas_billing";

export type SubscriptionPlanCycleTransaction = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

export class SubscriptionPlanCycleError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 409,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SubscriptionPlanCycleError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function fail(
  code: string,
  message: string,
  status = 409,
  details?: Record<string, unknown>,
): never {
  throw new SubscriptionPlanCycleError(code, message, status, details);
}

const BAGHDAD_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function baghdadParts(value: Date) {
  const shifted = new Date(value.getTime() + BAGHDAD_UTC_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

function addBaghdadMonth(source: Date, anchorDay: number): Date {
  const parts = baghdadParts(source);
  const targetMonthStart = new Date(
    Date.UTC(
      parts.year,
      parts.month + 1,
      1,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, anchorDay), lastDay);
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - BAGHDAD_UTC_OFFSET_MS,
  );
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function integer(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
      "subscription entitlement state is invalid",
      503,
    );
  }
  return parsed;
}

export async function applySubscriptionPlanCycleInTransaction(
  client: SubscriptionPlanCycleTransaction,
  input: {
    merchantId: string;
    operation: SubscriptionPlanCycleOperation;
    plan: SaasPaidPlan;
    source: SubscriptionPlanCycleSource;
    actorAccountId?: string;
    billingOrderId?: string;
    providerPaymentRef?: string;
    now?: Date;
  },
): Promise<{
  subscriptionId: string;
  previousPlan: SaasPaidPlan | "trial" | null;
  emergencyDebtPaid: number;
}> {
  const merchantId = text(input.merchantId);
  if (!merchantId) fail("MERCHANT_ID_REQUIRED", "merchant id is required", 400);
  const now = input.now || new Date();
  const plan = getSaasPlan(input.plan);

  const merchantResult = await client.query(
    `SELECT id, status, account_status
       FROM merchants
      WHERE id = $1
      LIMIT 2
      FOR UPDATE`,
    [merchantId],
  );
  if (merchantResult.rows.length !== 1) {
    fail("MERCHANT_NOT_FOUND", "merchant not found", 404);
  }
  const merchant = merchantResult.rows[0];
  if (
    String(merchant.status) !== "approved" ||
    String(merchant.account_status) !== "approved"
  ) {
    fail(
      "APPROVED_MERCHANT_REQUIRED",
      "approved merchant account is required",
      403,
    );
  }

  const existingResult = await client.query(
    `SELECT id, plan_name, status, expires_at, base_replies_remaining,
            emergency_debt
       FROM subscriptions
      WHERE merchant_id = $1
      LIMIT 2
      FOR UPDATE`,
    [merchantId],
  );
  if (existingResult.rows.length > 1) {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_AMBIGUOUS",
      "merchant subscription authority is ambiguous",
      503,
    );
  }
  const existing = existingResult.rows[0] || null;

  if (input.operation === "activate" && existing) {
    fail("SUBSCRIPTION_ALREADY_EXISTS", "merchant already has a subscription");
  }
  if (input.operation !== "activate" && !existing) {
    fail("SUBSCRIPTION_NOT_FOUND", "merchant does not have a subscription", 409);
  }

  const existingExpiresAt = existing ? new Date(String(existing.expires_at)) : null;
  const baseRemaining = existing ? integer(existing.base_replies_remaining) : 0;
  if (existing && input.operation !== "activate") {
    const expired =
      existingExpiresAt !== null && existingExpiresAt.getTime() <= now.getTime();
    if (!expired && baseRemaining > 0) {
      fail(
        "SUBSCRIPTION_CYCLE_STILL_ACTIVE",
        "a new subscription cycle requires exhausted base replies or an expired subscription",
        409,
        {
          base_replies_remaining: baseRemaining,
          expires_at: existingExpiresAt?.toISOString() || null,
        },
      );
    }
    if (input.operation === "renew" && String(existing.plan_name) !== input.plan) {
      fail("RENEWAL_PLAN_MISMATCH", "renewal must keep the current plan");
    }
  }

  const previousPlan = existing
    ? (String(existing.plan_name) as SaasPaidPlan | "trial")
    : null;
  const emergencyDebt = existing ? integer(existing.emergency_debt) : 0;
  const emergencyDebtPaid = Math.min(emergencyDebt, plan.base_reply_limit);
  const nextDebt = Math.max(0, emergencyDebt - emergencyDebtPaid);
  const subscriptionId = existing
    ? text(existing.id)
    : `subscription-${crypto.randomUUID()}`;
  const anchorDay = baghdadParts(now).day;
  const expiresAt = addBaghdadMonth(now, anchorDay);

  if (existing) {
    await client.query(
      `UPDATE subscriptions
          SET plan_name = $3,
              status = 'active',
              price_iqd = $4,
              billing_anchor_day = $5,
              base_reply_limit = $6,
              base_replies_used = $7,
              base_replies_remaining = $8,
              addon_replies_remaining = (
                SELECT COALESCE(SUM(remaining), 0)::int
                  FROM subscription_reply_batches
                 WHERE subscription_id = $1
                   AND merchant_id = $2
                   AND remaining > 0
                   AND expires_at > $9
              ),
              emergency_credit_amount = $10,
              emergency_credit_activated = FALSE,
              emergency_debt = $11,
              auto_reply_enabled = TRUE,
              starts_at = $9,
              expires_at = $12,
              activated_at = $9,
              suspended_at = NULL,
              expiry_reminder_sent_at = NULL,
              expired_notification_sent_at = NULL,
              version = version + 1,
              updated_at = $9
        WHERE id = $1 AND merchant_id = $2`,
      [
        subscriptionId,
        merchantId,
        input.plan,
        plan.monthly_price_iqd,
        anchorDay,
        plan.base_reply_limit,
        emergencyDebtPaid,
        plan.base_reply_limit - emergencyDebtPaid,
        now,
        plan.emergency_credit_amount,
        nextDebt,
        expiresAt,
      ],
    );
  } else {
    await client.query(
      `INSERT INTO subscriptions (
         id, merchant_id, plan_name, status, price_iqd, billing_anchor_day,
         base_reply_limit, base_replies_used, base_replies_remaining,
         addon_replies_remaining, emergency_credit_amount,
         emergency_credit_activated, emergency_debt, auto_reply_enabled,
         starts_at, expires_at, activated_at, version, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'active', $4, $5,
         $6, 0, $6,
         0, $7,
         FALSE, 0, TRUE,
         $8, $9, $8, 1, $8, $8
       )`,
      [
        subscriptionId,
        merchantId,
        input.plan,
        plan.monthly_price_iqd,
        anchorDay,
        plan.base_reply_limit,
        plan.emergency_credit_amount,
        now,
        expiresAt,
      ],
    );
  }

  const endedAt =
    existingExpiresAt && existingExpiresAt.getTime() <= now.getTime()
      ? existingExpiresAt
      : existing
        ? now
        : null;
  await client.query(
    `UPDATE merchants
        SET last_subscription_ended_at = COALESCE($2, last_subscription_ended_at),
            retention_status = 'protected',
            warning_stage = 0,
            products_read_only = FALSE,
            retention_suspended_at = NULL,
            grace_period_ends_at = NULL,
            eligible_for_deletion_at = NULL,
            updated_at = $3
      WHERE id = $1`,
    [merchantId, endedAt, now],
  );

  const actionType =
    input.operation === "activate"
      ? "plan_activated"
      : input.operation === "change"
        ? "plan_changed"
        : "plan_renewed";
  await client.query(
    `INSERT INTO audit_events (
       id, actor_kind, actor_account_id, merchant_id, action_type,
       entity_type, entity_id, reason_code, details, metadata, created_at
     ) VALUES ($1, $2, $3, $4, $5, 'subscription', $6, $7, $8, $9::jsonb, $10)`,
    [
      `audit-${crypto.randomUUID()}`,
      input.source === "saas_billing" ? "external" : "account",
      input.source === "manual_override" ? text(input.actorAccountId) || null : null,
      merchantId,
      actionType,
      subscriptionId,
      input.source === "saas_billing" ? "SAAS_BILLING_PAID" : "MANUAL_ENTITLEMENT_OVERRIDE",
      input.source === "saas_billing"
        ? "subscription cycle applied from verified SaaS billing authority"
        : "subscription cycle applied by administrator without a SaaS payment record",
      JSON.stringify({
        authority_source: input.source,
        plan: input.plan,
        ...(previousPlan ? { previous_plan: previousPlan } : {}),
        ...(emergencyDebtPaid > 0
          ? { emergency_deduction: emergencyDebtPaid }
          : {}),
        ...(input.billingOrderId ? { billing_order_id: input.billingOrderId } : {}),
        ...(input.providerPaymentRef
          ? { provider_payment_ref: input.providerPaymentRef }
          : {}),
      }),
      now,
    ],
  );

  return { subscriptionId, previousPlan, emergencyDebtPaid };
}

export async function applySubscriptionPlanCyclePostgres(input: {
  merchantId: string;
  operation: SubscriptionPlanCycleOperation;
  plan: SaasPaidPlan;
  actorAccountId: string;
  now?: Date;
}): Promise<{ subscriptionId: string }> {
  if (!process.env.DATABASE_URL) {
    throw new Error("subscription plan cycle authority requires DATABASE_URL");
  }
  const module = await import("@workspace/db");
  const pool = module.pool as unknown as {
    connect(): Promise<SubscriptionPlanCycleTransaction & { release(): void }>;
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applySubscriptionPlanCycleInTransaction(client, {
      merchantId: input.merchantId,
      operation: input.operation,
      plan: input.plan,
      source: "manual_override",
      actorAccountId: input.actorAccountId,
      now: input.now,
    });
    await client.query("COMMIT");
    return { subscriptionId: result.subscriptionId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
