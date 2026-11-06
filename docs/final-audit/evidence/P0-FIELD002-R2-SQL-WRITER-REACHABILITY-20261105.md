# FIELD002-R2 — Isolated Neon historical provenance and current SQL writer inventory
## 2026-11-05 — read-only database evidence and fail-closed source gate

**Environment:** Explicit authorized isolated Neon clone only: `round-fire-18493605` / `br-young-hill-b1x9vhlz` / `neondb`. All SQL below was SELECT-only. No changes to original staging, production, Railway, or historical rows. No deployed/unknown client is identified from this evidence.

### Historical record findings (read-only)

- **28** stored merchant notifications, **7** persisted types, **1** merchant represented in this bounded clone.
- **13/28** have both `source_entity_type` and `source_entity_id` populated; **15/28** have **both fields NULL**; **0/28** have only one of the two fields. This is a complete separation, not a partially damaged reference pair.
- The **15 null-reference rows** comprise `subscription_balance_purchase` (9), `subscription_emergency_activated` (2), `subscription_plan_event` (3), and `subscription_expiry_reminder` (1).
- All persisted rows have `variables` of JSON-object shape, no future `created_at`, and 26/28 have a `read_at` timestamp. These facts do **not** certify specific UI consumers, source authors, or legal retention.
- Earliest/latest **date** by type (no raw records, IDs, values, secrets, or identifying merchant information exported):

| Type | Count | Complete ref | Created dates (UTC) |
|---|---:|---:|---|
| `inspection_session_request` | 11 | 11 | 2026-07-31 to 2026-08-05 |
| `subscription_balance_purchase` | 9 | 0 | 2026-07-29 to 2026-08-02 |
| `subscription_emergency_activated` | 2 | 0 | 2026-08-02 |
| `subscription_expired` | 1 | 1 | 2026-10-09 |
| `subscription_expiry_reminder` | 1 | 0 | 2026-08-26 |
| `subscription_plan_event` | 3 | 0 | 2026-08-02 |
| `support_reply_reminder` | 1 | 1 | 2026-07-31 |

**DB-side writer inventory:** No user-defined non-internal trigger attached to `public.notifications`. Among application schemas `public` and `fawri_security`, there is no ordinary/procedure `pg_proc.prosrc` containing the token `notifications` in the clone. `notifications_source_idx` is a **non-unique** btree on `(source_entity_type, source_entity_id)`, and the notifications table has no stored producer identity or version column. Therefore current DB schema alone **cannot reconstruct which application version, process, or client originally wrote any of the 15 unlinked rows**. Dates are correlation clues, **not** writer attribution. Lack of a current trigger does not prove no historical trigger existed.

Reproducible SELECT-only verification:
```sql
SELECT type, count(*) AS n,
 count(*) FILTER (WHERE source_entity_type IS NOT NULL AND source_entity_id IS NOT NULL) AS fully_linked,
 count(*) FILTER (WHERE source_entity_type IS NULL AND source_entity_id IS NULL) AS unlinked,
 count(*) FILTER (WHERE (source_entity_type IS NULL) <> (source_entity_id IS NULL)) AS partial_link,
 min(created_at)::date AS earliest_day, max(created_at)::date AS latest_day
FROM public.notifications GROUP BY type ORDER BY type;
SELECT t.tgname FROM pg_trigger t
WHERE t.tgrelid='public.notifications'::regclass AND NOT t.tgisinternal;
SELECT n.nspname,p.proname FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','fawri_security')
 AND p.prokind IN ('f','p') AND p.prosrc ILIKE '%notifications%';
```

### Present-source writer and alternate route (not historical actor attribution)

Source review found literal SQL `INSERT INTO notifications` paths in five services:
- `postgresMerchantNotificationAuthority.ts`: canonical subscription/add-on reminders.
- `postgresOperationalNotificationAuthority.ts`: direct operational notification helper; new-order activation remains deferred.
- `postgresSupportInspectionAuthority.ts`: canonical inspection request writer, called from the mounted support route.
- `postgresSupportLifecycleAuthority.ts`: canonical support lifecycle reminders, called from mounted routes.
- `postgresSupportAuthority.ts`: **older support SQL writer** with a different record shape; old `createInspectionRequestPostgres` and `refreshSupportLifecyclePostgres` entrypoints remain defined but no current in-repository source references were found outside that service in the bounded read.

New executable source audit `scripts/tests/field002-notification-writer-provenance.test.mjs` enumerates all literal SQL `INSERT INTO notifications` patterns through current `artifacts/api-server/src`, requires the complete reviewed five-path set and single occurrence per path, rejects detected ORM `.insert(notifications)`, and rejects new imports/calls of the two older support writer entrypoints. The `P0 notification privacy HTTP matrix` workflow runs this check and triggers on changes anywhere under `artifacts/api-server/src/**`. The test is **static** and cannot detect all dynamic SQL construction, external access, retired deployed clients or historical process logs. Source test results require fresh CI verification; a passing result must not be relabeled as hosted writer attribution.

### Decision/status

Product owner authorized: **preserve** all 28 historical rows, do not infer or invent the 15 null references, and defer retention schedule to explicit legal/business review. No automatic backfill, deletion, quarantine, migration or new canonical writer. **R2 historical/external writer attribution remains OPEN**, although current writer inventory and a source regression guard are newly bounded. R1/R3 policy decisions approved with separate tested code; parent FIELD002 **OPEN**, migration 0052 **BLOCKED**, release **NO-GO**. Entire PR CI independent cashier failures remain not waived. No launch/merge authorization.

### 2026-11-05 — historical legacy ID fingerprint (new bounded evidence)

Reproducible [SELECT-only cohort query](sql/P0-FIELD002-LEGACY-ID-FINGERPRINT-READONLY-20261105.sql) ran against the approved isolated Neon clone. It emitted aggregate counts only, never notification IDs, merchant identifiers or payloads.

| Type | Rows | Legacy JSON ID shape | Canonical PG SHA-256 ID shape | Old-ID time within 5 s | Both source refs missing |
|---|---:|---:|---:|---:|---:|
| inspection_session_request | 11 | 11 | 0 | 11 | 0 |
| subscription_balance_purchase | 9 | 9 | 0 | 9 | 9 |
| subscription_emergency_activated | 2 | 2 | 0 | 2 | 2 |
| subscription_expired | 1 | 0 | 1 | 0 | 0 |
| subscription_expiry_reminder | 1 | 1 | 0 | 1 | 1 |
| subscription_plan_event | 3 | 3 | 0 | 3 | 3 |
| support_reply_reminder | 1 | 1 | 0 | 1 | 0 |
| **TOTAL** | **28** | **27** | **1** | **27** | **15** |

Source comparison: routes/authRuntimePart1.ts defines makeId(prefix) using current Date.now() and six base36 characters; historical authRuntimePart3.ts notification producers use makeId("merchant-notification"). Twenty-seven persisted IDs have exactly this form, and their embedded millisecond epoch agrees with created_at within 5 seconds. The one remaining persisted ID has the notification plus 64-hex SHA-256 form generated by the current canonical postgresMerchantNotificationAuthority.ts. All 15 source-unlinked notices are among the 27 historical-format IDs; there are zero partial source-reference pairs.

**Interpretation limit:** This strongly supports legacy-ID-format continuity, not authentic historical writer attribution. A JSON-to-SQL import, a one-off seed, or another SQL client copying old IDs could all preserve this pattern. No original writer, deployment version or particular import path is thereby certified. Do not invent missing refs, infer corruption, delete, migrate or rewrite the rows.

Read-only review of the current scripts/lib/postgresql-migration-plan-complete.mjs, postgresql-migration-plan-safe.mjs, postgresql-cross-lane-reconciliation.mjs, scripts/plan-postgresql-migration.mjs and scripts/lib/transitional-migration-readiness.mjs found no direct notifications mapping in those current files. This does not exclude other scripts, prior revisions or external migrations.

Additional static source regression test guards the relevant old/new ID generator signatures and the SELECT-only aggregated query, but does not certify historical clients. FIELD002-R2 remains OPEN pending the actual historical provenance/retention disposition and other privacy acceptance gates.

### 2026-11-05 — prevent new incomplete source references (new source guard)

The 15 preserved historic NULL/NULL source-reference rows must **not** justify creating new anonymous PostgreSQL notifications. All currently inspected new canonical SQL writers already supply both references on their in-repository callsites. The shared, pure `requireNotificationSourceReference` precondition now rejects both missing, one missing, whitespace-only or non-string source reference fields *before* the INSERT is sent in four generic SQL notification insert helpers; the fifth canonical inspection writer already inserts an explicit source type and request ID. Two older support helpers remain guarded and uncalled. We did **not** change the SQL table schema, delete/backfill/update historic records, or deploy. The new precondition is also protected by direct runtime unit tests plus source-wide writer inventory and source guard tests in the existing CI lane. This only guarantees the four current generic helpers, **not** all possible external/direct SQL clients or past import routes. R2 historical writer identity and final retention approval remain OPEN, FIELD002/P0 NO-GO.

### 2026-11-05 — retired support notification read projection cannot re-enter live routes

A separate R1/R2 source audit found exported, retired support notification readers `listMerchantNotificationsPostgres`, `markMerchantNotificationReadPostgres`, and `markAllMerchantNotificationsReadPostgres` in `postgresSupportAuthority.ts`; their old `mapNotification` spreads raw `variables` into a result. Those are not the reviewed twelve-type/unknown-safe canonical projection. The mounted notification router and support router **currently** call `*PostgresCanonical` instead, and `auth-security.ts` mounts `merchantNotificationsPgRouter` before support routes. New fail-closed source test `FIELD002-R1 retired support notification reader cannot bypass canonical projection` guards **zero references outside retired service**, live route import/caller contracts, session middleware and router precedence. No old reader is newly activated and no data or API behavior changes in this commit. A source-only check cannot prove external compiled consumers or deployed code. If an active caller becomes necessary, retire/refactor old read functions under their own bounded review rather than silently exposing raw stored extension variables.

### 2026-11-06 — R2 migration-write admission guard (candidate; CI not yet accepted)

Read-only source trace (no hosted operation) followed the current planner chain `scripts/plan-postgresql-migration.mjs` → `scripts/lib/postgresql-migration-plan.mjs` → `...-safe.mjs` → `...-complete.mjs` → `scripts/lib/postgresql-cross-lane-reconciliation.mjs`, and both generic row writers `lib/db/scripts/lib/migration-write.mjs` and `lib/db/scripts/cutover-migration.mjs`. The listed planners do not explicitly map historic merchant notifications, but the two generic writers could accept future `report.rows.notifications` without a separate R2 provenance decision. That is an *admission gap*, not proof that historic rows have been imported through this path.

A narrow candidate fail-closed guard rejects **non-empty** planned `notifications` rows at both writer validators with `FIELD002_R2_NOTIFICATION_IMPORT_REQUIRES_SEPARATE_PROVENANCE_APPROVAL`, before preparing or executing SQL. Empty or absent notifications rows remain unaffected, as do canonical live API notification writers. New negative unit test runs both exported validators using synthetic in-memory inputs; the notification HTTP workflow watches both new paths. Existing accepted write-path positive tests remain the regression for ordinary non-notification cutovers. This guard can only be relaxed after explicit source-lineage/policy review and a new verified test, never by pretending legacy null references are valid.

No historical data, hosted database, service deployment, or existing notifications were modified. Status: **candidate until exact-commit CI**; R2 historical client/writer attribution and retention decision still **OPEN**, FIELD002 OPEN, migration 0052 BLOCKED, P0 NO-GO. Current HEAD at review time: `3ef9a4c5236e563ac7f7323005d0224d73f709ad`; latest 59-workflow CI on that prior SHA had 57 successes and 2 cashier-lifecycle failures, so no full-green claim. No change to canonical gate counts or overall percentage.

## 2026-11-06 — product-owner precommercial/test-only attestation and release boundary

**Owner statement (not independently established by source/database inspection):** FAWRI has not launched commercially, no genuine merchant has ever been onboarded, and all notifications created so far were for testing. This is a product-owner attestation specifically relevant to the 28-row isolated-clone historic notification cohort; it is not proof that every field is synthetic or contains no real phone, email, name, attachment or other personally identifying content, nor an identification of the historical SQL writer.

**Revised risk classification / recommended bounded resolution, NOT a blanket release waiver:**
- Treat the 28 rows (including the 15 without both source references) as a **legacy nonproduction test cohort under owner attestation**, pending a safe aggregate/content-sensitivity check. Preserve them unchanged, private to staging and accessible only under the already-tested RLS/canonical projection. Do not retroactively invent provenance or activate retired writers.
- No historical backup discovery is mandatory merely to establish the creator of disposable test notifications *if* their classification and isolation are independently supported, their known compatibility and risk are explicitly accepted, and they are excluded from any commercial data migration, restore, seed or production deployment. The last exclusion has a source-side fail-closed cutover guard at `f3cbb6c2` with notification workflow success; deployment-specific production isolation remains unverified.
- **Required before bounded R2 disposition/sign-off:** assess whether test records contain any real-person information (do not export raw payloads or identifiers to GitHub), reconcile the existing 28-row snapshot against the expected test cohort without guessing original writers, and approve a retention/expiry or isolation disposition for nonproduction fixture records. No purge/backfill/role changes/hosted operation is authorized by this statement alone.
- Keep the separate current-writer inventory, fail-closed source references, R1/R3 approved policy, isolated 7/7 SQL/HTTP notification acceptance and 8-table release privacy gap distinct. Parent FIELD002 requires all its explicit actor/table/route and hosted production-readiness conditions, not just R2 fixture classification.
- **No change to canonical P0 counts** (29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED), FIELD002 OPEN, 0052 BLOCKED, release NO-GO, full P0 percentage unknown. No original Neon, Railway, merchant data, merge or deploy touched in this checkpoint.


## 2026-11-06 — fail-closed historical type emission and malformed-plan import (source candidate)

FIELD002-R2/R3 implementation on the existing PR: all four current and retired generic merchant-notification SQL INSERT wrappers now call `assertNotificationTypeWritable` before any SQL. It refuses new `subscription_balance_purchase`, `subscription_plan_event`, `subscription_emergency_activated` writes (including whitespace-padded types), while preserving historical read/mark-read behavior and current active issuers. The fifth fixed-type inspection writer remains `inspection_session_request`. No direct new-order notification caller is activated; this change does not authorize one.

Both `validatePlanForWrite` and `validateCutoverPlanForWrite` now reject any non-empty **or malformed** present `rows.notifications` collection, not just non-empty arrays. A missing key or an explicitly empty array remains allowed. Negative in-memory plan tests, direct unit tests for legacy and current types, and static guard coverage for all four generic SQL writers have been added. Exact-commit CI acceptance is pending; this does not establish historical actor attribution, real-person data absence or deployment isolation.

No DB record, hosted Neon, Railway, migration 0052, live service, approval policy or release flag changed. Source containment prerequisite only; status FIELD002 OPEN, 0052 BLOCKED, P0 NO-GO, 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, overall percentage unknown.

