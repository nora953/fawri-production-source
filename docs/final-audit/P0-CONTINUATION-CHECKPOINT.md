# FAWRI P0 continuation — 2026-10-20T23:18:48.456538+00:00

## Latest receipt test correction — 2026-10-20T23:27:43.477876+00:00

Source896c1cd360632819977bed36356ee196befb950d completed44/45 SUCCESS and1 failure.70 isolated invocations:69 clean; execution actual-LOGIN/scope15 PASS and wire17 PASS. HTTP replay had17 PASS/3 FAIL (2 owner subtests plus parent) because the shared owner proof assumed inbox SELECT, now intentionally absent on the least-privilege executor. Evidence: `evidence/P0-RECEIPT-SCOPE-CALLER-ATTEMPT-20261020.json`. The helper now asserts direct ACL42501 when SELECT is absent, or zero RLS-visible rows when present, while preserving exact positive definer result/audit, all owner/FORCE cases and before/after rollback/domain snapshots. No new grants, skipped cases or changed SQL authorization. This correction is pending its own CI. Last fully accepted executable remains384c9667534cc54262305d528d5034e4250ff303 (45/45;70 clean). **NO-GO.**

**Release decision NO-GO.** Repository nora953/fawri-production-source; audit branch `fix/p0-provider-receipt-order-discovery-20261015`. PR550 remains open Draft, actual base `test/p0-integrated-billing-meta-20261015`.

## Verified executable source

`384c9667534cc54262305d528d5034e4250ff303`: **45/45 workflows completed SUCCESS;70 isolated invocation summaries all exit0/fail0/skip0/cancel0.** Main run39513272202/job118939238349. Dashboard39513272069/job118939236174 independently passes knowledge1/management8/lifecycle1. CI merge checkout f70b0f4f544d31b7334a74d6aacbed88753023f9 and executable HEAD share identical Git tree8081c28351695a338fcf04ad9963f522e18c2c01; first increment251b8329 and its merge9029846f likewise share exact treef115901ed202fff7bb65cda9560da8a14610da62. No transfer of results to later code.

Evidence: [transaction lifecycle acceptance](evidence/P0-TRANSACTION-LIFECYCLE-ACCEPTANCE-20261020.json), [first knowledge caller acceptance](evidence/P0-KNOWLEDGE-SCOPE-CALLER-20261020.json). First251b83298c6c0f067bf9cb06801aecc2795ebe94 had45/45 workflows and66 isolated invocations;384c9667 adds4 invocations, not4 skipped tests.

Knowledge runtime now mints a canonical private scope on a separate actual auth LOGIN immediately after BEGIN/before protected SQL and merchant FK locks; keeps primary lease through COMMIT/ROLLBACK. Transitional transaction-local GUC remains because public RLS is unchanged. Its owned actual caller test temporarily uses private policies on5 knowledge tables, verifies tuple/foreign GUC and UPDATE denial/issuer revocation/rollback/reuse, restores original policies. Shared fixtures use actual primary/auth LOGINs and production primary admission; root handles setup/inspection/cleanup only. Knowledge management/lifecycle and learning/Meta54 tests PASS.

Subscription, SaaS billing and SuperQi attachment now use the existing withOperationalTransaction lifecycle; unsuccessful BEGIN/COMMIT/ROLLBACK discards clients while preserving original errors. This is not scope issuance in these3 paths. Actual-function VM subscription tests7 and shared lifecycle10 PASS, also registered in isolated priority. Auth10, scope16, audited-admin9, runtime privilege81, receipt read5/review11/execution14, replay HTTP20 and wire17, remaining provider/cashier/Meta/recovery/restore/Node22 invocations all PASS. Local focused knowledge/lifecycle33, subscription7, operator-pool10, guard/security34 PASS; syntax/policy/whitespace PASS. No local PostgreSQL execution claimed.

Migration0036 SQL matches canonical manual stage SHA256711d1d7129e106a8b6855b439e80d33dddf1c1239ca5d8d64a44feb608735a55; snapshot parent matches0035, journal indexes0..40 continuous. Candidate/schema/canonical reproduction and41-migration isolated execution PASS. Existing0037-0040 transaction-bound audited admin/auth/private scope work retained. No SQL migration changed in this continuation. Current dependency CI High0/Critical0/Low0/Moderate2; prior Vite7.3.7/markdown-it14.3.3 patch retained, no new exceptions.

## Pending receipt execution increment in containing commit

New source now invokes issueMerchantTransactionScope on the actual receipt execution operator lease before receipt/entitlement billing callbacks and locks. It retains current provider admission/confirmation outside billing transactions and fresh administrator/session/device/permission checks. It still sets transitional GUC afterward for unchanged public RLS.

New fixtures use separate actual auth/execution LOGINs; legacy HTTP/wire SET ROLE simulation is replaced by password-authenticated LOGIN. Shared execution fixture grants only reviewed billing DML and execution capability, no auth/audit/inbox CRUD or private-table privileges. HTTP direct inbox SELECT is now denied by privilege rather than yielding zero rows. Wire proxy targets actual operator URL; auth/scope issuer COMMITs remain on the separate direct auth connection and cannot shift the two billing acknowledgment-loss boundaries. New operator test checks actual private scope/audit transaction bindings and issuer revocation/recovery. These new database assertions are PENDING CI, not accepted yet. Local syntax/whitespace/policy and guard/security34 PASS.

NEXT: inspect exact containing commit's CI, fix genuine failures, retain all existing fault/concurrency/owner tests, then continue four remaining unbound writers: operationalPostgresAuthority, postgresSubscriptionEntitlement, superQiSandboxWebhook, saasBillingAuthority. Knowledge and receipt execution have transitional issuance; all6 old GUC locations still exist until production predicate cutover. Do not add bootstrap skips or weaken real LOGIN checks.

## Confirmed blockers and safety

Public fawri_tenant_or_audited_admin STILL trusts raw fawri.tenant_id. P0_TENANT_GUC_TRUST_PROOF still reports tenantGucForgery=true. Existing tested restricted roles reject audit forgery/active-window cross-session replay; that does not close the alternate raw tenant GUC path. Canonical restricted-owner/stats/merchant SELECT revocation proof is retained; hosted ownership/grants/default ACLs/pooler still uncertified. Sensitive auth SELECT/privacy, cashier credential/session integrity and earlier critical provider/storage/retention/release gates remain open. Separate smart replies and offline cashier; retain offline essentials.

No production/staging/Neon changes, Railway deploy, main push or PR merge. Disposable PostgreSQL proofs use owned Docker network-none fixtures. Verify Neon audit branch identity before any hosted use. All GitHub ref updates use expected-SHA non-force leases.

Worktree fawri-runtime-scope was created at57da9fc9; local HEAD remains there and files include connector-published newer commits. Do not reset older dirty worktrees. Fetch live HEAD and use a fresh checkout on recovery. GitHub remains durable truth. **NO-GO.**
