# CI evidence reconciliation — 2026-10-11

Task scope: read and classify existing completed runs on sourcefc1ee417; no new test execution implied. Source-linked results below must not be summed with isolated audit counts because suites overlap. The GitHub API wrapper returns the first page of PR-event runs only;20 returned,16SUCCESS/4FAIL, not an assertion about every event/check in the repository.

## Per-invocation counters

| Run / job | Invocation | Pass | Fail | Skip | Interpretation |
| --- | --- | --- | --- | --- | --- |
| 38175556027 / 114577082845 | Bot workflow-path boundary | 1 | 0 | 0 | Source trigger contract |
| 38175556027 / 114577082845 | Bot adversarial matrix | 22 | 0 | 0 | Fake runtime/SQL/generation dependencies; no live provider proof |
| 38175556023 / 114577082810 | Quality/security/redaction tooling | 18 | 0 | 0 | Tool behavior, including exact historical fixture scanner exceptions |
| 38175556023 / 114577083036 | Frontend/API source contracts | 386 | 0 | 1 | 387total; auth business-route DB assertion skipped for missing URL |
| 38175556023 / 114577083036 | API TypeScript unit tests | 818 | 0 | 0 | Integration.ts excluded by explicit glob |
| 38175556023 / 114577083036 | Frontend TypeScript unit tests | 179 | 0 | 0 | No visual/browser guarantee |
| 38175556172 / 114577083308 | Cashier subscription policy | 8 | 0 | 0 | Calendar/leapyear/rounding/nearzero boundary |
| 38175555973 / 114577082852 | Audio/unit/provider wiring + guarded DB file | 60 | 1 | 0 | One pre-import attestation refusal, not Meta product failure |

Full build/full typecheck and translation structure jobsSUCCESS. Translation reports en/ar/ku777core keys each,299admin each, missing0/extra0. Additional feature-audit script exit success retained; no fabricated universal semantic coverage.

Security run38175555964 jobs114577082648/806/833/873 allSUCCESS: dependency audit, lockfile integrity, repository history/security, dependency review. Two moderate advisories remain; blocking-severity policy success is not absence of advisories or proof of unexploitable deployment.

## Failed workflow interpretation

- Isolated audit: six existing product/reliability findings,114PASS/14FAIL/0SKIP on this source (ten functional plus fourparents).
- Cashier subscription: policy jobPASS; isolated reusable cashier jobFAIL due existing027/028/032; not new duplicate issue.
- Meta pipeline: mixed invocation refuses guarded meta-live-reply-postgres.integration.test.ts outside attested runner; sixty unit testsPASS. Safe runner invocation prepared.
- Foundation: prior RLS/knowledge/retention tests pass, then name-filtered guarded Meta step refuses legacy target. Safe full Meta lifecycle invocation prepared, preserving actual pool-contention assertion and teardown; final marker not reached in historicalrun.

Skipped sourcecontract subtest is precisely auth-cutover-contract.test.mjs: validated PostgreSQL merchant context reaches business routes without merchants.json authority; `{ skip: !process.env.DATABASE_URL }`. It now has isolated selection and early teardown; local10sourcePASS/1DBSKIP, actual DB proof pending. This does not establish an API flaw or erase the skip from historical evidence.

## Returned workflow table

| Workflow / run | Conclusion |
| --- | --- |
| [Bot logic adversarial matrix](https://github.com/nora953/fawri-production-source/actions/runs/38175556027) | success |
| [Backup and restore drill](https://github.com/nora953/fawri-production-source/actions/runs/38175556034) | success |
| [Meta OAuth operational cutoff](https://github.com/nora953/fawri-production-source/actions/runs/38175555977) | success |
| [Merchant deletion provider identifiers](https://github.com/nora953/fawri-production-source/actions/runs/38175555983) | success |
| [Merchant deletion cashier lifecycle](https://github.com/nora953/fawri-production-source/actions/runs/38175556039) | success |
| [Merchant deletion physical media lifecycle](https://github.com/nora953/fawri-production-source/actions/runs/38175556016) | success |
| [Staging container contract](https://github.com/nora953/fawri-production-source/actions/runs/38175555970) | success |
| [Catalog variant signature schema contract](https://github.com/nora953/fawri-production-source/actions/runs/38175556069) | success |
| [Clean deployment golden gate](https://github.com/nora953/fawri-production-source/actions/runs/38175556228) | success |
| [Final quality gates](https://github.com/nora953/fawri-production-source/actions/runs/38175556023) | success |
| [Cashier subscription lifecycle](https://github.com/nora953/fawri-production-source/actions/runs/38175556172) | failure |
| [Global merchant golden journey](https://github.com/nora953/fawri-production-source/actions/runs/38175556084) | success |
| [Meta webhook pipeline](https://github.com/nora953/fawri-production-source/actions/runs/38175555973) | failure |
| [Meta webhook PostgreSQL ingress cutover](https://github.com/nora953/fawri-production-source/actions/runs/38175556176) | success |
| [Global Merchant PostgreSQL HTTP Journey](https://github.com/nora953/fawri-production-source/actions/runs/38175556183) | success |
| [Foundation integration final gate](https://github.com/nora953/fawri-production-source/actions/runs/38175555981) | failure |
| [Cashier operational cutoff](https://github.com/nora953/fawri-production-source/actions/runs/38175555971) | success |
| [Isolated PostgreSQL engineering audit](https://github.com/nora953/fawri-production-source/actions/runs/38175555975) | failure |
| [Final security and supply chain](https://github.com/nora953/fawri-production-source/actions/runs/38175555964) | success |
| [PostgreSQL schema validation](https://github.com/nora953/fawri-production-source/actions/runs/38175556050) | success |
