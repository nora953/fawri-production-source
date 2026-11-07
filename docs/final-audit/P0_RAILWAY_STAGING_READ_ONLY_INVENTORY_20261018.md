# P0 Railway staging read-only inventory — 2026-10-18

## Scope and evidence

Read-only Railway connector inspection, project `fawri-staging` (`f1f544d0-19ae-448d-95c3-ea682af98a10`), environment named `production` **inside the staging project** (`e3f66140-5fff-472b-ad63-1c16de59a911`), service `fawri-web` (`8acd3301-0af6-49c0-a457-84a0ed17e18c`). Do not mistake this environment name for an authorized commercial production deployment.

- Service state `live`; deployment status `SUCCESS`, created 2026-10-10T22:22:49.599Z; deployed `main` commit `d38d29229bed0f9575a98e7026e7819fe363bfd4` (verified with Railway deployment metadata). Audit PR #550 commit `7d989bf1057ac8e9534e09f965fe65919603c632` is **not deployed** here.
- No staged Railway configuration patch or staged service changes. Source `nora953/fawri-production-source`, branch `main`.
- Runtime start command: `node --enable-source-maps /app/artifacts/api-server/dist/index.mjs`; health check `/ops/readiness`; one replica in region `sfo`.
- Service variable **names only** indicate `DATABASE_URL`, `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE`, `FAWRI_OPERATIONAL_POSTGRES_AUTHORITY`, `FAWRI_SUBSCRIPTION_POSTGRES_AUTHORITY`, `FAWRI_AUTH_POSTGRES_SESSION_AUTHORITY`, `FAWRI_DEPLOYMENT_MODE`, `NODE_ENV`, etc. No values/secrets were retrieved or stored; their presence alone does **not** prove correct runtime identity, database grants or RLS.

## Release consequences

- The staging service is on older main, not the reviewed P0 billing/migration branch; readiness or deployment SUCCESS cannot certify new provider receipt capabilities.
- The database has **not** been inspected by this Railway inventory. Actual DB `current_user`, schema migration 0028–0033 presence, function owners, FORCE RLS and EXECUTE grants remain unverified in this environment.
- Before hosted acceptance, prepare an approved isolated staging database/branch and reviewed role/grant plan; validate restricted runtime access and tests without exposing credentials. Do not update Railway service source, deploy, run migrations, change variables, or grant permissions without explicit approval.
- Issue #523 and #535 remain open; **P0 NO-GO**. Audit PR #550 CI 25/25 SUCCESS is disposable CI evidence only.
