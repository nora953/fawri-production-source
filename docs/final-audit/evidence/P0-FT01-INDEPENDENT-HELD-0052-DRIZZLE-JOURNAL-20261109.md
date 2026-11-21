# FT-01 / 0052 — first-commercial independent Drizzle migration lineage (HELD)

**Date:** 2026-11-09, Baghdad. **Exact executable SHA:** [`8f5e5a1c9c0affeed4dc4a75f0e06ddb76a7e8e1`](https://github.com/nora953/fawri-production-source/commit/8f5e5a1c9c0affeed4dc4a75f0e06ddb76a7e8e1). **Bounded actual PG18 GitHub run:** [#42633875042](https://github.com/nora953/fawri-production-source/actions/runs/42633875042), job `129216819709`: **COMPLETED SUCCESS**. Previous initial distinct-journal test on [`08994d4f`](https://github.com/nora953/fawri-production-source/commit/08994d4f466c7401388d87a240bcfddf24877263), [FT-01 #42633023960](https://github.com/nora953/fawri-production-source/actions/runs/42633023960), also **SUCCESS**.

## Source defect resolved at bounded candidate level

The earlier first-commercial 0052 held candidate had different `SECURITY INVOKER` SQL, but used the same journal tag `0052_cashier_stream_receipt_storage` as the historical canonical version. Though the Drizzle local ledger stored different SQL hashes, the **journal identity did not uniquely distinguish** the two histories, which could confuse later staged/rollout verification.

The **new** source-reviewed, still-HELD `lib/db/first-commercial/held/meta/_journal.json` is byte-for-byte equal to the immutable canonical journal except **ONE final tag**:
`0052_cashier_stream_receipt_storage_invoker`. All 52 prior tags, timestamps, versions and 53 total entries are unchanged. The separate held migration is `lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql` with the exact approved-for-review SQL content from previous FT-01 tests. The canonical `lib/db/drizzle/meta/_journal.json` and canonical `0052_cashier_stream_receipt_storage.sql`, migration stage and snapshot are **unchanged**.

**Source-only guards now:**
- Compare committed HELD journal to the exact single-tag transformation from the independently pinned canonical journal and **pin its byte SHA-256** to `7683b1fe807a514c0662ffb216e995492712433302f8292f9b2966582ed46339`. Earlier timestamps, extra entries, revert to old 0052 tag, or a changed journal byte all fail.
- Assemble the 53-stage **local disposable** bundle with 0052 source saved under the new tag and no old canonical 0052 file; recheck held journal SHA and source manifest. Keep the previously accepted staged *SQL chain* SHA-256 `1036c70db367b3153b6d070bfbb2d0af3edeb6cf02bdf618e47614e0a0104a05` unchanged, while the distinct selected journal is tracked separately.
- The **real PG18** isolated test exercises all 53 migrations with a non-superuser owner and independently authenticated restricted tenant, auth and operator LOGINs, and verifies the Drizzle final ledger hash matches **the held variant**. Existing scoped issuer grants, role isolation and denied replay/foreign mutations remain enforced.
- The explicitly selected production prelistener `first-commercial-invoker-v1` additionally requires `FAWRI_FT01_REVIEWED_HELD_JOURNAL_SHA256` to match this **exact held journal digest**, separate from the held SQL digest and NOLOGIN role SQL digest. Unknown/missing/old canonical journal hash is denied, while the default original production profile remains unchanged.
- The runtime carries a frozen build-time pin, validated against the source review in CI, not repository-relative reads in deployed API workers.

**Actual FT-01 success log markers:** `FT01_DISTINCT_FIRST_COMMERCIAL_JOURNAL_LOCAL_PASS`, `FT01_EXACT_53_STAGE_DISPOSABLE_BUNDLE_PASS`, `FT01_FIRST_COMMERCIAL_DIVERGENT_0052_LEDGER_SHA_PASS`, `FT01_EXPLICIT_SOURCE_PINNED_STARTUP_PROFILE_LOCAL_PASS`, `FT01_INVOKER_NON_SUPERUSER_53_MIGRATIONS_PASS`, `FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS`.

## What remains a genuine launch blocker

This is a **reviewable first-commercial migration journal/SQL lineage**, not the separately approved hosted execution runner or authority for production release. No source or CI result verifies the independent Neon target identity/recoverability or runs real role creation/migrations on hosted Neon. The grant SQL is a scoped cashier subset, not full production runtime ACL provisioning. Owner-approved new-target backup/restore, independent branch/login attestation, full role/SQL+HTTP, deployment and rollback are still required.

**Status unchanged:** source register 29 `CLOSED_SOURCE` / 7 `OPEN` / 9 `BLOCKED`; `completeP0Inventory=false`, `overallPercentage=null`. 64.4% = **known source-gate rows only**, not full P0 or commercial launch readiness. **FIELD002 OPEN; hosted 0052 BLOCKED; PR #550 DRAFT; launch NO-GO.** No Neon/Railway SQL, backups, secrets, merge, deploy, commercial launch or original staging import executed.
