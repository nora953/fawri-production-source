# P0 PIN failure persistence — source review (2026-10-18)

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Source-only review; no runtime test.

`verifyOperatorPinInTransaction` locks the staff record and, on invalid PIN, increments `failed_pin_attempts`. At five failures it sets `pin_locked_until` to approximately 15 minutes later and resets the counter to zero. It returns `{ok:false,error}` instead of throwing.

`loginCashierOperatorAuthoritative` returns that failed decision from the callback to `withMerchantOperationalTransaction`, which commits on successful callback return. The caller throws `decision.error` only **after** transaction completion. Thus source control flow preserves the failed-attempt update even when login is rejected. This resolves the source-level rollback concern; runtime behavior is not yet tested.

Acceptance: five sequential invalid PINs, lock response and retry duration, valid PIN during lock, unlock after expiry, concurrent invalid PIN requests, and transaction failures. Capture actual PostgreSQL counter/lock states on disposable fixtures.

Status: source behavior REVIEWED; runtime NOT TESTED; P0 NO-GO. No data or code changes.
