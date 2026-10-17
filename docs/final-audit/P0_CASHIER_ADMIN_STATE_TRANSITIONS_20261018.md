# P0 cashier subscription administrative transitions — 2026-10-18

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Static source review only.

File `artifacts/api-server/src/services/cashierEntitlementAuthority.ts`, `changeCashierSubscriptionAdministrativeState`.

The operation locks the merchant subscription row with FOR UPDATE, optionally verifies expectedVersion, enforces transitions active -> suspended, suspended -> active, and active/suspended -> cancelled, updates with a version predicate, and records an audit event in the same transaction. Cancellation clears scheduled_licensed_seats and scheduled_change_at. Evaluation maps suspended to suspended and cancelled to restricted. Neither path in this function directly changes station pairing or credentials.

Required P0 runtime cases: simultaneous administrative actions; suspension during an in-flight cloud sale; resume before/after billing expiry; cancellation with pending scheduled downgrade; server cloud/reporting restrictions vs essential primary local cashier operation; explicit separate AI/Meta subscription handling. Verify authorization at actual endpoints and offline license policy rather than inferring it from this helper.

Status: source REVIEWED, runtime NOT TESTED, P0 NO-GO. No code/database/deployment changes.
