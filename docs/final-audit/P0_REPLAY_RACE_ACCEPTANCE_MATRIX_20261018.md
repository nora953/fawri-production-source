# P0 — Receipt replay race acceptance matrix (2026-10-18)

**Classification:** test design and source review, NOT executed. P0 remains NO-GO.

## Exact source boundaries

`0031_audited_receipt_replay_reviews.sql` locks the admin account/profile/permission and receipt, but its two candidate order scans do not lock order rows. `0032_authorized_receipt_replay_execution.sql` calls 0031 and subsequently locks the chosen SaaS or cashier order `FOR SHARE` before comparing `provider_checkout_ref` with the reviewed payment reference. This later check is expected to reject a changed checkout reference; a deterministic test must verify behavior. The request reference, amount, and authority are validated during 0031, not all repeated after 0032's order lock. This is a potential time-of-check/time-of-use boundary, not a demonstrated vulnerability.

## Deterministic two-session scenarios (both billing authorities)

1. **Reference reassignment before selected-order lock:** Session A reviews receipt; session B updates `provider_checkout_ref` and `metadata.provider_request_id` on the selected order and commits; A resumes. Expect denial or a fresh fully consistent review, never a stale positive authorization.
2. **Amount mutation before selected-order lock:** B changes `amount_iqd` after A's review, before A locks the order. Assert A does not authorize an amount-mismatched receipt. This explicitly tests whether a field checked only in 0031 remains authoritative at 0032's return.
3. **Cross-authority collision:** B introduces a second matching order in the other authority after A's review. Assert no ambiguous positive result.
4. **Session/device revocation:** B revokes session/device while A is at the boundary. Assert locking and ordering yield denial or a valid serialization, never approval based on a revoked identity at the required authorization point.
5. **Commit vs rollback:** Verify denied attempts leave no entitlement, no premature payment application, immutable receipt fields and no surviving audit row from a rolled-back attempt. Check transaction context reset and tenant isolation.

## Execution rules

Use only an owned disposable PostgreSQL test database and explicit coordination barriers, not sleeps alone. Capture two connection IDs, lock waits, timestamps, before/after rows, transaction outcomes, SQLSTATEs, and repeatability. Avoid creating remote Neon migration side effects until isolated-branch approval and validated rollback/grant plan. Do not change existing production migration SQL merely from source suspicion. If a failure is reproduced, add a failing regression first, repair both authoritative `lib/db/migration-stages/<id>/manual.sql` and committed Drizzle SQL consistently, and run full isolated CI before declaring closure.

## Current external gates

PR #550 previously recorded 40/40 CI success on the then-tested source; this new document does not establish a new CI result. Isolated Neon clone was reported at 28 migrations through 0027. 0028–0033 hosted migration, actual Railway login/session role, restricted EXECUTE grants and RLS checks remain OPEN. **NO-GO**.
