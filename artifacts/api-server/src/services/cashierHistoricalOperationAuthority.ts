import crypto from "node:crypto";
import {
  operationalQueryRows,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

type DbInstant = Date | string;

export type CashierHistoricalOperationDecision =
  | {
      allowed: true;
      stationId: string;
      subscriptionId: string;
      billingOrderId: string;
    }
  | {
      allowed: false;
      code:
        | "CASHIER_OPERATION_CURRENT_ENTITLEMENT_REQUIRED"
        | "CASHIER_OPERATION_DEVICE_AUTHORITY_REQUIRED"
        | "CASHIER_OPERATION_DEVICE_AUTHORITY_AMBIGUOUS"
        | "CASHIER_OPERATION_SEAT_AUTHORITY_REQUIRED"
        | "CASHIER_OPERATION_BILLING_AUTHORITY_REQUIRED"
        | "CASHIER_OPERATION_SUSPENDED_AT_OCCURRED_TIME";
      reason: string;
    };

function toDate(value: DbInstant | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function evaluateCashierHistoricalOperationAuthorityInTransaction(input: {
  target: OperationalQueryTarget;
  merchantId: string;
  deviceId: string;
  occurredAt: string;
  now?: Date;
}): Promise<CashierHistoricalOperationDecision> {
  const occurredAt = toDate(input.occurredAt);
  const now = input.now || new Date();
  if (!occurredAt) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_BILLING_AUTHORITY_REQUIRED",
      reason: "cashier operation timestamp is invalid",
    };
  }

  const subscriptions = await operationalQueryRows<{
    id: string;
    status: string;
    billing_period_end: DbInstant | null;
    grace_duration_seconds: number | string;
  }>(
    input.target,
    `SELECT id, status, billing_period_end, grace_duration_seconds
       FROM merchant_cashier_subscriptions
      WHERE merchant_id = $1
      LIMIT 1
      FOR SHARE`,
    [input.merchantId],
  );
  const subscription = subscriptions[0];
  if (!subscription || subscription.status !== "active" || !subscription.billing_period_end) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_CURRENT_ENTITLEMENT_REQUIRED",
      reason: "cashier subscription must be active before offline operations can sync",
    };
  }
  const currentEnd = toDate(subscription.billing_period_end);
  const graceSeconds = Number(subscription.grace_duration_seconds);
  if (
    !currentEnd ||
    !Number.isSafeInteger(graceSeconds) ||
    graceSeconds <= 0 ||
    now.getTime() >= currentEnd.getTime() + graceSeconds * 1000
  ) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_CURRENT_ENTITLEMENT_REQUIRED",
      reason: "cashier subscription must be renewed before offline operations can sync",
    };
  }

  const credentials = await operationalQueryRows<{
    station_id: string;
  }>(
    input.target,
    `SELECT station_id
       FROM cashier_station_credentials
      WHERE merchant_id = $1
        AND device_id = $2
        AND issued_at <= $3
        AND expires_at > $3
        AND (revoked_at IS NULL OR revoked_at > $3)
      ORDER BY issued_at DESC, id DESC
      LIMIT 2`,
    [input.merchantId, input.deviceId, occurredAt],
  );
  if (credentials.length === 0) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_DEVICE_AUTHORITY_REQUIRED",
      reason: "cashier device did not hold a valid station credential at operation time",
    };
  }
  if (
    credentials.length > 1 &&
    credentials[0].station_id !== credentials[1].station_id
  ) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_DEVICE_AUTHORITY_AMBIGUOUS",
      reason: "cashier device authority is ambiguous at operation time",
    };
  }
  const stationId = credentials[0].station_id;

  const assignments = await operationalQueryRows<{
    subscription_id: string;
  }>(
    input.target,
    `SELECT subscription_id
       FROM cashier_station_seat_assignments
      WHERE merchant_id = $1
        AND station_id = $2
        AND assigned_at <= $3
        AND (released_at IS NULL OR released_at > $3)
      ORDER BY assigned_at DESC, id DESC
      LIMIT 2`,
    [input.merchantId, stationId, occurredAt],
  );
  if (assignments.length === 0) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_SEAT_AUTHORITY_REQUIRED",
      reason: "cashier station did not hold a licensed seat at operation time",
    };
  }
  if (
    assignments.length > 1 &&
    assignments[0].subscription_id !== assignments[1].subscription_id
  ) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_SEAT_AUTHORITY_REQUIRED",
      reason: "cashier station seat authority is ambiguous at operation time",
    };
  }
  const subscriptionId = assignments[0].subscription_id;

  const cycles = await operationalQueryRows<{
    id: string;
  }>(
    input.target,
    `SELECT billing.id
       FROM cashier_billing_orders billing
       JOIN cashier_entitlement_applications application
         ON application.order_id = billing.id
        AND application.merchant_id = billing.merchant_id
        AND application.subscription_id = $2
      WHERE billing.merchant_id = $1
        AND billing.status = 'applied'
        AND billing.operation IN ('activate','renew')
        AND billing.applied_at IS NOT NULL
        AND $3 >= GREATEST(billing.billing_period_start, billing.applied_at)
        AND $3 < billing.billing_period_end
                 + make_interval(secs => billing.grace_duration_seconds)
      ORDER BY billing.billing_period_start DESC, billing.id DESC
      LIMIT 1`,
    [input.merchantId, subscriptionId, occurredAt],
  );
  const cycle = cycles[0];
  if (!cycle) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_BILLING_AUTHORITY_REQUIRED",
      reason: "cashier operation is outside every paid billing period and grace window",
    };
  }

  const lifecycle = await operationalQueryRows<{ action: string }>(
    input.target,
    `SELECT action
       FROM cashier_entitlement_audit_events
      WHERE merchant_id = $1
        AND subscription_id = $2
        AND action IN ('activate','renew','suspend','resume','cancel')
        AND created_at <= $3
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [input.merchantId, subscriptionId, occurredAt],
  );
  if (lifecycle[0]?.action === "suspend" || lifecycle[0]?.action === "cancel") {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_SUSPENDED_AT_OCCURRED_TIME",
      reason: "cashier subscription was suspended or cancelled at operation time",
    };
  }

  return {
    allowed: true,
    stationId,
    subscriptionId,
    billingOrderId: cycle.id,
  };
}

export type CashierOperationTimelineDecision =
  | { allowed: true; replayed: boolean }
  | {
      allowed: false;
      code:
        | "CASHIER_OPERATION_SEQUENCE_CONFLICT"
        | "CASHIER_OPERATION_CLOCK_ROLLBACK"
        | "CASHIER_OPERATION_CLOCK_AHEAD";
      reason: string;
    };

const CASHIER_CLOCK_ROLLBACK_TOLERANCE_MS = 2 * 60 * 1000;
const CASHIER_CLOCK_AHEAD_TOLERANCE_MS = 5 * 60 * 1000;

export async function recordCashierOperationTimelineInTransaction(input: {
  target: OperationalQueryTarget;
  merchantId: string;
  deviceId: string;
  deviceSequence: number;
  operationId: string;
  operationKind: "sale" | "return" | "void";
  occurredAt: string;
  authority: Extract<CashierHistoricalOperationDecision, { allowed: true }>;
  now?: Date;
}): Promise<CashierOperationTimelineDecision> {
  const occurredAt = toDate(input.occurredAt);
  const now = input.now || new Date();
  if (
    !occurredAt ||
    !Number.isSafeInteger(input.deviceSequence) ||
    input.deviceSequence <= 0
  ) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_SEQUENCE_CONFLICT",
      reason: "cashier operation sequence or timestamp is invalid",
    };
  }
  if (occurredAt.getTime() > now.getTime() + CASHIER_CLOCK_AHEAD_TOLERANCE_MS) {
    return {
      allowed: false,
      code: "CASHIER_OPERATION_CLOCK_AHEAD",
      reason: "cashier operation timestamp is too far ahead of server time",
    };
  }

  const existing = await operationalQueryRows<{
    operation_id: string;
    operation_kind: string;
    station_id: string;
    subscription_id: string;
    billing_order_id: string;
    occurred_at: DbInstant;
  }>(
    input.target,
    `SELECT operation_id, operation_kind, station_id, subscription_id,
            billing_order_id, occurred_at
       FROM cashier_device_operation_timeline
      WHERE merchant_id = $1
        AND device_id = $2
        AND device_sequence = $3
      LIMIT 1
      FOR UPDATE`,
    [input.merchantId, input.deviceId, input.deviceSequence],
  );
  if (existing[0]) {
    const existingOccurredAt = toDate(existing[0].occurred_at);
    const same =
      existing[0].operation_id === input.operationId &&
      existing[0].operation_kind === input.operationKind &&
      existing[0].station_id === input.authority.stationId &&
      existing[0].subscription_id === input.authority.subscriptionId &&
      existing[0].billing_order_id === input.authority.billingOrderId &&
      existingOccurredAt?.toISOString() === occurredAt.toISOString();
    return same
      ? { allowed: true, replayed: true }
      : {
          allowed: false,
          code: "CASHIER_OPERATION_SEQUENCE_CONFLICT",
          reason: "cashier device sequence was already used by another operation",
        };
  }

  const previous = await operationalQueryRows<{
    device_sequence: number | string;
    occurred_at: DbInstant;
  }>(
    input.target,
    `SELECT device_sequence, occurred_at
       FROM cashier_device_operation_timeline
      WHERE merchant_id = $1
        AND device_id = $2
        AND device_sequence < $3
      ORDER BY device_sequence DESC
      LIMIT 1
      FOR SHARE`,
    [input.merchantId, input.deviceId, input.deviceSequence],
  );
  if (previous[0]) {
    const previousAt = toDate(previous[0].occurred_at);
    if (
      previousAt &&
      occurredAt.getTime() + CASHIER_CLOCK_ROLLBACK_TOLERANCE_MS <
        previousAt.getTime()
    ) {
      return {
        allowed: false,
        code: "CASHIER_OPERATION_CLOCK_ROLLBACK",
        reason: "cashier operation clock moved backwards relative to device sequence",
      };
    }
  }

  const next = await operationalQueryRows<{
    device_sequence: number | string;
    occurred_at: DbInstant;
  }>(
    input.target,
    `SELECT device_sequence, occurred_at
       FROM cashier_device_operation_timeline
      WHERE merchant_id = $1
        AND device_id = $2
        AND device_sequence > $3
      ORDER BY device_sequence ASC
      LIMIT 1
      FOR SHARE`,
    [input.merchantId, input.deviceId, input.deviceSequence],
  );
  if (next[0]) {
    const nextAt = toDate(next[0].occurred_at);
    if (
      nextAt &&
      occurredAt.getTime() >
        nextAt.getTime() + CASHIER_CLOCK_ROLLBACK_TOLERANCE_MS
    ) {
      return {
        allowed: false,
        code: "CASHIER_OPERATION_CLOCK_ROLLBACK",
        reason: "cashier operation timestamp conflicts with a later device sequence",
      };
    }
  }

  await input.target.query(
    `INSERT INTO cashier_device_operation_timeline (
       id, merchant_id, subscription_id, billing_order_id, station_id,
       device_id, device_sequence, operation_id, operation_kind,
       occurred_at, accepted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      `cashier_timeline_${crypto.randomUUID()}`,
      input.merchantId,
      input.authority.subscriptionId,
      input.authority.billingOrderId,
      input.authority.stationId,
      input.deviceId,
      input.deviceSequence,
      input.operationId,
      input.operationKind,
      occurredAt,
      now,
    ],
  );
  return { allowed: true, replayed: false };
}
