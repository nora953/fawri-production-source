# FAWRI FIELD002 — isolated Neon function-ACL repair rehearsal (REVIEW ONLY)

**State: NOT EXECUTED / explicit approval required.** Date 2026-11-04. This plan is **only** for the pre-existing approved isolated Neon rehearsal branch. It must **never** be executed on original `staging-runtime`, Neon default `production`, or Railway.

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
