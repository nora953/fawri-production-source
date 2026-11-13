# P0 migration 0028–0034 schema reconciliation — 2026-10-19

Target inspected: Neon project `round-fire-18493605`, branch `br-snowy-voice-b1bovtwi`, database `neondb`. Read-only catalog queries only; no migrations applied.

## Exact object checks
Compared SQL in committed `lib/db/drizzle/0028_*.sql` through `0034_*.sql` with `to_regclass` / `to_regprocedure` on the inspected branch:

| Migration | Expected principal object | Present? |
|---|---|---|
| 0028 | `fawri_resolve_meta_page_merchants(text[])` | NO |
| 0029 | `verified_provider_payment_receipts` table and `fawri_admit_verified_payment_receipt(...)` | NO / NO |
| 0030 | `fawri_read_verified_payment_receipts(...)` | NO |
| 0031 | `fawri_review_verified_payment_receipt(...)` | NO |
| 0032 | `fawri_authorize_verified_receipt_replay(...)` | NO |
| 0033 | `fawri_resolve_confirmed_payment_order(...)` | NO |
| 0034 | `fawri_guard_provider_order_identity()` and both named triggers | NO / NO |

Drizzle ledger contains 28 records ending at 0027; committed journal has 35 through 0034. The absent objects substantiate a real schema gap, not just a ledger mismatch, **on this branch**.

## Dependency presence
Catalog checks confirm these referenced tables exist: `merchant_channels`, `admin_profiles`, `admin_permissions`, `database_admin_access_audits`, `account_sessions`, `trusted_devices`, `saas_billing_orders`, `cashier_billing_orders`. Existence alone does not establish column compatibility, permissions, function security, or migration success.

## Safe sequencing / unresolved gates
- 0028 creates a bounded SECURITY DEFINER Meta page resolver.
- 0029 creates an RLS-enabled receipt inbox and admission function; 0030–0033 depend on its table and on previously existing auth/audit/billing tables.
- 0034 adds identity-collision guard function and INSERT/UPDATE/DELETE triggers on both billing order tables.
- Apply only in order, first on a **disposable cloned database** with explicit ownership and restricted-runtime tests, then perform actual-target collision preflight immediately before any approved hosted migration.
- Review explicit EXECUTE grants for trusted runtime functions; SQL intentionally REVOKEs PUBLIC, so blindly applying migrations may cause feature failures. Avoid granting RLS bypass or blanket table access.
- H-01 actual Railway DB connection/role is still unknown because OAuth returns variable names, not values. Do not infer target branch from a similarly named role.
- P0 remains NO-GO. No hosted mutation or deployment was performed.
