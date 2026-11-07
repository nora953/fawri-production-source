# P0 FIELD002 — fresh original Neon recovery baseline and consumer isolation preflight

Date: **2026-11-07**. **Original staging remains UNMODIFIED / commercial NO-GO.** This checkpoint does not constitute authorization to change schema, legacy roles, service credentials, secrets, deployment or migration 0052.

## Pinned resources / approved preparation scope

- GitHub: `nora953/fawri-production-source` draft PR **#550**, source branch `fix/p0-provider-receipt-order-discovery-20261015`, pre-checkpoint HEAD `0954db3a37d3ee006cc414c1836b2b6ee4dfa523`.
- Neon project `round-fire-18493605`, database `neondb`.
- **Original staging source — NEVER implicitly target default branch**: `staging-runtime`, ID `br-falling-dust-b1km4gix` (nonprimary, parent is default production `br-shiny-lab-b1vxj4wn`).
- **NEW independent recovery copy**: `field002-original-pre-rollout-recovery-20261107-final`, ID `br-royal-fog-b1v7pdmr`, direct parent exactly `br-falling-dust-b1km4gix`, parent LSN **`0/492E628`**, Neon created **2026-11-07 17:38:41 UTC**, branch state READY, `primary=false`, `default=false`.
- Before the new branch the project had 9 branches; the new branch brings it to 10. **Do not delete the frozen recovery copy, the new recovery branch or existing isolated 8/8 accepted clone to make room without a separate approved retention decision.** The initial attempt to set a custom compute suspend interval was rejected by Neon account restrictions (HTTP 412), and created no branch; the retry with Neon default compute configuration succeeded. No changes to the original's compute configuration or other branches.

## Direct, independently replicated data comparison — source versus new recovery

A **read-only union SELECT** computed count and deterministic hash over the canonical `to_jsonb(row)::text` value of each row of **all 95 existing user-data relations** (94 `public`, 1 `drizzle.__drizzle_migrations`), with per-row MD5 digests sorted before the final hash. The exact same query was executed on **each pinned branch**, then compared in memory without copying or logging any row contents:

- Original table names **95/95** identical to recovery; **zero missing/mismatched relation names**.
- **95/95 table row counts match and 95/95 data digests match**; **437 total rows** across both, **23 nonempty** relations, **72 empty**.
- `drizzle.__drizzle_migrations` has **28** records; this original snapshot is intentionally **pre-0028–0051**, not the accepted 52-migration clone.
- `public.audit_events` **283** rows; `public.notifications` **0** rows; the merchant fixtures are preserved, not erased.
- One `drizzle.__drizzle_migrations_id_seq` sequence independently compared via `pg_sequences` including `last_value=28`, start/step/cache/cycle; all values match across original and backup.

A second independent read-only catalog fingerprint compares normalized SQL catalog rows (MD5 of sorted rows), **all 9 categories matched without mismatch**:

| Catalog category | Objects compared | Source = new backup? |
|---|---:|---|
| Relations and ACL/RLS flags | 96 | YES |
| SQL function identities, definitions, owners and ACLs | 3 | YES |
| RLS policies | 45 | YES |
| Creator default ACL records | 3 | YES |
| Reviewed auth/legacy roles and flags | 4 | YES |
| Role memberships | 4 | YES |
| Index definitions | 343 | YES |
| Constraints | 1538 | YES |
| Noninternal triggers | 1 | YES |

**Scope limitation:** matching hashes attest the state at read time and the copy's provenance. This is *not* an off-site encrypted backup, PITR guarantee or restore of the **new** copy into a disposable target. A previous separate native Neon restore-to-child drill succeeded from the older frozen branch `br-empty-mud-b1it6mg9`, but do not misrepresent that as a full restore test of `br-royal-fog-b1v7pdmr`. The source may change later; before original writes check drift again.

## Original hosted safety blockers — independently re-read

- Original `staging-runtime` **28** Drizzle records versus isolated clean clone's **52**; pending indexed SQL **0028–0051 (24 files)** was previously rehearsed on a separate original-derived disposable clone with immutable source-hash proof; do not run unapproved 0052.
- Original **0/8** residual privacy RLS tables enabled; isolated accepted clean clone **8/8** after migrations.
- `fawri_staging_runtime`: `rolcanlogin=true`, `rolbypassrls=true`, `rolcreaterole=true`, `rolcreatedb=true`, `rolinherit=true`, **2 inherited/settable memberships**; cannot be reused as tenant runtime.
- `fawri_staging_rls_runtime` has no inherited privileges but **NOLOGIN**, and prior audit found broad direct table DML grants; do not flip LOGIN without revoking and re-reviewing.
- `neondb_owner` and `neon_superuser` have high-privilege role flags; never use these as tenant, auth or operator identities.
- `pg_default_acl` contains precisely **two** owner-created `public` default function EXECUTE grants directed to `fawri_staging_runtime` and `fawri_staging_rls_runtime`. These require narrow, separately approved remediation *before* the source migrations that install trusted functions.
- Single original `pg_stat_activity` read returned **0** other client backends; absence at one instant does not prevent reconnects.

## Railway consumer discovery — read-only, no value/secret retrieval

Railway project `fawri-staging` (`f1f544d0-19ae-448d-95c3-ea682af98a10`), environment `production` (`e3f66140-5fff-472b-ad63-1c16de59a911`):

- Service `fawri-web` (`8acd3301-0af6-49c0-a457-84a0ed17e18c`) is configured from **`main`**, build uses `Dockerfile.staging`, and has `DATABASE_URL` listed. It has **neither `FAWRI_AUTH_DATABASE_URL` nor `FAWRI_OPERATOR_DATABASE_URL`** configured by name. The connector exposes variable **names only**, so *cannot establish the actual Neon endpoint or authenticated login from `DATABASE_URL`*.
- `fawri-web` **Offline**, no active deployments/replicas in a fresh `environment_status` check; prior `describe_service` latest deployment `FAILED`; historical recent deployments reported REMOVED. No production service config or secret changed.
- `fawri-p0-validation` likewise **Offline**, no active deployments. Railway environment reported an older `REMOVING` deployment pending application and a staged patch with no changes; **do not claim the environment's pending queue is settled**. Neither was modified.
- An idle/zero `pg_stat_activity` sample plus Railway offline is encouraging but **not a positive guarantee that external clients, jobs or other credential holders cannot reconnect during original migration**. Explicit maintenance/isolation control and recheck are required.

## Accepted and nonaccepted gates

**CLOSED:** a newer recoverable direct child branch created from original; independent full 95-relation 437-row equality + 9 catalog families + sequence equality. Hosted clean clone **3-LOGIN SQL+HTTP 8/8 PASS**, independent baseline restoration PASS, documented separately in `P0-FIELD002-THREE-LOGIN-HOSTED-SQL-HTTP-ACCEPTANCE-RUN5-20261107.md`.

**NOT CLOSED:** exact original-client connection-target and reconnect isolation, actual newly pinned recovery branch restoration to another target, safe new permanent three LOGINs with stored credentials, minimal original ACL revocation, original 0028–0051 source-pinned transactions and postflight 8/8 policies, original mounted SQL/HTTP, commercial import/restore/archive source gates, separate 0052 owner/bootstrap.

**Controlled next operation requiring explicit target-specific approval**:
1. Owner approves a **maintenance window and exclusive original staging** `br-falling-dust-b1km4gix` schema and role change (not the default Neon production branch), with rollback `br-royal-fog-b1v7pdmr`. Inventory other consumers/credentials and prevent reconnection; clear unrelated Railway pending operations before deployment.
2. Under a pinned source SHA, verify before-write Drizzle **28**/last 0027 hash, no real merchants or unexpected notices, 2 expected legacy public function default EXECUTEs, all 8 residual RLS currently disabled, role ACL/membership facts, no active foreign clients and backup fingerprint before any change. **Fail closed on drift**.
3. Only then apply atomic, narrow `ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS` from the exact two historical identities (as rehearsed, NOT blanket privilege or role revocation), verify zero remaining unsafe defaults, then execute exact immutable **0028–0051** SQL files in order with Drizzle ledger hashes and checksums; 0052 forbidden.
4. Provision **three new** least-privilege permanent LOGINs and reviewed GRANTs (not reused legacy, owner, or test NOLOGIN roles). Secret values must be generated and stored in approved secret manager without being printed into chat/GitHub.
5. Deploy only after SQL admission gates pass and build/start service source is pinned; validate real original-target SQL and mounted HTTP own/foreign/revoked cases, function private OID guards, 8/8 policy definitions, and rollback.
6. Keep draft PR #550 unmerged and commercial release **NO-GO** until all residual release gates independently pass.

**NO ORIGINAL SQL WRITE / NO RAILWAY ALTERATION / NO DEFAULT PRODUCTION BRANCH CHANGE** occurred during this checkpoint.
