# Quality and observability handoff

## Branch and scope

- Branch: `parallel/quality-observability`
- Starting SHA: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Implementation SHA: `PENDING_INITIAL_PUSH`
- Final branch SHA: `PENDING_HANDOFF_FINALIZATION`
- External/production systems contacted: **no**
- Real customer data contacted: **no**

This lane changed only `.github/workflows/**`, new `scripts/quality-*`, `scripts/ci-*`, `scripts/backup-*`, `scripts/restore-*`, `scripts/security-*`, isolated observability files/tests, and owned operations/security/backup/release/legal documentation.

## Workflow review and replacement

The nine existing workflows were reviewed and replaced because they repeated dependency installation, API/frontend builds, and overlapping domain tests for the same commit. Removed workflows:

- `browser-storage-audit.yml`
- `complete-migration-safety.yml`
- `complete-schema-candidate.yml`
- `merchant-access-security.yml`
- `merchant-settings.yml`
- `meta-webhook-pipeline.yml`
- `order-operations.yml`
- `postgresql-migration-candidate.yml`
- `postgresql-schema.yml`

New workflows:

1. `quality-gates.yml`: application matrix (`server`, `frontend`, `browser-storage`, `contracts`, `observability`) and data matrix (`database`, `migration`).
2. `security-supply-chain.yml`: workflow policy, repository secret scan, redaction-tool tests, frozen lockfile verification, and PR dependency review.
3. `backup-restore-drill.yml`: disposable PostgreSQL backup/restore with verification and object-storage manifest backup/restore with byte/hash verification.

All workflows use top-level `contents: read`, `actions/checkout` with `persist-credentials: false`, branch-keyed concurrency with `cancel-in-progress: true`, bounded timeouts, and no persistent write permission. Push execution is limited to `hardening/**` plus this quality branch; domain branches are intended to run on pull requests to avoid push-plus-PR duplicate executions.

## Behavior added

- Buffered CI command wrapper that redacts token/PII patterns before printing and fails when sensitive output is detected.
- Repository secret scanner that reports rule/path/line only, never the matched value.
- Artifact scanner that blocks upload when token or PII patterns are present.
- Dynamic test discovery that separates server, frontend, migration, browser-storage, contracts, observability, and quality-tool tests without duplicate classification.
- Workflow policy check for least privilege, concurrency cancellation, explicit triggers, disabled checkout credential persistence, no `pull_request_target`, no `contents: write`, and no force-push command.
- PostgreSQL backup manifest with SHA-256 and guarded restore with checksum plus verification query.
- Object-storage deterministic manifest, traversal/symlink rejection, guarded restore, and post-restore hash verification.
- Isolated health/readiness/metrics/router/alert definitions under `src/observability`; not mounted into `app.ts`.
- Go/no-go checklist covering runner evidence, security, data migration, verified restore, rollback, monitoring, privacy/legal approval, and support readiness.

## Local checks executed before push

Executed against the new files in an isolated local working directory:

1. `node --check scripts/*.mjs` — passed for every new `.mjs` file.
2. `node --test scripts/security-redaction-lib.test.mjs scripts/backup-object-storage.test.mjs scripts/restore-postgresql.test.mjs` — **7 tests passed, 0 failed**.
3. `node scripts/quality-run-tests.mjs quality-tools` — discovered 3 files; **7 tests passed, 0 failed**.
4. `node scripts/quality-workflow-policy.mjs` — **pass**, 3 workflows, 0 violations.
5. `node scripts/security-scan-repository.mjs` on a temporary Git index containing the new files — **pass**, 28 files scanned, 2 scanner self-test files skipped, 0 findings.
6. TypeScript syntax/type review of isolated observability source using local temporary declarations for Node/Express — passed. This is not a substitute for repository `pnpm` typecheck.
7. YAML parse check for all three workflow files — syntax parsed successfully. The local parser treats YAML 1.1 `on` as a boolean key, which is a parser-version behavior; GitHub Actions execution remains the authoritative validation.

## GitHub Actions evidence

`PENDING_AFTER_PUSH_AND_PR`

Do not interpret the local checks above as GitHub runner success. Exact run IDs, job conclusions, and any failures/fixes will be inserted after the branch push and draft PR trigger.

## Other lane workflow requests

At the pre-push review, the expected handoff files on all six other execution branches returned `404 Not Found`:

- `db-migration-cutover.md`
- `auth-session-hardening.md`
- `orders-settings-finalization.md`
- `catalog-inventory.md`
- `knowledge-ai.md`
- `channels-messaging.md`

No lane-specific workflow request was therefore available to copy. The new matrices discover API tests, frontend tests, scripts contract tests, migration tests, and observability tests by file pattern so later integrated lane tests are included without domain-file edits. The integration coordinator must re-check completed handoffs and adjust filters only if a lane documents a nonstandard test location or required service.

## Shared-file integration requests

1. Mount `createObservabilityRouter` from `artifacts/api-server/src/observability/router.ts` in the central application wiring under an internal path; this lane did not edit `app.ts` or `index.ts`.
2. Register real readiness checks for PostgreSQL, durable queue persistence, object-storage metadata access, migration state, and required key-management readiness.
3. Instrument authoritative queue/DLQ, webhook signature, login abuse, migration, and HTTP outcomes using `FAWRI_METRICS`. Do not add merchant/customer identifiers as labels.
4. Configure the real alerting destination, on-call ownership, dashboard, and access control outside this isolated lane.
5. Verify repository settings: branch protection, required checks, GitHub secret scanning/push protection, artifact access, and dependency update automation. Repository files cannot prove these settings.

## Known risks and deferred work

- GitHub action references use reviewed major tags such as `@v4`, not immutable commit SHAs. Pinning to full SHAs is recommended in a later controlled dependency update.
- Production backup scheduling, encryption, WAL/PITR, object-storage versioning, retention, and credentials are not configured or contacted by this branch.
- Proposed RPO/RTO and retention values require owner/legal approval.
- Alert thresholds are launch baselines and require tuning after representative non-production traffic.
- The observability router is intentionally inactive until integrated centrally.
- Full repository tests and actual PostgreSQL restore tooling are validated only when GitHub runners execute the workflows.

## Rollback

Revert the quality implementation commit to restore the nine prior workflows and remove the new scripts/components/docs. No database schema, production data, application domain logic, package manifest, or lockfile is changed, so rollback requires no data migration. If only one new workflow is problematic, disable or revert that workflow while preserving the others; do not grant write permissions as a workaround.
