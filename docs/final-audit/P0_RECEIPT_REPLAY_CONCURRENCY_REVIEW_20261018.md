# P0 Receipt Replay Concurrency Review — 2026-10-18

Status: SOURCE REVIEW ONLY — NO-GO. No concurrency regression, hosted migration, or deployment is claimed.

## Verified source

- `lib/db/drizzle/0031_audited_receipt_replay_reviews.sql` validates admin account/profile and `manage_subscriptions` (with owner-admin exception), audits access, reads receipt under `FOR SHARE`, and selects billing-order candidates without explicit row locks.
- `lib/db/drizzle/0032_authorized_receipt_replay_execution.sql` calls 0031, validates active admin session/device, and locks the selected SaaS or cashier order `FOR SHARE` before checking assigned payment reference and successful receipt.
- `lib/db/migration-stages/0032/manual.sql` matches the committed 0032 SQL inspected in this review.
- 0030/0031 rely on trusted HTTP actor/session binding and restricted EXECUTE grants; they do not independently validate session/device. These are boundaries to verify, not established vulnerabilities.

## Remaining deterministic regression

Use two controlled PostgreSQL connections in an owned disposable fixture. Pause replay between 0031 candidate review and 0032 selected-order lock, attempt concurrent payment-reference reassignment, and record lock waits/commit order. Assert fail-closed or fresh-consistent authorization only, never stale positive approval; no premature entitlement, immutable receipt identity, transaction rollback of audit on denial, and no cross-tenant leakage. Cover both SaaS and cashier authority. Verify reproducibility and exact CI outcome before marking PASS. Do not infer an exploit from source review alone.

## Hosted gates

Isolated Neon branch `br-snowy-voice-b1bovtwi` was reported at 28 applied migrations through 0027 on 2026-10-18. Migrations 0028–0033 and least-privilege runtime EXECUTE/RLS acceptance remain pending. Prior PR #550 checkpoint reported 40/40 CI SUCCESS for source `ac639a0a7ad67bb54e881168e2d42b819d413d21`; this is not hosted acceptance. Confirm actual Railway `current_user` and `session_user`, not merely role memberships. Do not bypass the local-only migration smoke guard. No hosted writes or production deployment authorized in this review.
