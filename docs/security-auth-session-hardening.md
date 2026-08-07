# Fawri authentication and session hardening

## Purpose

This lane replaces trust in self-contained browser credentials with server-side,
revocable authentication state. It also creates a strict boundary between an
account identity and the merchant or administrator profile attached to that
identity.

The implementation is intentionally isolated from database and application
bootstrap files. The coordinator must complete the cutover steps in this
document and in the lane handoff before the new endpoints are exposed in a
shared environment.

## Security boundary

### Account identity and profiles

`AuthAccountRepository` projects the current legacy record into two layers:

- account identity: account ID, normalized phone, password hash, account kind,
  enabled state, OTP verification state, and session version;
- exactly one profile:
  - merchant profile with merchant/tenant ID, lifecycle state, onboarding state,
    language, and store fields; or
  - administrator profile with role, explicit permissions, display fields, and
    mandatory-password-change state.

All repository lookups require an expected account kind. A merchant lookup can
never return an administrator profile, and an administrator lookup can never
return a merchant profile. Duplicate identities fail closed.

The JSON adapter is transitional. PostgreSQL must ultimately represent account
identity and profiles in separate tables with database constraints; see the
handoff schema request.

### Separate merchant and administrator authentication

The secure router provides distinct entry points:

- merchant login: `POST /api/auth/login`;
- administrator login: `POST /api/auth/admin/login`.

The session cookies are also distinct:

- merchant: `fawri_merchant_session_v2`;
- administrator: `fawri_admin_session_v2`.

Both cookies are `HttpOnly`, use `SameSite=Lax`, are scoped to `/api`, and use
`Secure` in production. Responses containing authentication state use
`Cache-Control: no-store`.

A merchant token cannot validate as an administrator token and vice versa. The
server re-reads the account and profile on every authenticated request instead
of trusting role, permission, status, or tenant values from the client.

## Session lifecycle

`AuthSecurityStore` issues an opaque random token. Only an HMAC fingerprint is
stored. The record contains:

- random session ID;
- account ID and account kind;
- tenant ID;
- account security version;
- administrator role and normalized permissions where applicable;
- optional trusted-device binding;
- created, last-seen, idle-expiry, and absolute-expiry timestamps;
- revocation and replacement metadata.

Default policy:

- idle lifetime: 8 hours;
- absolute lifetime: 7 days;
- rotation interval: 30 minutes;
- active-session cap: 5 merchant sessions or 2 administrator sessions;
- trusted-device cap: 2 devices per account.

Rotation creates a new token and session ID, then revokes the previous session
with a replacement reference. Rotation preserves the original absolute expiry.
Failure to rotate fails closed.

`logout`, `logout-all`, individual session revocation, password changes,
password resets, account disablement, permission changes, and trusted-device
revocation invalidate server-side records immediately. A copied or stolen old
token fails on the next request.

The account `auth_session_version` is incremented on password and administrator
security changes. Administrator changes also mirror the legacy
`admin_session_version` during transition so older administrator guards cannot
outlive the security change.

## Trusted administrator devices

Administrator login requires `X-Fawri-Device-Id`. The device identifier is
HMAC-fingerprinted at rest. New devices are pending until an owner administrator
trusts them. Revoking trust immediately revokes all sessions bound to the
device.

For initial owner bootstrap only, `FAWRI_OWNER_BOOTSTRAP_DEVICE_ID` may identify
the first approved owner device. It must be a high-entropy value delivered out
of band and removed from runtime configuration immediately after bootstrap.
Production rollout must not leave the bootstrap variable permanently enabled.

## Merchant lifecycle and tenant enforcement

Approved merchants may use operational APIs. Pending merchants are limited to:

- `/api/auth/me`;
- logout, logout-all, password change, and session management;
- `/api/auth/onboarding` and descendants;
- `/api/auth/support` and descendants.

Suspended and rejected merchants fail closed. Operational access is enforced by
server middleware, not by navigation controls or frontend state.

Tenant identity comes from the authenticated merchant profile. A request that
supplies a different tenant or merchant ID is rejected with
`CROSS_TENANT_ACCESS_FORBIDDEN`; missing client tenant input is replaced by the
server-derived tenant.

## Administrator authorization

Owner and assistant roles are resolved from the current server-side profile.
Assistant permissions are restricted to this explicit allowlist:

- `view_merchants`;
- `manage_merchant_status`;
- `manage_subscriptions`;
- `manage_channels`;
- `view_logs`;
- `inspect_merchant_sessions`;
- `manage_support`.

Unknown permissions and synthetic permissions such as `manage_admins` are
dropped. Only an owner can create or modify an assistant account. Owner accounts
cannot be targeted by assistant-management endpoints. Permission, password, or
enabled-state changes revoke the assistant's sessions immediately.

An assistant created with a temporary password receives
`must_change_password=true`. Until that password is replaced, only the secure
administrator `me`, logout, and change-password endpoints are allowed.

## OTP and password recovery

OTP challenges contain a random challenge ID and a six-digit code. The code,
target, and request IP are HMAC-fingerprinted; the plaintext code is used only
for delivery and is never persisted or logged.

Default controls:

- expiry: 10 minutes;
- resend cooldown: 60 seconds;
- maximum verification attempts: 5;
- maximum issues per target: 5 per hour;
- maximum issues per IP: 20 per hour;
- a newly issued challenge revokes the previous challenge for the same target
  and purpose;
- successful verification marks the challenge used before returning success;
- replay, superseded, expired, locked, or revoked challenges fail.

Password-reset request and resend use a generic `202` response with the same
fields for eligible and ineligible accounts. A random decoy challenge ID and
normal-looking expiry are returned when no code is sent, preventing account
existence disclosure through response shape or status.

Login throttling defaults to 5 failed attempts per target and 30 per IP during a
15-minute window. Device-approval denial and unverified-account attempts are
also counted.

## Password storage

New passwords use Node.js `scrypt` with a random 16-byte salt, a 64-byte derived
key, and parameters `N=16384`, `r=8`, `p=1`. Verification uses timing-safe
comparison.

Legacy deterministic SHA-256 and plaintext values remain readable only to
perform a successful migration. A successful login rehashes legacy values with
scrypt. No new plaintext or deterministic password values are written.

The serialized version starts with `sha256$v2$scrypt$...` only to remain
compatible with a legacy migration guard that treats every `sha256$` value as
already migrated. The algorithm field is explicitly `scrypt`; the digest is not
SHA-256.

Password policy requires 8 to 128 characters, at least one uppercase English
letter and one number, and only the currently supported ASCII character set.

## Audit and secret handling

Security events store HMAC fingerprints for phone targets and IP addresses.
Audit metadata is sanitized recursively by key name. Keys containing password,
OTP, code, token, secret, hash, cookie, or authorization are omitted.

The implementation does not log passwords, OTPs, session tokens, cookie values,
or password/OTP/session hashes.

The file-backed store is created with mode `0600`, writes through an atomic
rename, and fails closed when its JSON or schema is corrupt. It must not be used
as the final multi-instance production authority; PostgreSQL is required before
horizontal scaling.

## Required environment

Production requires:

- `FAWRI_AUTH_SECURITY_SECRET`: at least 32 characters and independent from
  password salts and external API secrets;
- `FAWRI_ALLOWED_ORIGINS`: comma-separated exact browser origins;
- configured WhatsApp OTP delivery variables already used by the application.

Optional policy variables:

- `FAWRI_SESSION_IDLE_TTL_MS`;
- `FAWRI_SESSION_ABSOLUTE_TTL_MS`;
- `FAWRI_SESSION_ROTATION_MS`;
- `AUTH_OTP_EXPIRE_MS`;
- `AUTH_OTP_RESEND_MS`;
- `AUTH_OTP_MAX_ATTEMPTS`;
- temporary `FAWRI_OWNER_BOOTSTRAP_DEVICE_ID` for the first owner device only.

Development-only OTP bypass remains disabled unless both the environment is
non-production and `AUTH_ALLOW_DEV_OTP_BYPASS=true`.

## Mandatory cutover order

1. Create the PostgreSQL security schema and migrate accounts/profiles.
2. Configure a dedicated production security secret and allowed origins.
3. Mount `auth-security.ts` at `/api/auth` before the legacy auth router.
4. Change all merchant and administrator protected routes to the secure session
   middleware and server-derived tenant context.
5. Update the administrator client to use `/api/auth/admin/login`, secure cookies,
   and `X-Fawri-Device-Id`; do not retain the old bearer-token path.
6. Disable/remove every duplicate legacy signup, OTP, login, logout, password
   reset, password change, session, device, and administrator-management route.
7. Run the route-level integration and abuse tests listed in the handoff.
8. Bootstrap one owner device, approve normal devices through the owner flow,
   and remove `FAWRI_OWNER_BOOTSTRAP_DEVICE_ID`.
9. Verify that no legacy cookie or bearer token authorizes any protected route.

Do not expose the new and old authentication systems concurrently. Parallel
exposure would preserve the weaker route as an authentication bypass.
