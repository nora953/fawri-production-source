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
  source?: unknown;
  purchased_at?: unknown;
  expires_at?: unknown;
  amount?: unknown;
  remaining?: unknown;
  expiry_reminder_sent_at?: unknown;
};

type SubscriptionRecord = {
  id?: unknown;
  merchant_id?: unknown;
  plan_name?: unknown;
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

type MerchantDatabase = {
  subscriptions?: unknown;
  [key: string]: unknown;
};

type ReservationRecord = {
  merchant_id: string;
  event_id: string;
  amount: number;
  reserved_at: string;
  status: "pending" | "consumed";
  replies_remaining_after?: number;
};

type ReservationDatabase = {
  reservations: Record<string, ReservationRecord>;
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

const RESERVATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const RESERVATION_LIMIT = 100_000;

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function validDate(value: unknown): Date | null {
  const parsed = new Date(String(value || ""));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeStatus(value: unknown): SubscriptionStatus | null {
  const status = String(value || "").trim();
  return [
    "pending_activation",
    "active",
    "expired",
    "replies_exhausted",
    "suspended",
  ].includes(status)
    ? (status as SubscriptionStatus)
    : null;
}

function compareBatches(left: AddonReplyBatch, right: AddonReplyBatch): number {
  const leftExpiry = validDate(left.expires_at)?.getTime() || 0;
  const rightExpiry = validDate(right.expires_at)?.getTime() || 0;
  if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;

  const leftPurchased = validDate(left.purchased_at)?.getTime() || 0;
  const rightPurchased = validDate(right.purchased_at)?.getTime() || 0;
  return leftPurchased - rightPurchased;
}

function normalizeBatches(value: unknown, now: Date): AddonReplyBatch[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is AddonReplyBatch =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((batch) => {
      const amount = nonNegativeInteger(batch.amount);
      const remaining = Math.min(nonNegativeInteger(batch.remaining), amount);
      const purchasedAt = validDate(batch.purchased_at);
      const expiresAt = validDate(batch.expires_at);
      const id = String(batch.id || "").trim();

      if (
        !id ||
        !purchasedAt ||
        !expiresAt ||
        expiresAt.getTime() <= now.getTime() ||
        amount <= 0 ||
        remaining <= 0
      ) {
        return null;
      }

      return {
        ...batch,
        id,
        purchased_at: purchasedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        amount,
        remaining,
      };
    })
    .filter((batch): batch is AddonReplyBatch => batch !== null)
    .sort(compareBatches);
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}

function readMerchantDatabase(filePath: string): MerchantDatabase {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as MerchantDatabase;
}

function readReservationDatabase(filePath: string): ReservationDatabase {
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

function pruneReservations(
  reservations: Record<string, ReservationRecord>,
  now: Date,
): Record<string, ReservationRecord> {
  return Object.fromEntries(
    Object.entries(reservations)
      .filter(([, record]) => {
        const timestamp = validDate(record.reserved_at)?.getTime();
        return Boolean(
          timestamp && now.getTime() - timestamp <= RESERVATION_RETENTION_MS,
        );
      })
      .sort(
        (left, right) =>
          (validDate(right[1].reserved_at)?.getTime() || 0) -
          (validDate(left[1].reserved_at)?.getTime() || 0),
      )
      .slice(0, RESERVATION_LIMIT),
  );
}

function subscriptionsArray(database: MerchantDatabase): SubscriptionRecord[] {
  return Array.isArray(database.subscriptions)
    ? database.subscriptions.filter(
        (item): item is SubscriptionRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function findCurrentSubscription(
  subscriptions: SubscriptionRecord[],
  merchantId: string,
): SubscriptionRecord | undefined {
  return subscriptions
    .filter(
      (record) => String(record.merchant_id || "").trim() === merchantId,
    )
    .sort(
      (left, right) =>
        (validDate(right.start_date)?.getTime() || 0) -
        (validDate(left.start_date)?.getTime() || 0),
    )[0];
}

function recalculateSubscription(
  subscription: SubscriptionRecord,
  now: Date,
): {
  status: SubscriptionStatus | null;
  baseRemaining: number;
  addonRemaining: number;
  totalRemaining: number;
  batches: AddonReplyBatch[];
  expiresAt: Date | null;
} {
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
  const batches = normalizeBatches(subscription.addon_reply_batches, now);
  const addonRemaining = batches.reduce(
    (total, batch) => total + nonNegativeInteger(batch.remaining),
    0,
  );
  const totalRemaining = baseRemaining + addonRemaining;
  const expiresAt = validDate(subscription.expires_at);
  let status = normalizeStatus(subscription.status);

  if (status !== "suspended" && status !== "pending_activation") {
    status = !expiresAt || expiresAt.getTime() <= now.getTime()
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
  subscription.replies_used =
    baseUsed +
    batches.reduce(
      (total, batch) =>
        total +
        Math.max(
          0,
          nonNegativeInteger(batch.amount) - nonNegativeInteger(batch.remaining),
        ),
      0,
    );
  subscription.replies_remaining = totalRemaining;
  subscription.reply_limit =
    nonNegativeInteger(subscription.replies_used) + totalRemaining;
  if (status) subscription.status = status;
  if (status !== "active") subscription.auto_reply_enabled = false;

  return {
    status,
    baseRemaining,
    addonRemaining,
    totalRemaining,
    batches,
    expiresAt,
  };
}

function denied(
  code: Exclude<MerchantReplyEntitlementDecision, { allowed: true }>["code"],
  error: string,
): MerchantReplyEntitlementDecision {
  return { allowed: false, code, error };
}

export function reserveMerchantAutoReply(
  merchantId: string,
  eventId: string,
  now: Date = new Date(),
): MerchantReplyEntitlementDecision {
  const normalizedMerchantId = String(merchantId || "").trim();
  const normalizedEventId = String(eventId || "").trim();
  if (!normalizedMerchantId || !normalizedEventId) {
    return denied(
      "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      "merchant reply entitlement identity is unavailable",
    );
  }

  const merchantDatabasePath = getFawriDataFilePath("merchants.json");
  const reservationPath = getFawriDataFilePath("reply-reservations.json");

  try {
    const reservationsDatabase = readReservationDatabase(reservationPath);
    reservationsDatabase.reservations = pruneReservations(
      reservationsDatabase.reservations,
      now,
    );
    const existingReservation =
      reservationsDatabase.reservations[normalizedEventId];
    if (existingReservation) {
      if (existingReservation.merchant_id !== normalizedMerchantId) {
        return denied(
          "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
          "reply event identity collision detected",
        );
      }
      return {
        allowed: true,
        duplicate: true,
        repliesRemaining: nonNegativeInteger(
          existingReservation.replies_remaining_after,
        ),
        subscriptionId: "existing-reservation",
      };
    }

    const rawMerchantDatabase = fs.readFileSync(merchantDatabasePath, "utf8");
    const merchantDatabase = JSON.parse(rawMerchantDatabase) as MerchantDatabase;
    const subscriptions = subscriptionsArray(merchantDatabase);
    merchantDatabase.subscriptions = subscriptions;
    const subscription = findCurrentSubscription(
      subscriptions,
      normalizedMerchantId,
    );
    if (!subscription) {
      return denied(
        "MERCHANT_SUBSCRIPTION_REQUIRED",
        "active merchant subscription is required",
      );
    }

    const subscriptionId = String(subscription.id || "").trim();
    const state = recalculateSubscription(subscription, now);
    if (!subscriptionId || !state.status) {
      return denied(
        "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
        "merchant subscription state is invalid",
      );
    }

    if (state.status === "pending_activation") {
      writeJsonAtomically(merchantDatabasePath, merchantDatabase);
      return denied(
        "MERCHANT_SUBSCRIPTION_PENDING",
        "merchant subscription is pending activation",
      );
    }
    if (state.status === "suspended") {
      writeJsonAtomically(merchantDatabasePath, merchantDatabase);
      return denied(
        "MERCHANT_SUBSCRIPTION_SUSPENDED",
        "merchant subscription is suspended",
      );
    }
    if (state.status === "expired") {
      writeJsonAtomically(merchantDatabasePath, merchantDatabase);
      return denied(
        "MERCHANT_SUBSCRIPTION_EXPIRED",
        "merchant subscription is expired",
      );
    }
    if (state.status === "replies_exhausted" || state.totalRemaining <= 0) {
      writeJsonAtomically(merchantDatabasePath, merchantDatabase);
      return denied(
        "MERCHANT_REPLIES_EXHAUSTED",
        "merchant reply balance is exhausted",
      );
    }
    if (subscription.auto_reply_enabled !== true) {
      writeJsonAtomically(merchantDatabasePath, merchantDatabase);
      return denied(
        "MERCHANT_AUTO_REPLY_DISABLED",
        "merchant automatic replies are disabled",
      );
    }

    const pendingReservation: ReservationRecord = {
      merchant_id: normalizedMerchantId,
      event_id: normalizedEventId,
      amount: 1,
      reserved_at: now.toISOString(),
      status: "pending",
    };
    reservationsDatabase.reservations[normalizedEventId] = pendingReservation;
    writeJsonAtomically(reservationPath, reservationsDatabase);

    if (state.baseRemaining > 0) {
      subscription.base_replies_used =
        nonNegativeInteger(subscription.base_replies_used) + 1;
    } else {
      const batch = state.batches.find(
        (item) => nonNegativeInteger(item.remaining) > 0,
      );
      if (!batch) {
        delete reservationsDatabase.reservations[normalizedEventId];
        writeJsonAtomically(reservationPath, reservationsDatabase);
        return denied(
          "MERCHANT_REPLIES_EXHAUSTED",
          "merchant reply balance is exhausted",
        );
      }
      batch.remaining = nonNegativeInteger(batch.remaining) - 1;
    }

    const finalState = recalculateSubscription(subscription, now);
    writeJsonAtomically(merchantDatabasePath, merchantDatabase);

    pendingReservation.status = "consumed";
    pendingReservation.replies_remaining_after = finalState.totalRemaining;
    writeJsonAtomically(reservationPath, reservationsDatabase);

    return {
      allowed: true,
      duplicate: false,
      repliesRemaining: finalState.totalRemaining,
      subscriptionId,
    };
  } catch (error) {
    console.error("Merchant reply entitlement reservation failed:", error);
    return denied(
      "MERCHANT_REPLY_ENTITLEMENT_UNAVAILABLE",
      "merchant reply entitlement is unavailable",
    );
  }
}
