# P0 — Read-only hosted PostgreSQL acceptance checklist (2026-10-18)

## Proven facts / limits

- Railway staging project `fawri-staging`, service `fawri-web`, environment named `production` within **staging project**: currently deployed `main` commit `d38d29229bed0f9575a98e7026e7819fe363bfd4` (2026-10-10), not audit PR #550. Railway variables include `DATABASE_URL` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE` **by name only**; no secret values read. See `P0_RAILWAY_STAGING_READ_ONLY_INVENTORY_20261018.md`.
- The Neon connector's `list_projects` operation returned `Tool list_projects not found` in this session. **No hosted SQL was run.** This is a connector capability failure, not proof the database is absent or unhealthy.
- PR #550 commit `7d989bf1057ac8e9534e09f965fe65919603c632`: 25/25 GitHub CI SUCCESS on disposable test infrastructure, not hosted role acceptance.

## SQL probes for approved read-only execution on an explicitly selected isolated staging branch

Never execute these against an unspecified default branch. Identify project, branch, database and role first. These statements are read-only and do not expose credentials or receipt payloads.

```sql
SELECT current_database() AS database_name, current_user AS effective_role, session_user AS login_role;
```

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_catalog.pg_roles
WHERE rolname = current_user OR rolname = session_user OR rolname = 'fawri_staging_rls_runtime'
ORDER BY rolname;
```

```sql
SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
       pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_config,
       pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE') AS current_role_can_execute
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'fawri_admit_verified_payment_receipt',
 'fawri_read_verified_payment_receipts',
 'fawri_review_verified_payment_receipt',
 'fawri_authorize_verified_receipt_replay',
 'fawri_resolve_confirmed_payment_order')
ORDER BY p.proname;
```

```sql
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls,
       pg_catalog.pg_get_userbyid(c.relowner) AS table_owner,
       pg_catalog.has_table_privilege(current_user,c.oid,'SELECT') AS current_role_select
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND c.relname IN ('verified_provider_payment_receipts','saas_billing_orders','cashier_billing_orders')
ORDER BY c.relname;
```

```sql
SELECT to_regprocedure('public.fawri_resolve_confirmed_payment_order(text,text,text,text,integer,text)') IS NOT NULL AS confirmed_resolver_present,
       to_regprocedure('public.fawri_read_verified_payment_receipts(text,integer,timestamp with time zone,text,text,text)') IS NOT NULL AS operator_receipt_read_present;
```

## Acceptance rule

These probes establish metadata only. Independently compare applied migration journal 0028–0033 and function/table ownership with approved rollout design; run isolated restricted-role signed-provider HTTP acceptance and negative grant/FORCE-RLS cases before release. Never treat a privileged owner query as proof of restricted runtime behavior. No hosted writes, migration, role change, deployment, or PR merge without approval. Issues #523/#535 open; **P0 NO-GO**.
