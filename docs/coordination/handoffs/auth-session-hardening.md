# Lane handoff — auth-session-hardening

## Identity

- Repository: `nora953/fawri-production-source`
- Branch: `parallel/auth-session-hardening`
- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Final remote SHA: recorded in the delivery message because a commit cannot contain its own SHA.
- Scope owner: auth/session/admin security lane.

## Scope completed

Implemented an isolated auth/session/admin hardening layer without mounting it into shared bootstrap files:

- account identity separated from merchant/admin profile projection;
- separate merchant/admin login endpoints and cookies;
- server-side opaque sessions with HMAC fingerprints, idle/absolute expiry, rotation, logout/logout-all, per-session revocation, caps, and security versions;
- trusted admin devices with owner trust/revoke and a two-device cap;
- OTP replay/supersession/expiry/attempt/flood protection;
- generic password-reset responses that avoid account enumeration;
- randomized scrypt password storage for the new auth flow, with successful-login migration support for legacy SHA-256/plaintext values;
- server-side role, tenant, permission, and merchant lifecycle enforcement;
- owner-only assistant-admin management and forced temporary-password replacement;
- sanitized security audit records;
- focused tests and cutover documentation.

**Integration state:** `routes/index.ts` is outside this lane, so the secure router is intentionally not mounted here. Legacy auth remains active until the integration coordinator performs the atomic cutover. This branch must not be deployed alone as if the new auth path were production-active.

## Final allowlisted files

- `artifacts/api-server/src/middleware/authSession.ts`
- `artifacts/api-server/src/routes/auth-security.ts`
- `artifacts/api-server/src/routes/auth-admin-routes.ts`
- `artifacts/api-server/src/routes/auth-login-route-support.ts`
- `artifacts/api-server/src/routes/auth-password-route-support.ts`
- `artifacts/api-server/src/routes/auth-public-routes.ts`
- `artifacts/api-server/src/routes/auth-route-common.ts`
- `artifacts/api-server/src/routes/auth-session-routes.ts`
- `artifacts/api-server/src/services/authAccountRepository.ts`
- `artifacts/api-server/src/services/authPolicy.ts`
- `artifacts/api-server/src/services/authOtpDelivery.ts`
- `artifacts/api-server/src/services/authPasswordService.ts`
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
- `docs/security-auth-session-hardening.md`
- `docs/coordination/handoffs/auth-session-hardening.md`

### Legacy `passwordService.ts`

`artifacts/api-server/src/services/passwordService.ts` is **not modified by this lane in the final base-to-head diff**. It is restored byte-for-byte to the coordination-base blob `82e9cf02cf719dcf89b2152511dd58141a271855`. The scrypt hardening previously placed there was moved into the lane-owned `artifacts/api-server/src/services/authPasswordService.ts`, and all new auth routes/tests import that service instead.

No shared contract change is required in the legacy password service for this isolated implementation. If the coordinator later wants legacy endpoints to use the new password service, that must happen explicitly during the atomic auth cutover rather than through this lane.

No forbidden file is modified: no `app.ts`, `routes/index.ts`, package/lockfile, workflow, `lib/db/**`, frontend, Meta/queue/orders/settings file, other branch, `main`, or `hardening/postgresql-foundation` change.

## Behavior/security boundaries

- Merchant/admin credentials and sessions are not interchangeable.
- Pending merchants are limited to auth security, onboarding, `/me`, and support; operational APIs are denied.
- Suspended/rejected merchants fail closed.
- Tenant identity is server-derived and cross-tenant input is rejected.
- Assistant admins cannot target owner-admin accounts or grant synthetic permissions.
- Password/permission/device/account security changes revoke sessions server-side.
- OTPs are single-use and rate limited; reset request shape is generic.
- Audit sanitization removes password/OTP/token/secret/hash/cookie/authorization keys.

## Tests and checks — final naming correction

### TypeScript static check

- Command: `npx tsc -p tsconfig.json`
- Result: exit `0`, no TypeScript diagnostics.
- Environment: isolated Node.js `v22.16.0`, TypeScript `5.8.3`, using a temporary local tsconfig/type-root setup only; no package or repository config file was committed.

### Focused auth security suite

- Command: `NODE_ENV=test FAWRI_PASSWORD_SALT=test-password-salt node --experimental-specifier-resolution=node --loader /opt/nvm/versions/node/v22.16.0/lib/node_modules/ts-node/esm.mjs --test artifacts/api-server/tests/auth-*.test.ts`
- Result: `15` passed, `0` failed, `0` skipped; approximately `3.27s`.
- Coverage includes account/profile separation, merchant/admin cross-login denial, session-version persistence, scrypt/legacy migration, password policy, pending/suspended/rejected access, cross-tenant denial, assistant escalation denial, generic reset responses, expired/revoked/rotated/wrong-role/stolen-device sessions, logout-all, trusted-device revocation/cap, OTP replay/supersession/single-use/lock/flood controls, login flooding, audit redaction, and corrupt-store fail-closed behavior.

### Rename/import static checks

- All route files owned by the lane use the required `auth-*.ts` naming convention.
- `auth-security.ts` imports `./auth-public-routes`, `./auth-session-routes`, and `./auth-admin-routes`.
- Internal route imports use `./auth-route-common`, `./auth-login-route-support`, and `./auth-password-route-support`.
- New auth password imports use `../services/authPasswordService`.
- The focused password test imports `../src/services/authPasswordService`.
- Old camel-case route filenames and `docs/security/auth-session-hardening.md` are removed from the candidate tree.
- Final base-to-head comparison is required before push to prove no out-of-allowlist path remains.

### Not executed

- Full mounted HTTP integration/browser suite, because shared router mounting is intentionally outside this lane.
- Real WhatsApp OTP delivery, PostgreSQL migrations/concurrency, Replit Agent, real customer data, or external credentials.

## Shared integration requests

1. In `artifacts/api-server/src/routes/index.ts`, import the secure router from `./auth-security` and mount it at `/auth` before legacy auth during the atomic cutover.
2. Cut protected merchant/admin routes to `middleware/authSession.ts` and server-derived tenant context; remove legacy admin bearer-token authorization including reconnect/SSE paths.
3. Disable duplicate legacy signup/OTP/login/logout/session/reset/change-password/device/admin-management endpoints in the same release. Never expose old and new auth systems concurrently.
4. Update the admin frontend to `/api/auth/admin/login`, cookie credentials, stable `X-Fawri-Device-Id`, device approval, forced password change, generic recovery, rotation, and logout-all.
5. Add account-deletion security cleanup/anonymization hooks.

## PostgreSQL/schema requests

Before horizontal production scale, implement transactional equivalents for `auth_accounts`, exclusive merchant/admin profiles, `auth_sessions`, `auth_trusted_devices`, `auth_otp_challenges`, bounded login attempts, and sanitized audit events. Migration must abort on duplicate phone/ambiguous role, invalidate legacy sessions rather than migrate weak credentials, and use transactions/locking for session rotation/revoke-all, OTP verification, reset, permission, and device changes.

## Workflow request

After shared integration, the quality lane/coordinator should add a merge-blocking backend auth/security CI job with repository-native typecheck/build, focused tests, HTTP abuse tests, and PostgreSQL migration/concurrency tests. No `continue-on-error`; bounded timeout; sanitized artifacts.

## Known risks

- Secure router remains unmounted until coordinator cutover.
- Transitional JSON security state is single-process only.
- Identity/profile separation is currently a repository projection, not DB constraints.
- Any legacy bearer fallback would bypass immediate session revocation.
- `FAWRI_OWNER_BOOTSTRAP_DEVICE_ID` must be temporary.
- Full mounted HTTP/browser/PostgreSQL proof remains an integration merge blocker.

## External systems and real data

- Real database contacted: `no`
- Replit Agent used: `no`
- Real Meta/WhatsApp API called: `no`
- Real customer data used: `no — synthetic fixtures only`
- Credentials accessed: `no`

## Ready for coordinator review

- [x] Route/document naming corrected to the lane allowlist.
- [x] Legacy `passwordService.ts` restored to coordination base and excluded from final diff.
- [x] Focused auth tests: 15 passed / 0 failed / 0 skipped.
- [x] TypeScript focused static check: exit 0.
- [x] No force push.
- [x] No merge.
- [x] Shared integration/schema/workflow requests explicit.
