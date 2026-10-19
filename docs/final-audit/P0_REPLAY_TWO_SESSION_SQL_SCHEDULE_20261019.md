# P0 replay cross-authority concurrency: deterministic execution schedule

Status: **PARTIALLY EXECUTED / NO-GO**. The baseline two-session READ COMMITTED phantom is verified in disposable PostgreSQL; the function-internal schedules A and B below remain unexecuted.

## Boundary
Use an owned disposable PostgreSQL instance with all migrations through 0033 applied, valid signed receipt and operator fixtures. Do not run against hosted Neon or Railway. Record migration hashes, server version, connection backend PIDs, SQLSTATEs and transaction outcomes. Fail closed on a missing fixture or unexpected lock timeout.

## Schedule A: 0031 review candidate count versus candidate detail
1. Seed a receipt and exactly one matching bot order. Establish a valid admin actor with audit permission.
2. Session A begins a transaction and invokes the review capability while instrumented to stop immediately after its first cross-authority count query (barrier, not sleep).
3. Session B begins and inserts a matching cashier order with the same provider payment or request reference; commit B, recording backend PID.
4. Release A. Record whether the second candidate query sees two orders, whether the capability returns a row, and whether an audit row survives commit/rollback. Repeat with authorities swapped.
5. Expected safe outcome: reject ambiguity and do not authorize a payment application. A result selecting a single order while two matching orders are committed is a P0 failure.

## Schedule B: 0033 resolver scan versus selected-row lock
1. Seed one matching cashier order and an immutable verified receipt.
2. Session A invokes the resolver and pauses after the cross-authority candidate scan but before its selected-row FOR UPDATE.
3. Session B inserts a matching bot order and commits without acquiring the resolver advisory lock (models a writer that does not share the convention).
4. Resume A; capture returned authority/order, SQLSTATE and whether both orders are visible afterward. Repeat with authorities swapped.
5. Expected safe outcome: the resolver must not return an unambiguous mapping when two committed candidates exist at the authorization boundary. If it does, fail P0.

## Additional schedules
- Concurrent changes to selected order provider, checkout ref, request ref, amount: deny stale identity or demonstrate valid serial ordering.
- Session or trusted-device revocation while replay executes: no unauthorized replay or entitlement.
- Force an exception and rollback after review audit insertion: no committed audit, payment application or entitlement from denied transaction.
- Repeat each controlled schedule at least three times with stable barrier placement and record actual database observations.

## Evidence and release rule
Store test source, CI run URL, SQLSTATEs, backend PIDs, commit/rollback and row-count evidence under docs/final-audit/. Source-only checks, mock tests and existing green CI do not close this gate. Hosted migrations and Railway least-privilege runtime verification remain separate approvals. **P0 NO-GO until all gates pass.**

## Verified baseline evidence (2026-10-19)
- Source: `artifacts/api-server/tests/receipt-cross-authority-phantom-postgres.integration.test.mjs`, wired into the isolated `billing` suite by commit `94ce8695e4ec79e9c481a4c8c16b7a7f988a0c5e`.
- GitHub Actions: https://github.com/nora953/fawri-production-source/actions/runs/39185730169 ; disposable job `117847657002` succeeded, and all 41 workflow runs for that commit succeeded.
- Disposable log: `DISPOSABLE_MIGRATIONS_PASS count=34`; `P0_CROSS_AUTHORITY_PHANTOM_OBSERVED {"first":1,"second":2,"readerIsolation":"read committed","writerCommitted":true,"kind":"database schedule only; no replay function was invoked"}`.
- Meaning: a matching cashier order committed by session B becomes visible to session A on its next statement, even though session A had observed exactly one SaaS order earlier in the same READ COMMITTED transaction.
- Limitation: the baseline deliberately invokes **neither** `fawri_review_verified_payment_receipt` nor `fawri_resolve_confirmed_payment_order`. It does not prove an exploitable function-level race or incorrect entitlement. Do not mark schedules A/B complete.
- Next: controlled, non-sleep barriers inside the disposable test-only function copies or instrumentation; verify fail-closed behavior and zero entitlement applications, then retain the run's SQLSTATEs and PID evidence.

## Verified resolver collision rejection (2026-10-19)
- Source commit: `753bb5f920cdb855f78662b1f3d76cd4b05bc316` adds an invocation of the actual `fawri_resolve_confirmed_payment_order` after session B has committed a conflicting cashier order.
- Isolated run: https://github.com/nora953/fawri-production-source/actions/runs/39188374899 ; job `117855741802` SUCCESS; all 41 workflows on that commit SUCCESS.
- Job log: `DISPOSABLE_MIGRATIONS_PASS count=34` and `P0_RESOLVER_COMMITTED_COLLISION_REJECTED {"sqlstate":"23514","entitlementGrants":0,"scope":"post-commit; not an in-function interleaving"}`.
- This closes the **pre-existing committed cross-authority collision** subcase only. It does **not** close schedule B (phantom committed while the resolver is already running) or schedule A (two scans inside review). Continue P0 NO-GO.
