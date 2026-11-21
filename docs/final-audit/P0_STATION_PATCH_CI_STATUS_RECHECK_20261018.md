# P0 station patch and CI snapshot — 2026-10-18

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Read-only review.

Re-read `updateCashierStationAuthoritative` in `artifacts/api-server/src/services/postgresCashierStaffAuthority.ts`. The dynamic SET list includes `offline_inventory_authority = $N` when offlineInventoryAuthority is provided, and another `offline_inventory_authority = FALSE` when a non-active status is supplied. This duplicate-column assignment condition remains present at inspection. Prior report: `P0_STATION_PATCH_DUPLICATE_ASSIGNMENT_20261018.md`.

GitHub Actions snapshot for commit `b305ab5c5958cabd28df9ff7b437f54a620c7cbf`: Billing provider readiness, PostgreSQL migration candidate and Global Merchant PostgreSQL HTTP Journey completed success; Cashier subscription lifecycle, Cashier operational cutoff and Final quality gates were in_progress at query time. Other workflows also pending/in_progress. This is not the final CI status for the latest branch head.

Next: reproduce dual-field PATCH in disposable test environment, apply minimal fix after verification and authorization, run regression suite, re-check CI to completion. Do not equate successful unrelated workflows with resolution of the duplicate assignment.

P0 NO-GO. No code/DB/deploy changes in this step.
