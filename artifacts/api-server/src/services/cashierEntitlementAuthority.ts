import crypto from "node:crypto";
import {
  operationalPostgresAuthorityRequired,
  operationalQueryRows,
  withMerchantOperationalTransaction,
  type OperationalQueryTarget,
} from "./operationalPostgresAuthority";

export const CASHIER_DEFAULT_SEAT_PRICE_IQD = 3900;
export const CASHIER_DEFAULT_GRACE_SECONDS = 7 * 24 * 60 * 60;

type DbInstant = Date | string;

export type CashierEntitlementState =
  | "inactive"
  | "active"
  | "grace"
  | "restricted"
  | "suspended";

export type CashierSubscriptionRow = {
  id: string;
  merchant_id: string;
  status: string;
  licensed_seats: number | string;
  price_per_seat_iqd: number | string;
  billing_period_start: DbInstant | null;
  billing_period_end: DbInstant | null;
  grace_duration_seconds: number | string;
  scheduled_licensed_seats: number | string | null;
  scheduled_change_at: DbInstant | null;
  version: number | string;
};

export type CashierEntitlementSnapshot = {
  subscription_id: string;
  merchant_id: string;
  state: CashierEntitlementState;
  licensed_seats: number;
  price_per_seat_iqd: number;
  billing_period_start?: string;
  billing_period_end?: string;
  grace_until?: string;
  scheduled_licensed_seats?: number;
  scheduled_change_at?: string;
  version: number;
  server_time: string;
};

export class CashierEntitlementError extends Error {
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
    this.name = "CashierEntitlementError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function assertAuthority(): void {
  if (!operationalPostgresAuthorityRequired()) {
    throw new CashierEntitlementError(
      "CASHIER_ENTITLEMENT_POSTGRES_REQUIRED",
      "cashier entitlement authority requires PostgreSQL operational authority",
      503,
    );
  }
}

function instant(value: DbInstant | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new CashierEntitlementError(
      "CASHIER_ENTITLEMENT_STATE_INVALID",
      "cashier entitlement contains an invalid timestamp",
      500,
    );
  }
  return date;
}

function safeInt(value: number | string, field: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new CashierEntitlementError(
      "CASHIER_ENTITLEMENT_STATE_INVALID",
      `cashier entitlement ${field} is invalid`,
      500,
    );
  }
  return parsed;
}

export function cashierSeatPriceIqd(env: NodeJS.ProcessEnv = process.env): number {
  const raw = String(env.FAWRI_CASHIER_SEAT_PRICE_IQD || "").trim();
  if (!raw) return CASHIER_DEFAULT_SEAT_PRICE_IQD;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CashierEntitlementError(
      "CASHIER_SEAT_PRICE_CONFIGURATION_INVALID",
      "cashier seat price configuration is invalid",
      500,
    );
  }
  return value;
}

export function cashierGraceSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = String(env.FAWRI_CASHIER_GRACE_SECONDS || "").trim();
  if (!raw) return CASHIER_DEFAULT_GRACE_SECONDS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CashierEntitlementError(
      "CASHIER_GRACE_CONFIGURATION_INVALID",
      "cashier grace configuration is invalid",
      500,
    );
  }
  return value;
}

export function addCashierBillingMonth(start: Date): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const targetMonthStart = new Date(Date.UTC(year, month + 1, 1));
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

export function calculateCashierProrationIqd(input: {
  unitPriceIqd: number;
  additionalSeats: number;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  effectiveAt: Date;
}): number {
  const { unitPriceIqd, additionalSeats, billingPeriodStart, billingPeriodEnd } = input;
  if (!Number.isSafeInteger(unitPriceIqd) || unitPriceIqd <= 0) {
    throw new CashierEntitlementError("CASHIER_PRORATION_INPUT_INVALID", "unit price is invalid", 400);
  }
  if (!Number.isSafeInteger(additionalSeats) || additionalSeats <= 0) {
    throw new CashierEntitlementError("CASHIER_PRORATION_INPUT_INVALID", "additional seats are invalid", 400);
  }
  const startMs = billingPeriodStart.getTime();
  const endMs = billingPeriodEnd.getTime();
  const effectiveMs = input.effectiveAt.getTime();
  if (![startMs, endMs, effectiveMs].every(Number.isFinite) || endMs <= startMs) {
    throw new CashierEntitlementError("CASHIER_PRORATION_INPUT_INVALID", "billing period is invalid", 400);
  }
  if (effectiveMs >= endMs) {
    throw new CashierEntitlementError(
      "CASHIER_BILLING_PERIOD_ENDED",
      "cashier billing period has already ended",
      409,
    );
  }
  const boundedEffective = Math.max(startMs, effectiveMs);
  const period = BigInt(endMs - startMs);
  const remaining = BigInt(endMs - boundedEffective);
  const numerator = BigInt(unitPriceIqd) * BigInt(additionalSeats) * remaining;
  // IQD is billed in whole dinars. Round half-up deterministically.
  const rounded = (numerator + period / 2n) / period;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new CashierEntitlementError(
      "CASHIER_PRORATION_AMOUNT_INVALID",
      "calculated cashier proration amount is invalid",
      409,
    );
  }
  return result;
}

export function evaluateCashierEntitlement(
  row: CashierSubscriptionRow | null,
  now = new Date(),
): CashierEntitlementSnapshot | null {
  if (!row) return null;
  const licensedSeats = safeInt(row.licensed_seats, "licensed_seats");
  const price = safeInt(row.price_per_seat_iqd, "price_per_seat_iqd", 1);
  const graceSeconds = safeInt(row.grace_duration_seconds, "grace_duration_seconds", 1);
  const version = safeInt(row.version, "version", 1);
  const start = instant(row.billing_period_start);
  const end = instant(row.billing_period_end);
  const scheduledAt = instant(row.scheduled_change_at);
  const scheduledSeats =
    row.scheduled_licensed_seats === null
      ? undefined
      : safeInt(row.scheduled_licensed_seats, "scheduled_licensed_seats");

  let state: CashierEntitlementState = "inactive";
  let graceUntil: Date | null = null;
  if (row.status === "suspended") {
    state = "suspended";
  } else if (row.status === "active" && start && end && licensedSeats > 0) {
    graceUntil = new Date(end.getTime() + graceSeconds * 1000);
    if (now.getTime() < end.getTime()) state = "active";
    else if (now.getTime() < graceUntil.getTime()) state = "grace";
    else state = "restricted";
  } else if (row.status === "cancelled") {
    state = "restricted";
  }

  return {
    subscription_id: row.id,
    merchant_id: row.merchant_id,
    state,
    licensed_seats: licensedSeats,
    price_per_seat_iqd: price,
    ...(start ? { billing_period_start: start.toISOString() } : {}),
    ...(end ? { billing_period_end: end.toISOString() } : {}),
    ...(graceUntil ? { grace_until: graceUntil.toISOString() } : {}),
    ...(scheduledSeats !== undefined ? { scheduled_licensed_seats: scheduledSeats } : {}),
    ...(scheduledAt ? { scheduled_change_at: scheduledAt.toISOString() } : {}),
    version,
    server_time: now.toISOString(),
  };
}

async function subscriptionRow(
  target: OperationalQueryTarget,
  merchantId: string,
  lock = false,
): Promise<CashierSubscriptionRow | null> {
  const rows = await operationalQueryRows<CashierSubscriptionRow>(
    target,
    `SELECT id, merchant_id, status, licensed_seats, price_per_seat_iqd,
            billing_period_start, billing_period_end, grace_duration_seconds,
            scheduled_licensed_seats, scheduled_change_at, version
       FROM merchant_cashier_subscriptions
      WHERE merchant_id = $1
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [merchantId],
  );
  return rows[0] || null;
}

export async function getCashierEntitlementAuthoritative(
  merchantId: string,
): Promise<CashierEntitlementSnapshot | null> {
  assertAuthority();
  return withMerchantOperationalTransaction(merchantId, async (client) =>
    evaluateCashierEntitlement(await subscriptionRow(client, merchantId), new Date()),
  );
}

export function assertCashierEntitlementState(
  snapshot: CashierEntitlementSnapshot | null,
  allowed: CashierEntitlementState[],
  code = "CASHIER_SUBSCRIPTION_REQUIRED",
): asserts snapshot is CashierEntitlementSnapshot {
  if (!snapshot || !allowed.includes(snapshot.state)) {
    throw new CashierEntitlementError(
      code,
      snapshot?.state === "restricted"
        ? "cashier subscription expired; renewal is required"
        : snapshot?.state === "suspended"
          ? "cashier subscription is suspended"
          : "active cashier subscription is required",
      403,
      { cashier_state: snapshot?.state || "inactive" },
    );
  }
}

export async function assignCashierStationSeatAuthoritative(input: {
  merchantId: string;
  stationId: string;
  actorRef?: string;
}): Promise<CashierEntitlementSnapshot> {
  assertAuthority();
  return withMerchantOperationalTransaction(input.merchantId, async (client) => {
    const row = await subscriptionRow(client, input.merchantId, true);
    const snapshot = evaluateCashierEntitlement(row, new Date());
    assertCashierEntitlementState(snapshot, ["active"], "CASHIER_ACTIVE_SUBSCRIPTION_REQUIRED");

    await client.query(
      `UPDATE cashier_station_seat_assignments
          SET status = 'released', released_at = now(), updated_at = now()
        WHERE merchant_id = $1
          AND status = 'release_scheduled'
          AND release_effective_at <= now()`,
      [input.merchantId],
    );

    const existing = await operationalQueryRows<{ status: string }>(
      client,
      `SELECT status
         FROM cashier_station_seat_assignments
        WHERE merchant_id = $1 AND station_id = $2
        LIMIT 1
        FOR UPDATE`,
      [input.merchantId, input.stationId],
    );
    if (existing[0]?.status === "active" || existing[0]?.status === "release_scheduled") {
      return snapshot;
    }

    const counts = await operationalQueryRows<{ assigned: number | string }>(
      client,
      `SELECT count(*)::int AS assigned
         FROM cashier_station_seat_assignments
        WHERE merchant_id = $1
          AND (status = 'active' OR (status = 'release_scheduled' AND release_effective_at > now()))`,
      [input.merchantId],
    );
    const assigned = Number(counts[0]?.assigned || 0);
    if (assigned >= snapshot.licensed_seats) {
      throw new CashierEntitlementError(
        "CASHIER_LICENSED_SEAT_LIMIT_REACHED",
        "all licensed cashier seats are already assigned",
        409,
        { licensed_seats: snapshot.licensed_seats, assigned_seats: assigned },
      );
    }

    const id = `cashier_seat_${crypto.randomUUID()}`;
    if (existing[0]) {
      await client.query(
        `UPDATE cashier_station_seat_assignments
            SET subscription_id = $3, status = 'active', assigned_at = now(),
                release_effective_at = NULL, released_at = NULL, updated_at = now()
          WHERE merchant_id = $1 AND station_id = $2`,
        [input.merchantId, input.stationId, snapshot.subscription_id],
      );
    } else {
      await client.query(
        `INSERT INTO cashier_station_seat_assignments
           (id, merchant_id, subscription_id, station_id, status, assigned_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'active',now(),now(),now())`,
        [id, input.merchantId, snapshot.subscription_id, input.stationId],
      );
    }
    await client.query(
      `INSERT INTO cashier_entitlement_audit_events
         (id, merchant_id, subscription_id, action, actor_type, actor_ref,
          from_seats, to_seats, from_version, to_version, metadata, created_at)
       VALUES ($1,$2,$3,'seat_assign','merchant',$4,$5,$5,$6,$6,$7::jsonb,now())`,
      [
        `cashier_audit_${crypto.randomUUID()}`,
        input.merchantId,
        snapshot.subscription_id,
        input.actorRef || null,
        snapshot.licensed_seats,
        snapshot.version,
        JSON.stringify({ station_id: input.stationId }),
      ],
    );
    return snapshot;
  });
}

export async function assertCashierStationLicensedAuthoritative(input: {
  merchantId: string;
  stationId: string;
  allowGrace?: boolean;
}): Promise<CashierEntitlementSnapshot> {
  assertAuthority();
  return withMerchantOperationalTransaction(input.merchantId, async (client) => {
    const snapshot = evaluateCashierEntitlement(
      await subscriptionRow(client, input.merchantId),
      new Date(),
    );
    assertCashierEntitlementState(
      snapshot,
      input.allowGrace === false ? ["active"] : ["active", "grace"],
      "CASHIER_STATION_ENTITLEMENT_REQUIRED",
    );
    const rows = await operationalQueryRows<{ status: string; release_effective_at: DbInstant | null }>(
      client,
      `SELECT status, release_effective_at
         FROM cashier_station_seat_assignments
        WHERE merchant_id = $1
          AND subscription_id = $2
          AND station_id = $3
        LIMIT 1`,
      [input.merchantId, snapshot.subscription_id, input.stationId],
    );
    const assignment = rows[0];
    const releaseAt = assignment ? instant(assignment.release_effective_at) : null;
    const licensed =
      assignment?.status === "active" ||
      (assignment?.status === "release_scheduled" &&
        releaseAt !== null &&
        releaseAt.getTime() > Date.now());
    if (!licensed) {
      throw new CashierEntitlementError(
        "CASHIER_STATION_LICENSE_REQUIRED",
        "cashier station does not have an assigned licensed seat",
        403,
      );
    }
    return snapshot;
  });
}
