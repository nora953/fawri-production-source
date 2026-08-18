# Operations Observability

## Current runtime status

The API observability module is mounted by the canonical application at `/ops` and provides:

- `/ops/health`: liveness metadata with bounded service/version fields;
- `/ops/readiness`: dependency checks with timeout and generic failure codes;
- `/ops/metrics`: registered aggregate Prometheus metrics with bounded labels and default-deny access;
- static alert definitions and validation.

The runtime uses one process-wide metrics registry. The canonical application currently supplies readiness checks for PostgreSQL authority and production release configuration. Metrics access is denied unless the request presents the configured internal observability bearer token. The legacy `/healthz` route remains available until deployment probe cutover is explicitly completed.

The authenticated administrator Early Warning control plane is exposed at `/api/auth/admin/early-warning`. It derives aggregate system state from PostgreSQL plus bounded current-process HTTP and AI telemetry. The endpoint requires the `view_logs` permission. Merchant-identifying health rows are returned only when the authenticated administrator also has `view_merchants`; aggregate system health remains available without merchant identifiers.

## Fail-closed contracts

### Health

Health reports `200` only when service name, version, timestamp, and uptime are valid. Unsafe service/version values are not echoed and produce an `unhealthy` result. Router-level exceptions become a generic `503` response.

### Readiness

Readiness reports `ready` only when at least one coordinator-supplied dependency check exists and every check succeeds. Empty configuration, duplicate/invalid check names, exceptions, or timeouts produce `not_ready`. Thrown error messages are never included in the response.

### Metrics

Metrics accept registered metric names and bounded internal labels only. Unregistered names, forbidden label keys, unsafe values, token/URL/email-like values, and high-cardinality identifiers are rejected. The metrics HTTP route returns `503` unless the configured internal access predicate succeeds.

All probe responses set `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

## Integration constraints

The observability wiring is active. Future monitoring work must extend the current authority instead of creating a second metrics surface.

1. Keep one process-wide `MetricsRegistry` and register new aggregate metrics explicitly.
2. Add readiness checks only for server-owned dependencies with real authority interfaces. Do not invent object-storage, queue, provider, or credential state.
3. Keep service/version values bounded and free of secrets or customer data.
4. Keep `/ops/metrics` default-deny. Never expose it publicly with an unconditional allow predicate.
5. Do not put merchant IDs, user IDs, phone numbers, emails, conversation IDs, message IDs, IP addresses, tokens, or other high-cardinality/private values in Prometheus labels.
6. Merchant-specific diagnostics belong in authenticated server-derived diagnostic APIs or PostgreSQL rollups, not in public/aggregate metric labels.
7. Keep `/healthz` until deployment probe cutover is separately confirmed.

## Early-warning control plane

The Early Warning / System Health surface follows an instrumentation-first model. PostgreSQL is the authority for queue, channel, delivery, credit/refund, support, knowledge decision, and merchant-health rollups. Current-process bounded telemetry adds API latency/error rates and AI provider attempts, outcomes, latency, and provider-reported token usage.

A missing authority is not represented as zero. Coverage is explicitly marked `available`, `partial`, or `not_instrumented`. Current-process telemetry is intentionally bounded and is not a replacement for durable Prometheus/external observability retention.

Current PostgreSQL-derived coverage includes:

- queue ready/processing/dead-letter state, oldest-ready age, failures, and dangerous failure codes;
- channel connection state, recent channel errors, credential expiry proximity, and latest webhook timestamp;
- inbound events, message counts, failed messages, outbound sent/confirmed-failed/uncertain/stuck-pending outcomes, and outbound p95 latency;
- deterministic bot/knowledge decision outcomes, prompt-injection blocks, expected suppression outcomes, and dangerous guardrail failure codes;
- reply debit/credit activity, stale reservations, pending refunds, and refund conflicts;
- support ticket state, waiting-on-admin counts, attachment bytes, and local-filesystem attachment count;
- per-merchant operational health rows for authorized administrators only.

Current-process runtime coverage includes:

- HTTP request count, rejected requests, 5xx count/error rate, p50/p95/p99 latency, bounded request/response byte estimates, and aggregate operation families;
- AI provider call attempts, successful/failed calls, timeouts, average latency, provider/model rollups, per-merchant call rollups, and provider-reported input/output/total token usage.

No early-warning telemetry stores customer message text, raw prompts, webhook bodies, passwords, access tokens, secrets, or credentials.

## Runtime alert thresholds

Thresholds are deterministic and defined in `artifacts/api-server/src/observability/earlyWarningEvaluation.ts`. They deliberately require minimum sample sizes where rates are used, so one isolated failure does not manufacture a system incident.

- HTTP 5xx rate: evaluate after at least 20 requests; warning at 5%, critical at 20%.
- HTTP p95 latency: evaluate after at least 10 requests; warning at 1.5 seconds, critical at 4 seconds.
- AI provider error rate: evaluate after at least 3 provider calls; warning at 10%, critical at 30%.
- AI average latency: evaluate after at least 3 provider calls; warning at 4 seconds, critical at 7 seconds.
- Any AI provider timeout creates at least a warning; three or more in the selected window are critical.
- Reaching the bounded in-process HTTP or AI event cap creates an observability warning because retained history may be incomplete.

These thresholds are operational defaults, not business-SLA claims. Production tuning should be based on observed traffic and an explicit change review.

## Queue and DLQ response

Investigate aggregate queue depth/age and DLQ counts. Use server-side IDs only in authenticated diagnostic tools, not in metrics labels or alert payloads. Never attach customer messages to an alert.

For uncertain outbound delivery, stuck pending delivery, stale reply reservations, refund conflicts, or dangerous guardrail codes, stop unsafe automatic retry assumptions and inspect the existing durable job/delivery/reconciliation authorities. Preserve exactly-once debit/refund and uncertain-send safety rules.

## API runtime response

For `HTTP_5XX_RATE_HIGH`, inspect the aggregate operation breakdown first, then correlate with readiness, PostgreSQL health, queue state, and deployment/runtime logs. Do not add request bodies, cookies, session identifiers, phone numbers, or customer data to telemetry.

For `HTTP_P95_LATENCY_HIGH`, identify the affected aggregate operation family and verify whether the delay is database, queue, provider, or application-runtime related before changing timeouts. A latency warning alone is not evidence of a database fault.

## AI runtime response

For `AI_PROVIDER_ERROR_RATE_HIGH`, `AI_PROVIDER_TIMEOUTS`, or `AI_PROVIDER_LATENCY_HIGH`, confirm provider configuration and transport health, then compare provider/model rollups and bot handoff/suppression behavior. Never log or attach raw prompts or customer text to an incident.

Token totals are authoritative only when the provider explicitly reports usage. Calls without provider usage still count as attempts but do not invent token values. Monetary cost must not be inferred unless a separate versioned pricing authority is configured.

## Telemetry coverage response

`HTTP_TELEMETRY_CAP_REACHED` or `AI_TELEMETRY_CAP_REACHED` means the bounded current-process event buffer reached its maximum retained size. The dashboard must continue operating, but the selected historical window may be incomplete. Use durable external metrics retention for long-running production history rather than increasing memory without an explicit capacity review.

Database physical storage and hosting-provider network transfer remain separate authorities. Until those authorities are connected, the dashboard must show them as unavailable/not instrumented rather than zero.

Support attachment bytes currently include PostgreSQL metadata for attachments, while actual support image bytes still depend on the active storage provider. Local filesystem storage is explicitly surfaced as a production-readiness warning signal rather than represented as durable object storage.

## Webhook signature response

A signature-failure spike should trigger channel/security investigation using aggregate counts and existing secure audit paths. Do not include webhook bodies, headers, or access tokens in the alert.

## Login abuse response

Use aggregate failure rates and existing auth security audit data. Do not add email, phone, IP address, session cookie, or credential values to metrics labels.

## Migration response

Migration failure alerts must point operators to the migration workflow/runbook and the failing run. Do not copy database URLs or raw secret-bearing command output into alert annotations.
