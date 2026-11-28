# P0 CASHIER-SYNC-SEQUENCE-001 — automatic/manual outbox drain single-flight and browser Web Locks

**Checkpoint:** 2026-11-09; **PR #550 still DRAFT**, release **NO-GO**. This fixes a bounded source race in the active operator cash register, not the complete device stream or hosted launch gate.

## Bug and source fix

The automatic POS synchronizer in `artifacts/fawri/src/cashierMain.tsx` used a local `running` boolean, but the merchant's separate **Sync now** button in `artifacts/fawri/src/pages/CashierCatalogSyncPage.tsx` called the same `syncCashierOperatorOutboxToCloud()` without sharing that state. Two calls in the same app could independently enumerate the same IndexedDB pending operation and race the operation upload/ACK. Backend deduplication is authoritative but cannot make this frontend race desirable.

1. [Source commit `78147d9b`](https://github.com/nora953/fawri-production-source/commit/78147d9bc47bae4f418dc28f957d50778f6cf0c5) added an immediate module-scope `operatorOutboxSyncInProgress` fail-closed admission guard, always cleared in `finally` on both success and rejection. One run remains responsible for complete server ACK and local outbox removal.
2. [Source commit `72c360d3`](https://github.com/nora953/fawri-production-source/commit/72c360d3b805c17f509933dadac4d13017d63d17) acquired a **non-queuing origin-scoped browser Web Lock** `fawri:cashier-operator-outbox:v1` with `{mode:'exclusive',ifAvailable:true}` *before* accessing the IndexedDB outbox, where available. If another tab holds the lock or the browser lock API fails, this upload attempt fails closed and releases the in-process guard. Browsers without Web Locks retain the module guard plus existing server-issued per-device sequence/replay authorization; **no claim** is made about cross-tab exclusivity in a browser without Web Locks or about different devices.
3. [Automatic POS handler `88d71914`](https://github.com/nora953/fawri-production-source/commit/88d71914420308b6f971254e835ceb376c3859aa) treats `CASHIER_OPERATOR_SYNC_IN_PROGRESS` as competing legitimate work rather than claiming a failed financial upload; it schedules its existing backoff, without publishing a misleading needs-attention state.
4. [Manual sync UI `25d37c6d`](https://github.com/nora953/fawri-production-source/commit/25d37c6d310610a47f15f159c7cff1d5b22e7a7e) displays already-localized `labels.wait` on contention rather than a generic financial sync error. No queue/ACK/entitlement changes.
5. [Source-derived real wrapper tests `6377956a`](https://github.com/nora953/fawri-production-source/commit/6377956a38fdbba40233e3b51d4770b7f5d5496c) transpile the actual TypeScript wrapper and exercise it with a held/drainable fake core and cross-tab Web LockManager simulation; no production network call is synthesized.

## Exact verified acceptance

- [Targeted GitHub Actions #42700166393](https://github.com/nora953/fawri-production-source/actions/runs/42700166393), job **129442454217**, **COMPLETED SUCCESS 37/37 tests**, none failed. Includes in-app concurrent rejection with zero second invocation; lock release after success/error; two separate in-memory app wrapper instances competing on shared origin LockManager; lack of silent fallback when browser lock access throws; manual/auto UI contention contracts; previously accepted boundary/ACK/binding tests.
- [Real native IndexedDB/Chromium browser #42700166011](https://github.com/nora953/fawri-production-source/actions/runs/42700166011): **PENDING** as of this file's initial authoring; update only with exact green CI evidence. This browser workflow runs IndexedDB smoke and station races but does **not** itself simulate two tabs executing the production operator uploader. Two-tab test above uses a controlled LockManager plus transpiled real wrapper.
- [Final quality gates #42700166372](https://github.com/nora953/fawri-production-source/actions/runs/42700166372): **PENDING** at authoring; do not claim full green until its four exact jobs finish.

## Unclosed real launch acceptance

`CASHIER-SYNC-SEQUENCE-001` remains **OPEN**: device-stream v2 movement-only semantics unapproved; cross-device serialized receipt/replay/restore and actual device power-loss/recovery evidence are not accepted; the server remains authoritative for sequence/replay. Hosted provider identity/roles, commercial database backups, payment and Meta integrations, key-provider and production deletion governance are separately **EXTERNAL BLOCKED**, never mocked or implicitly waived. This is independent software progress only.

Historical bounded source register 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED; 29/45 (64.4%) is **not** entire P0 readiness. PR #550 remains draft. No Neon/Railway writes, merge, production deployment, refund or deletion. Owner action: **none needed for this source-only fix**.
