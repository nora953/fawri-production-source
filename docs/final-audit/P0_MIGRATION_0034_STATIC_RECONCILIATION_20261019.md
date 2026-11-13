# P0 migration 0034 static reconciliation — 2026-10-19

**Scope:** Repository-only review on `fix/p0-provider-receipt-order-discovery-20261015`; no SQL applied to hosted databases.

## Verified

- The journal `lib/db/drizzle/meta/_journal.json` has entries `idx=0..34`, with `idx=34` tag `0034_cross_authority_payment_identity_guard`.
- `lib/db/drizzle/0034_cross_authority_payment_identity_guard.sql` and `lib/db/migration-stages/0034/manual.sql` are byte-for-byte identical as returned by GitHub (3,602 characters each).
- `lib/db/migration-stages/0034/stage.json` identifies `index:34`, `mode:manual_sql`, matching the journal tag.
- The SQL defines `public.fawri_guard_provider_order_identity()` as a `SECURITY DEFINER` trigger function with `search_path=pg_catalog` and `row_security=off`; creates BEFORE INSERT/UPDATE/DELETE triggers on both `saas_billing_orders` and `cashier_billing_orders`; revokes PUBLIC function EXECUTE.
- The function acquires sorted transaction-scoped advisory locks for payment and request references and checks both billing authority tables for identity collisions. This is source-level design evidence only.
- The isolated Neon audit branch previously checked contains 28 migration ledger rows; 0028–0034 remain candidates for isolated rehearsal, not automatically approved hosted changes.

## Outstanding proof

1. In a disposable PostgreSQL environment with all prior migrations, apply 0028–0034 in journal order and confirm triggers/function ownership and grants.
2. Execute two-session concurrent cross-authority insert/update races, including payment reference and request ID collisions, and verify deterministic fail-closed behavior without deadlock.
3. Verify existing rows cannot violate the intended uniqueness invariant at migration activation; consider an explicit pre-migration duplicate/collision detection query before rollout.
4. Confirm least-privilege runtime behavior: the application login must not have BYPASSRLS, CREATEDB, or CREATEROLE and must have only reviewed EXECUTE grants.
5. Reconcile staging migration ledger and production code revision before any approved rollout.

**Status: static reconciliation PASS; runtime and hosted acceptance NOT VERIFIED. P0 NO-GO.**
