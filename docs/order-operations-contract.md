# Fawri server-authoritative order operations

## Source of truth

- Bot-created orders continue to originate in the legacy runtime during the PostgreSQL transition.
- Merchant order and payment decisions are stored only by the API in `order-operations.json`.
- The frontend must not read, merge, or write `fawri_orders` or any other browser storage for operational order state.
- PostgreSQL `orders` is the final destination. The overlay is temporary and must pass reconciliation before migration.

## Read API

- `GET /api/orders` returns only orders belonging to the authenticated merchant.
- `GET /api/orders/:merchantId` rejects a merchant ID that differs from the authenticated session.
- `GET /api/order/:orderId` resolves the order inside the authenticated merchant tenant only.
- Every response is `Cache-Control: no-store` and includes `version` and `updated_at`.

## Optimistic concurrency

Every mutation requires `expected_version`.

- A matching version performs one atomic update and increments the version.
- A stale version returns `409 ORDER_VERSION_CONFLICT` with `current_version` and `current_order`.
- The frontend replaces its stale copy with the returned current order instead of overwriting it.

## Order-state transitions

Allowed transitions are deliberately one-way once fulfilment progresses:

- `pending_confirmation` → `confirmed`, `cancelled`, `out_of_stock`, `waiting_customer_approval`
- `confirmed` → `preparing`, `cancelled`
- `preparing` → `shipped`, `cancelled`
- `shipped` → `delivered`
- `delivered` and `cancelled` are terminal
- `out_of_stock` and `waiting_customer_approval` may return to confirmation or end in cancellation

Invalid transitions fail on the server even if a client sends them directly.

## Payment operations

- Generic payment-state updates validate the order payment method and the existing state.
- Electronic payment confirmation uses `POST /api/orders/:orderId/payment/confirm` and atomically sets payment to `paid` and the order to `confirmed`.
- Electronic payment rejection uses `POST /api/orders/:orderId/payment/reject`, requires a reason, sets payment to `failed`, and leaves the order awaiting confirmation.
- Verification metadata is present only for paid orders.
- Rejection metadata is present only for failed payments.

## Failure behavior

- No frontend success is shown until the API returns the updated order.
- API failure never falls back to browser state.
- The original bot runtime file is not rewritten by merchant operations.
- Merchant deletion removes that merchant's order operation overlay.

## Audit and migration

`audit-order-operations.mjs` verifies:

- merchant and order references;
- tenant ownership;
- positive versions and valid timestamps;
- typed order and payment states;
- payment-method consistency;
- paid/failed metadata consistency.

`audit:data` includes this audit. PostgreSQL migration must include the overlay SHA-256 in its source manifest and must fail closed on any audit error before opening a database transaction.
