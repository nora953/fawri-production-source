# Fawri catalog and inventory runtime

## Scope

This document describes the isolated server-authoritative catalog implementation in the `parallel/catalog-inventory` lane. The runtime is a transitional JSON-backed implementation intended to close browser-storage and tenant-isolation gaps while the PostgreSQL lane owns the durable schema and migration cutover.

The active implementation files are:

- `artifacts/api-server/src/services/catalogInventoryRuntime.ts`
- `artifacts/api-server/src/routes/catalog-operations.ts`
- `artifacts/fawri/src/pages/dashboard/ServerProductsPage.tsx`
- `artifacts/fawri/src/pages/dashboard/ProductsPage.ts`
- `scripts/audit-catalog-operations.mjs`

The legacy `ProductsPage.tsx` remains unchanged. The new `ProductsPage.ts` module re-exports the server-only page and therefore wins normal TypeScript module resolution without editing the legacy file.

## Authority and tenant boundary

The API never accepts a merchant identifier as authority. Every request is protected by `requireMerchantSession`, and the merchant ID is read from the authenticated response context with `getMerchantIdFromSession`.

A supplied top-level or nested `merchant_id` that differs from the authenticated merchant is rejected with `MERCHANT_ACCESS_FORBIDDEN`. The service also scopes every lookup, uniqueness check, mutation, idempotency record, and deletion to the authenticated merchant. A product ID belonging to another merchant is indistinguishable from a missing product.

## Endpoints

The router is intentionally not mounted in `app.ts` by this lane.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/catalog/products` | List authenticated merchant products. |
| `GET` | `/api/catalog/products/:productId` | Read one authenticated merchant product. |
| `POST` | `/api/catalog/products` | Create with required `Idempotency-Key`. |
| `POST` | `/api/catalog/products/import` | Atomic batch import with required `Idempotency-Key`. |
| `PATCH` | `/api/catalog/products/:productId` | Update with required positive `expected_version`. |
| `DELETE` | `/api/catalog/products/:productId` | Delete with required positive `expected_version`. |
| `POST` | `/api/inventory/products/:productId/set` | Set product or variant stock with `expected_version`. |
| `POST` | `/api/inventory/products/:productId/adjust` | Apply a nonzero delta with `expected_version` and required `Idempotency-Key`. |

All responses set `Cache-Control: no-store`. Replayed successful idempotent requests set `Idempotent-Replay: true`.

## Product contract

A catalog product contains:

- server-generated or validated `id`;
- authenticated `merchant_id`;
- optional stable `external_ref` for imports;
- name, description, and category;
- optional SKU and barcode;
- integer IQD price and optional compare-at price;
- non-negative integer stock and low-stock threshold;
- calculated operational status;
- Fawri-reply visibility flag;
- image references only;
- zero or more variants;
- timestamps and positive optimistic `version`.

Variants contain a stable ID, display name, optional SKU/barcode/price override, non-negative stock, normalized option key/value pairs, image references, and timestamps.

When variants exist, product stock must equal the sum of variant stock. Direct product-level inventory mutation then requires a `variant_id`; the aggregate product stock is recalculated after each variant mutation.

## Validation and uniqueness

The runtime fails closed on:

- empty or oversized required fields;
- unsafe, negative, fractional, or excessive prices;
- compare-at price lower than the active price;
- negative or fractional stock;
- duplicate variant option signatures;
- duplicate variant IDs within a product;
- duplicate external references within a merchant;
- case-insensitive duplicate SKUs across all products and variants of a merchant;
- case-insensitive duplicate barcodes across all products and variants of a merchant;
- product stock that disagrees with variant stock;
- unsupported status values;
- missing stable identity during import;
- embedded image bytes or browser-local `data:`/`blob:` references.

The same SKU, barcode, or external reference may exist under different merchants.

## Images

Operational JSON stores only image references:

- an HTTP(S), relative, or `asset://` URL; or
- a storage key that does not contain traversal and is not absolute.

Fields such as `data`, `base64`, `content`, `bytes`, and `blob` are rejected. Large base64 payloads are never accepted into the runtime store. Binary upload and object-storage ownership belong in a separate media service and schema.

## Optimistic concurrency

Every product starts at version `1`. Update, delete, inventory set, and inventory adjustment require a positive `expected_version`. A stale request receives `CATALOG_VERSION_CONFLICT` with `current_version` and `current_product`, so the client can refresh rather than overwrite another request.

The JSON transition runtime also uses an exclusive lock file and atomic temporary-file rename. A live lock causes a fail-closed `CATALOG_OPERATIONS_BUSY`; a stale lock older than 30 seconds may be recovered.

## Idempotency

Create and import require an `Idempotency-Key` between 8 and 200 characters. Inventory adjustment uses the same mechanism. Records are scoped by merchant and operation and store:

- a SHA-256 hash of the canonical request;
- operation name;
- response snapshot;
- affected product IDs;
- creation timestamp.

Repeating the same key and request returns the original result without creating or applying a second mutation. Reusing the key with a different request returns `CATALOG_IDEMPOTENCY_CONFLICT`. Records are pruned after 30 days and capped per merchant.

Import is atomic: all products are normalized and checked against each other and the current merchant catalog before any product is written. A failed row leaves the batch unchanged.

## Server-only dashboard

`ServerProductsPage.tsx` does not import the shared browser store, `getProducts`, `saveProducts`, `getCurrentMerchant`, LocalStorage, or SessionStorage. It reads and mutates only through the catalog API.

The page supports:

- server refresh and search;
- create, edit, and optimistic delete;
- product and variant identifiers;
- variant options and stock;
- reference-only product images;
- idempotent JSON import with same-key retry;
- idempotent stock increments/decrements;
- conflict refresh using `current_product`;
- inline Arabic, Kurdish Sorani, and English labels without editing shared translations.

## Read-only audit

Run directly until an integration-owned package script is added:

```bash
node scripts/audit-catalog-operations.mjs --json
```

Alternative source selection:

```bash
node scripts/audit-catalog-operations.mjs --file /path/to/catalog-inventory.json --json
node scripts/audit-catalog-operations.mjs --data-dir /path/to/data
```

The command never creates, edits, locks, or deletes catalog data. Exit codes:

- `0`: valid store or not initialized;
- `2`: integrity violations found;
- `1`: unreadable or malformed source / command failure.

The report includes source SHA-256, tenant and identifier violations, stock and price checks, image payload checks, optimistic versions, and proposed row counts for PostgreSQL mapping.

## PostgreSQL mapping requirements

The transition runtime must not be treated as the final persistence layer. The database lane should provide tenant-safe tables and constraints for products, variants, options, image references, identifier uniqueness, inventory mutations, and idempotency records. Exact requested constraints are recorded in the lane handoff.

## Rollback

Before router activation, rollback is deletion of the new isolated files. After activation, unmount the catalog router and restore the previous products-page export. Preserve `catalog-inventory.json` for forensic review or migration; deleting it removes the transition catalog and idempotency history.
