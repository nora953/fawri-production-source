# FAWRI P0: local PostgreSQL tenant-boundary test extension

Date: 2026-10-19. Source reviewed: `artifacts/api-server/tests/global-merchant-postgres-http-journey.integration.test.ts` and `scripts/lib/disposable-postgres-test-guard.mjs`.

The integration test asserts an isolated local `fawri_ci` PostgreSQL URL and calls `assertDisposablePostgres()` before importing application database code. The guard checks network-none container attestation, namespace, loopback identity and database marker. This is a strong anti-production-write safety boundary.

The journey provisions merchant A and B and tests that merchant B cannot access or mutate A's ordinary online order via HTTP, with owner status/version unchanged. The file does not reference `order_items`, so it does not establish direct SQL isolation of that table.

Next: add a dedicated CI test for `order_items` using two merchants and a restricted non-BYPASSRLS login role on the attested disposable local database. Verify role identity, RLS, grants and both denied cross-tenant reads and writes. Ensure merchant-scoped access paths and privileged backend paths are tested separately. No hosted migrations or role changes without explicit approval.

Status: planned test gap, not a demonstrated API exploit. P0 NO-GO.
