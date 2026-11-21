# CASHIER-SYNC-SEQUENCE-001 — full operator upload/ACK race through native Chromium

**Date:** 2026-11-09. **Status:** bounded source/client **PASS**; complete P0 cashier gate **OPEN**. No hosted SQL/HTTP or physical device attestation.

## Gap that this acceptance closes

Earlier source [`acknowledgeSyncedExact`](../../../artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts) hardened the native IndexedDB method against operation-ID-only deletion, but isolated method invocation did **not yet** prove that the **active real cashier operator uploader** preserves the protection during sale upload, provider/server ACK validation, local mutation, and retry.

New [actual browser driver](../../../scripts/cashier-operator-ack-race-native-browser.cjs) at [commit 4dc1f255](https://github.com/nora953/fawri-production-source/commit/4dc1f2556cda21d53a436a49e4d39f2ebbe9c888) imports and invokes **actual** `syncCashierOperatorOutboxToCloud` and real `IndexedDbCashierAuthority` in Chromium. It creates a synthetic station identity/operator session, actual native local sale and inventory records (two sequenced sales), distinct historical operator bindings, and synthetic opaque catalogue cost evidence. It intercepts **only** the in-browser HTTP response; there is no simulated server-side authorization acceptance.

The first request receives a positive synthetic server ACK, **after** inserting a new durable inventory row sharing that operation ID into native IndexedDB. The real uploader verifies server ID/sequence/entity ACK and must then fail **`CASHIER_LOCAL_ACK_EVIDENCE_MISMATCH`** when transactional local ACK observes an extra row absent from the original upload. SQL/HTTP server/provider confirmation is **not** inferred from the synthetic response. Both original sales' stored records and stock remain correct; no second sequence is uploaded. After a **test-only deliberate removal** of this synthetic injected row, retry replays the first accepted HTTP event, then uploads the next sequence once, exactly ACKs both original operations and leaves sale/stock stores intact. This test-only removal is not authorization to delete any real restored business evidence.

## Checked exact CI

- [Chromium real IndexedDB run **#42707194608**](https://github.com/nora953/fawri-production-source/actions/runs/42707194608), **COMPLETED SUCCESS**; log marker `P0_OPERATOR_FULL_DRAIN_ACK_RACE_REAL_INDEXEDDB` includes:
  - `"nativeIndexedDb":true`, `"actualOperatorDrain":true`, `"actualServerAckValidation":true`
  - `"lateSameOperationRowRetained":true`, `"secondDeviceSequenceBlocked":true`
  - `"exactOriginalSnapshotRetry":true`, `"firstServerAcceptedReplay":true`, `"completeAckDeletesOnlySentRows":true`, `"sourceSaleAndStockPreserved":true`
  - Explicit limits `"syntheticTransport":true`, `"authProviderAttested":false`, `"hostedAccepted":false`, `"realPhysicalDeviceTest":false`.
- Browser workflow [`.github/workflows/p0-cashier-indexeddb-browser.yml`](../../../.github/workflows/p0-cashier-indexeddb-browser.yml) now watches the dedicated test driver, runs it after the already accepted native IndexedDB suite and before station binding race assertions. [Workflow integration commit ff80c7b9](https://github.com/nora953/fawri-production-source/commit/ff80c7b9b1d1d8baf2866f2844f0b0c626bf0b6d).
- This adds execution/coverage **without** changing earlier accepted production upload code. Previous source protection and test: [P0-CASHIER-OPERATOR-EXACT-ACK-LOCAL-SNAPSHOT-20261109.md](./P0-CASHIER-OPERATOR-EXACT-ACK-LOCAL-SNAPSHOT-20261109.md).

## Remaining real P0 evidence

Still need original device/cross-device authenticated sequence provenance, isolated or new-commercial trusted SQL+HTTP operator acceptance, crash/restart/device power-loss proof and explicitly approved movement-only protocol v2. Browser-only synthetic response is not a provider/hosted proof. Other external integrations stay OPEN/BLOCKED.

**Gate:** `CASHIER-SYNC-SEQUENCE-001` OPEN; draft PR #550; **NO-GO**. Historical source register 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED (29/45 = 64.4% known-row count only, not global launch readiness). No hosted Neon/Railway writes, refunds, merge or deploy.
