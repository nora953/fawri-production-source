import crypto from "node:crypto";
import {
  applySubscriptionPlanCyclePostgres,
  SubscriptionPlanCycleError,
} from "./subscriptionPlanCycleAuthority";

export const SUBSCRIPTION_POSTGRES_AUTHORITY_ENV =
  "FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY";

export type SubscriptionPlan = "silver" | "gold" | "diamond" | "trial";
export type PaidSubscriptionPlan = Exclude<SubscriptionPlan, "trial">;
export type SubscriptionStatus =
  | "pending_activation"
  | "active"
  | "expired"
  | "replies_exhausted"
  | "suspended";

export type SubscriptionApiBatch = {
  id: string;
  source: "purchase" | "emergency";
  purchased_at: string;
  expires_at: string;
  amount: number;
  remaining: number;
  expiry_reminder_sent_at?: string;
};

export type SubscriptionApiRecord = {
  id: string;
  merchant_id: string;
  plan_name: SubscriptionPlan;
  price_iqd: number;
  reply_limit: number;
  replies_used: number;
  replies_remaining: number;
  base_reply_limit: number;
  base_replies_used: number;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  addon_reply_batches: SubscriptionApiBatch[];
  billing_anchor_day: number;
  start_date: string;
  expires_at: string;
  status: SubscriptionStatus;
  auto_reply_enabled: boolean;
  emergency_credit_used: number;
  emergency_credit_amount: number;
  emergency_credit_remaining: number;
  emergency_credit_activated: boolean;
  emergency_debt: number;
  pending_next_cycle_deduction: number;
  expiry_reminder_sent_at?: string;
  expired_notification_sent_at?: string;
  version: number;
};

export type MerchantReplyEntitlementDecision =
  | {
      allowed: true;
      duplicate: boolean;
      repliesRemaining: number;
      subscriptionId: string;
    }
  | {
      allowed: false;
      code:
        | "MERCHANT_SUBSCRIPTION_REQUIRED"
        | "MERCHANT_SUBSCRIPTION_PENDING"
        | "MERCHANT_SUBSCRIPTION_EXPIRED"
        | "MERCHANT_SUBSCRIPTION_SUSPENDED"
        | "MERCHANT_REPLIES_EXHAUSTED"
        | "MERCHANT_AUTO_REPLY_DISABLED"
        | "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE";
      error: string;
    };

export type ReplyRestoreKind =
  | { kind: "refund"; reasonCode: "META_REPLY_FAILED" }
  | {
      kind: "release";
      reasonCode:
        | "MERCHANT_AUTO_REPLY_DISABLED"
        | "MERCHANT_SETTINGS_VERSION_CHANGED"
        | "MERCHANT_SETTINGS_UNAVAILABLE"
        | "META_FAKE_TRANSPORT_ONLY";
    };

export type ReplyRestoreResult =
  | { restored: true; merchantId: string; subscriptionId: string }
  | { restored: false; reason: string };

export type SubscriptionPlanOperation = "activate" | "change" | "renew";
export type SubscriptionAction =
  | "add_replies"
  | "deduct_replies"
  | "reset_replies"
  | "set_auto_reply";

export class SubscriptionEntitlementAuthorityError extends Error {
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
    this.name = "SubscriptionEntitlementAuthorityError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
};

type QueryTarget = {
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
};

type TransactionClient = QueryTarget & { release(): void };
type DatabasePool = QueryTarget & { connect(): Promise<TransactionClient> };

type SubscriptionRow = {
  id: string;
  merchant_id: string;
  plan_name: SubscriptionPlan;
  status: SubscriptionStatus;
  price_iqd: number;
  billing_anchor_day: number;
  base_reply_limit: number;
  base_replies_used: number;
  base_replies_remaining: number;
  addon_replies_remaining: number;
  emergency_credit_amount: number;
  emergency_credit_activated: boolean;
  emergency_debt: number;
  auto_reply_enabled: boolean;
  starts_at: Date;
  expires_at: Date;
  expiry_reminder_sent_at: Date | null;
  expired_notification_sent_at: Date | null;
  version: number;
};

type BatchRow = {
  id: string;
  subscription_id: string;
  merchant_id: string;
  source: "purchase" | "emergency";
  amount: number;
  remaining: number;
  purchased_at: Date;
  expires_at: Date;
  expiry_reminder_sent_at: Date | null;
};

type LedgerRow = {
  id: string;
  merchant_id: string;
  subscription_id: string | null;
  reply_batch_id: string | null;
  direction: "debit" | "credit";
  amount: number;
  reason_code: string;
  external_event_id: string | null;
  balance_after: number | null;
  metadata: Record<string, unknown> | null;
};

type LockedSubscription = {
  row: SubscriptionRow;
  batches: BatchRow[];
  totalRemaining: number;
  totalUsed: number;
};

const BAGHDAD_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export function subscriptionPostgresAuthorityRequired(): boolean {
  return process.env[SUBSCRIPTION_POSTGRES_AUTHORITY_ENV] === "required";
}

function fail(
  code: string,
  message: string,
  status = 409,
  details?: Record<string, unknown>,
): never {
  throw new SubscriptionEntitlementAuthorityError(code, message, status, details);
}

function requiredText(value: unknown, max = 200): string {
  const result = String(value ?? "").trim();
  if (!result || result.length > max) {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
      "subscription entitlement state is invalid",
      503,
    );
  }
  return result;
}

function nonNegativeInteger(value: unknown): number {
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

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
      "subscription entitlement state is invalid",
      503,
    );
  }
  return parsed;
}

function booleanValue(value: unknown): boolean {
  if (value === true || value === false) return value;
  fail(
    "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
    "subscription entitlement state is invalid",
    503,
  );
}

function timestamp(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (!Number.isFinite(parsed.getTime())) {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
      "subscription entitlement state is invalid",
      503,
    );
  }
  return parsed;
}

function optionalTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  return timestamp(value);
}

function parseStatus(value: unknown): SubscriptionStatus {
  const candidate = String(value ?? "");
  if (
    candidate === "pending_activation" ||
    candidate === "active" ||
    candidate === "expired" ||
    candidate === "replies_exhausted" ||
    candidate === "suspended"
  ) {
    return candidate;
  }
  fail(
    "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
    "subscription entitlement state is invalid",
    503,
  );
}

function parsePlan(value: unknown): SubscriptionPlan {
  const candidate = String(value ?? "");
  if (
    candidate === "silver" ||
    candidate === "gold" ||
    candidate === "diamond" ||
    candidate === "trial"
  ) {
    return candidate;
  }
  fail(
    "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
    "subscription entitlement state is invalid",
    503,
  );
}

function parseBatchSource(value: unknown): "purchase" | "emergency" {
  if (value === "purchase" || value === "emergency") return value;
  fail(
    "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
    "subscription reply batch state is invalid",
    503,
  );
}

function toSubscriptionRow(row: Record<string, unknown>): SubscriptionRow {
  const anchor = positiveInteger(row.billing_anchor_day);
  if (anchor > 31) {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
      "subscription billing anchor is invalid",
      503,
    );
  }
  return {
    id: requiredText(row.id, 160),
    merchant_id: requiredText(row.merchant_id, 160),
    plan_name: parsePlan(row.plan_name),
    status: parseStatus(row.status),
    price_iqd: nonNegativeInteger(row.price_iqd),
    billing_anchor_day: anchor,
    base_reply_limit: nonNegativeInteger(row.base_reply_limit),
    base_replies_used: nonNegativeInteger(row.base_replies_used),
    base_replies_remaining: nonNegativeInteger(row.base_replies_remaining),
    addon_replies_remaining: nonNegativeInteger(row.addon_replies_remaining),
    emergency_credit_amount: nonNegativeInteger(row.emergency_credit_amount),
    emergency_credit_activated: booleanValue(row.emergency_credit_activated),
    emergency_debt: nonNegativeInteger(row.emergency_debt),
    auto_reply_enabled: booleanValue(row.auto_reply_enabled),
    starts_at: timestamp(row.starts_at),
    expires_at: timestamp(row.expires_at),
    expiry_reminder_sent_at: optionalTimestamp(row.expiry_reminder_sent_at),
    expired_notification_sent_at: optionalTimestamp(row.expired_notification_sent_at),
    version: positiveInteger(row.version),
  };
}

function toBatchRow(row: Record<string, unknown>): BatchRow {
  return {
    id: requiredText(row.id, 200),
    subscription_id: requiredText(row.subscription_id, 160),
    merchant_id: requiredText(row.merchant_id, 160),
    source: parseBatchSource(row.source),
    amount: positiveInteger(row.amount),
    remaining: nonNegativeInteger(row.remaining),
    purchased_at: timestamp(row.purchased_at),
    expires_at: timestamp(row.expires_at),
    expiry_reminder_sent_at: optionalTimestamp(row.expiry_reminder_sent_at),
  };
}

function toLedgerRow(row: Record<string, unknown>): LedgerRow {
  const direction = String(row.direction || "");
  if (direction !== "debit" && direction !== "credit") {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_STATE_INVALID",
      "reply ledger state is invalid",
      503,
    );
  }
  return {
    id: requiredText(row.id, 200),
    merchant_id: requiredText(row.merchant_id, 160),
    subscription_id:
      row.subscription_id === null || row.subscription_id === undefined
        ? null
        : requiredText(row.subscription_id, 160),
    reply_batch_id:
      row.reply_batch_id === null || row.reply_batch_id === undefined
        ? null
        : requiredText(row.reply_batch_id, 200),
    direction,
    amount: positiveInteger(row.amount),
    reason_code: requiredText(row.reason_code, 160),
    external_event_id:
      row.external_event_id === null || row.external_event_id === undefined
        ? null
        : requiredText(row.external_event_id, 300),
    balance_after:
      row.balance_after === null || row.balance_after === undefined
        ? null
        : nonNegativeInteger(row.balance_after),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
  };
}

async function databasePool(): Promise<DatabasePool> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      `${SUBSCRIPTION_POSTGRES_AUTHORITY_ENV}=required requires DATABASE_URL`,
    );
  }
  const module = await import("@workspace/db");
  return module.pool as unknown as DatabasePool;
}

async function queryRows<T extends Record<string, unknown>>(
  target: QueryTarget,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await target.query(sql, values);
  return result.rows as T[];
}

async function withTransaction<T>(
  work: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  const pool = await databasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function getBaghdadDateParts(value: Date) {
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

function addBaghdadCalendarMonths(
  source: Date,
  months: number,
  anchorDay?: number,
): Date {
  const parts = getBaghdadDateParts(source);
  const targetMonthStart = new Date(
    Date.UTC(
      parts.year,
      parts.month + months,
      1,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  const desiredDay = Math.min(
    Math.max(1, anchorDay || parts.day),
    lastDay,
  );
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      desiredDay,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - BAGHDAD_UTC_OFFSET_MS,
  );
}

async function loadBatches(
  target: QueryTarget,
  subscriptionId: string,
  merchantId: string,
  now: Date,
  lock: boolean,
): Promise<BatchRow[]> {
  await target.query(
    `UPDATE subscription_reply_batches
        SET remaining = 0
      WHERE subscription_id = $1
        AND merchant_id = $2
        AND remaining > 0
        AND expires_at <= $3`,
    [subscriptionId, merchantId, now],
  );
  const result = await queryRows<Record<string, unknown>>(
    target,
    `SELECT id, subscription_id, merchant_id, source, amount, remaining,
            purchased_at, expires_at, expiry_reminder_sent_at
       FROM subscription_reply_batches
      WHERE subscription_id = $1
        AND merchant_id = $2
        AND remaining > 0
        AND expires_at > $3
      ORDER BY expires_at ASC, purchased_at ASC, id ASC${lock ? " FOR UPDATE" : ""}`,
    [subscriptionId, merchantId, now],
  );
  return result.map(toBatchRow);
}

async function loadSubscriptionRow(
  target: QueryTarget,
  merchantId: string,
  lock: boolean,
): Promise<SubscriptionRow | null> {
  const result = await queryRows<Record<string, unknown>>(
    target,
    `SELECT id, merchant_id, plan_name, status, price_iqd,
            billing_anchor_day, base_reply_limit, base_replies_used,
            base_replies_remaining, addon_replies_remaining,
            emergency_credit_amount, emergency_credit_activated,
            emergency_debt, auto_reply_enabled, starts_at, expires_at,
            expiry_reminder_sent_at, expired_notification_sent_at, version
       FROM subscriptions
      WHERE merchant_id = $1
      LIMIT 2${lock ? " FOR UPDATE" : ""}`,
    [merchantId],
  );
  if (result.length > 1) {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_AMBIGUOUS",
      "merchant subscription authority is ambiguous",
      503,
    );
  }
  return result[0] ? toSubscriptionRow(result[0]) : null;
}

async function refreshLockedSubscription(
  client: QueryTarget,
  row: SubscriptionRow,
  now: Date,
): Promise<LockedSubscription> {
  const batches = await loadBatches(client, row.id, row.merchant_id, now, true);
  const baseUsed = Math.min(row.base_reply_limit, row.base_replies_used);
  const baseRemaining = Math.max(0, row.base_reply_limit - baseUsed);
  const addonRemaining = batches.reduce((total, batch) => total + batch.remaining, 0);
  const addonUsed = batches.reduce(
    (total, batch) => total + (batch.amount - batch.remaining),
    0,
  );
  const totalRemaining = baseRemaining + addonRemaining;
  const totalUsed = baseUsed + addonUsed;
  let nextStatus = row.status;
  if (nextStatus !== "suspended" && nextStatus !== "pending_activation") {
    nextStatus =
      row.expires_at.getTime() <= now.getTime()
        ? "expired"
        : totalRemaining <= 0
          ? "replies_exhausted"
          : "active";
  }
  const nextAutoReply = nextStatus === "active" ? row.auto_reply_enabled : false;

  if (
    row.base_replies_used !== baseUsed ||
    row.base_replies_remaining !== baseRemaining ||
    row.addon_replies_remaining !== addonRemaining ||
    row.status !== nextStatus ||
    row.auto_reply_enabled !== nextAutoReply
  ) {
    await client.query(
      `UPDATE subscriptions
          SET base_replies_used = $3,
              base_replies_remaining = $4,
              addon_replies_remaining = $5,
              status = $6,
              auto_reply_enabled = $7,
              updated_at = GREATEST(updated_at, $8)
        WHERE id = $1 AND merchant_id = $2`,
      [
        row.id,
        row.merchant_id,
        baseUsed,
        baseRemaining,
        addonRemaining,
        nextStatus,
        nextAutoReply,
        now,
      ],
    );
    row.base_replies_used = baseUsed;
    row.base_replies_remaining = baseRemaining;
    row.addon_replies_remaining = addonRemaining;
    row.status = nextStatus;
    row.auto_reply_enabled = nextAutoReply;
  }

  return { row, batches, totalRemaining, totalUsed };
}

function apiRecord(state: LockedSubscription): SubscriptionApiRecord {
  const { row, batches } = state;
  const activeBatchAmount = batches.reduce((total, batch) => total + batch.amount, 0);
  return {
    id: row.id,
    merchant_id: row.merchant_id,
    plan_name: row.plan_name,
    price_iqd: row.price_iqd,
    reply_limit: row.base_reply_limit + activeBatchAmount,
    replies_used: state.totalUsed,
    replies_remaining: state.totalRemaining,
    base_reply_limit: row.base_reply_limit,
    base_replies_used: row.base_replies_used,
    base_replies_remaining: row.base_replies_remaining,
    addon_replies_remaining: row.addon_replies_remaining,
    addon_reply_batches: batches.map((batch) => ({
      id: batch.id,
      source: batch.source,
      purchased_at: batch.purchased_at.toISOString(),
      expires_at: batch.expires_at.toISOString(),
      amount: batch.amount,
      remaining: batch.remaining,
      ...(batch.expiry_reminder_sent_at
        ? { expiry_reminder_sent_at: batch.expiry_reminder_sent_at.toISOString() }
        : {}),
    })),
    billing_anchor_day: row.billing_anchor_day,
    start_date: row.starts_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    status: row.status,
    auto_reply_enabled: row.auto_reply_enabled,
    emergency_credit_used: row.emergency_credit_activated
      ? row.emergency_credit_amount
      : 0,
    emergency_credit_amount: row.emergency_credit_amount,
    emergency_credit_remaining: 0,
    emergency_credit_activated: row.emergency_credit_activated,
    emergency_debt: row.emergency_debt,
    pending_next_cycle_deduction: row.emergency_debt,
    ...(row.expiry_reminder_sent_at
      ? { expiry_reminder_sent_at: row.expiry_reminder_sent_at.toISOString() }
      : {}),
    ...(row.expired_notification_sent_at
      ? { expired_notification_sent_at: row.expired_notification_sent_at.toISOString() }
      : {}),
    version: row.version,
  };
}

function denied(
  code: Exclude<MerchantReplyEntitlementDecision, { allowed: true }>["code"],
  error: string,
): MerchantReplyEntitlementDecision {
  return { allowed: false, code, error };
}

async function readEventLedger(
  target: QueryTarget,
  eventId: string,
): Promise<{ debit: LedgerRow | null; credit: LedgerRow | null }> {
  const result = await queryRows<Record<string, unknown>>(
    target,
    `SELECT id, merchant_id, subscription_id, reply_batch_id, direction,
            amount, reason_code, external_event_id, balance_after, metadata
       FROM reply_ledger
      WHERE external_event_id = $1
        AND direction IN ('debit', 'credit')
      ORDER BY created_at ASC, id ASC`,
    [eventId],
  );
  const ledger = result.map(toLedgerRow);
  const debits = ledger.filter((item) => item.direction === "debit");
  const credits = ledger.filter((item) => item.direction === "credit");
  if (debits.length > 1 || credits.length > 1) {
    fail(
      "SUBSCRIPTION_ENTITLEMENT_LEDGER_AMBIGUOUS",
      "reply ledger authority is ambiguous",
      503,
    );
  }
  return { debit: debits[0] || null, credit: credits[0] || null };
}

async function advisoryEventLock(target: QueryTarget, eventId: string): Promise<void> {
  await target.query("SELECT pg_advisory_xact_lock(hashtext($1))", [eventId]);
}

export async function getCurrentSubscriptionPostgres(
  merchantId: string,
  now: Date = new Date(),
): Promise<SubscriptionApiRecord | null> {
  const normalizedMerchantId = requiredText(merchantId, 160);
  return withTransaction(async (client) => {
    const row = await loadSubscriptionRow(client, normalizedMerchantId, true);
    if (!row) return null;
    return apiRecord(await refreshLockedSubscription(client, row, now));
  });
}

export async function listSubscriptionsPostgres(
  now: Date = new Date(),
): Promise<SubscriptionApiRecord[]> {
  const pool = await databasePool();
  const result = await queryRows<Record<string, unknown>>(
    pool,
    `SELECT merchant_id FROM subscriptions ORDER BY starts_at DESC, merchant_id ASC`,
  );
  const output: SubscriptionApiRecord[] = [];
  for (const item of result) {
    const current = await getCurrentSubscriptionPostgres(
      requiredText(item.merchant_id, 160),
      now,
    );
    if (current) output.push(current);
  }
  return output;
}

export async function reserveMerchantAutoReplyPostgres(
  merchantId: string,
  eventId: string,
  now: Date = new Date(),
): Promise<MerchantReplyEntitlementDecision> {
  let normalizedMerchantId: string;
  let normalizedEventId: string;
  try {
    normalizedMerchantId = requiredText(merchantId, 160);
    normalizedEventId = requiredText(eventId, 300);
  } catch {
    return denied(
      "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      "merchant reply entitlement identity is unavailable",
    );
  }

  try {
    return await withTransaction(async (client) => {
      await advisoryEventLock(client, normalizedEventId);
      const existing = await readEventLedger(client, normalizedEventId);
      if (existing.debit) {
        if (existing.debit.merchant_id !== normalizedMerchantId) {
          return denied(
            "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
            "reply event identity collision detected",
          );
        }
        if (existing.credit) {
          return denied(
            "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
            "reply event was already restored and cannot be reserved again",
          );
        }
        const duplicateRow = await loadSubscriptionRow(
          client,
          normalizedMerchantId,
          true,
        );
        if (!duplicateRow) {
          return denied(
            "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
            "merchant subscription state is unavailable",
          );
        }
        const duplicateState = await refreshLockedSubscription(
          client,
          duplicateRow,
          now,
        );
        return {
          allowed: true,
          duplicate: true,
          repliesRemaining: duplicateState.totalRemaining,
          subscriptionId: existing.debit.subscription_id || duplicateRow.id,
        };
      }

      const row = await loadSubscriptionRow(client, normalizedMerchantId, true);
      if (!row) {
        return denied(
          "MERCHANT_SUBSCRIPTION_REQUIRED",
          "active merchant subscription is required",
        );
      }
      const state = await refreshLockedSubscription(client, row, now);
      if (row.status === "pending_activation") {
        return denied(
          "MERCHANT_SUBSCRIPTION_PENDING",
          "merchant subscription is pending activation",
        );
      }
      if (row.status === "suspended") {
        return denied(
          "MERCHANT_SUBSCRIPTION_SUSPENDED",
          "merchant subscription is suspended",
        );
      }
      if (row.status === "expired") {
        return denied(
          "MERCHANT_SUBSCRIPTION_EXPIRED",
          "merchant subscription is expired",
        );
      }
      if (row.status === "replies_exhausted" || state.totalRemaining <= 0) {
        return denied(
          "MERCHANT_REPLIES_EXHAUSTED",
          "merchant reply balance is exhausted",
        );
      }
      if (!row.auto_reply_enabled) {
        return denied(
          "MERCHANT_AUTO_REPLY_DISABLED",
          "merchant automatic replies are disabled",
        );
      }

      let replyBatchId: string | null = null;
      let source: "base" | "addon" = "base";
      if (row.base_replies_remaining > 0) {
        row.base_replies_used += 1;
        row.base_replies_remaining -= 1;
        await client.query(
          `UPDATE subscriptions
              SET base_replies_used = $3,
                  base_replies_remaining = $4,
                  updated_at = $5
            WHERE id = $1 AND merchant_id = $2`,
          [
            row.id,
            row.merchant_id,
            row.base_replies_used,
            row.base_replies_remaining,
            now,
          ],
        );
      } else {
        source = "addon";
        const batch = state.batches.find((item) => item.remaining > 0);
        if (!batch) {
          return denied(
            "MERCHANT_REPLIES_EXHAUSTED",
            "merchant reply balance is exhausted",
          );
        }
        batch.remaining -= 1;
        replyBatchId = batch.id;
        await client.query(
          `UPDATE subscription_reply_batches
              SET remaining = $3
            WHERE id = $1 AND merchant_id = $2`,
          [batch.id, row.merchant_id, batch.remaining],
        );
      }

      const repliesRemaining = state.totalRemaining - 1;
      const addonRemaining = state.batches.reduce(
        (total, batch) => total + batch.remaining,
        0,
      );
      const nextStatus: SubscriptionStatus =
        repliesRemaining <= 0 ? "replies_exhausted" : "active";
      await client.query(
        `UPDATE subscriptions
            SET addon_replies_remaining = $3,
                status = $4,
                auto_reply_enabled = $5,
                updated_at = $6
          WHERE id = $1 AND merchant_id = $2`,
        [
          row.id,
          row.merchant_id,
          addonRemaining,
          nextStatus,
          nextStatus === "active" ? row.auto_reply_enabled : false,
          now,
        ],
      );

      await client.query(
        `INSERT INTO reply_ledger (
           id, merchant_id, subscription_id, reply_batch_id, direction,
           amount, reason_code, external_event_id, balance_after, metadata,
           created_at
         ) VALUES ($1, $2, $3, $4, 'debit', 1, $5, $6, $7, $8::jsonb, $9)`,
        [
          `reply-ledger-${crypto.randomUUID()}`,
          row.merchant_id,
          row.id,
          replyBatchId,
          "meta_auto_reply_reservation",
          normalizedEventId,
          repliesRemaining,
          JSON.stringify({ source }),
          now,
        ],
      );

      return {
        allowed: true,
        duplicate: false,
        repliesRemaining,
        subscriptionId: row.id,
      };
    });
  } catch {
    return denied(
      "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      "merchant reply entitlement is unavailable",
    );
  }
}

export async function restoreMerchantAutoReplyPostgres(
  eventId: string,
  restore: ReplyRestoreKind,
  now: Date = new Date(),
): Promise<ReplyRestoreResult> {
  const normalizedEventId = String(eventId || "").trim();
  if (!normalizedEventId) return { restored: false, reason: "event_id_missing" };

  return withTransaction(async (client) => {
    await advisoryEventLock(client, normalizedEventId);
    const ledger = await readEventLedger(client, normalizedEventId);
    if (!ledger.debit) {
      return { restored: false, reason: "reservation_not_found" };
    }
    if (ledger.credit) {
      return {
        restored: false,
        reason:
          ledger.credit.reason_code === "META_REPLY_FAILED"
            ? "already_refunded"
            : "already_released",
      };
    }
    const debit = ledger.debit;
    const merchantId = debit.merchant_id;
    const subscriptionId = debit.subscription_id;
    if (!subscriptionId) {
      return { restored: false, reason: "reservation_identity_invalid" };
    }

    const result = await queryRows<Record<string, unknown>>(
      client,
      `SELECT id, merchant_id, plan_name, status, price_iqd,
              billing_anchor_day, base_reply_limit, base_replies_used,
              base_replies_remaining, addon_replies_remaining,
              emergency_credit_amount, emergency_credit_activated,
              emergency_debt, auto_reply_enabled, starts_at, expires_at,
              expiry_reminder_sent_at, expired_notification_sent_at, version
         FROM subscriptions
        WHERE id = $1 AND merchant_id = $2
        LIMIT 2
        FOR UPDATE`,
      [subscriptionId, merchantId],
    );
    if (result.length !== 1) {
      return { restored: false, reason: "subscription_not_found" };
    }
    const row = toSubscriptionRow(result[0]);

    if (debit.reply_batch_id) {
      const batchResult = await queryRows<Record<string, unknown>>(
        client,
        `SELECT id, subscription_id, merchant_id, source, amount, remaining,
                purchased_at, expires_at, expiry_reminder_sent_at
           FROM subscription_reply_batches
          WHERE id = $1 AND subscription_id = $2 AND merchant_id = $3
          LIMIT 2
          FOR UPDATE`,
        [debit.reply_batch_id, subscriptionId, merchantId],
      );
      if (batchResult.length !== 1) {
        return { restored: false, reason: "refund_batch_not_found" };
      }
      const batch = toBatchRow(batchResult[0]);
      if (batch.remaining >= batch.amount) {
        return { restored: false, reason: "refund_balance_conflict" };
      }
      await client.query(
        `UPDATE subscription_reply_batches
            SET remaining = remaining + 1
          WHERE id = $1 AND subscription_id = $2 AND merchant_id = $3`,
        [batch.id, subscriptionId, merchantId],
      );
    } else {
      if (row.base_replies_used <= 0) {
        return { restored: false, reason: "refund_balance_conflict" };
      }
      await client.query(
        `UPDATE subscriptions
            SET base_replies_used = base_replies_used - 1,
                base_replies_remaining = base_replies_remaining + 1,
                updated_at = $3
          WHERE id = $1 AND merchant_id = $2`,
        [subscriptionId, merchantId, now],
      );
    }

    await client.query(
      `INSERT INTO reply_ledger (
         id, merchant_id, subscription_id, reply_batch_id, direction,
         amount, reason_code, external_event_id, balance_after, metadata,
         created_at
       ) VALUES ($1, $2, $3, $4, 'credit', 1, $5, $6, NULL, $7::jsonb, $8)`,
      [
        `reply-ledger-${crypto.randomUUID()}`,
        merchantId,
        subscriptionId,
        debit.reply_batch_id,
        restore.kind === "refund" ? "META_REPLY_FAILED" : restore.reasonCode,
        normalizedEventId,
        JSON.stringify({
          restore_kind: restore.kind,
          debit_ledger_id: debit.id,
        }),
        now,
      ],
    );

    const refreshedRow = await loadSubscriptionRow(client, merchantId, true);
    if (!refreshedRow || refreshedRow.id !== subscriptionId) {
      return { restored: false, reason: "subscription_not_found" };
    }
    const refreshed = await refreshLockedSubscription(client, refreshedRow, now);
    if (
      refreshed.totalRemaining > 0 &&
      refreshed.row.status === "active" &&
      row.status === "replies_exhausted"
    ) {
      await client.query(
        `UPDATE subscriptions
            SET auto_reply_enabled = TRUE, updated_at = $3
          WHERE id = $1 AND merchant_id = $2`,
        [subscriptionId, merchantId, now],
      );
    }

    return { restored: true, merchantId, subscriptionId };
  });
}

async function lockApprovedMerchant(
  client: QueryTarget,
  merchantId: string,
): Promise<void> {
  const result = await queryRows<Record<string, unknown>>(
    client,
    `SELECT id, status, account_status
       FROM merchants
      WHERE id = $1
      LIMIT 2
      FOR UPDATE`,
    [merchantId],
  );
  if (result.length !== 1) {
    fail("MERCHANT_NOT_FOUND", "merchant not found", 404);
  }
  if (
    String(result[0].status) !== "approved" ||
    String(result[0].account_status) !== "approved"
  ) {
    fail(
      "APPROVED_MERCHANT_REQUIRED",
      "approved merchant account is required",
      403,
    );
  }
}

async function writeAudit(
  client: QueryTarget,
  input: {
    actorAccountId: string;
    merchantId: string;
    actionType: string;
    subscriptionId: string;
    reasonCode?: string;
    details?: string;
    metadata?: Record<string, string | number | boolean | null>;
    now: Date;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (
       id, actor_kind, actor_account_id, merchant_id, action_type,
       entity_type, entity_id, reason_code, details, metadata, created_at
     ) VALUES ($1, 'account', $2, $3, $4, 'subscription', $5, $6, $7, $8::jsonb, $9)`,
    [
      `audit-${crypto.randomUUID()}`,
      input.actorAccountId,
      input.merchantId,
      input.actionType,
      input.subscriptionId,
      input.reasonCode || null,
      input.details || null,
      JSON.stringify(input.metadata || {}),
      input.now,
    ],
  );
}

export async function activateEmergencyCreditPostgres(
  merchantId: string,
  actorAccountId: string,
  now: Date = new Date(),
): Promise<SubscriptionApiRecord> {
  const normalizedMerchantId = requiredText(merchantId, 160);
  return withTransaction(async (client) => {
    await lockApprovedMerchant(client, normalizedMerchantId);
    const row = await loadSubscriptionRow(client, normalizedMerchantId, true);
    if (!row) fail("SUBSCRIPTION_NOT_FOUND", "subscription not found", 404);
    const state = await refreshLockedSubscription(client, row, now);
    if (row.status === "expired") {
      fail("SUBSCRIPTION_EXPIRED", "subscription is expired", 409);
    }
    if (row.status === "suspended" || row.status === "pending_activation") {
      fail(
        "SUBSCRIPTION_NOT_ACTIVE",
        "active subscription is required",
        409,
      );
    }
    const threshold = 500;
    if (state.totalRemaining > threshold) {
      fail(
        "EMERGENCY_COMBINED_THRESHOLD_NOT_REACHED",
        "emergency credit requires 500 or fewer combined base and add-on replies",
        409,
        {
          base_replies_remaining: row.base_replies_remaining,
          addon_replies_remaining: row.addon_replies_remaining,
          eligible_balance: state.totalRemaining,
          threshold,
        },
      );
    }
    if (row.emergency_credit_activated) {
      fail(
        "EMERGENCY_ALREADY_USED",
        "emergency credit was already used in this cycle",
      );
    }
    if (row.emergency_debt > 0) {
      fail(
        "EMERGENCY_DEBT_OUTSTANDING",
        "previous emergency debt must be paid first",
      );
    }
    if (row.emergency_credit_amount <= 0) {
      fail("EMERGENCY_UNAVAILABLE", "emergency credit is unavailable");
    }

    const anchorDay = getBaghdadDateParts(now).day;
    const batchId = `emergency-replies-${crypto.randomUUID()}`;
    const expiresAt = addBaghdadCalendarMonths(now, 3, anchorDay);
    await client.query(
      `INSERT INTO subscription_reply_batches (
         id, subscription_id, merchant_id, source, amount, remaining,
         purchased_at, expires_at, created_at
       ) VALUES ($1, $2, $3, 'emergency', $4, $4, $5, $6, $5)`,
      [
        batchId,
        row.id,
        normalizedMerchantId,
        row.emergency_credit_amount,
        now,
        expiresAt,
      ],
    );
    await client.query(
      `UPDATE subscriptions
          SET emergency_credit_activated = TRUE,
              emergency_debt = $3,
              addon_replies_remaining = addon_replies_remaining + $3,
              status = 'active',
              auto_reply_enabled = TRUE,
              version = version + 1,
              updated_at = $4
        WHERE id = $1 AND merchant_id = $2`,
      [row.id, normalizedMerchantId, row.emergency_credit_amount, now],
    );
    await writeAudit(client, {
      actorAccountId,
      merchantId: normalizedMerchantId,
      actionType: "subscription_emergency_activated",
      subscriptionId: row.id,
      metadata: {
        batch_id: batchId,
        amount: row.emergency_credit_amount,
      },
      now,
    });

    const refreshedRow = await loadSubscriptionRow(client, normalizedMerchantId, true);
    if (!refreshedRow) fail("SUBSCRIPTION_NOT_FOUND", "subscription not found", 404);
    return apiRecord(await refreshLockedSubscription(client, refreshedRow, now));
  });
}

export async function applySubscriptionPlanOperationPostgres(input: {
  merchantId: string;
  actorAccountId: string;
  operation: SubscriptionPlanOperation;
  plan: PaidSubscriptionPlan;
  now?: Date;
}): Promise<SubscriptionApiRecord> {
  const merchantId = requiredText(input.merchantId, 160);
  try {
    await applySubscriptionPlanCyclePostgres({
      merchantId,
      actorAccountId: input.actorAccountId,
      operation: input.operation,
      plan: input.plan,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof SubscriptionPlanCycleError) {
      throw new SubscriptionEntitlementAuthorityError(
        error.code,
        error.message,
        error.status,
        error.details,
      );
    }
    throw error;
  }
  const current = await getCurrentSubscriptionPostgres(merchantId, input.now || new Date());
  if (!current) fail("SUBSCRIPTION_NOT_FOUND", "subscription not found", 404);
  return current;
}

export async function applySubscriptionActionPostgres(input: {
  merchantId: string;
  actorAccountId: string;
  action: SubscriptionAction;
  amount?: number;
  enabled?: boolean;
  now?: Date;
}): Promise<SubscriptionApiRecord> {
  const merchantId = requiredText(input.merchantId, 160);
  const now = input.now || new Date();

  return withTransaction(async (client) => {
    await lockApprovedMerchant(client, merchantId);
    const row = await loadSubscriptionRow(client, merchantId, true);
    if (!row) fail("SUBSCRIPTION_NOT_FOUND", "subscription not found", 404);
    let state = await refreshLockedSubscription(client, row, now);

    if (input.action === "add_replies") {
      if (!Number.isSafeInteger(input.amount) || Number(input.amount) <= 0) {
        fail("INVALID_REPLY_AMOUNT", "positive integer amount is required", 400);
      }
      const amount = Number(input.amount);
      const debtPaid = Math.min(row.emergency_debt, amount);
      const addonAdded = amount - debtPaid;
      const nextDebt = row.emergency_debt - debtPaid;
      if (addonAdded > 0) {
        const anchorDay = getBaghdadDateParts(now).day;
        await client.query(
          `INSERT INTO subscription_reply_batches (
             id, subscription_id, merchant_id, source, amount, remaining,
             purchased_at, expires_at, created_at
           ) VALUES ($1, $2, $3, 'purchase', $4, $4, $5, $6, $5)`,
          [
            `addon-replies-${crypto.randomUUID()}`,
            row.id,
            merchantId,
            addonAdded,
            now,
            addBaghdadCalendarMonths(now, 3, anchorDay),
          ],
        );
      }
      await client.query(
        `UPDATE subscriptions
            SET emergency_debt = $3,
                status = CASE WHEN expires_at > $4 THEN 'active' ELSE status END,
                auto_reply_enabled = CASE WHEN expires_at > $4 THEN TRUE ELSE auto_reply_enabled END,
                version = version + 1,
                updated_at = $4
          WHERE id = $1 AND merchant_id = $2`,
        [row.id, merchantId, nextDebt, now],
      );
      await writeAudit(client, {
        actorAccountId: input.actorAccountId,
        merchantId,
        actionType: "replies_added",
        subscriptionId: row.id,
        metadata: {
          amount,
          emergency_debt_paid: debtPaid,
          addon_replies_added: addonAdded,
        },
        now,
      });
    } else if (input.action === "deduct_replies") {
      if (!Number.isSafeInteger(input.amount) || Number(input.amount) <= 0) {
        fail("INVALID_REPLY_AMOUNT", "positive integer amount is required", 400);
      }
      let remaining = Number(input.amount);
      if (remaining > state.totalRemaining) {
        fail(
          "REPLY_AMOUNT_EXCEEDS_BALANCE",
          "amount exceeds remaining replies",
          409,
          { replies_remaining: state.totalRemaining },
        );
      }
      const baseDebit = Math.min(row.base_replies_remaining, remaining);
      if (baseDebit > 0) {
        row.base_replies_used += baseDebit;
        row.base_replies_remaining -= baseDebit;
        remaining -= baseDebit;
        await client.query(
          `UPDATE subscriptions
              SET base_replies_used = $3,
                  base_replies_remaining = $4,
                  updated_at = $5
            WHERE id = $1 AND merchant_id = $2`,
          [
            row.id,
            merchantId,
            row.base_replies_used,
            row.base_replies_remaining,
            now,
          ],
        );
        await client.query(
          `INSERT INTO reply_ledger (
             id, merchant_id, subscription_id, direction, amount, reason_code,
             metadata, created_at
           ) VALUES ($1, $2, $3, 'debit', $4, 'admin_deduct_replies', $5::jsonb, $6)`,
          [
            `reply-ledger-${crypto.randomUUID()}`,
            merchantId,
            row.id,
            baseDebit,
            JSON.stringify({ source: "base", actor_account_id: input.actorAccountId }),
            now,
          ],
        );
      }
      for (const batch of state.batches) {
        if (remaining <= 0) break;
        const debit = Math.min(batch.remaining, remaining);
        if (debit <= 0) continue;
        batch.remaining -= debit;
        remaining -= debit;
        await client.query(
          `UPDATE subscription_reply_batches
              SET remaining = $3
            WHERE id = $1 AND merchant_id = $2`,
          [batch.id, merchantId, batch.remaining],
        );
        await client.query(
          `INSERT INTO reply_ledger (
             id, merchant_id, subscription_id, reply_batch_id, direction,
             amount, reason_code, metadata, created_at
           ) VALUES ($1, $2, $3, $4, 'debit', $5, 'admin_deduct_replies', $6::jsonb, $7)`,
          [
            `reply-ledger-${crypto.randomUUID()}`,
            merchantId,
            row.id,
            batch.id,
            debit,
            JSON.stringify({ source: "addon", actor_account_id: input.actorAccountId }),
            now,
          ],
        );
      }
      await writeAudit(client, {
        actorAccountId: input.actorAccountId,
        merchantId,
        actionType: "replies_deducted",
        subscriptionId: row.id,
        metadata: { amount: Number(input.amount) },
        now,
      });
    } else if (input.action === "reset_replies") {
      const restored = row.base_replies_used;
      await client.query(
        `UPDATE subscriptions
            SET base_replies_used = 0,
                base_replies_remaining = base_reply_limit,
                version = version + 1,
                updated_at = $3
          WHERE id = $1 AND merchant_id = $2`,
        [row.id, merchantId, now],
      );
      if (restored > 0) {
        await client.query(
          `INSERT INTO reply_ledger (
             id, merchant_id, subscription_id, direction, amount, reason_code,
             metadata, created_at
           ) VALUES ($1, $2, $3, 'credit', $4, 'admin_reset_replies', $5::jsonb, $6)`,
          [
            `reply-ledger-${crypto.randomUUID()}`,
            merchantId,
            row.id,
            restored,
            JSON.stringify({ source: "base", actor_account_id: input.actorAccountId }),
            now,
          ],
        );
      }
      await writeAudit(client, {
        actorAccountId: input.actorAccountId,
        merchantId,
        actionType: "replies_reset",
        subscriptionId: row.id,
        metadata: { limit: row.base_reply_limit },
        now,
      });
    } else if (input.action === "set_auto_reply") {
      if (typeof input.enabled !== "boolean") {
        fail("AUTO_REPLY_ENABLED_REQUIRED", "enabled boolean is required", 400);
      }
      if (input.enabled && row.status !== "active") {
        fail(
          "ACTIVE_SUBSCRIPTION_REQUIRED",
          "automatic replies require an active subscription",
          409,
        );
      }
      await client.query(
        `UPDATE subscriptions
            SET auto_reply_enabled = $3,
                version = version + 1,
                updated_at = $4
          WHERE id = $1 AND merchant_id = $2`,
        [row.id, merchantId, input.enabled, now],
      );
      await writeAudit(client, {
        actorAccountId: input.actorAccountId,
        merchantId,
        actionType: input.enabled ? "auto_reply_enabled" : "auto_reply_disabled",
        subscriptionId: row.id,
        now,
      });
    }

    const next = await loadSubscriptionRow(client, merchantId, true);
    if (!next) fail("SUBSCRIPTION_NOT_FOUND", "subscription not found", 404);
    state = await refreshLockedSubscription(client, next, now);
    return apiRecord(state);
  });
}
