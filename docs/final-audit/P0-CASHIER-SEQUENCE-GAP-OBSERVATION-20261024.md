# P0 cashier sequence gap observation — 2026-10-24

Status: OPEN; release NO-GO. This is a bounded source observation, not a new CI run or acceptance.

The existing test in `artifacts/api-server/tests/cashier-sync-multidevice-postgres.integration.test.mjs` records device sequence 1, then 3, then verifies that 2 is rejected with `CASHIER_OPERATION_SEQUENCE_CONFLICT`; persisted sequences are [1,3]. The test explicitly states that passing this observation does not approve missing-operation rejection.

`cashierHistoricalOperationAuthority.ts` allows exact same-operation replay but rejects a previously unseen sequence less than or equal to the latest accepted sequence. `cashierIndexedDbAuthority.ts` uses one counter for sale and standalone inventory adjustments. The sale sync bundle parser requires one sale and does not accept standalone adjustment bundles.

Do not weaken replay protection without an agreed gap-recovery contract. Remaining acceptance: trace all uploader and adjustment routes; specify treatment of sequence gaps and authorized tombstones; run exact-source mixed-operation and transient-failure tests. No hosted change, code fix, or tests executed by this documentation checkpoint.
