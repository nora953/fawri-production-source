## Verified actual PostgreSQL wire response loss — 2026-10-14

DraftPR538 tested source **abe851db0bf40ecf2dcf294dc73f5a32c6c78a44**: isolated38550530635/job115807106721 **189PASS/0FAIL/0SKIP**,42unique files/44invocations; receipt recovery15PASS including four actual TCP dropped-COMMIT-response cases. All **26/26 observed workflow runs SUCCESS**. Admin corrected lane38550531165/job11580754187941PASS includes original admin proof1PASS; overlaps tenant batch, adds no unique credit. Framing4PASS separate from SQL total.

Product correction: lib/db/src/index.ts drains active-client and idle-pool connection error events, preserves failed query/transaction rejection, and reports only bounded SQLSTATE. Wire proxy observes actual server COMMIT CommandComplete, withholds it/ReadyForQuery and closes TCP; authority returns controlled failure, independent parent sees committed state and fresh concurrent next-day processes apply exactly once or both duplicate, preserving original paid_at. All original billing/process/backend/known-COMMIT-rejection and cashier-history assertions retained. Legacy global-admin service/push-force lane replaced with reusable attested network-none runner, guard preserved.

Preserved failures: c4acd6cb isolated38549209533/job115802750100184PASS/5FAIL (four wire cases plus parent);38c41f26 broad25/26PASS, global-admin38549878445/job115804963066 rejected missing attestation before DB import. Corrected source above proves the fixes; prior attempts are not relabeled green. [Report](P0_WIRE_COMMIT_ACCEPTANCE_20261014.md), [machine evidence](evidence/P0_WIRE_COMMIT_RESULTS_20261014.json).

Wire acknowledgment boundary now covered under523; issue staysOPEN for unmatched verified-payment durable inbox/operator reconciliation.535 staysOPEN for full downstream signed restricted-role Meta and hosted grant review. No UI baseline credit, whole-audit percentage or release-ready claim. No merge/deploy/hosted mutation/real provider/payment. This documentation checkpoint leaves tested application/test/workflow source unchanged.

---

## Verified transport correction — 2026-10-14

Tested38c41f26575b3c23935c9cdcf0dba1bec07996e5 isolated38549878533/job115804963824 SUCCESS:189PASS/0FAIL/0SKIP,42unique files/44invocations. Receipt suite15PASS; four actual TCP COMMIT-drop markers confirm server commit, zero CommandComplete delivered, caller failure, fresh-process one entitlement and original time. Framing4PASS. Broad CI25/26SUCCESS, only legacy admin lane failed guard before DB import; correction below awaits CI. Actual transport boundary covered, unmatched inbox523 and full downstream restricted-role Meta535 remainOPEN. Previousc4acd6cb184PASS/5FAIL is preserved, not relabeled green. No deployment/hosted mutation/merge/real provider.

---

# P0 PostgreSQL wire COMMIT acknowledgment loss — 2026-10-14

Continuation of draftPR538, parentf696827b documentation head (all13 observed workflows SUCCESS). Previous tested d418feaf had185PASS/0FAIL/0SKIP. This revision changes test helpers, response-framing unit tests and CI registration only, no production application/schema.

## Actual TCP acceptance — NOT_RUN pending CI
Four new cases: SaaS/cashier × admission/application COMMIT. After existing guard attests the actual owned network-none database at127.0.0.1:5432, only the child pool connects through an ephemeral loopback proxy. Proxy destination is fixed to that owned5432, no external network/host/credentials logged. Database guard/environment are not rewritten or weakened. Parent and fresh recovery processes retain direct attested database access.

Proxy parses complete backend protocol frames across fragmented/coalesced TCP reads. Only exact CommandComplete COMMIT counts. At boundary1or2 it withholds that frame and following ReadyForQuery, records the real server response via safe IPC, then destroys TCP before authority success. No client.query replacement or synthetic application exception in wire mode. Parent independently verifies committed receipt/application state, child failure and no success, then two fresh concurrent next-day processes require one applied+duplicate or both duplicate respectively. Final1event/1application/1subscription and original paid_at required.

Socket timeouts/close cleanup, exact child markers and existing owned DB fixture cleanup remain mandatory. The generic frame helper imports no database. Four framing unit cases test fragmentation, coalesced second boundary, misleading row/command text and invalid lengths; registered in reusable isolated workflow. Driver-outcome cases remain separate and intact, as do process/backend interruption, deferred-COMMIT rollback and original billing regressions.

## Local validation
Framing4PASS/0FAIL; API typecheckPASS; parent/child/proxy syntaxPASS; diff whitespacePASS. Actual PostgreSQL wire tests NOT_RUN until CI; no localDocker/PostgreSQL. Never infer runtime proof from parser/unit success.

## Remaining
If wire acceptance passes, record that transport boundary as covered without closing523: unmatched confirmed terminal payment still returns503 before any durable inbox record in superQiSandboxWebhook.ts, so orphan retention/operator reconciliation remains open. Full downstream signed restricted-role Meta/grant acceptance535 remains open. No hosted mutation, real provider/payment, merge or deployment.

## First transport run and product correction
Sourcec4acd6cb isolated38549209533/job115802750100 executed real wire drops but all four wire cases failed the controlled failure-message assertion (receipt suite10PASS/5FAIL including parent). The safe server-COMMIT/drop marker and child nonzero exit were observed; no child application failure message arrived. pg leased clients can emit an additional connection error after query rejection; without a client error listener that event terminates the process. lib/db/src/index.ts now installs active-client and idle-pool error handlers. Handlers emit only a bounded SQLSTATE, never driver messages, credentials, URLs or query values. Query/transaction failures still reject; pg discards failed connections. Original wire failure-message assertion retained. This revision now changes production DB connection-event handling, not billing grants/schema. Corrected actual runtime pending CI; prior failed run preserved.

## Legacy admin workflow guard failure
Source38c41f26 broader lib/db CI triggered global-admin38549878445/job115804963066. Old workflow used a published service PostgreSQL and push-force schema setup, then ran guarded admin-auth-router entrypoint without attestation; guard rejected before application DB import. This is lane configuration failure, not admin authorization regression. Replace service/push-force with unchanged API typecheck plus reusable attested network-none suite tenant (contains original admin test). Guard and original assertions remain intact; duplicate lane proof adds no baseline credit. Current wire result must finish before publishing lane correction.
