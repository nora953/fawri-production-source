# Operations Observability

## Current runtime status

The API observability module is mounted by the canonical application at `/ops` and provides:

- `/ops/health`: liveness metadata with bounded service/version fields;
- `/ops/readiness`: dependency checks with timeout and generic failure codes;
- `/ops/metrics`: registered aggregate Prometheus metrics with bounded labels and default-deny access;
- static alert definitions and validation.

The runtime uses one process-wide metrics registry. The canonical application currently supplies readiness checks for PostgreSQL authority and production release configuration. Metrics access is denied unless the request presents the configured internal observability bearer token. The legacy `/healthz` route remains available until deployment probe cutover is explicitly completed.

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

## Early-warning extension

The next observability phase may build an authenticated Early Warning / System Health control plane on top of these contracts. It should instrument real runtime events first, then aggregate, evaluate alerts, and finally expose dashboards. A missing telemetry source must be reported as unavailable or not instrumented rather than represented as zero.

Recommended coverage includes API latency/error rates, PostgreSQL health, queue/DLQ health, channel/webhook/send health, AI token usage and latency, bot guardrail outcomes, merchant usage rollups, support delivery/storage failures, security signals, and incident lifecycle. Telemetry must use bounded reason/status codes and must not contain customer message text, raw prompts, webhook bodies, credentials, or secrets.

## Queue and DLQ response

Investigate aggregate queue depth/age and DLQ counts. Use server-side IDs only in authenticated diagnostic tools, not in metrics labels or alert payloads. Never attach customer messages to an alert.

## Webhook signature response

A signature-failure spike should trigger channel/security investigation using aggregate counts and existing secure audit paths. Do not include webhook bodies, headers, or access tokens in the alert.

## Login abuse response

Use aggregate failure rates and existing auth security audit data. Do not add email, phone, IP address, session cookie, or credential values to metrics labels.

## Migration response

Migration failure alerts must point operators to the migration workflow/runbook and the failing run. Do not copy database URLs or raw secret-bearing command output into alert annotations.
