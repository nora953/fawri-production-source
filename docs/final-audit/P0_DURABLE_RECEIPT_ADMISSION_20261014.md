# P0 durable receipt admission — prepared 2026-10-14

Parent PR537 / bc3b670e documentation checkpoint; last tested parent a696046b had174PASS/0FAIL isolated and27/27 workflows SUCCESS. Issue523, new branch fix/p0-durable-payment-receipt-admission-20261014. No merge/deployment/hosted mutation.

## Implementation
Both verified billing authorities now run receipt admission and entitlement application in separate committed transactions. Admission retains the existing signature/provider/event/order/payment/amount/expiry/terminal checks; a payable verified receipt records one received event and payment identity/first time/reconciliation marker, then COMMITs before entitlement starts. Application re-acquires event/order/payment locks, revalidates the receipt and uses persisted first time. Exact concurrent requests may race between transactions, but only one applies; later callers observe applied/duplicate. Domain rejection and late/mismatch outcomes remain operator reconciliation, not automatic grants.

Cashier keeps merchant-scoped transaction context in both phases. SaaS payment ownership read uses its advisory lock plus DB uniqueness rather than additionally locking a competing order row: the extra row lock can deadlock with that order's application waiting for the same payment lock. Received replay additionally requires amount equal to the immutable order amount. Existing SAVEPOINT rollback remains inside the second transaction; it no longer determines whether the first receipt survives a process/connection interruption.

## New actual PostgreSQL proof (NOT RUN yet)
Registered billing-receipt-process-recovery-postgres.integration.test.mjs in existing owned offline billing batch. Before any DB import, parent and child attest disposable PostgreSQL. Per SaaS/cashier: pause only the synthetic order's entitlement INSERT with an owned trigger; parent independently observes committed reconciliation+1received event,0partial applications/subscriptions; kill the owned process or terminate only its unique application_name/backend PID; restart two fresh application processes with next-day redelivery; require one applied/one duplicate,1event/1subscription/1application, original paid_at. Four interruption cases.

Two additional cases inject a DEFERRABLE constraint trigger failing the admission COMMIT withP0001. Function must reject before entitlement; pending/0receipt/0application/0subscription means no false durable-success acknowledgment. Remove fault and exact retry applies once. This models a known rollback at COMMIT, not loss of a successful COMMIT acknowledgment on the wire.

All child processes, backends (exact synthetic marker/PID/current database), triggers/functions/accounts/pools are owned and cleaned. No hosted data, real credential/provider/payment or network transport. Raw child/driver output is not emitted. Original SQL-fault/concurrent/next-day/terminal suites remain mandatory regression.

## Local validation
API typecheck/build PASS; new parent/child/runner MJS syntax PASS; disposable guard15PASS/0FAIL; diff whitespace PASS. New real SQL/process tests NOT_RUN pending CI; local environment has no Docker/PostgreSQL. Do not turn source/typecheck success into runtime proof.

## Remaining limitations
True unmatched orphan inbox/operator workflow and ambiguous receipt COMMIT response loss still require acceptance work under523. A server dying before any successful receipt COMMIT cannot claim a receipt is durable; provider/operator retry remains required. New application phase may fail after receipt commits and must leave pending/reconciliation work, not granted access. Review merchant checkout behavior while receipt application remains pending; do not infer complete P0 or release readiness from selected tests. Meta downstream full restricted-role/hosted grant acceptance535 remains separate.
