# P0 cashier downgrade release boundary — 2026-10-18

Source review on branch `fix/p0-provider-receipt-order-discovery-20261015`; runtime NOT TESTED.

`scheduleCashierDowngradeAuthoritative` schedules seat reduction for billing_period_end, sets selected assignments active and others release_scheduled with release_effective_at=billing_period_end, increments subscription version with optimistic guard, and inserts an audit event in one transaction.

`assertCashierStationLicensedInTransaction` accepts an active assignment, or a release_scheduled assignment with a nonnull release_effective_at. This predicate does not itself compare release_effective_at with now(). The subscription state may separately limit access; any downgrade materialization path and downstream callers must be inspected before concluding a post-deadline authorization defect.

Tests: exactly before/at/after billing_period_end; grace and restricted states; scheduled seat count and assignment reconciliation; concurrent downgrade; a removed station holding an active credential; primary offline station policy. No actual test run.

P0 NO-GO. No code, DB or deployment modifications.
