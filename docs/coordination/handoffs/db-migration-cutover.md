# PostgreSQL migration cutover handoff

## Status

**PostgreSQL-owned lane gates are complete and ready for integration.** The database lane itself has no remaining PostgreSQL-owned test blocker. PR #5 is intentionally still **draft, open, and unmerged** because the broad repository validation remains red on exactly two integration-only Orders/Settings contracts that are outside this lane's allowlist.

- Repository: `nora953/fawri-production-source`
- Branch: `parallel/db-migration-cutover`
- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- DB gate code SHA: `4dca348d33f827e3f53a26c993768f741accd525`
- Remote HEAD immediately before this final handoff-only documentation commit: `4dca348d33f827e3f53a26c993768f741accd525`
- Ahead / behind at tested code SHA: **26 ahead / 0 behind**
- PR: #5 — draft, open, unmerged; base `hardening/postgresql-foundation`

The commit that contains this handoff is a documentation-only successor of the tested DB gate code SHA above. A Git commit cannot reliably embed its own resulting SHA in its own file contents; the exact post-handoff Remote HEAD must therefore be read from GitHub after this write and is reported in the final delivery message. No database code changes occur after `4dca348d33f827e3f53a26c993768f741accd525`.

No Production database and no real Replit database were contacted. All database execution used disposable/local GitHub Actions PostgreSQL 16 databases named `fawri_ci` or the complete-schema CI database. No force push was used.

## Approved Drizzle promotion

The generated incremental migration was promoted by the approved GitHub Actions promotion commit:

- `ede947f260ffa4f0196cdba0c742d2d3a805a984` — `Commit generated PostgreSQL migration candidate`

The promotion diff was verified to contain only the expected three Drizzle files. Their Git blobs were re-read from GitHub at the final tested code SHA and remain exactly:

- `lib/db/drizzle/0001_military_proteus.sql`
  - Git blob: `0631349cad0075d927bfcf67a96180111555a5a4`
- `lib/db/drizzle/meta/0001_snapshot.json`
  - Git blob: `23c23f8572482893b7b474311917b71f7869db64`
- `lib/db/drizzle/meta/_journal.json`
  - Git blob: `f17f63465bb4e680b80a556d206ed54beb685a4b`

The committed raw `0001_military_proteus.sql` remains byte-for-byte the promoted artifact. It is not manually reconstructed or rewritten.

## Migration application ordering

The promoted Drizzle SQL contains composite foreign-key statements before some referenced composite `UNIQUE` constraints. PostgreSQL requires the referenced unique key to exist before creating the foreign key.

The lane therefore added `lib/db/scripts/lib/migration-sql-order.mjs` and applies migrations through a temporary dependency-stabilized migration folder during disposable migration smoke/application tests:

- only existing SQL statements are reordered;
- the helper identifies target `UNIQUE` constraints referenced by composite foreign keys and places those constraints before the relevant foreign-key creation statements;
- the helper asserts the sorted SQL statement multiset is identical before and after stabilization, so no statement can be added, removed, or changed silently;
- committed Drizzle metadata is copied unchanged to the temporary folder;
- the committed promoted `0001` remains the canonical reproducible artifact.

The raw migration reproducibility test separately regenerates `0001` from committed `0000` and confirms the generated raw SQL equals committed `0001_military_proteus.sql` byte-for-byte. The generated snapshot also matches the committed `0001_snapshot.json` after normalizing only Drizzle's generated root snapshot ID.

## Stale snapshot blocker — resolved

The previous stale committed-snapshot blocker is gone. The latest migration tests pass the explicit current-target assertion and no longer report:

- `UNKNOWN_TARGET_COLUMN` for `orders.version`;
- `TARGET_TABLE_NOT_FOUND` for `manual_reply_requests`;
- `TARGET_TABLE_NOT_FOUND` for `merchant_settings`.

Therefore the latest committed snapshot recognizes:

- `orders.version`;
- `manual_reply_requests`;
- `merchant_settings`.

The validator was also corrected to match PostgreSQL `MATCH SIMPLE` semantics for nullable composite foreign keys: if any source component is `NULL`, the FK is not treated as an incomplete reference. Required `NOT NULL` columns remain validated independently.

## Operational fail-closed fixes

The base locked migration runner now audits `order-operations.json` while source locks are held, includes that source in migration source identity, and blocks unsupported order-operation overlays before starting a child writer. This closed the previous path where a valid order overlay could reach the child writer instead of failing with `OPERATIONAL_OVERLAY_WRITE_BLOCKED`.

Source identity protection covers source manifest, lineage, Drizzle snapshot identity, tool version, source inventory, and table counts. Tests confirm source mutation and schema mutation fail closed.

## Latest GitHub Actions evidence

Only the latest run for each workflow at DB gate code SHA `4dca348d33f827e3f53a26c993768f741accd525` is counted. Earlier same-head runs cancelled by concurrency are not treated as passing evidence.

### PostgreSQL migration candidate

- Run ID: `31179087597`
- Result: **SUCCESS**

### Complete migration safety

- Run ID: `31179087427`
- Result: **SUCCESS**

This confirms the current complete migration planning, locks, operational-overlay gates, source identity, and fail-closed safety suite is green.

### Complete schema candidate

- Run ID: `31179087430`
- Result: **SUCCESS**

The complete schema path successfully generates/applies the complete PostgreSQL schema to disposable PostgreSQL. The schema contains 42 application tables and includes the critical current tables and tenant/state constraints such as `merchant_settings`, `manual_reply_requests`, migration metadata tables, composite tenant foreign keys, and merchant-settings check constraints.

### PostgreSQL schema validation

- Run ID: `31179087428`
- Overall workflow result: **FAILURE**
- `migration:test`: **76 total / 74 passed / 2 failed**
- PostgreSQL-owned failures: **0**
- Integration-only failures: **2**

The two remaining failures are outside this lane:

1. `active orders page is server-authoritative`
   - active Orders page still does not resolve to `ServerOrdersPage` and retains local authority.
   - owner: Orders/Settings integration lane.
2. `extensionless settings imports resolve to the server-authoritative page`
   - active Settings path still contains forbidden `saveSettings` authority.
   - owner: Orders/Settings integration lane.

This lane deliberately did not modify Orders/Settings frontend or contracts.

Because the broad workflow stops at its `Test migration dry-run safety` step when any test in `migration:test` fails, later workflow steps 9–15 are **SKIPPED**, not green:

- database package typecheck;
- standalone Drizzle generation step;
- standalone committed migration reproducibility step;
- standalone migration apply step;
- standalone rollback step;
- standalone commit/reconciliation/cleanup step;
- generated migration artifact upload step.

However, this does **not** leave the DB-owned gates unexecuted. The same `migration:test` step actually executed `scripts/tests/postgresql-disposable-acceptance.test.mjs` against the workflow's healthy disposable `postgres:16-alpine` service, and both DB acceptance tests passed before the two integration-only frontend contracts failed.

## PostgreSQL completion gates

All PostgreSQL-owned completion gates below were actually executed and passed on disposable PostgreSQL at DB gate code SHA `4dca348d33f827e3f53a26c993768f741accd525`.

| Gate | Result | Evidence |
| --- | --- | --- |
| committed migration reproducibility | **PASS** | `committed Drizzle 0001 is reproducible from the committed 0000 baseline` passed; raw regenerated 0001 equals committed SQL byte-for-byte; snapshot schema matches |
| dry-run safety | **PASS** | dry-run plan does not modify sources or use `DATABASE_URL`; orphan/invalid JSON cases fail safely; real write remains fail-closed |
| apply migration | **PASS** | disposable PostgreSQL migration smoke passed using dependency-safe ordering; committed snapshot `0001_snapshot.json` applied successfully |
| tenant/composite FK integrity | **PASS** | migration smoke verified critical FKs and every composite tenant FK named by the committed snapshot; complete schema candidate also passed |
| migration idempotency | **PASS** | migrations applied twice without changes; commit rehearsal reports `idempotency_second_pass_inserted = 0` |
| rollback path | **PASS** | rollback rehearsal reports `rollback_completed = true`, application/metadata writes not persisted, DB restored to baseline |
| commit-test path | **PASS** | commit rehearsal completed on disposable `fawri_ci` with explicit permission flag |
| source-hash revalidation | **PASS** | rollback revalidated before rollback; commit revalidated immediately before each commit; write identity tests pass |
| source mutation fail-closed | **PASS** | mutation changes manifest/lineage identity; changed source data, lineage, and Drizzle schema are rejected; invalid sources fail before DB use |
| reconciliation | **PASS** | commit rehearsal reports `row_counts_matched = true`, `row_values_matched = true`, `migration_metadata_reconciled = true` |
| cleanup | **PASS** | commit rehearsal reports `cleanup_completed = true` and `database_restored_to_empty = true` |

The disposable acceptance smoke additionally reports:

- snapshot: `0001_snapshot.json`;
- tables: `42`;
- migrations in journal/history: `2`;
- migration applied twice without changes;
- dependency ordering stabilized;
- composite foreign keys present and verified.

## Final branch file set at tested DB SHA

Compared with coordination base `b08c854f177953d3690c5dffde905fdb0c93eb09`, the tested code SHA is 26 commits ahead and 0 behind with these 33 changed files:

1. `docs/coordination/handoffs/db-migration-cutover.md`
2. `docs/migration-source-lineage.md`
3. `docs/postgresql-cutover-runbook.md`
4. `lib/db/drizzle.config.ts`
5. `lib/db/drizzle/0001_military_proteus.sql`
6. `lib/db/drizzle/meta/0001_snapshot.json`
7. `lib/db/drizzle/meta/_journal.json`
8. `lib/db/scripts/commit-migration.mjs`
9. `lib/db/scripts/lib/migration-sql-order.mjs`
10. `lib/db/scripts/lib/migration-write.mjs`
11. `lib/db/scripts/rollback-migration.mjs`
12. `lib/db/scripts/run-complete-migration-with-operational-locks.mjs`
13. `lib/db/scripts/run-migration-with-operational-locks.mjs`
14. `lib/db/scripts/smoke-migration.mjs`
15. `lib/db/src/schema/catalog.ts`
16. `lib/db/src/schema/channels.ts`
17. `lib/db/src/schema/conversations.ts`
18. `lib/db/src/schema/orders.ts`
19. `lib/db/src/schema/subscriptions.ts`
20. `scripts/lib/postgresql-migration-plan-complete.mjs`
21. `scripts/lib/postgresql-migration-plan.mjs`
22. `scripts/run-postgresql-migration-cutover.mjs`
23. `scripts/tests/complete-locked-migration-safety.test.mjs`
24. `scripts/tests/complete-migration-operational-gates.test.mjs`
25. `scripts/tests/fixtures/create-postgresql-migration-fixture.mjs`
26. `scripts/tests/fixtures/create-transitional-migration-fixture.mjs`
27. `scripts/tests/locked-migration-operational-safety.test.mjs`
28. `scripts/tests/migration-write-identity.test.mjs`
29. `scripts/tests/postgresql-cutover-safety.test.mjs`
30. `scripts/tests/postgresql-disposable-acceptance.test.mjs`
31. `scripts/tests/run-postgresql-migration-plan.test.mjs`
32. `scripts/tests/validated-migration-transitional-gate.test.mjs`
33. `scripts/tests/validated-order-operations-gate.test.mjs`

Reserved/shared `lib/db/src/schema/index.ts` was not edited. No `.github/workflows/**`, frontend files, application route files, auth files, Meta/channel files, `main`, `hardening/postgresql-foundation`, or another execution branch were modified by the database lane.

## Safety and environment confirmation

- Production PostgreSQL contacted: **NO**
- Replit PostgreSQL contacted: **NO**
- Disposable PostgreSQL used: **YES**, GitHub Actions `postgres:16-alpine`, local `fawri_ci` / complete-schema CI database
- Force push used: **NO**
- `main` modified: **NO**
- base branch modified: **NO**
- out-of-lane Orders/Settings fixes attempted: **NO**

## Integration disposition

The PostgreSQL lane is **merge-ready from the PostgreSQL-owned gate perspective**. All database-owned completion gates are green and actually executed.

PR #5 must remain draft/open/unmerged until the integration coordinator decides how to sequence integration. The broad `PostgreSQL schema validation` workflow is still red and must not be described as green. Its only remaining failures are the two known Orders/Settings server-authoritative integration contracts outside this lane. After the owning Orders/Settings work is integrated by the coordinator, the full broad repository validation should be rerun so the previously skipped standalone steps can also appear green at workflow level.
