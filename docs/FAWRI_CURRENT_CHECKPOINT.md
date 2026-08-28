# Fawri Current Checkpoint

Status: Known-good finishing-phase checkpoint after completed POS Global Hardening.

## Repository state

- Active development branch: `parallel/catalog-editor-ux-simplification`
- POS Global Hardening operational close SHA: `596333f3aad459f8e4fdc96a5837bfd7c9c9395d`
- Previous pre-POS baseline: `4cb6e262517841cea0174f31dd2693791e03d4e0`
- Checkpoint role: completed Phase 2 / POS Global Hardening; next phase is Merchant Dashboard Global Hardening.

Future finishing work must begin from this integrated branch state or from a later checkpoint that explicitly supersedes this document.

## Completed phase: POS Global Hardening

Status: CLOSED.

The cashier/POS lifecycle has been audited, hardened, regression-tested, integrated by fast-forward-only updates, and browser-validated against the real preview.

### Station / staff / operator authority

Validated and hardened:

- merchant cashier management surface `/dashboard/cashiers`,
- cashier central reports surface `/dashboard/cashiers/reports`,
- cashier application `/cashier.html`,
- station pairing and stable device binding,
- staff PIN login and operator session gate,
- one-open-shift/station and one-open-shift/staff concurrency enforcement,
- one-live-operator-session/station enforcement,
- stable 409 conflict mapping for concurrent login races,
- server-side permission enforcement for sale/return/void/report/profit/cost access,
- local session re-read before mutations and read-side visibility decisions,
- session invalidation without deleting pending local commerce operations.

### Offline inventory authority

The previous gap where existing stations could not safely manage offline tracked-inventory authority is closed.

Validated behavior:

- existing stations can be edited from merchant cashier management,
- `offline_inventory_authority` is version-protected through a heartbeat-independent `configuration_etag`,
- configuration updates use transaction locking and reject stale writes,
- the legacy station lifecycle endpoint cannot bypass the versioned configuration contract,
- enabling offline authority does not require station re-pairing or credential rotation,
- only one active station per branch may own offline tracked-inventory authority,
- current operator policy refresh updates local station/session policy while preserving immutable merchant/station/device/credential/operator/shift identity,
- rejected server sessions fail closed into the operator authorization flow,
- tracked inventory sale rejection has a specific localized error when offline authority is absent.

### Outbox / ACK / reconciliation

Validated and hardened:

- operator outbox uploads are bound to the active merchant, station, staff, shift, and device,
- operation upload preserves full operation boundaries,
- local durable operations are deleted only after a complete ACK,
- ACK validation requires exact `operation_id`, exact safe `device_sequence`, non-empty `order_id`, exact accepted entity set/cardinality, and matching compensation kind for return/void,
- malformed ACK remains pending and fails closed,
- reconnect retries do not duplicate accepted sales,
- return/void compensation remains exactly-once under the validated lifecycle,
- catalog/inventory reconciliation follows successful outbox completion.

### Connectivity authority

A single cashier connectivity authority now owns the runtime connectivity truth used by existing cashier pages/runtimes.

Validated behavior:

- native browser connectivity remains the initial network-attempt signal,
- actual same-origin `/api/cashier/*` HTTP responses establish online transport evidence,
- cashier API `TypeError`/network failure establishes offline transport evidence,
- compatibility `online` / `offline` events propagate authoritative transport changes to existing consumers,
- POS and History no longer disagree about the current connection state,
- HTTP rejection semantics remain intact; a server 401 is not converted into an offline fallback.

## Golden browser evidence

The real `.replit.dev` preview was validated through the following journey.

### Normal online lifecycle

Validated:

- merchant cashier management renders,
- station remains active and paired,
- staff PIN login succeeds,
- POS opens with current products/variants,
- cart and pricing work,
- online sale succeeds and auto-syncs,
- History shows completed/synced state,
- full return succeeds and cannot be repeated beyond the remaining returnable quantity,
- separate sale succeeds and full void succeeds,
- voided sale cannot be returned afterward.

### Offline tracked-inventory golden journey

Validated against `Main Cashier` with offline inventory authority enabled:

1. Start online with a valid `Cashier Test` operator session.
2. Refresh policy without re-pairing the station.
3. Switch the cashier transport to Offline.
4. Select `منتج متغير B`, price `12,000 IQD`, tracked stock initially `2`.
5. Complete exactly one cash sale while offline.
6. Sale succeeds locally and cart clears.
7. Reconnect.
8. Auto-sync uploads the pending operation.
9. History shows the `12,000 IQD` sale exactly once as completed and synced.
10. Product stock reconciles from `2` to `1`.
11. No duplicate sale is present.
12. Switch Offline again and open Sales History.
13. History opens from local-first authority without the previous generic failure screen.
14. History correctly shows `غير متصل` and the offline continuation/sync-later notice.

This closes the browser evidence for:

`Offline Sale -> Local durable operation -> Reconnect -> Auto-sync -> ACK -> Inventory reconciliation -> No duplicate -> Offline History navigation`.

## Validation evidence

### POS global hardening validation

Previously validated in the phase:

- POS regression suite: pass,
- API typecheck: pass,
- Fawri typecheck: pass,
- API production build: pass,
- Fawri production build: pass,
- static consistency: `critical=0 warning=0 review=0`,
- clean diff/status at validation checkpoints.

### Offline policy hardening

Final policy validation passed:

- focused regression tests: `21/21` pass,
- API/Fawri typechecks: pass where applicable,
- API/Fawri production builds: pass where applicable,
- `git diff --check`: pass.

### Offline navigation hardening

Validated:

- focused regression tests: `12/12` pass,
- Fawri typecheck: pass,
- Fawri production build: pass,
- `git diff --check`: pass,
- browser Offline History navigation: pass.

### Connectivity authority hardening

Validated at the final connectivity tree:

- focused POS regression tests: `26/26` pass,
- Fawri typecheck: pass,
- Fawri production build: pass,
- `git diff --check`: pass,
- browser Online -> Offline History connectivity truth: pass.

Known non-blocking build output remains limited to existing sourcemap reporting warnings and large-chunk advisory warnings; they did not fail production builds and remain candidates for later UI/performance polish.

## Preserved earlier checkpoint state

### Auth / Admin

- PostgreSQL operational authority is required by the unified preview.
- PostgreSQL auth session authority is required by the unified preview.
- Owner Admin login has been restored and validated in runtime.
- Assistant Admin login has been restored and validated in runtime.
- Preview no longer requires manual shell exports for the Auth PostgreSQL authority.

### Subscription

- PostgreSQL subscription authority is required by the unified preview.
- Subscription authority no longer depends on a missing manual preview environment export.

### Catalog / Variants / Inventory

- Current Catalog/Variants work on `parallel/catalog-editor-ux-simplification` remains preserved.
- POS hardening was integrated without replacing or importing an older Catalog tree.
- Catalog PostgreSQL readiness remains part of preview startup safety.

### Global consistency baseline

The finishing baseline previously achieved:

- Static global consistency: `critical=0 warning=0 review=0`
- PostgreSQL runtime consistency after reconciliation: `critical=0 warning=0 review=0`
- API typecheck: pass
- Fawri typecheck: pass
- API production build: pass
- Fawri production build: pass

These remain repeatable gates and must be rerun when later phases materially touch their authorities.

## Important implementation checkpoints

- Cashier surface restoration: `746a5d08fb9f41c9085a6cc7244cc41c658449be`
- Global consistency/pre-POS hardening: `4cb6e262517841cea0174f31dd2693791e03d4e0`
- Finishing charter/checkpoint establishment: `d818aa5cdd6c161e7e1468c5430adb6cc5688612`
- Core POS Global Hardening integration: `c078a311f51797301a271295a645e7636348455c`
- Offline policy/station configuration hardening: `45167df223fd21cd6673021994085c4fb422f427`
- Offline History navigation hardening: `a639f1180ef7afd0e2df3adbd0c02b89988ec57b`
- Final clean cashier connectivity authority: `596333f3aad459f8e4fdc96a5837bfd7c9c9395d`

## Preview contract

The supported preview command remains:

```bash
cd /home/runner/workspace && pnpm run preview:replit
```

The preview script is responsible for supported PostgreSQL authority modes and database readiness. Do not reintroduce a workflow that relies on manually exporting required Auth or Subscription authority variables for normal preview startup.

## Immediate next phase

`Merchant Dashboard Global Hardening`

The next conversation/phase must start with read-only audit and exact-SHA verification before implementation. It must validate the merchant dashboard as one coherent server-authoritative system, including overview, products, orders, conversations, cashier surfaces, settings, channels, subscription, support, navigation, loading/error/unavailable states, cross-page authority consistency, and prevention of local/stale operational truth.

## Remaining finishing phases

After Merchant Dashboard Global Hardening:

1. Catalog / Variants / Inventory finalization
2. Auth / Admin / Subscription final hardening
3. Orders / Settings / Channels / Conversations / Knowledge authority hardening
4. Database / Security / Operational validation
5. Golden end-to-end journeys
6. UI/UX final polish
7. Release Candidate / Production readiness

## Checkpoint update rule

After every completed material phase:

1. record the new clean integrated operational SHA,
2. list exactly what was validated,
3. list unresolved blockers,
4. state the next phase,
5. preserve traceability to earlier checkpoints rather than overwriting history.
