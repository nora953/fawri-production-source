# P0 CASHIER-SYNC-SEQUENCE-001 — stale catalog response can resurrect old station identity (RED → GREEN)

**Checkpoint:** 2026-11-10. **Scope:** one real Chromium+IndexedDB source binding defect fixed and tested using synthetic HTTP transport. **Not physical-device, hosted operator HTTP, server station enrollment or cross-device sequence acceptance.**

## Reproduced defect (RED)

`syncCashierOperatorCatalogFromCloud` authenticated a cashier operator session before requesting `/api/cashier/operator/catalog-snapshot`. After a delayed snapshot response, it checked only bootstrap `cloud_merchant_id`, `device_id`, and `location_id` against the originally captured session. It omitted the critical `station_id` and `station_token`. Its final unconditional `writeCashierDeviceIdentity({...identity,last_catalog_sync_at})` could then restore an old station/token over a newly paired station on the *same merchant, device and location*, undoing the separately accepted pairing and `/station/me` compare-and-swap protections.

A new real-browser regression invokes the actual `syncCashierOperatorCatalogFromCloud()` with a session and valid live IndexedDB local catalog, delays a synthetic HTTP response, commits a newer same-device/same-merchant/same-location pairing to the bootstrap store, then releases the old snapshot. It requires fail-closed old response and exact byte-for-byte newer pairing preservation, plus a positive unchanged-station catalog refresh.

- **Test-only source** [`a7de3a34`](https://github.com/nora953/fawri-production-source/commit/a7de3a346837cb5b9e44bbaa89a8663032e5bf68) and [workflow wiring `0e411ae8`](https://github.com/nora953/fawri-production-source/commit/0e411ae842a5c7088b5403d04e10fe9ee206866f).
- **Real Chromium RED** [#42879141181](https://github.com/nora953/fawri-production-source/actions/runs/42879141181), **COMPLETED FAILURE on new test**: `P0_CATALOG_STALE_BINDING obsolete catalog response must be refused before touching new station`. Previously accepted outbox exact-ACK, payment-enum, concurrent pairing and station/me regressions passed prior to the new assertion. This is a synthetic deterministic race, not a report of a real customer's data exposure.

## Source fix and accepted GREEN

[Runtime fix `ea1e2cd2`](https://github.com/nora953/fawri-production-source/commit/ea1e2cd2a4b79d31d135b22923ae3c375dc13e9) in `artifacts/fawri/src/lib/cashierOperatorCloudSync.ts`:

1. Check the actual bootstrap `station_id` **and** `station_token` against the signed operator session (in addition to existing merchant/device/location) **before** writing retrieved catalog, promotions or cost evidence. A late old-station network response is rejected with the existing `CASHIER_OPERATOR_DEVICE_MISMATCH` 409 instead of being applied to another pairing.
2. Replace the unsafe unconditional final `writeCashierDeviceIdentity` with the already accepted **atomic native IndexedDB** `writeCashierDeviceIdentityIfUnchanged(identity,next)`. If identity changes during later awaited catalog writes, the old bootstrap station/token cannot be put back; the call fails with a device-mismatch conflict.
3. Preserve unchanged-session refresh and `last_catalog_sync_at` metadata, with no entitlement/stock/sequence reset, security-role or provider changes.

**Accepted native Chromium+real IndexedDB GREEN:** [#42879500725](https://github.com/nora953/fawri-production-source/actions/runs/42879500725), **COMPLETED SUCCESS**, browser job `130051670076`. Exact logged result:
`P0_CATALOG_STALE_BINDING_REAL_INDEXEDDB {"nativeIndexedDb":true,"actualCloudCatalogSync":true,"lateOldStationSnapshotRejected":true,"newStationTokenPreserved":true,"unchangedSessionCatalogRefreshWorks":true,"syntheticHttp":true,"physicalDeviceAttested":false,"hostedAccepted":false}`.

Prior outbox replay/ACK, station pairing CAS and invalid-token native browser tests also passed in the same run. [General quality run #42879500595](https://github.com/nora953/fawri-production-source/actions/runs/42879500595) requires separate verification of all four final job conclusions; do not call them accepted while pending.

**Limit of this proof:** The final CAS guarantees stale bootstrap identity cannot be restored even if the station changes during an await, but it does **not** make local catalog/cost-evidence stores and bootstrap identity one atomic cross-database transaction. The RED test specifically races at the network-response boundary and demonstrates pre-write rejection in that case. Actual hosted device/HTTP authority, cross-tab catalogue concurrency under arbitrary timing, physical power loss, inventory v2 continuity and server sequence recovery still need independent acceptance. This bounded source fix is **NOT** closure of `CASHIER-SYNC-SEQUENCE-001` or `P0-OFFLINE-DEVICE-ACCEPTANCE`.

The historic source P0 register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED of 45 known bounded rows** (64.4% of these source rows only, **not** overall launch readiness). PR #550 remains Draft, release NO-GO. No original Neon/Railway, hosted provider integration, actual merchant DB, real pairing tokens, merge, deployment or financial settlement was touched.
