import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

export type MerchantRetentionUpdateSummary = {
  checked: number;
  updated: number;
};

type RetentionUpdateHandler = () => MerchantRetentionUpdateSummary;

let updateHandler: RetentionUpdateHandler | undefined;

const SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function registerMerchantRetentionUpdate(
  handler: RetentionUpdateHandler,
): void {
  updateHandler = handler;
}

export function runMerchantRetentionUpdate(): MerchantRetentionUpdateSummary {
  if (operationalPostgresAuthorityRequired()) {
    return { checked: 0, updated: 0 };
  }
  if (!updateHandler) {
    throw new Error("Merchant retention update handler is not registered");
  }

  return updateHandler();
}

export function startMerchantRetentionScheduler(): void {
  if (operationalPostgresAuthorityRequired()) return;

  const globalState = globalThis as typeof globalThis & {
    __fawriMerchantRetentionSchedulerStarted?: boolean;
  };

  if (globalState.__fawriMerchantRetentionSchedulerStarted) return;
  globalState.__fawriMerchantRetentionSchedulerStarted = true;

  runMerchantRetentionUpdate();

  const timer = setInterval(() => {
    try {
      runMerchantRetentionUpdate();
    } catch (error) {
      console.error("Merchant retention scheduled update failed:", error);
    }
  }, SCHEDULER_INTERVAL_MS);

  timer.unref?.();
}