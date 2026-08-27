# Fawri Current Checkpoint

Status: Known-good finishing-phase checkpoint.

## Repository state

- Active development branch: `parallel/catalog-editor-ux-simplification`
- Known-good checkpoint SHA: `4cb6e262517841cea0174f31dd2693791e03d4e0`
- Checkpoint role: Pre-POS Global Hardening baseline.

Any future finishing work must begin from this SHA or from a later checkpoint that explicitly supersedes this document.

## Validated state at this checkpoint

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

- The current Catalog/Variants work present on `parallel/catalog-editor-ux-simplification` is preserved by this checkpoint.
- Recent Catalog work must not be overwritten by importing an older cashier or integration branch.
- Catalog PostgreSQL readiness remains part of preview startup safety.

### Cashier / POS

- Merchant dashboard surfaces restored:
  - `/dashboard/cashiers`
  - `/dashboard/cashiers/reports`
  - `/cashier.html`
- Cashier staff/station/operator PostgreSQL authority is restored.
- Cashier management and central report API routes are mounted.
- Cashier station pairing, staff PIN login, operator session, and POS gate are present.
- The real preview has been validated to reach the employee/PIN screen and open the POS after login.
- Cashier runtime expiry reconciliation materializes expired pairing challenges, station credentials, and operator sessions without closing valid open shifts.
- Invalid local station bindings can self-recover to pairing without deleting the stable device identity or local commerce stores.
- Cashier staff/station readiness is enforced during preview startup.

### Global consistency

The validated finishing checkpoint achieved:

- Static global consistency: `critical=0 warning=0 review=0`
- PostgreSQL runtime consistency after reconciliation: `critical=0 warning=0 review=0`
- API typecheck: pass
- Fawri typecheck: pass
- API production build: pass
- Fawri production build: pass
- Preview safety regression tests: pass
- Cashier runtime expiry reconciliation regression tests: pass
- Cashier station binding recovery regression tests: pass

## Important implementation checkpoints

### Cashier surface restoration checkpoint

- Clean restoration commit: `746a5d08fb9f41c9085a6cc7244cc41c658449be`
- This restored canonical cashier staff/reports/operator functionality without replacing recent Catalog shared-file work.

### Global consistency checkpoint

- Clean consistency/hardening commit: `4cb6e262517841cea0174f31dd2693791e03d4e0`
- This added preview authority safety, global/static audit, PostgreSQL runtime consistency audit, cashier lifecycle reconciliation, and client station-binding recovery.

## Preview contract

The supported preview command is:

```bash
cd /home/runner/workspace && pnpm run preview:replit
```

The preview script is responsible for requiring the supported PostgreSQL authority modes and database readiness. Do not reintroduce a workflow that relies on manually exporting required Auth or Subscription authority variables for normal preview startup.

## Known-good browser result

At this checkpoint, the current `.replit.dev` preview was validated as follows:

1. `/cashier.html` served HTTP 200 from port 8081.
2. The built cashier asset was served from the current build.
3. The cashier gate displayed `Main Cashier` and the active staff selector.
4. Staff PIN login succeeded.
5. The POS opened and displayed the current product/variant catalog.

## Immediate next phase

`POS Global Hardening`

This phase starts with audit/read-only inspection before implementation. It must validate the POS as a complete operational lifecycle, including normal operation, permission boundaries, retries, offline/online transitions, reconciliation, and reports.

## Checkpoint update rule

After every completed material phase:

1. record the new clean integrated SHA,
2. list exactly what was validated,
3. list unresolved blockers,
4. state the next phase,
5. do not overwrite prior historical checkpoint information without preserving traceability.
