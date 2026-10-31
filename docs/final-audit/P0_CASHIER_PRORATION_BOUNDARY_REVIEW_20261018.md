# P0 cashier proration and configuration boundary review — 2026-10-18

Branch: `fix/p0-provider-receipt-order-discovery-20261015`. Static inspection only.

File: `artifacts/api-server/src/services/cashierEntitlementAuthority.ts`.

Confirmed source constants: seat price 3900 IQD, grace 7 days. Environment overrides `FAWRI_CASHIER_SEAT_PRICE_IQD` and `FAWRI_CASHIER_GRACE_SECONDS` must be positive safe integers. `addCashierBillingMonth` uses UTC calendar-month advancement and clamps day to target month's final day.

`calculateCashierProrationIqd` checks positive seat price/count, finite ordered billing interval, and rejects effectiveAt >= end. Effective time before start is clamped to start. Calculation uses BigInt for numerator and denominator, rounds half-up to whole IQD, and rejects result <= 0 or unsafe integer.

P0 tests NOT RUN: Jan 31 to February (leap and nonleap), month-end time preservation, exact period start/end, effectiveAt before start, one millisecond before end producing rounded zero, huge inputs, concurrent seat purchase, and price configuration mismatch between payment creation and confirmation. Verify desired business behavior when calculated charge rounds to zero; do not change code without decision.

No application/database/deployment changes. P0 NO-GO.
