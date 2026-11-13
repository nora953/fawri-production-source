# R-OWN-5 — independent second operator review of disputed receipt evidence

**Date:** 2026-11-09. **Exact tested PR SHA:** [de48748b24ef6f9132b76f0d2c2caae8dac628c0](https://github.com/nora953/fawri-production-source/commit/de48748b24ef6f9132b76f0d2c2caae8dac628c0).

## Result — narrowly accepted source / disposable PostgreSQL18

- [Held PostgreSQL18 restricted SQL + real mounted operator HTTP run #42683116288](https://github.com/nora953/fawri-production-source/actions/runs/42683116288) **COMPLETED SUCCESS**. Actual runner log contains `P0_RECEIPT_DISPUTE_INDEPENDENT_SECOND_ACTOR_HTTP_PG18_PASS` and the prior receipt case mounted-HTTP, audited-queue/history and restricted-login PASS markers.
- [Final quality gates #42683116096](https://github.com/nora953/fawri-production-source/actions/runs/42683116096) **COMPLETED SUCCESS**: full API build, full typecheck, repository security tests and translation-structure audit.
- [Focused receipt policy #42683116154](https://github.com/nora953/fawri-production-source/actions/runs/42683116154) **COMPLETED SUCCESS**.

Changes recorded on draft PR #550:
1. Held [0053 SQL](../../../../lib/db/first-commercial/held/0053_verified_receipt_manual_cases_candidate.sql): new append-only `ACKNOWLEDGE_DISPUTE_SECOND_REVIEW` event. A distinct active admin account with actual session and trusted device is required; it must differ from both case opener and dispute actor. SQL locks the parent case, requires current state `PROVIDER_DISPUTE`, and compares the exact SHA-256 digest already recorded by the prior actor. Result is **`PROVIDER_DISPUTE_REVIEWED` (nonterminal)**. No subscription entitlement, owner assignment, refund or provider-confirmation flag is written.
2. [Operator capability registry](../../../../artifacts/api-server/src/services/operatorDirectoryPostgresAuthority.ts): a *separate* SQL `EXECUTE` probe `receiptDisputeSecondReview`, default revoked in held schema. Test-only GRANT on the disposable restricted LOGIN, no direct case/event table access.
3. [Server service](../../../../artifacts/api-server/src/services/verifiedReceiptManualCasePostgres.ts) and [mounted HTTP](../../../../artifacts/api-server/src/routes/auth-verified-receipts-postgres-routes.ts): permissioned `POST /admin/billing/verified-receipt-manual-cases/:caseId/second-review`, accepts **only** `provider_evidence_hash`; rejects guessed financial instructions, does not return provider settlement.
4. [Case reader](../../../../artifacts/api-server/src/services/verifiedReceiptManualCaseReadPostgres.ts) exposes the independently reviewed state/action through already auditable GET; no raw payment data.
5. [Exact test](../../../../scripts/tests/p0-held-receipt-manual-case-pg18.mjs) uses two different actual admin accounts, two live sessions and two independently trusted devices through the authentication and operator SQL authorities. It rejects unauthenticated review, actor self-review, different provider-evidence digest, extra refund field and a duplicate second approval; then confirms append-only attribution to the second account/session/device and no financial side effects.

**A failed intermediate run is not counted:** [#42682920286](https://github.com/nora953/fawri-production-source/actions/runs/42682920286) reached the new review PASS marker but failed a *stale test list* that did not yet include the new nonterminal state; [de48748b](https://github.com/nora953/fawri-production-source/commit/de48748b24ef6f9132b76f0d2c2caae8dac628c0) fixed only the exact assertion, and the full targeted suite succeeded.

## Hard boundaries still OPEN

- This records **independent human evidence review**, **NOT payment-provider confirmation, executed settlement, refund, final provider dispute result or lawful deletion**. A reviewer entering the same digest cannot stand in for a signed provider statement or provider-ledger verification. No terminal `PROVIDER_OUTCOME_VERIFIED` action is enabled.
- Held 0053 is **outside** the canonical 53-stage journal; no hosted Neon identity, approved source-manifest/backup/rollback, restricted commercial grants, or first-commercial SQL+HTTP acceptance. Separate FT-01 0052 hosted prerequisite remains BLOCKED.
- Retention responsibilities, manual case SLA/escalation ownership and provider-authorized disposition SOP are not accepted.
- Parent `P0-RECEIPT-OWNERSHIP-POLICY` / `R-OWN-5` remains **OPEN** and release **NO-GO**. PR #550 remains draft. Historical register stays 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, 64.4% known source-row fraction (global P0 percentage uncertified). No hosted SQL, merge, deploy or financial transfer occurred.
