import { deleteMerchantRuntimeData } from "./merchantRuntime";
import { deleteMerchantSavedAnswersData } from "./merchantSavedAnswers";
import { deleteMerchantBotTrainingData } from "./merchantBotTraining";
import { deleteMerchantAuthData } from "./merchantAuthData";

export const WARNING_1_MONTHS = 2;
export const WARNING_2_MONTHS = 3;
export const WARNING_3_MONTHS = 4;
export const RETENTION_MONTHS = 6;
export const FINAL_GRACE_DAYS = 10;

const BAGHDAD_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

export enum MerchantDeleteReason {
  PolicyViolation = "policy_violation",
  RetentionExpired = "retention_expired",
}

export enum MerchantRetentionStatus {
  Protected = "protected",
  Warning1 = "warning_1",
  Warning2 = "warning_2",
  Warning3 = "warning_3",
  FinalWarning = "final_warning",
  EligibleForDeletion = "eligible_for_deletion",
}

export interface MerchantLifecycle {
  subscriptionStartedAt?: string;
  subscriptionExpiresAt?: string;
  lastSubscriptionEndedAt?: string;
  warningStage: 0 | 1 | 2 | 3 | 4;
  retentionStatus: MerchantRetentionStatus;
}

export interface RetentionCalculation {
  retentionStatus: MerchantRetentionStatus;
  warningStage: 0 | 1 | 2 | 3 | 4;
  productsReadOnly: boolean;
  accountShouldBeSuspended: boolean;
  eligibleForDeletionAt?: string;
  gracePeriodEndsAt?: string;
}

export interface DeleteMerchantOptions {
  merchantId: string;
  reason: MerchantDeleteReason;
  performedBy: string;
  performedAt: string;
  retentionStatus?: MerchantRetentionStatus;
}

export interface DeleteMerchantResult {
  ok: true;
  deletedMerchantId: string;
  reason: MerchantDeleteReason;
  performedBy: string;
  performedAt: string;
  deleted: {
    merchant: number;
    otps: number;
    products: number;
    conversations: number;
    orders: number;
    orderDrafts: number;
    metaPages: number;
    savedAnswers: number;
    trainingRequests: number;
    learnedAnswers: number;
  };
}

function getBaghdadDateParts(date: Date) {
  const shifted = new Date(date.getTime() + BAGHDAD_UTC_OFFSET_MS);
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

function addBaghdadCalendarMonths(date: Date, months: number): Date {
  const parts = getBaghdadDateParts(date);
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
  const targetDay = Math.min(parts.day, lastDay);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - BAGHDAD_UTC_OFFSET_MS,
  );
}

function addBaghdadCalendarDays(date: Date, days: number): Date {
  const parts = getBaghdadDateParts(date);
  return new Date(
    Date.UTC(
      parts.year,
      parts.month,
      parts.day + days,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ) - BAGHDAD_UTC_OFFSET_MS,
  );
}

function parseValidDate(value?: string): Date | undefined {
  if (!value) return undefined;

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export function calculateRetentionStatus(
  lastSubscriptionEndedAt?: string,
  currentDate: Date = new Date(),
): RetentionCalculation {
  const subscriptionEnd = parseValidDate(lastSubscriptionEndedAt);

  if (!subscriptionEnd || currentDate < subscriptionEnd) {
    return {
      retentionStatus: MerchantRetentionStatus.Protected,
      warningStage: 0,
      productsReadOnly: false,
      accountShouldBeSuspended: false,
    };
  }

  const warning1At = addBaghdadCalendarMonths(
    subscriptionEnd,
    WARNING_1_MONTHS,
  );
  const warning2At = addBaghdadCalendarMonths(
    subscriptionEnd,
    WARNING_2_MONTHS,
  );
  const warning3At = addBaghdadCalendarMonths(
    subscriptionEnd,
    WARNING_3_MONTHS,
  );
  const finalWarningAt = addBaghdadCalendarMonths(
    subscriptionEnd,
    RETENTION_MONTHS,
  );
  const gracePeriodEndsAt = addBaghdadCalendarDays(
    finalWarningAt,
    FINAL_GRACE_DAYS,
  );

  if (currentDate >= gracePeriodEndsAt) {
    return {
      retentionStatus: MerchantRetentionStatus.EligibleForDeletion,
      warningStage: 4,
      productsReadOnly: true,
      accountShouldBeSuspended: true,
      eligibleForDeletionAt: gracePeriodEndsAt.toISOString(),
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  if (currentDate >= finalWarningAt) {
    return {
      retentionStatus: MerchantRetentionStatus.FinalWarning,
      warningStage: 4,
      productsReadOnly: true,
      accountShouldBeSuspended: false,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  if (currentDate >= warning3At) {
    return {
      retentionStatus: MerchantRetentionStatus.Warning3,
      warningStage: 3,
      productsReadOnly: true,
      accountShouldBeSuspended: false,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  if (currentDate >= warning2At) {
    return {
      retentionStatus: MerchantRetentionStatus.Warning2,
      warningStage: 2,
      productsReadOnly: true,
      accountShouldBeSuspended: false,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  if (currentDate >= warning1At) {
    return {
      retentionStatus: MerchantRetentionStatus.Warning1,
      warningStage: 1,
      productsReadOnly: false,
      accountShouldBeSuspended: false,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  return {
    retentionStatus: MerchantRetentionStatus.Protected,
    warningStage: 0,
    productsReadOnly: false,
    accountShouldBeSuspended: false,
    gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
  };
}

export function canDeleteMerchant(
  reason: MerchantDeleteReason,
  retentionStatus: MerchantRetentionStatus,
): boolean {
  if (reason === MerchantDeleteReason.PolicyViolation) {
    return true;
  }

  return retentionStatus === MerchantRetentionStatus.EligibleForDeletion;
}

export function deleteMerchant(
  options: DeleteMerchantOptions,
): DeleteMerchantResult {
  const merchantId = options.merchantId.trim();

  if (!merchantId) {
    throw new Error("merchantId is required");
  }

  const retentionStatus =
    options.retentionStatus || MerchantRetentionStatus.Protected;

  if (!canDeleteMerchant(options.reason, retentionStatus)) {
    throw new Error("merchant is not eligible for retention deletion");
  }

  const runtime = deleteMerchantRuntimeData(merchantId);
  const savedAnswers = deleteMerchantSavedAnswersData(merchantId);
  const botTraining = deleteMerchantBotTrainingData(merchantId);

  // Delete the account last so a failed dependency cleanup does not
  // remove the merchant login before the failure is reported.
  const auth = deleteMerchantAuthData(merchantId);

  return {
    ok: true,
    deletedMerchantId: merchantId,
    reason: options.reason,
    performedBy: options.performedBy,
    performedAt: options.performedAt,
    deleted: {
      merchant: auth.merchant,
      otps: auth.otps,
      products: runtime.products,
      conversations: runtime.conversations,
      orders: runtime.orders,
      orderDrafts: runtime.orderDrafts,
      metaPages: runtime.metaPages,
      savedAnswers,
      trainingRequests: botTraining.trainingRequests,
      learnedAnswers: botTraining.learnedAnswers,
    },
  };
}
