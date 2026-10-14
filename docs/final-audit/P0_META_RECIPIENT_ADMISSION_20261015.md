## Runtime finding and prepared conditional repair

Baseline source `8bdb14cfb305b373dee98ca6933d020c08988e77`, Meta run `38655454807`, job `116164017803`: identity suite 16 PASS / 4 FAIL including parent. Both valid controls pass: signed second-tenant channel and original encrypted job with omitted recipient. All thirteen earlier denials pass. Each malformed supplied recipient completes and adds one provider call (2→3→4→5), changes seven domain snapshots including subscription/reply ledger. No foreign-tenant writes or wrong outbound destination demonstrated: canonical page/sender still route the reply, while the supplied inbound recipient is ignored.

Repair checks own-property presence of `recipient`; if supplied, its id must equal canonical payload/body page. Empty, null and conflicting supplied values reject `META_JOB_PAYLOAD_INVALID` before SQL preparation. Completely omitted field remains compatible. No schema/RLS/grants or provider changes. Corrected runtime/CI acceptance pending.

Prior documentation `2fd90087` ended 12 workflows successful / 2 cancelled; not counted as full acceptance. Earlier runtime source has its separate completed 279-test/14-workflow evidence.

# Meta present-recipient admission — 2026-10-15 Baghdad

Prepared restricted-role original encrypted-queue/live-worker cases for a present recipient belonging to the other connected page, an empty id, and a null recipient. Canonical row/payload and body page/sender/message identities remain consistent. Each malformed present recipient must reject before nine domain snapshots change or an additional provider call occurs.

Omitted recipient is retained for compatibility with existing supported direct-job fixtures; an explicit original-worker positive control must complete/send/debit once when it is omitted. This is conditional validation of a supplied field, not a new mandatory-recipient contract. The existing signed second-tenant positive control remains required. Source currently does not inspect recipient. Runtime evidence is pending; no production change in this baseline.

Prior accepted `cfc9e279bb7022716b79f9fa55484b52fbbdc841`: 279 PASS / 0 FAIL / 0 SKIP and 14 successful workflows. Latest docs `2fd90087` CI is still running. Derived event format and broader precommit termination remain separate. No tenant bypass or external exploit inferred.
