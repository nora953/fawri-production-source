# Fawri Local-First Cashier Architecture

This document is the canonical architecture contract for Fawri cashier/POS work.

The core product decision is:

> Local cashier capability is not a cloud-subscription entitlement. A merchant may continue selling locally when the Fawri cloud subscription is inactive or the internet is unavailable. Cloud synchronization, AI, connected channels, remote management, and cloud backup are optional cloud capabilities.

## Why this exists

Fawri already has a PostgreSQL-backed cloud catalog, promotion authority, inventory operations, and server order operations. The frontend also contains legacy `localStorage` product/order helpers from the early MVP.

The legacy browser store is not a production cashier authority. It does not provide the durability, atomic transactions, immutable sale snapshots, inventory movement ledger, idempotent outbox, or conflict handling required for a real POS.

The local-first cashier must therefore reuse the commerce model without creating a second business truth.

## Non-negotiable product behavior

1. An inactive or expired Fawri cloud subscription must not disable local cashier sales.
2. An internet outage must not disable local cashier sales.
3. Cloud-only capabilities fail closed when subscription state is inactive/unknown or connectivity is unavailable.
4. Local cashier data must remain available on the device without requiring a live cloud session.
5. The cashier UI must not talk directly to PostgreSQL or assume a specific local database provider.
6. The cashier UI must use a local commerce authority interface.
7. Local sale commit, inventory decrement, and sync-outbox append must be atomic in the chosen durable store.
8. A completed sale must preserve an immutable price/promotion/currency snapshot even if the catalog changes later.
9. Inventory must use append-only movements for sales, returns, restocks, and adjustments. A raw stock overwrite is not the canonical sale history.
10. Cloud synchronization must be idempotent and operation-based. Last-write-wins is not acceptable for sales or inventory movements.

## Three independent runtime axes

Do not conflate these states:

- **Local access**: `available | locked`
- **Cloud entitlement**: `active | inactive | unknown`
- **Connectivity**: `online | offline`

Local cashier capabilities depend only on local access.

Cloud capabilities require both an active cloud entitlement and online connectivity. `unknown` must fail closed for cloud features but must not block local cashier work.

### Expected behavior matrix

| Local access | Cloud entitlement | Connectivity | Local sales | Local catalog/inventory | Queue local operations | Cloud sync / AI / channels |
| --- | --- | --- | --- | --- | --- | --- |
| available | active | online | yes | yes | yes | yes |
| available | active | offline | yes | yes | yes | no |
| available | inactive | online | yes | yes | yes | no |
| available | inactive | offline | yes | yes | yes | no |
| available | unknown | any | yes | yes | yes | no |
| locked | any | any | no | no writes | no | no |

Queued local commerce operations are retained locally so they can be reconciled if cloud sync later becomes entitled again. Cloud reactivation must not rewrite historical local sale snapshots.

## Authority boundaries

### Local cashier authority

The local authority owns on-device cashier operation while the device is in local mode:

- cashier catalog projection needed for sale lookup
- SKU/barcode lookup
- local promotion projection needed for pricing
- current local inventory projection
- append-only inventory movements
- completed/voided sale snapshots
- local payment snapshot
- sync outbox and acknowledgement state
- device identity and local sequence

### Cloud commerce authority

The existing PostgreSQL commerce authority remains the cloud authority for:

- cloud catalog and promotions
- Fawri AI commerce facts
- connected-channel sales flows
- remote merchant management
- multi-device synchronization
- cloud backup/history after successful sync

The cloud authority must ingest local operations idempotently rather than treating the local device as an untrusted mutable database mirror.

## Cashier UI boundary

The POS UI must depend on an interface such as `CashierLocalAuthority`, not on:

- `/api/catalog/*` directly
- `/api/orders/*` directly
- `localStorage`
- PostgreSQL details
- SQLite details
- IndexedDB details

This lets Fawri use the same cashier UI with different durable local adapters.

## Storage provider decision

The current Fawri frontend is React + Vite. It does not currently include a desktop Electron/Tauri shell, a SQLite runtime, or a PWA/service-worker offline cold-start layer.

Therefore this architecture intentionally does **not** choose SQLite or IndexedDB yet.

The next storage-provider gate must compare at least:

### Option A — installable web/PWA + IndexedDB

Advantages:
- smallest change from current React/Vite app
- no separate desktop binary
- good browser support for durable structured data

Requirements before production use:
- service worker/app-shell offline cold start
- transactional IndexedDB wrapper
- backup/export path
- tested storage quota/persistence behavior
- local authentication/unlock independent from cloud cookie session

### Option B — desktop shell + SQLite

Advantages:
- strong transactional local database semantics
- predictable local file ownership/backup
- easier future receipt printer and native hardware integration

Requirements before production use:
- choose and maintain a desktop runtime
- secure IPC boundary
- signed installer/update strategy
- OS-specific validation

Do not choose either provider merely because it is convenient for one page. The commerce contracts below are provider-neutral so this decision can be made after a focused prototype.

## Local identity and subscription separation

A local cashier session must be able to unlock the local store without asking the cloud whether the subscription is active.

Cloud account association is optional for local operation and required only for cloud synchronization/features.

This means an expired cloud subscription should result in a state similar to:

- Local cashier: available
- Cloud sync: paused
- Fawri AI: unavailable
- connected channels: unavailable
- remote dashboard/multi-device cloud behavior: unavailable according to cloud policy

The merchant's local products, inventory movements, sales, and receipts are not deleted.

## Money rules

New cashier contracts are currency-neutral:

- store ISO currency code, for example `IQD`, `USD`, `SAR`, `AED`
- store currency fraction digits
- store money as integer minor units
- never infer historical order currency from the merchant's current settings

Legacy cloud order fields such as `subtotal_iqd`, `delivery_fee_iqd`, `total_iqd`, and `unit_price_iqd` are a known migration boundary and must not be copied into the new local POS contract.

## Immutable sale snapshot

Every completed cashier sale must preserve enough data to remain truthful after later catalog changes.

Each sale line should snapshot at minimum:

- product ID
- variant ID when applicable
- product/variant name shown at sale time
- SKU/barcode when applicable
- quantity
- base unit price in minor units
- effective unit price in minor units
- applied discount amount
- line total
- applied promotion identity/name/effect/version when applicable

The sale must also snapshot:

- currency code and fraction digits
- subtotal
- total discount
- final total
- payment method/status
- local device ID
- local operation ID
- local timestamp

Changing or deleting a product/promotion later must not rewrite this sale.

## Inventory movement ledger

A sale must create inventory movement records instead of only setting a stock number.

Examples:

- sale: `-2`
- return: `+1`
- restock: `+20`
- manual adjustment: explicit signed delta and reason
- sale void/reversal: compensating movement, never silent deletion

For tracked inventory, the durable local transaction must commit together:

1. immutable sale snapshot
2. required inventory movements
3. resulting inventory projection/version
4. sync outbox envelopes

If any part fails, the whole local transaction fails.

## Sync protocol foundation

Every syncable local operation needs:

- schema version
- globally unique operation ID
- stable device ID
- monotonic local device sequence
- entity type and entity ID
- occurred-at timestamp
- immutable payload for append-only events

Cloud ingestion must deduplicate by operation identity and must be safe to retry.

### Conflict rules

- Sales and inventory movements are append-only/idempotent operations; do not merge them by last-write-wins.
- Catalog edits may use explicit entity version/conflict resolution.
- A cloud conflict must not erase or roll back an already completed local sale.
- Uncertain sync stays pending until reconciled; do not blindly duplicate a sale.
- Multi-device local-only operation without cloud synchronization is outside the first local-cashier scope.

## Existing code that must not become production local authority

The following are compatibility/MVP code and may be read during migration, but must not be promoted into the production cashier authority:

- `artifacts/fawri/src/lib/store.ts` product/order `localStorage` collections
- `artifacts/fawri/src/lib/orderEngine.ts` legacy local order creation/update logic

They lack the required transactional and audit guarantees.

## Existing code to reuse conceptually

The cashier should reuse the canonical commerce concepts already present in Fawri:

- product/service identity
- variants
- SKU/barcode
- inventory tracking
- catalog images
- merchant regional context
- currency minor units
- scheduled promotions
- promotion effective pricing

Cloud APIs remain cloud adapters, not direct dependencies of the local cashier UI.

## Implementation phases

### P1A — contracts and policy

- provider-neutral cashier local contracts
- local/cloud capability policy
- immutable sale snapshot contract
- inventory movement contract
- sync outbox contract

### P1B — durable local provider spike

Choose between PWA/IndexedDB and desktop/SQLite using a focused prototype. Validate offline cold start, transactional sale commit, restart recovery, and backup/export.

### P1C — local commerce authority

Implement barcode lookup, pricing projection, atomic sale commit, inventory movement ledger, return/void compensation, and local order history.

### P1D — cloud sync

Implement idempotent outbox upload, acknowledgements, reconciliation, version conflicts for mutable catalog entities, and safe restart behavior.

### P1E — cashier UI

Build the POS interface using the canonical Fawri UI baseline. The UI consumes the local authority only.

### P1F — optional cloud enhancements

Enable remote management, cross-device sync, cloud backup, AI/channel facts, and other subscription-gated capabilities.

## Validation gates before production POS

Do not call the cashier production-ready until tests cover:

- cold start with no network
- cloud subscription expired
- cloud entitlement unavailable/unknown
- sale during network loss
- application/device restart after sale
- duplicate sync retry
- uncertain sync outcome
- inventory exactly-once behavior
- sale void/return compensation
- promotion snapshot preserved after promotion changes
- product rename/delete after historical sale
- currency snapshot preserved after merchant currency changes
- local database corruption/failure behavior
- backup/restore or documented recovery path
- local-only merchant with no cloud account/session
