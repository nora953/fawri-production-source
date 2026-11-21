# P0 CASHIER-SYNC-SEQUENCE-001 — partial persisted device identity must not be regenerated (RED → GREEN)

**Date:** 2026-11-10. **Scope:** one bounded local financial-device identity safety gap fixed in source with actual Chromium/IndexedDB. **Not** physical device power-loss, hosted stream, approval of a v2 recovery, or commercial release.

## Reproduced bug: damaged record was treated as a new device

The real `getOrCreateCashierDeviceIdentity()` originally returned an existing bootstrap row only when both `local_merchant_id` and `device_id` were truthy; otherwise it generated and `put` a fresh ID under the **same `identity/default` key**. The previous atomic first-creation fix prevented concurrent tabs overwriting **complete** identities, but this remaining path silently overwrote a **persisted partial bootstrap record**. It can detach potentially durable local cashier data from its original identity. There is **no evidence of actual customer data loss**; the synthetic damaged record is a fail-closed recovery scenario.

- [New genuine browser negative test `048c88ad`](https://github.com/nora953/fawri-production-source/commit/048c88ad6e2a0bc1ed2ef81d68267feac90d3aac) directly writes a deliberately incomplete existing `default` identity to actual IndexedDB, calls **real production** `getOrCreateCashierDeviceIdentity()`, then verifies both explicit refusal and byte-for-byte preservation. Scenarios include missing `device_id` and missing `local_merchant_id` with synthetic existing merchant metadata.
- [Chromium RED #42893352670](https://github.com/nora953/fawri-production-source/actions/runs/42893352670), **COMPLETED FAILURE of the new negative case**: `P0_BOOTSTRAP_PARTIAL_IDENTITY_OVERWRITE {"accepted":true,"originalMerchantRetained":false,"originalDeviceRetained":false}`. Already accepted 48-caller/two-tab first-creation race remained GREEN in that same RED run.

## Narrow production correction and exact accepted tests

- [Runtime correction `f15138d7`](https://github.com/nora953/fawri-production-source/commit/f15138d775ac849987fd48b27eee5560411f7b60) in `artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts` retains the same single `readwrite` transaction. A *missing* record may create a stable new identity as before; a **present but incomplete** record causes a deterministic `CASHIER_BOOTSTRAP_IDENTITY_INVALID` (409) after transaction completion and **before any write**, preserving the original row for separate evidence-based recovery. No silent delete, auto re-pair, new device identity, loss of outbox, sequence reset or change to server authorization occurs.
- [Exact Chromium real IndexedDB GREEN #42893653170](https://github.com/nora953/fawri-production-source/actions/runs/42893653170), **COMPLETED SUCCESS**, job `130100959886`, on source/test SHA `f15138d775ac849987fd48b27eee5560411f7b60`. Exact log marker:
  `P0_CASHIER_BOOTSTRAP_PARTIAL_IDENTITY_FAIL_CLOSED {"nativeIndexedDb":true,"partialRowsDenied":2,"previousMerchantAndDeviceEvidencePreserved":true,"noNewIdentityOrFinancialRecoveryAuthorized":true,"physicalDeviceAcceptance":false}`.
  The prior `P0_CASHIER_BOOTSTRAP_ATOMIC_CREATE_REAL_INDEXEDDB` proof also passed on the **same commit**: 2 tabs, 48 concurrent callers, **one stable identity**.
- [Full final quality #42893653411](https://github.com/nora953/fawri-production-source/actions/runs/42893653411) **COMPLETED SUCCESS 4/4** on exact source/test SHA `f15138d7`: full-build, full-typecheck, quality-tool-tests, translation-structure-audit. Prior RED is a test-proven source defect, not an accepted CI check.

## Honest release boundary

This test did **not** simulate power loss, verify contents of an actual sale/outbox, recover partial identity, attest a physical device, check cross-device order of streaming events, verify actual hosted HTTP/SQL, or prove any provider-specific payment/Meta identity. The fix explicitly holds damaged identity **without** claiming successful recovery. A real financial-device recovery must require independently verified evidence and operator/owner approval; this test does not authorize repairing or replacing persisted identity.

`CASHIER-SYNC-SEQUENCE-001` and `P0-OFFLINE-DEVICE-ACCEPTANCE` remain **OPEN**. P0 known source register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED of 45 historical source rows**; 29/45 reflects *only known source-row closure*, not project launch readiness. `completeP0Inventory=false`, `overallPercentage=null`. PR #550 remains DRAFT, release NO-GO. No original Neon/Railway/hosted SQL, merchant/financial data, production credential, merge or deployment touched.
