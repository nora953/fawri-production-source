# PostgreSQL and object-storage backup/restore runbook

## Evidence boundary

The GitHub Actions restore drill uses disposable PostgreSQL databases and synthetic object files only. It does not prove that production backups, encryption, retention, or credentials are configured. Production backup activation remains an infrastructure task requiring owner approval and secret management outside the repository.

## Proposed baseline requiring owner approval

- PostgreSQL: encrypted daily logical backup, continuous WAL/PITR where the hosting platform supports it, 35 daily restore points, and 12 monthly restore points.
- Object storage: versioning enabled, immutable or deletion-protected backup copy, daily inventory/manifest, 35-day standard retention, and 12 monthly snapshots for legally retained records.
- Restore drill: weekly disposable drill and a pre-release drill on the exact release candidate.
- Proposed targets: RPO 24 hours without PITR or 15 minutes with PITR; RTO four hours. These are proposals, not approved business commitments.

## PostgreSQL backup

1. Select a replica or controlled primary window and record the database identifier, schema migration version, start time, and operator.
2. Run `scripts/backup-postgresql.mjs` with the connection URL supplied from the runtime secret manager, never as a committed argument.
3. Store the dump and manifest in encrypted, access-controlled backup storage. The manifest contains only file name, size, creation time, and SHA-256.
4. Verify upload size and SHA-256 after transfer.
5. Record backup completion without connection strings, row content, or customer identifiers.

## PostgreSQL restore

1. Restore only into a newly created, isolated target. Production in-place restore requires a separate approved incident plan.
2. Set `FAWRI_ALLOW_POSTGRES_RESTORE=1` only for the approved target.
3. `scripts/restore-postgresql.mjs` verifies the manifest and checksum before `pg_restore`.
4. Supply a read-only verification query with an expected bounded result.
5. Validate schema migration journal, critical table existence, tenant constraints, representative row counts, and application smoke tests.
6. Confirm the restored target contains no unexpected users/privileges and rotate credentials before any cutover.
7. Destroy disposable drill targets and retain only the sanitized report.

## Object-storage backup and restore

1. Build a deterministic inventory with relative object path, size, and SHA-256. Symlinks and traversal paths are rejected.
2. Copy objects to a separate protected backup location and save `manifest.json`.
3. Before restore, verify every source object against the manifest.
4. Restore into an empty isolated target with `FAWRI_ALLOW_OBJECT_RESTORE=1`.
5. Re-hash every restored object and compare object count and total bytes.
6. Validate metadata/content-type and access policy in the real object-storage provider; the repository drill validates bytes and paths only.

## Restore acceptance criteria

A restore is successful only when checksum verification, schema checks, tenant constraints, bounded row-count checks, object manifest verification, application smoke tests, and operator sign-off all pass. A created backup without a verified restore is not release evidence.
