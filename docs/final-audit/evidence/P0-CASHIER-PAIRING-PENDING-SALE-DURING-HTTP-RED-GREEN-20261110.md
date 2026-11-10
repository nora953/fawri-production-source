# P0 CASHIER-SYNC-SEQUENCE-001 — newly queued offline sale during station pairing HTTP (RED → GREEN)

**Checkpoint:** 2026-11-10. **Scope:** one verified source defect and bounded source correction, exercised in **real Chromium IndexedDB** with **synthetic pairing HTTP**. No physical-device, live server-provider, hosted SQL, financial recovery, or commercial release acceptance.

## Real reproducible source bug

`pairCashierStation` checked the local outbox *before* starting a potentially slow network `/api/cashier/station/pair` request. It did not check again after the HTTP response. If another cashier tab committed a **real local sale and inventory movement while the HTTP request was waiting**, the pending-outbox preflight had become stale, yet the old code committed a new station ID/token and scrubbed old local raw cost data. This could leave unsynced financial operations associated with a previous station binding while the device was newly paired.

[New regression test-only SHA `ce3d4433`](https://github.com/nora953/fawri-production-source/commit/ce3d4433243ee9ebf1c551eb456d74b52a520cdf) exercises *actual* `IndexedDbCashierAuthority.upsertCatalogSnapshot` and `commitSale` and the real client `pairCashierStation` on Chromium. It starts with no pending outbox, captures a blocked synthetic network pairing response, commits a **cash-paid sale plus stock movement** into native IndexedDB while the request waits, verifies both pending envelopes, releases a valid response for a new station, then requires refusal with preserved original bootstrap station/token, exact original outbox, retained sale, and stock decremented exactly once.

**RED:** [P0 cashier browser regression #42897891424](https://github.com/nora953/fawri-production-source/actions/runs/42897891424) **COMPLETED FAILURE at the new assertion**, `P0_PAIRING_LATE_OUTBOX new unsynced financial operation must block delayed station re-pair`. Older unrelated cashier sale/ACK/station Chromium tests passed before the new regression. Reproduced with test-only merchant, device, sale, and controlled HTTP; this is **not** evidence of actual financial loss.

## Bounded source fix and GREEN

[Production client correction SHA `041d4986`](https://github.com/nora953/fawri-production-source/commit/041d4986e584c86e54a0af0327aa7a7b54738e6a) in `artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts` adds a **second real local outbox read after a successful network pairing response and before committing new station identity**. A newly pending operation fails closed via the existing `CASHIER_PAIRING_PENDING_OPERATIONS` (409) contract, before station/token save, session invalidation or cost scrub. No new permission, provider mapping, sequence arithmetic, receipt attachment, automatic retry or offline disposal.

**GREEN:** [real Chromium native IndexedDB regression #42898298004](https://github.com/nora953/fawri-production-source/actions/runs/42898298004), **COMPLETED SUCCESS**, job `130117179953`. Exact accepted marker:

`P0_STATION_PAIRING_LATE_OUTBOX_NATIVE_INDEXEDDB {"nativeIndexedDb":true,"actualCommittedSale":true,"pendingSaleAndMovementRetained":true,"delayedPairingDenied":true,"originalBindingUnchanged":true,"sourceStockPreserved":true,"syntheticPairingHttpOnly":true,"crossDbLinearizableGuarantee":false,"hostedOrPhysicalDeviceAccepted":false}`

Earlier actual native Chromium station re-pair ordering/invalid-credential and operator outbox ACK replay tests also passed in the same green run. [General final quality run on source SHA #42898297947](https://github.com/nora953/fawri-production-source/actions/runs/42898297947) **must be separately checked for all four completed successes** before it is described as fully accepted.

## Explicit unresolved correctness and launch boundary

This narrow recheck prevents station changes when a real offline sale **arrives during the network wait**, but **it does not establish cross-database linearizability**: a further sale can still race between that second outbox read and the bootstrap identity compare-and-swap, as cashier transactions and bootstrap identities reside in **different IndexedDB databases** without a shared atomic commit. A full multi-tab/multi-device quiescence or trusted server-enforced sequencing strategy requires separate design, implementation and acceptance. Do **not** claim that all physical device re-pair races or multi-device financial recovery are solved from this test.

Parent `CASHIER-SYNC-SEQUENCE-001` **OPEN**; `P0-OFFLINE-DEVICE-ACCEPTANCE` **OPEN**. Historical register unchanged **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED out of 45 known source rows**. 29/45=64.4% is *only known source-row closure, NOT whole launch readiness*. `completeP0Inventory=false`, `overallPercentage=null`. PR #550 DRAFT; launch NO-GO. No original Neon/Railway, hosted merchant data, provider credentials, production release, merge or deploy touched.
