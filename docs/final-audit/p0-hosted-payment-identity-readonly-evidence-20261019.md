# P0 hosted payment identity — read-only evidence (2026-10-19)

Scope: Neon project round-fire-18493605, isolated branch br-snowy-voice-b1bovtwi, database neondb. Read-only SQL only. Do not generalize these findings to Railway's actual runtime connection or other Neon branches.

## H-03: Migration 0034 not installed in inspected branch (CONFIRMED)
Compared committed `lib/db/drizzle/0034_cross_authority_payment_identity_guard.sql` with PostgreSQL catalog:
- `to_regprocedure('public.fawri_guard_provider_order_identity()')`: NULL.
- `pg_trigger` name `fawri_saas_provider_identity_guard`: absent.
- `pg_trigger` name `fawri_cashier_provider_identity_guard`: absent.
No DDL was executed. The branch currently lacks this DB-level cross-authority identity guard. Do not install without migration-ledger reconciliation, collision preflight on the actual target, and owner authorization.

## H-04: Preflight against inspected branch (NO DATA; NOT RELEASE CLEARED)
Both public.saas_billing_orders and public.cashier_billing_orders exist and contain id, provider, provider_checkout_ref, metadata columns. A read-only query unioned `provider='superqi_sandbox'` orders from both authorities and checked duplicate keys separately for checkout reference and metadata.provider_request_id; returned no collisions. However, both tables have zero rows (and zero SuperQi orders), so this is a vacuous pass and does not establish absence of collisions in the eventual deployment target or under concurrent writes.

## H-02: Migration ledger discrepancy
`drizzle.__drizzle_migrations` has 28 records, latest created_at 1791244800000 (committed journal entry 0027). The committed `lib/db/drizzle/meta/_journal.json` has 35 entries (0000..0034). Entries 0028..0034 are not recorded on this branch. Validate actual schema and dependencies before migration; never backfill ledger blindly.

## H-01: Railway connection role unresolved
Railway project fawri-staging / service fawri-web / environment named production, deployed from main (last reported successful deploy 2026-10-10). Variable names include DATABASE_URL and FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE, but values are redacted by connected OAuth tool. Thus actual runtime PostgreSQL role/target is UNKNOWN. Neon inspected branch has fawri_staging_runtime with BYPASSRLS, CREATEDB and CREATEROLE; this is a critical risk **if** runtime uses it, not proof it does.

## H-05: RLS status on inspected branch
94 public tables: 45 RLS enabled, 49 disabled, zero FORCE RLS. Accounts, account_sessions, cashier_operator_sessions, order_items, support_messages lack RLS; orders has RLS enabled. These observations require threat-model assessment of role grants and access paths, not indiscriminate ENABLE RLS.

## Next safe batch
1. Determine Railway's actual database endpoint/role through an approved secret-safe runtime introspection or owner-confirmed configuration; do not print credentials.
2. Compare missing migrations 0028..0034 to catalog and dependencies, build ordered migration dry run on disposable clone.
3. Repeat collision preflight on the **actual target** immediately before any approved migration, and test concurrent writes on a disposable database.
4. Keep P0 NO-GO until H-01..H-06 evidence-based closure. No merge, deployment, grant, migration, or production mutation without owner approval.
