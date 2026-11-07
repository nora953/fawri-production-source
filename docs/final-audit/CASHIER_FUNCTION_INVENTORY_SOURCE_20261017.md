# Cashier function inventory — source-grounded first pass, 2026-10-17

Scope: audit branch `fix/p0-provider-receipt-order-discovery-20261015`. **Source inventory only**; not an exhaustive screen/route inventory, and not evidence of offline end-to-end acceptance. Do not infer a complete UI feature from an exported method. P0 remains OPEN.

| Function | Exact source | Present implementation boundary | Proposed B+ policy |
| --- | --- | --- | --- |
| Barcode and SKU lookup | `artifacts/fawri/src/lib/cashierIndexedDbAuthority.ts`: `lookupByBarcode`, `lookupBySku` | Local IndexedDB authority | Allow offline using cached catalog |
| Catalog cache | Same: `upsertCatalogSnapshot`, `getCatalogItem` | Local snapshot/read | Allow cached read; authoritative refresh online |
| Promotion snapshot | Same: `replacePromotionSnapshot` | Local cached rules | Permit previously authorized local rules; rule changes online |
| Sale creation | Same: `commitSale` | Local IndexedDB transactional sale/stock/outbox | Keep local sales available under B+; server reconciliation still enforces identity/idempotency |
| Inventory adjustment | Same: `adjustInventory` | Local inventory movement/outbox | Local operational adjustment only within already authorized permissions; central stock authority online |
| Sale history | Same: `getSale`, `listSales` | Local persisted records | Allow local history while offline |
| Sync queue | Same: `listPendingSync`, `acknowledgeSynced` | Outbox and acknowledgement | Queue offline; actual upload/ack requires verified server response |
| Subscription and seat pricing | `artifacts/api-server/src/services/cashierEntitlementAuthority.ts`: `cashierSeatPriceIqd`, `calculateCashierProrationIqd`, `evaluateCashierEntitlement` | Server entitlement state, default seat price 3900 IQD and seven-day grace in current code | Billing/renewal/seat changes online; revise grace semantics only after policy approval |
| Station/device licensing | Same: `assignCashierStationSeatAuthoritative`, `assertCashierDeviceLicensedInTransaction`, `assertCashierStationLicensedAuthoritative` | Server-controlled station/device authority | New pairing, seat reassignment, revocation online; review local enforcement separately |
| Operator report | `artifacts/api-server/src/services/postgresCashierOperatorReportAuthority.ts`: `buildCashierOperatorReportAuthoritative` | PostgreSQL-backed report with profit redaction checks | Central reports online; separately define minimal local daily totals |

## Features not yet certified by this inventory

- Password change/reset, role and permission management, device enrollment UI, shift open/close, cash drawer, receipt printing, returns/refunds, payments other than local sale, promotions editing, multi-location transfers, centralized reporting UX and actual synchronization API. Other audit evidence mentions several of these; their exact current UI/router implementation and offline boundaries must be read before classification as implemented.
- Actual browser use, IndexedDB durability after storage eviction, cross-tab conflict, expired subscription behavior under policy B+, and payment reconciliation require tests. Do not equate local authority method availability with tested offline POS behavior.

## Policy recommendation (not yet approved implementation)

Under B+, local cash sale, cached catalog, local history and queued operations remain available after subscription expiry. Password/security changes, device and permission administration, central reports, cloud sync and subscription operations require online authority. Do not expose confidential profit figures from local reports without an independently verified role check. Offline grace currently exists in server entitlement source but does not automatically establish the new B+ commercial rule.

Next audit: enumerate cashier UI pages/components, server routes, auth/password/shift/return/print and sync implementations; attach exact files and permissions to this matrix. No application/hosted changes made.
