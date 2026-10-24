# Cashier sync source trace — 2026-10-24

Status: OPEN. Release: NO-GO. Source review only, no executed tests.

The local IndexedDB authority assigns one sequence counter to sales and standalone inventory adjustments. Its outbox is sorted by sequence, and acknowledgement removes envelopes by operation ID. The operator commerce routes expose sale, return and void. Sale bundle validation requires exactly one sale envelope; a standalone adjustment cannot be sent as a sale bundle. The inspected POS runtime exposes commitSale but not adjustInventory or an uploader. This does not prove that no other uploader exists.

Acceptance remains pending: locate all network uploader call sites and any standalone adjustment endpoint; define gap and retry behavior; test sale/adjustment/sale, late arrivals, idempotent replay, transient errors, and stock consistency. Do not mark this gate complete without exact-source test evidence.
