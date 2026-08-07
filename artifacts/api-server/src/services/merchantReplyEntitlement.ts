import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

type SubscriptionStatus =
  | "pending_activation"
  | "active"
  | "expired"
  | "replies_exhausted"
  | "suspended";

type AddonReplyBatch = {
  id?: unknown;
  purchased_at?: unknown;
  expires_at?: unknown;
  amount?: unknown;
  remaining?: unknown;
  [key: string]: unknown;
};
type SubscriptionRecord = {
  id?: unknown;
  merchant_id?: unknown;
  reply_limit?: unknown;
  replies_used?: unknown;
  replies_remaining?: unknown;
  base_reply_limit?: unknown;
  base_replies_used?: unknown;
  base_replies_remaining?: unknown;
  addon_replies_remaining?: unknown;
  addon_reply_batches?: unknown;
  start_date?: unknown;
  expires_at?: unknown;
  status?: unknown;
  auto_reply_enabled?: unknown;
  [key: string]: unknown;
};
type MerchantDatabase = { subscriptions?: unknown; [key: string]: unknown };
type ReservationRecord = {
  merchant_id: string;
  subscription_id: string;
  event_id: string;
  amount: number;
  reserved_at: string;
  status: "pending" | "consumed";
  replies_remaining_after?: number;
  debit_source?: "base" | "addon";
  addon_batch_id?: string;
  debit_balance_after?: number;
  refund_status?: "pending" | "refunded";
  refunded_at?: string;
  refund_failure_code?: string;
};
type ReservationDatabase = { reservations: Record<string, ReservationRecord> };

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

const RESERVATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const RESERVATION_LIMIT = 100_000;
const LOCK_STALE_MS = 120_000;

function text(value: unknown): string {
  return String(value || "").trim();
}
function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
function date(value: unknown): Date | null {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}
function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
function readReservations(filePath: string): ReservationDatabase {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      reservations?: unknown;
    };
    return {
      reservations:
        parsed.reservations &&
        typeof parsed.reservations === "object" &&
        !Array.isArray(parsed.reservations)
          ? (parsed.reservations as Record<string, ReservationRecord>)
          : {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { reservations: {} };
    }
    throw error;
  }
}
function subscriptionList(value: unknown): SubscriptionRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is SubscriptionRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}
function batchList(value: unknown, now: Date): AddonReplyBatch[] {
  if (!Array.isArray(value)) return [];
  const normalized: AddonReplyBatch[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const batch = item as AddonReplyBatch;
    const amount = integer(batch.amount);
    const remaining = Math.min(integer(batch.remaining), amount);
    const expiresAt = date(batch.expires_at);
    if (
      !text(batch.id) ||
      amount <= 0 ||
      remaining <= 0 ||
      !expiresAt ||
      expiresAt.getTime() <= now.getTime()
    ) {
      continue;
    }
    normalized.push({ ...batch, amount, remaining });
  }
  return normalized.sort((left, right) => {
    const expiry =
      (date(left.expires_at)?.getTime() || 0) -
      (date(right.expires_at)?.getTime() || 0);
    if (expiry !== 0) return expiry;
    return (
      (date(left.purchased_at)?.getTime() || 0) -
      (date(right.purchased_at)?.getTime() || 0)
    );
  });
}

function status(value: unknown): SubscriptionStatus | null {
  const candidate = text(value);
  return [
    "pending_activation",
    "active",
    "expired",
    "replies_exhausted",
    "suspended",
  ].includes(candidate)
    ? (candidate as SubscriptionStatus)
    : null;
}
function recalculate(subscription: SubscriptionRecord, now: Date) {
  const baseLimit = integer(subscription.base_reply_limit) || integer(subscription.reply_limit);
  const baseUsed = Math.min(
    integer(subscription.base_replies_used ?? subscription.replies_used),
    baseLimit,
  );
  const batches = batchList(subscription.addon_reply_batches, now);
  const baseRemaining = Math.max(0, baseLimit - baseUsed);
  const addonRemaining = batches.reduce((total, batch) => total + integer(batch.remaining), 0);
  const addonUsed = batches.reduce(
    (total, batch) => total + Math.max(0, integer(batch.amount) - integer(batch.remaining)),
    0,
  );
  const totalRemaining = baseRemaining + addonRemaining;
  const expiresAt = date(subscription.expires_at);
  let currentStatus = status(subscription.status);
  if (currentStatus !== "suspended" && currentStatus !== "pending_activation") {
    currentStatus = !expiresAt || expiresAt.getTime() <= now.getTime()
      ? "expired"
      : totalRemaining <= 0
        ? "replies_exhausted"
        : "active";
  }

  subscription.base_reply_limit = baseLimit;
  subscription.base_replies_used = baseUsed;
  subscription.base_replies_remaining = baseRemaining;
  subscription.addon_reply_batches = batches;
  subscription.addon_replies_remaining = addonRemaining;
  subscription.replies_used = baseUsed + addonUsed;
  subscription.replies_remaining = totalRemaining;
  subscription.reply_limit = integer(subscription.replies_used) + totalRemaining;
  if (currentStatus) subscription.status = currentStatus;
  if (currentStatus !== "active") subscription.auto_reply_enabled = false;
  return { currentStatus, baseRemaining, batches, totalRemaining };
}
function denied(
  code: Exclude<MerchantReplyEntitlementDecision, { allowed: true }>["code"],
  error: string,
): MerchantReplyEntitlementDecision {
  return { allowed: false, code, error };
}
function prune(
  records: Record<string, ReservationRecord>,
  now: Date,
): Record<string, ReservationRecord> {
  return Object.fromEntries(
    Object.entries(records)
      .filter(([, record]) => {
        const reservedAt = date(record.reserved_at)?.getTime();
        return Boolean(
          reservedAt && now.getTime() - reservedAt <= RESERVATION_RETENTION_MS,
        );
      })
      .sort(
        (left, right) =>
          (date(right[1].reserved_at)?.getTime() || 0) -
          (date(left[1].reserved_at)?.getTime() || 0),
      )
      .slice(0, RESERVATION_LIMIT),
  );
}
function lockPath(): string {
  return getFawriDataFilePath("reply-entitlements.lock");
}
function acquireLock(): { descriptor: number; token: string } {
  const filePath = lockPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = fs.openSync(filePath, "wx", 0o600);
      const token = crypto.randomBytes(18).toString("hex");
      fs.writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid }));
      fs.fsyncSync(descriptor);
      return { descriptor, token };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(filePath).mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(filePath);
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      throw Object.assign(new Error("reply entitlement store is busy"), {
        code: "MERCHANT_REPLY_ENTITLEMENT_BUSY",
      });
    }
  }
  throw new Error("reply entitlement lock could not be acquired");
}
function releaseLock(lock: { descriptor: number; token: string }): void {
  try {
    fs.closeSync(lock.descriptor);
  } finally {
    try {
      const current = JSON.parse(fs.readFileSync(lockPath(), "utf8")) as {
        token?: unknown;
      };
      if (current.token === lock.token) fs.unlinkSync(lockPath());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function reserveMerchantAutoReply(
  merchantId: string,
  eventId: string,
  now: Date = new Date(),
): MerchantReplyEntitlementDecision {
  const normalizedMerchantId = text(merchantId);
  const normalizedEventId = text(eventId);
  if (!normalizedMerchantId || !normalizedEventId) {
    return denied(
      "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      "merchant reply entitlement identity is unavailable",
    );
  }

  let lock: { descriptor: number; token: string } | null = null;
  try {
    lock = acquireLock();
    const merchantPath = getFawriDataFilePath("merchants.json");
    const reservationPath = getFawriDataFilePath("reply-reservations.json");
    const reservationDb = readReservations(reservationPath);
    reservationDb.reservations = prune(reservationDb.reservations, now);
    const existing = reservationDb.reservations[normalizedEventId];
    if (existing) {
      if (existing.merchant_id !== normalizedMerchantId) {
        return denied(
          "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
          "reply event identity collision detected",
        );
      }
      if (existing.status !== "consumed") {
        return denied(
          "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
          "reply reservation is incomplete",
        );
      }
      return {
        allowed: true,
        duplicate: true,
        repliesRemaining: integer(existing.replies_remaining_after),
        subscriptionId: text(existing.subscription_id),
      };
    }

    const merchantText = fs.readFileSync(merchantPath, "utf8");
    const merchantDb = JSON.parse(merchantText) as MerchantDatabase;
    const subscriptions = subscriptionList(merchantDb.subscriptions);
    merchantDb.subscriptions = subscriptions;
    const subscription = subscriptions
      .filter((item) => text(item.merchant_id) === normalizedMerchantId)
      .sort(
        (left, right) =>
          (date(right.start_date)?.getTime() || 0) -
          (date(left.start_date)?.getTime() || 0),
      )[0];
    if (!subscription) {
      return denied(
        "MERCHANT_SUBSCRIPTION_REQUIRED",
        "active merchant subscription is required",
      );
    }

    const subscriptionId = text(subscription.id);
    const state = recalculate(subscription, now);
    if (!subscriptionId || !state.currentStatus) {
      return denied(
        "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
        "merchant subscription state is invalid",
      );
    }
    if (state.currentStatus === "pending_activation") {
      writeJson(merchantPath, merchantDb);
      return denied("MERCHANT_SUBSCRIPTION_PENDING", "merchant subscription is pending activation");
    }
    if (state.currentStatus === "suspended") {
      writeJson(merchantPath, merchantDb);
      return denied("MERCHANT_SUBSCRIPTION_SUSPENDED", "merchant subscription is suspended");
    }
    if (state.currentStatus === "expired") {
      writeJson(merchantPath, merchantDb);
      return denied("MERCHANT_SUBSCRIPTION_EXPIRED", "merchant subscription is expired");
    }
    if (state.currentStatus === "replies_exhausted" || state.totalRemaining <= 0) {
      writeJson(merchantPath, merchantDb);
      return denied("MERCHANT_REPLIES_EXHAUSTED", "merchant reply balance is exhausted");
    }
    if (subscription.auto_reply_enabled !== true) {
      writeJson(merchantPath, merchantDb);
      return denied("MERCHANT_AUTO_REPLY_DISABLED", "merchant automatic replies are disabled");
    }

    const originalReservations = JSON.stringify(reservationDb);
    const reservation: ReservationRecord = {
      merchant_id: normalizedMerchantId,
      subscription_id: subscriptionId,
      event_id: normalizedEventId,
      amount: 1,
      reserved_at: now.toISOString(),
      status: "pending",
    };

    if (state.baseRemaining > 0) {
      const after = integer(subscription.base_replies_used) + 1;
      reservation.debit_source = "base";
      reservation.debit_balance_after = after;
      subscription.base_replies_used = after;
    } else {
      const batch = state.batches.find((item) => integer(item.remaining) > 0);
      if (!batch) {
        return denied("MERCHANT_REPLIES_EXHAUSTED", "merchant reply balance is exhausted");
      }
      const after = integer(batch.remaining) - 1;
      reservation.debit_source = "addon";
      reservation.addon_batch_id = text(batch.id);
      reservation.debit_balance_after = after;
      batch.remaining = after;
    }

    reservationDb.reservations[normalizedEventId] = reservation;
    writeJson(reservationPath, reservationDb);

    const finalState = recalculate(subscription, now);
    try {
      writeJson(merchantPath, merchantDb);
      reservation.status = "consumed";
      reservation.replies_remaining_after = finalState.totalRemaining;
      writeJson(reservationPath, reservationDb);
    } catch (error) {
      const restoreFailures: unknown[] = [];
      try { writeText(merchantPath, merchantText); } catch (restoreError) { restoreFailures.push(restoreError); }
      try { writeText(reservationPath, `${originalReservations}\n`); } catch (restoreError) { restoreFailures.push(restoreError); }
      if (restoreFailures.length > 0) {
        console.error("Reply entitlement rollback was incomplete", {
          failures: restoreFailures.length,
        });
      }
      throw error;
    }

    return {
      allowed: true,
      duplicate: false,
      repliesRemaining: finalState.totalRemaining,
      subscriptionId,
    };
  } catch {
    return denied(
      "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      "merchant reply entitlement is unavailable",
    );
  } finally {
    if (lock) releaseLock(lock);
  }
}
