# Orders and Merchant Settings Server Authority

## Scope

This lane makes the API the only operational source of truth for merchant orders and merchant settings. The active dashboard modules are `OrdersPage.ts` and `SettingsPage.ts`; they re-export the server-backed pages and do not read or write browser storage.

## Order write contract

Every order mutation is tenant-scoped by the merchant session and requires `expected_version`.

- A stale version returns `409 ORDER_VERSION_CONFLICT` with the current server order.
- The server validates the order state machine before writing.
- The generic payment-status operation is limited to the non-terminal electronic states `electronic_pending` and `manual_review` (or a cash-on-delivery no-op).
- `paid` and `failed` are rejected by the generic operation with `ORDER_PAYMENT_TERMINAL_OPERATION_REQUIRED`.
- Electronic payment confirmation and rejection use the dedicated operations only.
- Cash-on-delivery can be marked paid only through the dedicated confirmation operation and only after the order is delivered.
- Confirmation/rejection updates the order overlay and appends the payment decision audit record under one exclusive lock and one atomic file replacement.

The effective order is the server runtime order plus its server operation overlay. Browser state is never used as a fallback.

## Payment decision metadata

A decision records:

- merchant and order IDs;
- operation (`confirm` or `reject`), payment channel, and outcome;
- previous/resulting order and payment states;
- merchant actor and request correlation ID;
- rejection reason when applicable;
- expected and resulting versions;
- decision timestamp.

Compatibility fields remain normalized:

- `paid`: `payment_verified_at` and `payment_verified_by` are present; rejection reason is absent.
- `failed`: rejection reason is present; verification fields are absent.
- non-terminal states: all terminal metadata is absent.

## Tenant isolation

Order runtime data fails closed when:

- a merchant bucket is not an array;
- a record has no ID or duplicates another ID in the same tenant bucket;
- a record's `merchant_id` differs from the containing merchant bucket.

The order returned to the client always uses the authenticated tenant ID, not an untrusted value from the runtime record. Settings records similarly fail closed when the map key and record `merchant_id` differ.

## Auto-reply disable behavior

When `auto_reply_enabled` changes from true to false, the settings transaction acquires the durable queue lock before committing the new settings version. Waiting `meta.webhook.reply` jobs for the merchant in `queued` or `retry` are completed as suppressed with:

```json
{
  "delivery_status": "suppressed",
  "suppression_code": "MERCHANT_AUTO_REPLY_DISABLED",
  "credit_consumed": false,
  "settings_version": 2
}
```

Jobs already claimed as `processing` are counted but not modified because the worker owns their lease. The existing worker checks the setting before internal replay. A shared-worker request remains to repeat the version check immediately before quota reservation and external delivery, closing the narrow already-claimed race.

## Merchant deletion

The registered deletion handlers remove:

- merchant settings;
- order operation overlays;
- order payment decision audits;
- durable jobs whose direct or payload tenant is the deleted merchant.

PostgreSQL cutover must replace this coordination with foreign keys using `ON DELETE CASCADE` and a transactionally verified deletion report.

## Read-only audits

Run from repository root:

```bash
node scripts/audit-order-operations.mjs /path/to/data
node scripts/audit-merchant-settings.mjs /path/to/data
```

The audits never mutate data. They validate tenant boundaries, optimistic versions, terminal payment provenance, metadata consistency, orphan records, disabled-merchant waiting jobs, suppression results, and migration readiness.

## Test entry points

```bash
pnpm --dir artifacts/api-server exec tsx --test tests/orders-settings-runtime.test.ts
node --test artifacts/api-server/tests/orders-settings-static-contract.test.mjs
node --test scripts/tests/orders-settings-audits.test.mjs
pnpm --dir artifacts/api-server run build
node --test artifacts/api-server/tests/order-operations.integration.test.mjs
node --test artifacts/api-server/tests/order-payment-hardening.integration.test.mjs
node --test artifacts/api-server/tests/merchant-settings.integration.test.mjs
```

The settings HTTP tests require the shared `app.ts` router mount request documented in the lane handoff.
