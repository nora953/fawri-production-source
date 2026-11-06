# FIELD002 — original staging recovery branch independent readback (2026-11-07, Baghdad time)

## Exact P0 gate and environment
- **Gate:** FIELD002 (original hosted staging 8-table privacy RLS, runtime least-privilege ACL/roles, migration 0028–0051 and recovery protection); independent 0052 remains BLOCKED.
- **GitHub inspected:** Draft PR #550, `fix/p0-provider-receipt-order-discovery-20261015`, pre-checkpoint HEAD `a7345cf879eed19565e0e8379d1cfeafe0050220`. Reuses successful clean-clone actual SQL/HTTP 7/7 evidence; this is a **different, nonproduction original-staging recovery prerequisite**.
- **Neon project:** `round-fire-18493605`, database `neondb`; never selected or queried the default production branch.
- **Original nonprimary branch:** `staging-runtime`, `br-falling-dust-b1km4gix`.
- **Pinned recovery copy:** `field002-staging-runtime-recovery-20261107`, `br-green-dawn-b137nxps`, parent `br-falling-dust-b1km4gix`, parent LSN `0/4724160`, parent timestamp `2026-11-06T21:35:07Z` UTC. Neon `get_branch` reported **READY**.
- `list_snapshots` was empty and `create_snapshot` returned `not allowed to snapshot non-root branch`. Thus this is **a Neon branch copy, not a Neon snapshot**, not a portable external backup or an independently validated PITR/failover restore.

## Executed hosted checks, no source/data writes
A temporary **read-only** PostgreSQL compute (`ep-long-bird-b1gzdxh6`) was attached only to the new recovery branch for independent `SELECT` reads; it was **deleted after verification** and `list_branch_computes` returned `[]`. The recovery branch remains READY with no compute to conserve resources. The original connection was untouched.

On the original and recovery copy, each of the following six datasets matched in both row counts **and** deterministic MD5-of-serialized-row aggregate comparison. The hashes are equality checks for this bounded dataset, not tamper-proof certified offsite backup checksums. No row values, passwords, merchant IDs, or connection strings were exported.

| Dataset | Original count | Recovery count | Both aggregate digests |
| --- | ---: | ---: | --- |
| `drizzle.__drizzle_migrations` | 28 | 28 | `de7234e024765c7866f20cb1f8847a5b` |
| `public.notifications` | 0 | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `public.merchants` | 1 | 1 | `afc4c4db286e75b8c3ce6275881db20e` |
| `public.audit_events` | 283 | 283 | `e16acc0bbfc30fe325f957c35912ced2` |
| `pg_policies` (`public`) | 45 | 45 | `26b4b692bee51df96f873cc5838b3051` |
| `pg_roles` (`fawri_%`, selected flags) | 2 | 2 | `3c665da7dd5d2f3055f250ec03a38158` |

Independent SQL read on original:
- Correct **Drizzle** ledger (not `public.migration_runs`) is **28/53** (last ID 28). No migration was applied on the original.
- Exactly **0/8** reviewed critical residual privacy tables currently have active RLS or a matching policy: `audit_events`, `manual_reply_requests`, `merchant_admin_notes`, `merchant_channel_overrides`, `merchant_deletion_requests`, `notifications`, `order_drafts`, `processed_channel_events`. The other **45** public tables with RLS and **45** policies **do not cover these eight**. This is a specific original-staging gap, not a contradiction.
- The existing legacy role `fawri_staging_runtime` has **LOGIN + BYPASSRLS + CREATEROLE + CREATEDB**, and cannot be the approved tenant runtime. `fawri_staging_rls_runtime` remains **NOLOGIN** and lacks BYPASSRLS, CREATEROLE and CREATEDB.
- Exactly **two** creator-default EXECUTE grants in the `public` schema from `neondb_owner` to those two roles remain unsafe until separately authorized ACL repair.
- The default `PUBLIC` principal had no SELECT/INSERT/UPDATE/DELETE on five sampled merchant-sensitive tables (`notifications`, `order_drafts`, `orders`, `messages`, `merchants`); this does **not** certify all login grants or deployed app isolation.

## Acceptance, boundaries and next step
- **New verified prerequisite:** recovery branch **exists, is READY, is readable under a separate read-only compute, and matches six independent sampled original datasets/role/policy fingerprints**; the temporary compute was removed.
- **NOT yet accepted:** actual restore-to-target drill, full-database/role/grant completeness, portable backup/restore, original staging 0028–0051 controlled rollout, original runtime tenant SQL/HTTP matrix, least-privilege LOGIN/identity cutover, source-admitted first-commercial deployment, archived branch quarantine enforcement, or 0052.
- **Safety rule:** do not automatically reset/restore original, apply migrations, modify privileged roles or grants, merge PR, run production/default SQL or deploy. Recovery branch is **data-bearing** and explicitly inadmissible as the first-commercial launch source under approved FIELD002-R2 policy. This copy should not be deleted until recovery disposition is approved.
- **Next named condition:** prepare and independently review exact original-staging ACL/role repair + guarded migration 0028–0051 and rollback plan against the verified 28-entry baseline; obtain explicit original-target approval before any mutating hosted action. Do not rerun the already-accepted clean-clone 7/7 SQL/HTTP proof without regression.

**Gate status remains FIELD002 OPEN, privacy parent OPEN, 0052 BLOCKED, PR #550 Draft / unmerged, commercial release NO-GO; known P0 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, overall completion percentage uncertified.** Documentation of this new prerequisite alone does not close a P0 row.
