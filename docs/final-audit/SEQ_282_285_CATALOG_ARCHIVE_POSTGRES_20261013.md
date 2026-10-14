# SEQ-282–285 — actual PostgreSQL catalog archival and failure atomicity

Audit baseline e8032523c67e34e1537028aaf68c29f86161b08f. Audit-only new workflow/fixtures/evidence; application, original tests and committed schema unchanged. This completed report supersedes the preparation checkpoint; its blocked first attempt remains recorded.

| Stage | Evidence | Outcome |
| --- | --- | --- |
| SEQ-282 | New fixed-file isolated runner and two audit-only catalog assertions | Prepared actual history-survival and SQL marker-failure atomicity tests. No original thirteen-suite rerun. |
| SEQ-283 | Local provisioner/executor refusal controls | 4 PASS / 0 FAIL / 0 SKIP: unknown file, missing runner environment and unattested environment refused before DB actions/import. Syntax PASS. |
| SEQ-284 | Corrected Actions run38431991119/job115416248457, source ce48910f71cfd910c0b86fe24aa9fdb805083cec | Actual PostgreSQL16, Node24.21.0, committed migrations28 PASS; two business cases 1 PASS / 1 FAIL / 0 SKIP. Owned teardown and always cleanup SUCCESS. |
| SEQ-285 | Failure triage, canonical finding and ledger synchronization | New MEDIUM CATALOG-ARCHIVE-ATOMICITY-001 confirmed on fault injection. Successful archival history proof closes that bounded uncertainty; wider sales/location/provider/UI scope stays open. |

## Confirmed successful path

A real E164 merchant account with one product/variant is created through current authority functions. Inventory adjustment changes5→4/version1→2 and produces one immutable mutation. Removing the variant succeeds/version3; the raw variant row remains, quantity0 and catalog_archived=true. Every field of the mutation row remains exactly equal. Current get/list hides the archived variant. A later catalog rebuild preserves the mutation and keeps the archived variant hidden. This confirms history survival for this synthetic inventory case and shows why the old original test's blanket rejection expectation is stale. It does not certify cashier-sale/order history, location balances, concurrent catalog writes or hosted data.

## CATALOG-ARCHIVE-ATOMICITY-001 — MEDIUM / OPEN / CONFIRMED

A temporary SQL trigger in the owned disposable database raises AUDIT_SEQ282_MARKER_FAILURE only when UPDATE attempts to set metadata.catalog_archived=true. The actual wrapper rejects with that SQL error. However, raw SQL and subsequent authoritative get show product version2→3, changed name, variant quantity0 and one visible variant with archiveMarked=false. The complete inventory mutation row is unchanged. The test fails at the rollback-name assertion; the other recorded observations are actual queries, not hypothetical consequences.

Cause: postgresCatalogAuthority.ts update wrapper awaits core.updateCatalogProductAuthoritative, which commits its merchant transaction, then calls markArchivedVariants in a different transaction. The first commit persists product name/version and archivedShadow (zero quantity, cleared identifiers/options/images/price fields). The second transaction's failure cannot roll back that first commit. The reload excludes only catalog_archived=true rows, so the unmarked internal shadow appears as active. Source references: wrapper archivedShadow/markArchivedVariants/updateCatalogProductAuthoritative and core updateCatalogProductAuthoritative/persistProductGraph.

Impact demonstrated: an operation reported as failed nevertheless changes catalog state and exposes an unmarked zero-stock shadow. Stock adjustment ledger is preserved; no history deletion or cross-tenant access is demonstrated. Trigger failure is an explicit controlled fault, not evidence of a naturally occurring hosted outage. Crash/interleaving/retry recovery and actual HTTP/UI error handling remain NOT_RUN. No repair proposed or applied during this audit.

## Execution provenance and safeguards

Corrected run: https://github.com/nora953/fawri-production-source/actions/runs/38431991119/job/115416248457 . Source ce48910f71cfd910c0b86fe24aa9fdb805083cec. Fresh owned network-none PostgreSQL16 cluster, no published ports, random runtime password kept in private ephemeral env files, Node container shares only that loopback namespace. Attestation/database-role-marker checks before migrations and fixture import. Readonly repository; no hosted credentials/provider calls. Test drops owned fault trigger/function in finally and ends pool; executor temp cleanup=true; provisioner destroys owned containers/anonymous volumes, final cleanup SUCCESS. Using owned cluster superuser is not production restricted-role certification.

Initial source8249bb57529dcee7fb4ced93cac2e8aaf8a0b8f5 run38431552219/job115414742362 applied28migrations and verified identity but hit tsx CJS top-level-await TransformError before either business case. Its file-level0P/1F is HARNESS_IMPORT_BLOCKED, not a product defect or an additional failed business case. Corrected audit fixture uses explicit ESM .mts and the existing database entrypoint directly; original application/tests unchanged. Raw private logs were not copied; selected markers and test TAP are in seq284 evidence.

Local security policy69workflows/0violations PASS and tracked repository1743files/0findings PASS with final result documents. Full reachable-history synthetic finding remains OPEN; do not infer full security green.

## Remaining scope

New SQL business cases2 =1P/1F; local refusal controls4P are separate. Prior original12complete suites16P/8F and one incomplete seed remain historical, not recounted. RESIDUAL-FIXTURE-CONTRACT-001 retains stale original expectation classification; new atomicity is a separate application defect. 21/277 selection paths unresolved;222minimum full-route visuals NOT_RUN; no whole-audit percentage denominator. Release BLOCKED.

NextSEQ-286: actual SQL consent/preview expiry rollback and safe modern cashier-sale/history fixtures, followed by remaining route/role/lifecycle/provider gates. No application repair, final remediation plan, merge or deployment.
