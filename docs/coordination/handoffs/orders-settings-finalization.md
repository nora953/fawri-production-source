# Orders and Settings Finalization Handoff

## Branch ownership

- Repository: `nora953/fawri-production-source`
- Branch: `parallel/orders-settings-finalization`
- Starting remote HEAD: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Final implementation SHA before documentation scope correction: `7275fe816f6950c31204c2dd5a99809f19e67877`
- Documentation scope-correction SHA before handoff updates: `7dae1bc7ba9da871d602591b97c73bc212ad923d`
- Merge performed: no
- Force push used: no

## Documentation scope correction

- The server-authority document was moved out of the non-owned architecture directory into the lane-owned path `docs/order-settings-server-authority.md`.
- The former out-of-allowlist file was removed.
- All live documentation references now use `docs/order-settings-server-authority.md`.
- No feature, shared file, package file, workflow, database schema, Meta, auth, catalog, `app.ts`, `index.ts`, legacy LocalStorage `.tsx` page, shared store/type/translation file, or another branch was modified as part of this correction.

## Completed implementation

### Server-authoritative orders

- Active order reads/writes are API-only; there is no browser-storage operational fallback.
- Runtime merchant buckets, order IDs, and record tenant IDs fail closed on invalid or cross-tenant data.
- Every mutation requires `expected_version`; stale writes return `ORDER_VERSION_CONFLICT` with current server state.
- The server enforces the order state machine.
- The generic payment-status operation is restricted to non-terminal states.
- Generic `paid`/`failed` writes return `ORDER_PAYMENT_TERMINAL_OPERATION_REQUIRED`.
- Electronic `paid`/`failed` are produced only by dedicated confirm/reject operations.
- Cash-on-delivery becomes `paid` only through dedicated confirmation after `delivered`.
- Order operation store v2 contains append-only payment decision audits linked to terminal overlays.
- Paid/failed metadata and the payment decision are persisted under the same exclusive lock/atomic replacement.
- Merchant deletion removes order overlays and payment decision records.

### Server-authoritative merchant settings

- The active settings page is API-only and uses mandatory `expected_version`.
- Patch field/type validation and tenant-key validation are server-side.
- Turning auto reply from true to false suppresses waiting `queued`/`retry` Meta reply jobs before the settings write succeeds.
- Suppressed jobs record `credit_consumed: false` and the resulting settings version.
- Already-processing jobs are observed but their worker lease is not stolen.
- Merchant deletion removes merchant settings and the merchant's durable jobs.

### Active frontend path

- `OrdersPage.ts` re-exports `ServerOrdersPage`.
- Existing `SettingsPage.ts` re-exports `ServerSettingsPage`.
- Legacy LocalStorage `.tsx` pages were not modified.
- The generic payment UI exposes only non-terminal payment states; confirm/reject use dedicated endpoints.
- Active order/settings modules contain no LocalStorage or SessionStorage authority/fallback.

### Audits and migration readiness

- `scripts/audit-order-operations.mjs` checks tenant boundaries, duplicate IDs, versions, terminal decision provenance/linkage, payment metadata, and migration blockers.
- `scripts/audit-merchant-settings.mjs` checks settings ownership/shape, disabled-merchant waiting jobs, suppression metadata/credit flags, orphan jobs, and migration blockers.
- Runtime contract documentation: `docs/order-settings-server-authority.md`.

## Tests added

- `artifacts/api-server/tests/orders-settings-runtime.test.ts`
- `artifacts/api-server/tests/order-payment-hardening.integration.test.mjs`
- `artifacts/api-server/tests/orders-settings-static-contract.test.mjs`
- `scripts/tests/orders-settings-audits.test.mjs`
- Existing relevant integration suites: `order-operations.integration.test.mjs`, `merchant-settings.integration.test.mjs`

## Verification rerun after documentation correction

The correction changed documentation paths only. The requested verification set was rerun from a verification snapshot sourced from the current GitHub branch files.

Passed:

- strict TypeScript check for `orderOperationsRuntime.ts`, `merchantSettingsRuntime.ts`, direct runtime dependencies, and `orders-settings-runtime.test.ts`: PASS
- runtime suite `orders-settings-runtime.test.ts`: **5/5 PASS**
- static contract suite `orders-settings-static-contract.test.mjs`: **4/4 PASS**
- audit fixture suite `orders-settings-audits.test.mjs`: **1/1 PASS**
- `ServerOrdersPage.tsx` TypeScript/JSX parse/type check using local module shims: PASS

Not run / not claimed:

- Full Workspace Build: **not run**
- Bundled API full build and spawned-server integration suites: **not rerun in this correction environment**
- GitHub Actions / GitHub CI: **not run**; no workflow run was present for the correction SHA when checked

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

This is required for `/api/settings` and the existing merchant-settings HTTP integration suite. This lane did not modify `app.ts`.

### `artifacts/api-server/package.json`

Requested scripts, without dependency changes:

```json
{
  "test:orders-settings-unit": "pnpm exec tsx --test ./tests/orders-settings-runtime.test.ts",
  "test:orders-settings-static": "node --test ./tests/orders-settings-static-contract.test.mjs",
  "test:orders-settings-integration": "node ./build.mjs && node --test ./tests/order-operations.integration.test.mjs ./tests/order-payment-hardening.integration.test.mjs ./tests/merchant-settings.integration.test.mjs",
  "test:orders-settings-audits": "node --test ../../scripts/tests/orders-settings-audits.test.mjs"
}
```

### Workflow request

Run the four scripts above in the integration workflow and upload the two read-only audit JSON reports as CI artifacts for fixture/migration jobs. No workflow was modified by this lane.

### `services/durableJobQueue.ts` shared API request

Replace direct queue-file coordination during integration with exported transactional APIs:

- `suppressMerchantJobs({ merchantId, type, statuses, result })`
- `deleteMerchantJobs(merchantId)`

They must use the queue's existing lock and return exact changed/processing counts.

### `services/metaWebhookWorker.ts` shared race-closure request

Immediately before reply-credit reservation and again before external Meta delivery, re-read merchant settings/version. If auto reply was disabled or the version is invalidated:

- suppress the job;
- do not consume new reply credit;
- roll back a same-attempt reservation if one already occurred;
- return `MERCHANT_AUTO_REPLY_DISABLED` with `credit_consumed: false`.

This closes the narrow race for a job already claimed when auto reply is disabled.

## PostgreSQL schema requests (not implemented)

### 1. `merchant_operational_settings`

Required:

- `merchant_id` UUID/TEXT primary key/FK to merchants, `ON DELETE CASCADE`
- `version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)`
- `auto_reply_enabled BOOLEAN NOT NULL DEFAULT TRUE`
- `reply_language` constrained to `auto|ar|ku|en`
- delivery enabled/fee/free-threshold/min/max columns with nonnegative/range checks
- delivery areas JSONB array, delivery notes length <= 1000
- cash/electronic-payment enable flags
- payment methods JSONB with allowed-value/consistency checks
- payment instructions length <= 2000
- `created_at`, `updated_at` TIMESTAMPTZ

Optimistic write contract:

```sql
UPDATE merchant_operational_settings
SET ..., version = version + 1, updated_at = now()
WHERE merchant_id = $merchant_id AND version = $expected_version
RETURNING *;
```

Zero rows means version conflict; return the current row read-only.

### 2. Effective `orders` contract

Required:

- tenant key `(merchant_id, id)` unique/primary; merchant FK `ON DELETE CASCADE`
- `version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0)`
- constrained order/payment method/payment status
- `payment_verified_at`, `payment_verified_by`, `payment_rejection_reason`, `last_payment_decision_id`, `updated_at`
- paid => verification time/actor present and rejection null
- failed => rejection present and verification fields null
- non-terminal => terminal metadata null
- cash/electronic payment-state consistency constraints
- all mutation predicates include `(merchant_id, id, version)`

### 3. `order_payment_decisions`

Required:

- UUID primary key
- `merchant_id`, `order_id` with composite FK to orders, `ON DELETE CASCADE`
- `operation` constrained to `confirm|reject|legacy_import`
- `payment_channel` constrained to `electronic|cash_on_delivery`
- `outcome` constrained to `paid|failed`
- previous/resulting order/payment states
- `actor_type` constrained to `merchant|admin|system`, plus immutable `actor_id`
- optional `request_id`, optional reason <= 500
- `expected_version`, `resulting_version` with `resulting_version = expected_version + 1`
- `decided_at`
- unique `(merchant_id, order_id, resulting_version)`
- optional unique/partial `(merchant_id, request_id)` when request ID exists

Confirm/reject must be one transaction: lock tenant order, validate state/version, update order/version, insert decision, set `last_payment_decision_id`, commit all or roll back all. Generic payment-status SQL must reject terminal targets before mutation.

### 4. `background_jobs`

Required for this lane:

- `merchant_id` FK `ON DELETE CASCADE`
- job type/status/availability/lock/completion timestamps
- result JSONB
- settings version observed by reply jobs
- index `(merchant_id, type, status, available_at)`
- unique dedupe key per job type

Auto-reply disable must transactionally suppress matching queued/retry reply jobs with `credit_consumed=false`. Claimed jobs require the worker-side version recheck above.

### 5. Tenant isolation / RLS

Enable RLS for settings, orders, payment decisions, and background jobs. Merchant transactions must use transaction-local tenant context and policies requiring matching `merchant_id`. Administrative access must use a separate audited role.

## Data migration requests

1. Run both lane audits against frozen JSON and block cutover on any error.
2. Insert persisted settings; backfill documented defaults idempotently where no settings row exists.
3. Materialize effective orders from runtime base rows plus operation overlays.
4. Import v2 payment decisions with their terminal overlays in the same transaction/order-safe sequence.
5. Legacy terminal rows without trustworthy decisions become immutable `legacy_import` decisions with `actor_type='system'`, source hash/file, and migration batch ID; do not invent merchant confirmation actors.
6. Verify tenant counts/hashes before read cutover.
7. Prefer a frozen write window plus verified cutover; dual-write only with transactional outbox/idempotency.
8. Run SQL equivalents of both audits after cutover and retain reports.

## Known integration risks / intentionally deferred work

- `/api/settings` requires the coordinator's `app.ts` router mount.
- A processing Meta reply can race with disabling auto reply after the worker's first settings check; the second-check shared request is required before production sign-off.
- JSON locks are single-host only; multi-instance production requires PostgreSQL transactions/row locks.
- Store-v1 terminal overlays lack trustworthy decision provenance and require `legacy_import` treatment.

## Rollback notes

- Runtime changes can be reverted at branch/integration level; no production schema/data was changed.
- Reintroducing the former documentation location would recreate the reviewed allowlist violation and should not be used.
- No merge to `main` or `hardening/postgresql-foundation` was performed.

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
