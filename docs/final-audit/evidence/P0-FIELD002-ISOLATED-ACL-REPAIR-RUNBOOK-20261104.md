# FAWRI FIELD002 — isolated Neon function-ACL repair rehearsal

**State: EXECUTED ON AUTHORIZED ISOLATED CLONE; FIELD002 OPEN.** Historical proposal follows; execution evidence and remaining gates are below. Date 2026-11-04. This plan is **only** for the pre-existing approved isolated Neon rehearsal branch. It must **never** be executed on original `staging-runtime`, Neon default `production`, or Railway.

## Exact scope

| Guard | Expected isolated value |
|---|---|
| Neon project | `round-fire-18493605` (Fawri-Staging) |
| Branch ID passed explicitly to connector | `br-young-hill-b1x9vhlz` (rehearsal clone) |
| Original data-bearing branch, read-only after test | `br-falling-dust-b1km4gix` |
| Drizzle applied migrations | **52**, last `0051`; `0052` NOT applied |
| Existing sensitive functions | Exactly the 0038 directory issuer and 0039 authentication marker |
| Unsafe explicit EXECUTE grants | **4**: each of the two functions granted to each of two legacy runtime roles |
| Unsafe creator default EXECUTE grants | **2** under `neondb_owner` in `public` schema |
| Baseline historical data | **28** notifications; **283** audit events |
| Expected after repair | No `PUBLIC` or named legacy runtime EXECUTE on either trusted function; zero unsafe default creator grants; all historical rows/migrations unchanged |

The **read-only proof** is committed at `evidence/sql/P0-FIELD002-TRUSTED-FUNCTION-ACL-READONLY-ACCEPTANCE-20261104.sql`, executed verbatim on both original and clone. Original: 2/2 functions absent, 2 unsafe defaults. Clone: 2/2 functions present, both fail trusted ACL acceptance.

## Preconditions — require explicit owner approval before even cloning the transaction

- Confirm in the Neon tool invocation `project_id=round-fire-18493605` and `branch_id=br-young-hill-b1x9vhlz`; **never omit branch_id**.
- Recheck last migration hash against committed journal, migration row count **52**, both function identities/owners, the exact two role names, and current membership/EXECUTE proof.
- No active operational service is expected to depend on the isolated clone; if evidence disagrees, **abort without any grants changed**.
- All statements must execute as **one atomic transaction** on the clone, not separate autocommitted commands. Failure to reach all postconditions causes the connector transaction to roll back. Do not persist secrets, IDs or raw database rows in GitHub.
- The rehearsal is scoped to **authorization privileges only**. It does not enable LOGIN, bypass RLS, restart services, deploy migrations, resolve `0052` or change user data.

## Proposed exact mutation (NOT EXECUTED)

Use the Neon transaction capability on the isolated clone **after explicit permission**:

```sql
-- Precheck in the SAME transaction; replace magic values only after verifying
-- clone against recorded migration journal. Abort on drift.
DO $$
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 52
    OR (SELECT count(*) FROM public.notifications) <> 28
    OR (SELECT count(*) FROM public.audit_events) <> 283
    OR to_regprocedure('public.fawri_authentication_runtime()') IS NULL
    OR to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)') IS NULL
  THEN
    RAISE EXCEPTION 'isolated rehearsal baseline mismatch';
  END IF;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM fawri_staging_rls_runtime, fawri_staging_runtime;

REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime()
  FROM fawri_staging_rls_runtime, fawri_staging_runtime;

REVOKE EXECUTE ON FUNCTION
  public.fawri_issue_admin_directory_audit(text,text,text)
  FROM fawri_staging_rls_runtime, fawri_staging_runtime;

-- Fail the entire transaction if any old role can still activate either marker
-- through direct, inherited, or PUBLIC function privileges.
DO $$
BEGIN
  IF EXISTS (
     SELECT 1 FROM pg_roles r
      WHERE r.rolname IN ('fawri_staging_rls_runtime','fawri_staging_runtime')
        AND (
          has_function_privilege(r.oid,'public.fawri_authentication_runtime()'::regprocedure,'EXECUTE')
          OR has_function_privilege(r.oid,'public.fawri_issue_admin_directory_audit(text,text,text)'::regprocedure,'EXECUTE')
        )
  ) OR EXISTS (
     SELECT 1 FROM pg_default_acl d
     CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
      WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='neondb_owner')
        AND d.defaclobjtype='f'
        AND (d.defaclnamespace=0 OR d.defaclnamespace='public'::regnamespace)
        AND acl.privilege_type='EXECUTE' AND acl.grantee<>d.defaclrole
  )
  THEN
    RAISE EXCEPTION 'FIELD002 trusted ACL remediation postconditions failed';
  END IF;
END $$;
```

**Execution nuance:** `run_sql_transaction` accepts individual SQL statements as separate array elements and provides its own transaction; do not add manual `BEGIN/COMMIT` statements. The `DO $$...$$` blocks above are each a single SQL statement despite interior semicolons. If required invariants fail, the whole transaction must roll back.

## Independent post-transaction checks, no original mutation

1. Re-fetch and execute the **exact** committed read-only acceptance SQL on the clone: **2/2 `post_migration_acl_pass=true`**, `legacy_runtime_execute=[]`, `public_execute=false`, **0** nonowner default EXECUTE grants.
2. Recheck Drizzle applied 52, notifications 28, audit events 283, all 8 residual RLS and policies still enabled; compare baseline row fingerprints to original. Confirm no tenant login/role flag change.
3. On the **original** branch, verify 28 migrations, 28 notifications, 283 audit events and unchanged role/default ACL facts. Do not execute writes against original.
4. Re-run source preflight/negative tests, and separately obtain authorized same-tenant positive, foreign-tenant negative and revoked-auth proof before considering FIELD002-R2 acceptance. **0052 remains independently blocked**.
5. If pre-commit failure occurs, rely on atomic transaction rollback. If a later clone-only reset is needed, perform an owner-approved fresh isolated branch rehearsal rather than restoring unsafe grants into a live original branch.

This runbook is an **isolated rehearsal proposal only**. It is not an approved production or original-staging migration plan; independent rollout, backup and downtime controls are required before original staging changes. **P0 FIELD002 OPEN, 0052 BLOCKED, launch NO-GO.**

## Execution result — 2026-11-04 (explicitly authorized clone only)

**ISOLATED ACL REPAIR VERIFIED; FIELD002 OPEN; NO-GO.** Observed at 2026-11-04T16:50:36.893Z.
Reviewed exact source `93fd3bc001b4cc6c1a8eea2a2041ca3261da6d78`, Draft PR #550. The user explicitly authorized the EXECUTE repair on `br-young-hill-b1x9vhlz` only. The proposal above is retained as history; its “not executed” wording is superseded by this result.

### Safety and rollback actually verified

- Neon branch metadata matched project `round-fire-18493605`, child `br-young-hill-b1x9vhlz`, parent `br-falling-dust-b1km4gix`, default=false, primary=false. Catalog precheck found no other client connection at observation and again inside the transaction.
- 52 ledger records; latest timestamp `1791936000023`; last hash `1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea` matched exact committed 0051 bytes and journal. Local source materialization verified **66/66 exact Git blob SHA matches**.
- Both exact function identities were owned by `neondb_owner`; four named direct EXECUTE grants and two public-schema creator default grants matched the proposal. Named runtime role flags and memberships were captured before execution.
- Executed the guarded repair transaction plus a final deliberately raised `FIELD002_EXPECTED_ROLLBACK_PROBE`. It failed as intended. Independent committed acceptance SELECT confirmed all four function grants and two default grants were restored. This verifies atomic rollback; it is an expected injected failure, not an unresolved repair failure.
- Then executed the same five-statement guarded repair **without** the injected failure. All statements committed atomically. No manual BEGIN/COMMIT inside the connector transaction.
- Strengthened the proposal guards: exact ledger hash/timestamp, function owners, exact grant counts, database/effective/session owner, absence of other clients. Postcondition also traversed roles reachable through SET/INHERIT membership edges and checked PUBLIC ACLs. No grants beyond the approved four function/two default entries were changed.

### Independent before/after acceptance

The **exact committed** `sql/P0-FIELD002-TRUSTED-FUNCTION-ACL-READONLY-ACCEPTANCE-20261104.sql` was executed before, after rollback probe, and after committed repair on the clone; separately before/after on original using read-only SELECT.

| Check | Clone before | Clone after |
|---|---:|---:|
| Trusted functions present | 2 | 2 |
| Named unsafe function EXECUTE entries | 4 | 0 |
| PUBLIC function EXECUTE entries | 0 | 0 |
| Nonowner creator default EXECUTE entries | 2 | 0 |
| post_migration_acl_pass | 0/2 | **2/2** |
| SET/INHERIT reachable role entries checked | 14 | 14 |
| Reachable entries able to EXECUTE either trusted function | 3 | **0** |

All eight table row counts and deterministic row fingerprints matched before/after and matched original data fingerprints. Counts: audit_events=283, notifications=28, merchant_channel_overrides=2, merchant_deletion_requests=1; other four tables=0. Ledger fingerprint unchanged; clone still 52 migrations. All eight RLS flags/policy counts and policy-expression fingerprints unchanged. Complete catalog role-flag and membership fingerprints unchanged. No LOGIN/BYPASSRLS/CREATEROLE/role membership change. The independent original snapshot (including ledger, data, RLS, role flags and memberships) and original ACL result were byte-for-byte equivalent before/after: original still 28 migrations, both trusted functions absent and two creator default grants present.

### Source verification executed

Command: `node --test lib/db/scripts/tests/isolated-neon-migration-static.test.mjs` on the 66 byte-verified source files from the exact reviewed SHA, Node v24.22.1. **18 passed / 0 failed / 0 skipped / 0 cancelled before and after**. No source fix or test assertion changed.
The committed pure preflight evaluator was also run with the actual before/after catalog rows: before `APPLIED_TRUSTED_FUNCTION_RUNTIME_EXECUTE_LEAK`, after `APPLIED_TRUSTED_FUNCTION_ACLS_SCOPED`. The default-ACL evaluator accepted zero observed nonowner defaults. These are actual local evaluator executions over hosted catalog evidence; **not** a claim that the complete live Node preflight CLI or application HTTP ran. Exact reviewed documentation HEAD had zero Actions runs at this check; no fresh full-CI claim is made.

### Acceptance boundary / next action

This closes only the **isolated existing/default EXECUTE ACL prerequisite**. It does not close FIELD002-R2, FIELD002, either parent privacy gate, or 0052. Previously accepted source and bounded runtime evidence is reused within its original scope.

- **OPEN:** real authenticated own-tenant success, foreign-tenant denial and revoked-auth denial with the actual two-principal authority path, in SQL plus mounted application HTTP on the clone. No synthetic success is inferred from catalog state, RLS presence, or SET ROLE.
- **OPEN:** FIELD002-R1 compatibility and R3 producer-scope decisions remain separate; no blanket response stripping or policy adopted.
- **BLOCKED:** 0052 trusted owner bootstrap remains unmet; retirement owner/0052 stream table absent. The legacy login still has BYPASSRLS/CREATEROLE and `neon_superuser` reachability. It remains unsuitable as tenant authority despite losing these EXECUTE grants.
- **Next:** prepare/use a role-accurate two-session harness on the clone for own/foreign/revoked SQL and mounted HTTP; no activation or new persistent runtime/issuer grants under this ACL-only approval. Original rollout/backup/restore requires a separate reviewed authorization.
- No Railway invocation, original/production mutation, deployment or merge. P0 known register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**; inventory incomplete, overall percentage **unknown/null**, release **NO-GO**.

### Exact successful transaction (connector array, five statements)

```sql
DO $guard$ BEGIN
IF current_database()<>'neondb' OR current_user<>'neondb_owner' OR session_user<>'neondb_owner'
OR (SELECT count(*) FROM drizzle.__drizzle_migrations)<>52
OR (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1)<>'1773f8314f11c832a1c03453204af2896b204b80695066ebc06cded7b11e62ea'
OR (SELECT max(created_at) FROM drizzle.__drizzle_migrations)<>1791936000023
OR (SELECT count(*) FROM public.notifications)<>28 OR (SELECT count(*) FROM public.audit_events)<>283
OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('fawri_staging_rls_runtime','fawri_staging_runtime'))<>2
OR (SELECT count(*) FROM pg_proc WHERE oid IN (to_regprocedure('public.fawri_authentication_runtime()'),to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)')) AND proowner=(SELECT oid FROM pg_roles WHERE rolname='neondb_owner'))<>2
OR (SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee WHERE p.oid IN (to_regprocedure('public.fawri_authentication_runtime()'),to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)')) AND r.rolname IN ('fawri_staging_rls_runtime','fawri_staging_runtime') AND a.privilege_type='EXECUTE')<>4
OR (SELECT count(*) FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a JOIN pg_roles r ON r.oid=a.grantee WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='neondb_owner') AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='f' AND r.rolname IN ('fawri_staging_rls_runtime','fawri_staging_runtime') AND a.privilege_type='EXECUTE')<>2
OR EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend')
THEN RAISE EXCEPTION 'isolated rehearsal baseline mismatch'; END IF;
END $guard$;

ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM fawri_staging_rls_runtime, fawri_staging_runtime;

REVOKE EXECUTE ON FUNCTION public.fawri_authentication_runtime() FROM fawri_staging_rls_runtime, fawri_staging_runtime;

REVOKE EXECUTE ON FUNCTION public.fawri_issue_admin_directory_audit(text,text,text) FROM fawri_staging_rls_runtime, fawri_staging_runtime;

DO $guard$ BEGIN
IF EXISTS(WITH RECURSIVE reach AS (SELECT oid AS target,ARRAY[oid] AS path FROM pg_roles WHERE rolname IN ('fawri_staging_rls_runtime','fawri_staging_runtime') UNION ALL SELECT m.roleid,x.path||m.roleid FROM reach x JOIN pg_auth_members m ON m.member=x.target WHERE (m.set_option OR m.inherit_option) AND NOT m.roleid=ANY(x.path)) SELECT 1 FROM reach WHERE has_function_privilege(target,'public.fawri_authentication_runtime()','EXECUTE') OR has_function_privilege(target,'public.fawri_issue_admin_directory_audit(text,text,text)','EXECUTE'))
OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN (to_regprocedure('public.fawri_authentication_runtime()'),to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)')) AND a.grantee=0 AND a.privilege_type='EXECUTE')
OR EXISTS(SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname='neondb_owner') AND d.defaclobjtype='f' AND (d.defaclnamespace=0 OR d.defaclnamespace='public'::regnamespace) AND a.privilege_type='EXECUTE' AND a.grantee<>d.defaclrole)
THEN RAISE EXCEPTION 'FIELD002 trusted ACL remediation postconditions failed'; END IF;
END $guard$;
```

Machine-readable checkpoint: `P0-CLOSURE-REGISTER.json#closurePlan.currentField002IsolatedAclRepair20261104`. No customer row contents, identifiers, passwords or connection strings are recorded here.
