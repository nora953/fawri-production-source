# Production Deployment Rollback Policy

## Scope

This policy defines the release rollback boundary for Fawri Core. It does not claim that a hosted provider backup, PITR, or object-storage retention policy is configured. Those are production launch requirements and must be verified in the selected infrastructure before customer traffic is enabled.

## Release rule

Every production release must record the application commit, database migration journal position, deployment time, and the immediately previous application version.

Application rollback is allowed only when the previous application version is demonstrably compatible with the database schema currently in production.

## Database migration rule

Production database migrations are forward-only by default.

- Do not run destructive automatic down-migrations in production.
- Prefer expand/contract changes: add compatible structures first, deploy compatible readers/writers, migrate data, and remove obsolete structures only in a later release after rollback compatibility is no longer required.
- A failed migration must stop the release. Do not mark a migration as applied manually to bypass a failure.
- If an incident involves an incompatible schema or data mutation, stop affected writes before recovery decisions.

## Incident decision order

1. Stop or drain writes that could increase damage.
2. Preserve evidence and capture the current deployment commit and migration position.
3. Confirm a recent production backup/PITR recovery point and its retention before any destructive action.
4. If the current schema is backward-compatible, roll the application back to the previously verified version.
5. If application rollback is unsafe, prefer a reviewed forward-fix migration/application release.
6. Restore the production database only when forward recovery is unsafe or impossible and the incident owner explicitly accepts the data-loss window implied by the selected recovery point.
7. After restore, reconcile external side effects and queued work before reopening writes.

## Production backup requirements

Before launch, the selected hosted infrastructure must provide and document:

- automated PostgreSQL backups and, where supported, point-in-time recovery;
- an explicit retention period;
- encrypted backup storage and access control;
- backup/restore ownership and escalation;
- a measured restore drill against a production-like isolated target;
- explicit business-approved RPO and RTO values;
- equivalent retention/recovery rules for production object storage.

RPO and RTO are deployment decisions. They must not be invented by the application repository before the production provider and business tolerance are selected.

## CI evidence boundary

The repository's backup/restore workflow is a disposable validation drill only. It proves checksum verification, restore mechanics, consistency checks, secret scanning, and cleanup behavior. It does **not** prove that production backups, PITR, retention, RPO, RTO, or provider credentials are configured.

A production go-live checklist must therefore include separate evidence for hosted backup/PITR configuration and a successful production-like restore drill.
