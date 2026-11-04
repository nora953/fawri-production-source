# FAWRI P0 FIELD002 — PostgreSQL role-admin reachability regression (2026-11-04)

## Scope and identified source defect

Working PR #550, source branch `fix/p0-provider-receipt-order-discovery-20261015`. This is an additional privacy/authorization hardening change, **not** FIELD002 closure and **not** a hosted database migration.

- The existing app readiness and production RLS readiness queried session `SUPERUSER` and `BYPASSRLS` paths but omitted **activatable `CREATEROLE` roles** from `pg_has_role(..., 'SET')` and `pg_has_role(..., 'USAGE')` membership inspection. The production RLS readiness also omitted `rolcreaterole` on the effective `current_user`. A restricted login able to `SET ROLE` to an admin `CREATEROLE` role could pass the respective checks even though it can obtain role-administration authority.
- Both SQL readiness inventories now include `rolcreaterole`, and both require **effective role `rolcreaterole=false`**, with absent or malformed evidence rejected rather than defaulting to safe.
- Fail-closed priority remains compatible for a direct login with `CREATEROLE=true`: `PRODUCTION_DATABASE_SESSION_CREATEROLE_FORBIDDEN` fires before the effective-role rule. The new effective-role-only case uses `PRODUCTION_DATABASE_RUNTIME_CREATEROLE_FORBIDDEN`. No privilege is granted in application code; the checks remain SELECT-only.

## Executable source changes

- `artifacts/api-server/src/observability/runtime.ts`: effective-role `rolcreaterole` guard; broadened `USAGE`/`SET` privileged role matching to include `CREATEROLE` (source commit `f25bd5bb`).
- `artifacts/api-server/src/services/postgresRuntimeRlsSecurity.ts`: effective-role `rolcreaterole` inventory and fail-closed rejection, and privileged reachability checks including `CREATEROLE`; preserved previous direct-login error priority (source commits `8253d6b8`, `b3c5f02b`).
- `artifacts/api-server/tests/postgres-runtime-role-readiness.test.ts`: current-role `CREATEROLE` and missing evidence rejected (`8613dccd`).
- `artifacts/api-server/tests/production-postgres-rls-security.test.ts`: production effective role rejection + malformed evidence + SQL coverage for both `USAGE` and `SET` paths (`ca4b0ae9`).
- `artifacts/api-server/tests/observability-mounted.integration.test.mjs`: **actual disposable PostgreSQL 16** integration. The app runs against a restricted LOGIN, then the fixture creates a `NOLOGIN CREATEROLE` role and grants `SET TRUE / INHERIT FALSE` to that login. The test verifies PostgreSQL membership is actionable, but `/ops/readiness` responds **503 / not_ready** and `postgresql_authority` is DOWN; role grant is revoked and the disposable role is dropped in cleanup (`a0c50137`). This is not a hosted app or production credential test.

## CI evidence / errors corrected

- Initial CI for commit `a0c50137`: [Foundation integration final gate #41807955386](https://github.com/nora953/fawri-production-source/actions/runs/41807955386) failed a **previous error-code expectation**: a direct `CREATEROLE` login was rejected by the new *effective-role* check before the existing *session-role* check. The rejection **was enforced**, but the existing contract expected `PRODUCTION_DATABASE_SESSION_CREATEROLE_FORBIDDEN`. Source `b3c5f02b` restored priority while retaining both hardening conditions. Do not count the initial failed run as success.
- On corrected commit `b3c5f02b4787516fb9a533d9e286072a8f08cd1c`: [Observability mounted routes #41808369232](https://github.com/nora953/fawri-production-source/actions/runs/41808369232) **SUCCESS**; job `126501131863` explicitly passed *"real readiness rejects a login that can SET ROLE into CREATEROLE"*. [Merchant access security #41808368416](https://github.com/nora953/fawri-production-source/actions/runs/41808368416) **SUCCESS**; [P0 notification privacy HTTP matrix #41808368821](https://github.com/nora953/fawri-production-source/actions/runs/41808368821) **SUCCESS**; [Global Merchant PostgreSQL HTTP Journey #41808369330](https://github.com/nora953/fawri-production-source/actions/runs/41808369330) **SUCCESS**. Full 59-workflow CI **not yet confirmed complete as of this checkpoint**; check the commit runs before claiming it.

## Read-only hosted clone evidence and remaining gates

- **Isolated clone only**: Neon branch `br-young-hill-b1x9vhlz`, parent `staging-runtime` / `br-falling-dust-b1km4gix`. The existing staging login `fawri_staging_runtime` in the clone was actually connected via Neon SELECT and yielded `rolbypassrls=true`, `rolcreaterole=true`, `session_can_set_privileged=true`, and `session_inherits_privileged=true`. This is a confirmed unsafe **database role configuration**; it does **not** establish that the deployed Railway app uses that credential (values are redacted).
- No schema/data/role changes on the original staging branch. Final read-only counts: **original 28 Drizzle migrations, 28 notifications, 283 audit events; clone 52 migrations, 28 notifications, 283 audit events**, temporary proof roles 0, private transaction scopes 0.
- **0052 remains BLOCKED**, requiring correctly preprovisioned zero-member `fawri_cashier_retirement_owner` and a trusted ownership handoff; prior fail-closed preflight source/tests remain intact. **FIELD002 remains OPEN**, full same-merchant positive / foreign-merchant denial / session revocation against live service and verified deployed runtime login still needed. Canonical known P0 register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**, full denominator unknown, release **NO-GO**.

The role-membership rationale is covered by PostgreSQL 16 official documentation on [GRANT](https://www.postgresql.org/docs/16/sql-grant.html) and [role membership](https://www.postgresql.org/docs/16/role-membership.html): `CREATEROLE` is not inherited like ordinary object privileges, but can become active through a `SET TRUE` membership chain.
