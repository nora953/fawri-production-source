# P0 tenant isolation: API coverage vs database boundary — 2026-10-19

Source: `artifacts/api-server/tests/global-merchant-postgres-http-journey.integration.test.ts` on audit branch `fix/p0-provider-receipt-order-discovery-20261015` (981 lines). Test contains real HTTP negative assertions for foreign merchant ordinary online order detail, status, payment status, payment confirm/reject/conflict resolution (approximately lines 306–341); also cashier-order foreign access and mutation denials (approximately lines 802–895). These are valuable API-boundary regressions, not proof of raw database table RLS.

Catalog evidence from disposable Neon branch `br-billowing-leaf-b14yamgu`:
- `orders`: RLS enabled, `orders_tenant_boundary` policy uses `fawri_tenant_or_audited_admin(merchant_id)` for USING and WITH CHECK.
- `order_items`, `accounts`, `account_sessions`, `cashier_operator_sessions`, `support_messages`: RLS disabled and no pg_policies entries.
- Both `fawri_staging_runtime` and `fawri_staging_rls_runtime` have SELECT on these tables. The latter also has INSERT/UPDATE/DELETE on `account_sessions`, `cashier_operator_sessions`, `order_items`, `support_messages`.
- `fawri_staging_runtime` has BYPASSRLS, so an orders policy is not an effective boundary for this role.

Interpretation: an API returning 404 for foreign resources is not sufficient to certify database-level isolation, especially if backend credentials permit broad direct SQL. This does **not** prove any public API route is exploitable. Avoid treating backend-owned global tables as merchant-facing without tracing app call paths and role context.

Required next tests: under a genuinely restricted LOGIN role on a disposable DB, create two merchant fixtures, validate orders policy under real tenant context, and test direct SELECT/UPDATE of order_items and other tables with expected permission denials; trace API routes and service queries. Keep cashier licensing distinct from bot subscription authority. Actual Railway runtime DB role remains unknown due to redacted OAuth values. No production grants/migrations/deployment without owner approval. P0 NO-GO.
