# P0 pairing/auth snapshot review — 2026-10-18

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Static source inspection only.

## Confirmed source behavior

In `artifacts/api-server/src/services/postgresCashierStaffAuthority.ts`, `authenticateCashierStationAuthoritative` first selects a matching active credential and station by token hash, device ID, expiry, and credential version. It then checks merchant access and performs two separate heartbeat UPDATE statements before returning the previously selected context. The heartbeat UPDATEs do not check affected row counts. A concurrent revoke between SELECT and return could therefore make the returned context stale; this is a race hypothesis, not demonstrated authorization bypass.

`verifyOperatorPinInTransaction` subsequently revalidates active credentials and station state using a transactional `SELECT ... FOR UPDATE`, providing an additional control on PIN authorization. `redeemCashierStationPairingAuthoritative` locks the pairing challenge `FOR UPDATE`, marks it used, revokes earlier runtime state, increments the credential version and creates a replacement credential in one transaction.

## Open acceptance tests

1. Concurrent redemption of one pairing challenge by devices A/B: exactly one winner.
2. Authentication interleaved with revocation: characterize stale-context window; verify no privileged action succeeds after revocation.
3. Concurrent PIN validation and revoke: verify transaction locking and rollback behavior.
4. Cross-merchant challenge/credential negative tests on disposable synthetic fixtures.
5. Capture precise assertions and runner evidence before marking PASS.

No tests were executed, no schema/data/code modified, no deployment performed. P0 NO-GO.
