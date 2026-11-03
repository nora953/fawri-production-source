# MATRIX-C08 notification mode guard checkpoint

Date: 2026-11-04. Gate remains OPEN; NO-GO.

Source verified on working branch:
- `operationalPostgresAuthorityRequired()` returns true only when `FAWRI_OPERATIONAL_POSTGRES_AUTHORITY` equals `required`.
- `auth-security.ts` registers `merchantNotificationsPgRouter` before `supportPostgresRoutes`, under the `/api/auth` mount in `app.ts`.
- Both notification routers use `postgresOnly`, which calls `next('router')` when the mode is not required.
- Existing PostgreSQL-required HTTP tests cover privacy, tenant isolation, read/replay, and producer fields. They do not prove optional-mode final HTTP status.

Consequence: optional-mode requests bypass both inspected notification routers. Do not claim an HTTP 404 without inspecting all later route registrations and middleware. Do not change FIELD002 extension policy or weaken existing assertions. Next: inspect remaining route/fallback and test coverage for optional-mode status; add only a genuinely missing bounded test.

This checkpoint is source-only: no test execution, no application change, no gate closure. Known register 29 CLOSED_SOURCE, 7 OPEN, 9 BLOCKED; denominator incomplete, percentage unknown.
