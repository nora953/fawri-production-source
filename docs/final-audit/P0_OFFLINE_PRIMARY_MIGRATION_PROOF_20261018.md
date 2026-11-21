# P0 offline primary migration proof — 2026-10-18

Source review on fix/p0-provider-receipt-order-discovery-20261015.

Confirmed SQL migration `lib/db/drizzle/0013_cashier_staff_station_authority.sql` line 76 creates partial unique index `merchant_cashier_stations_offline_branch_unique` on `(merchant_id, branch_key)` where offline_inventory_authority is true and status is active.

Confirmed SQL migration `lib/db/drizzle/0017_multi_location_inventory_foundation.sql` line 97 creates partial unique index `merchant_cashier_stations_offline_location_unique` on `(merchant_id, location_id)` where location_id is not null, offline_inventory_authority is true, and status is active.

Migration 0017 also creates location inventory uniqueness indexes on `(merchant_id, location_id, product_id)` when variant_id is null, and `(merchant_id, location_id, product_id, variant_id)` when variant_id is not null (lines 67 and 69). These are cloud database constraints and do not by themselves prove offline browser storage isolation.

The API service translates SQLSTATE 23505 for both offline-primary indexes to CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS, HTTP 409.

Outstanding verification: actual applied index definitions in staging via read-only pg_indexes queries, migration tracking, concurrent station creation/update, location mapping consistency, offline IndexedDB isolation and sync reconciliation. No live DB queries or runtime tests were performed. P0 remains NO-GO.
