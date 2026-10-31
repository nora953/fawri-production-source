# P0 — Cashier licensing migration 0027 source verification (2026-10-18)

## Inspected source
`lib/db/drizzle/meta/_journal.json` confirms entry 0027 is `0027_cashier_subscription_licensing`, followed by six 0028–0033 migrations.

Direct inspection of `lib/db/drizzle/0027_cashier_subscription_licensing.sql` confirms:
- `merchant_cashier_subscriptions` with `price_per_seat_iqd DEFAULT 3900` and `grace_duration_seconds DEFAULT 604800` (7 days).
- `cashier_station_seat_assignments` with merchant/subscription/seat relationships and lifecycle constraints.
- Seven tables explicitly receive `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY`: `merchant_cashier_subscriptions`, `cashier_station_seat_assignments`, `cashier_billing_orders`, `cashier_billing_events`, `cashier_entitlement_applications`, `cashier_entitlement_audit_events`, `cashier_device_operation_timeline`.

## Scope
Source inspection only; does not establish offline expiry behavior, hosted payment correctness, tenant isolation under actual app credentials, or integration acceptance. Cashier subscription and bot/auto-reply subscriptions remain separate products. Prior applied migration SHA verification covered 0027, but not pending 0028–0033.

## Next
Review actual cashier runtime expiry and cloud-feature gating code, with special attention to the approved seven-day grace and the independence of the auto-reply subscription. Do not modify database state without authorization.

**P0 remains NO-GO.**
