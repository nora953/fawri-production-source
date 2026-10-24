# P0 Neon role SET eligibility checkpoint — 2026-10-18

Read-only PostgreSQL catalog queries on isolated branch `br-snowy-voice-b1bovtwi` / database `neondb`.

`fawri_staging_runtime`: LOGIN=true, BYPASSRLS=true, SUPERUSER=false. `pg_has_role('fawri_staging_runtime', oid('neon_superuser'), 'SET')` returned true; `neon_superuser` itself is LOGIN=false, BYPASSRLS=true, SUPERUSER=false. This is SET-reachable BYPASSRLS, not PostgreSQL SUPERUSER access.

`fawri_staging_rls_runtime`: LOGIN=false, BYPASSRLS=false, SUPERUSER=false. It cannot SET ROLE to `fawri_staging_runtime` or `neon_superuser` according to this query. It is not a viable direct DATABASE_URL login as currently configured.

Migration journal read-only count 28, contiguous IDs 1–28, 28 distinct timestamps. Audit-branch journal entries 0028–0033 have later timestamps and are not recorded in this clone.

Security implication: do not use or assume `fawri_staging_runtime` is least-privileged. Confirm actual Railway database principal and SET-reachable privileges before deploying any payment or Meta capabilities. No role grants, schema writes, migration, secret access or deployment performed. P0 NO-GO.
