## Runtime finding and repair prepared

Baseline source `22f62bbe06af99546c0870de25560671749e98da`, Meta run `38653087929`, job `116156323167`: identity suite 8 PASS / 4 FAIL (parent included). Existing row/payload denials and three conflicting body identifiers passed. Each of three missing body identifiers wrongly completed, incremented provider calls (1→2→3→4), and changed conversations, messages, inbound events, outbound deliveries, notifications, subscriptions and reply ledger. No tenant bypass is established: each test kept canonical row/payload tenant and event consistent.

Repair removes the optional-body comparison bypass: body page, sender and message identifiers must equal the already-required explicit fields. Empty values therefore reject with `META_JOB_PAYLOAD_INVALID` before SQL preparation. Original queue ingress already requires sender/message ids and stores the resolved entry page. No schema, RLS, grant or provider change. Corrected runtime acceptance pending CI.

# Prepared Meta webhook-body identity admission — 2026-10-15 Baghdad

Extends the original encrypted-job/restricted-worker suite with conflicting and missing webhook page, sender and message identifiers. Queue row and explicit payload identities remain valid for these six cases. Each must reject before changing any of nine exact domain snapshots or making another provider call. The valid signed second-tenant control remains required, and aggregate proof emits only after all nine negative cases pass.

The current parser checks present body identifiers against explicit payload fields, but missing identifiers bypass those comparisons. This is a source observation awaiting actual SQL/worker evidence, not a proven external exploit. No production changes in this baseline. Prior accepted source f76f4db29811864cd885aa4fb0eafd5577e490e2: 269 PASS / 0 FAIL / 0 SKIP, all 14 workflows successful. Documentation checkpoint 9dd839d CI is still completing.
