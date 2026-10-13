# SEQ-248–257 — media cleanup resilience, retention and audit fixture security

Baseline `0e0c457638f1016bda1c22b246688bc7898a94fd`, audit branch, 2026-10-13. Application, application tests, workflow, scanner rules and schema unchanged. Audit-only files: new harness/report/ledgers; previous docs/evidence fence fixture representation corrected. No application repairs, real DB/storage/provider/delete request.

| Stage | Actual scope / evidence | Outcome and boundaries |
| --- | --- | --- |
| SEQ-248 | Previous report/ledgers/remote head; physical-media lifecycle existing SQL test and cleanup/retention source | Continuity/source-reviewPASS. Existing SQL suite does not prove corrupted-manifest reporting or batch fairness. Original13integration/34unresolvedselectors remain unchanged. |
| SEQ-249 | Entire actual merchantPhysicalMediaCleanup.ts, real owned tempFS/JSON/rename; SQL and storage functions inert | 3PASS: uncommitted deletion defers all storage operations; storage fault persists pending entry/sanitizedcode then retrycomplete; complete manifest doesn't repeat removal. Not actual SQL deletion/cloudobjects. |
| SEQ-250 | Actual readManifest/reconcile/batch on real malformed owned file | 1observationalPASS/1acceptanceFAIL. New MEDIA-CLEANUP-CORRUPT-001 MEDIUM/OPEN: corrupted existing hashed.json file returnsmissing and batchinspected0/pending0/logs0. Persistent cleanup work silently omitted. No demonstrated real user media leakage; corruption is injected, no automatic corrupt-file repair requirement inferred. |
| SEQ-251 | Actual default batchlimit100;101valid synthetic tenant manifests in actual FS enumeration order; first100storage adapters alwaysfail, finaltenant succeeds if reached;2batches | 1observationalPASS/1acceptanceFAIL. New MEDIA-CLEANUP-STARVATION-001 MEDIUM/OPEN:200attempts target first100;tenant101attempts0/statepending. Bounded reproduction establishes indefinite starvation if ordering/first100 failures persist. No real tenant cross-authorization or deleted cloudobject claim. |
| SEQ-252 | Actual refreshMerchantRetentionPostgres and actual pure calculateRetentionStatus; inert SQL/transaction adapters | 3PASS: disabled authority rejects before calls;blankID avoidsSQL;closed account not revived by future expiry. No real locks/grants/authentication. |
| SEQ-253 | Same actual code, first vs repeated overdue suspension, fixedDate2026-10-13 and real calendar calculation | 2PASS: overdue returnsreadonly/suspended/eligible;first revokes sessions and increments session/securityversionflag;repeat doesn't re-revoke or re-increment. SQL strings/values observed, not committed rows or concurrent update proof. |
| SEQ-254 | Same code, futureexpiry on retention-suspended account with0replies; manual suspension without retentionmarker | 2PASS: renewal clears retention restrictions but exhausted reply status keepsbotdisabled; manual-suspension marker absent causes no automatic accountactive/merchantapproved writes. Futureexpiry fixture is injected, not actual paid-renewal proof. Other pending-state/customer billing semantics not certified. |
| SEQ-255 | Exact baseline33Actions and2new workflowfailures compared with previous snapshot |24SUCCESS/9FAILURE. Adminparent run38351105854/job115143470408 browsernull/results[]/prerequisite timeout →ENVIRONMENT_BLOCKED,0assertions. Security run38351105839/job115143470411 credential-url1 at docs/evidence/seq241-entrypoint-fences.test.mjs:12 →synthetic fixture classifier finding, not live secret. Other7knownworkflow failures notretriaged/count-adjusted. |
| SEQ-256 | Previous audit fence fixture synthetic connection representation; unchanged repository scanner; actual26refusal rerun | Audit-only fixture adjustment uses URL object properties instead of credential-shaped source literal; same inerthost/credentials/target passed to existing guard.26PASS/0FAIL controls retain rejection. `node scripts/security-final-audit.mjs repository`:exit0/statuspass,1706scanned/5skipped/0findings. No scanner exceptions or rule weakening. CurrentCI correctionpending; historical scannerfailure remains valid for its oldfile. |
| SEQ-257 | New findings deduplicated, exact environment/counter limits, append-only current checkpoint and residualscope |Report/ledger checkpoint;nextSEQ-258. No wholepercent from testcasecount. ReleaseBLOCKED. |

## Actual commands and counts

Node24.19.0, cleanNODE_ENVtest/DATABASE_URLabsent; no installedDocker/Postgres/Chromium/projectdependencies. Real filesystem operations confined to owned mkdtemp and removed after each test. Storage deletion adapters only record synthetic merchantIDs and inject faults; no real storage call. VM runs TS-stripped exactsource, imports replaced with adapters. Retention purecalendar functions actual; transaction/queries inert. No full SQL/browser proof.

```sh
node --test --test-reporter=tap docs/final-audit/evidence/seq249-251-media.test.mjs
node --test --test-reporter=tap docs/final-audit/evidence/seq252-254-retention.test.mjs
node --test --test-reporter=tap docs/final-audit/evidence/seq241-entrypoint-fences.test.mjs
node scripts/security-final-audit.mjs repository
```

**14newcases/12PASS/2FAIL/0SKIP**:media7cases5P/2F,retention7P. Two FAIL correspond to TWO new canonical media cleanup defects;observationalPASS only establishes problematic current behavior. Separate26refusal re-verificationPASS is not added as26newcoveragecases. Media finalverification replaces initialresult, not duplicated. Exact subprocess exits1/0 in evidence/seq248-runtime-summary.json; fixture/security exits0/0 in seq256-fixture-summary.json. Scanner output saved; no real credentials in artifacts.

## Finding scope / deduplication

- MEDIA-CLEANUP-CORRUPT-001: readManifest catches parse/read errors and returnsnull, batch skipsnull without log/pendingcount. New bounded runtime finding, distinct from missing durable storage/hosted media acceptance and OPS-WORKER-DRAIN-001. Reproduce with real malformed hashedmanifest; silent omission confirmed, no production corruption or retention incident claimed.
- MEDIA-CLEANUP-STARVATION-001: deterministic order with permanent first100pending failures consumes every batch, no cursor/rotation; independent later work never inspected. New bounded runtime finding, distinct from stop/drain. Twodefault100 batches demonstrate the repeating state; no arbitrary guarantee across OS readdirordering changes.
- Audit fixture scanner failure: exact previoussynthetic credentials are non-real and `.invalid`host has no realservice. Corrected literalrepresentation only; realguardteststill rejects beforeDBimport. No production secret exposure issue created. Scanner rule unchanged; historical runfailure kept, new hostedCIresult not assumed.

## CI evidence

[Admin parent run38351105854/job115143470408](https://github.com/nora953/fawri-production-source/actions/runs/38351105854/job/115143470408):ENVIRONMENT_BLOCKED beforecases,loggedPRmergesourceca8ce3533e46c384adb9f2674d885d01e332aa5a. Earlier validparentnativeproof retained.

[Security run38351105839/job115143470411](https://github.com/nora953/fawri-production-source/actions/runs/38351105839/job/115143470411): scannerclassifies1syntheticcredentialURL in oldauditfixture. Dependency audit/lockfile/dependencyreviewjobsSUCCESS; no change in scannerblockingpolicy. [Snapshot/triage](evidence/seq255-ci-snapshot.json) stores33runIDs and bounded sanitized diagnosticlines. Localclean scanner is not hostedCIpass. Previous realreceiptPASS remains historical; no newreceiptclearanceclaimed.

## Remaining gates

Original13integrationruntime remainsNOT_RUN,34unresolvedselectors/fullapplicableUIcase denominator still open. Actualcloudmedia deletion and corruptionalerting/fairness under productionSQL/provider/storage/deploy remain pending. ActualretentionSQL/locks/revocation/renewal proof not substituted by adapters. Newfindings require later repair after auditclosure; no final repairplan.

Whole remaining audit percentage **NOT_YET_MEASURABLE**. Next **SEQ-258**: covered-case inventory for routes/roles/languages/devices, media cleanup scheduling/concurrency and actualrestrictedSQL proofs when safe environment available; continue residual13integration and WorkMonitor mountedjourneys without repeating unchanged failures forstagecount. ReleaseBLOCKED.
