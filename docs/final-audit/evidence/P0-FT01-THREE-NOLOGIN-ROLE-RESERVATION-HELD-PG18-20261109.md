# FT-01 — exact new-target three NOLOGIN role reservation DDL, HELD; local positive/negative proof

**Recorded:** 2026-11-09 (Baghdad). **Exact executable SHA:** `15ee7b4e9441ac759d4e1741a1876cb24594bfcb`. 
**CI:** [FT-01 disposable PostgreSQL18 workflow #42573670077](https://github.com/nora953/fawri-production-source/actions/runs/42573670077) **COMPLETED SUCCESS**; [job #129016500404](https://github.com/nora953/fawri-production-source/actions/runs/42573670077/job/129016500404) **SUCCESS**.

## What this closes (source/local only)

[Held SQL](sql/P0-FT01-NEW-NEON-THREE-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql) is a **transactional, first-run-only, independently guarded WRITE proposal**. It targets only database name `fawri`, PostgreSQL18, authenticated/current `fawri_owner` with `CREATEROLE`, no existing application user relations, no Drizzle ledger, and none of the three exact expected names already existing. **SQL does not attest hosted provider project or branch ID**; a separate Neon project/branch identity and owner-approved source SHA are required before any hosted execution. It creates only:

- `fawri_restricted_runtime`
- `fawri_auth_issuer`
- `fawri_operator_issuer`

Each is `NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`, with **no PASSWORD, no GRANT, no inherited membership, no data change, no owner privilege**. Any failed SQL preimage, DDL, or postimage causes PostgreSQL transaction rollback; the SQL intentionally refuses reruns rather than silently altering previously created roles.

## Exactly what was actually executed

Local-only `lib/db/scripts/ft01-disposable-nologin-role-reservation.mjs` is hard-fenced to a `GITHUB_ACTIONS` job for `nora953/fawri-production-source`, disposable PostgreSQL18 **127.0.0.1:5432/fawri_ci**, with a dedicated opt-in test flag and previous canonical 53-migration ledger. It **never takes a hosted endpoint**.

The job creates a SECOND disposable local database literally called `fawri`, an ephemeral independent `fawri_owner` matching relevant observed new Neon attributes (`CREATEROLE`, `BYPASSRLS`, `CREATEDB`, `REPLICATION`, non-superuser), and actually connects as that owner to execute the exact held SQL. It verifies the three role identities exist and have no LOGIN/privileged/inheritance flags, checks no outbound memberships, and proves two **negative** cases: second execution fails with `FT01_NEW_TARGET_PREIMAGE_CHANGED`, and execution through wrong local database fails with `FT01_WRONG_NEW_TARGET_OR_ROLE`. It drops all three roles, the disposable `fawri` database, and temporary owner. No project secrets, DB snapshots, or customer data copied.

**Exact CI log:** `FT01_THREE_NOLOGIN_HELD_NEW_TARGET_SQL_LOCAL_POSITIVE_NEGATIVE_PASS` and `FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS`. Same job also accepted actual three-LOGIN constrained runtime SQL probes and the four named operator directory/receipt/review/replay function permissions with no cross-role EXECUTE.

## Important limitation, no commercial privilege claim

The new Neon project `crimson-cherry-65705041` branch `br-holy-waterfall-b993zglb` DB `fawri` PG18 is previously proven empty by owner-run read-only SQL, with `fawri_owner` `CREATEROLE=true`, `BYPASSRLS=true`. **None of this DDL has been executed on Neon**, and testing PostgreSQL18 locally does not guarantee all Neon provider rules accept these role commands.

Three NOLOGIN names reserved != three commercially ready credentialed LOGINs. This SQL deliberately makes no application grants and cannot support the API. Separate, complete per-operation least privilege, credential issuance and vault custody, role/owner RLS admission, 0052 hosted rollout, real merchant SQL+HTTP negatives, source pin, authenticated exact new-host compute and provider PITR/backup are **OPEN**.

**Required before an actual new-target write:** independently attested provider project+branch+compute identity; exact SHA; explicit scoped owner permission for the named SQL; provider recovery/snapshot/rollback proven or approved; evidence of source journal/0052 decision. Existing Neon connector is pinned to OLD `round-fire-18493605`; cannot be used as fallback. Do not copy historical staging data.

**Current gate state:** FT-01 `NOLOGIN` transactional held SQL is **reviewable and locally tested**, not an executed hosted step; `P0-ACCESS-HOSTED-IDENTITY` BLOCKED, `P0-ACCESS-HOSTED-ROLLOUT` BLOCKED, `FIELD002` OPEN, 0052 HOSTED BLOCKED, Draft PR #550, commercial NO-GO.
