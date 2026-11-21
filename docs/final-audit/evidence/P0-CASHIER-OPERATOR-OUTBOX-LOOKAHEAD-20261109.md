# P0 — operator cashier outbox exact-boundary source fix

**Date:** 2026-11-09. **Gate:** `CASHIER-SYNC-SEQUENCE-001` / offline history continuity (still OPEN). **Scope:** logic-only, existing v1 operator outbox; **no protocol v2 activation, sequence reset, financial movement or held migration change**.

## Defect and source change

- Before fix, `completeOperationWindow(pending)` saw only `MAX_PENDING_ENVELOPES=1000`. A genuinely complete batch of exactly 1000 envelopes (including a single completed operation exactly 1000 envelopes long) was treated as a possibly incomplete boundary: the last operation was unnecessarily deferred, and an exactly-1000-envelope single operation was falsely classified `CASHIER_OPERATOR_OPERATION_TOO_LARGE`. An unsupported/unsettled operation still has to block subsequent sequence movement.
- Fixed in `artifacts/fawri/src/lib/cashierOperatorCloudSync.ts` at [source commit `db2fb3cf`](https://github.com/nora953/fawri-production-source/commit/db2fb3cf3b61aa089475392fd35aa9bbb0481031). The active operator drainer now calls `authority.listPendingSync(MAX_PENDING_ENVELOPES + 1)`, never uploads that lookahead envelope, and verifies whether the last operation is truly finished.
- If the 1001st belongs to a different operation with greater device sequence, all first 1000 may proceed. If the 1001st continues an operation crossing the boundary, that entire last operation stays intact and pending. An oversized 1001-envelope single operation fails closed, never partially uploads.
- If the lookahead has a duplicate/reversed sequence across operation IDs, or a sequence mismatch within the same operation, the preflight rejects it. `groupByOperation` also rejects a noncontiguous reuse of an earlier operation ID rather than grouping interleaved envelopes and potentially overtaking their durable sequence.
- Does not modify IndexedDB schema, receipts, checkout or protocol v2. All existing operator permission, merchant/station/staff/device binding, and complete-server-ACK-before-local-delete conditions remain in place.

## Exact tests

- [Targeted real-function contract + behavior #42692056947](https://github.com/nora953/fawri-production-source/actions/runs/42692056947), job **129414040803**: **COMPLETED SUCCESS**, **30/30 tests** with zero failures. Tests include executing transpiled production `completeOperationWindow` and `groupByOperation` functions, 999/1000/1001 envelopes, exactly-1000 single completed operation, complete 1000th boundary, split operation, 1001-envelope oversized reject, duplicate/reversed sequence, interleaved ID corruption, plus original static operator authorization and ACK contracts.
- [Isolated IndexedDB Chromium browser regression #42692060418](https://github.com/nora953/fawri-production-source/actions/runs/42692060418): **COMPLETED SUCCESS**, including original native browser smoke and pairing/restore regressions. No physical tablet/device test or hosted cashier endpoint result is implied.
- The first exact workflow run [#42691882672](https://github.com/nora953/fawri-production-source/actions/runs/42691882672) failed a *test assertion literal escaping error* despite new runtime behavior tests passing; [test-only `cc3ac281`](https://github.com/nora953/fawri-production-source/commit/cc3ac281e2c103aaf8440bfbcfdeaf94a741fcf8) corrected the literal regex, then exact targeted 30/30 turned green. Do not misstate the failed first run as accepted.
- [Final quality gates #42692057200](https://github.com/nora953/fawri-production-source/actions/runs/42692057200) status must be checked separately; no implied success from targeted tests.

## Decision and remaining gates

The owner requested **launch-blockers only**: when an external integration (provider payment, hosted identity, Meta, KMS, device physical evidence) cannot be fully verified from source, record it as **EXTERNAL BLOCKED** and **tell the owner before bypassing it**, then continue with independently testable functionality. Skipping means **sequencing work**, not release waiver, protocol activation, product policy approval or changing original P0 register status.

`CASHIER-SYNC-SEQUENCE-001` remains OPEN until approved compatibility (movement-only/v2 remains unsupported), independently supported device-stream provenance and positive/negative sequence restore/reconciliation and physical acceptance. `R-OWN-5` provider-side settlement still OPEN/EXTERNAL. No approvals for automatic refund/attachment or unverified stage source.

**Register unchanged:** 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED of 45 known bounded source rows (64.4% known-row count; overall P0% uncertified), PR #550 DRAFT, release NO-GO. No hosted Neon/Railway SQL, GitHub merge or production deployment.
