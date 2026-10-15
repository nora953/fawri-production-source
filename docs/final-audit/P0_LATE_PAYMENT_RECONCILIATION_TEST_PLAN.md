# P0 late-payment reconciliation test specification (pending executable coverage)

Scope: operator verified-receipt replay, SaaS and cashier. Prior cross-merchant, session, device and COMMIT-loss proofs passed in isolated PostgreSQL workflow 38663830943 (15/15). This document does not assert that late-payment tests ran.

For each billing kind, create an isolated merchant, pending checkout and immutable verified provider receipt using the existing wire recovery fixture. Mark the checkout expired and set request_expires_at before the receipt's first_received_at. Replay the verified receipt through the original authenticated operator HTTP route under the restricted PostgreSQL role and injected synthetic provider.

Required assertions: provider confirmation occurs once; the route never reports an applied entitlement; order is durably paid_reconciliation_required; the original receipt remains byte-for-byte unchanged; no entitlement application or subscription is created; event is recorded as rejected; paid_at retains original first_received_at microseconds. Repeat with a fresh admin session: no entitlement may be granted. Check both SaaS and cashier, and report the actual HTTP status separately from the persisted reconciliation outcome.

Caution: execution returns 409 for reconciliation_required after the billing transaction; verify durable state rather than interpreting the HTTP response as a rolled-back payment. Never use a real payment provider. Do not merge or deploy without green isolated-PostgreSQL evidence.
