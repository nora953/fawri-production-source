# P0 / FT-01 — Cashier historical lifecycle CI regression recovered

**Date:** 2026-11-09, Baghdad. **Source SHA:** `dd2646b5dbf8f30c0d607e4861a7a625fad69cc8` on existing draft PR #550. **Scope:** disposable/local PostgreSQL test fixture ONLY, no commercial schema, hosted writes or production business logic modified.

## Previously failing, repeatedly reproduced

- Exact old [Cashier subscription lifecycle run #42510726313](https://github.com/nora953/fawri-production-source/actions/runs/42510726313), isolated-audit job, failed `artifacts/api-server/tests/cashier-full-lifecycle-postgres.integration.test.ts:399` on `authority.allowed === false` vs `true`.
- The test deliberately models billing activation `2026-10-01`, expiry `2026-11-01`, grace-sale `2026-11-05`, renewal `2026-11-08`, **but cash-station pairing is performed by real current-time APIs**. On 2026-11-09, the test-created device credential `issued_at` and station seat `assigned_at` were later than the simulated `2026-11-05` sale. `cashierHistoricalOperationAuthority` correctly refuses historical operations from a device not yet credentialed. This indicates **fixture clock drift** for this failure, not a regression requiring relaxation of operation-security policy.

## Minimal exact fix, no production-code changes

Commit [`dd2646b5`](https://github.com/nora953/fawri-production-source/commit/dd2646b5dbf8f30c0d607e4861a7a625fad69cc8) changes only `artifacts/api-server/tests/cashier-full-lifecycle-postgres.integration.test.ts`: after station pairing, it sets the isolated fixture's current first-device `issued_at` and first-station active seat `assigned_at` to fixed `2026-10-10T00:30:00.000Z`, checking one credential and at least one active seat were changed, before asserting November grace history. This mirrors the repository's existing `cashier-historical-operation-postgres.integration.test.ts` fixture practice. It does **not** fake production billing response, remove authorization checks, modify persisted merchant customers or change the expected negative replay result.

## Exact test evidence

- [GitHub Actions Cashier subscription lifecycle run #42524774380](https://github.com/nora953/fawri-production-source/actions/runs/42524774380) **COMPLETED SUCCESS**, both `cashier-subscription` and `isolated-cashier-subscription / disposable-audit` jobs success.
- Exact [isolated-audit job #128865836308](https://github.com/nora953/fawri-production-source/actions/runs/42524774380/job/128865836308) logs show `ok 1 - cashier full lifecycle: activate, prorate seat, unified expiry, grace, restricted, renew and replay-safe historical sync`.
- Structured line `AUDIT_SUITE_RESULT` for `cashier-full-lifecycle-postgres.integration.test.ts`: `{"exit":0,"passed":4,"failed":0,"skipped":0,"cancelled":0,"summaryComplete":true}`. No skipped required assertions for this suite.

**Bounded result:** old recurrent cashier test failure **resolved on this exact SHA**. This is NOT closure of `CASHIER-SYNC-SEQUENCE-001`, device enrollment provenance, 0052 commercial rollout, hosted SQL+HTTP, or P0 launch gate. Existing source/isolated acceptance tests continue to be reused rather than repeated.

**Source policy:** user chose the shortest defensible safe-launch path and accepted new independent Neon `crimson-cherry-65705041` / `br-holy-waterfall-b993zglb`. Empty-schema SELECT preflight already passed with zero user relations; no hosted writes, imports, roles or deployment are authorized by this CI repair.
