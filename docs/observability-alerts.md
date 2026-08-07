# Observability Alerts

## Data-safety rule

Metrics and alert definitions must contain operational codes only. Never put merchant IDs, user IDs, customer text, message bodies, prompts, email addresses, phone numbers, URLs, access tokens, cookies, authorization headers, database URLs, or raw exception messages into metric names, metric labels, alert IDs, alert conditions, or runbook fields.

The metrics registry fails closed by default:

- only registered `fawri_*` metric names are accepted;
- only six bounded label keys are accepted: `channel`, `operation`, `outcome`, `queue`, `reason_code`, `status`;
- channel/outcome/status values are enumerated;
- operation/queue/reason codes are bounded internal code strings;
- URL-, token-, email-, UUID-, long-numeric-, and identifier-like label values are rejected.

Alert definitions are static code, validated at module load, and contain no free-form annotations or payload interpolation.

## Default alert rules

| Alert | Metric | Severity | Condition | Window |
| --- | --- | --- | --- | --- |
| queue-depth-warning | `fawri_queue_depth` | warning | > 100 | 10m |
| queue-depth-critical | `fawri_queue_depth` | critical | > 500 | 5m |
| dlq-nonzero | `fawri_dlq_depth` | warning | > 0 | 5m |
| webhook-signature-failure-spike | `fawri_webhook_signature_failures_total` | critical | rate > 5/min | 5m |
| login-abuse-spike | `fawri_login_failures_total` | warning | rate > 20/5m | 5m |
| migration-failure | `fawri_migration_failures_total` | critical | increase > 0 | immediate |

Thresholds are initial operational defaults and should be tuned using production-safe aggregate telemetry after coordinator-approved wiring.

## Alert handling

Alert receivers should send only rule ID, severity, aggregate value, environment, deployment/version, and runbook link. They must not attach logs, request bodies, raw webhook payloads, prompts, or exception messages automatically.
