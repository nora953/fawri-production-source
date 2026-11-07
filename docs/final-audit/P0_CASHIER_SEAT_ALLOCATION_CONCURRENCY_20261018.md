# P0 cashier seat allocation concurrency review — 2026-10-18

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Source inspection only.

`assignCashierStationSeatInTransaction` first calls `subscriptionWithScheduledDowngradeInTransaction(..., true)`, which locks the merchant subscription row with FOR UPDATE. It requires active entitlement, checks an existing active/release_scheduled assignment for the station, counts current assignments, rejects when count >= licensed seats, inserts the seat assignment, and writes an audit event. `createCashierStationAuthoritative` calls this helper within the same merchant transaction after station insertion, so a failed seat assignment rolls back station creation.

The subscription-row lock serializes concurrent allocations that follow this code path for the same subscription. This is source evidence, not a demonstrated concurrency PASS. Other writers and DB constraints must still be checked.

Acceptance: two parallel station creates with one remaining seat; parallel retry for same station; creation failure rollback; scheduled downgrade with seat allocation; tenant isolation; stable 409 mapping. Verify assigned count never exceeds licensed seats and audit event counts match committed allocations.

P0 NO-GO. Runtime NOT TESTED. No code, DB, or deployment change.
