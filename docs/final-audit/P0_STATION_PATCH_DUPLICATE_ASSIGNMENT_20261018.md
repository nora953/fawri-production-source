# P0 station patch duplicate SQL assignment — 2026-10-18

Branch: `fix/p0-provider-receipt-order-discovery-20261015`; file `artifacts/api-server/src/services/postgresCashierStaffAuthority.ts`, function `updateCashierStationAuthoritative`.

## Source evidence

The SQL SET list is dynamically assembled. If `offlineInventoryAuthority !== undefined`, the function adds `offline_inventory_authority = $N`. If `status !== undefined` and `status !== "active"`, it also appends `offline_inventory_authority = FALSE`. Thus a PATCH supplying both `offlineInventoryAuthority` (either true or false) and a non-active status builds two assignments to the same column in one UPDATE statement.

PostgreSQL ordinarily rejects a single UPDATE that assigns the same target column more than once. This is a concrete query-construction defect hypothesis, not a runtime reproduction. The transaction would roll back if the query fails.

## Verification and remediation proposal

1. Test active -> disabled and active -> revoked with offlineInventoryAuthority both true and false; also test status-only and offline-only updates.
2. Verify SQLSTATE and HTTP error mapping, station state and credential version after rejected transaction.
3. Ensure a single effective assignment: when non-active status is requested, force offline_inventory_authority FALSE; otherwise use supplied offline value if present. Preserve station runtime revocation semantics.
4. Run tests and CI before merging. Do not conflate cashier authority with separate AI/Meta replies.

Status: P0 issue candidate, source-reviewed, runtime NOT TESTED. No application, database or deployment changes.
