import { FAWRI_METRICS } from "./metrics";

export type AlertSeverity = "warning" | "critical";

export type AlertRuleDefinition = {
  id: string;
  metric: string;
  severity: AlertSeverity;
  condition: string;
  for: string;
  runbook: string;
};

export const DEFAULT_ALERT_RULES: readonly AlertRuleDefinition[] = [
  {
    id: "queue-depth-warning",
    metric: FAWRI_METRICS.queueDepth,
    severity: "warning",
    condition: "> 100",
    for: "10m",
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  },
  {
    id: "queue-depth-critical",
    metric: FAWRI_METRICS.queueDepth,
    severity: "critical",
    condition: "> 500",
    for: "5m",
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  },
  {
    id: "dlq-nonzero",
    metric: FAWRI_METRICS.dlqDepth,
    severity: "warning",
    condition: "> 0",
    for: "5m",
    runbook: "docs/operations-observability.md#queue-and-dlq-response",
  },
  {
    id: "webhook-signature-failure-spike",
    metric: FAWRI_METRICS.webhookSignatureFailuresTotal,
    severity: "critical",
    condition: "rate > 5/min",
    for: "5m",
    runbook: "docs/operations-observability.md#webhook-signature-response",
  },
  {
    id: "login-abuse-spike",
    metric: FAWRI_METRICS.loginFailuresTotal,
    severity: "warning",
    condition: "rate > 20/5m",
    for: "5m",
    runbook: "docs/operations-observability.md#login-abuse-response",
  },
  {
    id: "migration-failure",
    metric: FAWRI_METRICS.migrationFailuresTotal,
    severity: "critical",
    condition: "increase > 0",
    for: "0m",
    runbook: "docs/operations-observability.md#migration-response",
  },
] as const;
