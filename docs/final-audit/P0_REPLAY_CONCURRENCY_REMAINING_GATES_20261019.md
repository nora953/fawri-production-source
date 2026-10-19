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

## 2026-10-19 advisory-lock source regression

Commit `15460b98f17047d5d780af5efa4fb4c4ce5bda8c` adds a source regression that explicitly records the difference between the confirmed-payment resolver advisory lock and the replay review's lack of the same lock. This is an open concurrency gate, not proof of safety or an exploit. At the latest CI observation 22/41 workflows succeeded, 18 running, 1 queued, 0 failed; final acceptance remains pending. Do not mark P0 GO from this result.

## 2026-10-19 completed CI for advisory-lock source regression

Commit `15460b98f17047d5d780af5efa4fb4c4ce5bda8c`: **41/41 GitHub Actions workflow runs completed SUCCESS**, no failed, cancelled, queued or in-progress runs in final commit-wide check. Thirteen cancelled workflows were rerun and subsequently passed. This closes only the source-regression CI gate; the deterministic two-session PostgreSQL concurrency and hosted runtime/migration gates remain open. **P0 NO-GO.**

## 2026-10-19 receipt inbox and cross-authority source contracts

Commit `8bdb0921382de10c5a80a869c4a30cf04ef5b1c2` adds source assertions for receipt inbox event-key collision handling (migration 0029) and cross-authority lookup inputs (migration 0031). First observed commit CI snapshot: 5/41 succeeded, 16 running, 20 pending/queued, no failures. These checks do **not** prove uniqueness of checkout/request references or a two-session race-safe outcome. P0 NO-GO.

## 2026-10-19 latest HEAD CI and isolated Neon read-only evidence

Branch HEAD `7f6dfb35e1dc5df53d1f0ae0d6d4678576adcac3` completed **41/41 GitHub Actions SUCCESS** (zero failed, cancelled or pending). This is CI acceptance only, not hosted replay race proof.

Read-only query against isolated Neon branch `br-snowy-voice-b1bovtwi` returned `current_user=neondb_owner`, `drizzle.__drizzle_migrations` row count `28`, and `pg_indexes` matches for `provider_checkout_ref` and `provider_request_id` on `public.saas_billing_orders` / `public.cashier_billing_orders` each `0`. This is an index-definition search, not an exhaustive constraint or transaction-safety proof. Repo journal records 34 migrations through 0033; hosted clone is behind. The connected role is owner and cannot establish least-privilege runtime acceptance. No SQL writes or deployments performed. Remaining: disposable migration application with explicit authorization, deterministic two-session concurrency tests and runtime-role verification. **P0 NO-GO.**
