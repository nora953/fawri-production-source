# CASHIER-SYNC-SEQUENCE-001 — recovery contract candidate

Status: CANDIDATE_NOT_ADOPTED_NOT_ENFORCED. Gate OPEN; release NO-GO. This document authorizes no financial/timeline repair, tombstone, device reset, production write or hosted rollout. A diagnostic PASS is not recovery acceptance.

## Current source path

`cashierIndexedDbAuthority.ts` consumes a shared device sequence for sales and manual inventory adjustment; adjustment writes its own inventory movement/outbox envelope. Pending envelopes are sorted by device sequence. Both `cashierOperatorCloudSync.ts` and `cashierCloudOutboxSync.ts` stop on unsupported operations instead of silently skipping them; operation ACK follows accepted/idempotently replayed response. This is a source trace, not new native-browser fault execution.

The canonical sale and compensation services serialize each merchant/device with an advisory transaction lock, then call `recordCashierOperationTimelineInTransaction`. Exact matching sequence identity is replayable. A new sequence greater than the existing maximum can be accepted with a gap; a later missing sequence at or below that maximum is rejected. The old SQL helper diagnostic observes accept1/accept3/reject2. The new canonical sale-service diagnostic separately measures financial/stock effects and peer/replay preservation; its execution result must be read from the evidence checkpoint, not inferred from this source description. No HTTP or client outbox proof is claimed by that service test.

## Decisions to adopt before changing admission

| Option | Required semantics | Main unresolved requirement |
|---|---|---|
| Contiguous admission across every sequence-producing operation | Hold a future sequence until missing real operations or explicitly authorized non-commerce records have been validated | A supported, authenticated contract for manual adjustment and every other sequence producer; starting/checkpoint semantics for existing devices |
| Controlled historical backfill | Validate late operation identity, historical authority, time, dependent sale/return/void and stock/accounting effects before committing once | A reviewed financial ordering/recovery model; accepting a number into a gap alone is unsafe |
| Explicit reconciliation hold | Preserve unresolved operation and later local queue, expose a durable reason and require reviewed reconciliation | Complete operator workflow and recovery authority; current permanent rejection alone does not close this gate |

These are design choices, not an approved recommendation or implementation. Simply replacing the server check with `max+1` can strand legitimate non-commerce gaps; simply deleting the backwards check can change financial ordering. Neither patch is authorized by this candidate.

## Required invariants for any adopted option

- Never acknowledge, delete or silently drop a locally committed sale, return, void or inventory adjustment merely to close a numeric gap.
- Exact authenticated merchant/device/station/operation identity and immutable payload match are required for replay. A changed payload or reused sequence cannot receive an ACK for a different operation.
- Ambiguous transport after server commit retains the local operation until exact replay ACK; repeated retries create no duplicate order, stock mutation, payment or compensation.
- A recovery/tombstone record cannot be supplied as an untrusted permission to bypass a missing financial operation. Any non-commerce record needs its own authorized schema, immutable identity, allowed purpose and audit.
- No synthetic sale, stock delta, sequence reset or peer timeline rewrite. Preserve tenant, station, historical entitlement and current negative-stock/clock checks.
- Define first-device sequence, restart/restore checkpoint, missing envelope/window boundary, concurrent same-device submission and different-device stock behavior explicitly.

## Required executable acceptance matrix

| Case | Required observation |
|---|---|
| Ordered1,2,3 and exact retries | Correct durable state, complete ACK identity and zero duplicate effect |
| Arrival1,3 then2 | Chosen contract is explicit; no permanently lost real operation, no partial financial writes |
| Real non-commerce2 between sales1 and3 | Correct authenticated handling or durable reconciliation hold; never silent skip |
| Server commit with lost ACK, restart then retry | Exact replay ACK, one durable effect, local envelope cleared only after that ACK |
| First request fails before commit | Full selected SQL rollback; queue and later operations preserved in native IndexedDB |
| Altered identity/payload, foreign tenant/device/station | Denial without own/peer mutations or leaked ACK |
| Same-device overlap and different-device final-stock race | Observed SQL overlap, exact winner/loser semantics and no double stock consumption |
| Historical backfill involving return/void or revoked entitlement | Adopted dependency/time/authority rules and accounting reconciliation enforced |
| Backup restore/missing envelope/expired local authority | Defined recovery behavior without sequence reuse, forged proof or blanket ACK |

Acceptance requires native IndexedDB/browser fault tests, canonical HTTP with real session/device binding, restricted-role SQL, exact-source broader CI, and separately authorized hosted rollout evidence. Existing service diagnostics are reused only at their own proof layer.

Accepted diagnostic execution: [exact-source service/SQL evidence](evidence/P0-CASHIER-SEQUENCE-SALE-DIAGNOSTIC-20261026.json), source `e14ca5301d6b4da8a93c93b19cf9c58302d51a41`,56/56CI and722TAP. Canonical service observation confirms accept1/accept3/reject2; recovery remains OPEN. No new browser/HTTP/hosted proof is supplied by this document.
