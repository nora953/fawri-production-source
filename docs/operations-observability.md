# Fawri operations and observability runbook

## Status and integration boundary

The files under `artifacts/api-server/src/observability/` are isolated components. They are **not mounted** in `app.ts` or `index.ts` by this lane. Until the integration coordinator mounts the router and wires real dependency checks and metric updates, the endpoints and alerts described here are not active.

Recommended mount: `/internal/observability`. Restrict `/metrics` and detailed readiness output to an internal network or authenticated operator path. Public health should expose only the bounded health payload.

## Endpoint contracts

- `GET /health`: process liveness only. It must not query PostgreSQL, queues, object storage, Meta, or other external systems.
- `GET /readiness`: returns `200` only when every registered dependency check succeeds; otherwise `503`. Exceptions are reduced to `dependency_unavailable` or `timeout` and never expose connection strings or payloads.
- `GET /metrics`: Prometheus text from `MetricsRegistry`. Only bounded labels are accepted: `channel`, `operation`, `outcome`, `queue`, `reason_code`, and `status`. Merchant IDs, phone numbers, email addresses, message text, tokens, and request IDs are forbidden as metric labels.

Readiness dependencies required before launch: PostgreSQL read/write probe, durable queue repository, object-storage metadata probe, migration state, and required channel credential/key-management readiness. A downstream Meta API call should not be in readiness because an external outage must not restart healthy application processes.

## Alert routing

Every critical alert requires a named primary responder, backup responder, incident channel, and escalation timer before production launch. The current repository defines thresholds, but no notification destination is configured here.

### Queue and DLQ response

1. Stop deployments and bulk requeues.
2. Compare queue depth, oldest ready age, worker heartbeat, lock/visibility timeout, retry rate, and DLQ growth.
3. Confirm whether workers are absent, crashing, rate-limited, or blocked by a dependency.
4. Never requeue uncertain-delivery jobs automatically. Inspect the safe metadata contract and follow the one-time refund rules owned by the channels lane.
5. Escalate when depth exceeds 500 for five minutes, oldest ready age exceeds five minutes, or DLQ grows after mitigation.

### Webhook signature response

1. Verify the configured app secret version and deployment timestamp without printing the secret.
2. Compare failure counts by `channel` and bounded `reason_code`; do not inspect raw payloads in alerts.
3. Check proxy/body-parser changes that could mutate the raw body.
4. Treat a sudden spike as possible abuse or secret mismatch. Do not bypass signature verification to restore traffic.

### Login abuse response

1. Confirm aggregate failure rate and rate-limiter state without grouping metrics by phone, email, or IP.
2. Check whether one operation (`login`, `otp`, `reset`) is affected.
3. Preserve non-enumerating responses and do not weaken lockouts.
4. Escalate suspected credential stuffing to the security owner and preserve sanitized audit evidence.

### Migration response

1. Freeze rollout and writes covered by the migration plan.
2. Preserve the exact migration run ID and sanitized failure code.
3. Verify lock ownership, source hashes, migration journal, and rollback eligibility.
4. Execute only the documented rollback or restore path. Never rerun in write mode merely to make the alert disappear.

## Metrics required from domain integration

- Queue: `fawri_queue_depth`, `fawri_queue_oldest_ready_age_seconds`, `fawri_dlq_depth`.
- Webhooks: `fawri_webhook_signature_failures_total`.
- Authentication: `fawri_login_failures_total`.
- Migration: `fawri_migration_failures_total`.
- HTTP: `fawri_http_requests_total`, `fawri_http_errors_total`.

All counters must be updated after the authoritative server-side outcome, not from frontend events.
