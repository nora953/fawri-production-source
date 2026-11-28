# FT-01 — actual production prelistener SQL admission on three real PG18 logins

**Date:** 2026-11-09, Baghdad.  
**Exact CI source SHA:** `81800878e0ea03964c7da23bf2cb4881a7cf4e57`.  
**Workflow:** [FT-01 clean PostgreSQL 18 canonical rehearsal #42532331704](https://github.com/nora953/fawri-production-source/actions/runs/42532331704) — **COMPLETED SUCCESS**.  
**Job:** [fresh-canonical-schema #128889040316](https://github.com/nora953/fawri-production-source/actions/runs/42532331704/job/128889040316) — **COMPLETED SUCCESS**, no failed steps.

## Narrowly accepted — reusable, exact code path

Existing launch fast-track FT-01 has already accepted the owner-created standalone Neon project `crimson-cherry-65705041`, branch `br-holy-waterfall-b993zglb`, DB `fawri` PG18, and the owner's full read-only result with 0 user relations/no Drizzle ledger. Historical staging/Neon clones are not data sources. Separately, existing CI proved canonical clean 53 migrations/97 tables/69 enums/82 composite FKs, local 10 table RLS baseline, and three independently authenticated limited demo roles. **No repeat from zero was necessary.**

This batch calls the actual functions imported from the **production API source**, instead of only custom catalog checks:

- `assertProductionAuthenticationDatabaseReady` under a real dedicated local auth LOGIN.
- `assertProductionOperatorDatabaseReady` under a second dedicated local operator LOGIN.
- `assertProductionDatabaseRlsReady` under a third dedicated local tenant LOGIN with the actual SQL predicate/owner/ACL/issuer checks.
- Cross-wiring tenant as auth and auth as operator must **reject** with sanitized expected error codes, not silently reuse the incorrect authority.

Actual runner `artifacts/api-server/tests/ft01-disposable-production-startup-pg18.ts` receives random in-memory credentials only from `lib/db/scripts/ft01-disposable-three-login-rehearsal.mjs` running on GitHub Actions. It verifies repository ID, explicit local flag, three exact loopback PostgreSQL18 `fawri_ci` URLs; it **never** starts API, Meta providers, HTTP listener or live jobs. Ephemeral role setup and cleanup remain in the enclosing isolated PG18 runner. No data/credentials printed.

**Exact log markers on successful #42532331704 job:**

```text
FT01_LOCAL_PG18_53_MIGRATIONS_10_RLS_STORAGE_PASS
FT01_READONLY_NEW_NEON_ROLE_PREFLIGHT_LOCAL_REJECTION_PASS
FT01_PG18_REAL_AUTH_AND_OPERATOR_PRELISTENER_SQL_PASS
FT01_PG18_REAL_TENANT_RLS_PRELISTENER_SQL_PASS
FT01_PG18_CROSSED_LOGIN_PRELISTENER_DENIAL_PASS
FT01_PG18_THREE_INDEPENDENT_AUTHENTICATED_NONPRIVILEGED_LOGINS_PASS
FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS
```

This additionally **executed** the owner-ready **SELECT-only** Neon role creation feasibility query `docs/final-audit/evidence/sql/P0-FT01-NEW-NEON-ROLE-ADMIN-CAPABILITY-READONLY-20261109.sql` against the intentionally *wrong* local database and verified its exact fail-closed decision `WRONG_DATABASE_OR_ROLE_REFUSE`. The query has a separate guard that refuses unexpected user-schema relations even if there is no Drizzle ledger. The query has **not** been run against actual Neon; only an owner-confirmed new-project UI session or a separately reconnected Neon app could do that.

## Does NOT establish full commercial role/hosted release readiness

- The disposable role grants were intentionally **representative**, not a complete per-route SQL CRUD inventory. Successful prelistener SQL admission alone does not show actual merchant orders, refunds, cashier financial sync or HTTP actors work under production grants.
- No externally verified Neon endpoint host, role-creation privilege, role/password custody, three permanent least-privilege LOGINs, hosted schema or RLS/HTTP test has been produced. This run has **not** modified the empty new target.
- Canonical `0052` is required for local production startup source readiness but remains **HOSTED BLOCKED** without independently approved new-target write/migration and complete device protocol/recovery evidence.
- The connected Neon app is pinned to historical project `round-fire-18493605`; NEVER omit the project ID or repoint it silently. No provider changes, no old staging writes/imports, no paid provision, no merge/deployment.

**Scope status:** reusable actual prelistener admission with 3 independent local SQL sessions **PASS**; first-commercial hosted `FIELD002` **OPEN**, `0052` hosted **BLOCKED**, PR #550 **DRAFT**, release **NO-GO**. Next real dependency is owner-run reviewed role-admin read-only SQL on the **new project**, or explicit reauthorization of the Neon connector for that exact project, followed by separately scoped migration permission/backup/complete SQL grants.
