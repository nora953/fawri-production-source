import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

type ReservationRecord = {
  merchant_id?: unknown;
  subscription_id?: unknown;
  event_id?: unknown;
  status?: unknown;
  debit_source?: unknown;
  addon_batch_id?: unknown;
  debit_balance_after?: unknown;
  refund_status?: unknown;
  refunded_at?: unknown;
  refund_failure_code?: unknown;
};
type ReservationDatabase = { reservations?: unknown };
type AddonBatch = {
  id?: unknown;
  amount?: unknown;
  remaining?: unknown;
  expires_at?: unknown;
  purchased_at?: unknown;
  [key: string]: unknown;
};
type SubscriptionRecord = {
  id?: unknown;
  merchant_id?: unknown;
  status?: unknown;
  expires_at?: unknown;
  auto_reply_enabled?: unknown;
  reply_limit?: unknown;
  replies_used?: unknown;
  replies_remaining?: unknown;
  base_reply_limit?: unknown;
  base_replies_used?: unknown;
  base_replies_remaining?: unknown;
  addon_replies_remaining?: unknown;
  addon_reply_batches?: unknown;
  [key: string]: unknown;
};
type MerchantDatabase = { subscriptions?: unknown; [key: string]: unknown };

export type ReplyRefundResult =
  | { refunded: true; merchantId: string; subscriptionId: string }
  | { refunded: false; reason: string };

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
function reservationMap(value: unknown): Record<string, ReservationRecord> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, ReservationRecord>)
    : {};
}
function subscriptions(value: unknown): SubscriptionRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is SubscriptionRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}
function batches(value: unknown): AddonBatch[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is AddonBatch =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}
function compareBatch(left: AddonBatch, right: AddonBatch): number {
  const expiry =
    (date(left.expires_at)?.getTime() || Infinity) -
    (date(right.expires_at)?.getTime() || Infinity);
  if (expiry !== 0) return expiry;
  return (
    (date(left.purchased_at)?.getTime() || 0) -
    (date(right.purchased_at)?.getTime() || 0)
  );
}
function recalculate(subscription: SubscriptionRecord, now: Date): void {
  const baseLimit =
    integer(subscription.base_reply_limit) || integer(subscription.reply_limit);
  const baseUsed = Math.min(
    integer(subscription.base_replies_used ?? subscription.replies_used),
    baseLimit,
  );
  const addonBatches = batches(subscription.addon_reply_batches);
  const baseRemaining = Math.max(0, baseLimit - baseUsed);
  const addonRemaining = addonBatches.reduce(
    (total, batch) => total + integer(batch.remaining),
    0,
  );
  const addonUsed = addonBatches.reduce(
    (total, batch) =>
      total + Math.max(0, integer(batch.amount) - integer(batch.remaining)),
    0,
  );
  const totalRemaining = baseRemaining + addonRemaining;
  const totalUsed = baseUsed + addonUsed;

  subscription.base_reply_limit = baseLimit;
  subscription.base_replies_used = baseUsed;
  subscription.base_replies_remaining = baseRemaining;
  subscription.addon_reply_batches = addonBatches;
  subscription.addon_replies_remaining = addonRemaining;
  subscription.replies_used = totalUsed;
  subscription.replies_remaining = totalRemaining;
  subscription.reply_limit = totalUsed + totalRemaining;

  const expiresAt = date(subscription.expires_at);
  if (
    totalRemaining > 0 &&
    expiresAt &&
    expiresAt.getTime() > now.getTime() &&
    text(subscription.status) === "replies_exhausted"
  ) {
    subscription.status = "active";
    subscription.auto_reply_enabled = true;
  }
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

function selectLegacyDebit(subscription: SubscriptionRecord): {
  source: "base" | "addon";
  balanceAfter: number;
  batch?: AddonBatch;
} | null {
  const baseLimit =
    integer(subscription.base_reply_limit) || integer(subscription.reply_limit);
  const baseUsed = Math.min(
    integer(subscription.base_replies_used ?? subscription.replies_used),
    baseLimit,
  );
  const refundableBatches = batches(subscription.addon_reply_batches)
    .filter((batch) => integer(batch.remaining) < integer(batch.amount))
    .sort(compareBatch);

  if (baseUsed >= baseLimit && refundableBatches.length > 0) {
    return {
      source: "addon",
      balanceAfter: integer(refundableBatches[0].remaining),
      batch: refundableBatches[0],
    };
  }
  if (baseUsed > 0) return { source: "base", balanceAfter: baseUsed };
  if (refundableBatches.length > 0) {
    return {
      source: "addon",
      balanceAfter: integer(refundableBatches[0].remaining),
      batch: refundableBatches[0],
    };
  }
  return null;
}

/** Refunds only a persisted, confirmed Meta delivery failure. */
export function refundMerchantAutoReply(
  eventId: string,
  confirmedFailureCode: "META_REPLY_FAILED",
  now: Date = new Date(),
): ReplyRefundResult {
  const normalizedEventId = text(eventId);
  if (!normalizedEventId) return { refunded: false, reason: "event_id_missing" };
  if (confirmedFailureCode !== "META_REPLY_FAILED") {
    return { refunded: false, reason: "confirmed_failure_required" };
  }

  const lock = acquireLock();
  try {
    const merchantPath = getFawriDataFilePath("merchants.json");
    const reservationPath = getFawriDataFilePath("reply-reservations.json");

    let originalReservationText: string;
    try {
      originalReservationText = fs.readFileSync(reservationPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { refunded: false, reason: "reservation_not_found" };
      }
      throw error;
    }

    const reservationDatabase = JSON.parse(
      originalReservationText,
    ) as ReservationDatabase;
    const records = reservationMap(reservationDatabase.reservations);
    reservationDatabase.reservations = records;
    const reservation = records[normalizedEventId];
    if (!reservation) return { refunded: false, reason: "reservation_not_found" };
    if (text(reservation.status) !== "consumed") {
      return { refunded: false, reason: "reservation_not_consumed" };
    }
    if (text(reservation.refund_status) === "refunded") {
      return { refunded: false, reason: "already_refunded" };
    }

    const merchantId = text(reservation.merchant_id);
    const subscriptionId = text(reservation.subscription_id);
    if (!merchantId || !subscriptionId) {
      return { refunded: false, reason: "reservation_identity_invalid" };
    }

    const originalMerchantText = fs.readFileSync(merchantPath, "utf8");
    const merchantDatabase = JSON.parse(originalMerchantText) as MerchantDatabase;
    const subscriptionList = subscriptions(merchantDatabase.subscriptions);
    merchantDatabase.subscriptions = subscriptionList;
    const subscription = subscriptionList.find(
      (item) =>
        text(item.id) === subscriptionId && text(item.merchant_id) === merchantId,
    );
    if (!subscription) return { refunded: false, reason: "subscription_not_found" };

    let source = text(reservation.debit_source);
    let balanceAfter = integer(reservation.debit_balance_after);
    let addonBatch =
      source === "addon"
        ? batches(subscription.addon_reply_batches).find(
            (batch) => text(batch.id) === text(reservation.addon_batch_id),
          )
        : undefined;

    if (
      (source !== "base" && source !== "addon") ||
      (source === "addon" && !addonBatch)
    ) {
      const legacy = selectLegacyDebit(subscription);
      if (!legacy) return { refunded: false, reason: "debit_not_found" };
      source = legacy.source;
      balanceAfter = legacy.balanceAfter;
      addonBatch = legacy.batch;
      reservation.debit_source = source;
      reservation.debit_balance_after = balanceAfter;
      if (addonBatch) reservation.addon_batch_id = text(addonBatch.id);
    }

    if (text(reservation.refund_status) !== "pending") {
      reservation.refund_status = "pending";
      reservation.refund_failure_code = confirmedFailureCode;
      writeJson(reservationPath, reservationDatabase);
    }

    let merchantChanged = false;
    if (source === "base") {
      const current = integer(
        subscription.base_replies_used ?? subscription.replies_used,
      );
      if (current === balanceAfter) {
        subscription.base_replies_used = Math.max(0, current - 1);
        merchantChanged = true;
      } else if (current !== Math.max(0, balanceAfter - 1)) {
        return { refunded: false, reason: "refund_balance_conflict" };
      }
    } else {
      if (!addonBatch) return { refunded: false, reason: "refund_batch_not_found" };
      const current = integer(addonBatch.remaining);
      const refundedBalance = Math.min(integer(addonBatch.amount), balanceAfter + 1);
      if (current === balanceAfter) {
        addonBatch.remaining = refundedBalance;
        merchantChanged = true;
      } else if (current !== refundedBalance) {
        return { refunded: false, reason: "refund_balance_conflict" };
      }
    }

    recalculate(subscription, now);
    try {
      if (merchantChanged) writeJson(merchantPath, merchantDatabase);
      reservation.refund_status = "refunded";
      reservation.refunded_at = now.toISOString();
      reservation.refund_failure_code = confirmedFailureCode;
      writeJson(reservationPath, reservationDatabase);
    } catch (error) {
      const failures: unknown[] = [];
      try {
        writeText(merchantPath, originalMerchantText);
      } catch (restoreError) {
        failures.push(restoreError);
      }
      try {
        writeText(reservationPath, originalReservationText);
      } catch (restoreError) {
        failures.push(restoreError);
      }
      if (failures.length > 0) {
        console.error("Reply refund rollback was incomplete", {
          failures: failures.length,
        });
      }
      throw error;
    }

    return { refunded: true, merchantId, subscriptionId };
  } finally {
    releaseLock(lock);
  }
}
