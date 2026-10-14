# SEQ-163 — Owner recovery authorization and transactional revocation (2026-10-13)

Source-only, no generated credentials or database writes.

- `artifacts/api-server/src/routes/auth-route-common.ts` lines 139–150: `ownerContext` checks `getAuthContext(res)?.adminProfile?.role === 'owner_admin'`; otherwise HTTP403 `OWNER_ADMIN_REQUIRED`. Owner recovery status and generate routes call this gate, so not merely a UI owner label.
- `artifacts/api-server/src/services/ownerBreakGlassRecoveryAuthority.ts` lines 350–497: `completeOwnerRecovery` uses `withOperationalTransaction`, locks owner via `ownerById(..., true)`, checks active generation, recoveryId/key2 fingerprints and old phone hash, verifies current password or validates replacement password, prevents phone collision, then atomically updates phone, disables recovery, increments session/security versions, revokes all active admin sessions and trusted devices, and writes audit event. Positive source security controls.
- Caveats: source does not prove database role/RLS configuration in deployment, SMS/OTP external delivery, or full runtime replay/concurrency under transaction faults. Review isolated tests before claiming verified behavior.
- No confirmed new exploit. No production credentials or account recovery attempted. Release BLOCKED; ~54%/46% planning estimate unchanged.
