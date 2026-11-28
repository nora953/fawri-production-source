# P0 station patch fix verification — 2026-10-18

Source branch: `fix/p0-provider-receipt-order-discovery-20261015`. Fix commit: `f906ff621a8dd166ced9dfcf75642453d7d09edc`.

Read-back verified `artifacts/api-server/src/services/postgresCashierStaffAuthority.ts` now builds the offline_inventory_authority assignment via a mutually exclusive conditional: when status is provided and not active, SET offline_inventory_authority = FALSE; otherwise, if offlineInventoryAuthority is provided, SET offline_inventory_authority = supplied value. The old second assignment inside the status block is absent. This resolves the duplicate-column SET construction in the inspected source.

GitHub Actions snapshot for fix commit: 25 workflows returned; 9 in_progress, 7 queued, 9 pending, 0 completed at query time. Cashier subscription lifecycle in_progress; Cashier operational cutoff pending. CI PASS NOT YET VERIFIED.

Still required: runtime regression with combined status/offline PATCH, verify revokeStationRuntime, concurrent operations and credential invalidation, wait for final CI, review failure logs if any. The earlier potential issue of offline authority-only toggles retaining paired credentials is distinct and not resolved by this patch.

P0 NO-GO. No DB or deployment changes.
