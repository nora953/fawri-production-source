P0 offline authority toggle — 2026-10-18

Static source review only. Branch: fix/p0-provider-receipt-order-discovery-20261015.

In artifacts/api-server/src/services/postgresCashierStaffAuthority.ts, updateCashierStationAuthoritative writes offline_inventory_authority when requested. It revokes device runtime on location change or station disable/revoke. Changing only offline_inventory_authority does not take those revocation branches. authenticateCashierStationAuthoritative and authenticateCashierOperatorAuthoritative read the current flag into a returned context. A previously returned context can therefore be stale after a toggle.

This does not prove that a sale or inventory mutation is accepted after authority removal. Downstream authorization and sync paths require review and runtime tests. Test primary-to-secondary toggling with queued offline work, concurrent sale, and live credential. Confirm the cashier subscription policy independently from AI/Meta reply services.

Status: P0 NO-GO; source evidence only; no test executed or code/database/deployment change.
