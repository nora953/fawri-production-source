# Fawri Cashier Local Provider Decision — P1B

Status: **prototype decision, not production certification**

## Decision

Fawri will prototype the first durable local cashier authority with native IndexedDB because the current merchant application is already React + Vite and has no desktop shell or SQLite runtime.

This is a delivery decision for P1B, not a permanent lock-in. The cashier UI and commerce core remain provider-neutral through `CashierLocalAuthority`.

A future desktop/SQLite adapter may replace or complement IndexedDB without changing cashier UI/business contracts.

## Why IndexedDB is first

- runs inside the existing Fawri web application
- requires no paid cloud database for local sales
- supports multi-store atomic transactions needed for sale + inventory + outbox
- survives browser/app restart under normal browser storage semantics
- supports indexed SKU/barcode lookup
- allows Fawri to validate local-first behavior before adding a desktop deployment stack

## Why it is not production-certified yet

Browser persistence is not equivalent to owning a SQLite file. Even when `navigator.storage.persist()` is granted, Fawri must still validate:

- offline app-shell cold start
- restart recovery after committed sales
- browser/storage eviction behavior
- backup/export and restore
- corruption/failure handling
- supported browser matrix
- local authentication independent of a cloud cookie
- receipt printing and barcode hardware behavior

The IndexedDB probe therefore always reports `production_certified: false` in P1B. Persistent storage is evidence for durability testing, not certification by itself.

## Desktop / SQLite remains the certification alternative

Before production POS release, desktop + SQLite should be reconsidered if any of these become required:

- guaranteed merchant-owned database file
- stronger backup/restore workflow
- direct receipt-printer integration
- cash drawer / serial / USB integrations
- stricter control over browser storage eviction
- kiosk/locked-down deployment

If selected, SQLite must implement the same `CashierLocalAuthority` behavior and conformance tests.

## P1B IndexedDB prototype invariants

The prototype must:

1. never depend on a cloud subscription for local sale capability
2. store money as ISO currency + integer minor units
3. fail closed on ambiguous duplicate SKU/barcode lookup
4. make `operation_id` idempotent for sale commit
5. atomically commit sale snapshot, inventory changes, device sequence, and sync outbox
6. prevent stock from becoming negative
7. reject failed payment attempts as completed sales
8. preserve sale snapshots after later catalog changes
9. retain pending sync operations until explicit acknowledgement
10. preserve locally-adjusted inventory when refreshing prototype catalog data unless a future reconciliation protocol explicitly says otherwise

## Current prototype storage layout

IndexedDB stores:

- `meta` — monotonic device sequence
- `catalog` — local sale lookup/pricing/inventory projection
- `sales` — immutable completed sale snapshots
- `inventory_movements` — append-only stock movements
- `outbox` — idempotent operations waiting for optional cloud synchronization

A sale is written through one read/write transaction spanning all required stores.

## Known boundary: promotions

The first provider stores the effective price and promotion snapshot supplied to its catalog projection. This is enough to validate durable sale snapshots, but it is **not yet the final offline scheduled-promotion engine**.

Before P1C is complete, Fawri must store/evaluate promotion schedules locally so a promotion can correctly start or expire while the device remains offline. The provider must not freeze a previously-synced effective price indefinitely.

## Known boundary: catalog synchronization

`upsertCatalogSnapshot` is prototype ingress, not the final cloud reconciliation protocol. It preserves existing local stock by default to avoid destroying unsynced local movements.

P1D must replace this with versioned catalog reconciliation and append-only inventory synchronization.

## Exit criteria for P1B

P1B can be considered validated when:

- frontend typecheck passes
- frontend production build passes
- IndexedDB opens successfully in the supported browser
- persistence probe result is visible/recorded
- a seeded product can be found by SKU and barcode
- one sale atomically creates a sale snapshot, stock decrement, inventory movement, and outbox entries
- retrying the same `operation_id` creates no duplicate sale or stock decrement
- insufficient stock fails without partial writes
- closing/reopening the database preserves the committed sale and resulting stock
- acknowledgement removes only the matching outbox operations

Passing P1B does not by itself make the cashier production-ready.
