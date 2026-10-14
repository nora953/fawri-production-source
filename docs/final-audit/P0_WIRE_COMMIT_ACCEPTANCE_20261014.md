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
