# P0 hosted Neon runtime role — read-only audit (2026-10-19)

Status: **NO-GO / remediation planning required**. This document records read-only observations, not approval to change hosted privileges or deploy.

## Scope and evidence

Neon branch queried: `br-snowy-voice-b1bovtwi`, database `neondb`. Queries ran as `neondb_owner`; this does **not** prove the identity used by the Railway application. Railway project `fawri-staging`, environment `production`, service `fawri-web` has `DATABASE_URL` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE` variable names, but values were redacted by the connector. Railway's last successful deployed source was `main` at `d38d29229bed0f9575a98e7026e7819fe363bfd4`, not audited P0 commit `97b4d7f372b73156728de7794de506872db69998`.

## Observations (read-only)

- `public` has 94 ordinary/partitioned tables; 45 have RLS enabled and zero have `FORCE ROW LEVEL SECURITY` enabled. There are 45 policies on 45 tables.
- Role `fawri_staging_runtime`: `LOGIN=true`, `SUPERUSER=false`, `CREATEDB=true`, `CREATEROLE=true`, `BYPASSRLS=true`, `INHERIT=true`.
- This role owns zero `public` tables. `information_schema.role_table_grants` shows direct SELECT, INSERT, UPDATE, DELETE grants on all 94 tables. It has no TRUNCATE, REFERENCES, or TRIGGER table privilege on these tables.
- Sampled tenant-boundary policies, including cashier billing tables, use `fawri_tenant_or_audited_admin(merchant_id)` for `USING` and `WITH CHECK`. The helper is `SECURITY DEFINER`, owned by `neondb_owner`.
- Drizzle's `drizzle.__drizzle_migrations` latest observed row is `id=28` (hash `87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f`). This does not alone map to a migration filename; reconcile with repository migration journal before declaring a precise migration gap.
- Railway HTTP logs show historical `/ops/readiness` 200 responses on October 15–16, 2026; this is not proof of current readiness.

## Risk / uncertainty

`BYPASSRLS` allows the named role to bypass row-level security. If this role is used by the application, tenant RLS policies do not provide the intended enforcement for that connection. Wide CRUD grants and CREATEDB/CREATEROLE further exceed a typical least-privilege runtime profile. Application-side tenant checks may exist but do not remove the need to verify DB-level boundaries. Actual Railway DB login role remains unverified.

## Safe remediation gates

1. Verify actual application database role without exposing `DATABASE_URL` or credentials (instrument a safe role-name-only readiness diagnostic, or equivalent approved read-only evidence).
2. Reconcile Neon Drizzle journal with checked-in migration journal and identify unapplied migrations; do not apply to hosted Neon yet.
3. Inspect RLS helper implementation and privileged execution paths; classify tables that legitimately require each CRUD privilege.
4. Reproduce expected application flows and cross-tenant negative tests using a *disposable isolated PostgreSQL database* and a least-privilege runtime role without `BYPASSRLS`, `CREATEDB`, or `CREATEROLE`.
5. Prepare explicit, reversible GRANT/REVOKE plan with rollback, verify service and worker compatibility, then request approval before changing hosted role privileges or running migrations.
6. Recheck deployment readiness and CI against the exact commit proposed for release.

**No hosted changes performed. No merge or deployment authorized.**
