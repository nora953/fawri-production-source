# FIELD002 — hosted clean-clone portable PostgreSQL data-only restore PASS (2026-11-08)

## Grounded execution

- GitHub Actions push run: https://github.com/nora953/fawri-production-source/actions/runs/42473001506
- **Run ID:** `42473001506`; **job:** `clone-data-only-restore` / `128707956447`.
- **Exact source commit run:** `2c17bf0ee1d84eb5ec602ab71f1f51340ffb2ab1`, dedicated request commit whose checked-out parent SHA was pinned to `527dc96f71a8bdf33ced0c748c83853a0bf8a40b`.
- **Source:** only isolated nondefault Neon `br-polished-mouse-b1proel7`, direct compute `ep-withered-union-b1jh284c`, `neondb`, authenticated `neondb_owner`, PostgreSQL 18.6, 52 Drizzle ledger entries, 0 notifications. The source credential was a GitHub secret; no credential content was read or recorded in this evidence.
- **Destination:** disposable loopback-only PostgreSQL 18 container on GitHub runner, newly created database `fawri_field002_portable_restore`. No default/production or original staging Neon database target was used.

## Actual hosted job result — PASS (not inferred from PR-only checks)

Independent GitHub workflow-run collection returned the push-triggered run `42473001506` with status `completed` and conclusion `success`. The run-jobs response returned its single real job `128707956447` as `completed/success` with every stage completed/success, including:

1. Validate exactly one immutable request-file change and exact approved clone ID/parent source commit.
2. Validate pinned source credential identity and PostgreSQL server, migrations 52, notices 0.
3. Execute source-side SELECT digests and custom `pg_dump`, with no source SQL write step.
4. `pg_restore --exit-on-error --no-owner --no-privileges` into fresh local PostgreSQL 18.
5. Independently compare source pre-dump, source post-dump and restored **all table row** digests.
6. Run ephemeral file cleanup and stop local containers, both reported success.

The **actual hosted log** (not only authored workflow text) emitted:

```text
FIELD002_EXACT_ONE_FILE_READONLY_REQUEST_ACCEPTED
FIELD002_HOSTED_CLEAN_CLONE_READONLY_DUMP_CREATED_NO_ARTIFACT
FIELD002_PORTABLE_CLEAN_CLONE_DATA_ONLY_PASS {"tables":97,"rows":461,"completeTableRowChecksumsMatch":true,"sourceStableBeforeAfter":true,"portableArchiveRestoredToFreshPostgres18":true,"ownerAclRestoreProven":false,"externalDurableBackupProven":false,"originalStagingTouched":false,"commercialReleaseAuthorized":false}
FIELD002_EPHEMERAL_FILES_CLEANUP_REQUESTED_NO_DATA_UPLOADED
```

The CI run contains no uploaded dump artifact. The source only allowed a runner-private ephemeral archive. Verified source/static workflow contract separately through the `Backup and restore drill` run `42474775883` on commit `06c225d4258b5c7baeaf8e6e5c12e721ea0d29ba`: **44/44 unit safety tests PASS** including the portable workflow target/authorization assertions. Multiple push run successes existed; **only pinned immutable request run 42473001506 is accepted for this exact evidence**.

## Strict bounded interpretation

**ACCEPT:** clean-clone portable full **row-data and schema** dump/restore with independent digest parity **97/97 tables, 461 rows** and source stability on a disposable PostgreSQL 18 destination. This closes only the previously unverified *hosted clean-clone portable DATA-ONLY restore subcondition*. No merchant data, secrets or raw dump were intentionally published to a GitHub artifact or PR comment.

**DO NOT INFER:** restore of ownership, per-table or column ACLs, SECURITY DEFINER function owner authority, role membership/grants/default ACL/globals; independent durable/encrypted/offsite backup; restore of the **original** ACL0 staging database; provider snapshot/protected backup; exclusive original no-reconnect maintenance; permanent three least-privilege LOGIN cutover; original 0028–0051 migrations; genuine original SQL+HTTP tenant test; commercial R2 import/restore enforcement. The test deliberately used `--no-owner --no-privileges`, so claiming any ACL acceptance would be incorrect.

**No original or default Neon SQL writes, Railway deployment, secret/role/ACL mutation, branch delete, merge or release in this evidence. FIELD002 OPEN, PR #550 DRAFT, migration 0052 BLOCKED, commercial NO-GO.**
