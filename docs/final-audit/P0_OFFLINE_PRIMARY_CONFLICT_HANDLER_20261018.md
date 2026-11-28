# P0 offline primary conflict handling — 2026-10-18

Reviewed artifacts/api-server/src/services/postgresCashierStaffAuthority.ts on fix/p0-provider-receipt-order-discovery-20261015.

Confirmed: translateDatabaseError (around lines 620-641) handles PostgreSQL unique violation SQLSTATE 23505. When the constraint name contains merchant_cashier_stations_offline_branch_unique or merchant_cashier_stations_offline_location_unique, it raises CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS with HTTP 409. Both createCashierStationAuthoritative and updateCashierStationAuthoritative pass database errors through this translator.

This narrows the previous concern: the application already anticipates a uniqueness constraint for one offline inventory authority per branch/location. It does not independently prove the constraint exists in the applied migration set or hosted database, or that concurrent writes are protected. Do not claim an absence of duplicate-primary prevention based only on create/update handlers lacking an explicit pre-query.

Next evidence: locate the actual CREATE UNIQUE INDEX or constraint in committed migrations, check predicate on active stations and location_id, and test two concurrent transactions on disposable PostgreSQL. Check updates moving station between locations and status transitions. Do not change hosted database. P0 remains NO-GO.
