# P0 — restore mandatory candidate/commerce/management CI consistency without weakening safeguards

**Date:** 2026-11-10 (Baghdad). **Reviewed and tested source HEAD:** [`61095f7abb08ea0836e01eaa76b188b396d2b07a`](https://github.com/nora953/fawri-production-source/commit/61095f7abb08ea0836e01eaa76b188b396d2b07a). **Scope:** source-test and candidate SHA pin reconciliation ONLY; no hosted first-commercial migration, financial/provider, physical or production acceptance. PR #550 remains DRAFT, release NO-GO.

## Previously red required gates

An audit of the actual last-head GitHub workflow list found that an otherwise clean general quality run **coexisted with a RED Isolated PostgreSQL engineering audit**. The failure was not treated as a provider/PG18 readiness approval.

1. [Isolated PostgreSQL engineering audit #42769827085](https://github.com/nora953/fawri-production-source/actions/runs/42769827085) failed its `scripts/tests/cashier-authority-candidate.test.mjs` prerequisite pin: `scripts/run-isolated-postgres-audit.sh` current SHA-256 was `00d73e9b5eebbfcbf4e44d0a83dcc6029ea353aab44ca63cc9268b17629f208f`, while `seq-d3-authority-candidate/contract.json` still pinned `c726e6f097ea91f9df98f88fbc7ce6c8bc741566e6c6a7c16453473b38941b32`.
2. [Commerce cashier closeout #42772564704](https://github.com/nora953/fawri-production-source/actions/runs/42772564704) failed source-contract assertions against `authority.acknowledgeSynced([operationId])`, a **less safe operation-ID-only API** that had already been replaced by `authority.acknowledgeSyncedExact(operationId, envelopes)`. A second stale assertion was identified after the first correction, from `cashier-sync-contract.test.mjs`.
3. [Foundation integration final gate #42772564610](https://github.com/nora953/fawri-production-source/actions/runs/42772564610) and [SEQ D2 canonical storage acceptance #42772564729](https://github.com/nora953/fawri-production-source/actions/runs/42772564729) both reached real PostgreSQL `merchant-management-tenant-rls.integration.test.mjs` and failed an obsolete **test fixture expectation**: its `suspended` subscription with a future expiry should automatically restore a retention-suspended merchant. This was exactly the unsafe privilege restoration that production source had since correctly fixed. The active renewal was not represented in the fixture.

## Bounded corrections and hardening

- Compared `scripts/run-isolated-postgres-audit.sh` with original accepted candidate prerequisite commit `6b8188037be2cdf50548acb67a3d71c91539f064`: **only line 6, the exact closed audit suite allowlist, differs**. The additional options are `notification-dedupe-negative`, `retention-resumption`, `subscription-addon-activation`, `authority-migration-fresh` and `authority-migration-upgrade`. Docker `--network none`, owned-container removal, temporary secrets, runner attestation, restore ownership, isolation and fail-closed identity logic are **byte-for-byte unchanged**. [Candidate pin fix `742d9f0c`](https://github.com/nora953/fawri-production-source/commit/742d9f0c095319c489846cdaba28b2838149a507) updates **only that one SHA-256 digest** in the candidate contract. `candidateOnly=true`, `operationalAdoption=false`, `releaseAccepted=false`, all 53 canonical journal entries/106 historical migration blobs, reviewed generated SQL and role restrictions are unchanged; no silent 0053 promotion or role grant.
- [Management fixture correction `7145527e`](https://github.com/nora953/fawri-production-source/commit/7145527e94cae9079c45c3b5890a9f43d1650309) requires a **negative SQL/role assertion first**: a future-dated *suspended* subscription **cannot** reactivate its suspended merchant. Then a disposable fixture update explicitly sets `status='active'` (synthetic approved renewal only), after which real `refreshMerchantRetentionPostgres` must restore the merchant. This is NOT evidence of a signed provider payment.
- [Compensation ACK test `3fe85ce8`](https://github.com/nora953/fawri-production-source/commit/3fe85ce8402b512690faf0966828719f262b700e) and [primary cashier ACK test `61095f7a`](https://github.com/nora953/fawri-production-source/commit/61095f7abb08ea0836e01eaa76b188b396d2b07a) require the original **entire uploaded envelope snapshot** to be ACKed after complete server entity/compensation acceptance, and explicitly reject the former ID-only deletion syntax. Active production upload and IndexedDB implementation **were not weakened or rewritten**.

## Reconciled full-head GitHub CI

On **exact tested source HEAD `61095f7abb08ea0836e01eaa76b188b396d2b07a`**, **68 of 68 GitHub Actions PR workflow runs are COMPLETED SUCCESS; 0 FAIL, 0 CANCELLED, 0 PENDING**. Core previously red jobs are independently visible:

| Gate | Run | Outcome |
| --- | --- | --- |
| Isolated PostgreSQL engineering audit | [#42773599138](https://github.com/nora953/fawri-production-source/actions/runs/42773599138) | SUCCESS; candidate historical pin, actual isolated SQL, fresh-cluster financial restore, Node22 compatibility |
| Foundation integration final gate | [#42773599243](https://github.com/nora953/fawri-production-source/actions/runs/42773599243) | SUCCESS, with valid suspended-negative then explicit approved-renewal positive |
| SEQ D2 canonical storage acceptance | [#42773598989](https://github.com/nora953/fawri-production-source/actions/runs/42773598989) | SUCCESS, candidate generation, fresh/upgrade migration and rollback |
| Commerce cashier closeout | [#42773599238](https://github.com/nora953/fawri-production-source/actions/runs/42773599238) | SUCCESS, exact original envelope ACK source contract |
| Final quality gates | [#42773598606](https://github.com/nora953/fawri-production-source/actions/runs/42773598606) | all **4/4** SUCCESS: build, typecheck, translation and quality-tool-tests |

Engineering job log explicitly prints `✔ coordinated authority candidate pins accepted SQL, readiness, recovery and all historical bytes`, with zero `not ok` or GitHub Actions errors. It also emits `AUDIT_FULL_SCHEMA_DUMP_RESTORE_PASS` and `AUDIT_FRESH_CLUSTER_DATABASE_AND_ROLES_RESTORE_PASS` against **fresh disposable offline containers only**.

## Release boundary — do not count a gate as closed

This restores consistency of **source candidate CI and existing acceptance checks**, not full P0. No first-commercial hosted PG18 credentials/53-stage authority adoption, no live provider signed settlement, Meta/KMS/storage/backup, hardware offline device, owner retention legal policy or incident sign-off. No production Neon/Railway write, merchant activation, merge, domain publish, refund or deployment. Parent launch-blocker register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED among 45 known source rows** (64.4% historical known-row count only), `completeP0Inventory=false`, and **overall launch-readiness percentage remains undetermined**. PR #550 Draft / NO-GO.

**Important:** The single subsequent commit that adds this evidence is documentation-only and was **not** part of the `61095f7abb08ea0836e01eaa76b188b396d2b07a` immutable 68/68 source CI run. It must not be described as independently having all 68 jobs green until its own workflows finish.
