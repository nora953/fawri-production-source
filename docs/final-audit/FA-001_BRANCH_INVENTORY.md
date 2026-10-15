# FA-001 — GitHub branch inventory

Inspection date: 2026-10-10. Repository: nora953/fawri-production-source.

## Enumeration
GitHub REST branch collection was read with `per_page=100` across all pages:
- Page 1: 100
- Page 2: 100
- Page 3: 25
- **Total: 225**

Prefix counts:
- audit: 95
- feature: 43
- fix: 32
- checkpoint: 25
- test: 14
- archive: 2
- docs: 2
- maintenance: 4
- refactor: 2
- cleanup: 1
- debug: 1
- foundation: 1
- main: 1
- meta-video-fetcher-hardening: 1
- test-meta-reconciliation-crash-safety: 1

## Important qualifications
A branch's existence is **not** evidence of missing code. Compare its HEAD to current main using ancestry / ahead-behind / patch-equivalence before classifying. Squash-merged PRs may retain branch-only commit histories while equivalent changes are already in main.

## Priority
1. Open draft [PR #476](https://github.com/nora953/fawri-production-source/pull/476) on `fix/staging-admin-ui-qa`.
2. `feature/cashier-independent-subscription-licensing`, `feature/cashier-subscription-entitlement-foundation`, `feature/whatsapp-offline-foundation`.
3. Other feature/fix branches, then audit/checkpoint/test/archive branches.

## State
**IN PROGRESS** — enumeration PASS, branch-by-branch ancestry and patch-equivalence not yet completed. No branch has been deleted or merged by this audit.


## Follow-up comparison pass — 2026-10-10

Latest observed branch listing: **227**, after documentation branches were created (original baseline 225 is preserved above). The extra two are documentation working branches, not evidence of new product changes.

- **25/25 `checkpoint/*`**: `ahead_by=0`, ancestors of main. No merge needed.
- **14/14 `test/*`**: `ahead_by=0`, ancestors of main. No merge needed.
- **95/95 `audit/*`**: ancestry comparisons performed. Mix of `ahead_by=0` and diverged historical heads. Nonzero ahead is NOT proof of missing functionality; follow-up content equivalence is needed for the latter.
- **2/2 archive branches**: 112 and 234 ahead, respectively, but GitHub comparison reported zero changed files; retain as historical archives, do not merge/delete without separate proof.
- `meta-video-fetcher-hardening` and `test-meta-reconciliation-crash-safety`: `ahead_by=0`.
- `debug/staging-startup-import-stage`: 11 ahead/11 behind; both auth-related files match main by blob SHA; `artifacts/api-server/src/index.ts` differs. Do not merge debug instrumentation.
- Several feature/fix branches have `ahead_by=0`, including bot learning, Meta multimodal foundations, cashier independent licensing, FastPay readiness and accessibility improvements.
- `feature/encyclopedia-knowledge-workspace-v1` (2 ahead) and `feature/exact-variant-grounding-v1` (4 ahead) need content-equivalence review.
- `fix/admin-retired-subscription-migration`: controller and its test exactly match main by blob SHA.
- `fix/cashier-first-station`: current main implements the same initial-location bootstrap, with expanded test coverage; old branch should not be blindly merged.
- `feature/cashier-subscription-entitlement-foundation`: older incompatible schema/migration; main contains `0027_cashier_subscription_licensing.sql` and expanded subscription/billing tables.
- `audit/cashier-management-dialog-a11y`: old dialog test assumes a different component structure; main has the later `cashier-management-modal-a11y-contract.test.mjs` covering focus, Tab, Escape and accessibility attributes.
- `audit/clean-deployment-postgres-only-journey` test and `audit/core-external-readiness-separation` readiness source match main by SHA; clean-deployment workflow was revised in main.
- `docs/staging-ui-findings` describes three admin UI issues. Draft PR #476 addresses these but requires visual interaction QA; CI checks alone are not visual proof.
- PR #479 merged to main at `97e5f44476a2b3a68bc06a4ef8444ada749a7a09`.

### Open, prioritized verification
1. Confirm patch/content equivalence for diverged branches with material differences, especially auth, Meta routing under RLS, recovery, production rollback and the two knowledge branches.
2. Complete PR #476 desktop/mobile visual interaction QA in Arabic, Kurdish and English before merge.
3. In FA-004, verify actual staging DB migration execution, runtime role/RLS and recovery; source and CI definitions alone do not establish operational PASS.

**Status: FA-001 IN PROGRESS.** This document records GitHub ancestry/source inspection only, not execution of every test, security proof, or live staging QA. No branches were merged/deleted and no deployment was made in this comparison pass.
