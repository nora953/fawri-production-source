# FAWRI — launch-blocker execution checkpoint

**Last evidence checkpoint:** 2026-11-09, GitHub draft [PR #550](https://github.com/nora953/fawri-production-source/pull/550), branch `fix/p0-provider-receipt-order-discovery-20261015`. **Release: NO-GO.** Do not merge/deploy or touch original Neon/Railway without separately authorized target and recovery proof.

## P0 / R-OWN-5 receipt missing-order policy

Product owner **explicitly approved** `HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH`. Preserve verified unmatched payment evidence; never attach it to guessed merchant/order, trigger entitlement, or refund without verified provider and separate authorization. [Decision](docs/final-audit/P0-RECEIPT-MISSING-ORDER-OWNERSHIP-DECISION-20261109.md).

**Already accepted:** R-OWN-1..4 bounded receipt/replay evidence (do not repeat). Source-only HELD R-OWN-5 case intake, immutable event journal, 50-item audited read/history, independent authenticated second actor `PROVIDER_DISPUTE_REVIEWED` (not settled), restricted SQL grants and mounted HTTP accepted in isolated PostgreSQL18 [#42683116288](https://github.com/nora953/fawri-production-source/actions/runs/42683116288).

**Newly accepted 2026-11-09:** 0053 held source/journal/grant SHA256 integrity [#42687571793](https://github.com/nora953/fawri-production-source/actions/runs/42687571793); **real combined first-commercial HELD 0052 + HELD 0053** 54-migration Drizzle ledger, non-superuser PG18 owner and operator-role restricted grants [#42688213492](https://github.com/nora953/fawri-production-source/actions/runs/42688213492). [Exact composite evidence](docs/final-audit/evidence/P0-R-OWN5-HELD-0053-COMPOSITE-54-STAGE-PG18-20261109.md). This is isolated schema/role compatibility; the 54-stage combined database has **not** yet separately demonstrated mounted HTTP, and neither test establishes hosted production readiness.

**Remaining unaccepted conditions to close R-OWN-5:**
1. Separately authorized fresh first-commercial target, independent backup/recovery/identity/role proof, adopted HELD 0052→0053 migration and journal SHA, and real hosted SQL+HTTP.
2. Official payment-provider ledger confirmation, independent authenticated final settlement/refund/dispute decision and proof of provider-side disposition. Human acknowledgment of evidence hash is insufficient.
3. Named case operator, escalation SOP, retention/deletion requirements and approved bounded resolution outcome.

**Status stays OPEN.** Historical source register **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED** among **45 known source rows = 64.4%** (not whole P0 or project completion; inventory not certified). Do not increase percentage until real register-row closure. [Launch-blocker queue](docs/final-audit/P0-LAUNCH-BLOCKERS-ONLY-20261109.md).

**GitHub-only policy:** do not repeat accepted CI, do not add guessed entitlements, do not use original commercial credentials, do not publish/merge; evidence for closures must include exact SHA, SQL/HTTP, permissions, provider settlement as applicable.

## 2026-11-09 — source blocker fix while payment/provider integrations remain external

**Execution agreement:** Prioritize source code and end-to-end business logic that can be independently proven now; do not stop progress at unconfigured payment provider, Meta, KMS, hosted identity or real device. **Notify the owner when bypassing each external dependency.** Bypassing is ONLY a sequencing decision, NEVER an automatic P0 closure, a release waiver, signed policy decision, or permission to mock production evidence. Do not declare Fawri launchable merely because CI is green.

**Concrete cashier bug resolved:** `CASHIER-SYNC-SEQUENCE-001` active operator outbox previously misclassified a full 1000-envelope batch (including a fully complete single operation) as incomplete/oversized because no 1001st lookahead was read. Source fix [db2fb3cf](https://github.com/nora953/fawri-production-source/commit/db2fb3cf3b61aa089475392fd35aa9bbb0481031) reads 1001 and never uploads the extra envelope, preserves split boundary operations, rejects duplicate/reversed device sequence and noncontiguous reused operation identity before network upload. No protocol v2, reset, inventory/financial mutation, or ACK bypass.

**Accepted exact tests:** [targeted 30/30 #42692056947](https://github.com/nora953/fawri-production-source/actions/runs/42692056947), [real Chromium/IndexedDB #42692060418](https://github.com/nora953/fawri-production-source/actions/runs/42692060418), [final quality #42692057200](https://github.com/nora953/fawri-production-source/actions/runs/42692057200) all **COMPLETED SUCCESS**, on code [cc3ac281](https://github.com/nora953/fawri-production-source/commit/cc3ac281e2c103aaf8440bfbcfdeaf94a741fcf8). [Scoped evidence](docs/final-audit/evidence/P0-CASHIER-OPERATOR-OUTBOX-LOOKAHEAD-20261109.md). Earlier [#42691882672](https://github.com/nora953/fawri-production-source/actions/runs/42691882672) red only because a regex in the old source contract test was double-escaped; the error was corrected test-only, not hidden or counted accepted.

**Next source work not blocked by payment:** decide/implement separately authorized safe v2 operation compatibility and independent device-stream provenance; continue tenant privacy and cashier no-side-effect negative acceptance, then launch-specific functional paths. Existing product choice for legacy movement-only adjustments remains `UNAPPROVED`; don't infer approval from "اكمل". Provider payment/reconciliation stays **EXTERNAL BLOCKED** until real provider evidence; don't close `R-OWN-5` or assert launch GO. Existing known source-gate ratio 29/45 = 64.4% unchanged, overall P0 readiness unverified.
