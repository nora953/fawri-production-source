import { deleteMerchantRuntimeData } from "./merchantRuntime";
import { deleteMerchantSavedAnswersData } from "./merchantSavedAnswers";
import { deleteMerchantBotTrainingData } from "./merchantBotTraining";
import { deleteMerchantAuthData } from "./merchantAuthData";

export const WARNING_1_MONTHS = 2;
export const WARNING_2_MONTHS = 3;
export const WARNING_3_MONTHS = 4;
export const RETENTION_MONTHS = 6;
export const FINAL_GRACE_DAYS = 10;

export enum MerchantDeleteReason {
  PolicyViolation = 'policy_violation',
  RetentionExpired = 'retention_expired',
}

export enum MerchantRetentionStatus {
  Protected = 'protected',
  Warning1 = 'warning_1',
  Warning2 = 'warning_2',
  Warning3 = 'warning_3',
  FinalWarning = 'final_warning',
  EligibleForDeletion = 'eligible_for_deletion',
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

function addUtcMonths(date: Date, months: number): Date {
  const sourceDay = date.getUTCDate();
  const result = new Date(date.getTime());

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();

  result.setUTCDate(Math.min(sourceDay, lastDayOfTargetMonth));
  return result;
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
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
    };
  }

  const warning1At = addUtcMonths(subscriptionEnd, WARNING_1_MONTHS);
  const warning2At = addUtcMonths(subscriptionEnd, WARNING_2_MONTHS);
  const warning3At = addUtcMonths(subscriptionEnd, WARNING_3_MONTHS);
  const finalWarningAt = addUtcMonths(subscriptionEnd, RETENTION_MONTHS);
  const gracePeriodEndsAt = addUtcDays(finalWarningAt, FINAL_GRACE_DAYS);

  if (currentDate >= gracePeriodEndsAt) {
    return {
      retentionStatus: MerchantRetentionStatus.EligibleForDeletion,
      warningStage: 4,
      eligibleForDeletionAt: gracePeriodEndsAt.toISOString(),
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  if (currentDate >= finalWarningAt) {
    return {
      retentionStatus: MerchantRetentionStatus.FinalWarning,
      warningStage: 4,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  if (currentDate >= warning3At) {
    return {
      retentionStatus: MerchantRetentionStatus.Warning3,
      warningStage: 3,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  if (currentDate >= warning2At) {
    return {
      retentionStatus: MerchantRetentionStatus.Warning2,
      warningStage: 2,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  if (currentDate >= warning1At) {
    return {
      retentionStatus: MerchantRetentionStatus.Warning1,
      warningStage: 1,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    };
  }

  return {
    retentionStatus: MerchantRetentionStatus.Protected,
    warningStage: 0,
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
