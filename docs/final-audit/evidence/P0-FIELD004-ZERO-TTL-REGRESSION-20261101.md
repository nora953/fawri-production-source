# FIELD004 — Zero-TTL legacy draft regression (2026-11-01)

- Scope: GitHub-only, bounded offline migration planner; no hosted migration, no source-file mutation, no database connection.
- Source fix: `496caeb60321f7ede9bcc0557bc449a0b63264c0` in `scripts/lib/postgresql-migration-plan-complete.mjs` rejects `expires_at <= created_at` (including equal instants), consistent with the PostgreSQL `order_drafts_time_check` requirement `expires_at > created_at`.
- Regression: `dd88c898da9e7b9ca95328557f860b70bc786bf8` in `scripts/tests/plan-postgresql-migration.test.mjs` checks equal creation/update/expiry timestamps and asserts rejection, unchanged source files, `writes_performed: false`, and `database_connection_used: false`.
- GitHub Actions: `Complete migration safety` succeeded on `dd88c898`, run `41276676504`. At last observation, 31 of 59 workflow runs succeeded, 16 in progress, 12 queued; full CI acceptance is **pending**.
- No assertion of hosted acceptance or historical TTL recovery. FIELD004 **OPEN**, F004-R2 **BLOCKED**, release **NO-GO**.
