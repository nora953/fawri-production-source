# Fawri alert definitions

These are launch baselines, not evidence that an alerting platform is configured. Thresholds must be tuned after a non-production load test and seven days of representative traffic.

| Signal | Warning | Critical | Minimum duration | Required action |
|---|---:|---:|---:|---|
| HTTP error ratio | >2% | >5% | 10m / 5m | Freeze rollout; identify operation and status class |
| Queue depth | >100 | >500 | 10m / 5m | Check worker heartbeat, locks, dependency latency |
| Oldest ready job | >120s | >300s | 10m / 5m | Treat as worker starvation or blocked dependency |
| DLQ depth | >0 | >10 or any rapid growth | 5m | Inspect safe metadata; no blind bulk requeue |
| Webhook signature failures | >2% or >2/min | >10% or >5/min | 10m / 5m | Verify raw-body handling and secret version; never bypass HMAC |
| Login/OTP/reset failures | >20 per 5m | >100 per 5m | 5m | Check abuse controls and account-enumeration safety |
| Migration failure increase | n/a | any increase | immediate | Stop rollout; preserve run ID; rollback or restore |
| Readiness failure | 1 instance | >25% instances | 2m | Check dependency-specific readiness result |
| Restore drill failure | n/a | any scheduled failure | immediate | Block release until a verified drill succeeds |

Alert labels must remain bounded and non-identifying. Never include merchant ID, phone, email, access token, customer message, payment evidence, or webhook payload.
