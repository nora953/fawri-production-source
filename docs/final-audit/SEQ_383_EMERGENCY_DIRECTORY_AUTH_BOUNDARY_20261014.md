# SEQ-383 — Emergency directory 403 and owner UI boundary (2026-10-14)

Audit-only source contract inspection; **no browser execution or authenticated HTTP proof in this stage**. No application edits, schema changes or live operations.

## Verified code path
- `artifacts/fawri/src/pages/AdminEmergencyAccessPage.tsx:240-277`: `loadAll` requests `/api/auth/admin/emergency-read-access/overview` and `/directory` in parallel. It requires both HTTP responses and JSON `ok` fields to succeed, otherwise sets `loadError` on initial fetch. It does **not** treat a directory 403 as an optional resource. On silent polling failure, existing overview/directory state remains and `loadError` is not set.
- `AdminEmergencyAccessPage.tsx:417-443`: initial error displays generic retry card. `:445` uses `overview.is_owner || overview.authorization?.can_request` to decide whether to display authorized management UI.
- `artifacts/api-server/src/routes/auth-emergency-postgres-routes.ts:87-113`: both routes require secure admin session; directory delegates to `getEmergencyDirectoryPostgres` and overview delegates to `getEmergencyOverviewPostgres`.
- `artifacts/api-server/src/services/postgresEmergencyReadAccessAuthority.ts`, `getEmergencyDirectoryPostgres`: owner bypasses assistant authorization; non-owner requires `activeAuthorization(pool, input.adminId)` and otherwise throws `EMERGENCY_AUTHORIZATION_REQUIRED` HTTP 403. For owner, directory returns assistants plus merchants; for authorized assistant, merchant directory only.

## Correct distinction
- **403 for an unauthorized assistant is intentional authorization enforcement, not an independently confirmed backend defect.** The existing SEQ-366–371 `UIE-012-DENIED` synthetic frontend probe paired `overview.can_request:false` with `directory:200`, whereas real backend may respond directory403. Therefore that probe is **not** real-backend unauthorized-state acceptance.
- A 403 on initial load currently produces generic retry UI rather than a dedicated denied screen. This is a **source-derived UX discrepancy / proof gap**, not a verified security bypass. Owner and authorized assistant flows remain unproven with real PostgreSQL HTTP identity in this stage.
- Silent refresh errors preserve prior UI state. Potential stale authorization after server-side revocation needs controlled HTTP+browser proof, but **do not infer continued server-side mutation access**; server routes must independently enforce authorization. Treat as triage, not confirmed exploit.

## Next isolated acceptance work
1. With disposable PostgreSQL and real admin session middleware, exercise owner 200/200, authorized assistant 200/200, unauthorized assistant overview200/directory403, expired session and revoked authorization; assert status/body and no tenant leakage.
2. With original Vite app in a real browser, replay corresponding status pairs and assert correct initial deny/retry, no owner controls for assistants, behavior after 10-second refresh and recovery; test AR/EN/KU and 390/1280 only if new evidence, not duplicate credit.
3. Validate server rejects mutation after revocation regardless of stale client state. No app fix before comprehensive audit completion.

Existing canonical `EMERGENCY-AUDIT-STATUS-MISREPORT-001` is separate (false healthy audit-chain label) and remains OPEN. No new canonical defect, no newly accepted executed test cases, whole-audit denominator NOT_YET_MEASURABLE, release BLOCKED.
