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
