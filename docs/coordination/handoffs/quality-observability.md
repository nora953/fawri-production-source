# Quality and observability handoff

## Branch, boundary, and final decision

- Branch: `parallel/quality-observability`
- Starting SHA: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Final tested implementation SHA: `7219764a427e20a88f9feb86ab6ddb4297b24cfa`
- Draft PR: `#4`, open, draft, unmerged, targeting `hardening/postgresql-foundation`
- Release decision: **NO-GO**
- External or production systems contacted: **no**
- Real customer data or real channel credentials contacted: **no**
- Force push used: **no**

This lane changed only `.github/workflows/**`, new `scripts/quality-*`, `scripts/ci-*`, `scripts/backup-*`, `scripts/restore-*`, `scripts/security-*`, isolated observability source/tests, and owned operations/security/backup/release/legal documentation. It did not modify domain logic, `app.ts`, `index.ts`, package manifests, lockfiles, `lib/db/**`, shared frontend code, `main`, or another branch.

Every branch update was preceded by a Remote HEAD comparison against the expected previous SHA. All checks reported `identical`; every ref update was a non-force fast-forward.

## Workflow review and replacement

Nine overlapping workflows were reviewed and removed because the same commit could repeat dependency installation, frontend/API builds, migration checks, and domain tests:

- `browser-storage-audit.yml`
- `complete-migration-safety.yml`
- `complete-schema-candidate.yml`
- `merchant-access-security.yml`
- `merchant-settings.yml`
- `meta-webhook-pipeline.yml`
- `order-operations.yml`
- `postgresql-migration-candidate.yml`
- `postgresql-schema.yml`

They were replaced by three workflows:

1. `quality-gates.yml`
   - Application matrix: `server`, `frontend`, `browser-storage`, `contracts`, `observability`.
   - Data matrix: `database`, `migration`, with disposable PostgreSQL.
   - Independent checks are aggregated so a typecheck failure does not hide later build or test results.
2. `security-supply-chain.yml`
   - Quality/security tool tests, workflow-policy enforcement, high-confidence repository secret scan, frozen-lockfile integrity, native dependency review, and a `pnpm audit` fallback.
3. `backup-restore-drill.yml`
   - Disposable PostgreSQL dump/checksum/restore/verification query and object-storage manifest/copy/restore/hash verification.

All three workflows have:

- top-level `permissions: contents: read`;
- no persistent `contents: write`;
- checkout with `persist-credentials: false`;
- branch-keyed `concurrency` with `cancel-in-progress: true`;
- bounded timeouts and fail-safe artifact scanning;
- push execution only for `hardening/**`;
- PR execution for lane/domain validation, preventing simultaneous lane push plus PR runs.

GitHub evaluates PR path filters against the complete PR diff. Therefore the backup drill reran on later synchronizations while its workflow remained part of the PR diff. This is one PR-triggered validation, not a duplicate push-triggered run.

## Quality, log, artifact, and audit controls added

- `ci-run-redacted.mjs` buffers output, redacts matched tokens/PII before display, and fails when sensitive output is detected.
- `security-scan-repository.mjs` reports only rule/path/line for high-confidence secret fingerprints and never prints the matched value.
- `security-scan-output.mjs` blocks artifact upload when token, direct-identifier, or customer-content patterns are found.
- `quality-run-gate.mjs` executes all independent checks in a suite and writes a bounded JSON status artifact.
- `quality-run-tests.mjs` dynamically discovers server TypeScript tests, all server `.test.mjs` files, frontend tests, migration tests, browser-storage tests, contracts, observability tests, and quality-tool tests without duplicate classification.
- `quality-run-audits.mjs` runs available order, merchant-settings, catalog, knowledge, and background-job audits and writes only allow-listed counts, status, readiness state, and blocker codes. It excludes issue details, merchant/customer identifiers, messages, and payloads.
- Missing domain audit scripts are explicitly reported as `not_integrated`, not silently marked green.
- `quality-workflow-policy.mjs` rejects missing least privilege, missing cancellation, persisted checkout credentials, `pull_request_target`, `contents: write`, and force-push commands.

## Isolated observability implementation

Added under `artifacts/api-server/src/observability/`:

- bounded liveness snapshot;
- readiness checks with timeout and redacted failure codes;
- a low-cardinality Prometheus registry that rejects merchant/customer labels and unsafe values;
- isolated `/health`, `/readiness`, and `/metrics` router factory;
- alert definitions for queue depth/oldest age, DLQ, webhook-signature failures, login abuse, and migration failures.

The router is intentionally **not mounted** in `app.ts` or `index.ts`. Its endpoints and metrics are inactive until central integration wires the router, real readiness checks, authoritative metric updates, access control, dashboards, and alert destinations.

## Backup and restore implementation

### PostgreSQL

- Custom-format `pg_dump` with no ownership/privilege restoration.
- Manifest containing format, timestamp, file name, size, and SHA-256 only.
- Restore is fail-closed unless `FAWRI_ALLOW_POSTGRES_RESTORE=1`.
- Manifest and checksum are verified before `pg_restore`.
- Restore success requires an explicit verification query and expected bounded result.

### Object storage

- Deterministic inventory with relative path, size, and SHA-256.
- Symlinks and traversal paths are rejected.
- Restore is fail-closed unless `FAWRI_ALLOW_OBJECT_RESTORE=1`.
- Every source object is verified before copying and every restored object is re-hashed afterward.

### Transitional local data request

The catalog handoff requires `catalog-inventory.json` under the configured `FAWRI_DATA_DIR` to remain in the encrypted transitional operational-backup inventory until PostgreSQL cutover. A restored copy is acceptable only after its source hash and catalog audit pass in an isolated target.

Production scheduling, encryption, retention, WAL/PITR, object-provider versioning, credentials, and legal retention approval were not configured by this branch. The executed drill proves the scripts on synthetic/disposable data; it does not prove production backup activation.

## Local/static checks

These checks were executed locally and must not be interpreted as GitHub runner-green evidence:

- Syntax checks for every new `.mjs` file: passed.
- `node scripts/quality-run-tests.mjs quality-tools`: **12 tests passed, 0 failed** across five files.
- `node scripts/quality-workflow-policy.mjs`: **3 workflows, 0 violations**.
- Local high-confidence scan of new/tracked content: no findings.
- Isolated observability TypeScript review: passed with temporary declarations; this is not the repository typecheck.
- Workflow YAML syntax parsing: passed; GitHub execution remains authoritative.

## Authoritative GitHub Actions evidence

Authoritative head: `7219764a427e20a88f9feb86ab6ddb4297b24cfa`.

### Quality gates — run `31136823419` — **FAILURE**

Passed jobs/checks:

- `Application / browser-storage`, job `92737906166`: passed.
- `Application / observability`, job `92737906188`: passed.
- Server build passed.
- Server unit tests: **32 passed, 0 failed**.
- Server integration/contract tests in the API test directory: **53 passed, 0 failed**.
- Frontend test suite passed.
- Database typecheck and schema generation passed before later database checks failed.
- Migration candidate generation passed before apply failed.
- Artifact token/PII scans and safe artifact uploads passed for every matrix job.
- Safe domain audits in the contracts job: **3 present, 3 passed, 0 failed**; catalog and knowledge audit scripts were correctly reported `not_integrated` because those branches were not part of this PR.

Failed jobs/blockers:

- `Application / server`, job `92737906089`: server typecheck failed. Build and both test groups still ran and passed because the gate aggregates independent checks.
- `Application / frontend`, job `92737906133`: typecheck failed on the non-exported `PaymentStatus` contract and build failed its required `PORT` environment contract; frontend tests passed.
- `Data / database`, job `92737906069`: generated schema drift was detected and schema smoke failed because the composite foreign-key target lacks the required unique constraint.
- `Data / migration`, job `92737906106`: **35 tests passed, 3 failed**; candidate apply failed with PostgreSQL `42830` for the `manual_reply_requests` foreign key to `conversations(id, merchant_id)` without a matching unique constraint.
- `Application / contracts`, job `92737906091`: **290 tests total; 284 passed, 6 failed**. Failures cover public schema documentation expectations, browser-storage active-path/count drift, auth source/compiled-output drift, database source-hash drift, and a nested frontend package missing a `build` script.

### Security and supply chain — run `31136823437` — **FAILURE**

Passed:

- `static-security`, job `92737906062`: syntax checks passed; quality/security tools **12/12**; workflow policy **3 workflows, 0 violations**; repository scan **388 files, 0 high-confidence findings**.
- `lockfile-integrity`, job `92737906162`: frozen install succeeded with lifecycle scripts disabled and dependency files were not rewritten.

Failed/blockers:

- `dependency-review`, job `92737906119`: native GitHub dependency review is unavailable because Dependency Graph/Advanced Security is not enabled for the repository. This was not suppressed or called green.
- `dependency-audit-fallback`, job `92737906145`: `pnpm audit --audit-level=high` found **22 vulnerabilities: 3 low, 5 moderate, 14 high**. Examples include affected `xlsx`, `vite`, `postcss`, `js-yaml`, `linkify-it`, `brace-expansion`, and `fast-uri` dependency paths.

### Backup and restore drill — run `31136823421` — **SUCCESS**

- Job `92737906096` passed.
- PostgreSQL client verification passed.
- Disposable source/target creation passed.
- PostgreSQL backup and SHA-256 manifest passed.
- PostgreSQL restore and bounded row-count verification passed.
- Object-storage backup, manifest, restore, recursive byte comparison, and restored-object hash verification passed.
- Drill report token/PII scan and artifact upload passed.

## Release decision: NO-GO

The branch does not claim green. Launch remains blocked by:

1. failed server and frontend typechecks/build contract;
2. generated database drift and invalid composite foreign-key target;
3. three migration contract failures and failed candidate apply;
4. six repository contract failures;
5. fourteen high-severity dependency findings and twenty-two total findings;
6. unavailable native GitHub dependency review/Dependency Graph;
7. unmounted observability router and unconfigured alert destinations/on-call routing;
8. production backup, retention, encryption, PITR, and object-versioning configuration not proven;
9. required privacy, consent, legal, retention, deletion, subprocessor, and support approvals not recorded.

A cancelled, skipped, unavailable, or static-only check is not release evidence.

## Requests collected from other handoffs

### Orders and settings

Available handoff requested TypeScript unit/runtime tests, all `.mjs` integration/static tests, audit tests, and safe JSON audit outputs for order operations and merchant settings. Dynamic test discovery and the bounded audit runner cover these paths after integration.

### Catalog and inventory

Available handoff requested TypeScript runtime tests, server `.test.mjs` contract coverage, catalog audit tests/output, and transitional backup coverage for `catalog-inventory.json`. These requests are included in discovery, the audit runner, and the backup runbook. The catalog audit remains `not_integrated` on this isolated PR.

### Knowledge and AI

Available handoff requested TypeScript tests, audit tests, seeded audit execution, and malicious/cross-tenant cases. Discovery includes the tests and the safe audit runner is configured for `audit-knowledge-operations.mjs`; the script remains `not_integrated` on this PR.

### Channels and messaging

Available handoff requested TypeScript messaging/queue tests and `audit-fawri-background-jobs.mjs` without real Meta credentials. Discovery includes these tests; the background-job audit was present and passed using local repository data only.

### Missing at final review

The expected `db-migration-cutover.md` and `auth-session-hardening.md` handoffs still returned `404 Not Found`. The integration coordinator must review them when available and add any nonstandard service/test/audit request before merge.

## Integration coordinator actions

1. Mount `createObservabilityRouter` under an internal/access-controlled route without exposing detailed readiness or metrics publicly.
2. Register real readiness checks for PostgreSQL, durable queue persistence, object-storage metadata access, migration state, and required key-management readiness.
3. Instrument authoritative queue/DLQ, webhook-signature, login-abuse, migration, and HTTP outcomes using bounded labels only.
4. Configure and test-fire alert destinations, dashboard ownership, primary/backup on-call, incident channel, and escalation timers.
5. Enable/verify branch protection, required checks, Dependency Graph/native dependency review, GitHub secret scanning/push protection, artifact access policy, and controlled dependency updates.
6. Re-run all matrices on the exact integrated release SHA after every domain handoff is merged.
7. Block release until PostgreSQL/object-storage production backup configuration and a verified restore drill on the release candidate are evidenced.
8. Record named privacy/legal/support approvals; passing CI cannot substitute for them.

## Known limitations and deferred work

- GitHub Actions use reviewed major tags such as `@v4`, not immutable full commit SHAs. Pinning actions to reviewed SHAs remains recommended.
- Proposed RPO/RTO and retention values in the runbook require business/legal approval.
- Alert thresholds are initial baselines and need representative non-production load/traffic tuning.
- Repository files cannot prove organization/repository settings or external alert/backup configuration.
- The observability components remain deliberately inactive until central integration.

## Rollback

Revert the commits on `parallel/quality-observability` to restore the nine prior workflows and remove the new quality/security/backup/restore/observability/docs files. No production data, database schema, package manifest, lockfile, or domain logic changed, so this lane requires no data rollback. Do not grant write permissions, bypass dependency failures, disable signature checks, or weaken release gates as a rollback shortcut.
