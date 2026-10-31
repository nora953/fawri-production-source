# P0 cashier device entitlement — source evidence 2026-10-18

Branch: fix/p0-provider-receipt-order-discovery-20261015. No runtime test or mutation.

Reviewed artifacts/api-server/src/services/cashierEntitlementAuthority.ts. assertCashierStationLicensedInTransaction evaluates subscription state; active is allowed by default, grace unless allowGrace=false, and restricted only when allowRestricted=true. It also requires a station seat assignment with active or release_scheduled status and a nonnull release_effective_at for the latter.

assertCashierDeviceLicensedInTransaction selects active merchant-scoped stations paired to device_id with FOR UPDATE, LIMIT 2. Zero matches returns CASHIER_DEVICE_STATION_REQUIRED (403); multiple matches return CASHIER_DEVICE_STATION_AMBIGUOUS (503). One match is checked for a licensed seat.

Open P0 verification: inspect actual sale, inventory and sync callers to ensure license and current offline authority are enforced; test same device paired to two stations, subscription grace/restricted boundaries, and concurrent downgrade/revocation. The observed helpers alone do not prove every downstream endpoint calls them.

Status: source-reviewed, runtime NOT TESTED, P0 NO-GO. No code, database or deployment changes.
