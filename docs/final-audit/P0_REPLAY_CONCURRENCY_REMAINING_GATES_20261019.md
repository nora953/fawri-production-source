# P0 receipt replay — remaining acceptance gates (2026-10-19)

## Verified source and CI boundary

- Commit `350e67db495cd94df62d1f08f6a6600ae52c3543`: 41/41 GitHub Actions workflows completed successfully. This commit rechecks the selected order provider, checkout reference, request reference, and amount under a `FOR SHARE` lock in migration 0032.
- Commit `b08a0a0655a6b57be460572debf267bfe414cf4f`: adds a source-contract regression for migration 0032 and authoritative migration-file parity. Latest observed CI snapshot: 38/41 success, three in progress, no observed failures. Do not infer the eventual outcome from this snapshot.
- Existing `P0_REPLAY_RACE_ACCEPTANCE_MATRIX_20261018.md` predates the 0032 fix: its assertion that amount/request reference are *not* rechecked in 0032 is now stale. The matrix's scenarios remain test targets, not evidence of a reproduced defect.

## Required deterministic concurrency proof

1. Run on an **owned disposable PostgreSQL database** with migrations applied and a seeded valid operator/session/device, immutable provider receipt and two order authorities. Record schema/migration hash and SQLSTATEs.
2. For `bot_subscription` and `cashier_subscription`, coordinate two separate sessions with advisory locks or explicit lock barriers, not timing-only sleeps. Mutate the selected order checkout reference, request reference, provider, or amount between the review phase and order `FOR SHARE` acquisition; expect denial or an independently valid serial outcome.
3. Test a second matching order inserted/updated in the *other* authority between the candidate scan and selected-order lock. This is a **separate phantom-candidate/uniqueness risk**: rechecking selected-order fields alone does not prove the absence of a newly introduced cross-authority match. Record whether constraints/locks/transaction isolation prevent the phantom; do not mark this gate closed from source assertions.
4. Test concurrent session/device revocation and transaction rollback, checking absence of unauthorized entitlement, payment application or committed audit artifacts on denial.
5. Repeat each schedule deterministically and retain SQL commands, connection IDs, waits, result rows and evidence. Never claim the CI source-contract test is a two-session race test.

## Hosted gates (not executed by this document)

- Explicitly approved migration application 0028–0033 to isolated Neon clone, followed by verification of function definitions, EXECUTE grants, RLS and least-privilege runtime role.
- Verify actual Railway `current_user`, `session_user`, runtime role attributes, and protected-route acceptance; staging/production remain unchanged.
- No merge, Railway deployment or hosted Neon mutations without separate approval. P0 remains **NO-GO**.
