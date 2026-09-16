import type { AiUsageTelemetrySnapshot } from "./aiUsageTelemetry";
import type { HttpTelemetrySnapshot } from "./requestTelemetry";
import type {
  EarlyWarningHealth,
  EarlyWarningIncident,
} from "../services/earlyWarningPostgresAuthority";

export const EARLY_WARNING_THRESHOLDS = {
  httpMinimumRequests: 20,
  httpWarningErrorRate: 0.05,
  httpCriticalErrorRate: 0.2,
  httpLatencyMinimumRequests: 10,
  httpWarningP95Ms: 1_500,
  httpCriticalP95Ms: 4_000,
  aiMinimumCalls: 3,
  aiWarningErrorRate: 0.1,
  aiCriticalErrorRate: 0.3,
  aiWarningAverageLatencyMs: 4_000,
  aiCriticalAverageLatencyMs: 7_000,
} as const;

function severityHealth(severity: "warning" | "critical"): EarlyWarningHealth {
  return severity === "critical" ? "critical" : "warning";
}

function worseHealth(
  left: EarlyWarningHealth,
  right: EarlyWarningHealth,
): EarlyWarningHealth {
  const rank: Record<EarlyWarningHealth, number> = {
    healthy: 0,
    unknown: 1,
    warning: 2,
    critical: 3,
  };
  return rank[right] > rank[left] ? right : left;
}

export type RuntimeEarlyWarningEvaluation = {
  health: EarlyWarningHealth;
  incidents: EarlyWarningIncident[];
};

export function evaluateRuntimeEarlyWarnings(input: {
  http: HttpTelemetrySnapshot;
  ai: AiUsageTelemetrySnapshot;
}): RuntimeEarlyWarningEvaluation {
  const incidents: EarlyWarningIncident[] = [];
  const add = (
    condition: boolean,
    incident: EarlyWarningIncident,
  ) => {
    if (condition) incidents.push(incident);
  };

  const httpErrorRate = input.http.error_rate ?? 0;
  if (input.http.requests >= EARLY_WARNING_THRESHOLDS.httpMinimumRequests) {
    const critical = httpErrorRate >= EARLY_WARNING_THRESHOLDS.httpCriticalErrorRate;
    add(
      critical || httpErrorRate >= EARLY_WARNING_THRESHOLDS.httpWarningErrorRate,
      {
        id: "runtime-http-error-rate",
        severity: critical ? "critical" : "warning",
        area: "http",
        code: "HTTP_5XX_RATE_HIGH",
        value: Math.round(httpErrorRate * 10_000) / 100,
        runbook: "docs/operations-observability.md#api-runtime-response",
      },
    );
  }

  const p95 = input.http.p95_latency_ms;
  if (
    input.http.requests >= EARLY_WARNING_THRESHOLDS.httpLatencyMinimumRequests &&
    p95 !== null
  ) {
    const critical = p95 >= EARLY_WARNING_THRESHOLDS.httpCriticalP95Ms;
    add(
      critical || p95 >= EARLY_WARNING_THRESHOLDS.httpWarningP95Ms,
      {
        id: "runtime-http-p95-latency",
        severity: critical ? "critical" : "warning",
        area: "http",
        code: "HTTP_P95_LATENCY_HIGH",
        value: Math.round(p95),
        runbook: "docs/operations-observability.md#api-runtime-response",
      },
    );
  }

  const aiErrorRate = input.ai.error_rate ?? 0;
  if (input.ai.calls >= EARLY_WARNING_THRESHOLDS.aiMinimumCalls) {
    const critical = aiErrorRate >= EARLY_WARNING_THRESHOLDS.aiCriticalErrorRate;
    add(
      critical || aiErrorRate >= EARLY_WARNING_THRESHOLDS.aiWarningErrorRate,
      {
        id: "runtime-ai-error-rate",
        severity: critical ? "critical" : "warning",
        area: "ai",
        code: "AI_PROVIDER_ERROR_RATE_HIGH",
        value: Math.round(aiErrorRate * 10_000) / 100,
        runbook: "docs/operations-observability.md#ai-runtime-response",
      },
    );
  }

  const aiLatency = input.ai.average_latency_ms;
  if (input.ai.calls >= EARLY_WARNING_THRESHOLDS.aiMinimumCalls && aiLatency !== null) {
    const critical = aiLatency >= EARLY_WARNING_THRESHOLDS.aiCriticalAverageLatencyMs;
    add(
      critical || aiLatency >= EARLY_WARNING_THRESHOLDS.aiWarningAverageLatencyMs,
      {
        id: "runtime-ai-latency",
        severity: critical ? "critical" : "warning",
        area: "ai",
        code: "AI_PROVIDER_LATENCY_HIGH",
        value: Math.round(aiLatency),
        runbook: "docs/operations-observability.md#ai-runtime-response",
      },
    );
  }

  add(input.ai.timeouts > 0, {
    id: "runtime-ai-timeout",
    severity: input.ai.timeouts >= 3 ? "critical" : "warning",
    area: "ai",
    code: "AI_PROVIDER_TIMEOUTS",
    value: input.ai.timeouts,
    runbook: "docs/operations-observability.md#ai-runtime-response",
  });

  add(input.http.capped, {
    id: "runtime-http-telemetry-capped",
    severity: "warning",
    area: "observability",
    code: "HTTP_TELEMETRY_CAP_REACHED",
    value: input.http.retained_events,
    runbook: "docs/operations-observability.md#telemetry-coverage-response",
  });

  add(input.ai.capped, {
    id: "runtime-ai-telemetry-capped",
    severity: "warning",
    area: "observability",
    code: "AI_TELEMETRY_CAP_REACHED",
    value: input.ai.retained_events,
    runbook: "docs/operations-observability.md#telemetry-coverage-response",
  });

  const health = incidents.reduce<EarlyWarningHealth>(
    (current, incident) => worseHealth(current, severityHealth(incident.severity)),
    "healthy",
  );

  return { health, incidents };
}

export function mergeEarlyWarningHealth(
  base: EarlyWarningHealth,
  runtime: EarlyWarningHealth,
): EarlyWarningHealth {
  return worseHealth(base, runtime);
}
