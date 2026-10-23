# P0 — Cashier offline entitlement trust boundary (2026-10-23)

Status: **OPEN / RELEASE NO-GO**. Scope: source-traced design and test contract only; no runtime or hosted changes. Issue: CASHIER-OFFLINE-001.

## Verified source trace

1. `artifacts/api-server/src/middleware/cashierStaffSession.ts`: `requireCashierStationCredentialWithPolicy` authenticates station and device, invokes `assertCashierStationLicensedAuthoritative({merchantId,stationId,allowGrace:true,...})`, and stores the resulting entitlement in `res.locals.cashierEntitlement`. `requireCashierOperatorSession` does the equivalent for authenticated operators, except historical-sync handling.
2. `artifacts/api-server/src/routes/cashier-staff-operations.ts`: `POST /cashier/operator/login` and `GET /cashier/operator/me` return `cashier_entitlement: getCashierEntitlementContext(res)`.
3. `artifacts/api-server/src/services/cashierEntitlementAuthority.ts`: `CashierEntitlementSnapshot` includes merchant, subscription, state, seats, version, billing end, grace end, and server time; the inspected type does **not** include a cryptographic signature or station binding.
4. `artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts`: `persistEntitlementFromPayload` forwards the response snapshot and station ID to local persistence.
5. `artifacts/fawri/src/lib/cashierOfflineEntitlementAuthority.ts`: `validAuthority` validates cached field types, timestamps, and local clock anchors, but does **not** verify a server signature. `persistCashierEntitlementAuthority` derives station ID from its caller, not a signed station claim.

## Security finding and limits

The cached offline entitlement is a locally mutable assertion whose structure is checked but whose provenance is not cryptographically authenticated. This is an integrity/trust-boundary gap for offline authorization. This finding alone does not establish a complete unauthorized-sale exploit, and it does not imply that server-side online authentication is bypassed.

## Remediation contract (requires coordinated server/client implementation)

- Issue an asymmetric, server-signed offline authorization envelope after station/device authentication; sign canonical fields including schema/key version, merchant ID, station ID, device binding (if stable), subscription ID, state, licensed seats, subscription version, issued/server time, billing end, grace end, and an explicit authorization expiry.
- Verify signatures with a pinned/rotatable public-key trust set in the cashier client **before persistence and before each offline authorization decision**. Reject unknown keys, malformed claims, altered payloads, identity mismatch, invalid temporal ordering, unsupported versions, and expiry; never use a client-embedded shared signing secret.
- Define key rotation, revocation limitations while offline, migration of pre-signature caches, clock-rollback and restart behavior, and the operational behavior when verification cannot be performed. No automatic conversion of unsigned legacy cache into a trusted signed entitlement.
- Preserve policy: one main cashier per branch during outage, branch-local inventory, seven-day grace where server-authorized, and no new offline privilege for secondary cashiers. Keep cashier subscription independent of bot subscription.
- Retain server-side station, operator, subscription, and inventory controls. Signature verification is an additional boundary, not a replacement.

## Required regression matrix before closure

1. Valid signed active/grace entitlement: authorized main cashier continues offline within exact allowed time window, including browser restart.
2. Invalid/altered/missing signature, wrong merchant/station/device, unsupported schema/key, malformed claims: fail closed without unauthorized offline sales.
3. Expired billing/grace, clock rollback, local storage deletion/replay, stale subscription version, key rotation: enforce documented restrictions; record limitations of offline revocation.
4. Secondary cashier blocked offline; distinct branches remain isolated; online authorized flows and sync recovery remain functional.
5. Verify tests in isolated CI; reconcile hosted release gates separately when service access is authorized. Do not claim CI green until actual run completes.

## Decision / handoff

**Do not close CASHIER-OFFLINE-001 or change NO-GO.** Next implement a reviewed signing envelope and defensive tests in a bounded branch commit. This checkpoint is documentation only; it is not evidence of successful remediation or CI execution.
