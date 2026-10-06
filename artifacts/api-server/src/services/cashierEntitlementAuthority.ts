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

async function reconcileScheduledDowngradeInTransaction(
  target: OperationalQueryTarget,
  merchantId: string,
  now = new Date(),
): Promise<CashierSubscriptionRow | null> {
  let row = await subscriptionRow(target, merchantId, true);
  if (!row || row.scheduled_licensed_seats === null || row.scheduled_change_at === null) {
    return row;
  }
  const effectiveAt = instant(row.scheduled_change_at);
  if (!effectiveAt || effectiveAt.getTime() > now.getTime()) return row;

  const targetSeats = safeInt(row.scheduled_licensed_seats, "scheduled_licensed_seats", 1);
  const currentSeats = safeInt(row.licensed_seats, "licensed_seats", 1);
  if (targetSeats >= currentSeats) {
    throw new CashierEntitlementError(
      "CASHIER_DOWNGRADE_STATE_INVALID",
      "scheduled cashier downgrade is invalid",
      500,
    );
  }

  const assignments = await operationalQueryRows<{ station_id: string; status: string }>(
    target,
    `SELECT station_id, status
       FROM cashier_station_seat_assignments
      WHERE merchant_id = $1
        AND subscription_id = $2
        AND status IN ('active','release_scheduled')
      ORDER BY station_id
      FOR UPDATE`,
    [merchantId, row.id],
  );
  const keepCount = assignments.filter((assignment) => assignment.status === "active").length;
  const scheduledReleaseCount = assignments.filter(
    (assignment) => assignment.status === "release_scheduled",
  ).length;
  const assignedCount = keepCount + scheduledReleaseCount;
  const expectedKeepCount = Math.min(targetSeats, assignedCount);
  if (
    assignedCount > currentSeats ||
    keepCount !== expectedKeepCount ||
    scheduledReleaseCount !== assignedCount - expectedKeepCount
  ) {
    throw new CashierEntitlementError(
      "CASHIER_DOWNGRADE_ASSIGNMENTS_INVALID",
      "scheduled cashier downgrade station selection is inconsistent",
      409,
      {
        current_seats: currentSeats,
        target_seats: targetSeats,
        assigned_stations: assignedCount,
        kept_assignments: keepCount,
        scheduled_releases: scheduledReleaseCount,
      },
    );
  }

  await target.query(
    `UPDATE cashier_station_seat_assignments
        SET status = 'released', released_at = $3, updated_at = $3
      WHERE merchant_id = $1
        AND subscription_id = $2
        AND status = 'release_scheduled'
        AND release_effective_at <= $3`,
    [merchantId, row.id, now],
  );
  const nextVersion = safeInt(row.version, "version", 1) + 1;
  const updated = await operationalQueryRows<CashierSubscriptionRow>(
    target,
    `UPDATE merchant_cashier_subscriptions
        SET licensed_seats = $3,
            scheduled_licensed_seats = NULL,
            scheduled_change_at = NULL,
            version = $4,
            updated_at = $5
      WHERE merchant_id = $1 AND id = $2 AND version = $6
      RETURNING id, merchant_id, status, licensed_seats, price_per_seat_iqd,
                billing_period_start, billing_period_end, grace_duration_seconds,
                scheduled_licensed_seats, scheduled_change_at, version`,
    [merchantId, row.id, targetSeats, nextVersion, now, row.version],
  );
  if (updated.length !== 1) {
    throw new CashierEntitlementError(
      "CASHIER_SUBSCRIPTION_VERSION_CONFLICT",
      "cashier subscription changed concurrently",
      409,
    );
  }
  await target.query(
    `INSERT INTO cashier_entitlement_audit_events
       (id, merchant_id, subscription_id, action, actor_type,
        from_seats, to_seats, from_version, to_version, metadata, created_at)
     VALUES ($1,$2,$3,'apply_downgrade','system',$4,$5,$6,$7,'{}'::jsonb,$8)`,
    [
      `cashier_audit_${crypto.randomUUID()}`,
      merchantId,
      row.id,
      currentSeats,
      targetSeats,
      safeInt(row.version, "version", 1),
      nextVersion,
      now,
    ],
  );
  row = updated[0];
  return row;
}

export async function changeCashierSubscriptionAdministrativeState(input: {
  merchantId: string;
  action: "suspend" | "resume" | "cancel";
  actorRef: string;
  expectedVersion?: number;
}): Promise<CashierEntitlementSnapshot> {
  assertAuthority();
  return withMerchantOperationalTransaction(input.merchantId, async (client) => {
    const now = new Date();
    const row = await subscriptionRow(client, input.merchantId, true);
    if (!row) {
      throw new CashierEntitlementError(
        "CASHIER_SUBSCRIPTION_NOT_FOUND",
        "cashier subscription was not found",
        404,
      );
    }
    const currentVersion = safeInt(row.version, "version", 1);
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== currentVersion
    ) {
      throw new CashierEntitlementError(
        "CASHIER_SUBSCRIPTION_VERSION_CONFLICT",
        "cashier subscription changed before the administrative action",
        409,
        { current_version: currentVersion },
      );
    }

    let nextStatus: "active" | "suspended" | "cancelled";
    if (input.action === "suspend") {
      if (row.status !== "active") {
        throw new CashierEntitlementError(
          "CASHIER_SUBSCRIPTION_SUSPEND_INVALID",
          "only an active cashier subscription can be suspended",
          409,
          { current_status: row.status },
        );
      }
      nextStatus = "suspended";
    } else if (input.action === "resume") {
      if (row.status !== "suspended") {
        throw new CashierEntitlementError(
          "CASHIER_SUBSCRIPTION_RESUME_INVALID",
          "only a suspended cashier subscription can be resumed",
          409,
          { current_status: row.status },
        );
      }
      nextStatus = "active";
    } else {
      if (row.status === "cancelled" || row.status === "inactive") {
        throw new CashierEntitlementError(
          "CASHIER_SUBSCRIPTION_CANCEL_INVALID",
          "cashier subscription is already inactive or cancelled",
          409,
          { current_status: row.status },
        );
      }
      nextStatus = "cancelled";
    }

    const nextVersion = currentVersion + 1;
    const rows = await operationalQueryRows<CashierSubscriptionRow>(
      client,
      `UPDATE merchant_cashier_subscriptions
          SET status = $3,
              scheduled_licensed_seats = CASE WHEN $3 = 'cancelled' THEN NULL ELSE scheduled_licensed_seats END,
              scheduled_change_at = CASE WHEN $3 = 'cancelled' THEN NULL ELSE scheduled_change_at END,
              version = $4,
              updated_at = $5
        WHERE merchant_id = $1 AND id = $2 AND version = $6
        RETURNING id, merchant_id, status, licensed_seats, price_per_seat_iqd,
                  billing_period_start, billing_period_end, grace_duration_seconds,
                  scheduled_licensed_seats, scheduled_change_at, version`,
      [input.merchantId, row.id, nextStatus, nextVersion, now, currentVersion],
    );
    if (rows.length !== 1) {
      throw new CashierEntitlementError(
        "CASHIER_SUBSCRIPTION_VERSION_CONFLICT",
        "cashier subscription changed concurrently",
        409,
      );
    }

    await client.query(
      `INSERT INTO cashier_entitlement_audit_events (
         id, merchant_id, subscription_id, action, actor_type, actor_ref,
         from_seats, to_seats, from_version, to_version, metadata, created_at
       ) VALUES ($1,$2,$3,$4,'admin',$5,$6,$6,$7,$8,$9::jsonb,$10)`,
      [
        `cashier_audit_${crypto.randomUUID()}`,
        input.merchantId,
        row.id,
        input.action,
        input.actorRef,
        safeInt(row.licensed_seats, "licensed_seats"),
        currentVersion,
        nextVersion,
        JSON.stringify({ previous_status: row.status, resulting_status: nextStatus }),
        now,
      ],
    );
    return evaluateCashierEntitlement(rows[0], now)!;
  });
}

export async function scheduleCashierDowngradeAuthoritative(input: {
  merchantId: string;
  targetSeats: number;
  keepStationIds: string[];
  expectedVersion?: number;
}): Promise<CashierEntitlementSnapshot> {
  assertAuthority();
  if (!Number.isSafeInteger(input.targetSeats) || input.targetSeats <= 0) {
    throw new CashierEntitlementError(
      "CASHIER_DOWNGRADE_TARGET_INVALID",
      "cashier downgrade target must be at least one seat",
      400,
    );
  }
  const keepStationIds = [...new Set(input.keepStationIds.map((value) => String(value || "").trim()))]
    .filter(Boolean);

  return withMerchantOperationalTransaction(input.merchantId, async (client) => {
    const now = new Date();
    const current = await reconcileScheduledDowngradeInTransaction(
      client,
      input.merchantId,
      now,
    );
    const snapshot = evaluateCashierEntitlement(current, now);
    assertCashierEntitlementState(snapshot, ["active"], "CASHIER_ACTIVE_SUBSCRIPTION_REQUIRED");
    if (input.targetSeats >= snapshot.licensed_seats) {
      throw new CashierEntitlementError(
        "CASHIER_DOWNGRADE_TARGET_INVALID",
        "cashier downgrade target must be lower than current licensed seats",
        400,
      );
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== snapshot.version) {
      throw new CashierEntitlementError(
        "CASHIER_SUBSCRIPTION_VERSION_CONFLICT",
        "cashier subscription changed before downgrade scheduling",
        409,
        { current_version: snapshot.version },
      );
    }
    if (!snapshot.billing_period_end) {
      throw new CashierEntitlementError(
        "CASHIER_ENTITLEMENT_STATE_INVALID",
        "cashier billing period is unavailable",
        500,
      );
    }

    const assignments = await operationalQueryRows<{ station_id: string }>(
      client,
      `SELECT station_id
         FROM cashier_station_seat_assignments
        WHERE merchant_id = $1
          AND subscription_id = $2
          AND status IN ('active','release_scheduled')
        ORDER BY station_id
        FOR UPDATE`,
      [input.merchantId, snapshot.subscription_id],
    );
    const assignedIds = new Set(assignments.map((row) => row.station_id));
    const expectedKeepCount = Math.min(input.targetSeats, assignedIds.size);
    if (
      assignedIds.size > snapshot.licensed_seats ||
      keepStationIds.length !== expectedKeepCount ||
      keepStationIds.some((stationId) => !assignedIds.has(stationId))
    ) {
      throw new CashierEntitlementError(
        "CASHIER_DOWNGRADE_SELECTION_INVALID",
        "cashier station selection does not match the stations that can remain licensed",
        409,
        {
          licensed_seats: snapshot.licensed_seats,
          assigned_station_count: assignedIds.size,
          required_keep_station_count: expectedKeepCount,
        },
      );
    }

    await client.query(
      `UPDATE cashier_station_seat_assignments
          SET status = CASE WHEN station_id = ANY($3::text[]) THEN 'active' ELSE 'release_scheduled' END,
              release_effective_at = CASE WHEN station_id = ANY($3::text[]) THEN NULL ELSE $4 END,
              released_at = NULL,
              updated_at = $5
        WHERE merchant_id = $1
          AND subscription_id = $2
          AND status IN ('active','release_scheduled')`,
      [
        input.merchantId,
        snapshot.subscription_id,
        keepStationIds,
        new Date(snapshot.billing_period_end),
        now,
      ],
    );
    const nextVersion = snapshot.version + 1;
    const rows = await operationalQueryRows<CashierSubscriptionRow>(
      client,
      `UPDATE merchant_cashier_subscriptions
          SET scheduled_licensed_seats = $3,
              scheduled_change_at = billing_period_end,
              version = $4,
              updated_at = $5
        WHERE merchant_id = $1 AND id = $2 AND version = $6
        RETURNING id, merchant_id, status, licensed_seats, price_per_seat_iqd,
                  billing_period_start, billing_period_end, grace_duration_seconds,
                  scheduled_licensed_seats, scheduled_change_at, version`,
      [
        input.merchantId,
        snapshot.subscription_id,
        input.targetSeats,
        nextVersion,
        now,
        snapshot.version,
      ],
    );
    if (rows.length !== 1) {
      throw new CashierEntitlementError(
        "CASHIER_SUBSCRIPTION_VERSION_CONFLICT",
        "cashier subscription changed before downgrade scheduling",
        409,
      );
    }
    await client.query(
      `INSERT INTO cashier_entitlement_audit_events
         (id, merchant_id, subscription_id, action, actor_type, actor_ref,
          from_seats, to_seats, from_version, to_version, metadata, created_at)
       VALUES ($1,$2,$3,'schedule_downgrade','merchant',$2,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        `cashier_audit_${crypto.randomUUID()}`,
        input.merchantId,
        snapshot.subscription_id,
        snapshot.licensed_seats,
        input.targetSeats,
        snapshot.version,
        nextVersion,
        JSON.stringify({ keep_station_ids: keepStationIds.join(",") }),
        now,
      ],
    );
    return evaluateCashierEntitlement(rows[0], now)!;
  });
}

export type CashierLicensedStationView = {
  station_id: string;
  station_name: string;
  station_status: string;
  assignment_status: "active" | "release_scheduled";
  release_effective_at?: string;
};

export async function listCashierLicensedStationsAuthoritative(
  merchantId: string,
): Promise<CashierLicensedStationView[]> {
  assertAuthority();
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    await reconcileScheduledDowngradeInTransaction(client, merchantId, new Date());
    const rows = await operationalQueryRows<{
      station_id: string;
      station_name: string;
      station_status: string;
      assignment_status: "active" | "release_scheduled";
      release_effective_at: DbInstant | null;
    }>(
      client,
      `SELECT assignment.station_id,
              station.name AS station_name,
              station.status AS station_status,
              assignment.status AS assignment_status,
              assignment.release_effective_at
         FROM cashier_station_seat_assignments assignment
         JOIN merchant_cashier_stations station
           ON station.id = assignment.station_id
          AND station.merchant_id = assignment.merchant_id
        WHERE assignment.merchant_id = $1
          AND assignment.status IN ('active','release_scheduled')
        ORDER BY station.name, station.id`,
      [merchantId],
    );
    return rows.map((row) => ({
      station_id: row.station_id,
      station_name: row.station_name,
      station_status: row.station_status,
      assignment_status: row.assignment_status,
      ...(row.release_effective_at
        ? { release_effective_at: instant(row.release_effective_at)!.toISOString() }
        : {}),
    }));
  });
}

export async function getCashierEntitlementAuthoritative(
  merchantId: string,
): Promise<CashierEntitlementSnapshot | null> {
  assertAuthority();
  return withMerchantOperationalTransaction(merchantId, async (client) => {
    const now = new Date();
    return evaluateCashierEntitlement(
      await reconcileScheduledDowngradeInTransaction(client, merchantId, now),
      now,
    );
  });
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

export async function assignCashierStationSeatInTransaction(input: {
  target: OperationalQueryTarget;
  merchantId: string;
  stationId: string;
  actorRef?: string;
}): Promise<CashierEntitlementSnapshot> {
  const now = new Date();
  const row = await reconcileScheduledDowngradeInTransaction(
    input.target,
    input.merchantId,
    now,
  );
  const snapshot = evaluateCashierEntitlement(row, now);
  assertCashierEntitlementState(snapshot, ["active"], "CASHIER_ACTIVE_SUBSCRIPTION_REQUIRED");

  await input.target.query(
    `UPDATE cashier_station_seat_assignments
        SET status = 'released', released_at = now(), updated_at = now()
      WHERE merchant_id = $1
        AND status = 'release_scheduled'
        AND release_effective_at <= now()`,
    [input.merchantId],
  );

  const existing = await operationalQueryRows<{ status: string }>(
    input.target,
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
    input.target,
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
    await input.target.query(
      `UPDATE cashier_station_seat_assignments
          SET subscription_id = $3, status = 'active', assigned_at = now(),
              release_effective_at = NULL, released_at = NULL, updated_at = now()
        WHERE merchant_id = $1 AND station_id = $2`,
      [input.merchantId, input.stationId, snapshot.subscription_id],
    );
  } else {
    await input.target.query(
      `INSERT INTO cashier_station_seat_assignments
         (id, merchant_id, subscription_id, station_id, status, assigned_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'active',now(),now(),now())`,
      [id, input.merchantId, snapshot.subscription_id, input.stationId],
    );
  }
  await input.target.query(
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
}

export async function assignCashierStationSeatAuthoritative(input: {
  merchantId: string;
  stationId: string;
  actorRef?: string;
}): Promise<CashierEntitlementSnapshot> {
  assertAuthority();
  return withMerchantOperationalTransaction(input.merchantId, async (client) =>
    assignCashierStationSeatInTransaction({
      target: client,
      merchantId: input.merchantId,
      stationId: input.stationId,
      actorRef: input.actorRef,
    }),
  );
}

export async function assertCashierStationLicensedInTransaction(input: {
  target: OperationalQueryTarget;
  merchantId: string;
  stationId: string;
  allowGrace?: boolean;
  allowRestricted?: boolean;
}): Promise<CashierEntitlementSnapshot> {
  const now = new Date();
  const snapshot = evaluateCashierEntitlement(
    await reconcileScheduledDowngradeInTransaction(
      input.target,
      input.merchantId,
      now,
    ),
    now,
  );
  const allowedStates: CashierEntitlementState[] = ["active"];
  if (input.allowGrace !== false) allowedStates.push("grace");
  if (input.allowRestricted === true) allowedStates.push("restricted");
  assertCashierEntitlementState(
    snapshot,
    allowedStates,
    "CASHIER_STATION_ENTITLEMENT_REQUIRED",
  );
  const rows = await operationalQueryRows<{ status: string; release_effective_at: DbInstant | null }>(
    input.target,
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
}

export async function assertCashierDeviceLicensedInTransaction(input: {
  target: OperationalQueryTarget;
  merchantId: string;
  deviceId: string;
  allowGrace?: boolean;
}): Promise<{ stationId: string; entitlement: CashierEntitlementSnapshot }> {
  const rows = await operationalQueryRows<{ id: string }>(
    input.target,
    `SELECT id
       FROM merchant_cashier_stations
      WHERE merchant_id = $1
        AND paired_device_id = $2
        AND status = 'active'
      ORDER BY id
      LIMIT 2
      FOR UPDATE`,
    [input.merchantId, input.deviceId],
  );
  if (rows.length !== 1) {
    throw new CashierEntitlementError(
      rows.length > 1
        ? "CASHIER_DEVICE_STATION_AMBIGUOUS"
        : "CASHIER_DEVICE_STATION_REQUIRED",
      rows.length > 1
        ? "cashier device maps to multiple active stations"
        : "cashier device is not paired to an active station",
      rows.length > 1 ? 503 : 403,
    );
  }
  const entitlement = await assertCashierStationLicensedInTransaction({
    target: input.target,
    merchantId: input.merchantId,
    stationId: rows[0].id,
    allowGrace: input.allowGrace,
  });
  return { stationId: rows[0].id, entitlement };
}

export async function assertCashierStationLicensedAuthoritative(input: {
  merchantId: string;
  stationId: string;
  allowGrace?: boolean;
  allowRestricted?: boolean;
}): Promise<CashierEntitlementSnapshot> {
  assertAuthority();
  return withMerchantOperationalTransaction(input.merchantId, async (client) =>
    assertCashierStationLicensedInTransaction({
      target: client,
      merchantId: input.merchantId,
      stationId: input.stationId,
      allowGrace: input.allowGrace,
      allowRestricted: input.allowRestricted,
    }),
  );
}

