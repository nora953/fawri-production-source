# Backup / Restore Validation Runbook

## Scope

This runbook covers validation-only backup and restore drills. The scripts in this branch are deliberately restricted to disposable targets and are not production backup tooling.

The drill must never use Production, Replit, hosted PostgreSQL, cloud object storage, or real external credentials.

## PostgreSQL safety contract

`backup-postgresql.mjs` requires all of the following before `pg_dump` can run:

- `FAWRI_ALLOW_DISPOSABLE_POSTGRES_BACKUP=1`.
- A PostgreSQL URL whose host is loopback only: `127.0.0.1`, `localhost`, or `::1`.
- A database name approved for the drill: `fawri_backup_source` or `fawri_backup_drill_*`.

`restore-postgresql.mjs` requires all of the following before `pg_restore` can run:

- `FAWRI_ALLOW_DISPOSABLE_POSTGRES_RESTORE=1`.
- A loopback-only PostgreSQL URL.
- A restore database named `fawri_restore_target` or `fawri_restore_drill_*`.
- A single read-only verification `SELECT` without comments or statement separators.
- A backup whose manifest format, size, and SHA-256 all match before restore begins.

Failures are generic and database URLs/credentials are redacted from command errors.

## PostgreSQL drill order

1. Start the GitHub Actions PostgreSQL service container.
2. Create the safe fixture table and three fixture rows in `fawri_backup_source`.
3. Create the empty disposable `fawri_restore_target` database.
4. Run the guarded backup script.
5. Independently recalculate the dump SHA-256 and compare it with the manifest before restore.
6. Scan the dump for database URLs, URI credentials, private-key headers, GitHub token prefixes, and OpenAI-style key prefixes.
7. Run the guarded restore script.
8. Verify the restored row count.
9. Calculate deterministic source and restored consistency hashes and require equality.
10. Write a report containing only booleans, counts, sizes, commit SHA, and backup SHA-256.
11. Scan the report for secret patterns before upload.
12. Drop disposable databases and remove temporary files in an `always()` cleanup step.

The raw PostgreSQL dump is never uploaded as a workflow artifact.

## Object-storage drill

The object scripts operate only on local filesystem fixtures. They do not contain S3, GCS, R2, Replit Object Storage, or other production-storage transports.

Both backup and restore require `FAWRI_DISPOSABLE_OBJECT_ROOT`. Every source, backup, and restore path must resolve below that root. Backup and restore also require separate explicit guards:

- `FAWRI_ALLOW_DISPOSABLE_OBJECT_BACKUP=1`
- `FAWRI_ALLOW_DISPOSABLE_OBJECT_RESTORE=1`

The backup manifest contains relative object path, byte size, and SHA-256 only. Object contents are not copied into the manifest. Restore verifies every backup object before the target directory is replaced, then verifies every restored object again.

## Restore evidence

A successful workflow report proves:

- source and restore databases were disposable;
- backup checksum was verified before restore;
- restored PostgreSQL row count matched expectation;
- source/restored PostgreSQL consistency hashes matched;
- object-storage backup/restore was local-disposable only;
- every object restored consistently;
- no Production/Replit database was used;
- no external credentials were used;
- the uploaded report passed a secret-pattern scan.

## Failure handling

Any checksum mismatch, unsafe path, remote database host, unapproved database name, unsafe verification SQL, missing guard, object mismatch, or report secret scan failure terminates the drill. Do not bypass a guard to make CI pass.
