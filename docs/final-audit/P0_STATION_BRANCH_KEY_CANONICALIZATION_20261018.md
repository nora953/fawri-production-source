# P0 cashier station branch-key canonicalization — source-level finding (2026-10-18)

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Scope: static source inspection only; no SQL mutation, runtime test, or production code change.

## Evidence

- `artifacts/api-server/src/services/cashierLocationBindingAuthority.ts`: `resolveCashierLocationForBranch` first looks up `merchant_locations.legacy_branch_key` for the merchant; for `main` it may instead return the merchant default location, even if its legacy key differs.
- `artifacts/api-server/src/services/postgresCashierStaffAuthority.ts`: `createCashierStationAuthoritative` uses `legacyBranchKeyForLocation(location)` to persist a canonical `branch_key` and `location.id`.
- The same file's `updateCashierStationAuthoritative` resolves `targetLocation` but writes the uncanonicalized request value: `add("branch_key", branchKey); add("location_id", targetLocation.id)`. It revokes pairing/runtime when the location ID changes.
- The database has partial unique indexes on `(merchant_id,branch_key)` and `(merchant_id,location_id)` for active offline-authority stations; the latter prevents two active offline primaries on the same location despite a branch-key alias.

## Reproduction hypothesis (NOT RUN)

For a merchant whose default location has `legacy_branch_key='shop_a'`, update an existing station using `branchKey='main'`. The resolver can return the default location `shop_a`, while update persists `branch_key='main'`. Creation through that same resolver would persist `shop_a`. This is a source-derived consistency hypothesis, not a proven runtime failure.

## Acceptance required

1. Disposable PostgreSQL fixture with default location whose canonical legacy key differs from `main`.
2. Assert create/update yield consistent `branch_key` and `location_id`, including same-location alias update and location move.
3. Check credential/session revocation behavior and location-scoped offline-primary uniqueness under concurrency.
4. Verify no old offline clients rely on the noncanonical stored alias before proposing a migration or code correction.

Status: **P0 source-level finding / runtime NOT RUN / release NO-GO**. No code, DB, migration, deployment or main-branch changes.
