# Catalog and inventory lane handoff

## Status

Completed on branch `parallel/catalog-inventory` and left unmerged for the integration coordinator.

- Coordination starting SHA: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Final implementation SHA before this handoff-only commit: `80835473b7468b4b6e0a98f5f701c3c6c8dd7cde`
- Final branch SHA: the commit containing this handoff. It is reported in the completion message because a Git commit cannot contain its own SHA.
- Initial remote HEAD: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Remote HEAD was checked before every GitHub write. Every check was identical to the expected lane HEAD; no force push, rebase, merge, or cross-branch write occurred.

## Files changed

1. `artifacts/api-server/src/routes/catalog-operations.ts`
2. `artifacts/api-server/src/services/catalogInventoryRuntime.ts`
3. `artifacts/api-server/tests/catalog-inventory.test.ts`
4. `artifacts/api-server/tests/catalog-server-contract.test.mjs`
5. `artifacts/fawri/src/pages/dashboard/ServerProductsPage.tsx`
6. `artifacts/fawri/src/pages/dashboard/ProductsPage.ts`
7. `scripts/audit-catalog-operations.mjs`
8. `scripts/audit-catalog-operations.test.mjs`
9. `docs/catalog-inventory-runtime.md`
10. `docs/coordination/handoffs/catalog-inventory.md`

No forbidden file was intentionally changed. In particular, the legacy `ProductsPage.tsx`, shared store/types/translations, `app.ts`, `index.ts`, package files, lockfiles, workflows, `lib/db/**`, and other domain lanes were not edited.

## Behavior added

### Server-authoritative catalog runtime

- Added an isolated transitional JSON-backed catalog runtime at `catalog-inventory.json` under `FAWRI_DATA_DIR`.
- Added products, variants, option maps, product/variant SKU and barcode, stable import `external_ref`, integer IQD prices, aggregate stock, low-stock threshold, image references, timestamps, and optimistic versions.
- Added atomic temporary-file replacement and an exclusive lock file with stale-lock recovery.
- Added merchant-scoped list, read, create, atomic import, update, delete, inventory set, inventory adjustment, and merchant cleanup operations.
- Registered merchant catalog cleanup with the existing merchant runtime deletion registry without editing that shared service.

### Tenant isolation

- All route operations require `requireMerchantSession`.
- Merchant authority comes only from `getMerchantIdFromSession(res)`.
- A supplied top-level or nested `merchant_id` that differs from the authenticated merchant is rejected with `MERCHANT_ACCESS_FORBIDDEN`.
- Every product lookup, uniqueness check, idempotency record, mutation, and deletion is scoped inside the authenticated merchant catalog.
- A product belonging to another merchant is returned as not found, preventing cross-tenant existence disclosure.

### Validation and uniqueness

- Enforced non-empty bounded names and bounded descriptive fields.
- Enforced non-negative safe-integer IQD prices and maximum price bounds.
- Enforced compare-at price greater than or equal to active price.
- Enforced non-negative safe-integer product and variant stock.
- Enforced product stock equal to the sum of variant stock when variants exist.
- Enforced case-insensitive SKU uniqueness across all products and variants within one merchant.
- Enforced case-insensitive barcode uniqueness across all products and variants within one merchant.
- Enforced merchant-scoped `external_ref` uniqueness.
- Rejected duplicate variant IDs and duplicate normalized variant option signatures.
- Allowed the same identifiers under different merchants.

### Concurrency and idempotency

- Added positive `expected_version` requirements for update, delete, inventory set, and inventory adjustment.
- Stale writes fail with `CATALOG_VERSION_CONFLICT`, including `current_version` and `current_product`.
- Added required `Idempotency-Key` handling for create, import, and inventory adjustment.
- Repeating the same key and canonical request returns the original response without applying a duplicate mutation.
- Reusing a key with a different request fails with `CATALOG_IDEMPOTENCY_CONFLICT`.
- Idempotency records are merchant/operation scoped, retained for 30 days, and capped per merchant.
- Import validates the complete batch before writing any product; one invalid or duplicate row leaves the batch unchanged.

### Image safety

- Stores only URL or storage-key image references.
- Rejects binary-like fields including `data`, `base64`, `content`, `bytes`, and `blob`.
- Rejects `data:` URLs, `blob:` URLs, and embedded base64 references.
- Does not introduce a binary upload or media storage implementation.

### API

Added the following router paths, intentionally not mounted by this lane:

- `GET /catalog/products`
- `GET /catalog/products/:productId`
- `POST /catalog/products`
- `POST /catalog/products/import`
- `PATCH /catalog/products/:productId`
- `DELETE /catalog/products/:productId`
- `POST /inventory/products/:productId/set`
- `POST /inventory/products/:productId/adjust`

All API responses use `Cache-Control: no-store`. Successful idempotent replays set `Idempotent-Replay: true`.

### Server-only products page

- Added `ServerProductsPage.tsx` using only the catalog API as operational authority.
- Added server refresh, search, create, edit, optimistic delete, variants, option maps, SKU/barcode, image references, JSON import retry, and inventory adjustment.
- Uses the same idempotency key when retrying an uncertain create/import request.
- Refreshes the visible record from `current_product` after a version conflict.
- Contains inline Arabic, Kurdish Sorani, and English labels because shared translations are integration-owned.
- Added `ProductsPage.ts` re-export so normal TypeScript module resolution activates the server-only page without editing the forbidden legacy `ProductsPage.tsx`.
- The active page does not import `getProducts`, `saveProducts`, `getCurrentMerchant`, LocalStorage, or SessionStorage.

### Read-only audit and migration readiness

- Added `audit-catalog-operations.mjs` with text and JSON output.
- Audit validates store version, tenant ownership, product keys, names, prices, stock, positive versions, identifiers, external references, variants, aggregate stock, and embedded images.
- Audit reports source SHA-256 and proposed PostgreSQL row counts.
- Audit performs no create, edit, lock, or delete operation.
- Exit codes: `0` valid/not initialized, `2` integrity violations, `1` command/source failure.

## Behavior removed or superseded

- The active products-page module no longer treats browser storage or the shared client store as catalog authority.
- No fallback to stale locally cached products exists in the active server page.
- No client-supplied merchant ID is accepted as authorization for the new catalog routes.
- The old `ProductsPage.tsx` remains in the repository unchanged for rollback/reference and is superseded by `ProductsPage.ts` during module resolution.

## Tests and checks executed

All checks used temporary local data directories and did not contact a real database or service.

### Catalog runtime tests

Command:

```bash
tsc -p /mnt/data/fawri-catalog-test/tsconfig.json
node --test /mnt/data/fawri-catalog-test/dist/tests/catalog-inventory.test.js
```

Outcome:

- TypeScript compilation: passed with no diagnostics.
- Tests: `9 passed`, `0 failed`.
- Covered create idempotency/key conflict, cross-tenant read/update/inventory/delete, tenant-local identifier reuse, merchant-wide SKU/barcode uniqueness including variants, duplicate variants, invalid prices, embedded images, negative stock, idempotent adjustment, stale concurrent writes, variant aggregate stock, atomic/idempotent import, duplicate import prevention, product deletion, and merchant cleanup.

### Router type check

Command:

```bash
tsc -p /mnt/data/fawri-catalog-route-check/tsconfig.json
```

Outcome: passed with no diagnostics using isolated declarations for integration-owned dependencies.

### Server products page parser/type check

Command:

```bash
tsc -p /mnt/data/fawri-products-ui-check/tsconfig.json
```

Outcome: passed with no diagnostics using isolated React/project-module declarations. This verifies JSX/TypeScript structure but is not a substitute for the full workspace build.

### Static server contract tests

Command:

```bash
node --test /mnt/data/fawri-catalog/artifacts/api-server/tests/catalog-server-contract.test.mjs
```

Outcome: `3 passed`, `0 failed`.

Covered session-derived tenant authority, server-only active page/module shadowing, and embedded image payload rejection contract.

### Audit syntax and tests

Commands:

```bash
node --check /mnt/data/fawri-catalog/scripts/audit-catalog-operations.mjs
node --check /mnt/data/fawri-catalog/scripts/audit-catalog-operations.test.mjs
node --test /mnt/data/fawri-catalog/scripts/audit-catalog-operations.test.mjs
```

Outcome:

- Both syntax checks passed.
- Tests: `4 passed`, `0 failed`.
- Covered clean migration readiness, integrity violations, source hash/mtime proving read-only behavior, and exit code `2` without source rewrite.

### Aggregate result

- Automated tests executed: `16 passed`, `0 failed`.
- Additional isolated TypeScript checks: service/tests, router, and frontend parser/type checks all passed.
- Full repository build: not executed in this lane environment.
- GitHub Actions/CI: not run. Package scripts and workflow files are integration-owned and were not edited.

## Shared-file integration requests

### 1. Mount the router

In `artifacts/api-server/src/app.ts`, add:

```ts
import catalogOperationsRouter from "./routes/catalog-operations";
```

Then mount it with the other authenticated operational routers before the generic `app.use("/api", router)`:

```ts
app.use("/api", catalogOperationsRouter);
```

The router performs its own merchant-session requirement. Do not expose it ahead of the existing security/session middleware chain.

### 2. Switch bot/product knowledge reads during controlled cutover

The legacy generic router currently owns a separate `productsByMerchant` runtime used by bot product matching. After review, replace that legacy product authority with a controlled adapter over `listCatalogProducts(merchantId)` from `catalogInventoryRuntime.ts`, mapping:

- `price_iqd` to the bot's active/current price field;
- `stock_quantity` to quantity;
- `image_refs` only as references;
- variants and identifiers without broadening tenant scope;
- `allow_fawri_reply === false`, `draft`, and `hidden_from_fawri` as excluded from bot replies.

This change belongs to the integration coordinator because `routes/index.ts` is reserved. Until this is done, the new dashboard catalog and the legacy bot catalog are separate authorities.

### 3. Add package scripts

Suggested integration-owned API package script:

```json
"test:catalog-inventory": "pnpm exec tsx --test ./tests/catalog-inventory.test.ts && node --test ./tests/catalog-server-contract.test.mjs"
```

Suggested root scripts:

```json
"audit:catalog": "node scripts/audit-catalog-operations.mjs --json",
"test:audit-catalog": "node --test scripts/audit-catalog-operations.test.mjs"
```

Use the workspace's final test convention when integrating; no package or lockfile was changed here.

### 4. Backup and migration inventory

Until PostgreSQL cutover, include `catalog-inventory.json` in backup/restore inventory and ensure `FAWRI_DATA_DIR` is writable only by the service account. Do not treat the JSON file as a horizontally scalable store.

### 5. Types and translations

No shared type or translation is required to compile the isolated files. The coordinator may later move the inline AR/KU/EN labels and catalog contracts into shared translation/type modules after reviewing naming and schema contracts.

## Database schema requests

Database ownership remains with the PostgreSQL lane. Requested durable schema:

### `catalog_products`

- Composite tenant identity or unique key on `(merchant_id, id)`.
- Tenant-safe composite foreign key to merchant/account ownership.
- Columns for `external_ref`, name, description, category, price IQD, compare-at price IQD, stock quantity, low-stock threshold, status, `allow_fawri_reply`, timestamps, and positive version.
- Merchant-scoped normalized/case-insensitive uniqueness for non-null `external_ref`.
- Checks: price and compare-at price are non-negative integers; compare-at is null or greater than/equal to price; stock and threshold are non-negative integers; version is positive.

### `catalog_variants`

- Tenant-safe composite foreign key `(merchant_id, product_id)` to `catalog_products`.
- Tenant/product unique identity `(merchant_id, product_id, id)`.
- Name, optional price override, non-negative stock, timestamps.
- Checks for non-negative integer stock/price.

### `catalog_variant_options`

- Tenant-safe composite foreign key to the variant.
- Normalized option name unique within a variant.
- Preserve deterministic normalized option signature and enforce one signature per product, either with a generated signature column or a transactionally maintained equivalent.

### `catalog_identifiers`

Because SKU/barcode uniqueness spans products and variants, prefer one normalized registry table:

- `merchant_id`
- `kind` (`sku` or `barcode`)
- `normalized_value`
- display value
- `product_id`
- nullable `variant_id`
- exactly one valid tenant-owned product/variant target
- unique `(merchant_id, kind, normalized_value)`
- tenant-safe composite foreign keys and cascade cleanup

### `catalog_image_references`

- Tenant/product/optional variant owner columns with tenant-safe composite foreign keys.
- URL and/or object-storage key, alt text, ordering, timestamps.
- Reject binary payload columns.
- Check that at least one of URL/storage key exists and prohibit path traversal/unsupported schemes at the service boundary.

### `catalog_idempotency_keys`

- Unique `(merchant_id, operation, key_hash)`.
- Request hash, response/status snapshot or durable result reference, affected product IDs, created/expiry timestamps.
- Tenant-safe foreign keys where result references are retained.
- Cleanup policy compatible with the current 30-day application retention.

### `inventory_mutations`

- Tenant/product/optional variant owner.
- Delta or absolute mutation type, before/after quantity, expected/result version, reason, actor/session metadata, idempotency key/hash, and timestamps.
- Unique merchant/operation idempotency identity.
- Checks ensuring before/after quantities are non-negative integers.
- Transactional mutation using row locking or `UPDATE ... WHERE version = expected_version` and atomic version increment.

### Cross-table requirements

- All foreign keys must include `merchant_id` so cross-tenant product/variant/image/inventory references are impossible.
- Product stock with variants must be transactionally reconciled from variant stock or protected by a database invariant/trigger reviewed by the DB lane.
- Deletes should cascade to variants, options, identifiers, image references, inventory records as retention policy permits, and idempotency records that reference deleted transient results.
- Migration must use deterministic source manifests, the audit source SHA-256, and source revalidation immediately before commit.

## Known risks and intentionally deferred work

1. The JSON runtime is transitional. Its lock is suitable for one shared filesystem/service deployment, not distributed multi-instance writes.
2. The router is not active until the integration coordinator mounts it.
3. The legacy bot product runtime remains separate until the reserved generic router is adapted.
4. Full workspace build and CI were not run in this lane environment.
5. Binary upload, malware scanning, image resizing, object storage, signed URLs, and media retention are not implemented; only references are accepted.
6. Idempotency response snapshots are retained in JSON for 30 days and capped; the PostgreSQL implementation should use bounded durable records and cleanup jobs.
7. Existing legacy product data is not silently imported. A controlled migration must normalize stable identifiers and fail closed on duplicates or invalid stock/prices.
8. The inline translations avoid prohibited shared-file edits but should be centralized later if the integration coordinator approves exact translation keys.

## Rollback notes

Before router activation:

- Remove the new isolated catalog files or revert this branch; no runtime path is active.

After router/page activation:

1. Unmount `catalogOperationsRouter` from `app.ts`.
2. Remove or revert `ProductsPage.ts` so module resolution returns to the existing legacy `ProductsPage.tsx`.
3. Preserve `catalog-inventory.json` for forensic review/export rather than deleting it immediately.
4. Restore the prior product authority only after confirming no new catalog writes need reconciliation.
5. Revert any bot-read adapter separately; do not combine rollback data across merchants.
6. For PostgreSQL cutover rollback, follow the DB lane's migration/backup procedure and retain the audited JSON source until reconciliation completes.

## External services and real data

- Real PostgreSQL/database contacted: `no`.
- Replit or production runtime contacted: `no`.
- Meta, WhatsApp, AI, object storage, or other external service contacted: `no`.
- Customer or merchant production data read or mutated: `no`.
- GitHub repository contacted: `yes`, only to read the coordination plan/source contracts and push this lane's allowed files.
- Local temporary test files created: `yes`, under isolated temporary directories and removed after tests.
