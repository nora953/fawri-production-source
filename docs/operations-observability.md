# Operations Observability

## Components delivered in this branch

The API observability module provides isolated contracts for:

- `/health`: liveness metadata with bounded service/version fields;
- `/readiness`: dependency checks with timeout and generic failure codes;
- `/metrics`: registered aggregate Prometheus metrics with bounded labels and default-deny access;
- static alert definitions and validation.

These components are intentionally not mounted by this branch because `artifacts/api-server/src/app.ts` and shared routing files are outside this task's ownership.

## Fail-closed contracts

### Health

Health reports `200` only when service name, version, timestamp, and uptime are valid. Unsafe service/version values are not echoed and produce an `unhealthy` result. Router-level exceptions become a generic `503` response.

### Readiness

Readiness reports `ready` only when at least one coordinator-supplied dependency check exists and every check succeeds. Empty configuration, duplicate/invalid check names, exceptions, or timeouts produce `not_ready`. Thrown error messages are never included in the response.

### Metrics

Metrics accept registered metric names and bounded internal labels only. Unregistered names, forbidden label keys, unsafe values, token/URL/email-like values, and high-cardinality identifiers are rejected. The metrics HTTP route returns `503` unless the coordinator supplies an explicit access predicate.

All probe responses set `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

## Coordinator handoff required

`STOP: coordinator handoff required`

To activate the module, the coordinator must make the wiring change in an owned integration branch. The required wiring is:

1. Import `createObservabilityRouter` and `MetricsRegistry` from `./observability` in `artifacts/api-server/src/app.ts` (or the coordinator-owned shared router).
2. Construct one process-wide `MetricsRegistry`.
3. Supply non-empty readiness checks for the final server-authoritative dependencies. At minimum, the database authority used by the final runtime must have a lightweight read/ping check. Add queue/object-storage checks only when a server-owned dependency interface exists; do not invent external credentials or fallback authorities.
4. Supply bounded `service` and deployment `version` values that do not contain secrets or customer data.
5. Supply `allowMetrics(request)` using the deployment's internal-network/service-auth policy. Do not set it to unconditional `true` on a public route.
6. Mount the router at the coordinator-approved operational prefix, for example `app.use("/ops", observabilityRouter)`, then configure platform probes to `/ops/health` and `/ops/readiness` and the internal scraper to `/ops/metrics`.
7. Keep the existing `/healthz` route until the coordinator confirms deployment probe cutover; this branch does not delete or replace it.

The coordinator should add an integration test that starts the real app and proves the mounted paths return the expected status codes with a failing and a passing readiness dependency.

## Queue and DLQ response

Investigate aggregate queue depth/age and DLQ counts. Use server-side IDs only in authenticated diagnostic tools, not in metrics labels or alert payloads. Never attach customer messages to an alert.

## Webhook signature response

A signature-failure spike should trigger channel/security investigation using aggregate counts and existing secure audit paths. Do not include webhook bodies, headers, or access tokens in the alert.

## Login abuse response

Use aggregate failure rates and existing auth security audit data. Do not add email, phone, IP address, session cookie, or credential values to metrics labels.

## Migration response

Migration failure alerts must point operators to the migration workflow/runbook and the failing run. Do not copy database URLs or raw secret-bearing command output into alert annotations.
