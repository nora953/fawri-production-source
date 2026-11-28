# P0 Replay order identity recheck — CI acceptance (2026-10-19)

**Source commit:** `350e67db495cd94df62d1f08f6a6600ae52c3543` (audit branch `fix/p0-provider-receipt-order-discovery-20261015`).

**Verified GitHub Actions outcome:** 41 of 41 pull-request-triggered workflow runs completed with conclusion `success`; zero failed, cancelled, pending or in progress at the verification time. Includes `PostgreSQL migration candidate`, `Complete migration safety`, `Billing provider readiness`, `PostgreSQL schema validation`, `Final security and supply chain`, and `Isolated PostgreSQL engineering audit`. This is **CI acceptance**, not hosted runtime acceptance.

**Change:** `0032_authorized_receipt_replay_execution.sql` rechecks selected billing-order provider, checkout payment reference, provider request reference and amount under `FOR SHARE` row lock after `0031` review. The authoritative `lib/db/migration-stages/0032/manual.sql` and `lib/db/drizzle/0032_authorized_receipt_replay_execution.sql` were independently fetched after commit and found byte-identical, both containing the new comparisons.

**Still OPEN / NO-GO:** Dedicated deterministic two-session race test for all review-to-execution interleavings (including cross-authority collisions), isolated Neon branch migration 0028–0033 application and hosted verification, explicit least-privilege EXECUTE grants, actual Railway `current_user`/`session_user` and RLS acceptance. A successful CI suite must not be presented as proof that the hosted migrations have been applied or production is ready. No Neon/Railway writes, merge or deploy in this checkpoint.
