import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

export type MerchantReplyReleaseCode =
  | "MERCHANT_AUTO_REPLY_DISABLED"
  | "MERCHANT_SETTINGS_VERSION_CHANGED"
  | "MERCHANT_SETTINGS_UNAVAILABLE"
  | "META_FAKE_TRANSPORT_ONLY";

type ReservationRecord = {
  merchant_id?: unknown;
  subscription_id?: unknown;
  event_id?: unknown;
  status?: unknown;
  debit_source?: unknown;
  addon_batch_id?: unknown;
  debit_balance_after?: unknown;
  refund_status?: unknown;
  release_status?: unknown;
  released_at?: unknown;
  release_reason_code?: unknown;
  [key: string]: unknown;
};

type ReservationDatabase = { reservations?: unknown };
type AddonBatch = {
  id?: unknown;
  amount?: unknown;
  remaining?: unknown;
  expires_at?: unknown;
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

export type MerchantReplyReleaseResult =
  | { released: true; merchantId: string; subscriptionId: string }
  | { released: false; reason: string };

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

/**
 * Restores a modern consumed reply reservation only when the send has not
 * started. Confirmed delivery failures continue to use merchantReplyRefund.
 */
export function releaseMerchantAutoReplyReservation(
  eventId: string,
  reasonCode: MerchantReplyReleaseCode,
  now: Date = new Date(),
): MerchantReplyReleaseResult {
  const normalizedEventId = text(eventId);
  if (!normalizedEventId) return { released: false, reason: "event_id_missing" };

  const lock = acquireLock();
  try {
    const merchantPath = getFawriDataFilePath("merchants.json");
    const reservationPath = getFawriDataFilePath("reply-reservations.json");

    let originalReservationText: string;
    try {
      originalReservationText = fs.readFileSync(reservationPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { released: false, reason: "reservation_not_found" };
      }
      throw error;
    }

    const reservationDatabase = JSON.parse(
      originalReservationText,
    ) as ReservationDatabase;
    const records = reservationMap(reservationDatabase.reservations);
    reservationDatabase.reservations = records;
    const reservation = records[normalizedEventId];
    if (!reservation) return { released: false, reason: "reservation_not_found" };
    if (text(reservation.status) !== "consumed") {
      return { released: false, reason: "reservation_not_consumed" };
    }
    if (text(reservation.refund_status)) {
      return {
        released: false,
        reason:
          text(reservation.refund_status) === "refunded"
            ? "already_refunded"
            : "refund_in_progress",
      };
    }
    if (text(reservation.release_status) === "released") {
      return { released: false, reason: "already_released" };
    }

    const merchantId = text(reservation.merchant_id);
    const subscriptionId = text(reservation.subscription_id);
    const debitSource = text(reservation.debit_source);
    const balanceAfter = integer(reservation.debit_balance_after);
    if (!merchantId || !subscriptionId) {
      return { released: false, reason: "reservation_identity_invalid" };
    }
    if (debitSource !== "base" && debitSource !== "addon") {
      return { released: false, reason: "debit_not_releasable" };
    }

    const originalMerchantText = fs.readFileSync(merchantPath, "utf8");
    const merchantDatabase = JSON.parse(originalMerchantText) as MerchantDatabase;
    const subscriptionList = subscriptions(merchantDatabase.subscriptions);
    merchantDatabase.subscriptions = subscriptionList;
    const subscription = subscriptionList.find(
      (item) =>
        text(item.id) === subscriptionId && text(item.merchant_id) === merchantId,
    );
    if (!subscription) return { released: false, reason: "subscription_not_found" };

    let addonBatch: AddonBatch | undefined;
    if (debitSource === "addon") {
      addonBatch = batches(subscription.addon_reply_batches).find(
        (batch) => text(batch.id) === text(reservation.addon_batch_id),
      );
      if (!addonBatch) return { released: false, reason: "release_batch_not_found" };
    }

    if (text(reservation.release_status) !== "pending") {
      reservation.release_status = "pending";
      reservation.release_reason_code = reasonCode;
      writeJson(reservationPath, reservationDatabase);
    }

    let merchantChanged = false;
    if (debitSource === "base") {
      const current = integer(
        subscription.base_replies_used ?? subscription.replies_used,
      );
      const restored = Math.max(0, balanceAfter - 1);
      if (current === balanceAfter) {
        subscription.base_replies_used = restored;
        merchantChanged = true;
      } else if (current !== restored) {
        return { released: false, reason: "release_balance_conflict" };
      }
    } else {
      const current = integer(addonBatch?.remaining);
      const restored = Math.min(integer(addonBatch?.amount), balanceAfter + 1);
      if (current === balanceAfter) {
        if (!addonBatch) return { released: false, reason: "release_batch_not_found" };
        addonBatch.remaining = restored;
        merchantChanged = true;
      } else if (current !== restored) {
        return { released: false, reason: "release_balance_conflict" };
      }
    }

    recalculate(subscription, now);
    try {
      if (merchantChanged) writeJson(merchantPath, merchantDatabase);
      reservation.release_status = "released";
      reservation.released_at = now.toISOString();
      reservation.release_reason_code = reasonCode;
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
        console.error("Reply reservation release rollback was incomplete", {
          failures: failures.length,
        });
      }
      throw error;
    }

    return { released: true, merchantId, subscriptionId };
  } finally {
    releaseLock(lock);
  }
}
