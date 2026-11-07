# MATRIX-C08 optional-mode route tracing — source checkpoint

Gate remains OPEN; release NO-GO. No runtime test executed.

Verified: `operationalPostgresAuthorityRequired()` is true only for `FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=required`. Both v2 notification routers skip with `next('router')` otherwise. `app.ts` mounts v2 auth first, then the auth compatibility bridge, and later the legacy `/api` router. `indexModulePart1.ts` mounts `authRouter` under `/auth`; `authRoutesPart1.ts` defines legacy GET `/notifications` and PATCH `/notifications/:id/read` using `db.merchant_notifications`. `authCutoverCompatibility.ts` rejects absent secure session for `/api/auth` and rejects combined admin/merchant cookies. `auth.ts` reuses the validated secure merchant context in legacy business routes when present.

Therefore the optional-mode fallback is NOT an unconditional 404: a legacy notification handler exists behind the compatibility bridge. Exact optional-mode HTTP results and data-source/role behavior still need bounded execution evidence; no claim of acceptance. This is materially different from required-mode PostgreSQL tests. FIELD002 per-type extra-key stripping remains UNAPPROVED. Existing source tests and accepted checks remain unchanged.

No application change, no tests run, no closure change. Known register: 29 CLOSED_SOURCE, 7 OPEN, 9 BLOCKED (45 known, incomplete inventory); percentage not accepted.
