# FIELD002-R2 — post-cleanup hosted and restore boundary checkpoint (2026-11-06)

## Newly verified hosted state

The product owner authorized removal of the 28 precommercial experimental notifications exclusively from the original Neon nondefault staging branch `br-falling-dust-b1km4gix` in project `round-fire-18493605`, database `neondb`. Guarded deletion, independent zero-count verification and the exact scope are documented in `P0-FIELD002-R2-ORIGINAL-STAGING-FIXTURE-DELETION-20261106.md`.

A **separate, read-only subsequent SQL** on that same pinned staging branch confirmed:
- `public.notifications`: **0 rows** after cleanup.
- `relrowsecurity = false`; `relforcerowsecurity = false`.
- `pg_policies` matching `public.notifications`: **0**.
- Non-superuser LOGIN roles having effective `SELECT` privilege on this table: **3** (aggregate only, names not exported).

Zero rows is proof of fixture cleanup, **not** proof of tenant isolation. RLS privacy acceptance for the actual hosted branch remains OPEN and cannot be inferred from separate CI tests.

## Source-level restore and cutover controls inspected on this branch

- `scripts/run-postgresql-migration-cutover.mjs` deliberately refuses `--write` with `REAL_CUTOVER_NOT_IMPLEMENTED`, until backup, restore rehearsal, approval and credentials are in place. Its source migration guards (already accepted in previous CI checkpoints) reject migrating notification rows or notification-targeted source lineage. This is **not** a live production cutover.
- `scripts/restore-postgresql.mjs` restricts the restore target to loopback (`localhost`/`127.0.0.1`/`::1`) plus disposable database-name patterns, requires `FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE=1`, and validates a checksum plus owner/ACL-preserving manifest. It runs `pg_restore` and performs a single configured row-count verification. It does **not** prove that future commercial recovery cannot reintroduce historical notification fixtures: a backup is allowed to restore its contained data into a disposable database, and no hosted commercial restore workflow is yet verified.
- `scripts/lib/postgresql-migration-plan-complete.mjs` builds and validates a source plan; previous guards protect its cutover callers. Inspection does not establish the completeness of external/manual backup or import workflows.

## Strict next gates — no premature closure

1. **R2 hosted data disposition:** ACCEPTED. Both the rehearsal clone and original staging source each had the reviewed 28-row experimental cohort removed, with independent zero-row post-checks. No production/default branch touched.
2. **R2 release/import/restore exclusion:** OPEN. Require a concrete pre-release policy: prohibit restoring precommercial staging fixtures into production, inventory backup/seed/import automation for the actual release topology, demonstrate an independent post-restore `notifications` fixture check and fail closed if unknown precommercial records appear. Do not invent an already deployed control.
3. **Hosted privacy/RLS:** OPEN SEPARATE GATE. Review and stage eight-table RLS migration/roles/grants and zero-policy `notifications` table, then test actual own/foreign/revoked principals, PostgreSQL and mounted HTTP, with rollback. **Do not enable RLS, change login flags or grants merely to turn the dashboard green.**
4. `0052` remains BLOCKED; the parent privacy gate remains OPEN. All P0 counters unchanged at 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, denominator and percentage unverified, release NO-GO, PR #550 still draft/unmerged absent new evidence.

This was a read-only hosted check and source review after the expressly approved staging fixture deletion, plus a GitHub documentation checkpoint. No further Neon SQL mutations, production access, Railway changes, workflow deployment or GitHub merge were performed.
