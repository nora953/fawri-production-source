# Operator replay PostgreSQL wire recovery — 2026-10-14

Prepared acceptance test, pending isolated CI. Stacked on Draft #545; no production application or migration change.

The original authenticated operator HTTP replay runs in a fresh Node process under a non-owner, non-superuser, non-BYPASSRLS role. A loopback TCP proxy forwards authentication commits, then arms only after the fresh synthetic provider confirmation. It withholds the actual PostgreSQL backend COMMIT CommandComplete at the billing receipt or entitlement boundary and closes the owned connection. An independent direct database session checks committed state and immutable original microsecond receipt time.

For SaaS and cashier, the caller must receive HTTP 503 without claiming success. A new original-authority session with revoked current finance permission must return 403 before provider traffic or execution audit. After permission restoration, two new processes/sessions concurrently replay through the actual route and original billing authorities: receipt-boundary recovery applies once plus duplicate; entitlement-boundary recovery returns two duplicates. Exactly one application/subscription remains, with original paid/event time, unchanged raw evidence and durable execution audit.

Provider transport is injected at the exact synthetic status URL; no actual Qi traffic or money. SQL runs only in guard-attested offline disposable PostgreSQL using the existing CI runner and full restore seed/verify. This is route-level HTTP, not full main-app/browser acceptance. Hosted capability rollout, expiry/device-race coverage, known-order discoverability/retention and #535 downstream Meta remain open. No merge/deploy/hosted migration or grants.

Local validation: API typecheck, syntax checks, five proxy frame-filter tests and diff whitespace check passed. CI result pending. Unrelated pre-existing capture PNG modification is preserved and excluded.
