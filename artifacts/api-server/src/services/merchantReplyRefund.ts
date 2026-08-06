import fs from "node:fs";
import path from "node:path";
import { getFawriDataFilePath } from "../lib/dataPaths";

type ReservationRecord = {
  merchant_id?: unknown;
  subscription_id?: unknown;
  event_id?: unknown;
  status?: unknown;
};

type ReservationDatabase = {
  reservations?: unknown;
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

type MerchantDatabase = {
  subscriptions?: unknown;
  [key: string]: unknown;
};

type AddonBatch = {
  id?: unknown;
  amount?: unknown;
  remaining?: unknown;
  expires_at?: unknown;
  purchased_at?: unknown;
  [key: string]: unknown;
};

export type ReplyRefundResult =
  | { refunded: true; merchantId: string; subscriptionId: string }
  | { refunded: false; reason: string };

function text(value: unknown): string {
  return String(value || "").trim();
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function validDate(value: unknown): Date | null {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function writeTextAtomically(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, content, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  writeTextAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function asReservations(value: unknown): Record<string, ReservationRecord> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, ReservationRecord>)
    : {};
}

function asSubscriptions(value: unknown): SubscriptionRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is SubscriptionRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function asBatches(value: unknown): AddonBatch[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is AddonBatch =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function compareBatch(left: AddonBatch, right: AddonBatch): number {
  const leftExpiry = validDate(left.expires_at)?.getTime() || Infinity;
  const rightExpiry = validDate(right.expires_at)?.getTime() || Infinity;
  if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;
  return (
    (validDate(left.purchased_at)?.getTime() || 0) -
    (validDate(right.purchased_at)?.getTime() || 0)
  );
}

function recalculate(subscription: SubscriptionRecord, now: Date): void {
  const baseLimit =
    nonNegativeInteger(subscription.base_reply_limit) ||
    nonNegativeInteger(subscription.reply_limit);
  const baseUsed = Math.min(
    nonNegativeInteger(
      subscription.base_replies_used ?? subscription.replies_used,
    ),
    baseLimit,
  );
  const baseRemaining = Math.max(0, baseLimit - baseUsed);
  const batches = asBatches(subscription.addon_reply_batches);
  const addonRemaining = batches.reduce(
    (total, batch) => total + nonNegativeInteger(batch.remaining),
    0,
  );
  const addonUsed = batches.reduce(
    (total, batch) =>
      total +
      Math.max(
        0,
        nonNegativeInteger(batch.amount) - nonNegativeInteger(batch.remaining),
      ),
    0,
  );
  const totalRemaining = baseRemaining + addonRemaining;
  const totalUsed = baseUsed + addonUsed;

  subscription.base_reply_limit = baseLimit;
  subscription.base_replies_used = baseUsed;
  subscription.base_replies_remaining = baseRemaining;
  subscription.addon_reply_batches = batches;
  subscription.addon_replies_remaining = addonRemaining;
  subscription.replies_used = totalUsed;
  subscription.replies_remaining = totalRemaining;
  subscription.reply_limit = totalUsed + totalRemaining;

  const status = text(subscription.status);
  const expiresAt = validDate(subscription.expires_at);
  const stillCurrent = Boolean(
    expiresAt && expiresAt.getTime() > now.getTime(),
  );
  if (
    totalRemaining > 0 &&
    stillCurrent &&
    status === "replies_exhausted"
  ) {
    subscription.status = "active";
    subscription.auto_reply_enabled = true;
  }
}

function restoreAfterFailure(params: {
  merchantPath: string;
  merchantText: string;
  reservationPath: string;
  reservationText: string | null;
}): void {
  const failures: unknown[] = [];
  try {
    writeTextAtomically(params.merchantPath, params.merchantText);
  } catch (error) {
    failures.push(error);
  }
  try {
    if (params.reservationText === null) {
      try {
        fs.unlinkSync(params.reservationPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    } else {
      writeTextAtomically(params.reservationPath, params.reservationText);
    }
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    console.error("Reply refund rollback was incomplete:", failures);
  }
}

export function refundMerchantAutoReply(
  eventId: string,
  now: Date = new Date(),
): ReplyRefundResult {
  const normalizedEventId = text(eventId);
  if (!normalizedEventId) return { refunded: false, reason: "event_id_missing" };

  const merchantPath = getFawriDataFilePath("merchants.json");
  const reservationPath = getFawriDataFilePath("reply-reservations.json");

  let reservationText: string | null = null;
  try {
    reservationText = fs.readFileSync(reservationPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { refunded: false, reason: "reservation_not_found" };
    }
    throw error;
  }

  const reservationDatabase = JSON.parse(
    reservationText,
  ) as ReservationDatabase;
  const reservations = asReservations(reservationDatabase.reservations);
  reservationDatabase.reservations = reservations;
  const reservation = reservations[normalizedEventId];
  if (!reservation) return { refunded: false, reason: "reservation_not_found" };
  if (text(reservation.status) !== "consumed") {
    return { refunded: false, reason: "reservation_not_consumed" };
  }

  const merchantId = text(reservation.merchant_id);
  const subscriptionId = text(reservation.subscription_id);
  if (!merchantId || !subscriptionId) {
    return { refunded: false, reason: "reservation_identity_invalid" };
  }

  const merchantText = fs.readFileSync(merchantPath, "utf8");
  const merchantDatabase = JSON.parse(merchantText) as MerchantDatabase;
  const subscriptions = asSubscriptions(merchantDatabase.subscriptions);
  merchantDatabase.subscriptions = subscriptions;
  const subscription = subscriptions.find(
    (item) =>
      text(item.id) === subscriptionId && text(item.merchant_id) === merchantId,
  );
  if (!subscription) {
    return { refunded: false, reason: "subscription_not_found" };
  }

  const baseLimit =
    nonNegativeInteger(subscription.base_reply_limit) ||
    nonNegativeInteger(subscription.reply_limit);
  const baseUsed = Math.min(
    nonNegativeInteger(
      subscription.base_replies_used ?? subscription.replies_used,
    ),
    baseLimit,
  );
  const refundableBatches = asBatches(subscription.addon_reply_batches)
    .filter(
      (batch) =>
        nonNegativeInteger(batch.remaining) < nonNegativeInteger(batch.amount),
    )
    .sort(compareBatch);

  if (baseUsed >= baseLimit && refundableBatches.length > 0) {
    const batch = refundableBatches[0];
    batch.remaining = Math.min(
      nonNegativeInteger(batch.amount),
      nonNegativeInteger(batch.remaining) + 1,
    );
  } else if (baseUsed > 0) {
    subscription.base_replies_used = baseUsed - 1;
  } else if (refundableBatches.length > 0) {
    const batch = refundableBatches[0];
    batch.remaining = Math.min(
      nonNegativeInteger(batch.amount),
      nonNegativeInteger(batch.remaining) + 1,
    );
  } else {
    return { refunded: false, reason: "debit_not_found" };
  }

  recalculate(subscription, now);
  delete reservations[normalizedEventId];

  try {
    writeJsonAtomically(merchantPath, merchantDatabase);
    writeJsonAtomically(reservationPath, reservationDatabase);
  } catch (error) {
    restoreAfterFailure({
      merchantPath,
      merchantText,
      reservationPath,
      reservationText,
    });
    throw error;
  }

  return { refunded: true, merchantId, subscriptionId };
}
