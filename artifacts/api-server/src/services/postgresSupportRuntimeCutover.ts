import {
  subscriptionLifecycleTimer,
  supportLifecycleTimer,
} from "../routes/authRuntimePart4";
import {
  operationalPostgresAuthorityRequired,
} from "./operationalPostgresAuthority";
import { manualCommercialRelease } from "./manualCommercialRelease";
import { refreshSubscriptionNotificationsPostgresForAllMerchants } from "./postgresMerchantNotificationAuthority";
import {
  refreshSupportLifecyclePostgresCanonical,
  SUPPORT_LIFECYCLE_SWEEP_MS,
} from "./postgresSupportLifecycleAuthority";

let started = false;
let running = false;
let activeSweep: Promise<void> | null = null;
let postgresTimer: NodeJS.Timeout | null = null;

function sweepPostgresSupportRuntime(): Promise<void> {
  if (activeSweep) return activeSweep;

  running = true;
  const sweep = (async () => {
    await refreshSupportLifecyclePostgresCanonical();
    await refreshSubscriptionNotificationsPostgresForAllMerchants();
  })();

  activeSweep = sweep.finally(() => {
    running = false;
    activeSweep = null;
  });

  return activeSweep;
}

export function startPostgresSupportRuntimeCutover(): void {
  if (started || !operationalPostgresAuthorityRequired()) return;
  started = true;

  // These timers are created by the compatibility module at import time.
  // PostgreSQL required mode must never let them read/write the JSON authority.
  clearInterval(supportLifecycleTimer);
  clearInterval(subscriptionLifecycleTimer);

  // Manual V1 does not expose the support/inspection routes. The auth issuer
  // must NEVER acquire direct cross-merchant support/notification privileges
  // just to start these background sweeps. Subscription entitlement checks
  // remain on the normal request path, not this optional reminder worker.
  if (manualCommercialRelease()) return;

  void sweepPostgresSupportRuntime().catch((error) => {
    console.error("PostgreSQL support lifecycle startup sweep failed:", error);
  });

  postgresTimer = setInterval(() => {
    void sweepPostgresSupportRuntime().catch((error) => {
      console.error("PostgreSQL support lifecycle sweep failed:", error);
    });
  }, SUPPORT_LIFECYCLE_SWEEP_MS);
  postgresTimer.unref();
}

export async function stopPostgresSupportRuntimeCutoverForTests(): Promise<void> {
  if (postgresTimer) clearInterval(postgresTimer);
  postgresTimer = null;
  started = false;

  const sweep = activeSweep;
  if (sweep) {
    await sweep.catch(() => undefined);
  }

  running = false;
}
