## Verified Meta webhook-body identity admission — 2026-10-15 Baghdad

Accepted source `15a2b0d6e83eb6aec8fc4f284cc8a6ab24c630d3`, Draft PR #547. Isolated run `38653303268`, job `116157339326`, merge checkout `60d64af543b42ddc31c216a74f48665b5b804972`: **275 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parent tests and repeated runtime invocations; overlapping workflow counts are not added. Meta run `38653303727`, job `116157046053` also succeeded; the identity suite has 12 passing tests including its parent.

The original signed app, encrypted queue and restricted live worker reject nine malformed jobs: row/payload merchant and event conflicts, missing explicit event, and conflicting or missing body page/sender/message identifiers. Every denial returns `META_JOB_PAYLOAD_INVALID`, preserves exact snapshots of nine domain tables and keeps provider calls at 1 for the valid signed second-tenant positive control. Pooled isolation/context reset passes. Repair requires body identifiers to equal the already-required explicit payload fields before SQL preparation.

Baseline `22f62bbe06af99546c0870de25560671749e98da`, Meta run `38653087929`, job `116156323167`: 8 PASS / 4 FAIL including parent. Each of three missing body identifiers wrongly completed with one provider call and changes to conversations, messages, inbound events, outbound deliveries, notifications, subscriptions and reply ledger. Tenant/event row and payload were consistent, so no tenant bypass or external exploit is demonstrated. Body conflicts already rejected correctly.

Full restore and owned container/volume cleanup succeeded; 33 migrations, 95 tables, 45 policies, 8 functions, fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. Local TypeScript/syntax/diff checks passed. Report: `P0_META_WEBHOOK_BODY_IDENTITY_20261015.md`; immutable machine evidence: `evidence/P0_META_WEBHOOK_BODY_IDENTITY_RESULTS_20261015.json`.

Documentation checkpoint `9dd839d` had 13 successes and a cancelled isolated run; it is not counted as 14/14 acceptance. Graph/embedding are synthetic. No schema/RLS/grants or hosted rollout changes. #535 remains open for hosted capability review. Next audit candidates: object/recipient/echo/cardinality/envelope semantics and broader precommit termination; these identifier tests do not close those scopes. PR remains draft, without merge/deployment.

## Corrected Meta pipeline acceptance

Repair source `15a2b0d6e83eb6aec8fc4f284cc8a6ab24c630d3`, Meta run `38653303727`, job `116157046053`: all 12 identity tests pass (parent + valid signed positive + nine malformed jobs + pooled isolation). Every malformed job dead-letters with `META_JOB_PAYLOAD_INVALID`, all nine domain snapshots remain unchanged, and provider calls stay at 1. The full Meta workflow succeeds, including existing event/image collision and media/lifecycle tests. The broader isolated aggregate and all-workflow closure are pending.

Prior documentation checkpoint `9dd839d217a7cdfe1676ce7da44ea9bcd3532b95` had 13 successful workflows and its isolated run was cancelled; do not count it as 14/14 acceptance. The unchanged runtime source `f76f4db29811864cd885aa4fb0eafd5577e490e2` has its own completed 14/14 proof.

## Runtime finding and repair prepared

Baseline source `22f62bbe06af99546c0870de25560671749e98da`, Meta run `38653087929`, job `116156323167`: identity suite 8 PASS / 4 FAIL (parent included). Existing row/payload denials and three conflicting body identifiers passed. Each of three missing body identifiers wrongly completed, incremented provider calls (1→2→3→4), and changed conversations, messages, inbound events, outbound deliveries, notifications, subscriptions and reply ledger. No tenant bypass is established: each test kept canonical row/payload tenant and event consistent.

Repair removes the optional-body comparison bypass: body page, sender and message identifiers must equal the already-required explicit fields. Empty values therefore reject with `META_JOB_PAYLOAD_INVALID` before SQL preparation. Original queue ingress already requires sender/message ids and stores the resolved entry page. No schema, RLS, grant or provider change. Corrected runtime acceptance pending CI.

# Prepared Meta webhook-body identity admission — 2026-10-15 Baghdad

Extends the original encrypted-job/restricted-worker suite with conflicting and missing webhook page, sender and message identifiers. Queue row and explicit payload identities remain valid for these six cases. Each must reject before changing any of nine exact domain snapshots or making another provider call. The valid signed second-tenant control remains required, and aggregate proof emits only after all nine negative cases pass.

The current parser checks present body identifiers against explicit payload fields, but missing identifiers bypass those comparisons. This is a source observation awaiting actual SQL/worker evidence, not a proven external exploit. No production changes in this baseline. Prior accepted source f76f4db29811864cd885aa4fb0eafd5577e490e2: 269 PASS / 0 FAIL / 0 SKIP, all 14 workflows successful. Documentation checkpoint 9dd839d CI is still completing.
