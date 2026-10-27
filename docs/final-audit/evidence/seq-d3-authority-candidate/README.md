# Coordinated cashier authority candidate — 2026-10-27

Accepted source `699af77df6be59510cc4638512d876d4a9a16173`:57/57 workflows SUCCESS. [Candidate40481586718/job122112958090](https://github.com/nora953/fawri-production-source/actions/runs/40481586718) passes fresh35/upgrade35 TAP in separate owned offline clusters, plus existing management22 =92 TAP/4 invocations/3 files. Separate history9 tests PASS. [Broader40481586504/job122113554818](https://github.com/nora953/fawri-production-source/actions/runs/40481586504) passes826 TAP/97 invocations/94 files. TAP totals include parents; these denominators are separate.

The package preserves accepted revision2 enrollment/financial SQL bytes. It pins106 historical SQL/snapshot blobs, readiness/recovery dependencies, five schema/preimages,20 policies, stage and three generated SQL/snapshot/journal files. Separate-copy generation reproduces54 candidate migrations/98 tables exactly; existing table columns/constraints/RLS enablement unchanged. Actual Drizzle migration proves fresh install,0052 upgrade, midpoint/tail rollback, owner-collision refusal, correct journal hash/timestamp, idempotent rerun and selected financial/stock/review/peer preservation. Production canonical source remains53/97.

`cashierAuthorityCandidateInstallationReadiness.ts` is internal SELECT-only inspection of all54 stabilized migration hashes/timestamps, journal table/schema/columns/owner/RLS/PUBLIC and caller ACLs, actual bootstrap session/current-user context and repeatable-read/serializable settings. It composes the existing authority inspector in explicit withheld-capability phase; the prior fixture-enabled default remains. It creates no pool, credential, grant, startup hook or route. Trusted callers supply identities and a transaction-bound client. Positive tests use actual REPEATABLE READ READ ONLY; fault tests use write transactions for rollback. No DDL lock, independent authentication/reviewer provenance or later grant authorization is claimed. Result always has grantsAuthorized/operationalAdoption/releaseAccepted=false.

Both fresh/upgrade modes prove22 faults,3 denied real LOGIN actors, snapshot-context refusal and23 READ ONLY positives (initial and after rollback). Initial53ef9049/diagnostic71610e08 fresh suites failed10PASS/25FAIL before upgrade and each broader run was cancelled; neither accepted. NULL attacl was wrongly converted into a zero-dimensional empty array rejected by aclexplode/22023. Current query expands only nonempty explicit ACLs; existing table/PUBLIC/caller/nonempty-column checks remain. Safe stage/SQLSTATE diagnostics retained and proof output now requires every preflight assertion to pass. See structured design evidence for exact failure/source/run records.

Existing fresh-cluster restore still proves role rotation/owner/ACL recovery, financial replay/next operation and deletion rollback/success separately. Synthetic direct SQL preservation rows are not real reviewer issuance; hashed references remain pseudonymous. Sequence allocation need not rewind. The manifest is reviewed source data, not an independent signature.

The following are existing prerequisites, not new release gates or approved decisions:

| Existing gate | Concrete record still required | Current approval |
|---|---|---|
| CASHIER-SYNC-SEQUENCE-001 | Responsible approver; authenticated real reviewer identity, original trusted evidence, issuance/revocation/audit binding | Unset; fixtures assume independent review |
| CASHIER-SYNC-SEQUENCE-001 | Actual primary/auth/reviewer/bootstrap inventory; authorized migration/grant operator; separation and revocation/rollback procedure | Unset; fawri_ci and fixture grants are not operational adoption |
| P0-RETENTION-PRIVILEGED-DELETION-POLICY | F005-R1/R2/R3 exact fields/purpose/readers, retention trigger/duration, holds and final disposition | Unset; no duration or anonymity inferred |
| P0-HOSTED-RECOVERY | Separately authorized deployed inventory, trusted restore/key/PITR/media/copy evidence | Blocked under current GitHub-only restriction |

Use the existing [FIELD005 decision checklist](../../P0-FIELD005-RETENTION-DECISIONS-20261026.md); it also preserves F005-R4/R5 historical/copy recovery limits. No canonical promotion or public v2 activation. GateOPEN; releaseNO-GO; no hosted, merge or deployment.

Next: Reconcile these existing prerequisites with the finite FIELD005 checklist and prepare a concrete reviewer/provisioning/retention decision record. Keep approvals unset, avoid invented durations or permissions, and do not repeat accepted migration/preflight proofs without a new change or failure.
