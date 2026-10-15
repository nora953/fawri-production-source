# Combined P0 billing and Meta acceptance — 2026-10-15 Baghdad

Draft PR #549, branch `test/p0-integrated-billing-meta-20261015`, tested source `8a694b43b4583788f5be351ed7df410547a46167`. Depends on #548 documentation65ebaf19373b4710c743662f4a8fc514639b1de4 (tested df31f752) and #547 source217a40c8c6ed30c328202c51999028846189e6c1. No main merge/deploy.

Isolated run `38679806273`, job `116241526105`, merge checkout `3e34bd5a8d35a1af2a1e4c9569b1fd3514083d4a`: **307 PASS / 0 FAIL / 0 SKIP**,54 unique files/56 invocations; all14 observed workflowsSUCCESS. Meta run38679806211/job116241526118 separately succeeds. Counts include parent tests/repeated runtimes; they are measured on the combined source, not sums of standalone260 and287.

| Integrated surface | Executed evidence |
| --- | --- |
| Billing/operator | Original wire/race/expiry/tenant/late-payment suite17PASS retained with original billing SQL authorities. |
| Verified inbox transport | Parser2PASS + signed handler integration3PASS, real successful autocommit SELECT + idle ReadyForQuery before lost response; independent immutable receipt, orphan retry, concurrent one grant. |
| Receipt directory |9PASS including ties/new-head pagination, restricted direct mutation denial and deferred audit real COMMIT failure after2native rows prepared with HTTP503/no disclosure. |
| Meta restricted full app | Original signed HTTP/page resolution/manual filter/encrypted queue/subscription/live worker/refund/release/context proof;16malformed identity/envelope jobs denied. |
| Meta process/transport recovery | Inbound precommit SIGKILL nine-table rollback, natural lease/retry and one send/debit; DLQ/refund-gap original-worker restarts and refund/release COMMIT wire-loss cases. |
| Restore/cleanup |33migrations/95tables/45policies/8functions; matching seed/verify fingerprint793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498; owned container/volume cleanupSUCCESS. |

Merge resolution preserved both audit histories,548 billing15files and547 Meta7files. No production/test/schema merge conflicts; four document-header conflicts and selector resolved. Two imported trailing blank lines normalized; no new functional application change beyond combining accepted parents. Syntax/diff checks passed before publication. Combined CI validates the resulting production source.

Machine evidence: `evidence/P0_COMBINED_BILLING_META_RESULTS_20261015.json`. Standalone receipt-boundary proof remains in `evidence/P0_OPERATOR_RECEIPT_BOUNDARIES_20261015.json`. Earlier prepared/NOT_RUN parent notes are history where superseded by exact source/run evidence, not deleted.

Limits: offline disposable PostgreSQL, roles vary by suite; actual restricted role only where explicitly asserted. Graph/embedding/payment transports synthetic. Directory mutation protection is not a privileged-owner deletion or retention-duration policy; order discovery/ownership repair remains separate. Railway readiness200/ready on oldmain/d38d2922 does not certify newer hosted paths. Neon tool remains blocked. Hosted owner/EXECUTE/grants/provider acceptance, deployment controls and storage architecture remain OPEN; releaseNO-GO. Historical85%/15% P0 estimate unchanged and not newly measured.
