# FT-01 / 0052 — committed held SQL and exact minimum cashier issuer GRANT file

**Date:** 2026-11-09. **Source SHA:** [`64ef34f589a7db58d08b178b5bd9dff42099704f`](https://github.com/nora953/fawri-production-source/commit/64ef34f589a7db58d08b178b5bd9dff42099704f). **Targeted real PostgreSQL 18 CI:** [#42612325665](https://github.com/nora953/fawri-production-source/actions/runs/42612325665) / job 129143595701, **COMPLETED SUCCESS**. Prior [committed 0052-only CI #42611594402](https://github.com/nora953/fawri-production-source/actions/runs/42611594402) also **COMPLETED SUCCESS**.

## Actual P0 source launch-blocker reduction

Before this work the non-superuser `SECURITY INVOKER` first-commercial `0052` candidate was synthesized dynamically inside the PG18 test harness, and the critical cashier retirement `GRANT` commands existed only in that harness. A reviewer could not approve **the exact deployable SQL bytes** independent of the harness. This left a meaningful difference between the tested procedure and any potential approved release artifact.

**Fixed on source (not hosted):**
- Committed a separate, **HELD** `lib/db/first-commercial/held/0052_cashier_stream_receipt_storage_invoker.sql` containing exactly the reviewed 11,363-byte `0052` variant, including `SECURITY INVOKER` merchant deletion, RLS-scoped deleted-merchant stream retirement and NOLOGIN `fawri_cashier_retirement_writer`. The original `lib/db/drizzle/0052_cashier_stream_receipt_storage.sql`, its journal, stage and snapshot remain **unchanged**.
- Committed **HELD** `lib/db/first-commercial/held/0052_cashier_retirement_issuer_grants.sql`, an explicit eight-statement grant set for `fawri_auth_issuer`, `fawri_restricted_runtime`, and the separate writer group. No `LOGIN`/password commands, broad schema ownership, unrestricted `UPDATE`, table-level issuer writes, checkpoint `last_sequence` writes, or operator grants are included. This is the restricted cashier-retirement **subset** of operational grants only, not a complete app provisioning script.
- Source review `scripts/lib/ft01-first-commercial-invoker-source-plan.mjs` checks the committed variant against the exact original 0052 derivation, existing immutable 53-stage canonical journal/manifest pins, and **byte-for-byte** matches the committed grant file to the exact allowlisted SQL. It returns individual SHA-256 digests and remains `approved_to_execute=false`.
- Local PG18 harness no longer invents a 0052 or grant SQL body during application. It reads **both committed files**, verifies their exact bytes/digests, applies them as reviewed to disposable PG18 with a **NOSUPERUSER/CREATEROLE** owner and authenticates all three restricted LOGIN identities. Existing real SQL/RLS trigger deletion, same-merchant retirement, peer unchanged, no checkpoint access and adversarial privilege-drift rollback proofs run against those committed bytes.
- Additional source regression tests deliberately append a broad `GRANT ALL`, add an unauthorized `UPDATE(last_sequence)`, change writer membership to `SET TRUE`, remove grant SQL or change the held 0052 function caller. **Every change must be refused**, not automatically blessed by recalculating a new hash.

**Exact CI markers** in [FT-01 #42612325665](https://github.com/nora953/fawri-production-source/actions/runs/42612325665):
`FT01_COMMITTED_HELD_0052_CASHIER_GRANTS_PG18_PASS`, `FT01_COMMITTED_HELD_0052_APPLIED_LOCAL_PG18_PASS`, `FT01_INVOKER_NON_SUPERUSER_53_MIGRATIONS_PASS`, `FT01_FIRST_COMMERCIAL_0052_INVOKER_REVIEW_MANIFEST_FAIL_CLOSED_PASS`, `FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS`.

## Remaining hard release boundary

These are **committed reviewed candidate bytes only**. An approved first-commercial migration **execution** runner, authenticated external Neon project/branch identity, independent encrypted recoverable backup, separately reviewed production grant and login provisioning, real hosted SQL+HTTP, rollback measurement and owner signoff are **NOT** completed. Nothing in the committed files authorizes them to run automatically. The historical 0052 `OWNER TO fawri_cashier_retirement_owner` remains blocked for real non-superuser Neon fawri_owner. No source journal was rewritten and no hosted data was modified.

**P0 registry remains 29 `CLOSED_SOURCE` / 7 `OPEN` / 9 `BLOCKED` (64.4% of 45 *known source rows only*, inventory incomplete). FIELD002 OPEN, hosted 0052 BLOCKED, launch NO-GO, PR #550 DRAFT.** No Neon, old staging, Railway, commercial merge, deployment, secrets or restore/import operations.
