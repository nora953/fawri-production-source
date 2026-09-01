import {
  subscriptionLifecycleTimer,
  supportLifecycleTimer,
} from "../routes/authRuntimePart4";
import {
  operationalDatabasePool,
  operationalPostgresAuthorityRequired,
} from "./operationalPostgresAuthority";
import { refreshSubscriptionNotificationsPostgres } from "./postgresMerchantNotificationAuthority";
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
    const pool = await operationalDatabasePool();
    const subscriptions = await pool.query<{ merchant_id: string }>(
      `SELECT merchant_id FROM subscriptions ORDER BY merchant_id`,
    );
    for (const row of subscriptions.rows) {
      await refreshSubscriptionNotificationsPostgres(row.merchant_id);
    }
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
