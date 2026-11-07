# P0 operator login concurrent uniqueness — 2026-10-18

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Static review, no runtime execution.

## Evidence
- `loginCashierOperatorAuthoritative` reads active sessions and open shifts with `FOR UPDATE`, then inserts an open shift (when absent) and an active session inside `withMerchantOperationalTransaction`.
- Migration `0013_cashier_staff_station_authority.sql` defines partial unique indexes `cashier_shifts_open_station_unique`, `cashier_shifts_open_staff_unique`, and `cashier_operator_sessions_live_station_unique`.
- PostgreSQL row locks on existing rows do not alone serialize two concurrent inserts when no matching row exists; the unique indexes should arbitrate the race.
- `translateDatabaseError` maps SQLSTATE 23505 to HTTP 409 with `CASHIER_STAFF_CONFLICT` unless it is an offline-primary index. The login function shown does not invoke `translateDatabaseError` on its transaction outcome, so the exact HTTP mapping for a concurrent login conflict requires route/error-boundary inspection and a test.

## Acceptance
Run two simultaneous login requests for same station with no prior active session/open shift, then with a pre-existing same-operator session. Verify one valid active session and one open shift, no orphaned data, and stable HTTP error classification. Repeat with different staff competing for same station and same staff competing for two stations. Record runner and logs.

Status: P0 verification gap, NOT RUN. No DB writes, code changes, migration or deployment.
