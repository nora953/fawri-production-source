# Merchant Dashboard Products Hardening Audit

Audit base: `84c44a116338fd229b94521448016c0a0326684d`

Scope: Phase 3 — Merchant Dashboard Global Hardening → Products only.

## Main catalog — PASS with freshness follow-up

- Product reads and writes use authenticated server APIs.
- Server merchant identity is derived from the merchant session; client merchant overrides are rejected.
- PostgreSQL catalog authority is used for products, variants, inventory, images and commerce context.
- Mutations use idempotency and/or expected versions.
- The UI has a separate `authorityReady` state and fails closed when a canonical reload fails.
- Version conflicts reload the canonical product; a failed reconciliation marks authority unavailable.
- Loading, empty and authority-error states are explicit.
- Money entry uses the merchant commerce context and converts displayed major amounts to canonical minor units using `currency_fraction_digits`.
- Cross-tab cashier refresh is a browser-local convenience only. A remote merchant session/device has no equivalent focus revalidation in this page. Version checks protect writes, but passive display freshness can lag. Treat as a lower-severity freshness follow-up.

## Promotions — CONFIRMED FAIL-CLOSED DEFECT

Current behavior after a successful load followed by a failed refresh:

- `loadFailed` becomes true, but the previous `context`, `products` and `promotions` snapshot remains in component state.
- There is no independent `authorityReady` state.
- Add remains enabled when the previous context exists and loading has ended.
- An already-open editor can remain available because it is gated by `editorOpen && context`.
- Save is gated by `saving`, not by canonical authority freshness.
- Create/update can therefore be attempted from a stale UI snapshot while the canonical refresh is unavailable.

Required repair contract:

1. Introduce explicit promotion authority freshness state.
2. Set authority unavailable before canonical reload begins and on any canonical load failure.
3. Re-enable mutation only after context + products + promotions all reload successfully.
4. Gate Add/Edit/Delete/Save on fresh authority.
5. Preserve an open draft if desired, but keep Save disabled while authority is unavailable.
6. Add regression coverage for: successful snapshot → failed refresh → mutations disabled → successful retry → mutations re-enabled.

## Import — CONFIRMED MULTI-CURRENCY DEFECT

The normal catalog editor treats user-facing prices as major currency amounts and converts them to canonical minor units according to `currency_fraction_digits`.

The import page currently:

- does not load the merchant commerce context;
- parses `price` as a non-negative integer only;
- writes that integer directly to `price_iqd`.

This is inconsistent for currencies with fractional minor units. Example: for USD, a spreadsheet price of `10.50` is rejected, while entering `1050` passes and becomes the canonical minor amount representing `$10.50`, even though the spreadsheet field is presented simply as `price`.

Required repair contract:

1. Resolve fresh merchant commerce context before import validation/commit.
2. Parse spreadsheet price as a user-facing major amount.
3. Convert it with the same canonical money helper used by the catalog editor, using `currency_fraction_digits`.
4. Keep quantity as an integer inventory value; do not apply money conversion to quantity.
5. Fail the import before mutation when commerce authority is unavailable or a monetary cell is invalid.
6. Preserve the existing idempotent all-or-error server import behavior.
7. Add regression cases for IQD (0 fraction digits), USD (2), KWD (3), and localized digits.

## Tests / coverage

Existing tests strongly cover the main catalog authority-recovery contract and promotion API money/idempotency behavior. They do not currently cover promotion-page stale-authority mutation blocking or import multi-currency conversion.

A separate existing Products/Orders authority test appears to contain an older source-shape assertion (`if (saving || !authorityReady)`) that may no longer match the current equivalent fail-closed implementation. Treat this as test-drift to verify when executable tests are available; do not weaken the runtime contract merely to satisfy an old source-shape regex.

## Repair order inside Products

1. Promotions fail-closed authority gate — highest priority.
2. Import multi-currency canonicalization — high priority because it can reject or misrepresent monetary input.
3. Cross-device/focus freshness for the main catalog and promotions — lower severity after mutation safety and monetary correctness.

No Orders or later Phase 3 surface is included in this audit.