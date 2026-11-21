# P0 CASHIER-SYNC-SEQUENCE-001 — late concurrent station pairing overwrite (actual RED → GREEN)

**Checkpoint:** 2026-11-10. **Scope:** one source race fixed and proven with native Chromium IndexedDB and controlled synthetic HTTP responses. **NOT** physical-device, actual provider HTTP/server station admission, hosted SQL, v2 sequence or commercial release acceptance.

## Actual source defect: concurrent pairing

`pairCashierStation()` checked the pending local outbox and captured the device bootstrap identity **before** awaiting `/api/cashier/station/pair`, but wrote the result using unconditional `writeCashierDeviceIdentity(next)`. If two requests from different tabs captured the same old identity, request B could receive and commit its **newer** station/token first, only for request A's late response to overwrite both with the older station/token. This is separate from the previously accepted `/station/me` metadata compare-and-swap and stale invalid-credential clearing.

**RED on real Chromium:** [test-only commit `5a47854b`](https://github.com/nora953/fawri-production-source/commit/5a47854b8f691b59f3badd8fdb8357c8a54c4a2f), [P0 cashier IndexedDB browser regression #42873852587](https://github.com/nora953/fawri-production-source/actions/runs/42873852587), **COMPLETED FAILURE of the NEW regression**. The same suite's previous real IndexedDB tests passed; new test failed at `P0_STATION_CONCURRENT_PAIRING_CAS late original response must fail closed, not report a successful re-pair`. The test holds two real `pairCashierStation` async requests with controlled synthetic HTTP, resolves the later request and commits its station first, then releases the original response to exercise true browser IndexedDB ordering. No real pairing code or merchant secrets are involved.

## Bounded production source correction

[Fix `df165ea8`](https://github.com/nora953/fawri-production-source/commit/df165ea834d53b93b025ba1e4b65b4072bb52b59) in `artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts` adds a **separate pairing-specific atomic IndexedDB compare-and-swap** `writeCashierDevicePairingIfUnchanged(expected,next)`. The helper:

- checks the expected default/merchant/device identity and that the new pairing is not for another already-bound merchant;
- compares **the whole previously observed bootstrap row** against the row currently committed in the **same `readwrite` IndexedDB transaction**;
- changes station/token metadata only if expected state is still current; a conflicting winner is never overwritten;
- rejects stale HTTP pairing with explicit `CASHIER_PAIRING_STALE_RESPONSE` (409) **before** old-session invalidation or cost scrubbing, preserving the newer station/token and financial local stores;
- does **not** weaken the earlier metadata-only CAS (which still prohibits credential changes), amend server authoritative pairing/replay, infer sequence recovery, or silently clear local sales/outbox.

**GREEN on same real Chromium runner:** [#42874092313](https://github.com/nora953/fawri-production-source/actions/runs/42874092313) **COMPLETED SUCCESS**, job `130032691960`. Exact marker:

`P0_STATION_CONCURRENT_PAIRING_CAS_REAL_INDEXEDDB {"real_chromium_indexeddb":true,"synthetic_http_response_only":true,"late_original_pairing_denied":true,"new_station_preserved":true,"pending_financial_sequence_not_attested":true,"physical_device_or_hosted_v2_accepted":false}`

Prior tests in that run still pass, including the original station/me and invalid-token races, duplicate-SKU/payment-enum fail-closed cashier sale, and operator full-drain exact-ACK race. [General quality on source commit #42874091920](https://github.com/nora953/fawri-production-source/actions/runs/42874091920) is an **independent** 4-job build/typecheck/translation/quality gate: check its final job results before claiming overall 4/4.

## Status boundary

The accepted browser test uses a **synthetic pairing-response transport**, not the hosted cashier backend. It cannot prove production physical power-loss, actual station enrollment/revocation across devices, deterministic v2 store/movement reconciliation or recoverable PostgreSQL18 deployment. `CASHIER-SYNC-SEQUENCE-001` and `P0-OFFLINE-DEVICE-ACCEPTANCE` remain **OPEN**, no original P0 register row closed, and no policy choice/v2 release was adopted. Historical source register stays **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED among 45 known source rows** (64.4% bounded source-row coverage only, not overall readiness). PR #550 remains Draft; release **NO-GO**. No original Neon/Railway, hosted provider credentials, merchant records, merge or deployment modified.
