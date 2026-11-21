# FT-01 — PostgreSQL 18 0052 ownership transfer, actual new-Neon-style account and trusted cleanup

**Date:** 2026-11-09 Baghdad. **Exact executable source SHA:** `046b0286d1d2903c679586ae20177ec2401c0d86`.  
**Final isolation-corrected CI:** [FT-01 canonical clean PostgreSQL 18 run #42581550946](https://github.com/nora953/fawri-production-source/actions/runs/42581550946), [job #129041211865](https://github.com/nora953/fawri-production-source/actions/runs/42581550946/job/129041211865): **COMPLETED SUCCESS**, including all historical isolated/reused checkpoints in the job. **Status: local experimental path proved; canonical hosted 0052 still BLOCKED / no hosted SQL writes.**

## Why this proves a *real* launch issue

The actual **new independent** Neon `crimson-cherry-65705041` / branch `br-holy-waterfall-b993zglb`, PG18 DB `fawri` owner SQL preflight returned `session_user=fawri_owner`, `rolsuper=false`, `rolcreaterole=true`, `rolbypassrls=true`, `rolcreatedb=true`, `rolreplication=true`, and zero user relations / no migration ledger / zero proposed app principals. Original [local 53/53 canonical smoke](https://github.com/nora953/fawri-production-source/actions/runs/42573670077) had used the **CI superuser**, which does not prove Neon-style privilege feasibility.

Original, completely UNCHANGED `lib/db/drizzle/0052_cashier_stream_receipt_storage.sql`, fixed reviewed SHA256 `aaf7ee97fbdef0c1b4600e905216117ee8ff89f31ccd67d783ab61a9c4bd9b8e`, ends with `ALTER FUNCTION public.fawri_sequence_merchant_deleted() OWNER TO fawri_cashier_retirement_owner`. When run as a non-superuser with no SET role privilege, **the canonical migration refuses SQLSTATE 42501 `must be able to SET ROLE...`**. Fawri's existing `lib/db/scripts/lib/isolated-neon-retirement-owner-readiness.mjs` correctly marks such a handoff **`OWNER_HANDOFF_REQUIRES_TRUSTED_SUPERUSER`**. Never bypass this authority gate to declare source/hosted success.

## Essential correction: test the role cluster as genuinely pristine

PostgreSQL roles are **CLUSTER GLOBAL**, shared between databases. Initial exploratory non-superuser tests were run AFTER the CI superuser had migrated `fawri_ci` to 0052, thereby precreating global `fawri_cashier_retirement_owner`. That contamination made a trial `GRANT` fail `permission denied` and made the mere presence of that role **NOT evidence of residue from a failed migration**. The earlier interpretation that its presence alone proved a non-atomic role leak was invalid. A zero Drizzle ledger likewise cannot *by itself* prove complete DDL rollback. These early failures were not accepted as definitive conclusions about a clean target.

The CI now runs the **non-superuser** test **BEFORE any canonical/superuser migration on a completely fresh PostgreSQL18 service**, asserting **zero ledger / zero public tables / zero `fawri_cashier_retirement_owner` role at preimage**. Only then does it create a second disposable database under a `NOSUPERUSER` role with the relevant `fawri_owner`-like attributes. It removes all temporary databases/roles before the original canonical CI superuser sequence and existing 3-LOGIN tests execute.

## Proven local experimental alternative and its unavoidable limitation

Without touching the committed migration/stage hash, an **in-memory temporary migration folder only** added immediately around the ownership handoff:

```sql
GRANT fawri_cashier_retirement_owner TO CURRENT_USER WITH SET TRUE, INHERIT FALSE;
ALTER FUNCTION public.fawri_sequence_merchant_deleted() OWNER TO fawri_cashier_retirement_owner;
REVOKE fawri_cashier_retirement_owner FROM CURRENT_USER;
```

This **did allow all canonical 53 structural migrations** on the fresh PG18 non-superuser role: verified **53 ledger, 97 tables, 69 enums, 82 composite FKs, 10 checked RLS relations, zero notifications**, function owner `fawri_cashier_retirement_owner`, role `NOLOGIN/NOSUPERUSER/NOBYPASSRLS/NOINHERIT`, executor could not `SET ROLE` afterwards.

**However it left exactly ONE automatic `ADMIN=true, SET=false, INHERIT=false` membership from newly created retirement owner back to the non-superuser role creator.** Official [PostgreSQL 18 role attributes](https://www.postgresql.org/docs/current/role-attributes.html) states a non-superuser `CREATEROLE` creator is automatically granted that membership by the bootstrap superuser and **cannot revoke it themselves**. That ADMIN membership is security-relevant, and Fawri's previous explicit **zero-membership** requirement is correct. Merely testing `pg_has_role(...,'SET')=false` misses the residual ADMIN capability.

The test then used the **disposable CI PostgreSQL superuser only** to execute `REVOKE fawri_cashier_retirement_owner FROM <disposable-creator>`, and verified:
- **zero** remaining role memberships of the retirement owner;
- no ability for the non-superuser to `SET ROLE`;
- function owner still the isolated, non-login retirement role;
- no privileged role flags or unexpected schema changes.

Exactly tested logs:
```text
FT01_CANONICAL_0052_NON_SUPERUSER_FAILS_WITH_42501
FT01_NEW_CLEAN_CLUSTER_EXPERIMENTAL_0052_53_MIGRATIONS_PASS
FT01_ONLY_TRUSTED_SUPERUSER_REMOVES_AUTO_ADMIN_MEMBERSHIP_PASS
FT01_ALTERNATIVE_NOT_COMMITTED_NOT_HOSTED_AUTHORIZED
FT01_PG18_REAL_AUTH_AND_OPERATOR_PRELISTENER_SQL_PASS
FT01_PG18_REAL_TENANT_RLS_PRELISTENER_SQL_PASS
FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS
```

**Exact interpretation:** structural/privilege feasibility demonstrated **only** with a trustworthy provider-level elevated cleanup actor. There is **NO evidence** the connected Neon `fawri_owner` can execute that last cleanup; it is not a superuser. The current available Neon connector is still scoped to the OLD project and must not be used as fallback. The work does NOT justify installing alternate SQL on the actual new Neon project or modifying canonical 0052/stage hash in this PR without a separately approved security redesign.

## Finite next gate (no more repeating the same 53 migrations)

1. The reviewer/owner must select one **security-equivalent** resolution: (a) a confirmed **Neon-supported trusted administrator** that can perform/verify the zero-membership owner handoff and rollback under explicitly approved conditions, or (b) a source-reviewed first-commercial-only design of merchant deletion/stream retirement that removes dependence on PostgreSQL owner handoff without granting any permanent BYPASSRLS/owner data access or enabling direct illicit mutations.
2. Test ONLY the chosen implementation against the already prepared **fresh non-superuser PG18** harness, including negative membership/owner/transaction/merchant scopes; source-SHA pin and compare committed 0052 hash, then host under explicit authorization with provider recovery readiness and three distinct runtime logins.
3. Until then **never** execute `0052` against `crimson-cherry-65705041` as `fawri_owner`, omit `0052` while claiming API can start, grant a permanent ADMIN or SET membership to commercial roles, use `fawri_owner` as commercial service login, weaken `assertProductionCashierStreamStorageReady`, deploy or merge.

**Authoritative scope:** `FT-01 actual non-superuser 0052 compatibility` **BLOCKED on hosted trusted owner handoff**; local clean non-superuser experiment plus trusted superuser cleanup **BOUNDED PASS**. `FIELD002 OPEN`, `P0-ACCESS-HOSTED-ROLLOUT BLOCKED`, `0052 HOSTED BLOCKED`, `P0-HOSTED-RECOVERY BLOCKED`, PR #550 DRAFT, commercial NO-GO. **No Neon SQL, roles, snapshot, import, deploy or paid plan change happened.**
