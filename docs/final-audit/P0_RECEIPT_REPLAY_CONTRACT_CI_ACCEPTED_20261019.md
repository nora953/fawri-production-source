# P0 receipt replay source-contract regression — final CI acceptance (2026-10-19)

## Evidence

- Commit under test: `b08a0a0655a6b57be460572debf267bfe414cf4f`.
- GitHub Actions pull-request workflow runs for this exact SHA: **41/41 completed with `success`**, zero pending, failed, cancelled or in progress on the final verification.
- Two initially cancelled workflow runs were selectively rerun, not counted as passing until the reruns returned `success`: `PostgreSQL schema validation` (run `39169685148`) and `Isolated PostgreSQL engineering audit` (run `39169685071`).
- Added regression test: `scripts/tests/p0-receipt-replay-order-identity-contract.test.mjs`; checks byte parity of migration 0032 authoritative/manual and Drizzle SQL, order `FOR SHARE` locks for both authorities, and provider/reference/request/amount rechecks.
- Earlier SQL fix commit `350e67db495cd94df62d1f08f6a6600ae52c3543` separately achieved 41/41 CI success.

## Scope and remaining P0 gates

CI success proves only this automated suite completed; the new test is a source-contract assertion, **not** a deterministic two-connection PostgreSQL concurrency proof. Still open: cross-authority phantom candidate race, transaction-interleaving regression tests, explicit hosted isolated Neon migration 0028–0033 acceptance, runtime least-privilege EXECUTE/RLS verification and actual Railway `current_user`/`session_user` verification. See `P0_REPLAY_CONCURRENCY_REMAINING_GATES_20261019.md`.

**P0 status: NO-GO.** No production/staging database changes, Railway deploy or main-branch merge are authorized by this CI acceptance record.
