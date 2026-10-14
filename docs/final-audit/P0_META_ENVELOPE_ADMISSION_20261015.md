## Runtime finding and prepared repair

Baseline `7e10c21252df4c284401ea9f2c13187d7f4ffe83`, Meta run `38654095685`, job `116159663016`: identity suite 11 PASS / 5 FAIL including parent. The prior nine denials pass. Wrong object, echo, extra entry and extra message all wrongly complete, each adding one provider call (1→2→3→4→5), changing seven domain snapshots including subscription/reply ledger. The first event and canonical row/payload tenant match; no cross-tenant execution or external exploit is demonstrated. Later events are ignored, not proven executed.

Repair requires object `page`, exactly one entry, exactly one messaging event and no boolean `is_echo=true`, before SQL preparation. These match the original normalized reply ingress contract. Existing original positive control, media/collision/recovery tests remain required. No schema/RLS/grants/provider changes. Corrected SQL/CI acceptance pending; local checks to follow.

# Meta normalized reply envelope admission — 2026-10-15 Baghdad

Prepared original encrypted-queue/restricted-live-worker cases for wrong webhook object, echo message, multiple entries, and multiple messaging events. Explicit canonical row/payload and first body event identities remain valid. Ingress already excludes echo replies and persists a normalized page envelope with one entry and one event per reply job. These worker tests must reject malformed internal envelopes before any of nine domain snapshots changes or additional provider calls occur.

Current source reads only the first entry/event and does not enforce object, echo or cardinality before preparation. This is a source observation awaiting runtime proof. No production change in the baseline. Prior body-identifier repair `15a2b0d6e83eb6aec8fc4f284cc8a6ab24c630d3`: 275 PASS / 0 FAIL / 0 SKIP, all 14 CI workflows succeeded. Documentation checkpoint `6cff5bb5` is running CI. Recipient semantics and broader precommit termination remain separate; no tenant bypass or external exploit is inferred.
