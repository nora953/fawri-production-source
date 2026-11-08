# FT-01 — clean first-commercial schema bootstrap: bounded admission plan

**Recorded:** 2026-11-09 (Baghdad). **Source-only, NOT an approval for hosted writes.**
**Status:** new database empty-schema preflight PASS; bootstrap, three restricted logins, hosted RLS/HTTP and production recovery remain OPEN. FIELD002 OPEN, 0052 BLOCKED, Draft PR #550, commercial NO-GO.

## Accepted nonrepeatable checkpoint

The owner created an independent Neon project `crimson-cherry-65705041` / branch `br-holy-waterfall-b993zglb` (`production`) in Frankfurt, PostgreSQL18, database `fawri`. The owner ran the SELECT-only [reviewed FT-01 preflight](sql/P0-FT01-NEW-PRODUCTION-EMPTY-SCHEMA-READONLY-20261108.sql) in the new project's Neon SQL Editor and supplied its entire result:

```json
{
  "database_name":"fawri",
  "postgres_major":18,
  "session_role_name":"fawri_owner",
  "user_relations":0,
  "user_data_relations":0,
  "public_relations":0,
  "drizzle_ledger_exists":false,
  "pre_migration_readonly_decision":"EMPTY_SCHEMA_PRE_MIGRATION_CANDIDATE"
}
```

Accept this as **bounded empty-schema preflight**, not independent API proof of branch ID, object-store state or backup/recovery. The source policy and production prelistener are pinned to the new branch and ban historical staging imports. Retain prior isolated SQL/HTTP 7/7 and original ephemeral recovery; do not start from zero.

## Existing bootstrap paths: do not bypass safety boundaries

- `lib/db/drizzle/meta/_journal.json` has **53 entries, idx 0–52**, latest `0052_cashier_stream_receipt_storage`. The hosted 0052 release gate remains **BLOCKED**. Do not apply full canonical journal silently.
- `lib/db/drizzle/0052_cashier_stream_receipt_storage.sql` creates stream/receipt relations and policies, triggers, a dedicated NOLOGIN role and scoped grants. Schema parity cannot be claimed if this is omitted without explicit decision.
- `lib/db/scripts/smoke-migration.mjs` deliberately only permits loopback host and `fawri_ci`, with a separate allow flag; it is **not** for hosted Neon.
- `scripts/run-postgresql-migration-cutover.mjs --write` deliberately returns `REAL_CUTOVER_NOT_IMPLEMENTED`; do not bypass or repurpose it.
- `.github/workflows/complete-schema-candidate.yml` builds a candidate in disposable PostgreSQL CI; its structural acceptance is not full commercial runtime owner/ACL/role/RLS proof.
- `lib/db/scripts/lib/complete-schema-bootstrap.mjs` calls itself a structural harness only and references 0052. Do not use its generated artifact to write hosted production without independent preimage/permission review.

## Finite next work

1. Freeze exact source SHA and an executable schema-only plan, expected migration journal/DDL hashes, role/owner/function/RLS catalog and rollback. Reconcile whether 0052 can be safely included **or remains a reason to block the rollout**. No old staging migration as default route.
2. Reuse existing local/disposable proof and add only the missing target-specific correctness checks. Ensure *three separate LOGINs* for tenant/auth/operator, no privileged runtime owners/BYPASSRLS and 8/8 strict merchant-privacy policies.
3. Before actual new-target writes: establish source/branch and owner identity, zero business schema and no migration ledger (again only if drift/time requires), safe provider recovery/snapshot, limited network/credentials, lock/fail-close conditions and owner-approved source SHA. The owner's project-creation approval was **not** SQL-write permission.
4. Under separate scoped owner consent, run a reviewed migration runner against **only the new project**. No import, restore or seed from historical staging, and no deployment or traffic. Verify resulting schema/owner/ACL/RLS and hosted tenant SQL+HTTP negatives before first commercial pilot.
5. Document roll-forward/rollback, production recoverability and provider policy signoff, and separately resolve the known cashier full lifecycle assertion failure in CI at `cashier-full-lifecycle-postgres.integration.test.ts:399`.

**External access blocker:** current Neon connector remains pinned to **old** `round-fire-18493605`; `describe_project` on the new project was rejected as mismatched scope. Never omit `project_id` to force a connection to the old source. Owner can use new project's SQL Editor for any separately reviewed read-only checks; no need for further user action at this checkpoint.

## Safety claim

This note is GitHub source-only. No hosted SQL write, role change, data copy, migration, secret extraction, new paid service, deployment or merge has been executed under this plan. No claim of FIELD002 closure or overall P0 completion.

## 2026-11-09 update — source inventory automated and 0052 dependency confirmed

**Exact executable source SHA:** `172f34ab40a884bc462ae488861fc6f1a2891cc4`.
[GitHub Actions Backup and restore drill #42525762858](https://github.com/nora953/fawri-production-source/actions/runs/42525762858) **SUCCESS** for both its `observability-contracts` and `disposable-restore-drill` jobs. Inside [observability-contracts job #128868903126](https://github.com/nora953/fawri-production-source/actions/runs/42525762858/job/128868903126), new targeted FT-01 contract tests report **5 passed / 0 failed / 0 skipped**, and `FT01_SOURCE_ONLY_0052_HELD_PASS`.

**Source change:** `scripts/lib/ft01-clean-bootstrap-source-plan.mjs` is a **no-network, no-SQL, no-write** runner that inventories real committed `0000..0052` source SQL and produces deterministic SHA256 hashes, verifies contiguous journal identity, `0052` stage SHA256 and snapshot presence, and returns an explicit **HELD_NOT_AUTHORIZED_FOR_HOSTED** disposition for `0052`, with `approved_to_execute=false`. Its paired `scripts/tests/ft01-clean-bootstrap-source-plan.test.mjs` rejects wrong database/role/PG version, nonempty table catalog, existing Drizzle ledger, malformed journal, reordered or absent migrations, modified 0052 bytes, and unsafe stage metadata. The source-only validation step is now wired into `.github/workflows/backup-restore-drill.yml` before live PostgreSQL-dependent checks.

**Important rollout decision:** You cannot simply deploy only `0000..0051` and call this a completed first-commercial schema: `artifacts/api-server/src/index.ts` invokes `assertProductionCashierStreamStorageReady` **before provider bootstrap/listener**. That readiness depends on canonical cashier stream/receipt objects introduced by `0052_cashier_stream_receipt_storage.sql` (both object-owner/ACL and policy checks). Omitting 0052 leaves startup **fail closed**. On the other hand, its source storage/readiness was previously bounded accepted but the full financial receipt/admission/device protocol remains pending; **do not silently waive 0052 hosted rollout gating**.

**Shortest bounded safe path:** resolve 0052's existing residual approval/operations contract (reuse accepted source proof); prepare a new-target-only reviewed schema bootstrap and 3 restricted LOGIN roles, with pinned source/branch and no import/restore/seed. Since new `fawri` has no application relations or real merchants, a failed *pre-customer* schema preparation can be recovered by explicitly authorized rebuild of the isolated empty target; that is **not** a substitute for long-term production backup/PITR, nor permission to destroy or recreate it without consent. After the reviewed source plan and recovery policy are proven, request separate scoped owner consent for hosted SQL writes; none has been granted yet.

**Gate status:** FT-01 source inventory **bounded PASS**, new-target empty-schema **bounded PASS**, actual schema/roles/RLS/HTTP/backup **OPEN**. FIELD002 OPEN, 0052 hosted BLOCKED, draft PR #550, release NO-GO.
