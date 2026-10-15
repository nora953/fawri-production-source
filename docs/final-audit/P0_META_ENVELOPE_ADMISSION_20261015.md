## Verified normalized Meta reply envelope admission — 2026-10-15 Baghdad

Accepted source `cfc9e279bb7022716b79f9fa55484b52fbbdc841`, Draft PR #547. Isolated run `38654600094`, job `116161483164`, merge checkout `57d157e7c7846229d92d25dc581a5e95bac8ddeb`: **279 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parents and repeated runtime invocations; overlapping workflows are not added. Meta run `38654600099`, job `116161259617` also succeeds; identity suite has 16 passing tests including parent.

Original signed app/encrypted queue/live worker under a restricted nonowner role rejects thirteen malformed identity/envelope cases before changes to nine exact domain snapshots or provider calls beyond the valid signed second-tenant control's one call. New guards require object `page`, one entry, one messaging event and no boolean `is_echo=true`, matching normalized original reply ingress. Existing media/collision/restart/restore tests pass. Pooled isolation/context reset passes.

Baseline `7e10c21252df4c284401ea9f2c13187d7f4ffe83`, Meta run `38654095685`, job `116159663016`: 11 PASS / 5 FAIL including parent. Wrong object, echo, extra entry and extra message all completed, each called the provider and changed seven domain snapshots including subscription/reply ledger. No tenant bypass or external exploit is established; later events were ignored, not demonstrated executed. First repair `47f57938` passed all sixteen identity tests but failed the old captioned-image direct fixture missing object `page`; accepted source adds that field only and preserves media suppression/storage assertions.

Full schema restore and owned container/volume cleanup succeeded: 33 migrations, 95 tables, 45 policies, 8 functions; fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. TypeScript/syntax/diff checks pass. Report `P0_META_ENVELOPE_ADMISSION_20261015.md`; immutable evidence `evidence/P0_META_ENVELOPE_ADMISSION_RESULTS_20261015.json` preserves baseline and corrected proof.

Prior documentation checkpoint `6cff5bb5` has 10 successful and 4 cancelled workflows, not full acceptance. These cancellations do not invalidate the separately completed 275-test source proof. Providers are synthetic local services. No schema/RLS/grants or hosted rollout change; #535 remains open. Recipient/derived-event identity and broader precommit process termination remain separate audit candidates. PR stays draft; no merge or deployment.

## First repair runtime result and fixture correction

Source `47f579383d6189d40c97e25dfe806bc80445e305`, Meta run `38654357087`, job `116160480801`: all 16 identity tests pass, including positive control, thirteen denials and pooled isolation. Existing restart, restore, full-app and knowledge suites pass. The larger live-reply suite fails its captioned-image case because that direct-enqueue fixture omitted `object: "page"`; actual ingress always supplies it. Add the normalized object only to that fixture, retain all media suppression/storage assertions and all four malformed-envelope denials. No production guard relaxation. Final CI acceptance pending.

## Runtime finding and prepared repair

Baseline `7e10c21252df4c284401ea9f2c13187d7f4ffe83`, Meta run `38654095685`, job `116159663016`: identity suite 11 PASS / 5 FAIL including parent. The prior nine denials pass. Wrong object, echo, extra entry and extra message all wrongly complete, each adding one provider call (1→2→3→4→5), changing seven domain snapshots including subscription/reply ledger. The first event and canonical row/payload tenant match; no cross-tenant execution or external exploit is demonstrated. Later events are ignored, not proven executed.

Repair requires object `page`, exactly one entry, exactly one messaging event and no boolean `is_echo=true`, before SQL preparation. These match the original normalized reply ingress contract. Existing original positive control, media/collision/recovery tests remain required. No schema/RLS/grants/provider changes. Corrected SQL/CI acceptance pending; local checks to follow.

# Meta normalized reply envelope admission — 2026-10-15 Baghdad

Prepared original encrypted-queue/restricted-live-worker cases for wrong webhook object, echo message, multiple entries, and multiple messaging events. Explicit canonical row/payload and first body event identities remain valid. Ingress already excludes echo replies and persists a normalized page envelope with one entry and one event per reply job. These worker tests must reject malformed internal envelopes before any of nine domain snapshots changes or additional provider calls occur.

Current source reads only the first entry/event and does not enforce object, echo or cardinality before preparation. This is a source observation awaiting runtime proof. No production change in the baseline. Prior body-identifier repair `15a2b0d6e83eb6aec8fc4f284cc8a6ab24c630d3`: 275 PASS / 0 FAIL / 0 SKIP, all 14 CI workflows succeeded. Documentation checkpoint `6cff5bb5` is running CI. Recipient semantics and broader precommit termination remain separate; no tenant bypass or external exploit is inferred.
