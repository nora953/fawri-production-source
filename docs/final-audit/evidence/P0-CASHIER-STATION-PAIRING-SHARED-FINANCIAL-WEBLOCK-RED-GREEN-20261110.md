# P0 CASHIER-SYNC-SEQUENCE-001 — serialize offline financial commits and station re-pair across browser tabs (RED → GREEN)

**Checkpoint:** 2026-11-10. **Scope:** one directly reproducible cross-IndexedDB browser race fixed on the existing P0 PR. **Not hosted/physical-device/multi-device/v2/adjudicated financial recovery acceptance.**

## Why the prior outbox recheck did not close the race

The earlier [late-HTTP-sale source fix `041d4986`](https://github.com/nora953/fawri-production-source/commit/041d4986e584c86e54a0af0327aa7a7b54738e6a) rechecked the real local outbox just after a successful pairing HTTP response, before an atomic bootstrap identity CAS. However, the financial sale/stock/outbox transaction and bootstrap station CAS live in **separate IndexedDB databases**. Another tab could begin/commit a sale after that check, or race the station change. There was **no shared browser coordination**, leaving a serializability gap. Financial operations and station changes cannot be treated as atomically ordered simply because each individual IndexedDB transaction is atomic.

## Actual new RED with native browser

[Test-only SHA `69893d63`](https://github.com/nora953/fawri-production-source/commit/69893d636da962f72ad2313d2aa87fa9a53498a9) adds a separate live Chromium Web Locks + IndexedDB case in `scripts/cashier-station-binding-race-browser.cjs`.

The test creates a genuinely paired synthetic cashier device, a genuine local catalog item, and the existing production authority. It begins `pairCashierStation` and blocks its synthetic network response after the first zero-pending preflight. The actual Chromium `navigator.locks` holds the predetermined shared financial lock for this device. A **real** `IndexedDbCashierAuthority.commitSale` is queued while the lock is held; the pairing HTTP response then arrives. The test requires **sale wait, pairing wait behind sale, sale/stock/outbox commit, then re-pair denial with original identity**. Ordering is measured with `navigator.locks.query()`, not inferred from timings alone.

**RED:** [Chromium browser #42900497821](https://github.com/nora953/fawri-production-source/actions/runs/42900497821), **COMPLETED FAILURE at the new test**: `P0_SHARED_FINANCIAL_WEB_LOCK real sale must queue under the shared held lock before writing`. The old `commitSale` lacked coordination and could commit while the test's device-specific financial lock was held. Older outbox, station re-pair, catalog and bootstrap tests preceding it remained green. All data is disposable test-only, not a real lost transaction.

## Source fix

- [Shared lock primitive `41e9dd12`](https://github.com/nora953/fawri-production-source/commit/41e9dd12eb58b04c43d2d18edc948f486542c09d) in `artifacts/fawri/src/lib/cashierFinancialMutationLock.ts`: canonical, unambiguous device key `fawri-cashier-local-financial:` plus JSON-encoded `[localMerchantId,deviceId]`; exclusive **real browser Web Locks** held for an awaited callback. No server/distributed lock is claimed. In a browser without Web Locks, financial commits keep existing local IndexedDB semantics, but **station re-pair fails closed**.
- [Actual financial paths `bb049309`](https://github.com/nora953/fawri-production-source/commit/bb0493094cb7f2d00ae47006ff93013405de4257) wraps genuine `IndexedDbCashierAuthority.commitSale` and `adjustInventory` in this same lock, spanning their complete local atomic financial transactions. It does **not** change pricing/stock/outbox/sequence calculations, replay rules or data schema.
- [Station admission `78ef479b`](https://github.com/nora953/fawri-production-source/commit/78ef479bfd4c583725a034a8476b20b718752a08) checks lock availability **before** sending a potentially one-use pairing code. Only after network HTTP succeeds does it acquire the shared exclusive Web Lock for the **last** pending-outbox read, bootstrap identity CAS, operator-session invalidation and raw-cost scrub. This blocks simultaneous financial commits during the local transition without unnecessarily holding a lock over network latency. A newly pending sale fails via `CASHIER_PAIRING_PENDING_OPERATIONS` 409. Lack of browser cross-tab coordination fails as `CASHIER_PAIRING_CROSS_TAB_LOCK_UNAVAILABLE` 503.
- [Test lock key correction `db98df44`](https://github.com/nora953/fawri-production-source/commit/db98df4444b24a4866f2c738eac8e973eebc99d2) aligns test with collision-free tuple key. No canonical migrations, hosted GRANTs, native schema versions, device sequences, reconciled money records or live server changed.

## Exact GREEN

[Real native Chromium/IndexedDB + Web Locks #42901292676](https://github.com/nora953/fawri-production-source/actions/runs/42901292676), job `130127620508`, **COMPLETED SUCCESS** on exact code+test SHA `db98df4444b24a4866f2c738eac8e973eebc99d2`. Actual marker:

`P0_STATION_PAIRING_SHARED_FINANCIAL_WEB_LOCK {"nativeIndexedDb":true,"realWebLocks":true,"saleQueuedBeforePairing":true,"serializedFinancialBeforePairing":true,"pairingDeniedOnPendingSale":true,"oldStationPreserved":true,"saleAndMovementPreserved":true,"realHttpProvider":false,"physicalDeviceAttested":false,"hostedAccepted":false}`

The independently accepted earlier `P0_STATION_PAIRING_LATE_OUTBOX_NATIVE_INDEXEDDB` also PASS in the exact same GREEN run. This is stronger source proof than the earlier network-wait-only recheck and does **not** manually repeat unrelated accepted hosted checks.

[General final quality on exact source/test SHA #42901294209](https://github.com/nora953/fawri-production-source/actions/runs/42901294209): check all **four completed** build/typecheck/translation/tooling job conclusions before calling them accepted.

## Limits and remaining launch gate

The lock coordinates **cooperating, same-origin Web Locks-capable browser tabs** on one local merchant/device. The test proves financial `commitSale` and station `pairCashierStation` order under genuine browser locks. The same helper is also applied to `adjustInventory`, but the distinct adjustment-vs-repair race was **not independently proven by this test**. This cannot coordinate separate physical devices, external processes, legacy clients not using the lock, remote server enrollment or recovery, actual provider payment, browser crashes or underlying storage loss. A browser without Web Locks is forbidden from re-pairing but may still commit local offline operations.

**Do not claim global cross-device linearizability, complete cashier v2 readiness or production release.** `CASHIER-SYNC-SEQUENCE-001` and `P0-OFFLINE-DEVICE-ACCEPTANCE` remain **OPEN** pending authoritative hosted SQL/HTTP, trusted multi-device sequence/v2 policy, real device power-loss/restore and migration acceptance. Historic known source register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED of 45 rows**; 64.4% is only known source-row closure, not total launch readiness. PR #550 remains DRAFT, overall NO-GO, no original Neon/Railway, real merchant data, provider, merge or deployment.
