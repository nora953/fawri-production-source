# PostgreSQL migration and cutover runbook

## Status and safety boundary

This runbook prepares a future cutover. It does not authorize or execute a production cutover. The repository command defaults to a read-only dry run. The `--write` mode intentionally fails with `REAL_CUTOVER_NOT_IMPLEMENTED` until production credentials, approvals, backup evidence, and a restore rehearsal are supplied outside this branch.

No step in this document should be run against Replit or a real production database during branch validation.

## Deterministic dry run

```bash
node scripts/run-postgresql-migration-cutover.mjs /absolute/path/to/export
```

Expected properties:

- no `DATABASE_URL` connection is used;
- every known source file is represented in the manifest;
- every planned target row has one deterministic lineage record;
- operational overlays are merged after their base rows;
- validation is performed against the committed Drizzle snapshot;
- failure is closed when a source file is missing, malformed, unsupported, or tenant-inconsistent.

The report identities that must be archived with a future change ticket are:

- `tool_version`;
- `schema_validation.snapshot` and `schema_validation.snapshot_sha256`;
- `source_manifest_sha256`;
- `source_lineage_sha256`;
- `table_counts`;
- the redacted error and warning lists.

## Disposable PostgreSQL rehearsals only

Rollback rehearsal:

```bash
FAWRI_ALLOW_MIGRATION_ROLLBACK_TEST=1 \
DATABASE_URL=postgresql://fawri_ci:fawri_ci@127.0.0.1:5432/fawri_ci \
node scripts/run-postgresql-migration-cutover.mjs /absolute/path/to/fixture --rollback-test
```

Commit, reconciliation, idempotency, and cleanup rehearsal:

```bash
FAWRI_ALLOW_MIGRATION_COMMIT_TEST=1 \
DATABASE_URL=postgresql://fawri_ci:fawri_ci@127.0.0.1:5432/fawri_ci \
node scripts/run-postgresql-migration-cutover.mjs /absolute/path/to/fixture --commit-test
```

The test writer permits only a local host and a database named `fawri_ci`. It refuses all other targets.

## Lock and commit protocol

1. Acquire cooperative lock files in deterministic lexical order for every source used by the planner.
2. Build the authoritative plan only after all locks are held.
3. Start one PostgreSQL transaction.
4. Write migration-run and source-file metadata inside that transaction.
5. Insert target rows in a topological order derived from the committed foreign keys.
6. Reconcile row counts and comparable values.
7. Write source-record lineage and reconciliation results inside the transaction.
8. Rebuild the complete plan immediately before `COMMIT`.
9. Compare every source descriptor, manifest SHA, lineage SHA, table count, tool version, and schema snapshot SHA.
10. On any mismatch or exception, issue `ROLLBACK`; do not retry automatically.
11. Release locks in reverse order.

## Backup prerequisites for a future production cutover

Before production write mode can be implemented, the operator must provide all of the following:

- approved change ticket and named incident commander;
- a restricted migration role distinct from the application role;
- a verified logical backup created with a PostgreSQL client version compatible with the target server;
- a provider-level snapshot or equivalent point-in-time recovery marker;
- recorded database server version, extensions, collation, encoding, and timezone;
- checksums and byte sizes for every backup artifact;
- encrypted storage location and retention expiry;
- a restore rehearsal into a disposable PostgreSQL instance;
- reconciliation evidence for schema objects, row counts, tenant constraints, and selected record hashes;
- a tested application maintenance/read-only procedure;
- a maximum cutover window and an explicit abort deadline.

Example logical backup commands are templates only and must not be run by this branch:

```bash
pg_dump --format=custom --no-owner --no-acl --file=fawri-before-cutover.dump "$PRODUCTION_DATABASE_URL"
pg_dumpall --globals-only --file=fawri-before-cutover-globals.sql "$PRODUCTION_DATABASE_URL"
sha256sum fawri-before-cutover.dump fawri-before-cutover-globals.sql
```

Do not place credentials or backup contents in CI logs or repository artifacts.

## Restore rehearsal

Restore only into an isolated database with no application traffic:

```bash
createdb fawri_restore_rehearsal
pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl \
  --dbname=fawri_restore_rehearsal fawri-before-cutover.dump
```

Then verify:

- all expected schemas, tables, indexes, enums, checks, and foreign keys exist;
- tenant-composite foreign keys reject cross-merchant references;
- row counts match the backup inventory;
- sampled deterministic hashes match;
- the migration dry run produces the archived manifest and lineage identities;
- no external webhook, Meta, Replit, or customer-facing process is enabled.

## Abort and rollback criteria

Abort before commit when any of these occurs:

- a source SHA, byte size, existence flag, or manifest identity changes;
- the schema snapshot identity changes;
- any source record lacks lineage;
- an operational lock cannot be acquired;
- a foreign-key cycle or unsupported table appears;
- reconciliation differs by count or value;
- a tenant-composite constraint fails;
- the backup or restore rehearsal evidence is missing;
- the approved maintenance window or abort deadline is exceeded.

Before transaction commit, rollback is a normal PostgreSQL `ROLLBACK` and must leave no application or migration-metadata rows.

After a real commit, rollback must be treated as restore/fail-forward decision, not as an automatic reverse SQL migration. The incident commander must choose one of:

1. keep the new database read-only and correct forward from the archived manifest; or
2. stop application traffic and restore the verified pre-cutover backup/snapshot.

Never delete the old source export or backup until post-cutover verification and the retention period are complete.
