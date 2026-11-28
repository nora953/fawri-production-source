# MATRIX-C08 — notification route precedence source checkpoint (2026-11-04)

Gate: P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX (OPEN). Scope: source-only classification; not a runtime/hosted acceptance or policy approval.

## Verified source

- `artifacts/api-server/src/routes/auth-security.ts` registers `merchantNotificationsPgRouter` **before** `supportPostgresRoutes`. Both declare `GET /notifications` and `PATCH /notifications/:id/read` on their respective routers.
- `artifacts/api-server/src/routes/merchant-notifications-pg.ts` applies `postgresOnly` and `requireSecureMerchantSession`; its list endpoint clamps requested limit to 1..50 and sends `Cache-Control: no-store`. The later support router uses the same canonical list/read services, but a different limit fallback and response header behavior.
- `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts` projects canonical identity/read state while preserving stored non-reserved variable keys. Inspection lifecycle is enriched from tenant-owned SQL before response.
- `artifacts/fawri/src/hooks/useMerchantNotifications.ts` counts returned unread rows without validating each notification record; the typed merchant notification client validates known shapes but tolerates additional keys.

## Precise limits and next work

Registration order is verified; effective runtime behavior also depends on `postgresOnly`, route mount, required-mode guards and fallthrough. Do **not** claim that every deployment always reaches the first router without real-router assertions. Existing FIELD002-R1 per-type removal of extra response fields remains UNAPPROVED; it would change retained extension behavior, so do not silently implement it. Next: reconcile route-guard semantics and existing full-app tests, then prove the exact required positive/negative/fault cases. Reuse accepted evidence rather than rerunning unchanged suites.

No code change, tests or CI in this source-review checkpoint. No gate closure. Known register: 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED; complete inventory false; P0 percentage unknown; release NO-GO.
