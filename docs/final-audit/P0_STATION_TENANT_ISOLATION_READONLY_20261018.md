# P0 station tenant isolation — read-only evidence (2026-10-18)

Repository branch: `fix/p0-provider-receipt-order-discovery-20261015`. This report is limited to source inspection and read-only SQL on the previously created isolated Neon branch `br-snowy-voice-b1bovtwi`, database `neondb`. It is not production/staging runtime acceptance.

## Observed

- `SELECT COUNT(*) FROM public.merchants`: 1 merchant.
- `SELECT COUNT(*), COUNT(DISTINCT merchant_id) FROM public.merchant_cashier_stations`: 0 stations, 0 represented merchants.
- `SELECT COUNT(*) FROM public.merchant_cashier_staff`: 0 staff.
- `pg_class` showed `merchant_cashier_stations.relrowsecurity=false`; owner `neondb_owner`.
- `information_schema.role_table_grants` showed SELECT/INSERT/UPDATE/DELETE for both `fawri_staging_runtime` and `fawri_staging_rls_runtime` on this table; PUBLIC was not returned in the filtered result.
- The station service `artifacts/api-server/src/services/postgresCashierStaffAuthority.ts` uses `withMerchantOperationalTransaction(merchantId)`, operational merchant checks, and `WHERE merchant_id=$1 AND id=$2` for station lookup/update. Station location changes unpair devices and revoke station runtime; disabling/revoking also revokes sessions and credentials.
- The branch has both offline-primary unique indexes by merchant+branch and merchant+location, as confirmed by read-only `pg_indexes`.

## Classification

**P0/HIGH verification gap; NOT TESTED** for actual cross-tenant HTTP/SQL isolation. Lack of table RLS alone is not proof of an exploitable bypass; service filtering is a defense but must be tested through all relevant entrypoints. The isolated branch lacks the two-merchant fixtures required for positive/negative isolation tests. No inserts, updates, deletes, schema changes, migration, or deployment were performed.

## Next safe acceptance

1. On an expressly disposable local PostgreSQL test database, create synthetic merchants A/B and stations under an owned test transaction, not on live staging or this preserved isolated branch.
2. Exercise station list/get/create/update/revoke/pairing and offline primary claims as merchant A against B station IDs; require no B disclosure/mutation. Verify B data and sessions unchanged before rollback.
3. Independently inspect the authenticated HTTP route's merchant identity source and the transaction role's direct SQL access; reject spoofed merchant IDs.
4. Test concurrent primary claims on same location, different locations, and branch_key/location_id aliasing, including duplicate error mapping to HTTP 409.
5. Save exact runner, SHA, assertions, logs and results; keep NO-GO until hosted runtime identity and outstanding P0 gates are closed.
