# F004-R1 — Offline legacy draft planner CI evidence (2026-11-02)

- Scope: GitHub-only source and synthetic offline planner tests. No hosted access, migration execution, SQL import, deploy, order continuation, or release approval.
- Source commit tested: `535c7448f5846a4e340019fec31e2c0f6c33b616` (Draft PR #550).
- CI: [Complete migration safety run 41437863334](https://github.com/nora953/fawri-production-source/actions/runs/41437863334), job `125252078476`: **completed/success; 50 tests passed, 0 failed**.
- Verified job command includes `scripts/tests/plan-postgresql-migration.test.mjs`, `scripts/tests/run-postgresql-migration-plan.test.mjs` and five previously covered migration/operational-safety suites. Both planner files also passed `node --check`.
- Verified named F004-R1 regressions: duplicate matching conversation identity rejected; unverified historical TTL evidence rejected without source mutation; self-consistent but untrusted historical TTL claim rejected; explicit expired drafts preserved for both supported states.
- Workflow change: commit `535c7448f584` adds both planner suites to CI trigger paths, syntax checks, and test command; this is an automated future regression gate, not an application runtime change.
- Owner-approved scope remains bounded to source-bound offline legacy draft mapping. Historical TTL/config attestation has **not** been certified; planner must fail closed when missing. Current consumer/retention/hosted inventory and F004-R2 remain unresolved. No automatic continuation, order creation, TTL guessing, or source deletion authorized.
- Closure status: **F004-R1 OPEN (CI evidence improved; final source-contract and lifecycle acceptance reconciliation pending)**; **F004-R2 BLOCKED_HOSTED_VERIFICATION**; parent `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX` OPEN; release **NO-GO**. Do not interpret 50 passing synthetic tests as hosted data acceptance.
- Next exact action: reconcile this current-source proof against F004-R1 acceptance checklist and consumer/disposition contract; do not duplicate already-passing tests. Preserve separate hosted F004-R2 block and existing approved boundaries.

## Follow-up: embedded conversation identity conflict — 2026-11-02

- Source fix: `674980ca81fd41be61dd39ecef171505a4c6e1c9` rejects a legacy Map draft if its embedded `conversation_id` conflicts with the source Map conversation key. This prevents silent normalization of contradictory source identity.
- Regression test: `b70b6081ec450caefeaa7627f2dc149d1a591a4e` verifies explicit `LEGACY_DRAFT_CONVERSATION_KEY_CONFLICT`, rejected plan, no source mutation, no database connection or writes.
- Exact-head CI: [Complete migration safety run 41440103104](https://github.com/nora953/fawri-production-source/actions/runs/41440103104), job `125259527459`, **completed/success; 51 tests passed, 0 failed**. The new named regression passed in the job log.
- Scope remains synthetic offline planning only; no real historical data, hosted SQL, consumer continuation or release signoff. F004-R1 remains OPEN pending full contract acceptance; F004-R2 remains BLOCKED; release NO-GO.

## Follow-up: embedded channel identity conflict — 2026-11-02

- Source fix `55ae3ed010df6617d2d9858eb1ac4ac774915aed` rejects an explicit draft channel_id that contradicts its verified conversation channel.
- Regression commit `1516734056aeee74b488540403ce41409dac1788` verifies LEGACY_DRAFT_CHANNEL_ALIAS_CONFLICT, rejected plan, unchanged source files and no DB writes/connection.
- [Complete migration safety run 41440735812](https://github.com/nora953/fawri-production-source/actions/runs/41440735812), job 125261734426: completed/success, 52 passed, 0 failed; named channel conflict regression passed.
- [Final quality gates run 41440735821](https://github.com/nora953/fawri-production-source/actions/runs/41440735821): completed/success.
- F004-R1 OPEN; F004-R2 BLOCKED_HOSTED_VERIFICATION; parent P0 OPEN; release NO-GO. No hosted/import/runtime continuation accepted.

## Positive-path compatibility verification — 2026-11-02

- Commit `f9c26032c752144b516dd8cacdd4bddf730dc059` extends the existing F004-R1 positive-path regression for both supported awaiting states with explicit matching conversation_id and channel_id. This ensures conflict checks do not reject verified matching identities.
- [Complete migration safety run 41441522686](https://github.com/nora953/fawri-production-source/actions/runs/41441522686), job 125264291462: completed/success; 52 tests passed, 0 failed; named positive-path test passed.
- No database connection, writes or source mutation were asserted by the regression. F004-R1 remains OPEN pending remaining contract acceptance; F004-R2 BLOCKED; NO-GO.

## R1 acceptance boundary reconciliation — 2026-11-02

- The owner-approved 2026-10-31 decision limits implementation to offline legacy draft mapping; it does not attest a historical TTL or approve hosted import, runtime continuation, or source deletion.
- Source inspection confirms `validateLegacyDraftProvenance` deliberately rejects self-declared historical TTL claims. Thus a legacy draft without an explicit original expiry cannot be made plan-ready from an assumed 60-minute default. This is a deliberate remaining evidence blocker, not an authorization to weaken the guard.
- Exact-head CI for `abde75fb26bd590718cbacbcd59d72ecc5935395`: [Complete migration safety 41441964546](https://github.com/nora953/fawri-production-source/actions/runs/41441964546) SUCCESS and [Final quality gates 41441965649](https://github.com/nora953/fawri-production-source/actions/runs/41441965649) SUCCESS. Earlier quality-gates run 41441522435 was CANCELLED and must not be called a passing run.
- R1 source-only acceptance remains limited to the verified explicit-expiry positive path and fail-closed negative paths; historical TTL provenance for missing-expiry drafts remains unavailable. Do not claim general migration readiness, actual data acceptance, hosted verification, or P0 closure.
