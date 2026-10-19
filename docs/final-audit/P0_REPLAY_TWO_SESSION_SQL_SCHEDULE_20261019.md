# P0 replay cross-authority concurrency: deterministic execution schedule

Status: **UNEXECUTED / NO-GO**. This document is a test specification, not evidence of a successful two-session run.

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
