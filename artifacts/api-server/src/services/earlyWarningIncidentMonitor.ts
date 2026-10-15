import { logger } from "../lib/logger";
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
