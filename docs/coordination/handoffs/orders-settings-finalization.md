# Orders and Settings Finalization Handoff

## Branch ownership

- Repository: `nora953/fawri-production-source`
- Branch: `parallel/orders-settings-finalization`
- Starting remote HEAD: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Final implementation SHA before the documentation scope correction: `7275fe816f6950c31204c2dd5a99809f19e67877`.
- Documentation scope-correction SHA before this handoff update: `7dae1bc7ba9da871d602591b97c73bc212ad923d`.
- Merge performed: no
- Force push used: no

## Documentation scope correction

- Moved `docs/architecture/orders-settings-server-authority.md` to the lane-owned path `docs/order-settings-server-authority.md`.
- Removed the old out-of-allowlist path.
- Updated this handoff to reference only the new path.
- No runtime feature, shared file, package file, workflow, database schema, Meta, auth, catalog, `app.ts`, `index.ts`, legacy LocalStorage `.tsx` page, shared store/type/translation file, or another branch was modified as part of this correction.

## Completed implementation

### Server-authoritative orders

- Kept all active order reads and writes on the API; no browser-storage fallback exists in the active server page.
- Added strict tenant validation for runtime merchant buckets, record tenant IDs, missing IDs, and duplicate IDs.
- Kept mandatory `expected_version` compare-and-swap semantics and current-server-state conflict responses.
- Enforced the order state machine on the server.
- Restricted the generic payment-status endpoint to non-terminal states.
- Generic attempts to set `paid` or `failed` return `ORDER_PAYMENT_TERMINAL_OPERATION_REQUIRED`.
- Electronic `paid` and `failed` can only be produced by the dedicated confirm/reject operations.
- Cash-on-delivery `paid` can only be produced by the dedicated confirm operation after `delivered`.
- Upgraded the order operation store to version 2 while retaining read migration from version 1.
- Added append-only payment decision audit records and linked each terminal order overlay to its last decision.
- Unified paid/failed metadata and wrote terminal state plus audit decision under the same lock/atomic replacement.
- Deletion removes order overlays and payment decision records for the merchant.

### Server-authoritative merchant settings

- Kept the active settings page API-only with mandatory `expected_version`.
- Added strict patch field/type validation and tenant-key validation.
- On true-to-false auto-reply changes, waiting `queued`/`retry` Meta reply jobs are atomically marked completed/suppressed before the settings write succeeds.
- Suppressed jobs explicitly record `credit_consumed: false` and the resulting settings version.
- Processing jobs are reported in the API effect summary but are not stolen from their worker lease.
- Deletion removes merchant settings and all durable jobs belonging to that merchant.

### Active frontend path

- Added `OrdersPage.ts` -> `ServerOrdersPage`.
- Verified the existing `SettingsPage.ts` -> `ServerSettingsPage` active mapping; no change was required.
- This intentionally shadows the legacy `.tsx` LocalStorage pages without modifying them.
- Removed terminal payment choices from the generic payment-state UI.
- Added dedicated confirm/reject actions, stale-version refresh behavior, and last payment decision display.
- No LocalStorage or SessionStorage exists in the active order/settings modules.

### Audits and migration readiness

- Order audit validates store version, tenant boundaries, duplicate IDs, terminal decision provenance, decision-to-overlay linkage, versions, payment metadata, and PostgreSQL migration blockers.
- Settings audit validates settings shape, tenant ownership, disabled-merchant waiting jobs, suppression metadata, credit flags, orphan jobs, and PostgreSQL migration blockers.
- Architecture/runtime contract documentation is at `docs/order-settings-server-authority.md`.

## Tests added

- Unit/runtime: `artifacts/api-server/tests/orders-settings-runtime.test.ts`
  - terminal payment guard;
  - atomic confirmation audit;
  - atomic rejection metadata;
  - stale-write conflict;
  - tenant mismatch fail-closed;
  - queued/retry suppression without credit;
  - cross-tenant queue isolation;
  - deletion cleanup.
- HTTP integration: `artifacts/api-server/tests/order-payment-hardening.integration.test.mjs`
  - authenticated endpoint behavior;
  - generic terminal rejection;
  - cross-tenant order denial;
  - dedicated decision persistence;
  - state-machine rejection;
  - stale-device conflict.
- Existing integration suites remain relevant:
  - `order-operations.integration.test.mjs`
  - `merchant-settings.integration.test.mjs`
- Static contracts: `artifacts/api-server/tests/orders-settings-static-contract.test.mjs`
- Audit fixture test: `scripts/tests/orders-settings-audits.test.mjs`

## Verification rerun after documentation correction

The correction changed documentation paths only. The same lane verification set requested by review was rerun from a verification snapshot sourced from the current GitHub branch files.

Passed:

- strict TypeScript check for `orderOperationsRuntime.ts`, `merchantSettingsRuntime.ts`, their direct runtime dependencies, and `orders-settings-runtime.test.ts`: PASS;
- runtime suite `orders-settings-runtime.test.ts`: **5/5 PASS**;
- static contract suite `orders-settings-static-contract.test.mjs`: **4/4 PASS**;
- audit fixture suite `orders-settings-audits.test.mjs`: **1/1 PASS**;
- `ServerOrdersPage.tsx` TypeScript/JSX parse/type check using local module shims: PASS.

Not run / not claimed:

- Full Workspace Build: **not run**.
- Bundled API full build and spawned-server integration suites: **not rerun in this correction environment**.
- GitHub Actions / GitHub CI for the correction commits: **not run**; no workflow run was present for the correction SHA when checked.

No production database, Replit database, Meta endpoint, customer data, or other real external service was contacted by these verification checks.

## Shared-file requests (not modified)

### `artifacts/api-server/src/app.ts`

Mount the existing settings router next to the order router:

```ts
import merchantSettingsRouter from "./routes/merchant-settings";
// ...
app.use("/api", orderOperationsRouter);
app.use("/api", merchantSettingsRouter);
```

This is required for `/api/settings` and the existing merchant settings HTTP integration test. The lane did not modify `app.ts`.

### `artifacts/api-server/package.json`

Add scripts without changing dependencies:

```json
{
  "test:orders-settings-unit": "pnpm exec tsx --test ./tests/orders-settings-runtime.test.ts",
  "test:orders-settings-static": "node --test ./tests/orders-settings-static-contract.test.mjs",
  "test:orders-settings-integration": "node ./build.mjs && node --test ./tests/order-operations.integration.test.mjs ./tests/order-payment-hardening.integration.test.mjs ./tests/merchant-settings.integration.test.mjs",
  "test:orders-settings-audits": "node --test ../../scripts/tests/orders-settings-audits.test.mjs"
}
```

### Workflow request

Add the four scripts above to the integration workflow and upload the two read-only audit JSON outputs as CI artifacts when fixture or migration jobs run. No workflow file was modified by this lane.

### `services/durableJobQueue.ts` shared API request

Replace direct store coordination in a later integration change with exported transactional functions:

- `suppressMerchantJobs({ merchantId, type, statuses, result })`
- `deleteMerchantJobs(merchantId)`

The functions must use the queue's existing lock and return exact changed/processing counts. The lane's current implementation uses the same lock/file contract without modifying this shared service.

### `services/metaWebhookWorker.ts` shared race-closure request

Before reserving reply credit and immediately before the external Meta send, re-read merchant settings and compare the current settings version/auto-reply flag. If disabled or version-invalidated:

- suppress the job;
- do not reserve or increment reply usage;
- if a reservation already happened in the same attempt, roll it back in the same transaction;
- emit `MERCHANT_AUTO_REPLY_DISABLED` with `credit_consumed: false`.

The existing pre-replay check covers waiting jobs and most claimed jobs, but this second check is required to close the narrow race where a worker passed the first check while the merchant disabled replies.

## PostgreSQL schema requests (not implemented)

### 1. `merchant_operational_settings`

Required columns:

- `merchant_id` UUID/TEXT primary key and foreign key to merchants with `ON DELETE CASCADE`;
- `version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)`;
- `auto_reply_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
- `reply_language TEXT NOT NULL CHECK (reply_language IN ('auto','ar','ku','en'))`;
- `delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
- `delivery_fee_iqd BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_iqd >= 0)`;
- `free_delivery_threshold_iqd BIGINT NULL CHECK (free_delivery_threshold_iqd >= 0)`;
- `estimated_days_min INTEGER NOT NULL CHECK (estimated_days_min BETWEEN 1 AND 365)`;
- `estimated_days_max INTEGER NOT NULL CHECK (estimated_days_max BETWEEN 1 AND 365 AND estimated_days_max >= estimated_days_min)`;
- `delivery_areas JSONB NOT NULL DEFAULT '[]'::jsonb` with an array-shape constraint;
- `delivery_notes TEXT NOT NULL DEFAULT ''` with length <= 1000;
- `cash_on_delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
- `electronic_payment_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
- `payment_methods JSONB NOT NULL DEFAULT '["cash_on_delivery"]'::jsonb` with allowed-value and consistency constraints;
- `payment_instructions TEXT NOT NULL DEFAULT ''` with length <= 2000;
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

Write contract:

```sql
UPDATE merchant_operational_settings
SET ..., version = version + 1, updated_at = now()
WHERE merchant_id = $merchant_id AND version = $expected_version
RETURNING *;
```

Zero rows means version conflict. The current row must then be returned read-only.

### 2. Effective `orders` columns/constraints

Required effective columns (whether on the canonical orders table or a dedicated operations table):

- `id`;
- `merchant_id` foreign key with `ON DELETE CASCADE`;
- unique/primary tenant key `(merchant_id, id)`;
- `version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)`;
- constrained `status`;
- constrained `payment_method`;
- constrained `payment_status`;
- `payment_verified_at TIMESTAMPTZ NULL`;
- `payment_verified_by` merchant/admin actor FK or immutable actor identifier;
- `payment_rejection_reason TEXT NULL CHECK (length <= 500)`;
- `last_payment_decision_id UUID NULL`;
- `updated_at TIMESTAMPTZ NOT NULL`.

Metadata constraints:

- paid => verified time/actor present and rejection reason null;
- failed => rejection reason present and verification fields null;
- non-terminal => all terminal metadata null;
- cash-on-delivery cannot use electronic pending/manual/failed states;
- electronic methods cannot use `cash_on_delivery` payment status.

Every mutation must use `(merchant_id, id, version)` in its `WHERE` clause. Never query or update by order ID alone.

### 3. `order_payment_decisions`

Required columns:

- `id UUID PRIMARY KEY`;
- `merchant_id`;
- `order_id`;
- composite FK `(merchant_id, order_id)` -> orders with `ON DELETE CASCADE`;
- `operation TEXT NOT NULL CHECK (operation IN ('confirm','reject','legacy_import'))`;
- `payment_channel TEXT NOT NULL CHECK (payment_channel IN ('electronic','cash_on_delivery'))`;
- `outcome TEXT NOT NULL CHECK (outcome IN ('paid','failed'))`;
- previous/resulting payment and order status columns with the same enums/checks as orders;
- `actor_type TEXT NOT NULL CHECK (actor_type IN ('merchant','admin','system'))`;
- `actor_id TEXT NOT NULL`;
- `request_id TEXT NULL`;
- `reason TEXT NULL CHECK (length <= 500)`;
- `expected_version BIGINT NOT NULL`;
- `resulting_version BIGINT NOT NULL CHECK (resulting_version = expected_version + 1)`;
- `decided_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
- unique `(merchant_id, order_id, resulting_version)`;
- optional unique/partial idempotency key `(merchant_id, request_id)` when request ID is present.

Confirmation/rejection transaction:

1. lock/read the tenant order;
2. validate method, state machine, and expected version;
3. update order with `version = version + 1`;
4. insert the decision with the resulting version;
5. set `last_payment_decision_id`;
6. commit all three effects together or roll back all.

The generic payment-status SQL path must reject terminal targets before any update.

### 4. `background_jobs`

Required columns/constraints for this lane:

- `merchant_id` FK to merchants with `ON DELETE CASCADE`;
- type, status, available/lock/completion timestamps;
- result JSONB;
- settings version observed for reply jobs;
- index `(merchant_id, type, status, available_at)`;
- unique dedupe key per job type.

Settings disable transaction must update matching `queued`/`retry` reply jobs to suppressed/completed with `credit_consumed=false` before commit. Claimed jobs require the worker-side version check described above.

### 5. Tenant isolation and RLS

Enable RLS for settings, orders, payment decisions, and background jobs. Merchant requests must set a transaction-local tenant context and policies must require `merchant_id` equality. Administrative access must use a separate audited role; no merchant endpoint may accept a tenant ID as authority.

## Data migration requests

1. Run both lane audits against the frozen JSON data and block cutover on any error.
2. Insert one settings row per persisted settings record; merchants without a row use documented defaults or an idempotent backfill.
3. Materialize effective orders by combining runtime base rows and operation overlays.
4. Import version-2 payment decisions first or in the same transaction as terminal order overlays.
5. For legacy terminal rows without a decision, create an immutable `legacy_import` decision with `actor_type='system'`, source file/hash, and migration batch ID. Do not invent a merchant confirmation actor.
6. Verify per-tenant counts and hashes before switching reads.
7. Dual-write is not recommended unless both writes share an outbox/idempotency key; prefer a frozen write window plus verified cutover.
8. After cutover, run SQL equivalents of both audits and retain the reports.

## Workflow/integration risks

- `/api/settings` remains unavailable until the coordinator mounts the router in `app.ts`.
- A processing Meta reply can race with disabling auto reply after the worker's current first settings check. The shared second-check request above is mandatory before production sign-off.
- JSON file locks are single-host coordination only. Production multi-instance deployment requires PostgreSQL row locks/transactions.
- Version-1 terminal order overlays have no trustworthy decision provenance; the audit reports migration required and PostgreSQL import must mark them as `legacy_import`.

## Rollback notes

- The documentation-only correction can be rolled back by restoring the previous path, but that would reintroduce the reviewed allowlist violation and therefore is not recommended.
- Runtime rollback remains a branch-level revert of this lane before integration; no production data or schema was changed.
- The lane did not merge into `main` or `hardening/postgresql-foundation`.

## Files changed in this lane

- `artifacts/api-server/src/routes/order-operations.ts`
- `artifacts/api-server/src/routes/merchant-settings.ts`
- `artifacts/api-server/src/services/orderOperationsRuntime.ts`
- `artifacts/api-server/src/services/merchantSettingsRuntime.ts`
- `artifacts/api-server/tests/orders-settings-runtime.test.ts`
- `artifacts/api-server/tests/order-payment-hardening.integration.test.mjs`
- `artifacts/api-server/tests/orders-settings-static-contract.test.mjs`
- `artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx`
- `artifacts/fawri/src/pages/dashboard/OrdersPage.ts`
- `scripts/audit-order-operations.mjs`
- `scripts/audit-merchant-settings.mjs`
- `scripts/tests/orders-settings-audits.test.mjs`
- `docs/order-settings-server-authority.md`
- `docs/coordination/handoffs/orders-settings-finalization.md`
