# P0 station primary creation review

Date: 2026-10-18. Branch: fix/p0-provider-receipt-order-discovery-20261015.

Reviewed artifacts/api-server/src/services/postgresCashierStaffAuthority.ts, createCashierStationAuthoritative, around lines 920-968. The function resolves a merchant location, inserts an active station with offline_inventory_authority set from input, then assigns a paid seat in the same merchant transaction. The inspected function has no explicit query to reject a second offline-authorized station at the same location.

This is a source observation, not confirmation that the database lacks a uniqueness constraint. A PostgreSQL partial unique index or trigger may enforce the invariant. Review migration definitions and test concurrent station creation before classifying a defect.

The updateCashierStationAuthoritative function around lines 1000-1110 also accepts offlineInventoryAuthority and can change location. It revokes pairing/runtime credentials when location changes. Verify both create and update against the same one-primary-per-location invariant.

Next: inspect schema indexes and migration history, then run isolated PostgreSQL tests for two stations on the same location and concurrent updates. No production changes or tests in this note. P0 NO-GO.
