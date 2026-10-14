## Verified durable payment receipt checkpoint — 2026-10-14

Draft PR538, tested source **7302359705a509cc25cefbc3f6e14849b0f68508**: isolated run38524397545/job115721219577 **181PASS/0FAIL/0SKIP**,42unique files/44invocations; **12/12 observed workflows SUCCESS**. New receipt recovery suite7PASS covers four process/backend interruptions, two known admission-COMMIT failures, fresh concurrent next-day retries, original payment time, unresolved-receipt checkout barriers and one entitlement. Admission commits before application; merchant-first locks align checkout. Prior8ad83ea typecheck/barrier failures remain recorded, corrected without weakening lifecycle assertions.

Evidence: [receipt report](P0_DURABLE_RECEIPT_ADMISSION_20261014.md), [machine results](evidence/P0_DURABLE_RECEIPT_RESULTS_20261014.json). Owned offline PostgreSQL/fake providers only; this does not change the UI audit baseline or imply release readiness. No merge/deploy/hosted database/grants/real payment actions. Issues523/535 stay OPEN for unmatched orphan inbox, ambiguous successful COMMIT acknowledgment loss and full downstream restricted-role Meta/grant acceptance.

---

# P0 durable receipt admission — verified first revision 2026-10-14

Parent PR537 / bc3b670e documentation checkpoint; last tested parent a696046b had174PASS/0FAIL isolated and27/27 workflows SUCCESS. Issue523, new branch fix/p0-durable-payment-receipt-admission-20261014. No merge/deployment/hosted mutation.

## Implementation
Both verified billing authorities now run receipt admission and entitlement application in separate committed transactions. Admission retains the existing signature/provider/event/order/payment/amount/expiry/terminal checks; a payable verified receipt records one received event and payment identity/first time/reconciliation marker, then COMMITs before entitlement starts. Application re-acquires event/order/payment locks, revalidates the receipt and uses persisted first time. Exact concurrent requests may race between transactions, but only one applies; later callers observe applied/duplicate. Domain rejection and late/mismatch outcomes remain operator reconciliation, not automatic grants.

Cashier keeps merchant-scoped transaction context in both phases. SaaS payment ownership read uses its advisory lock plus DB uniqueness rather than additionally locking a competing order row: the extra row lock can deadlock with that order's application waiting for the same payment lock. Received replay additionally requires amount equal to the immutable order amount. Existing SAVEPOINT rollback remains inside the second transaction; it no longer determines whether the first receipt survives a process/connection interruption.

## New actual PostgreSQL proof (PASS at a42a1ef)
Registered billing-receipt-process-recovery-postgres.integration.test.mjs in existing owned offline billing batch. Before any DB import, parent and child attest disposable PostgreSQL. Per SaaS/cashier: pause only the synthetic order's entitlement INSERT with an owned trigger; parent independently observes committed reconciliation+1received event,0partial applications/subscriptions; kill the owned process or terminate only its unique application_name/backend PID; restart two fresh application processes with next-day redelivery; require one applied/one duplicate,1event/1subscription/1application, original paid_at. Four interruption cases.

Two additional cases inject a DEFERRABLE constraint trigger failing the admission COMMIT withP0001. Function must reject before entitlement; pending/0receipt/0application/0subscription means no false durable-success acknowledgment. Remove fault and exact retry applies once. This models a known rollback at COMMIT, not loss of a successful COMMIT acknowledgment on the wire.

All child processes, backends (exact synthetic marker/PID/current database), triggers/functions/accounts/pools are owned and cleaned. No hosted data, real credential/provider/payment or network transport. Raw child/driver output is not emitted. Original SQL-fault/concurrent/next-day/terminal suites remain mandatory regression.

## Local validation
API typecheck/build PASS; new parent/child/runner MJS syntax PASS; disposable guard15PASS/0FAIL; diff whitespace PASS. Actual owned offline CI at a42a1ef7346b36bf1ea7fbe63e03c50fec1dff94: run38523168059/job115717325651 SUCCESS, new suite7PASS/0FAIL, aggregate181PASS/0FAIL/0SKIP across42unique files/44invocations. All12 observed PR workflows SUCCESS. Four interruption and two deferred-COMMIT proof markers confirmed. Local environment has no Docker/PostgreSQL.

## Remaining limitations
True unmatched orphan inbox/operator workflow and ambiguous receipt COMMIT response loss still require acceptance work under523. A server dying before any successful receipt COMMIT cannot claim a receipt is durable; provider/operator retry remains required. New application phase may fail after receipt commits and must leave pending/reconciliation work, not granted access. Follow-up merchant checkout barriers passed; do not infer complete P0 or release readiness from selected tests. Meta downstream full restricted-role/hosted grant acceptance535 remains separate.

## Checkout and lock-order follow-up
New-key checkout is rejected while paid_reconciliation_required exists; the original idempotency key returns the original order. Both receipt phases and SaaS checkout acquire the merchant row before billing orders to match cashier checkout and avoid lock inversion. The process recovery suite checks the unresolved-receipt barrier and one-order count before recovery. This follow-up passed local typecheck/build/syntax; its changed runtime assertions passed at7302359705a509cc25cefbc3f6e14849b0f68508.

## Follow-up failure and correction
Source8ad83ea CI detected TS2558 on the database wrapper generic and an overbroad cashier checkout barrier. Local chained commands had masked the failed typecheck exit; that validation claim is withdrawn for8ad83ea. Corrected wrapper query uses the supported unparameterized API; barrier requires an actual received event on a reconciliation order, preserving existing late/mismatch checkout behavior while blocking durable work (including SQL application failures). Re-run typecheck as a standalone command and preserve all original lifecycle assertions.
