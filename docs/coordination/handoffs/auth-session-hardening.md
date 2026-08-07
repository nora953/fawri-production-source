# Lane handoff — auth-session-hardening

## Identity

- Repository: `nora953/fawri-production-source`
- Branch: `parallel/auth-session-hardening`
- Coordination base / starting remote SHA: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Final remote SHA: recorded in the delivery message because a commit cannot contain its own SHA.
- Worker: `GPT-5.6 Thinking — auth/session/admin security lane`

## Scope completed

Implemented an isolated auth/session/admin security layer:

- account identity is projected separately from merchant/admin profiles and every lookup requires the expected account kind;
- separate merchant and admin login endpoints/cookies;
- opaque server-side sessions with HMAC token fingerprints, idle and absolute expiry, session-ID rotation, immediate logout/logout-all/per-session revocation, session caps, and account security versions;
- trusted admin devices with owner approval/revocation, device-bound sessions, and a two-device cap;
- OTP challenge IDs, HMAC-only persistence, single use, replay/supersession/expiry/attempt protection, resend and target/IP throttling, and delivery rollback;
- generic password-reset responses that do not expose account existence;
- randomized `scrypt` password hashes and successful-login migration of legacy SHA-256/plaintext values;
- server-side role, permission, tenant, and pending/suspended/rejected merchant controls;
- owner-only assistant-admin creation/status/permission/password/session/device actions and forced replacement of temporary passwords;
- sanitized login/sensitive-event audit records; no password, OTP, token, cookie, secret, or hash values are logged;
- fail-closed behavior when the security store is malformed;
- focused tests and security/cutover documentation.

**Integration state:** the secure router is not mounted because `routes/index.ts` is outside this lane. Legacy auth remains active until the coordinator completes the shared cutover below. This branch must not be deployed alone or described as production-active.

## Files changed

- `artifacts/api-server/src/middleware/authSession.ts`
- `artifacts/api-server/src/routes/auth-security.ts`
- `artifacts/api-server/src/routes/authRouteCommon.ts`
- `artifacts/api-server/src/routes/authLoginRouteSupport.ts`
- `artifacts/api-server/src/routes/authPasswordRouteSupport.ts`
- `artifacts/api-server/src/routes/authPublicRoutes.ts`
- `artifacts/api-server/src/routes/authSessionRoutes.ts`
- `artifacts/api-server/src/routes/authAdminRoutes.ts`
- `artifacts/api-server/src/services/authAccountRepository.ts`
- `artifacts/api-server/src/services/authPolicy.ts`
- `artifacts/api-server/src/services/authOtpDelivery.ts`
- `artifacts/api-server/src/services/passwordService.ts`
- `artifacts/api-server/src/services/authSecurityTypes.ts`
- `artifacts/api-server/src/services/authSecurityDataStore.ts`
- `artifacts/api-server/src/services/authSessionSecurity.ts`
- `artifacts/api-server/src/services/authDeviceSecurity.ts`
- `artifacts/api-server/src/services/authOtpSecurity.ts`
- `artifacts/api-server/src/services/authSecurityStore.ts`
- `artifacts/api-server/tests/auth-account-repository.test.ts`
- `artifacts/api-server/tests/auth-password-service.test.ts`
- `artifacts/api-server/tests/auth-policy.test.ts`
- `artifacts/api-server/tests/auth-security-store.test.ts`
- `docs/security/auth-session-hardening.md`
- `docs/coordination/handoffs/auth-session-hardening.md`

No forbidden file was modified: no `app.ts`, `index.ts`, package/lockfile, workflow, `lib/db/**`, frontend, Meta, queue, orders, settings, other branch, or `main` change.

## Behavior and security boundaries

- Merchant/admin credentials are never interchangeable. Current account kind, enabled state, role, permissions, tenant, session version, expiry, revocation, and trusted-device state are re-read server-side.
- Pending merchants may use `/me`, session/password security, onboarding, and support only. Operational APIs fail with `MERCHANT_OPERATIONAL_ACCESS_PENDING`. Suspended/rejected merchants fail closed.
- Tenant identity comes from the authenticated merchant profile; a different supplied tenant is rejected with `CROSS_TENANT_ACCESS_FORBIDDEN`.
- Rotation creates a new token/session ID and revokes the predecessor while preserving absolute expiry. Revocation is checked on the next request.
- The transitional JSON store uses mode `0600`, atomic rename, bounded retention, and refuses to reset corrupt state. It is single-process only; PostgreSQL transactions are mandatory before multi-instance production.

## Tests and checks

### TypeScript static check

- Command: `npx tsc -p tsconfig.json`
- Result: exit `0`, no diagnostics.
- Environment: isolated Node.js `v22.16.0`, TypeScript `5.8.3`; temporary uncommitted Express declarations and unchanged `dataPaths.ts` copy were used because the full dependency tree was unavailable.

### Focused security suite

- Command: `NODE_ENV=test FAWRI_PASSWORD_SALT=test-password-salt node --experimental-specifier-resolution=node --loader /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/esm.mjs --test artifacts/api-server/tests/auth-*.test.ts`
- Result: `15` passed, `0` failed, `0` skipped; `2.546s`.
- Covered: account/profile separation, cross-login denial, security-version persistence, scrypt/legacy migration, password policy, pending and suspended/rejected access, cross-tenant denial, assistant escalation/unknown permission denial, generic reset response, expired/revoked/rotated/wrong-role/stolen-device sessions, logout-all, trusted-device revoke/cap, OTP supersession/replay/single-use/lock/flooding, login flooding, audit redaction, and corrupt-store fail-closed.
- Ephemeral log: `/tmp/fawri-auth-final-test.log` (not committed).

### Not executed

- Full repository build or existing HTTP integration suite: complete dependencies/router mount unavailable and package/shared route files were forbidden.
- Real WhatsApp delivery, real PostgreSQL migrations/concurrency, browser E2E, and real customer data: not executed.

## Shared integration requests

1. **Mount secure router:** in `artifacts/api-server/src/routes/index.ts`, import `authSecurityRouter` from `./auth-security` and mount `router.use("/auth", authSecurityRouter)` before legacy `authRouter`.
2. **Atomic guard cutover:** change protected merchant/admin routes to import secure middleware/context from `middleware/authSession.ts`; derive tenant from `res.locals.auth`, not request input. Replace legacy admin bearer guards, including SSE/reconnect checks.
3. **Remove duplicates in the same release:** remove/disable legacy signup, OTP, combined login, merchant/admin session/logout, reset/change-password, `/me`, trusted-device, and assistant-admin management endpoints. Do not expose old and new auth systems concurrently.
4. **Frontend cutover:** admin uses `/api/auth/admin/login`, stable `X-Fawri-Device-Id`, cookies/credentials, and no stored bearer token; handle device approval, forced password change, generic recovery, rotation, and logout-all.
5. **Deletion hook:** account deletion must revoke/delete sessions, devices, active OTPs, login-attempt target records, and anonymize audit references under retention policy.

Required proof after integration: secure cookies only; no legacy bearer/cookie accepted; pending allowlist and operational denial; same-tenant success/cross-tenant denial; assistant denied owner/escalation targets; session/device/permission/password revocation effective on next request; duplicate legacy endpoints unavailable.

No `app.ts` or package change is required by this implementation.

## Database/schema requests

PostgreSQL lane/coordinator must implement transactional equivalents before production scale:

- `auth_accounts`: normalized unique phone, password hash, account kind, enabled/OTP state, monotonic session version;
- exclusive `merchant_profiles` and `admin_profiles`, with tenant composite constraints, role/permission checks, forced-password flag, and one enabled owner constraint;
- `auth_sessions`: unique token hash, account/kind/tenant/version/device, idle/absolute expiry, revoke reason/timestamp, replacement FK and account/expiry indexes;
- `auth_trusted_devices`: unique account/device hash and serializable enforcement of max two trusted devices;
- `auth_otp_challenges`: target/code/IP hashes, purpose, expiry, attempts, used/revoked state and one-active-challenge transaction;
- bounded `auth_login_attempts` and sanitized `auth_audit_events` with retention/anonymization policy.

Migration order: create constraints; abort on duplicate phones/ambiguous roles; backfill one account plus exactly one profile; copy security versions; invalidate all legacy sessions rather than migrate them; switch repository atomically; validate counts/constraints; then remove legacy identity/profile fields. Session issue/rotation/revoke-all, OTP verify, reset, permission/device changes require DB transactions and row locking/serializable semantics.

## Workflow requests

After shared integration, add a merge-blocking backend security job for auth/session/admin source/tests/docs, route mount, and DB migrations. Run repository-native typecheck/build, focused tests, HTTP abuse/integration tests, and PostgreSQL migration/concurrency tests. No `continue-on-error`; bounded 15-minute timeout; artifacts must be sanitized.

## Known risks and deferred work

- Critical: secure router is not mounted and legacy auth remains active until the atomic coordinator cutover.
- Transitional JSON state is not safe for horizontal scaling.
- Identity/profile separation is currently repository projection, not DB constraints.
- Admin bearer clients must change atomically; bearer fallback would bypass revocation.
- `FAWRI_OWNER_BOOTSTRAP_DEVICE_ID` is temporary and must be removed after initial owner-device bootstrap.
- Legacy passwords remain readable only for first successful rehash; report remaining legacy counts without identifiers/hashes.
- Full HTTP/browser/PostgreSQL tests are merge blockers after integration.

## Rollback
Before cutover, revert this lane and any coordinator mount commit. After cutover, never restore legacy cookies/bearer tokens; pause new login issuance, preserve session/audit rows, force global reauthentication if rollback is required, and retain PostgreSQL security history. Secret rotation intentionally invalidates all sessions.

## External systems and real data
- Real database contacted: `no`
- Replit Agent used: `no`
- Real Meta/WhatsApp API called: `no`
- Real customer data used: `no — synthetic fixtures only`
- Credentials accessed: `no`

## Ready for coordinator review
- [x] Remote HEAD rechecked before final push.
- [x] No force push.
- [x] No forbidden file modified.
- [x] Actual tests/checks documented.
- [x] Shared integration/schema/workflow requests explicit.
- [x] No secrets/customer payloads in commits or artifacts.
- [x] Branch not merged into `main`.
