# P0 cashier B+ approved product policy — implementation gap, 2026-10-17

Status: **APPROVED PRODUCT BEHAVIOR, NOT IMPLEMENTED/VERIFIED**. This document records user decisions; no source, migrations, pricing, deployment or production data changed.

## Agreed rules

1. Each merchant may have many branches; each branch owns independent stock and has exactly one designated primary cashier. Optional folders/groupings (e.g. Baghdad/Karkh/Basra) are visual organization only, not stock-sharing boundaries.
2. Online, active paid primary and secondary cashiers may sell under their permissions. During internet outage, only the designated primary of each branch may create local sales; secondary cashiers must not create offline sales.
3. After subscription expiry plus seven-day grace, one primary per existing branch continues indefinitely in a **free local basic mode**: cash sales, receipts, locally stored sales history, local catalog/product and price editing, inventory counting/adjustment and permitted local returns. Secondary cashiers cannot create new sales. Paid cashier reports, advanced cloud administration and paid features are disabled.
4. Essential reconciliation/upload of already recorded operations, security account recovery/password changes, device revocation and subscription renewal remain accessible, even while paid features are restricted. Do not silently discard queued operations or suppress safe security recovery.
5. Cashier and AI/Meta automated replies have **separate subscriptions and entitlements**. One expiry must not disable the other. Shared catalog/inventory must not be represented as fresh to AI when a branch has unreported offline transactions.
6. Primary and secondary have different subscription prices, but **final amounts not yet approved** (6000/3000 IQD were examples). No automatic offline failover/secondary promotion; primary replacement requires online safe reconciliation/authorization.
7. Reconnection: reconcile branch-local queued operations and authoritative inventory before secondary cashier sales resume. Per-branch offline continuity must not depend on other branches' connection status.

## First source-backed gap

`artifacts/api-server/src/services/cashierEntitlementAuthority.ts`:
- `evaluateCashierEntitlement` (approx. lines 197-241) computes active, grace and restricted subscription state based on expiry, with seven-day grace configurable elsewhere; it does not itself distinguish free-primary operation from paid-secondary operation.
- `assertCashierStationLicensedInTransaction` (approx. lines 695-742) defaults allowed states to active and grace, allowing restricted only when `allowRestricted === true`, and validates a station-seat assignment. It is not a verified implementation of the new free-primary entitlement.
- Seat pricing currently uses a default 3900 IQD per seat in this service, not an approved primary/secondary differentiated schedule.
- `artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts` exports local catalog lookup/snapshot, sale commit, inventory adjustment, sale history and sync queue operations. This proves source primitives exist, **not** that role/expiry/branch offline gates are enforced at all entry points.

## Work plan / acceptance gates

A. Map branch/location and station/device schema and current UI/HTTP routes; identify authoritative primary designation and prevent two primaries in one branch. Check grouping is purely organizational.
B. Map offline local sale/stock and cross-tab/multidevice checks; assert only primary can write while offline, with branch-scoped inventory and no accidental cross-branch reads/writes.
C. Design free-primary entitlement separately from paid seat entitlement; enumerate exact permitted local actions and denied paid report/admin actions. Test active -> grace -> restricted -> renewed boundaries.
D. Confirm per-branch queued-sale idempotency and safe reactivation after server reconciliation, including interrupted sync, returns and stock changes.
E. Keep cashier billing gates independent of bot/AI/Meta billing; verify account security and raw data recovery are not blocked.
F. Propose migration, backward compatibility, UI disclosure and pricing changes separately; require explicit approval before implementation of high-impact data or production changes.

No tests were executed for this newly approved policy. P0 remains NO-GO until implementation and acceptance evidence exist.
