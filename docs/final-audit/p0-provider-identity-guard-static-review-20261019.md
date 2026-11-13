# P0 static review: cross-authority payment guard vs resolver

Date: 2026-10-19. Read-only code review of `lib/db/drizzle/0033_confirmed_provider_order_resolution.sql` and `0034_cross_authority_payment_identity_guard.sql` on audit branch.

## Verified design
- 0033 checks an admitted receipt's event ID, payment ref, request ref, event type, amount and payload hash, then resolves SaaS and cashier orders across both authorities and rejects ambiguous matches.
- 0034 adds BEFORE INSERT/UPDATE/DELETE triggers on both billing-order tables for `superqi_sandbox`. It locks old/new payment and request keys in sorted order with transaction-scoped advisory locks, and rejects cross-table or same-table identity collisions with SQLSTATE 23514.
- The trigger function is SECURITY DEFINER, schema-qualifies referenced tables, sets `search_path=pg_catalog`, and revokes PUBLIC EXECUTE.

## Required validation (not yet proven)
1. Run a two-session disposable PostgreSQL race: concurrent inserts of the same payment reference in SaaS and cashier must yield exactly one committed owner; repeat with request reference and UPDATE paths.
2. Verify rollback behavior and absence of deadlocks when a row changes both identity keys while another transaction inserts a matching identity.
3. Verify identity collisions across payment and request namespaces according to the actual provider contract. The trigger intentionally treats `payment:<value>` and `request:<value>` as different namespaces, matching the resolver's separate comparisons.
4. Verify actual deployment migration ledger and function grants. SQL files existing in GitHub do not prove the hosted schema is migrated.

## Release decision
This is static inspection only, not an execution proof. Hosted source and Railway runtime have not been shown to contain 0033/0034. No production changes authorized. P0 NO-GO.
