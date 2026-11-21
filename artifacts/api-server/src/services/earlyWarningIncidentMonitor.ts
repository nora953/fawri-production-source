import { logger } from "../lib/logger";
import { manualCommercialRelease } from "./manualCommercialRelease";
import { withAuthenticationTransaction } from "./authenticationPostgresAuthority";
import { getAiUsageTelemetrySnapshot } from "../observability/aiUsageTelemetry";
import { evaluateRuntimeEarlyWarnings } from "../observability/earlyWarningEvaluation";
import {
  evaluateMerchantEarlyWarnings,
  operationalMerchantHealthRows,
} from "../observability/earlyWarningMerchantEvaluation";
import { getHttpTelemetrySnapshot } from "../observability/requestTelemetry";
import {
  syncEarlyWarningIncidentHistory,
  type EarlyWarningIncidentWithScope,
} from "./earlyWarningIncidentHistory";
import { loadEarlyWarningPostgresSnapshot } from "./earlyWarningPostgresAuthority";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

const DEFAULT_INTERVAL_MS = 30_000;

function systemIncident(
  incident: Omit<EarlyWarningIncidentWithScope, "scope" | "merchant_id" | "merchant_name">,
): EarlyWarningIncidentWithScope {
  return {
    ...incident,
    scope: "system",
    merchant_id: null,
    merchant_name: null,
  };
}

export async function observeEarlyWarningIncidentsOnce(): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) return;

  if (manualCommercialRelease()) {
    // First-commercial V1 offers manual orders, not Meta/AI/Support/POS.
    // The global cross-merchant full-product snapshot must NOT be queried
    // using the narrowly authorized authentication issuer LOGIN. A generic
    // grant to background_jobs, messages or audit_events would break the
    // separately accepted least-privilege production profile.
    //
    // Retain an authenticated database liveness probe and in-process HTTP
    // telemetry warnings. This is deliberately runtime-only: it does NOT
    // certify durable incident history or full-production observability.
    await withAuthenticationTransaction(async (client) => {
      await client.query("SELECT 1");
    });
    const runtime = evaluateRuntimeEarlyWarnings({
      http: getHttpTelemetrySnapshot("1h"),
      ai: getAiUsageTelemetrySnapshot("1h"),
    });
    for (const warning of runtime.incidents) {
      logger.warn(
        { code: warning.code, severity: warning.severity, area: warning.area },
        "V1 runtime-only early warning; durable incident history not connected",
      );
    }
    return;
  }

  const snapshot = await loadEarlyWarningPostgresSnapshot("1h");
  const http = getHttpTelemetrySnapshot("1h");
  const ai = getAiUsageTelemetrySnapshot("1h");
  const runtime = evaluateRuntimeEarlyWarnings({ http, ai });
  const merchants = operationalMerchantHealthRows(snapshot.merchants);
  const merchantIncidents = evaluateMerchantEarlyWarnings(merchants);
  const incidents: EarlyWarningIncidentWithScope[] = [
    ...snapshot.incidents.map(systemIncident),
    ...merchantIncidents,
    ...runtime.incidents.map(systemIncident),
  ];

  await syncEarlyWarningIncidentHistory({ incidents, window: "30d" });
}

export type EarlyWarningIncidentMonitor = {
  stop(): void;
  runNow(): Promise<void>;
};

export function startEarlyWarningIncidentMonitor(
  intervalMs = DEFAULT_INTERVAL_MS,
): EarlyWarningIncidentMonitor {
  let stopped = false;
  let running = false;

  const runNow = async (): Promise<void> => {
    if (stopped || running || !operationalPostgresAuthorityRequired()) return;
    running = true;
    try {
      await observeEarlyWarningIncidentsOnce();
    } catch (error) {
      logger.warn(
        {
          code: String(
            (error as { code?: unknown } | null)?.code ||
              "EARLY_WARNING_MONITOR_ITERATION_FAILED",
          ),
        },
        "Early warning incident monitor iteration failed",
      );
    } finally {
      running = false;
    }
  };

  void runNow();
  const timer = setInterval(() => void runNow(), Math.max(5_000, intervalMs));
  timer.unref();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    runNow,
  };
}
