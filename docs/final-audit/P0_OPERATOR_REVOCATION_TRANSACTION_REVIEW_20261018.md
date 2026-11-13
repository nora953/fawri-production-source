# P0 operator revocation and transaction boundary review — 2026-10-18

Branch `fix/p0-provider-receipt-order-discovery-20261015`. Source inspection only; no execution or data changes.

## Verified source behavior

- `artifacts/api-server/src/services/operationalPostgresAuthority.ts`: `withMerchantOperationalTransaction` starts a PostgreSQL transaction, sets `fawri.tenant_id` locally, and commits or rolls back.
- `artifacts/api-server/src/services/postgresCashierStaffAuthority.ts`: `updateCashierStaffAuthoritative` locks the staff record, checks `expectedVersion`, and updates with `WHERE merchant_id=$1 AND id=$2 AND version=$3`. It replaces permissions when requested, revokes active operator sessions, and closes open shifts when disabled/revoked, all in the same transaction.
- `authenticateCashierOperatorAuthoritative` reads the active session and permission snapshot, then updates last-seen fields in separate pool queries before returning an operator context. The source alone does not prove that every downstream sales/inventory write revalidates session state at commit time.

## Verification gap

Test an in-flight sale/inventory mutation interleaved with staff permission removal, PIN change, disable and revoke. Verify post-revocation privileged writes cannot commit, and that permissions are not inferred solely from an earlier authenticated context. Confirm transaction lock ordering and HTTP error classification.

Status: P0 NOT TESTED, NO-GO. No code, migration, database or deployment change.
