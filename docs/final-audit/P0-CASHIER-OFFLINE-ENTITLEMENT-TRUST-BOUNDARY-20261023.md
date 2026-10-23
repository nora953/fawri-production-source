# Signed offline implementation checkpoint — 2026-10-24

**CASHIER-OFFLINE-001 OPEN / NO-GO**. Server issuer published in `b7b86d901b512fe0eaa687d720af08702ca09dbc`. Client batch adds pinned release-key verification before persistence, restored offline authorization and every offline sale; signed merchant/station/device/location/credential/subscription/version/expiry/main-station claims replace mutable cached fields as authority. WebCrypto executes outside live IndexedDB transactions; cache recheck rejects concurrent refresh/clear before clock update. Unsigned legacy records require online refresh and are never upgraded locally. A successful online authenticated entitlement check authorizes online sales with missing offline signing configuration; HTTP denials never use offline fallback. Pending sale/outbox and server sync algorithms are unchanged.

Local 28/28 targeted tests PASS (source contracts plus actual crypto/issuer/cache/sale-auth functions with synthetic storage adapter). Local native browser NOT_RUN: no installed Chrome. New dedicated CI requires real Chrome, no skipped prerequisite, and executes eight bounded signed/native storage/local inventory/synthetic acknowledgement cases. These are PREPARED, not accepted until exact source CI logs are read. Server HTTP+database session issuance/reconnection and long-duration physical-device proof remain separate open gates. No complete sync/production closure inferred from synthetic acknowledgement.

## Configuration and rotation contract

- Server-only `FAWRI_CASHIER_OFFLINE_PRIVATE_JWK`: one P-256 signing private JWK. Never use a VITE prefix or include it in a response, artifact, log or source. No operational key was generated/stored in this work; tests generate disposable keys in memory.
- `FAWRI_CASHIER_OFFLINE_KEY_ID`: active identifier. `FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS`: public JWK map matching that active key; private/public mismatch disables issuance without disrupting online login.
- Browser `VITE_FAWRI_CASHIER_OFFLINE_PUBLIC_KEYS`: release-provisioned public verification JWK map. Never trust a keyring from API payloads, local storage or entitlement envelopes. Empty/invalid map disables offline authorization.
- Rotation order for future approved rollout: ship old+new public keys to clients first; then activate the new server key ID. Keep old verification key until all issued old leases expire (maximum seven days) and old clients have refreshed. Remove retired public keys in a later reviewed release. Unknown keys fail closed. No live key configuration/rotation/deployment performed here.
- Expiry is capped by station credential expiry, explicit signed grace, billing end plus seven days and issuance plus seven days. Reconnect refresh remains necessary. Server revocation/new subscription versions cannot be learned during disconnection; the signed lease bounds that delay. Retained-version/clock-watermark tests do not prove resistance to a device owner replacing the whole browser profile or manipulating the OS clock across restarts. No tamper-resistant hardware/trusted offline clock claim.
- Hosted key provisioning, deployed release parity, session/role/device revalidation and branch uniqueness under real rollout are **BLOCKED_HOSTED_VERIFICATION** under current instructions. Existing operator-session lifetime still applies; seven-day license grace is not a seven-day operator session.

Exact next: inspect containing source's signed-native CI marker (8 actual outcomes), full typecheck/build and existing isolated cashier sync regression. Resolve any failures without weakening identity, signature, expiry, stock or denial assertions. Keep zod HIGH advisory/security CI blocker open; no overall P0 percentage or release acceptance.

---

Historical source review follows; its statements describe the pre-implementation boundary.

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
