# Repository hardening baseline — 2026-09-23

Canonical baseline: `main@1b84636a24e8486bfe40a5ddb1ea3a5937538f75`.

Closure: repository hardening completed through PR #281 and is recorded in `docs/repository-hardening-closure-2026-09-24.md`. This file remains the historical audit baseline.

## Branch inventory

At audit start the repository had 160 branches:

- 80 checkpoint branches
- 54 parallel branches
- 8 feature branches
- 6 fix branches
- 4 docs branches
- 3 integration branches
- 2 QA branches
- 1 foundation branch
- 1 test branch
- `main`

Most historical branches are already contained by `main`. Diverged historical branches must be reviewed semantically instead of merged automatically because several have newer replacements already integrated into `main`.

The open WhatsApp offline-foundation PR remains a future dormant lane and is not a current merge candidate.

## Translation baseline

The canonical general dictionaries are in parity:

- English: 768 keys
- Arabic: 768 keys
- Sorani Kurdish: 768 keys

The admin dictionaries are also in parity:

- English: 299 keys
- Arabic: 299 keys
- Sorani Kurdish: 299 keys

The structure audit still reports:

- 16 files containing 19 localized copy objects outside translation authority
- 46 high-confidence visible hardcoded copy candidates
- 1 critical executable source file at or above 1,800 lines

The broader inventory reports 89 hardcoded-copy candidates across 31 files and is intentionally a wider discovery scan.

## Structural baseline

The current critical executable file is:

- `artifacts/api-server/src/services/postgresCashierCompensationSyncAuthority.ts` — about 1,943 lines

Large files are refactor targets, not deletion targets. Refactors must preserve current behavior and be validated in isolated slices.

## First safe maintenance slice

This maintenance branch begins only with non-runtime cleanup:

- recover the valid staging environment example onto a current-main branch
- add a current-main translation audit wrapper without changing the dependency manifest
- remove an accidentally committed temporary translation helper
- ignore future `scripts/.tmp-*` files and root pre-migration `pre_*.dump` backups
- establish a repository maintenance policy

Runtime refactors and translation centralization are separate reviewed slices after this baseline passes.
