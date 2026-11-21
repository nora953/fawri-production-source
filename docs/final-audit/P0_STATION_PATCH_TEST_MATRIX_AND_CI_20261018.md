# P0 station PATCH regression matrix and CI status — 2026-10-18

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Read-only source/CI verification, no runtime execution.

Confirmed from `artifacts/api-server/src/services/postgresCashierStaffAuthority.ts`: the PATCH SET builder appends `offline_inventory_authority` for supplied offlineInventoryAuthority and again when supplied status is not active. Combined PATCH is a duplicate target-column assignment. `revokeStationRuntime` is called only after UPDATE succeeds, so a rejected UPDATE prevents the intended disable/revoke transaction from reaching revocation. This is a source-derived failure mechanism, not a measured HTTP result.

Regression matrix: (1) status=disabled + offlineInventoryAuthority=true; (2) status=disabled + false; (3) status=revoked + true; (4) status=revoked + false; (5) status-only disabled/revoked; (6) offline-only true/false; (7) location-change combined with disable; (8) repeated disabled update; (9) unauthorized merchant. For (1)-(4), verify SQLSTATE, HTTP mapping, rollback, credential/session revocation and no duplicate SQL assignment after remediation.

CI snapshot: `fetch_commit_workflow_runs` on commit `7780b5fdf838563d536e0cb2b943c4484863ccee` returned 25 workflow runs, all queued, pending or in_progress at inspection. No final green status may be claimed for that commit.

Next action: add focused automated regression in an isolated environment and minimal source fix subject to engineering authorization; re-run relevant CI and confirm results. P0 NO-GO.
