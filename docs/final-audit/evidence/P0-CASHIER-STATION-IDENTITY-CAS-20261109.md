# P0 cashier station binding race: real Chromium IndexedDB reproduction and atomic fix

**Date:** 2026-11-09. **Accepted executable source:** [`320b3e973a8184c9f656a194f35c95063aedbf57`](https://github.com/nora953/fawri-production-source/commit/320b3e973a8184c9f656a194f35c95063aedbf57).

## Source defect and RED reproduction

`recoverLegacyCashierStationBinding` in `artifacts/fawri/src/lib/cashierStationBindingRecovery.ts` read the old IndexedDB bootstrap station/device identity, fetched `/api/cashier/station/me`, then wrote the old identity plus server response fields through `writeCashierDeviceIdentity`. This read-network-write sequence had no transaction-level identity compare-and-swap: a newer pairing (another tab or the same page) could commit while the HTTP reply was delayed, and the stale recovery would silently replace the new station ID, location and credential.

[Real Chromium **RED** CI #42638967312](https://github.com/nora953/fawri-production-source/actions/runs/42638967312), code before application fix [`d37bdba5`](https://github.com/nora953/fawri-production-source/commit/d37bdba5c14332d46c8dc71f9d77c45eca04269d): browser test saved an old real IndexedDB identity, held its station/me response, committed a new station/token/location through the real bootstrap store, released the old response. The old source returned successful recovery and overwrote the new binding. Exact error: `P0_STATION_BINDING_RACE: old pending response overwrote new pairing`. Existing sequence/stock/outbox regression passed in this RED run; its failure was specific to the binding race, **not** a hosted or SQL issue.

## GREEN correction and bounded acceptance

New `writeCashierDeviceIdentityIfUnchanged(expected,next)` in `cashierOperatorSessionRuntime.ts` performs **both read comparison and conditional put inside a single native IndexedDB readwrite transaction** on the canonical bootstrap store. If *any* bootstrap identity metadata differs from the original observed record, the function returns false and writes nothing. The helper also forbids changing immutable merchant/device/station/token identity fields via a metadata-only update.

`recoverLegacyCashierStationBinding` now refuses a stale response through that atomic operation; `refreshDurableCashierStationBindingMetadata` uses the same guard rather than an unconditional stale snapshot update. Existing positive authenticated legacy hydration still returns true when the binding is unchanged. The persistent bootstrap and operation stores are never cleared by this fix, and the station binding is not silently re-paired. Synthetic `fetch` is injected only as a controlled timing response; **real IndexedDB transactions and the production source module are executed in Chromium**.

[Exact **GREEN** CI #42639426707](https://github.com/nora953/fawri-production-source/actions/runs/42639426707), job 129236227410, **COMPLETED SUCCESS**. Actual marker: `P0_STATION_BINDING_RACE_REAL_INDEXEDDB` with `old_http_response_overwrite_denied=true`, `new_station_preserved=true`, `stale_transaction_cas_denied=true`, `matching_original_station_hydrated=true`, `canonical_device_identity_preserved=true`. Existing stale-backup sequence and native outbox regression also passed in the same Chromium job. The separate `Cashier native IndexedDB engineering audit` workflow passed on exact source. Static recovery-contract tests assert the guarded call sites.

## Gate / release boundary

This is a **specific source-side fix** within `CASHIER-SYNC-SEQUENCE-001` device continuity and the P0 offline cashier acceptance area. It is not an authorized device stream enrollment, late-operation checkpoint repair, public v2 activation or a complete physical-device admission/recovery test. Browser `/station/me` transport response was synthetic; no real server authentication/SQL/HTTP network or hardware provenance was asserted. No full P0 row is closed.

P0 register remains **29 `CLOSED_SOURCE`, 7 `OPEN`, 9 `BLOCKED` of 45 known rows**; full inventory still incomplete and overall launch progress has no authorized percentage. `FIELD002` and `0052` hosted verification stay blocked/open as previously recorded. **NO-GO**, PR #550 draft. No Neon/Railway, live role/password, restore/import, merge, deploy or production writes.
