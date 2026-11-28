# P0 / FT-01 first-commercial 53-stage held-migration bundle — disposable acceptance only

**Date:** 2026-11-09. **Exact executable SHA:** [`bfcb607c8b9c25570b3f947e71258f2815b0d93e`](https://github.com/nora953/fawri-production-source/commit/bfcb607c8b9c25570b3f947e71258f2815b0d93e). **Scoped FT-01 PostgreSQL 18 job:** [#42627009004](https://github.com/nora953/fawri-production-source/actions/runs/42627009004), job `129193249846`, **COMPLETED SUCCESS**. Initial unpinned bundle job [#42626425487](https://github.com/nora953/fawri-production-source/actions/runs/42626425487) also **SUCCESS**, and its exact output provided the now fixed bundle SHA.

## Actual source defect reduced

The previous held migration rehearsal used `createStabilizedMigrationFolder` to copy canonical `0000–0052`, then overwrote `0052` in place with a reviewed invoker candidate. That applied successfully on local PostgreSQL but did **not** provide a separately verifiable *entire effective 53-stage migration bundle* or explicitly prove the final ledger hash corresponded to the first-commercial variant.

Now `scripts/lib/ft01-first-commercial-disposable-bundle.mjs`:
- Revalidates all **53 canonical migration SQL** and the frozen canonical journal, stage and snapshot, plus the independently committed first-commercial `0052` and minimum issuer-grants source.
- Declares **exactly one selected-source divergence**, the held `0052` SQL; the other 52 stages remain byte-identical **before** deterministic dependency ordering.
- Computes each stage's actual **post-stabilization SQL SHA**; rejects unauthorized extra SQL, unexpected stages, changed source, changed source/journal/snapshot, bad output or an altered stabilization algorithm.
- Pins the 53-stage ordered effective manifest SHA-256 as `1036c70db367b3153b6d070bfbb2d0af3edeb6cf02bdf618e47614e0a0104a05`, measured by the earlier clean local CI and reverified by the accepted executable SHA above.
- Writes the 53 approved-for-review stage files and a checked copy of the canonical `_journal.json` to an **ephemeral OS temp directory** only after validating the exact GitHub Actions repository and `127.0.0.1:5432/fawri_ci` local database URL. It has **no connection to PostgreSQL**, migration execution, hosted API or deployment permissions.
- The real local PG18 test now applies **that exact generated folder** with Drizzle using the independent non-superuser owner; checks 53 applied entries including the last **Drizzle ledger `hash` equal to the explicitly selected `0052` stage SHA**, never mistaken for historical canonical `0052`; repeats migration to demonstrate idempotent 53-stage ledger and then runs existing adversarial RLS/role/merchant deletion and rollback cases.

**Verified test markers:** `FT01_EXACT_53_STAGE_DISPOSABLE_BUNDLE_PASS`, `FT01_FIRST_COMMERCIAL_DIVERGENT_0052_LEDGER_SHA_PASS`, `FT01_COMMITTED_HELD_0052_CASHIER_GRANTS_PG18_PASS`, `FT01_INVOKER_NON_SUPERUSER_53_MIGRATIONS_PASS`, `FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS`. Negative source unit tests reject tampered `0001`/held `0052` and refuse bundle materialization outside exact local CI or against other DB URLs.

## Release decision unchanged — STILL NO-GO

This closes a **source-test gap**, not a full registered P0 gate. The canonical `0052` migration SQL and Drizzle journal remain unchanged. The held variant's effective ledger hash is **intentionally not the canonical ledger** and must be separately reviewed as a first-commercial-only migration lineage before any hosted write.

**Not implemented or authorized:** independently signed/approved first-commercial execution runner or target credential admission; actual new Neon project/branch authentication and empty-schema attestation; operational role promotion/least-privilege grants on real target; an encrypted externally recoverable backup and independent restore; bounded same/foreign/revoked SQL+HTTP in new target; merge, deploy or launch signoff. Do not treat CI-local SQL as any of those.

The canonical registry still has **29 `CLOSED_SOURCE` of 45 known source gates, 7 `OPEN`, 9 `BLOCKED`**, `completeP0Inventory=false`, `overallPercentage=null`; 64.4% is *known source-row coverage*, NOT launch readiness. **FIELD002 OPEN; hosted 0052 BLOCKED; PR #550 DRAFT; commercial launch NO-GO.** No Neon or Railway mutation, production credentials, original staging import, merge, deploy or release operation.
