# P0 restricted-role privilege review — 2026-10-19

Read-only catalog checks on disposable Neon branch `br-billowing-leaf-b14yamgu`, cloned from `br-snowy-voice-b1bovtwi`. Disposable branch includes manually executed migration SQL 0028–0030 (not recorded in Drizzle ledger); 0031 blocked and 0032–0034 not attempted.

- `fawri_staging_runtime`: LOGIN, BYPASSRLS, CREATEDB, CREATEROLE; member of `fawri_staging_rls_runtime`. Membership does **not** remove BYPASSRLS.
- `fawri_staging_rls_runtime`: NOLOGIN, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE. Both roles can EXECUTE the new verified receipt admission function.
- Both roles have SELECT on `accounts`, `account_sessions`, `cashier_operator_sessions`, `order_items`, `orders`, `support_messages`, `verified_provider_payment_receipts`.
- The restricted role additionally has INSERT/UPDATE/DELETE on `account_sessions`, `cashier_operator_sessions`, `order_items`, `support_messages`, and `verified_provider_payment_receipts`.
- RLS disabled on `accounts`, `account_sessions`, `cashier_operator_sessions`, `order_items`, `support_messages`; enabled on `orders` with policy `orders_tenant_boundary` (`fawri_tenant_or_audited_admin(merchant_id)`); enabled on `verified_provider_payment_receipts` with no public policy.

## Security implications
The restricted role's lack of BYPASSRLS is insufficient as a tenant boundary where tables have no RLS and broad CRUD grants. Conversely, some backend authority tables may intentionally require cross-tenant administrative access; do not blindly enable RLS without mapping legitimate use cases. SECURITY DEFINER functions with row_security=off must have narrowly scoped EXECUTE and trusted inputs. Existing default ACLs auto-grant function EXECUTE to both roles, including newly created privileged functions.

## Next required validation
1. Confirm actual Railway runtime role/endpoint via approved secret-safe mechanism; OAuth only exposes variable names.
2. Inventory exact app access paths to non-RLS sensitive tables and determine whether tenant data is reachable from merchant APIs.
3. Build separate least-privilege login role and grant matrix on a **new disposable branch**, not by modifying hosted role in place.
4. Run real tenant A/B negative tests under that role and regression tests for legitimate admin and cashier flows.
5. Owner approval before any hosted role/grant/migration/deployment change. P0 NO-GO.
