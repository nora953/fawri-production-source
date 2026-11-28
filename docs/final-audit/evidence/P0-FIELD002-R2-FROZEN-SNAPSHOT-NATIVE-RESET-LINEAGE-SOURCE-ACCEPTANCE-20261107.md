# FIELD002-R2 — frozen recovery and native-reset lineage are now guarded in source/CI (2026-11-07)

## Why this change was needed

Before this checkpoint, `scripts/lib/field002-r2-precommercial-source-admission.mjs` explicitly quarantined three archived clones and verified the original staging, production, older rehearsal and clean rehearsal parent relationships, but **did not explicitly inventory the newly retained frozen recovery** `br-empty-mud-b1it6mg9` and its **actual native reset drill child** `br-nameless-base-b1vt822z`. The first-commercial source-policy function already rejected *all* non-null branch/backup sources; no previously allowed commercial import was discovered.

**Do not repeat already completed hosted tests.** [Actual clean-clone role-accurate SQL+HTTP acceptance dated 2026-11-06](P0-FIELD002-CLEAN-CLONE-REAL-SQL-HTTP-ACCEPTANCE-20261106.md) confirms seven of seven real hosted positive and negative tenant/HTTP tests using two ephemeral least-privilege LOGINs, and identical before/after catalog/data/security snapshots following verified role/fixture cleanup. The fact that no temporary LOGIN remains is **successful cleanup, not missing proof**. The earlier 2026-11-07 [live deployment preflight](P0-FIELD002-LIVE-RAILWAY-DEPLOYMENT-PROVENANCE-AND-ORIGINAL-CUTOVER-NOGO-20261107.md) listed zero remaining restricted LOGINs without cross-linking this complete earlier acceptance; this reconciliation supersedes any inference that new clone LOGINs are mandatory to repeat that *same* bounded acceptance. There is no reason to generate new hosted test credentials merely to duplicate the already accepted seven tests.

## Exact source changes

- `scripts/lib/field002-r2-precommercial-source-admission.mjs` explicitly pins:
  - `frozenRecovery = br-empty-mud-b1it6mg9` — must be READY, nondefault, nonprimary, parent **original staging** `br-falling-dust-b1km4gix`, exact immutable parent LSN `0/473AAE0`;
  - `nativeResetDrill = br-nameless-base-b1vt822z` — must be READY, nondefault, nonprimary, parent **frozenRecovery**, matching parent LSN, last reset exactly `2026-11-06T23:36:16Z` UTC.
- `assertField002KnownNeonLineage` now fails closed if either retained protected proof branch is missing or its current state, parent, LSN, default/primary status or recorded reset timestamp drifts. Both branches remain precommercial, never valid first-commercial data sources.
- The result flags `stagingRecoveryLineageVerified=true` and `disposableNativeResetLineageVerified=true` describe supplied branch-inventory checks **only**, *not* backup validity, tenant safety or commercial deployment permission.
- `scripts/tests/field002-r2-precommercial-source-admission.test.mjs` adds both branches to the positive inventory, explicit rejected commercial-source cases for both, and missing-parent, wrong-parent, changed LSN, missing reset timestamp and nonready negative cases.
- The existing first-commercial plan still rejects **all** branch-data sources, backup-restore/clone and import requests, and always returns `deploymentAuthorized=false`, `field002Closed=false`.
- Source commits: [`9faf2054`](https://github.com/nora953/fawri-production-source/commit/9faf2054476652911aa2d26f0520d0f79abed7ba) and [`674423a0`](https://github.com/nora953/fawri-production-source/commit/674423a08460ae5001db0b3533eb5082e7ece4d9).

## Independent live and CI verification

- Neon `list_branches(project_id='round-fire-18493605',include_deleted=false)` returned exactly **nine branches**. Frozen recovery READY, parent original, LSN `0/473AAE0`; reset child READY, parent frozen recovery, same LSN and recorded reset timestamp exactly as above. Three archive ancestors remain ARCHIVED with their original parents. Neon default `production` and original `staging-runtime` are distinct and unchanged.
- Independent **read-only** SQL on clean isolated `br-polished-mouse-b1proel7`: 52 Drizzle, 0 historical notices, 283 audit rows, 1 merchant, 0 leftover synthetic test LOGIN roles, 0 transaction scopes, **8/8** critical RLS, 0 other clients at sampling. Independent original `br-falling-dust-b1km4gix`: 28 Drizzle, 0 notices, 283 audit rows, 1 merchant, 0 leftover synthetic test roles, **0/8** critical RLS. `fawri_security.transaction_scopes` does **not** exist on original pre-0028, as expected; no original SQL modification.
- Exact test commit `674423a08460ae5001db0b3533eb5082e7ece4d9`: [Backup and restore drill GitHub Actions run #42352883827](https://github.com/nora953/fawri-production-source/actions/runs/42352883827) **completed SUCCESS**, including `Run backup and restore unit safety tests` (which invokes `scripts/tests/field002-r2-precommercial-source-admission.test.mjs`), hosted-independent synthetic restore rejection, positive local restore, role/RLS startup admission and postdrill cleanup. This is verified CI for the latest source, not a new hosted SQL/HTTP acceptance. Other concurrently triggered workflows must be assessed separately, not inferred green.
- No Neon SQL write, role creation, credential generation, staging connection change, Railway deployment/restart, source merge, original migration, 0052, or release decision was performed.

## Remaining FIELD002 and authority boundary

**Accepted now:** current nine-branch known-lineage source and CI regression, including both frozen backup and native reset proof child; earlier hosted 7/7 restricted-LOGIN SQL+HTTP acceptance remains accepted and does **not** need repeating.

**Still OPEN:** the actual original staging's unsafe creator-default ACL, 0028–0051 rollout and old BYPASSRLS login cutover; deployed `fawri-web` is a confirmed consumer of the original branch endpoint and is running an old `main` source. A zero-active-client instant is not a maintenance window. Required before original write: reviewed old-client disconnect/reconnect, independently provisioned correctly scoped permanent tenant/auth identities, branch/source/backup validation, separate explicit authorization for original modification, hosted deployment acceptance and mandatory precommercial import/restore policy on all real release routes. Real backup portability/PITR and 0052 remain separately blocked.

**FIELD002 OPEN / PR #550 DRAFT / commercial NO-GO.**
