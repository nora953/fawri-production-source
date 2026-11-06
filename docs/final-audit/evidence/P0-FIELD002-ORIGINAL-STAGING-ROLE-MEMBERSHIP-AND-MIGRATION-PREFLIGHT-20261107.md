# FIELD002 — original staging role/migration admission preflight (2026-11-07)

**Bounded result: FAIL-CLOSED / original rollout NOT authorized.** This is a direct read-only catalog verification on Neon project `round-fire-18493605`, branch `br-falling-dust-b1km4gix` (`staging-runtime`), database `neondb`. No schema, role, data, credential, workflow or production changes were performed.

## Independently verified hosted facts
- Correct `drizzle.__drizzle_migrations` ledger: **28 entries, IDs 1–28**. This is distinct from `public.migration_runs` and must not be confused with it. Source branch has 53 indexed migration stages; 0052 remains separately BLOCKED.
- Eight explicitly scoped residual tables exist, but **each has `relrowsecurity=false`, `relforcerowsecurity=false`, and zero policies**: `audit_events`, `manual_reply_requests`, `merchant_admin_notes`, `merchant_channel_overrides`, `merchant_deletion_requests`, `notifications`, `order_drafts`, `processed_channel_events`. The 45 RLS-enabled other public tables do not close this gap.
- `fawri_staging_runtime`: `LOGIN=true`, `BYPASSRLS=true`, `CREATEROLE=true`, `CREATEDB=true`, `INHERIT=true`; **0 owned public relations**, **2 direct memberships**. Membership catalog names **`neon_superuser` with `inherit_option=true`, `set_option=true`**, and `fawri_staging_rls_runtime` with `inherit_option=false`, `set_option=true`; neither has admin_option. This legacy identity must not be deemed a tenant-safe login.
- `fawri_staging_rls_runtime`: `NOLOGIN`, `NOBYPASSRLS`, `NOCREATEROLE`, `NOCREATEDB`, `NOINHERIT`, 0 owned public relations, 0 direct memberships. It is *not* yet a deployable runtime identity.
- Creator `neondb_owner` has current `public` schema **default function EXECUTE grants** to **both** `fawri_staging_runtime` and `fawri_staging_rls_runtime`. These are the two already known unsafe defaults; SQL source preflight rejects migration while they remain.
- Snapshot of `pg_stat_activity` on this branch returned **zero other client backends**, at the instant sampled. This does **not** establish that external systems cannot reconnect or that Railway credentials are safely cut over.
- Previous checkpoint's `field002-staging-runtime-recovery-20261107` branch `br-green-dawn-b137nxps` was independently confirmed READY. Existing saved evidence verifies bounded source-copy readback, **not** off-site backup/PITR or a restore-to-target rehearsal.

## Exact next gate to execute (only after safety approval)
1. Pin immutable code/SQL digests and source ledger; ensure rollback/recovery drill and client-isolation window, not merely an available data-bearing clone.
2. Rehearse only the reviewed **minimal two creator-default EXECUTE revocations** and unchanged indexed **0028–0051** migrations against a **fresh disposable copy of the cleaned original**; check source hashes and atomic failure/recovery.
3. Independently revalidate 8/8 policies and DENY pathways, default function ACL, and a new restricted LOGIN without bypass, create-role or privileged membership reachability.
4. Only with specific original-target approval, carry out controlled original staging change and live mounted HTTP/SQL tenant parity. Do not run 0052, restore/promote data-bearing clones to first-commercial, merge, or deploy.

**FIELD002 OPEN / original staging NO-GO / 0052 BLOCKED / PR #550 remains draft.** No P0 gate closure or certified overall percent is claimed by this preflight.