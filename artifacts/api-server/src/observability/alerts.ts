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

const KNOWN_METRICS = new Set<string>(Object.values(FAWRI_METRICS));
const SAFE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_CONDITION = /^[a-z0-9_><=./ -]{1,64}$/i;
const SAFE_DURATION = /^(?:0|[1-9][0-9]*)(?:s|m|h)$/;
const SAFE_RUNBOOK = /^docs\/[a-z0-9./#_-]+$/i;

export function assertSafeAlertRules(rules: readonly AlertRuleDefinition[]): void {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (
      !SAFE_ID.test(rule.id) ||
      ids.has(rule.id) ||
      !KNOWN_METRICS.has(rule.metric) ||
      (rule.severity !== "warning" && rule.severity !== "critical") ||
      !SAFE_CONDITION.test(rule.condition) ||
      !SAFE_DURATION.test(rule.for) ||
      !SAFE_RUNBOOK.test(rule.runbook)
    ) {
      throw new Error("Unsafe observability alert rule definition");
    }
    ids.add(rule.id);
  }
}

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

assertSafeAlertRules(DEFAULT_ALERT_RULES);
