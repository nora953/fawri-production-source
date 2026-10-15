## Verified supplied Meta recipient admission and pure module extraction — 2026-10-15 Baghdad

Accepted source `198f9145e6021c15352ca9edae7939e9c2151f1b`, Draft PR #547. Isolated run `38655918835`, job `116165872633`, merge checkout `8450ce4f18fa84a4d4769dd8c9d3c4fbf90b461c`: **283 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Parent tests and repeated runtime invocations are included; overlapping workflow counts are not added. Meta run `38655918971`, job `116165526685` succeeds with 20 identity tests including parent.

Original signed app/encrypted queue/restricted live worker accepts both valid controls: signed second-tenant channel and an original encrypted job with omitted optional recipient. Sixteen malformed cases dead-letter before changing nine exact domain snapshots or increasing provider calls beyond those two valid sends. Supplied recipient must match canonical page, including rejection of conflicting, empty and null values; completely omitted recipient remains compatible. Pooled isolation/context reset passes.

Baseline `8bdb14cfb305b373dee98ca6933d020c08988e77`, Meta run `38655454807`, job `116164017803`: 16 PASS / 4 FAIL including parent. Each malformed supplied recipient completed with an extra provider call and seven changed domain snapshots including subscription/reply ledger. Canonical page/sender still routed the outbound reply; no wrong outbound destination, foreign-tenant writes or external exploit demonstrated.

First repair `c4334399` passed full Meta/20 identity tests but hit the unchanged structure gate at 1802 intent-service lines (critical threshold 1800), quality run `38655684372`/job `116164762558`. Pure admission parser/type and deterministic digest/JSON helpers now live in `metaReplyJobAdmission.ts` (176 lines), imported before SQL orchestration (1634 lines). Exact extracted-text comparison after export/name normalization, TypeScript, syntax, diff and unchanged structure audit pass. Current all-CI proof includes that refactor.

Full schema restore and owned container/volume cleanup pass: 33 migrations, 95 tables, 45 policies, 8 functions; fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. Report `P0_META_RECIPIENT_ADMISSION_20261015.md`; immutable evidence `evidence/P0_META_RECIPIENT_ADMISSION_RESULTS_20261015.json` retains baseline, gate failure and corrected acceptance.

Prior docs `2fd90087` ended 12 successes/2 cancellations, not full acceptance. Providers are synthetic; no schema/RLS/grants or hosted rollout changes. #535 remains open for hosted capability review. Derived-event format and broader precommit process termination remain separate audit candidates. PR stays draft; no merge/deploy.

## Structure gate and admission module extraction

First repair `c433439991bfe816a9a13e6681a6fecc7e115378`, quality run `38655684372`, job `116164762558`: translation/structure audit rejects the intent service at 1802 lines (critical threshold 1800); build/typecheck jobs pass. Extract the pure admission parser, parsed type and shared deterministic digest/JSON helpers into `metaReplyJobAdmission.ts` (176 lines). The intent service is now 1634 lines and imports them before SQL preparation.

Local exact extraction comparison against the committed parser/helper text passes after only export/name normalization. TypeScript and unchanged structure audit pass (`TRANSLATION_STRUCTURE_AUDIT_CLEAN`); thresholds/checks are retained. No SQL, provider, grant or runtime behavior changes from extraction. Full corrected CI acceptance still pending.

## Runtime finding and prepared conditional repair

Baseline source `8bdb14cfb305b373dee98ca6933d020c08988e77`, Meta run `38655454807`, job `116164017803`: identity suite 16 PASS / 4 FAIL including parent. Both valid controls pass: signed second-tenant channel and original encrypted job with omitted recipient. All thirteen earlier denials pass. Each malformed supplied recipient completes and adds one provider call (2→3→4→5), changes seven domain snapshots including subscription/reply ledger. No foreign-tenant writes or wrong outbound destination demonstrated: canonical page/sender still route the reply, while the supplied inbound recipient is ignored.

Repair checks own-property presence of `recipient`; if supplied, its id must equal canonical payload/body page. Empty, null and conflicting supplied values reject `META_JOB_PAYLOAD_INVALID` before SQL preparation. Completely omitted field remains compatible. No schema/RLS/grants or provider changes. Corrected runtime/CI acceptance pending.

Prior documentation `2fd90087` ended 12 workflows successful / 2 cancelled; not counted as full acceptance. Earlier runtime source has its separate completed 279-test/14-workflow evidence.

# Meta present-recipient admission — 2026-10-15 Baghdad

Prepared restricted-role original encrypted-queue/live-worker cases for a present recipient belonging to the other connected page, an empty id, and a null recipient. Canonical row/payload and body page/sender/message identities remain consistent. Each malformed present recipient must reject before nine domain snapshots change or an additional provider call occurs.

Omitted recipient is retained for compatibility with existing supported direct-job fixtures; an explicit original-worker positive control must complete/send/debit once when it is omitted. This is conditional validation of a supplied field, not a new mandatory-recipient contract. The existing signed second-tenant positive control remains required. Source currently does not inspect recipient. Runtime evidence is pending; no production change in this baseline.

Prior accepted `cfc9e279bb7022716b79f9fa55484b52fbbdc841`: 279 PASS / 0 FAIL / 0 SKIP and 14 successful workflows. Latest docs `2fd90087` CI is still running. Derived event format and broader precommit termination remain separate. No tenant bypass or external exploit inferred.
