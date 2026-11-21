# P0 offline primary index — snapshot evidence

Date: 2026-10-18. Source: lib/db/drizzle/meta/0022_snapshot.json on fix/p0-provider-receipt-order-discovery-20261015.

The snapshot defines a unique index named merchant_cashier_stations_offline_branch_unique on merchant_cashier_stations with columns merchant_id and branch_key. Its predicate is offline_inventory_authority = TRUE AND status = 'active'. This is aligned with one active offline-inventory authority per merchant branch key.

The server service postgresCashierStaffAuthority.ts already translates PostgreSQL unique violations for this index into CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS (HTTP 409).

Limits: the snapshot does not establish that a migration applied the index to staging or production. It also keys on branch_key rather than location_id; branch-key-to-location identity and migration history need verification. Existing active duplicate rows, concurrency behavior, station move and status changes remain untested here.

Next: inspect applied migration SQL and verify pg_indexes / pg_constraint on isolated staging with read-only queries; then exercise concurrent create/update against disposable test database. No code or DB changes performed. P0 NO-GO.
