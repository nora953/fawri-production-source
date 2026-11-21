# P0 scheduled downgrade and grace materialization review (2026-10-18)

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Static source review only.

`subscriptionWithScheduledDowngradeInTransaction` currently returns `subscriptionRow` and intentionally does not materialize a downgrade when the paid period ends. The source comment says all previously licensed stations remain eligible through seven-day grace. `evaluateCashierEntitlement` classifies active subscription by paid period, grace duration and restricted after grace. `scheduleCashierDowngradeAuthoritative` writes scheduled seat count and release_scheduled seat assignments. `assertCashierStationLicensedInTransaction` accepts release_scheduled with nonnull release_effective_at without independently checking deadline.

This is not evidence of an unintended grace bypass: the intended seven-day grace explicitly permits previously licensed stations. It remains unverified where the next paid-cycle renewal reconciles scheduled_licensed_seats, clears scheduled_change_at, and marks released seats. A source search on the repository default branch yielded no results for scheduled_licensed_seats; this does not establish absence of other code or the feature branch.

Acceptance: trace payment renewal and billing-cycle rollover implementation; test expiry, each day of grace, restricted, renewal after scheduled downgrade, removed station rejection after rollover, and retained station acceptance. Confirm cashier-only policy and keep AI/Meta subscriptions separate.

P0 NO-GO. No runtime test or code, DB, deploy change.
