# P0 — Cashier device/seat entitlement trace (2026-10-17)

Source: `artifacts/api-server/src/services/cashierEntitlementAuthority.ts`, audit branch `fix/p0-provider-receipt-order-discovery-20261015`. Source-only; no newly executed tests or application changes.

## Observed call chain

1. `assertCashierDeviceLicensedInTransaction` (lines 744-780) finds an **active** station by `(merchant_id, paired_device_id)` in `merchant_cashier_stations` with `ORDER BY id LIMIT 2 FOR UPDATE`. Zero stations returns `CASHIER_DEVICE_STATION_REQUIRED` (403); >1 returns `CASHIER_DEVICE_STATION_AMBIGUOUS` (503).
2. The function calls `assertCashierStationLicensedInTransaction` with merchant/station and `allowGrace`, but **does not pass** `allowRestricted` (lines 773-778).
3. `assertCashierStationLicensedInTransaction` (lines 695-742) accepts active and by default grace; restricted requires explicit `allowRestricted === true`. It additionally checks a seat assignment in `cashier_station_seat_assignments` tied to subscription and station, with status `active` or `release_scheduled` and non-null release date.
4. `assertCashierStationLicensedAuthoritative` (lines 782-798) is a separate station-level wrapper that does expose `allowRestricted` to its caller. This is not equivalent to allowing restricted at the device-level helper.
5. `evaluateCashierEntitlement` (lines 197-241) derives restricted after the grace deadline, for cancelled state, and handles suspended separately. This source does not implement a branch-primary free entitlement.

## Implications for newly approved B+ behavior

- A device authorization path using `assertCashierDeviceLicensedInTransaction` will reject a restricted subscription before checking any proposed free-primary exception, unless a **separate, narrowly scoped** authority is designed. Do not globally turn on `allowRestricted`, since that could inadvertently enable paid secondary cashiers.
- `merchant_cashier_stations` in this inspected query is keyed by merchant/device, not by branch or `is_primary`; the **query alone** does not establish a unique primary per branch. Inspect complete station schema and route bindings before selecting a migration or asserting a defect.
- Device identity/seat authorization and offline local write authority are separate controls. Need browser/offline enforcement tests; server gate cannot prevent disconnected IndexedDB writes by itself.
- Current default seat pricing and grace behavior must be preserved for existing merchants until an approved migration and backward-compatible policy transition.

## Next acceptance checks

Map station and location foreign keys; identify how primary designation persists and whether branch stock authority is enforced; inspect API entry points using both helpers, IndexedDB authorization and UI gates; test primary/secondary restricted and reconnect cases. No hosted changes, migration or deployment performed. P0 NO-GO.
