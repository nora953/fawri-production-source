# MATRIX-C08 notification mode guard checkpoint

Date: 2026-11-04. Gate remains OPEN; NO-GO.

Source verified on working branch:
- `operationalPostgresAuthorityRequired()` returns true only when `FAWRI_OPERATIONAL_POSTGRES_AUTHORITY` equals `required`.
- `auth-security.ts` registers `merchantNotificationsPgRouter` before `supportPostgresRoutes`, under the `/api/auth` mount in `app.ts`.
- Both notification routers use `postgresOnly`, which calls `next('router')` when the mode is not required.
- Existing PostgreSQL-required HTTP tests cover privacy, tenant isolation, read/replay, and producer fields. They do not prove optional-mode final HTTP status.

Consequence: optional-mode requests bypass both inspected notification routers. Do not claim an HTTP 404 without inspecting all later route registrations and middleware. Do not change FIELD002 extension policy or weaken existing assertions. Next: inspect remaining route/fallback and test coverage for optional-mode status; add only a genuinely missing bounded test.

This checkpoint is source-only: no test execution, no application change, no gate closure. Known register 29 CLOSED_SOURCE, 7 OPEN, 9 BLOCKED; denominator incomplete, percentage unknown.

## Optional-mode fallthrough source classification — 2026-11-04

The earlier optional-mode *HTTP outcome unknown* is now source-reconciled, without claiming an executed HTTP test:

1. `FAWRI_OPERATIONAL_POSTGRES_AUTHORITY !== 'required'` makes both PostgreSQL notifications routers call `next('router')`. Both routes skip the request; they do not return HTTP 404 themselves.
2. `app.ts` subsequently mounts `enforceAuthCutoverCompatibility` and the remaining legacy business router via `app.use('/api', router)` **after** the `enforceLegacyAuthProductionCutoverGate` middleware. That guard calls `next()` for nonrequired mode and returns 410 for unresolved `/api/auth` requests in required mode.
3. `indexModulePart1.ts` mounts `authRouter` at `/auth` (under `/api`). `auth.ts` imports the assembled `authRuntime`/auth routes. `authRoutesPart1.ts` explicitly registers `GET /notifications` and `PATCH /notifications/:id/read`, backed by `db.merchant_notifications` and a `merchant_id` filter. These are legacy JSON compatibility handlers, not canonical PostgreSQL. The global bridge validates secure v2 sessions before reaching this fallback and rejects mixed sessions; this source ordering does not prove full optional-mode runtime authorization and storage isolation.
4. Therefore the optional-mode source predicts **legacy route selection** for those two endpoints, not automatic 404 and not canonical PostgreSQL data. The type/extension compatibility is mode-dependent. In required mode, the earlier canonical SQL projection evidence remains the accepted HTTP authority; unreachable fallthrough fails closed with 410.

This resolves the previously unclassified **source routing** question only. Optional-mode actual HTTP/legacy storage behavior remains separately untested by this checkpoint, and is not commercial required-mode FIELD002 acceptance. No new test or code change was justified by a presumed 404; no unsafe mode change, policy, hosted access, fallback promotion or old producer activation. MATRIX-C08 and FIELD002 remain OPEN; known register 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED; NO-GO.

Exact current source blobs: `app.ts` `0c1968089cf7211f9e8e60f9f506d9784ccb9b22`; `indexModulePart1.ts` `7083e4a5038dfa8f9b9586a490ae272b119c17fb`; `authRoutesPart1.ts` `9fb113d4938fb138e96f913cea367e7859048b5c`; `auth.ts` `61958ff03a7412661783c9e0210b94ba00ae10cb`; `legacyProductionFallbackGuard.ts` `5da7b9fd813d11b258b2270aa0353500f90e0283`.
